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
  equipment: 'seed-item-pump-vsp',
  lighting: 'seed-item-led-light',
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
  glassMosaicAqua: 'seed-mat-glass-mosaic-aqua',
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
    {
      id: PRICE_ITEM_IDS.coping,
      category: PriceCategory.COPING,
      name: 'Travertine Coping',
      unitType: UnitType.LF,
      unitCost: '18.00',
      retailPrice: '42.00',
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
    {
      id: PRICE_ITEM_IDS.lighting,
      category: PriceCategory.LIGHTING,
      name: 'LED Pool Light',
      unitType: UnitType.EACH,
      unitCost: '180.00',
      retailPrice: '450.00',
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
      fillSpec: { type: 'gradient', color: '#1E3A8A', secondary: '#2563EB', brand: 'PebbleTec', costPerSqft: 9.0, unit: 'sqft', slot: 'interior' },
    },
    {
      id: MATERIAL_IDS.pebbletecCobalt,
      kind: MaterialKind.CUSTOM,
      name: 'PebbleTec — Cobalt',
      fillSpec: { type: 'gradient', color: '#1E40AF', secondary: '#3B82F6', brand: 'PebbleTec', costPerSqft: 7.1, unit: 'sqft', slot: 'interior' },
    },
    {
      id: MATERIAL_IDS.plasterWhite,
      kind: MaterialKind.CUSTOM,
      name: 'White Plaster',
      fillSpec: { type: 'gradient', color: '#F1F5F9', secondary: '#CBD5E1', costPerSqft: 4.25, unit: 'sqft', slot: 'interior' },
    },
    {
      id: MATERIAL_IDS.travertineSilver,
      kind: MaterialKind.COPING,
      name: 'Travertine — Silver',
      fillSpec: { type: 'gradient', color: '#A8A29E', secondary: '#78716C', costPerLf: 30.0, unit: 'lf', slot: 'coping' },
    },
    {
      id: MATERIAL_IDS.travertineIvory,
      kind: MaterialKind.COPING,
      name: 'Travertine — Ivory',
      fillSpec: { type: 'gradient', color: '#FEF3C7', secondary: '#FDE68A', costPerLf: 28.0, unit: 'lf', slot: 'coping' },
    },
    {
      id: MATERIAL_IDS.glassMosaicAqua,
      kind: MaterialKind.CUSTOM,
      name: 'Glass Mosaic — Aqua mix',
      fillSpec: { type: 'mosaic', color: '#06B6D4', secondary: '#0EA5E9', costPerLf: 15.0, unit: 'lf', slot: 'tileBand' },
    },
    {
      id: MATERIAL_IDS.paverDeckTan,
      kind: MaterialKind.PAVER_DECK,
      name: 'Paver Deck — Tan',
      fillSpec: { type: 'gradient', color: '#D6BFA0', secondary: '#A8896A', costPerSqft: 14.0, unit: 'sqft' },
    },
    {
      id: MATERIAL_IDS.grass,
      kind: MaterialKind.GRASS,
      name: 'Grass',
      fillSpec: { type: 'solid', color: '#9CCC8E', costPerSqft: 1.5, unit: 'sqft' },
    },
  ]

  for (const m of extraMaterials) {
    await db.material.upsert({
      where: { id: m.id },
      update: {},
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
