// How a command was triggered.
//
// A plain tuple rather than the Prisma enum. `z.nativeEnum(CommandSource)` looked
// equivalent and was not: the imported enum object is undefined in some server
// runtimes, so building the schema threw `Cannot convert undefined or null to
// object` and every command returned 500 — including the ones that had nothing
// to do with auditing.
//
// It is also the only definition the browser can use, since a client bundle must
// not pull in the Prisma client for the sake of five strings. Prisma accepts the
// literal string for an enum column, so nothing needs converting at the write.

export const COMMAND_SOURCES = ['UI', 'VOICE', 'API', 'IMPORT', 'CRON'] as const

export type CommandSourceValue = (typeof COMMAND_SOURCES)[number]

export const DEFAULT_COMMAND_SOURCE: CommandSourceValue = 'UI'

/** True when a value from the wire names a real source. */
export function isCommandSource(value: unknown): value is CommandSourceValue {
  return typeof value === 'string' && (COMMAND_SOURCES as readonly string[]).includes(value)
}
