// The test that decides whether monitoring is allowed to exist.
//
// Pool Forge holds homeowners' names, addresses, phone numbers and contract
// figures. An error message can carry any of them without anybody having
// decided to put it there: a Prisma constraint violation quotes the offending
// row, a validation failure quotes the field it rejected, and a hand-written
// `throw new Error(\`... \${customer.name} ...\`)` quotes whatever was in scope.
//
// So the assertion here is not "the redactor does something". It is: given a
// realistic error carrying a customer's name, their email address and a
// contract total, none of those three strings survives anywhere in the record
// that gets logged, and none survives in the payload that would be POSTed to an
// alert sink.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAlertPayload, resetAlertDedupe } from '@/modules/monitoring/alert'
import { maskRoute, redactErrorName, redactStack, redactText } from '@/modules/monitoring/redact'
import { buildReport, captureError } from '@/modules/monitoring/report'
import { monitoringConfig } from '@/modules/monitoring/config'

/** One real customer's worth of data, as it would appear in a thrown error. */
const CUSTOMER = {
  name: 'Margaret Fitzwilliam',
  firstName: 'Margaret',
  surname: 'Fitzwilliam',
  email: 'margaret.fitzwilliam@example.com',
  address: '14 Willow Creek Drive',
  phone: '07700 900461',
  amount: '$48,750.00',
  bareAmount: '48750',
}

/**
 * The shape a Prisma failure actually takes when a quote is saved twice. Every
 * field above appears, because they all appear on the record being written.
 */
function customerError(): Error {
  const error = new Error(
    'Unique constraint failed on the fields: (`orgId`,`customerEmail`). ' +
      `Existing quote belongs to ${CUSTOMER.name} <${CUSTOMER.email}> ` +
      `of ${CUSTOMER.address}, telephone ${CUSTOMER.phone}, ` +
      `contract total ${CUSTOMER.amount} (${CUSTOMER.bareAmount} ex tax).`,
  )
  error.name = 'PrismaClientKnownRequestError'
  error.stack =
    `${error.name}: ${error.message}\n` +
    '    at saveQuote (/Users/margaret/pool-forge/src/modules/pricing/quote.ts:88:11)\n' +
    '    at async POST (/Users/margaret/pool-forge/src/app/api/commands/route.ts:142:5)'
  return error
}

const FORBIDDEN = [
  CUSTOMER.name,
  CUSTOMER.firstName,
  CUSTOMER.surname,
  CUSTOMER.email,
  CUSTOMER.phone,
  CUSTOMER.amount,
  CUSTOMER.bareAmount,
  '48,750',
  'Willow',
  'Creek',
  'margaret',
]

function expectNothingPersonal(haystack: string): void {
  for (const secret of FORBIDDEN) {
    expect(haystack.toLowerCase(), `leaked "${secret}"`).not.toContain(secret.toLowerCase())
  }
}

describe('redactText', () => {
  it('removes a customer name, email address and contract figure', () => {
    const redacted = redactText(customerError())
    expectNothingPersonal(redacted)
  })

  it('keeps enough of the error to be worth logging', () => {
    const redacted = redactText(customerError())
    expect(redacted).toContain('constraint')
    expect(redacted).toContain('[redacted-name]')
    expect(redacted).toContain('[redacted-email]')
    expect(redacted).toContain('[redacted-amount]')
  })

  it('does not eat technical vocabulary', () => {
    const redacted = redactText(
      new Error('Invalid `prisma.quote.create()` invocation: connection refused after 3 attempts'),
    )
    expect(redacted).toContain('prisma.quote.create()')
    expect(redacted).toContain('3 attempts')
  })

  it('leaves PascalCase and ALL-CAPS identifiers alone', () => {
    expect(redactText('TypeError raised inside PrismaClient over HTTPS')).toContain('TypeError')
    expect(redactText('TypeError raised inside PrismaClient over HTTPS')).toContain('PrismaClient')
    expect(redactText('TypeError raised inside PrismaClient over HTTPS')).toContain('HTTPS')
  })

  it('drops home directory paths, which carry names and original filenames', () => {
    const redacted = redactText('ENOENT: /Users/margaret/Desktop/Fitzwilliam-survey.heic')
    expectNothingPersonal(redacted)
    expect(redacted).toContain('[redacted-path]')
  })

  it('caps runaway input so a whole request body cannot reach a log', () => {
    const redacted = redactText('x'.repeat(100_000))
    expect(redacted.length).toBeLessThan(700)
  })

  it('never throws, whatever it is handed', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => redactText(circular)).not.toThrow()
    expect(() => redactText(undefined)).not.toThrow()
    expect(() => redactText(Symbol('x'))).not.toThrow()
  })
})

