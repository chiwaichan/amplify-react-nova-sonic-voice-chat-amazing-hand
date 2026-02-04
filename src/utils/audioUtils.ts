/**
 * Audio utility functions for PCM encoding/decoding and resampling
 */

/**
 * Convert Float32Array audio data to 16-bit PCM Uint8Array
 * @param float32Array - Audio samples in range [-1, 1]
 * @returns Uint8Array of 16-bit PCM data (little-endian)
 */
export function float32ToPcm16(float32Array: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] range
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    // Convert to 16-bit signed integer
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return new Uint8Array(pcm16.buffer);
}

/**
 * Convert 16-bit PCM Uint8Array to Float32Array
 * @param pcm16 - 16-bit PCM data (little-endian)
 * @returns Float32Array of audio samples in range [-1, 1]
 */
export function pcm16ToFloat32(pcm16: Uint8Array): Float32Array {
  const int16Array = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength / 2);
  const float32Array = new Float32Array(int16Array.length);

  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }

  return float32Array;
}

/**
 * Resample audio data from source sample rate to target sample rate
 * Uses linear interpolation for simplicity
 * @param audioData - Float32Array of audio samples
 * @param sourceSampleRate - Original sample rate (e.g., 48000)
 * @param targetSampleRate - Target sample rate (e.g., 16000)
 * @returns Resampled Float32Array
 */
export function resampleAudio(
  audioData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return audioData;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Linear interpolation
    result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
  }

  return result;
}

/**
 * Encode Uint8Array to base64 string
 * @param uint8Array - Data to encode
 * @returns Base64 encoded string
 */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Uint8Array
 * @param base64 - Base64 encoded string
 * @returns Decoded Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * Create an audio buffer from PCM data for playback
 * @param audioContext - Web Audio API AudioContext
 * @param pcmData - 16-bit PCM data
 * @param sampleRate - Sample rate of the PCM data
 * @returns AudioBuffer ready for playback
 */
export function createAudioBufferFromPcm(
  audioContext: AudioContext,
  pcmData: Uint8Array,
  sampleRate: number
): AudioBuffer {
  const float32Data = pcm16ToFloat32(pcmData);
  const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
  audioBuffer.getChannelData(0).set(float32Data);
  return audioBuffer;
}
