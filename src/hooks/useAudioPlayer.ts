import { useRef, useCallback, useState } from 'react';
import { base64ToUint8Array, createAudioBufferFromPcm } from '../utils/audioUtils';

const OUTPUT_SAMPLE_RATE = 24000; // Nova Sonic outputs 24kHz

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playAudio: (base64Audio: string) => void;
  stop: () => void;
  queueAudio: (base64Audio: string) => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isProcessingQueueRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    return audioContextRef.current;
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;

    const audioContext = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    isProcessingQueueRef.current = true;
    setIsPlaying(true);

    while (audioQueueRef.current.length > 0) {
      const buffer = audioQueueRef.current.shift();
      if (!buffer) continue;

      await new Promise<void>((resolve) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        currentSourceRef.current = source;

        source.onended = () => {
          currentSourceRef.current = null;
          resolve();
        };

        source.start();
      });
    }

    isProcessingQueueRef.current = false;
    setIsPlaying(false);
  }, [getAudioContext]);

  const queueAudio = useCallback(
    (base64Audio: string) => {
      try {
        const audioContext = getAudioContext();
        const pcmData = base64ToUint8Array(base64Audio);
        const audioBuffer = createAudioBufferFromPcm(audioContext, pcmData, OUTPUT_SAMPLE_RATE);

        audioQueueRef.current.push(audioBuffer);

        // Start processing if not already doing so
        if (!isProcessingQueueRef.current) {
          processQueue();
        }
      } catch (err) {
        console.error('Error queuing audio:', err);
      }
    },
    [getAudioContext, processQueue]
  );

  const playAudio = useCallback(
    (base64Audio: string) => {
      // Clear queue and play immediately
      audioQueueRef.current = [];
      queueAudio(base64Audio);
    },
    [queueAudio]
  );

  const stop = useCallback(() => {
    // Clear the queue
    audioQueueRef.current = [];

    // Stop current playback
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }

    isProcessingQueueRef.current = false;
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    playAudio,
    stop,
    queueAudio,
  };
}