describe('redactErrorName', () => {
  it('keeps a real class name and rejects anything else', () => {
    expect(redactErrorName('PrismaClientKnownRequestError')).toBe('PrismaClientKnownRequestError')
    expect(redactErrorName('Margaret Fitzwilliam owes $48,750')).toBe('Error')
    expect(redactErrorName(42)).toBe('Error')
  })
})

describe('redactStack', () => {
  it('redacts every frame and caps how many are kept', () => {
    const frames = redactStack(customerError().stack)
    expect(frames.length).toBeGreaterThan(0)
    expectNothingPersonal(frames.join('\n'))
    expect(redactStack(Array.from({ length: 50 }, () => 'at x (a.ts:1:1)').join('\n')).length).toBe(
      12,
    )
  })

  it('drops dependency and bundler frames so the app frames fit under the cap', () => {
    const stack = [
      'TypeError: boom',
      '    at saveQuote (src/modules/pricing/quote.ts:88:11)',
      '    at handler (webpack-internal:///(rsc)/./node_modules/.pnpm/next@15.5.15/dist/x.js:1:1)',
      '    at run (/repo/node_modules/next/dist/server/y.js:2:2)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
      '    at POST (src/app/api/commands/route.ts:142:5)',
    ].join('\n')
    const frames = redactStack(stack)
    expect(frames).toHaveLength(3)
    expect(frames[0]).toContain('TypeError')
    expect(frames.join(' ')).toContain('quote.ts')
    expect(frames.join(' ')).toContain('route.ts')
    expect(frames.join(' ')).not.toContain('node_modules')
    expect(frames.join(' ')).not.toContain('webpack-internal')
  })
})

describe('maskRoute', () => {
  it('masks ids and drops the query string entirely', () => {
    expect(maskRoute('/projects/clx8f2k9q0000abcdefghijkl/proposal')).toBe('/projects/:id/proposal')
    expect(maskRoute('/share/abc?customer=Margaret+Fitzwilliam&total=48750')).toBe('/share/abc')
    expect(maskRoute('https://app.example.com/projects/42?q=Margaret')).toBe('/projects/:id')
    expect(maskRoute(undefined)).toBeNull()
  })
})

describe('the record that actually gets logged', () => {
  beforeEach(() => {
    resetAlertDedupe()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('carries no customer data in any field', () => {
    const report = buildReport(
      {
        error: customerError(),
        code: 'command_execute',
        origin: 'server',
        route: '/projects/clx8f2k9q0000abcdefghijkl/quote?customer=Margaret%20Fitzwilliam',
        orgId: 'org_123',
        userId: 'user_456',
      },
      monitoringConfig(),
    )
    expectNothingPersonal(JSON.stringify(report))
    // Still useful: the ref, the bucket, the class and the masked route survive.
    expect(report.errorRef).toMatch(/^err_[0-9a-f]{12}$/)
    expect(report.code).toBe('command_execute')
    expect(report.name).toBe('PrismaClientKnownRequestError')
    expect(report.route).toBe('/projects/:id/quote')
    expect(report.orgId).toBe('org_123')
  })

  it('carries no customer data in the payload an alert sink would receive', () => {
    const report = buildReport(
      { error: customerError(), code: 'command_execute' },
      monitoringConfig(),
    )
    const payload = buildAlertPayload(report)
    expectNothingPersonal(JSON.stringify(payload))
    // Stack frames are logged locally but never leave the process.
    expect(Object.hasOwn(payload.report, 'stack')).toBe(false)
    expect(payload.text).toContain(report.errorRef)
  })

  it('writes exactly one redacted JSON line and returns the ref', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = captureError({ error: customerError(), code: 'command_execute' })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0] ?? '')
    expectNothingPersonal(line)
    const parsed = JSON.parse(line) as { errorRef: string; scope: string }
    expect(parsed.scope).toBe('monitoring')
    expect(parsed.errorRef).toBe(report.errorRef)
  })
})
