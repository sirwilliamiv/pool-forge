// A note pinned to a point on the drawing.
//
// Not a chat system and not an annotation. An annotation is drawn on the plan
// and the customer sees it; a comment is a builder talking to themselves or to
// a colleague — "check the gas line clearance", "customer wants the steps
// moved" — and it must never reach a customer-facing document. That is why
// comments are their own thing in `Drawing.rootJson` rather than another
// stencil: a stencil is a shape, and every shape is a candidate for the
// proposal, the site plan and the construction packet.
//
// Pure module: no zustand, no Prisma, no React. Both the command layer (which
// runs on the server) and the client handlers import it, so it has to be safe
// on either side of the wire.

import { z } from 'zod'

/** Long enough for a real instruction, short enough to read on a pin. */
export const COMMENT_BODY_MAX = 500

export interface DrawingComment {
  id: string
  /**
   * Inches from the drawing origin, exactly like a shape's `x`/`y`.
   *
   * The commands speak feet, because a person does; the store speaks inches,
   * because the rest of the drawing does. The conversion happens once, in the
   * client handler, so there is only one place to get it wrong.
   */
  x: number
  y: number
  body: string
  /** Who wrote it. Resolved on the server from the session, never sent up. */
  authorId: string
  authorName: string
  /** ISO 8601, server-stamped for the same reason. */
  createdAt: string
  updatedAt?: string
  resolved: boolean
  resolvedAt?: string
  resolvedByName?: string
}

/**
 * The stored shape of a note, for the write boundary.
 *
 * `parseComments` is deliberately forgiving because a drawing has to open; this
 * is deliberately strict, because a drawing has to be worth opening. Nothing
 * malformed gets written back over the top of good data.
 */
export const DrawingCommentSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  body: z.string().min(1).max(COMMENT_BODY_MAX),
  authorId: z.string(),
  authorName: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  resolved: z.boolean(),
  resolvedAt: z.string().optional(),
  resolvedByName: z.string().optional(),
})

/** What the server settles for a new comment, and the client must not invent. */
export const CommentAuthorshipSchema = z.object({
  commentId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  createdAt: z.string().min(1),
})
export type CommentAuthorship = z.infer<typeof CommentAuthorshipSchema>

/** What the server settles for an edit or a resolve: a name and a timestamp. */
export const CommentStampSchema = z.object({
  commentId: z.string().min(1),
  actorName: z.string().min(1),
  at: z.string().min(1),
})
export type CommentStamp = z.infer<typeof CommentStampSchema>

export const CommentBodySchema = z
  .string()
  .trim()
  .min(1, 'A note needs something in it.')
  .max(COMMENT_BODY_MAX)

/**
 * Read comments off a stored drawing.
 *
 * Every drawing made before comments existed has none, and a drawing written by
 * a newer build could carry a field this one does not know. Both have to open
 * rather than throw, so this filters rather than validates: a malformed entry is
 * dropped, and the rest of the drawing still loads.
 */
export function parseComments(raw: unknown): DrawingComment[] {
  if (!Array.isArray(raw)) return []
  const out: DrawingComment[] = []
  for (const entry of raw) {
    const comment = parseComment(entry)
    if (comment) out.push(comment)
  }
  return out
}

function parseComment(raw: unknown): DrawingComment | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  const body = typeof obj.body === 'string' ? obj.body : ''
  if (!id || !body) return null
  if (!Number.isFinite(obj.x) || !Number.isFinite(obj.y)) return null

  // Built field by field rather than spread: `exactOptionalPropertyTypes` makes
  // `{ updatedAt: undefined }` a different thing from an absent key, and the
  // spread form is what generates the follow-up fix commit.
  const comment: DrawingComment = {
    id,
    x: obj.x as number,
    y: obj.y as number,
    body: body.slice(0, COMMENT_BODY_MAX),
    authorId: typeof obj.authorId === 'string' ? obj.authorId : '',
    // An older or half-written row still has an author line worth showing.
    authorName: typeof obj.authorName === 'string' && obj.authorName ? obj.authorName : 'Someone',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
    resolved: obj.resolved === true,
  }
  if (typeof obj.updatedAt === 'string' && obj.updatedAt) comment.updatedAt = obj.updatedAt
  if (typeof obj.resolvedAt === 'string' && obj.resolvedAt) comment.resolvedAt = obj.resolvedAt
  if (typeof obj.resolvedByName === 'string' && obj.resolvedByName) {
    comment.resolvedByName = obj.resolvedByName
  }
  return comment
}

/** Two letters for the pin. A pin has room for a name only when it is short. */
export function commentInitials(authorName: string): string {
  const parts = authorName.split(/[\s@._-]+/).filter(Boolean)
  const head = parts[0]?.[0] ?? '?'
  const tail = parts[1]?.[0] ?? ''
  return (head + tail).toUpperCase().slice(0, 2)
}

/**
 * When it was written, in the words a person uses.
 *
 * `now` is a parameter so this is testable without freezing the clock, and so
 * two pins rendered in the same pass cannot disagree about what "now" is.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.round((now.getTime() - then) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Sort for the list: open notes first, newest first inside each group. */
export function sortedForList(comments: readonly DrawingComment[]): DrawingComment[] {
  return [...comments].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (Number.isFinite(byTime) && byTime !== 0) return byTime
    // A stable tiebreaker, so a list of notes written in the same second does
    // not reorder itself on every render.
    return a.id.localeCompare(b.id)
  })
}

export function unresolvedCount(comments: readonly DrawingComment[]): number {
  return comments.reduce((total, comment) => (comment.resolved ? total : total + 1), 0)
}
