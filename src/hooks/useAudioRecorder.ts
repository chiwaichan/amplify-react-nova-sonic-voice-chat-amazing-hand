import { useRef, useCallback, useState } from 'react';
import { float32ToPcm16, resampleAudio, uint8ArrayToBase64 } from '../utils/audioUtils';

const TARGET_SAMPLE_RATE = 16000; // Nova Sonic requires 16kHz

// Inline AudioWorklet processor code to avoid CORS/loading issues
const audioWorkletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage({
            type: 'audio',
            audioData: this.buffer.slice(0)
          });
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;

interface UseAudioRecorderOptions {
  onAudioData?: (base64Audio: string) => void;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const { onAudioData } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sourceSampleRateRef = useRef<number>(48000);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      console.log('[AudioRecorder] Starting recording...');

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not available. Please use HTTPS or localhost.');
      }

      // List available audio devices for debugging
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        console.log('[AudioRecorder] Available audio input devices:', audioInputs.length);
        audioInputs.forEach((d, i) => console.log(`  [${i}] ${d.label || 'Unnamed device'} (${d.deviceId.substring(0, 8)}...)`));
        if (audioInputs.length === 0) {
          throw new Error('No microphone detected. Please connect a microphone.');
        }
      } catch (enumError) {
        console.warn('[AudioRecorder] Could not enumerate devices:', enumError);
      }

      // Request microphone access
      console.log('[AudioRecorder] Requesting microphone access...');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: TARGET_SAMPLE_RATE },
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (mediaError: any) {
        console.error('[AudioRecorder] getUserMedia error:', mediaError);
        if (mediaError.name === 'NotFoundError' || mediaError.message?.includes('not be found')) {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
          throw new Error('Microphone access denied. Please allow microphone access in browser settings.');
        } else if (mediaError.name === 'NotReadableError') {
          throw new Error('Microphone is in use by another application.');
        }
        throw mediaError;
      }
      console.log('[AudioRecorder] Microphone access granted');
      streamRef.current = stream;

      // Create audio context
      console.log('[AudioRecorder] Creating AudioContext...');
      const audioContext = new AudioContext();
      console.log('[AudioRecorder] AudioContext created, sampleRate:', audioContext.sampleRate);
      audioContextRef.current = audioContext;
      sourceSampleRateRef.current = audioContext.sampleRate;

      // Load AudioWorklet processor using inline Blob URL (avoids CORS issues)
      const blob = new Blob([audioWorkletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      console.log('[AudioRecorder] Loading AudioWorklet from blob URL');
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl); // Clean up blob URL after loading
      console.log('[AudioRecorder] AudioWorklet loaded successfully');

      // Create source node from microphone stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // Create worklet node
      const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');
      workletNodeRef.current = workletNode;

      // Handle audio data from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && onAudioData) {
          const audioData = event.data.audioData as Float32Array;

          // Resample to 16kHz if needed
          const resampledData = resampleAudio(
            audioData,
            sourceSampleRateRef.current,
            TARGET_SAMPLE_RATE
          );

          // Convert to 16-bit PCM
          const pcmData = float32ToPcm16(resampledData);

          // Encode to base64 and send
          const base64Audio = uint8ArrayToBase64(pcmData);
          onAudioData(base64Audio);
        }
      };

      // Connect nodes: microphone -> worklet
      sourceNode.connect(workletNode);
      // Don't connect to destination (we don't want to hear ourselves)

      setIsRecording(true);
    } catch (err) {
      console.error('[AudioRecorder] Error starting recording:', err);
      const message = err instanceof Error ? `${err.name}: ${err.message}` : 'Failed to start recording';
      setError(message);
    }
  }, [onAudioData]);

  const stopRecording = useCallback(() => {
    console.log('[AudioRecorder] stopRecording called');
    // Disconnect and clean up worklet node
    if (workletNodeRef.current) {
      console.log('[AudioRecorder] Disconnecting worklet node');
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Disconnect source node
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    console.log('[AudioRecorder] Recording stopped');
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
  };
}
