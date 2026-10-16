// Runs `vss2raw` (libvisio-tools) on an uploaded stencil and hands its text to
// the pure pipeline.
//
// The binary only reads files, so the bytes go to a private temp directory that
// is removed whatever happens. Nothing the process prints on stderr reaches a
// caller: it is logged under an `err_` ref and the caller gets
// `VisioMessage.CONVERT_FAILED` plus that ref.

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { logIngestFailure } from '@/modules/imports/ingest/errors'

import { previewFromRaw } from './pipeline'
import {
  CONVERTER_MAX_OUTPUT_BYTES,
  CONVERTER_TIMEOUT_MS,
  VISIO_CONVERTER_BIN_ENV,
  VISIO_CONVERTER_DEFAULT_BIN,
  VisioMessage,
  type ConversionResult,
} from './types'

const execFileAsync = promisify(execFile)

const TEMP_PREFIX = 'pool-forge-visio-'
const TEMP_FILE_NAME = 'stencil.vss'
const STDERR_LOG_LIMIT = 2000
const ENOENT = 'ENOENT'
const LOG_SCOPE = 'visio.convert'

/** The converter binary is not installed on this server. */
export class ConverterMissingError extends Error {
  constructor() {
    super(VisioMessage.CONVERTER_MISSING)
    this.name = 'ConverterMissingError'
  }
}

/** The converter ran and failed. The message is safe to show; the detail is in the log under `ref`. */
export class ConverterFailedError extends Error {
  readonly ref: string
  constructor(ref: string) {
    super(`${VisioMessage.CONVERT_FAILED} (ref ${ref}).`)
    this.name = 'ConverterFailedError'
    this.ref = ref
  }
}

export interface RunConverterOptions {
  bin?: string
  timeoutMs?: number
}

function defaultBin(): string {
  return process.env[VISIO_CONVERTER_BIN_ENV]?.trim() || VISIO_CONVERTER_DEFAULT_BIN
}

interface ExecFailure {
  code?: unknown
  signal?: unknown
  killed?: unknown
  stderr?: unknown
}

/** Spawns the binary on a temp file. Rejects with the two errors above and nothing else. */
export async function runConverter(bytes: Buffer, opts?: RunConverterOptions): Promise<string> {
  const bin = opts?.bin ?? defaultBin()
  const timeout = opts?.timeoutMs ?? CONVERTER_TIMEOUT_MS
  let dir: string | null = null
  let spawned = false
  try {
    dir = await mkdtemp(join(tmpdir(), TEMP_PREFIX))
    const path = join(dir, TEMP_FILE_NAME)
    await writeFile(path, bytes)
    spawned = true
    const { stdout } = await execFileAsync(bin, [path], {
      timeout,
      maxBuffer: CONVERTER_MAX_OUTPUT_BYTES,
      encoding: 'utf8',
    })
    return stdout
  } catch (err) {
    const failure = (err ?? {}) as ExecFailure
    // ENOENT from the spawn is a missing binary; from the temp file it is a server fault like any other.
    if (spawned && failure.code === ENOENT) throw new ConverterMissingError()
    const ref = logIngestFailure(LOG_SCOPE, {
      code: failure.code,
      signal: failure.signal,
      killed: failure.killed,
      stderr: String(failure.stderr ?? '').slice(0, STDERR_LOG_LIMIT),
    })
    throw new ConverterFailedError(ref)
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export type StencilConverter = (bytes: Buffer, fileName: string) => Promise<ConversionResult>

/** The default: `runConverter` then `previewFromRaw`. */
export const convertStencilFile: StencilConverter = async (bytes, fileName) =>
  previewFromRaw(await runConverter(bytes), { fileName })

let override: StencilConverter | null = null

/** Test seam. `null` restores the default. */
export function setStencilConverter(fn: StencilConverter | null): void {
  override = fn
}

export function getStencilConverter(): StencilConverter {
  return override ?? convertStencilFile
}
