import { describe, expect, it } from 'vitest'
import { sniffVisio } from '@/modules/imports/visio/sniff'
import { VisioContainer } from '@/modules/imports/visio/types'

describe('sniffVisio', () => {
  it('recognises an OLE2 compound document (.vss)', () => {
    expect(sniffVisio(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]))).toBe(VisioContainer.OLE2)
  })
  it('recognises a zip (.vssx)', () => {
    expect(sniffVisio(Buffer.from('PK\u0003\u0004rest of the file', 'latin1'))).toBe(VisioContainer.ZIP)
  })
  it('refuses a PNG renamed .vss, an empty buffer and a short header', () => {
    expect(sniffVisio(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBeNull()
    expect(sniffVisio(Buffer.alloc(0))).toBeNull()
    expect(sniffVisio(Buffer.from([0xd0, 0xcf]))).toBeNull()
  })
})
