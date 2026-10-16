import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConverterFailedError, ConverterMissingError, getStencilConverter, runConverter, setStencilConverter } from '@/modules/imports/visio/convert'
import { ERROR_REF_PATTERN } from '@/modules/imports/ingest/errors'

function script(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'visio-convert-'))
  const path = join(dir, 'fake-vss2raw')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('runConverter', () => {
  afterEach(() => setStencilConverter(null))

  it('hands the file path to the binary and returns its stdout', async () => {
    const bin = script('printf "startDocument()\\n"; wc -c < "$1"')
    const out = await runConverter(Buffer.from('twelve bytes'), { bin })
    expect(out.startsWith('startDocument()')).toBe(true)
    expect(out).toContain('12')
  })

  it('reports a missing binary as ConverterMissingError', async () => {
    await expect(runConverter(Buffer.from('x'), { bin: '/nonexistent/vss2raw' })).rejects.toBeInstanceOf(ConverterMissingError)
  })

  it('reports a non-zero exit as ConverterFailedError with a ref and without stderr', async () => {
    const bin = script('echo "secret path /Users/someone/file" >&2; exit 3')
    const err = await runConverter(Buffer.from('x'), { bin }).catch(e => e)
    expect(err).toBeInstanceOf(ConverterFailedError)
    expect(err.ref).toMatch(ERROR_REF_PATTERN)
    expect(String(err.message)).not.toContain('/Users/someone')
  })

  it('kills a hung converter after the timeout', async () => {
    const bin = script('sleep 5')
    await expect(runConverter(Buffer.from('x'), { bin, timeoutMs: 200 })).rejects.toBeInstanceOf(ConverterFailedError)
  })

  it('the seam replaces the default and null restores it', async () => {
    const fake = async () => ({ candidates: [], skipped: [] })
    setStencilConverter(fake)
    expect(getStencilConverter()).toBe(fake)
    setStencilConverter(null)
    expect(getStencilConverter()).not.toBe(fake)
  })
})
