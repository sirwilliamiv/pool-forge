import { PrismaClient } from '@prisma/client'

// Future Neon swap: install `@prisma/adapter-neon @neondatabase/serverless`,
// then replace the client construction below with:
//
//   import { PrismaNeon } from '@prisma/adapter-neon'
//   import { Pool } from '@neondatabase/serverless'
//   const adapter = new PrismaNeon(new Pool({ connectionString: process.env.DATABASE_URL }))
//   export const db = new PrismaClient({ adapter })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
