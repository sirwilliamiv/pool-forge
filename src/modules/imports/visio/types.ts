// The Visio stencil import, as types and constants.
//
// Everything the converter, the commands, the upload route and the panel share
// is declared here and nowhere else, so the four can be built apart and still
// agree. Spec: docs/superpowers/specs/2026-10-08-visio-pool-draw-parity.md, P3.
//
// Units, once: `vss2raw` emits drawing inches at the designer's sheet scale.
// Rings stay in drawing inches until the commit applies the scale the builder
// confirmed, and from then on they are real inches with the bounding box's
// top-left at the origin, which is what `PolygonPool.points` and
// `SketchPath.points` already are.

import { ShapeKind, StencilCategory } from '@prisma/client'
import { z } from 'zod'

// ------------------------------------------------------------------ limits

/** Real inches per drawing inch at 1/8" = 1'. `Standard Rectangle` is 3.125" x 1.5" in the file and 25' x 12' in the yard. */
export const VISIO_SCALE_DEFAULT = 96

/** The scales a builder can pick in the preview, labelled the way an architect says them. */
export const VISIO_SCALE_OPTIONS: readonly { inchesPerInch: number; label: string }[] = [
  { inchesPerInch: 192, label: '1/16" = 1\'' },
  { inchesPerInch: 96, label: '1/8" = 1\'' },
  { inchesPerInch: 48, label: '1/4" = 1\'' },
  { inchesPerInch: 24, label: '1/2" = 1\'' },
  { inchesPerInch: 12, label: '1" = 1\'' },
]

export const MIN_SCALE_INCHES_PER_INCH = 1
export const MAX_SCALE_INCHES_PER_INCH = 1200

/** Hard cap on an uploaded stencil file. The three real files are 0.2, 1.1 and 2.3 MB. */
export const MAX_VISIO_BYTES = 25 * 1024 * 1024

/** A file with more masters than this is not a stencil file anybody drew by hand. */
export const MAX_MASTERS_PER_FILE = 500

/** Chord error allowed when an arc or curve is flattened, in drawing inches. Half a real inch at 1/8" scale. */
export const FLATTEN_TOLERANCE_IN = 0.005

/** How long a preview waits for its commit. */
export const STENCIL_IMPORT_TTL_MS = 60 * 60 * 1000

/** Longest a conversion may run before it is killed and reported as a failure. */
export const CONVERTER_TIMEOUT_MS = 30_000

/** Cap on the converter's text output; the biggest real file produces about 2 MB. */
export const CONVERTER_MAX_OUTPUT_BYTES = 64 * 1024 * 1024

// ------------------------------------------------------------------ wire

/** Multipart field the route reads. A constant shared with the client so the two cannot drift. */
export const VISIO_UPLOAD_FIELD = 'file'
export const VISIO_UPLOAD_URL = '/api/imports/visio'
/** What the file input offers. The route decides by magic bytes, never by this. */
export const VISIO_FILE_ACCEPT = '.vss,.vssx'

/** Env var naming the converter binary; empty means `vss2raw` on PATH. */
export const VISIO_CONVERTER_BIN_ENV = 'VISIO_CONVERTER_BIN'
export const VISIO_CONVERTER_DEFAULT_BIN = 'vss2raw'

/** The two container formats a Visio stencil comes in, as the sniffer names them. */
export const VisioContainer = {
  /** Visio 2003 to 2010: an OLE2 compound document. */
  OLE2: 'OLE2',
  /** Visio 2013 and later: a zip of XML parts. */
  ZIP: 'ZIP',
} as const
export type VisioContainer = (typeof VisioContainer)[keyof typeof VisioContainer]

// ------------------------------------------------------------------ skips

export const SkipReason = {
  TEXT_ONLY: 'TEXT_ONLY',
  RASTER: 'RASTER',
  NO_OUTLINE: 'NO_OUTLINE',
} as const
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  TEXT_ONLY: 'Text only, nothing to draw',
  RASTER: 'A picture, not an outline',
  NO_OUTLINE: 'No closed outline (a line, an arrow or a hairline)',
}

// ------------------------------------------------------------------ raw parser output

export interface RawPoint {
  x: number
  y: number
}

