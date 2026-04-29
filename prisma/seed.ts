import { PrismaClient, Prisma, OrgRole, ProjectStatus, MaterialKind } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
    category: string
    name: string
    unitType: string
    unitCost: string
    retailPrice: string
    required?: boolean
  }> = [
    {
      id: PRICE_ITEM_IDS.pool,
      category: 'Pool',
      name: 'Pool Base — Wetted Area',
      unitType: 'sqft',
      unitCost: '32.00',
      retailPrice: '85.00',
      required: true,
    },
    {
      id: PRICE_ITEM_IDS.deck,
      category: 'Deck',
      name: 'Concrete Deck',
      unitType: 'sqft',
      unitCost: '6.50',
      retailPrice: '14.00',
    },
    {
      id: PRICE_ITEM_IDS.coping,
      category: 'Coping',
      name: 'Travertine Coping',
      unitType: 'lf',
      unitCost: '18.00',
      retailPrice: '42.00',
    },
    {
      id: PRICE_ITEM_IDS.equipment,
      category: 'Equipment',
      name: 'Variable Speed Pump',
      unitType: 'each',
      unitCost: '850.00',
      retailPrice: '1750.00',
      required: true,
    },
    {
      id: PRICE_ITEM_IDS.lighting,
      category: 'Lighting',
      name: 'LED Pool Light',
      unitType: 'each',
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

  console.log('Seed complete:', {
    org: org.id,
    user: user.email,
    project: PROJECT_ID,
    priceBookItems: items.length,
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
