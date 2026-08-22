// Microphone capture for the voice agent.
//
// Runs on the audio thread so a busy React render cannot stall capture, which on
// the main thread shows up as clipped words rather than as jank.
//
// The frame length arrives in processorOptions rather than being written here:
// the value belongs to src/modules/voice/config.ts, and a second copy would
// drift the moment one of them changed.

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const frameSamples = options?.processorOptions?.frameSamples
    this.frameSamples = typeof frameSamples === 'number' && frameSamples > 0 ? frameSamples : 512
    this.buffer = new Int16Array(this.frameSamples)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      // Float32 [-1, 1] to PCM16. Clamp first: values slightly outside the range
      // are normal after gain, and wrapping them turns a loud word into a click.
      const sample = Math.max(-1, Math.min(1, channel[i]))
      this.buffer[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff

      if (this.filled === this.frameSamples) {
        // Copy: the buffer is reused immediately and the message is structured-
        // cloned asynchronously.
        const frame = new Int16Array(this.buffer)
        this.port.postMessage(frame.buffer, [frame.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('pool-forge-capture', CaptureProcessor)
