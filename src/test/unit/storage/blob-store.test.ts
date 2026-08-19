import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LocalDiskBlobStore } from '@/modules/storage/local-disk'
import {
  BlobNotFoundError,
  InvalidStorageKeyError,
  extensionForMimeType,
  isStorageKey,
  storageKeyFor,
} from '@/modules/storage/types'
import { decodeDataUrl } from '@/modules/storage/data-url'

let root: string
let store: LocalDiskBlobStore

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'poolforge-blobs-'))
  store = new LocalDiskBlobStore(root)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe('storage keys', () => {
  it('shards by the first two sha256 byte pairs and keeps the mime extension', () => {
    const sha = createHash('sha256').update('hello').digest('hex')
    const key = storageKeyFor(sha, 'image/png')
    expect(key).toBe(`${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}.png`)
    expect(isStorageKey(key)).toBe(true)
  })

  it('omits the extension for an unknown mime type', () => {
    const sha = createHash('sha256').update('hello').digest('hex')
    expect(storageKeyFor(sha, 'application/x-unknown')).toBe(
      `${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`,
    )
    expect(extensionForMimeType('application/x-unknown')).toBeNull()
  })

  it('rejects a non-sha256 digest', () => {
    expect(() => storageKeyFor('not-a-hash', 'image/png')).toThrow()
  })

  it('rejects traversal keys', () => {
    expect(isStorageKey('../../etc/passwd')).toBe(false)
    expect(isStorageKey('ab/cd/../../../etc/passwd')).toBe(false)
  })
})

describe('LocalDiskBlobStore', () => {
  it('round-trips bytes through put and get', async () => {
    const result = await store.put({ data: PNG, mimeType: 'image/png' })
    expect(result.created).toBe(true)
    expect(result.bytes).toBe(PNG.byteLength)
    expect(result.sha256).toBe(createHash('sha256').update(PNG).digest('hex'))
    expect(isStorageKey(result.storageKey)).toBe(true)

    const read = await store.get(result.storageKey)
    expect(read.equals(PNG)).toBe(true)
  })

  it('is content addressed: the same bytes never store twice', async () => {
    const data = randomBytes(64)
    const first = await store.put({ data, mimeType: 'image/jpeg' })
    const second = await store.put({ data, mimeType: 'image/jpeg' })
    expect(second.storageKey).toBe(first.storageKey)
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
  })

  it('shards on disk so no directory grows unbounded', async () => {
    const data = randomBytes(32)
    const { storageKey, sha256 } = await store.put({ data, mimeType: 'image/webp' })
    const shard = sha256.slice(0, 2)
    expect(storageKey.startsWith(`${shard}/`)).toBe(true)
    const top = await readdir(root)
    expect(top).toContain(shard)
  })

  it('reports existence and streams the same bytes', async () => {
    const data = randomBytes(128)
    const { storageKey } = await store.put({ data, mimeType: 'image/png' })
    expect(await store.exists(storageKey)).toBe(true)
    const streamed = await drain(await store.getStream(storageKey))
    expect(streamed.equals(data)).toBe(true)
  })

  it('deletes, and reports missing afterwards', async () => {
    const data = randomBytes(16)
    const { storageKey } = await store.put({ data, mimeType: 'image/png' })
    await store.delete(storageKey)
    expect(await store.exists(storageKey)).toBe(false)
    await expect(store.get(storageKey)).rejects.toBeInstanceOf(BlobNotFoundError)
    await expect(store.getStream(storageKey)).rejects.toBeInstanceOf(BlobNotFoundError)
  })

  it('deleting a missing key is a no-op', async () => {
    const sha = createHash('sha256').update('never-written').digest('hex')
    await expect(store.delete(storageKeyFor(sha, 'image/png'))).resolves.toBeUndefined()
  })

  it('refuses a key that would escape the blob root', async () => {
    await expect(store.get('../../../etc/passwd')).rejects.toBeInstanceOf(InvalidStorageKeyError)
    await expect(store.exists('nope')).rejects.toBeInstanceOf(InvalidStorageKeyError)
  })
})

describe('decodeDataUrl', () => {
  it('decodes a base64 image data URL', () => {
    const url = `data:image/png;base64,${PNG.toString('base64')}`
    const decoded = decodeDataUrl(url)
    expect(decoded?.mimeType).toBe('image/png')
    expect(decoded?.data.equals(PNG)).toBe(true)
  })

  it('rejects plain strings, non-base64 data URLs, and empty payloads', () => {
    expect(decodeDataUrl('https://example.com/x.png')).toBeNull()
    expect(decodeDataUrl('data:text/plain,hello')).toBeNull()
    expect(decodeDataUrl('data:image/png;base64,')).toBeNull()
  })
})
