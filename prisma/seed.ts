import {
  PrismaClient,
  Prisma,
  OrgRole,
  ProjectStatus,
  MaterialKind,
  PriceCategory,
  UnitType,
} from '@prisma/client'
import bcrypt from 'bcryptjs'
import { STENCILS } from '../src/modules/editor/stencils'

const db = new PrismaClient()

const ORG_ID = 'seed-org-demo'
const USER_ID = 'seed-user-demo'
const CUSTOMER_ID = 'seed-customer-demo'
const PROJECT_ID = 'seed-project-demo'
const DRAWING_ID = 'seed-drawing-demo'
const PRICE_BOOK_ID = 'seed-pricebook-demo'

const PRICE_ITEM_IDS = {
  pool: 'seed-item-pool-base',
  deck: 'seed-item-deck-concrete',
  coping: 'seed-item-coping-lf',
  copingSilver: 'seed-item-coping-travertine-silver',
  copingCantilever: 'seed-item-coping-cantilever',
  finishPlaster: 'seed-item-finish-plaster-white',
  finishPebbleCobalt: 'seed-item-finish-pebbletec-cobalt',
  finishPebbleBlueGranite: 'seed-item-finish-pebbletec-blue-granite',
  tileGlassAqua: 'seed-item-tile-glass-aqua',
  equipment: 'seed-item-pump-vsp',
  heater: 'seed-item-heater-gas-400k',
  saltCell: 'seed-item-salt-chlorinator',
  screenCage: 'seed-item-screen-mansard-cage',
  lighting: 'seed-item-led-light',
  permitFees: 'seed-item-permit-fees',
  retainingWall: 'seed-item-paver-retaining-wall',
  panelUpgrade: 'seed-item-panel-upgrade',
} as const

const TEMPLATE_IDS = {
  rectangle: 'seed-tmpl-rectangle-pool',
  deck: 'seed-tmpl-concrete-deck',
  sunShelf: 'seed-tmpl-sun-shelf',
} as const

const MATERIAL_IDS = {
  poolWater: 'seed-mat-pool-water',
  concreteDeck: 'seed-mat-concrete-deck',
  pebbletecBlueGranite: 'seed-mat-pebbletec-blue-granite',
  pebbletecCobalt: 'seed-mat-pebbletec-cobalt',
  plasterWhite: 'seed-mat-plaster-white',
  travertineSilver: 'seed-mat-travertine-silver',
  travertineIvory: 'seed-mat-travertine-ivory',
  copingCantilever: 'seed-mat-coping-cantilever',
  glassMosaicAqua: 'seed-mat-glass-mosaic-aqua',
  glassPearl: 'seed-mat-glass-pearl',
  paverDeckTan: 'seed-mat-paver-deck-tan',
  grass: 'seed-mat-grass',
} as const

