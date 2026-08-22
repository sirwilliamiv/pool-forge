/**
 * Ask the configured Vertex project which Live models it can actually reach.
 *
 * Live API model ids are preview and churn. A retired id fails at connect time
 * with a 404 that reads like a permissions problem, so this answers "is the id
 * wrong or is my access wrong" before anyone debugs the audio path.
 *
 *   pnpm voice:models
 */

import { GoogleGenAI } from '@google/genai'

import { DEFAULT_LIVE_MODEL } from '@/modules/voice/config'

/** Ids worth trying, most preferred first. */
const CANDIDATES = [
  DEFAULT_LIVE_MODEL,
  'gemini-live-2.5-flash-native-audio',
  'gemini-live-2.5-flash',
  'gemini-2.0-flash-live-preview-04-09',
]

async function main(): Promise<void> {
  const project = process.env['GCP_PROJECT_ID']
  const location = process.env['VERTEX_LOCATION'] ?? 'us-central1'

  if (!project) {
    console.error('GCP_PROJECT_ID is not set. Nothing to probe.')
    process.exit(1)
  }

  const client = new GoogleGenAI({ vertexai: true, project, location })
  console.log(`project ${project} \u00b7 location ${location}\n`)

  let reachable = 0
  for (const model of [...new Set(CANDIDATES)]) {
    const result = await probe(client, model)
    console.log(`${result.ok ? 'OK    ' : 'FAILED'}  ${model}${result.detail ? `  ${result.detail}` : ''}`)
    if (result.ok) reachable += 1
  }

  if (reachable === 0) {
    console.error(
      '\nNo Live model connected. Check that ADC is current (gcloud auth application-default login)\n' +
        'and that the Vertex AI API is enabled on this project.',
    )
    process.exit(1)
  }

  console.log(`\n${reachable} reachable. Set VERTEX_LIVE_MODEL to the one you want.`)
}

void main()

/** Open a session and close it immediately: connecting is the whole test. */
async function probe(client: GoogleGenAI, model: string): Promise<{ ok: boolean; detail?: string }> {
  return new Promise(resolve => {
    let settled = false
    const finish = (ok: boolean, detail?: string) => {
      if (settled) return
      settled = true
      resolve(detail === undefined ? { ok } : { ok, detail })
    }

    const timer = setTimeout(() => finish(false, 'timed out after 15s'), 15_000)

    client.live
      .connect({
        model,
        config: { responseModalities: ['AUDIO' as never] },
        callbacks: {
          onopen: () => {},
          onmessage: () => {
            clearTimeout(timer)
            finish(true)
          },
          onerror: (error: unknown) => {
            clearTimeout(timer)
            finish(false, String(error).replace(/\s+/g, ' ').slice(0, 120))
          },
          onclose: (event: { reason?: string }) => {
            clearTimeout(timer)
            finish(false, (event.reason ?? 'closed').replace(/\s+/g, ' ').slice(0, 120))
          },
        },
      })
      .then(session => {
        // setupComplete arrives on its own; give it a moment, then tidy up.
        setTimeout(() => {
          try {
            session.close()
          } catch {
            // Already closed by the error path.
          }
        }, 3_000)
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        finish(false, String(error).replace(/\s+/g, ' ').slice(0, 120))
      })
  })
}
