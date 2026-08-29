import '@testing-library/jest-dom/vitest'

// Browser APIs jsdom does not implement.
//
// Radix components measure and position themselves, so a form containing a
// Select throws on render without these and the failure looks like a bug in the
// component under test rather than a gap in the environment.

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

if (typeof globalThis.DOMRect === 'undefined') {
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0
    left = 0
    right = 0
    bottom = 0
    toJSON(): object {
      return this
    }
    static fromRect(): DOMRect {
      return new globalThis.DOMRect()
    }
  } as unknown as typeof DOMRect
}

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
}
