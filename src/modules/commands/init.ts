// Side-effect imports: each module calls `register()` for its commands at load time.
// Module caching guarantees each import runs exactly once per process, so callers
// can invoke `initCommands()` repeatedly without re-registration errors.
import './categories/project'
import './categories/canvas'
import './categories/shape'
import './categories/measurement'
import './categories/pricing'
import './categories/validation'
import './categories/export'
import './categories/template'
import './categories/auth'
import './categories/settings'

let _initialized = false

export function initCommands(): void {
  // Imports above already ran when this module loaded. The flag exists so
  // call sites can express intent ("I depend on the registry being ready")
  // and so future hot-reload paths can extend behavior here.
  _initialized = true
}

export function isInitialized(): boolean {
  return _initialized
}
