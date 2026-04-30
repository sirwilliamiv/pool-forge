// Two-phase command dispatch.
//
// Phase 1 — server: POST /api/commands. The route validates input, runs the
// command's `execute`, writes a CommandAuditLog row, and returns the result.
// For commands that mutate client-only Zustand state (camera, sun dial, view
// mode, selection, etc.), the server `execute` is a no-op success: it
// validates and echoes input/sentinels so the audit row records intent.
//
// Phase 2 — client: if a handler has been registered for the command id via
// `registerClientHandler(id, fn)`, it is invoked with (input, serverData) and
// its return value is the final dispatch result. Otherwise the server result
// is returned directly. Handlers are typically registered at module load by
// the consuming track (e.g., a sun-dial component registers
// `sun.set.time` to call `useSunStore.getState().setMinutes(...)`).
//
// Drag-coalescing: do NOT call dispatch() on every keystroke or every
// pointermove. Inspector inputs commit on pointerUp/blur/Enter; sliders use a
// useDebouncedCommit(800ms). The server-side audit log will flood otherwise.

export type DispatchResult<O> =
  | { ok: true; data: O }
  | { ok: false; error: string }

type ClientHandler<I = unknown, O = unknown> = (
  input: I,
  serverData: unknown,
) => O | Promise<O>

const _clientHandlers = new Map<string, ClientHandler>()

export function registerClientHandler<I, O>(
  id: string,
  fn: ClientHandler<I, O>,
): void {
  _clientHandlers.set(id, fn as ClientHandler)
}

export function unregisterClientHandler(id: string): void {
  _clientHandlers.delete(id)
}

export function hasClientHandler(id: string): boolean {
  return _clientHandlers.has(id)
}

export function _resetClientHandlersForTest(): void {
  _clientHandlers.clear()
}

export async function dispatch<I, O>(
  id: string,
  input: I,
): Promise<DispatchResult<O>> {
  let res: Response
  try {
    res = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, input }),
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'network error',
    }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return { ok: false, error: `HTTP ${res.status}: invalid JSON response` }
  }

  if (!res.ok) {
    const err =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${res.status}`
    return { ok: false, error: err }
  }

  if (
    typeof json !== 'object' ||
    json === null ||
    !('ok' in json) ||
    typeof (json as { ok: unknown }).ok !== 'boolean'
  ) {
    return { ok: false, error: 'invalid response shape' }
  }

  const result = json as { ok: boolean; data?: unknown; error?: unknown }
  if (!result.ok) {
    return { ok: false, error: String(result.error ?? 'unknown error') }
  }

  const handler = _clientHandlers.get(id)
  if (!handler) {
    return { ok: true, data: result.data as O }
  }

  try {
    const finalData = (await handler(input, result.data)) as O
    return { ok: true, data: finalData }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'client handler failed',
    }
  }
}