async function main() {
  const passwordHash = await bcrypt.hash('demo1234', 10)

  const org = await db.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'Pool Forge Demo Co' },
    create: { id: ORG_ID, name: 'Pool Forge Demo Co' },
  })

  const user = await db.user.upsert({
    where: { email: 'demo@poolforge.test' },
    update: { name: 'Demo User', passwordHash },
    create: {
      id: USER_ID,
      email: 'demo@poolforge.test',
      name: 'Demo User',
      passwordHash,
    },
  })

  await db.organizationMember.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: OrgRole.OWNER },
    create: { userId: user.id, orgId: org.id, role: OrgRole.OWNER },
  })

  await db.customer.upsert({
    where: { id: CUSTOMER_ID },
    update: {
      name: 'Jane Homeowner',
      email: 'jane@example.test',
      phone: '555-0100',
      address: '123 Pool Lane, Tampa FL',
    },
    create: {
      id: CUSTOMER_ID,
      orgId: org.id,
      name: 'Jane Homeowner',
      email: 'jane@example.test',
      phone: '555-0100',
      address: '123 Pool Lane, Tampa FL',
    },
  })

  await db.project.upsert({
    where: { id: PROJECT_ID },
    update: {
      name: 'Homeowner Backyard Pool',
      status: ProjectStatus.DRAFT,
      salesperson: 'Demo User',
      designer: 'Demo User',
    },
    create: {
      id: PROJECT_ID,
      orgId: org.id,
      customerId: CUSTOMER_ID,
      name: 'Homeowner Backyard Pool',
      status: ProjectStatus.DRAFT,
      salesperson: 'Demo User',
      designer: 'Demo User',
      poolFields: {
        poolType: 'Rectangle',
        depthShallow: 3,
        depthDeep: 5,
        interiorFinish: 'Pebble',
        equipmentPackage: null,
        sanitizationPackage: null,
        heaterSelection: null,
        lightingSelection: null,
        deckMaterial: 'Concrete',
        copingMaterial: 'Travertine',
        screenOption: null,
      },
    },
  })

  await db.drawing.upsert({
    where: { projectId: PROJECT_ID },
    update: { scale: 1.0 },
    create: {
      id: DRAWING_ID,
      projectId: PROJECT_ID,
      scale: 1.0,
      rootJson: {},
    },
  })

  const priceBook = await db.priceBook.upsert({
    where: { orgId_name_version: { orgId: org.id, name: 'Default Price Book', version: 1 } },
    update: { isActive: true },
    create: {
      id: PRICE_BOOK_ID,
      orgId: org.id,
      name: 'Default Price Book',
      version: 1,
      isActive: true,
    },
  })

  const items: Array<{
    id: string
    category: PriceCategory
    name: string
    unitType: UnitType
    unitCost: string
    retailPrice: string
    required?: boolean
    optionKey?: string
  }> = [
    {
      id: PRICE_ITEM_IDS.pool,
      category: PriceCategory.POOL,
      name: 'Pool Base — Wetted Area',
      unitType: UnitType.SQFT,
      unitCost: '32.00',
      retailPrice: '85.00',
      required: true,
    },
    {
      id: PRICE_ITEM_IDS.deck,
      category: PriceCategory.DECK,
      name: 'Concrete Deck',
      unitType: UnitType.SQFT,
      unitCost: '6.50',
      retailPrice: '14.00',
    },
    // Finishes. Every one of these is a line the quote can actually charge, and
    // the material catalogue points at them by id — see `fillSpec.priceItemId`
    // below. Before this, the picker carried its own prices (`PebbleTec —
    // Cobalt $7.10/sqft`) that no quote had ever billed, so a builder chose
    // between three finishes and got the same total whichever they picked.
    //
    // Only the chosen one is billed: `computeQuote` treats a price-book item
    // that some material claims as an alternative rather than as scope, so a
    // book with three copings in it bills the one running round the pool.
    {
      id: PRICE_ITEM_IDS.coping,
      category: PriceCategory.COPING,
      name: 'Travertine Coping — Ivory',
      unitType: UnitType.LF,
      unitCost: '18.00',
      retailPrice: '42.00',
    },
    {
      id: PRICE_ITEM_IDS.copingSilver,
      category: PriceCategory.COPING,
      name: 'Travertine Coping — Silver',
      unitType: UnitType.LF,
      unitCost: '20.00',
      retailPrice: '46.00',
    },
    {
      id: PRICE_ITEM_IDS.copingCantilever,
      category: PriceCategory.COPING,
      name: 'Cantilever Concrete Coping',
      unitType: UnitType.LF,
      unitCost: '12.00',
      retailPrice: '26.00',
    },
    {
      id: PRICE_ITEM_IDS.finishPlaster,
      category: PriceCategory.POOL,
      name: 'Interior Finish — White Plaster',
      unitType: UnitType.SQFT,
      unitCost: '4.25',
      retailPrice: '9.50',
    },
    {
      id: PRICE_ITEM_IDS.finishPebbleCobalt,
      category: PriceCategory.POOL,
      name: 'Interior Finish — PebbleTec Cobalt',
      unitType: UnitType.SQFT,
      unitCost: '7.10',
      retailPrice: '15.75',
    },
    {
      id: PRICE_ITEM_IDS.finishPebbleBlueGranite,
      category: PriceCategory.POOL,
      name: 'Interior Finish — PebbleTec Blue Granite',
      unitType: UnitType.SQFT,
      unitCost: '9.00',
      retailPrice: '19.50',
    },
    {
      // Waterline tile is a pool line sold by the foot, and the foot is the
      // pool's own edge. `PriceCategory` has no TILE, and adding one is a
      // migration; POOL + LF says the same thing and the engine measures it.
      id: PRICE_ITEM_IDS.tileGlassAqua,
      category: PriceCategory.POOL,
      name: 'Waterline Tile — Glass Mosaic Aqua',
      unitType: UnitType.LF,
      unitCost: '15.00',
      retailPrice: '32.00',
    },
    {
      id: PRICE_ITEM_IDS.equipment,
      category: PriceCategory.EQUIPMENT,
      name: 'Variable Speed Pump',
      unitType: UnitType.EACH,
      unitCost: '850.00',
      retailPrice: '1750.00',
      required: true,
    },
    // Two pieces of equipment, two different questions. Both of these used to
    // be switched on by one flag meaning "a heater OR a salt system", and the
    // engine handed that single answer to every item in the category: a
    // customer who asked for salt was billed $5,800 for a heater, on a proposal
    // whose own equipment schedule said the heater was not included. Each line
    // names the option it belongs to now.
    {
      id: PRICE_ITEM_IDS.heater,
      category: PriceCategory.EQUIPMENT,
      name: 'Gas Heater — 400k BTU',
      unitType: UnitType.EACH,
      unitCost: '3100.00',
      retailPrice: '5800.00',
      optionKey: 'heater',
    },
    {
      id: PRICE_ITEM_IDS.saltCell,
      category: PriceCategory.EQUIPMENT,
      name: 'Salt Chlorination System',
      unitType: UnitType.EACH,
      unitCost: '1100.00',
      retailPrice: '2200.00',
      optionKey: 'salt',
    },
    {
      // Sold as one thing, because a cage is not measured by anything in the
      // drawing. This line used to be per square foot and billed the deck's
      // area, which is neither the footprint a cage covers nor the panel area a
      // screen contractor charges for. A per-square-foot cage rate now bills
      // nothing and says so; a builder who wants one prices the cage on the job
      // with the square footage they measured on site.
      id: PRICE_ITEM_IDS.screenCage,
      category: PriceCategory.SCREEN,
      name: 'Screen Enclosure — Mansard Cage',
      unitType: UnitType.LUMP,
      unitCost: '11800.00',
      retailPrice: '21500.00',
      optionKey: 'screen',
    },
    {
      id: PRICE_ITEM_IDS.lighting,
      category: PriceCategory.LIGHTING,
      name: 'LED Pool Light',
      unitType: UnitType.EACH,
      unitCost: '180.00',
      retailPrice: '450.00',
    },
    // Rates for scope no drawing measures. These are kept here because they are
    // the builder's real numbers, and put on a job from the project page, where
    // somebody says how many. They used to be accepted into the book, listed,
    // and then absent from every quote: "Permit fees $2,000" saved, shown, and
    // billed to nobody.
    {
      id: PRICE_ITEM_IDS.permitFees,
      category: PriceCategory.MISC,
      name: 'Permit & Impact Fees',
      unitType: UnitType.LUMP,
      unitCost: '2000.00',
      retailPrice: '2000.00',
    },
    {
      id: PRICE_ITEM_IDS.retainingWall,
      category: PriceCategory.WALL,
      name: 'Paver Retaining Wall',
      unitType: UnitType.LF,
      unitCost: '48.00',
      retailPrice: '94.00',
    },
    {
      id: PRICE_ITEM_IDS.panelUpgrade,
      category: PriceCategory.ELECTRICAL,
      name: 'Sub-panel & Equipment Bonding',
      unitType: UnitType.LUMP,
      unitCost: '1450.00',
      retailPrice: '2900.00',
    },
  ]

  for (const item of items) {
    await db.priceBookItem.upsert({
      where: { id: item.id },
      update: {
        category: item.category,
        name: item.name,
        unitType: item.unitType,
        unitCost: new Prisma.Decimal(item.unitCost),
        retailPrice: new Prisma.Decimal(item.retailPrice),
        required: item.required ?? false,
        optionKey: item.optionKey ?? null,
      },
      create: {
        id: item.id,
        priceBookId: priceBook.id,
        category: item.category,
        name: item.name,
        unitType: item.unitType,
        unitCost: new Prisma.Decimal(item.unitCost),
        retailPrice: new Prisma.Decimal(item.retailPrice),
        required: item.required ?? false,
        optionKey: item.optionKey ?? null,
      },
    })
  }

  // Seed StencilDef from the TS catalog. The catalog is the source of truth;
  // this mirrors it into the DB so server code can query/joined-fetch it.
  for (const s of STENCILS) {
    const widthIn = s.defaultDimensions.unit === 'ft'
      ? s.defaultDimensions.width * 12
      : s.defaultDimensions.width
    const heightIn = s.defaultDimensions.unit === 'ft'
      ? s.defaultDimensions.height * 12
      : s.defaultDimensions.height
    await db.stencilDef.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        category: s.category,
        defaultWidthIn: widthIn,
        defaultHeightIn: heightIn,
        defaultFill: s.defaultFill,
        defaultStroke: s.defaultStroke,
        measurementBehavior: s.measurementBehavior,
        pricingBehavior: s.pricingBehavior,
        exportVisibility: s.exportVisibility,
        affectsQuote: s.affectsQuote,
        onConstructionSheet: s.onConstructionSheet,
        editableProperties: s.editableProperties,
        shapeKind: s.shapeKind,
      },
      create: {
        id: s.id,
        name: s.name,
        category: s.category,
        defaultWidthIn: widthIn,
        defaultHeightIn: heightIn,
        defaultFill: s.defaultFill,
        defaultStroke: s.defaultStroke,
        measurementBehavior: s.measurementBehavior,
        pricingBehavior: s.pricingBehavior,
        exportVisibility: s.exportVisibility,
        affectsQuote: s.affectsQuote,
        onConstructionSheet: s.onConstructionSheet,
        editableProperties: s.editableProperties,
        shapeKind: s.shapeKind,
      },
    })
  }

  await db.shapeTemplate.upsert({
    where: { id: TEMPLATE_IDS.rectangle },
    update: {},
    create: {
      id: TEMPLATE_IDS.rectangle,
      orgId: null,
      category: 'Pool',
      name: 'Rectangle Pool',
      defaultGeometry: { kind: 'rectangle', widthFt: 14, lengthFt: 28 },
      defaultStyle: { fill: '#7DB9E8', stroke: '#1F4E79', strokeWidth: 2 },
      measurementBehavior: { tracks: ['area', 'perimeter', 'wettedArea', 'gallons'] },
      pricingBehavior: { drives: ['Pool', 'Coping'] },
    },
  })

  await db.shapeTemplate.upsert({
    where: { id: TEMPLATE_IDS.deck },
    update: {},
    create: {
      id: TEMPLATE_IDS.deck,
      orgId: null,
      category: 'Deck',
      name: 'Concrete Deck',
      defaultGeometry: { kind: 'rectangle', widthFt: 30, lengthFt: 40 },
      defaultStyle: { fill: '#D9D6CF', stroke: '#8C8A85', strokeWidth: 1 },
      measurementBehavior: { tracks: ['deckArea', 'decoDrainLf'] },
      pricingBehavior: { drives: ['Deck', 'DecoDrain'] },
    },
  })

  await db.shapeTemplate.upsert({
    where: { id: TEMPLATE_IDS.sunShelf },
    update: {},
    create: {
      id: TEMPLATE_IDS.sunShelf,
      orgId: null,
      category: 'PoolFeature',
      name: 'Sun Shelf',
      defaultGeometry: { kind: 'rectangle', widthFt: 6, lengthFt: 8, depthIn: 12 },
      defaultStyle: { fill: '#A6D2EA', stroke: '#1F4E79', strokeWidth: 1 },
      measurementBehavior: { tracks: ['area'] },
      pricingBehavior: { drives: ['SunShelf'] },
    },
  })

  await db.material.upsert({
    where: { id: MATERIAL_IDS.poolWater },
    update: {},
    create: {
      id: MATERIAL_IDS.poolWater,
      orgId: null,
      kind: MaterialKind.POOL_WATER,
      name: 'Pool Water',
      fillSpec: { type: 'solid', color: '#7DB9E8', opacity: 0.85 },
    },
  })

  await db.material.upsert({
    where: { id: MATERIAL_IDS.concreteDeck },
    update: {},
    create: {
      id: MATERIAL_IDS.concreteDeck,
      orgId: null,
      kind: MaterialKind.CONCRETE_DECK,
      name: 'Concrete Deck',
      fillSpec: { type: 'solid', color: '#D9D6CF' },
    },
  })

  const extraMaterials: Array<{
    id: string
    kind: MaterialKind
    name: string
    fillSpec: Prisma.InputJsonValue
  }> = [
    {
      id: MATERIAL_IDS.pebbletecBlueGranite,
      kind: MaterialKind.CUSTOM,
      name: 'PebbleTec — Blue Granite',
      fillSpec: {
        type: 'gradient',
        color: '#1E3A8A',
        secondary: '#2563EB',
        brand: 'PebbleTec',
        slot: 'interior',
        priceItemId: PRICE_ITEM_IDS.finishPebbleBlueGranite,
      },
    },
    {
      id: MATERIAL_IDS.pebbletecCobalt,
      kind: MaterialKind.CUSTOM,
      name: 'PebbleTec — Cobalt',
      fillSpec: {
        type: 'gradient',
        color: '#1E40AF',
        secondary: '#3B82F6',
        brand: 'PebbleTec',
        slot: 'interior',
        priceItemId: PRICE_ITEM_IDS.finishPebbleCobalt,
      },
    },
    {
      // The finish a pool has before anyone upgrades it. The default used to be
      // "Pool Water", which is not a finish — it is the colour the water is
      // drawn in — so every proposal that printed an interior finish printed the
      // wrong thing, and every one that did not printed a blank row.
      id: MATERIAL_IDS.plasterWhite,
      kind: MaterialKind.CUSTOM,
      name: 'White Plaster',
      fillSpec: {
        type: 'gradient',
        color: '#F1F5F9',
        secondary: '#CBD5E1',
        slot: 'interior',
        priceItemId: PRICE_ITEM_IDS.finishPlaster,
        isDefault: true,
      },
    },
    {
      id: MATERIAL_IDS.travertineSilver,
      kind: MaterialKind.COPING,
      name: 'Travertine — Silver',
      fillSpec: {
        type: 'gradient',
        color: '#A8A29E',
        secondary: '#78716C',
        slot: 'coping',
        priceItemId: PRICE_ITEM_IDS.copingSilver,
      },
    },
    {
      id: MATERIAL_IDS.travertineIvory,
      kind: MaterialKind.COPING,
      name: 'Travertine — Ivory',
      fillSpec: {
        type: 'gradient',
        color: '#FEF3C7',
        secondary: '#FDE68A',
        slot: 'coping',
        priceItemId: PRICE_ITEM_IDS.coping,
        isDefault: true,
      },
    },
    {
      // Every coping line in the price book must have a material claiming it.
      // An unclaimed line is billed by its category the moment the pool has a
      // perimeter, so a book holding a travertine and a cantilever with only
      // the travertine in the catalogue quoted both, on the same proposal.
      id: MATERIAL_IDS.copingCantilever,
      kind: MaterialKind.COPING,
      name: 'Cantilever Concrete',
      fillSpec: {
        type: 'gradient',
        color: '#E7E5E4',
        secondary: '#A8A29E',
        slot: 'coping',
        priceItemId: PRICE_ITEM_IDS.copingCantilever,
      },
    },
    {
      id: MATERIAL_IDS.glassMosaicAqua,
      kind: MaterialKind.CUSTOM,
      name: 'Glass Mosaic — Aqua mix',
      fillSpec: {
        type: 'mosaic',
        color: '#06B6D4',
        secondary: '#0EA5E9',
        slot: 'tileBand',
        priceItemId: PRICE_ITEM_IDS.tileGlassAqua,
        isDefault: true,
      },
    },
    {
      // Deliberately unlinked: an organisation always has a material its price
      // book has no line for, and the honest behaviour is worth being able to
      // see. The picker says "Not in price book" beside it and the quote lists
      // it under unpriced scope instead of billing it at the base rate.
      id: MATERIAL_IDS.glassPearl,
      kind: MaterialKind.CUSTOM,
      name: 'Glass — Pearl',
      fillSpec: {
        type: 'gradient',
        color: '#F1F5F9',
        secondary: '#94A3B8',
        slot: 'tileBand',
      },
    },
    {
      // No slot and no price: a canvas fill, not something a builder picks and
      // is charged for. Deck surfaces are billed by the deck line, and the card
      // used to advertise `$14.00/sqft` here that came from nowhere.
      id: MATERIAL_IDS.paverDeckTan,
      kind: MaterialKind.PAVER_DECK,
      name: 'Paver Deck — Tan',
      fillSpec: { type: 'gradient', color: '#D6BFA0', secondary: '#A8896A' },
    },
    {
      id: MATERIAL_IDS.grass,
      kind: MaterialKind.GRASS,
      name: 'Grass',
      fillSpec: { type: 'solid', color: '#9CCC8E' },
    },
  ]

  for (const m of extraMaterials) {
    await db.material.upsert({
      where: { id: m.id },
      // `update: {}` here meant a re-seed left every existing row exactly as it
      // was, so the materials carrying prices no quote had ever charged would
      // have survived this change in every database that already had them.
      update: { kind: m.kind, name: m.name, fillSpec: m.fillSpec },
      create: {
        id: m.id,
        orgId: null,
        kind: m.kind,
        name: m.name,
        fillSpec: m.fillSpec,
      },
    })
  }

  console.log('Seed complete:', {
    org: org.id,
    user: user.email,
    project: PROJECT_ID,
    priceBookItems: items.length,
    stencilDefs: STENCILS.length,
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
