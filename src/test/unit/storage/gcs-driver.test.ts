/** @vitest-environment node */
// Choosing the Cloud Storage driver, and refusing to guess.
//
// The local driver on Cloud Run is not storage, it is a cache that behaves like
// storage until the first restart takes a signed proposal with it. This is the
// selection logic that avoids that, and the refusals that stop it going wrong
// quietly.

import { beforeEach, describe, expect, it } from 'vitest'

import { GcsBlobStore, getBlobStore, resetBlobStore } from '@/modules/storage'

const ORIGINAL = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL }
  resetBlobStore()
})

describe('picking a driver', () => {
  it('defaults to local, so nothing changes for a laptop', () => {
    delete process.env.BLOB_STORE_DRIVER
    expect(getBlobStore()).not.toBeInstanceOf(GcsBlobStore)
  })

  it('uses Cloud Storage when asked, with a named bucket', () => {
    process.env.BLOB_STORE_DRIVER = 'gcs'
    process.env.BLOB_STORE_BUCKET = 'pool-forge-blobs'
    expect(getBlobStore()).toBeInstanceOf(GcsBlobStore)
  })

  it('refuses to start rather than guess a bucket name', () => {
    // A bucket derived from a project id would silently write a builder's
    // documents into whatever that resolved to.
    process.env.BLOB_STORE_DRIVER = 'gcs'
    delete process.env.BLOB_STORE_BUCKET
    expect(() => getBlobStore()).toThrow(/no bucket is named/i)
  })

  it('refuses a driver it does not have', () => {
    process.env.BLOB_STORE_DRIVER = 's3'
    expect(() => getBlobStore()).toThrow(/Unsupported/i)
  })

  it('refuses an empty bucket name at construction', () => {
    expect(() => new GcsBlobStore({ bucket: '   ' })).toThrow(/bucket name is required/i)
  })
})
