// A VisionClient that replays recorded responses.
//
// This is the default path everywhere except a run with `VERTEX_LIVE=1`.
// Billing is not linked on the target GCP project yet, and even once it is, the
// test suite and the eval harness replay fixtures rather than spending money
// and picking up model drift on every run.

import type { VisionCallRequest, VisionCallResult, VisionClient } from './client'
import type { VisionUsage } from './types'

export interface RecordedResponse {
  text: string
  usage?: Partial<VisionUsage>
  /** Thrown instead of returned, to exercise the retry and error paths. */
  error?: unknown
}

export interface RecordedClient extends VisionClient {
  /** Every request the code under test issued, in order. */
  readonly requests: VisionCallRequest[]
  readonly callCount: number
}

function usageFor(model: string, partial: Partial<VisionUsage> | undefined): VisionUsage {
  return {
    model: partial?.model ?? model,
    tokensIn: partial?.tokensIn ?? 0,
    tokensOut: partial?.tokensOut ?? 0,
    latencyMs: partial?.latencyMs ?? 0,
    calls: 1,
  }
}

/**
 * Replay responses in order. Running past the end throws, which is what makes
 * "the repair round-trip fires exactly once" testable: queue two responses and
 * a third call fails loudly instead of silently looping.
 */
export function createRecordedClient(responses: (RecordedResponse | string)[]): RecordedClient {
  const queue = responses.map((entry) => (typeof entry === 'string' ? { text: entry } : entry))
  const requests: VisionCallRequest[] = []
  let index = 0

  return {
    requests,
    get callCount() {
      return index
    },
    async generate(request: VisionCallRequest): Promise<VisionCallResult> {
      requests.push(request)
      const response = queue[index]
      index += 1
      if (response === undefined) {
        throw new Error(`recorded client exhausted after ${queue.length} responses; call ${index} was not expected`)
      }
      if (response.error !== undefined) throw response.error
      return { text: response.text, usage: usageFor(request.model, response.usage) }
    },
  }
}
