import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useNovaSonic } from '../hooks/useNovaSonic';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import './VoiceChat.css';

export function VoiceChat() {
  const [statusText, setStatusText] = useState('Click mic to start talking');
  const hasStartedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const { queueAudio, stop: stopAudio, isPlaying } = useAudioPlayer();

  const {
    sessionState,
    startSession,
    sendAudio,
    stopAudioInput,
    endSession,
    transcripts,
  } = useNovaSonic({
    onAudioOutput: (base64Audio) => {
      queueAudio(base64Audio);
    },
    onError: (error) => {
      console.error('Nova Sonic error:', error);
      setStatusText(`Error: ${error}`);
    },
  });

  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder({
    onAudioData: (base64Audio) => {
      sendAudio(base64Audio);
    },
  });

  // Auto-scroll to bottom when transcripts change
  useLayoutEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Update status text based on state
  useEffect(() => {
    if (recorderError) {
      setStatusText(`Microphone error: ${recorderError}`);
    } else if (sessionState === 'connecting') {
      setStatusText('Connecting...');
    } else if (sessionState === 'error') {
      setStatusText('Connection error. Click mic to reconnect.');
    } else if (isRecording) {
      setStatusText('🎤 Listening... (click mic to send)');
    } else if (isPlaying) {
      setStatusText('🔊 Assistant speaking...');
    } else if (sessionState === 'connected') {
      setStatusText('Click mic to start talking');
    } else {
      setStatusText('Click mic to start talking');
    }
  }, [sessionState, isRecording, isPlaying, recorderError]);

  // Initialize session on mount
  useEffect(() => {
    console.log('[VoiceChat] Mount effect running, hasStarted:', hasStartedRef.current);
    if (hasStartedRef.current) {
      console.log('[VoiceChat] Skipping duplicate session start (StrictMode)');
      return;
    }
    hasStartedRef.current = true;
    console.log('[VoiceChat] Calling startSession...');
    startSession().then(() => {
      console.log('[VoiceChat] startSession completed');
    }).catch((err) => {
      console.error('[VoiceChat] startSession error:', err);
    });

    return () => {
      console.log('[VoiceChat] Cleanup - ending session');
      hasStartedRef.current = false;
      endSession();
    };
  }, []);

  // Toggle recording on click
  const handleMicClick = useCallback(async () => {
    // If currently recording, stop
    if (isRecording) {
      console.log('[VoiceChat] Stopping recording');
      stopRecording();
      stopAudioInput();
      return;
    }

    // If not connected, try to reconnect
    if (sessionState !== 'connected') {
      if (sessionState === 'disconnected' || sessionState === 'error') {
        await startSession();
      }
      return;
    }

    // Start recording
    console.log('[VoiceChat] Starting recording');
    stopAudio(); // Stop any playing audio when user starts speaking
    await startRecording();
  }, [isRecording, sessionState, startSession, startRecording, stopRecording, stopAudioInput, stopAudio]);

  const getStatusIndicatorClass = () => {
    switch (sessionState) {
      case 'connected':
        return 'status-indicator connected';
      case 'connecting':
        return 'status-indicator connecting';
      case 'error':
        return 'status-indicator error';
      default:
        return 'status-indicator disconnected';
    }
  };

  const getMicButtonClass = () => {
    let classes = 'mic-button';
    if (isRecording) {
      classes += ' recording';
    }
    if (isPlaying) {
      classes += ' playing';
    }
    if (sessionState !== 'connected' && sessionState !== 'error' && sessionState !== 'disconnected') {
      classes += ' disabled';
    }
    return classes;
  };

  return (
    <div className="voice-chat">
      <div className="status-bar">
        <span className={getStatusIndicatorClass()}></span>
        <span className="status-text">
          {sessionState === 'connected' ? 'Connected' : sessionState}
        </span>
      </div>

      <div className="transcript-area" ref={transcriptRef}>
        {transcripts.length === 0 ? (
          <p className="placeholder-text">
            Your conversation will appear here...
          </p>
        ) : (
          transcripts.map((t, index) => (
            <div key={index} className={`transcript-message ${t.role}`}>
              <span className="role-label">
                {t.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <p className="message-content">{t.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="controls">
        <p className={`instruction-text ${isRecording ? 'listening' : ''} ${isPlaying ? 'speaking' : ''}`}>
          {statusText}
        </p>

        <button
          className={getMicButtonClass()}
          onClick={handleMicClick}
          onContextMenu={(e) => e.preventDefault()}
          disabled={sessionState === 'connecting'}
        >
          <svg
            className="mic-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="48"
            height="48"
          >
            {isRecording ? (
              // Stop icon when recording
              <rect x="6" y="6" width="12" height="12" rx="2" />
            ) : (
              // Mic icon when not recording
              <>
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
