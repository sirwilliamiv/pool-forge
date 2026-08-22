import { FRAME_MS, INPUT_SAMPLE_RATE, OUTPUT_SAMPLE_RATE } from '../config'

// Microphone in, model out.
//
// Two AudioContexts, deliberately: the Live API wants 16 kHz in and produces
// 24 kHz out, and letting each context run at its native rate means the browser
// does the resampling in C++ rather than us doing it badly in JavaScript.

/** Samples per upstream frame, derived so the worklet and the socket agree. */
export const FRAME_SAMPLES = Math.round((INPUT_SAMPLE_RATE * FRAME_MS) / 1000)

const WORKLET_URL = '/voice/capture-worklet.js'

export interface CaptureHandle {
  stop(): Promise<void>
}

/**
 * Start capturing.
 *
 * **Must be called from inside a user gesture.** A context created on mount is
 * suspended by autoplay policy and produces a session that looks connected and
 * hears nothing, with no error anywhere.
 */
export async function startCapture(onFrame: (frame: ArrayBuffer) => void): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // The model is listening to a person in a room, not to a recording.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const context = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
  try {
    await context.audioWorklet.addModule(WORKLET_URL)
  } catch (error) {
    stopStream(stream)
    await context.close()
    throw error
  }

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'pool-forge-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: { frameSamples: FRAME_SAMPLES },
  })
  node.port.onmessage = event => onFrame(event.data as ArrayBuffer)
  source.connect(node)

  return {
    async stop() {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stopStream(stream)
      await context.close()
    },
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

/**
 * Playback for the model's voice.
 *
 * Chunks are scheduled back to back rather than played on arrival, because a
 * gap between two buffers is audible as a click and the model sends audio faster
 * than real time.
 */
export class VoicePlayback {
  private context: AudioContext | null = null
  private nextStartTime = 0
  private playing = new Set<AudioBufferSourceNode>()

  /** Construct the context here, inside the click handler that started the session. */
  open(): void {
    if (this.context) return
    this.context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE })
    this.nextStartTime = 0
  }

  enqueue(pcm16: ArrayBuffer): void {
    const context = this.context
    if (!context || pcm16.byteLength === 0) return

    const samples = new Int16Array(pcm16)
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) {
      channel[i] = (samples[i] ?? 0) / 0x8000
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)

    // A small lead so the first chunk is not scheduled in the past, which the
    // browser plays immediately and out of order with what follows.
    const startAt = Math.max(this.nextStartTime, context.currentTime + 0.02)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration

    this.playing.add(source)
    source.onended = () => this.playing.delete(source)
  }

  /**
   * Barge-in: drop everything queued.
   *
   * A model that keeps talking over someone who has started speaking feels
   * broken inside one turn, and the audio already scheduled is a reply to a
   * sentence the user has abandoned.
   */
  flush(): void {
    for (const source of this.playing) {
      try {
        source.stop()
      } catch {
        // Already finished; the point was that it stops making sound.
      }
    }
    this.playing.clear()
    this.nextStartTime = this.context?.currentTime ?? 0
  }

  async close(): Promise<void> {
    this.flush()
    const context = this.context
    this.context = null
    await context?.close()
  }
}