export type RawSegment =
  | { action: 'M'; x: number; y: number }
  | { action: 'L'; x: number; y: number }
  | { action: 'Q'; x1: number; y1: number; x: number; y: number }
  | { action: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | {
      action: 'A'
      rx: number
      ry: number
      /** Degrees, as librevenge writes it. */
      rotate: number
      largeArc: boolean
      /** Absent in the file means true: librevenge renders a missing sweep flag as 1 (checked against vss2xhtml on Round Corners). */
      sweep: boolean
      x: number
      y: number
    }
  | { action: 'Z' }

export interface RawStyle {
  /** `draw:fill` was anything but `none`. */
  fill: boolean
  /** `draw:stroke` was anything but `none`. */
  stroke: boolean
  /** `#rrggbb` or null. */
  fillColor: string | null
  strokeColor: string | null
}

export interface RawPath {
  style: RawStyle
  segments: RawSegment[]
}

export interface RawMaster {
  /** Position in the file, zero-based. Stable across preview and commit. */
  index: number
  /** `draw:name` verbatim, or `Untitled master N` when the page had none. */
  name: string
  named: boolean
  /** The page size librevenge reports, in drawing inches. */
  widthIn: number
  heightIn: number
  paths: RawPath[]
  textObjects: number
  graphicObjects: number
}

export interface RawDocument {
  masters: RawMaster[]
}

// ------------------------------------------------------------------ geometry

export interface Subpath {
  points: RawPoint[]
  closed: boolean
}

export interface FlatPath {
  style: RawStyle
  subpaths: Subpath[]
}

/** A closed ring, first vertex not repeated at the end. */
export type Ring = RawPoint[]

export interface Outline {
  /** The footprint: largest polygon of the union, in drawing inches, absolute. */
  footprint: Ring
  /** The rest of the union and any holes, for the thumbnail only. */
  detail: Ring[]
  fill: string
  stroke: string
}

/** Default colours when a master's own style has none. The catalogue's pool water and stroke. */
export const DEFAULT_FILL = '#5BA8D6'
export const DEFAULT_STROKE = '#2C5F84'

// ------------------------------------------------------------------ candidates

/** The kinds a library stencil may become. RECTANGLE_POOL and STENCIL are out: the first has no ring and the second needs a catalogue id. */
export const PLACEABLE_SHAPE_KINDS = [
  ShapeKind.POLYGON_POOL,
  ShapeKind.SKETCH_PATH,
  ShapeKind.SPA,
  ShapeKind.SUN_SHELF,
  ShapeKind.BENCH,
  ShapeKind.CONCRETE_DECK,
  ShapeKind.PAVER_DECK,
  ShapeKind.GRASS_AREA,
] as const
export type PlaceableShapeKind = (typeof PLACEABLE_SHAPE_KINDS)[number]

export const PlaceableShapeKindSchema = z.enum(
  PLACEABLE_SHAPE_KINDS as unknown as [PlaceableShapeKind, ...PlaceableShapeKind[]],
)
export const StencilCategorySchema = z.nativeEnum(StencilCategory)

export const PointSchema = z.object({ x: z.number(), y: z.number() })
export const RingSchema = z.array(PointSchema).min(3)

/** What the preview shows for one master. Sizes are drawing inches; the panel multiplies by the scale on screen. */
export const CandidateSchema = z.object({
  index: z.number().int().min(0),
  name: z.string().min(1).max(120),
  category: StencilCategorySchema,
  shapeKind: PlaceableShapeKindSchema,
  drawingWidthIn: z.number().positive(),
  drawingHeightIn: z.number().positive(),
  ringCount: z.number().int().min(1),
  thumbnailSvg: z.string().min(1),
  fill: z.string(),
  stroke: z.string(),
})
export type Candidate = z.infer<typeof CandidateSchema>

/** The row's version of a candidate: the same, plus the rings in drawing inches. Never sent to the browser. */
export const StoredCandidateSchema = CandidateSchema.extend({
  rings: z.array(RingSchema).min(1),
})
export type StoredCandidate = z.infer<typeof StoredCandidateSchema>

export const SkippedSchema = z.object({
  index: z.number().int().min(0),
  name: z.string(),
  reason: z.nativeEnum(SkipReason),
})
export type Skipped = z.infer<typeof SkippedSchema>

/** Everything the converter produces for one file. Pure data. */
export interface ConversionResult {
  candidates: StoredCandidate[]
  skipped: Skipped[]
}

/** Bytes in, `vss2raw` text out. The one seam a test replaces so no test needs the binary. */
export type VisioConverter = (bytes: Buffer) => Promise<string>

// ------------------------------------------------------------------ commands

export const LibraryCommand = {
  PREVIEW: 'stencil.library.preview',
  COMMIT: 'stencil.library.commit',
  LIST: 'stencil.library.list',
  PLACE: 'stencil.library.place',
  DELETE: 'stencil.library.delete',
  /** Hide or show the built-in Pool Forge catalogue in the Stencils panel. */
  CATALOG_TOGGLE: 'stencil.catalog.toggle',
} as const
export type LibraryCommand = (typeof LibraryCommand)[keyof typeof LibraryCommand]

/**
 * Below this size on both sides, at the default scale, a master classified as
 * a deck or a spa is a detail (a score line, a brick, a coping corner) and
 * imports as an outline instead. A 2.8' "deck" prices as a deck and is never
 * one; a real deck or spa is larger than this on at least one side.
 */
export const DETAIL_MAX_REAL_IN = 48

/** Omit `hidden` to flip; pass it to set. */
export const CatalogToggleInputSchema = z.object({ hidden: z.boolean().optional() })
export type CatalogToggleInput = z.infer<typeof CatalogToggleInputSchema>
export const CatalogToggleOutputSchema = z.object({ hidden: z.boolean() })
export type CatalogToggleOutput = z.infer<typeof CatalogToggleOutputSchema>

/** localStorage key for the catalogue preference; it is per browser, not per org. */
export const CATALOG_HIDDEN_STORAGE_KEY = 'poolforge.stencils.catalogHidden'

export const ScaleSchema = z
  .number()
  .min(MIN_SCALE_INCHES_PER_INCH)
  .max(MAX_SCALE_INCHES_PER_INCH)

export const PreviewInputSchema = z.object({
  uploadRef: z.string().min(1),
  fileName: z.string().min(1).max(255),
  scaleInchesPerInch: ScaleSchema.optional(),
})
export type PreviewInput = z.infer<typeof PreviewInputSchema>

export const PreviewOutputSchema = z.object({
  importId: z.string(),
  fileName: z.string(),
  scaleInchesPerInch: z.number(),
  candidates: z.array(CandidateSchema),
  skipped: z.array(SkippedSchema),
})
export type PreviewOutput = z.infer<typeof PreviewOutputSchema>

export const CommitItemSchema = z.object({
  index: z.number().int().min(0),
  include: z.boolean(),
  name: z.string().min(1).max(120),
  category: StencilCategorySchema,
  shapeKind: PlaceableShapeKindSchema,
})
export type CommitItem = z.infer<typeof CommitItemSchema>

export const CommitInputSchema = z.object({
  importId: z.string().min(1),
  scaleInchesPerInch: ScaleSchema,
  items: z.array(CommitItemSchema).min(1).max(MAX_MASTERS_PER_FILE),
})
export type CommitInput = z.infer<typeof CommitInputSchema>

export const OrgStencilSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: StencilCategorySchema,
  shapeKind: PlaceableShapeKindSchema,
  /** Real inches. */
  widthIn: z.number(),
  heightIn: z.number(),
  thumbnailSvg: z.string(),
  fill: z.string(),
  stroke: z.string(),
  sourceFile: z.string().nullable(),
  updatedAt: z.string(),
})
export type OrgStencilSummary = z.infer<typeof OrgStencilSummarySchema>

