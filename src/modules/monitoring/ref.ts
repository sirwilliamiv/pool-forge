// Correlation refs, in the one format this codebase already uses.
//
// `imports/vision`, `imports/ingest` and `imports/intake` each mint an
// `err_<12 hex>` ref, log the real cause against it, and hand the user only the
// ref. Monitoring uses the identical format on purpose: a builder reads one
// string off the screen and `grep err_1a2b3c4d5e6f` finds it wherever it was
// produced, without anyone needing to know which subsystem failed.
//
// This file is imported by client components, so it must stay free of
// `node:crypto` and of anything else that does not exist in a browser.
// `crypto.getRandomValues` is present in browsers, in Node 18+, and in the edge
// runtime, which is every place a ref can be minted.

export const MONITORING_REF_PATTERN = /^err_[0-9a-f]{12}$/

const REF_BYTES = 6

/** `err_` plus exactly 12 lowercase hex characters. */
export function newMonitoringRef(): string {
  const bytes = new Uint8Array(REF_BYTES)
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    // No CSPRNG here means an ancient runtime, not an attack surface: a ref is
    // a log-correlation handle, never a capability. Degrade rather than throw,
    // because the whole point of this module is to work when things are broken.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `err_${hex}`
}

export function isMonitoringRef(value: unknown): value is string {
  return typeof value === 'string' && MONITORING_REF_PATTERN.test(value)
}

/**
 * Use a caller-supplied ref when it is well formed, otherwise mint one.
 *
 * The browser mints its ref before the network is involved, so the fallback
 * screen can show it even when the report POST never lands. The server accepts
 * that ref only after this check, so a hostile client can put nothing into a
 * log line but 12 hex characters.
 */
export function adoptRef(candidate: unknown): string {
  return isMonitoringRef(candidate) ? candidate : newMonitoringRef()
}
