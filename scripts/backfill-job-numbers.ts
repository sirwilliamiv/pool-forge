#!/usr/bin/env tsx
/**
 * Give every project that predates job numbers one.
 *
 * Run with: pnpm tsx scripts/backfill-job-numbers.ts
 *
 * Idempotent: a project that already has a number is left alone, so this is
 * safe to run repeatedly and safe to run while the app is serving. Numbers are
 * handed out oldest project first, per organisation, so the sequence a builder
 * sees matches the order they took the work on.
 */
import { db } from '../src/lib/db'
import { backfillJobNumbers } from '../src/modules/projects/job-number'

async function main(): Promise<void> {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } })
  let total = 0
  for (const org of orgs) {
    const assigned = await backfillJobNumbers(org.id)
    total += assigned
    if (assigned > 0) console.log(`${org.name}: numbered ${assigned} project(s)`)
  }
  console.log(`Done. ${total} project(s) numbered across ${orgs.length} organisation(s).`)
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