export const CommitOutputSchema = z.object({
  created: z.number().int(),
  replaced: z.number().int(),
  stencils: z.array(OrgStencilSummarySchema),
})
export type CommitOutput = z.infer<typeof CommitOutputSchema>

export const ListOutputSchema = z.object({
  stencils: z.array(OrgStencilSummarySchema),
})
export type ListOutput = z.infer<typeof ListOutputSchema>

export const PlaceInputSchema = z.object({
  orgStencilId: z.string().min(1),
  /** Top-left of the bounding box, in inches. */
  x: z.number(),
  y: z.number(),
})
export type PlaceInput = z.infer<typeof PlaceInputSchema>

/** What the server hands the client handler: enough to call `addShape` once. Points are real inches relative to the top-left. */
export const PlacementSchema = z.object({
  shapeKind: PlaceableShapeKindSchema,
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  points: RingSchema,
})
export type Placement = z.infer<typeof PlacementSchema>

export const PlaceOutputSchema = PlacementSchema.extend({
  shapeId: z.string(),
})
export type PlaceOutput = z.infer<typeof PlaceOutputSchema>

export const DeleteInputSchema = z.object({
  orgStencilId: z.string().min(1),
})
export type DeleteInput = z.infer<typeof DeleteInputSchema>

export const DeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
export type DeleteOutput = z.infer<typeof DeleteOutputSchema>

// ------------------------------------------------------------------ user-facing copy

/** Messages the route and the panel show. Here so a test can assert the exact words and the two never disagree. */
export const VisioMessage = {
  NOT_A_STENCIL: 'That is not a Visio stencil file. Drop a .vss or .vssx file.',
  TOO_LARGE: 'That stencil file is too large.',
  EMPTY: 'That file is empty.',
  CONVERTER_MISSING: 'Stencil import is not available on this server.',
  CONVERT_FAILED: 'That stencil file could not be read',
  EXPIRED: 'That preview expired. Drop the file again.',
  ALREADY_COMMITTED: 'That import has already been added to your library.',
  NO_MASTERS: 'No stencils in that file could be imported.',
  NOTHING_SELECTED: 'Tick at least one stencil to import.',
  NOT_FOUND: 'That stencil is not in your library.',
  NO_GROUND: 'Switch to the plan or 3D view to drop a stencil.',
} as const

/** Copy for the catalogue section of the Stencils panel. */
export const CatalogCopy = {
  HEADING: 'Pool Forge stencils',
  HIDE: 'Hide',
  SHOW: 'Show',
  HIDE_LABEL: 'Hide Pool Forge stencils',
  SHOW_LABEL: 'Show Pool Forge stencils',
  HIDDEN_NOTE: 'Hidden. Only your library is listed.',
} as const
