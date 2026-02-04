/**
 * AudioWorklet processor for capturing raw PCM audio data
 * Runs in a separate audio processing thread for real-time performance
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // Samples to accumulate before sending
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input.length > 0) {
      const channelData = input[0]; // Mono - first channel only

      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];

        // When buffer is full, send it to main thread
        if (this.bufferIndex >= this.bufferSize) {
          // Copy buffer to send (since we'll reuse the buffer)
          this.port.postMessage({
            type: 'audio',
            audioData: this.buffer.slice(0)
          });
          this.bufferIndex = 0;
        }
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
