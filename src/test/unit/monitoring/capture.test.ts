// Monitoring with nothing configured, which is how development, CI and the
// first beta deployment all run.
//
// The rule this file exists to hold: no key, no account and no environment
// variable is required for the app to work or for the suite to pass. An
// unconfigured monitor is not a broken monitor, it is the default one, writing
// structured JSON to stderr where the host's log collection already reads it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { alertingEnabled, monitoringConfig } from '@/modules/monitoring/config'
import {
  buildAlertPayload,
  resetAlertDedupe,
  sendAlert,
  shouldAlert,
} from '@/modules/monitoring/alert'
import { buildReport, captureError, fingerprintOf } from '@/modules/monitoring/report'
import { adoptRef, isMonitoringRef, newMonitoringRef } from '@/modules/monitoring/ref'
import {
  consumeReportBudget,
  REPORT_LIMIT_PER_WINDOW,
  resetReportLimiter,
} from '@/modules/monitoring/report-limit'

const MONITORING_VARS = ['MONITORING_ALERT_WEBHOOK_URL', 'MONITORING_ENV', 'MONITORING_RELEASE']
const saved = new Map<string, string | undefined>()

beforeEach(() => {
  for (const key of MONITORING_VARS) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
  resetAlertDedupe()
  resetReportLimiter()
})

afterEach(() => {
  for (const key of MONITORING_VARS) {
    const value = saved.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.restoreAllMocks()
})

describe('correlation refs', () => {
  it('are err_ plus exactly 12 hex characters, matching the existing convention', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(newMonitoringRef()).toMatch(/^err_[0-9a-f]{12}$/)
    }
  })

  it('adopt a well-formed caller ref and refuse anything else', () => {
    expect(adoptRef('err_0123456789ab')).toBe('err_0123456789ab')
    // A browser-supplied ref is untrusted text: it goes in a log line, so only
    // the exact shape is accepted and everything else gets a fresh ref.
    expect(adoptRef('err_ABCDEF123456')).not.toBe('err_ABCDEF123456')
    expect(adoptRef('"; DROP TABLE Project; --')).toMatch(/^err_[0-9a-f]{12}$/)
    expect(adoptRef(undefined)).toMatch(/^err_[0-9a-f]{12}$/)
    expect(isMonitoringRef(adoptRef(42))).toBe(true)
  })
})

describe('with no monitoring configuration at all', () => {
  it('reports no sink and no release', () => {
    const config = monitoringConfig()
    expect(config.alertWebhookUrl).toBeNull()
    expect(config.release).toBeNull()
    expect(alertingEnabled(config)).toBe(false)
  })

  it('still captures, and never touches the network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const report = captureError({ error: new Error('boom'), code: 'server_route' })

    expect(report.errorRef).toMatch(/^err_[0-9a-f]{12}$/)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never throws, whatever it is handed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => captureError({ error: undefined, code: 'x' })).not.toThrow()
    expect(() => captureError({ error: 'a string', code: '!! not a code !!' })).not.toThrow()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => captureError({ error: circular, code: 'x' })).not.toThrow()
  })

  it('falls back to a safe bucket for a code it does not recognise', () => {
    const report = buildReport({ error: new Error('x'), code: 'Robert"); DROP--' }, monitoringConfig())
    expect(report.code).toBe('unclassified')
  })
})

describe('alert configuration', () => {
  it('refuses a non-https or unparseable webhook rather than using it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.MONITORING_ALERT_WEBHOOK_URL = 'http://hooks.example.com/x'
    expect(monitoringConfig().alertWebhookUrl).toBeNull()
    process.env.MONITORING_ALERT_WEBHOOK_URL = 'not a url'
    expect(monitoringConfig().alertWebhookUrl).toBeNull()
    process.env.MONITORING_ALERT_WEBHOOK_URL = 'https://hooks.example.com/x'
    expect(monitoringConfig().alertWebhookUrl).toBe('https://hooks.example.com/x')
  })

  it('trims the trailing newline a secret store adds', () => {
    process.env.MONITORING_ALERT_WEBHOOK_URL = 'https://hooks.example.com/x\n'
    expect(monitoringConfig().alertWebhookUrl).toBe('https://hooks.example.com/x')
  })

  it('stays off inside the test suite even when a URL is set', () => {
    // A suite that can post to a webhook is a suite that can page somebody.
    process.env.MONITORING_ALERT_WEBHOOK_URL = 'https://hooks.example.com/x'
    expect(alertingEnabled(monitoringConfig())).toBe(false)
  })
})

describe('alert delivery', () => {
  const report = () => buildReport({ error: new Error('boom'), code: 'server_route' }, monitoringConfig())

  it('posts the payload once and then dedupes the same failure', async () => {
    const calls: { url: string; body: string }[] = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    const first = report()
    expect(await sendAlert('https://hooks.example.com/x', first, fakeFetch)).toBe(true)
    const second = buildReport({ error: new Error('boom'), code: 'server_route' }, monitoringConfig())
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(await sendAlert('https://hooks.example.com/x', second, fakeFetch)).toBe(false)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ report: { errorRef: first.errorRef } })
  })

  it('swallows a dead sink instead of turning it into a second failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing = (() => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(sendAlert('https://hooks.example.com/x', report(), throwing)).resolves.toBe(false)
  })

  it('leaves the stack behind when it sends', () => {
    const payload = buildAlertPayload(report())
    expect(Object.hasOwn(payload.report, 'stack')).toBe(false)
  })

  it('fingerprints identical failures the same and different ones differently', () => {
    expect(fingerprintOf('TypeError', 'a', 'x')).toBe(fingerprintOf('TypeError', 'a', 'x'))
    expect(fingerprintOf('TypeError', 'a', 'x')).not.toBe(fingerprintOf('RangeError', 'a', 'x'))
    expect(shouldAlert('abc')).toBe(true)
    expect(shouldAlert('abc')).toBe(false)
  })
})

describe('report endpoint budget', () => {
  it('admits exactly the ceiling per window, then refuses', () => {
    const now = 1_700_000_000_000
    for (let i = 0; i < REPORT_LIMIT_PER_WINDOW; i += 1) {
      expect(consumeReportBudget('v4:203.0.113.9', now).allowed).toBe(true)
    }
    const refused = consumeReportBudget('v4:203.0.113.9', now)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    // A different caller has their own budget, and the next window resets.
    expect(consumeReportBudget('v4:198.51.100.4', now).allowed).toBe(true)
    expect(consumeReportBudget('v4:203.0.113.9', now + 60_001).allowed).toBe(true)
  })
})
