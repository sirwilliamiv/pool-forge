// @vitest-environment node
//
// Tests for waitlist email templates.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildOperatorNotifyEmail,
  buildThankYouEmail,
  getOperatorEmails,
} from '@/modules/waitlist/emails'

const saved = new Map<string, string | undefined>()
const envVars = ['WAITLIST_OPERATOR_EMAILS']

beforeEach(() => {
  for (const key of envVars) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of envVars) {
    const value = saved.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('buildThankYouEmail', () => {
  it('builds a thank-you email with html and text', () => {
    const email = buildThankYouEmail({
      email: 'builder@example.com',
      name: 'Sam Rivera',
    })

    expect(email.to).toBe('builder@example.com')
    expect(email.subject).toBe("You're on the list — Pool Forge")
    expect(email.text).toContain('Thanks, Sam Rivera')
    expect(email.text).toContain('You are on the list')
    expect(email.html).toBeDefined()
    expect(email.html).toContain('Sam Rivera')
    expect(email.html).toContain('hero-01.gif')
    expect(email.html).toContain('Pool Forge')
  })

  it('uses "there" when name is not provided', () => {
    const email = buildThankYouEmail({
      email: 'anon@example.com',
    })

    expect(email.text).toContain('Thanks, there')
    expect(email.html).toContain('Thanks, there')
  })

  it('escapes HTML in the name', () => {
    const email = buildThankYouEmail({
      email: 'test@example.com',
      name: '<script>alert("xss")</script>',
    })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('uses product editor link when no operator email configured', () => {
    const email = buildThankYouEmail({
      email: 'test@example.com',
    })

    expect(email.html).toContain('See the editor')
    expect(email.html).toContain('pool-forge.com/product/editor')
  })

  it('uses mailto link when operator email is configured', () => {
    process.env.WAITLIST_OPERATOR_EMAILS = 'billy@proedu.me'

    const email = buildThankYouEmail({
      email: 'test@example.com',
    })

    expect(email.html).toContain('Reply to this email')
    expect(email.html).toContain('mailto:billy@proedu.me')
  })
})

describe('buildOperatorNotifyEmail', () => {
  it('builds a notification email with all signup data', () => {
    const email = buildOperatorNotifyEmail('billy@proedu.me', {
      name: 'Sam Rivera',
      company: 'Rivera Pools',
      email: 'sam@riverapools.com',
      phone: '555-0100',
      teamSize: '6-15',
      usesToday: 'spreadsheet',
      note: 'Forty pools a year.',
      source: 'referral',
    })

    expect(email.to).toBe('billy@proedu.me')
    expect(email.subject).toBe('Waitlist: Rivera Pools')
    expect(email.text).toContain('Sam Rivera')
    expect(email.text).toContain('Rivera Pools')
    expect(email.text).toContain('sam@riverapools.com')
    expect(email.text).toContain('555-0100')
    expect(email.text).toContain('6 to 15 people')
    expect(email.text).toContain('Excel or Google Sheets')
    expect(email.text).toContain('Forty pools a year.')
    expect(email.text).toContain('referral')

    expect(email.html).toBeDefined()
    expect(email.html).toContain('Sam Rivera')
    expect(email.html).toContain('Rivera Pools')
  })

  it('uses company name in subject when available', () => {
    const email = buildOperatorNotifyEmail('billy@proedu.me', {
      name: 'Sam',
      company: 'Rivera Pools',
      email: 'sam@riverapools.com',
      phone: undefined,
      teamSize: undefined,
      usesToday: undefined,
      note: undefined,
      source: undefined,
    })

    expect(email.subject).toBe('Waitlist: Rivera Pools')
  })

  it('falls back to name in subject when company not provided', () => {
    const email = buildOperatorNotifyEmail('billy@proedu.me', {
      name: 'Sam Rivera',
      company: undefined,
      email: 'sam@example.com',
      phone: undefined,
      teamSize: undefined,
      usesToday: undefined,
      note: undefined,
      source: undefined,
    })

    expect(email.subject).toBe('Waitlist: Sam Rivera')
  })

  it('falls back to Someone when neither name nor company provided', () => {
    const email = buildOperatorNotifyEmail('billy@proedu.me', {
      name: undefined,
      company: undefined,
      email: 'anon@example.com',
      phone: undefined,
      teamSize: undefined,
      usesToday: undefined,
      note: undefined,
      source: undefined,
    })

    expect(email.subject).toBe('Waitlist: Someone')
    expect(email.text).toContain('Someone just signed up')
  })

  it('escapes HTML in data fields', () => {
    const email = buildOperatorNotifyEmail('billy@proedu.me', {
      name: '<script>alert("xss")</script>',
      company: undefined,
      email: 'test@example.com',
      phone: undefined,
      teamSize: undefined,
      usesToday: undefined,
      note: undefined,
      source: undefined,
    })

    expect(email.html).not.toContain('<script>alert')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

describe('getOperatorEmails', () => {
  it('returns empty array when not configured', () => {
    expect(getOperatorEmails()).toEqual([])
  })

  it('returns configured emails', () => {
    process.env.WAITLIST_OPERATOR_EMAILS = 'billy@proedu.me, second@example.com'
    expect(getOperatorEmails()).toEqual(['billy@proedu.me', 'second@example.com'])
  })
})
