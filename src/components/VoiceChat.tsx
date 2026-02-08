import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useNovaSonic } from '../hooks/useNovaSonic';
import type { ToolUseEvent } from '../hooks/useNovaSonic';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { publishSentence, getIoTEndpoint, IOT_TOPIC } from '../utils/iotPublisher';
import { HandAnimation } from './HandAnimation';
import './VoiceChat.css';

interface ActionLogEntry {
  id: string;
  type: 'intent' | 'publish' | 'status' | 'error';
  message: string;
  timestamp: number;
  detail?: string;
}

let actionIdCounter = 0;

export function VoiceChat() {
  const [statusText, setStatusText] = useState('Click mic to start talking');
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [iotEndpoint, setIotEndpoint] = useState<string>('resolving...');
  const [pendingRecord, setPendingRecord] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const addAction = useCallback((type: ActionLogEntry['type'], message: string, detail?: string) => {
    const entry: ActionLogEntry = {
      id: `action-${++actionIdCounter}`,
      type,
      message,
      timestamp: Date.now(),
      detail,
    };
    setActionLog((prev) => [...prev, entry]);
  }, []);

  const { stop: stopAudio, isPlaying } = useAudioPlayer();

  const handleToolUse = useCallback(async (event: ToolUseEvent): Promise<string> => {
    console.log('[VoiceChat] Tool use event:', event);

    try {
      const input = JSON.parse(event.content);
      const sentence = input.sentence as string;

      try {
        await publishSentence(sentence);
        addAction('status', `Sending instructions to hands to sign: ${sentence}`);
      } catch (iotErr: any) {
        addAction('error', `IoT publish failed: ${iotErr?.message || 'Unknown error'}`);
      }

      return JSON.stringify({
        status: 'success',
        sentence,
      });
    } catch (err: any) {
      addAction('error', `Tool error: ${err?.message || 'Failed to process'}`);
      return JSON.stringify({ status: 'error', error: err?.message || 'Failed to process tool input' });
    }
  }, [addAction]);

  const {
    sessionState,
    startSession,
    sendAudio,
    stopAudioInput,
    endSession,
    transcripts,
  } = useNovaSonic({
    onAudioOutput: () => {
      // Discard assistant audio — we only need the cleaned text via tool use
    },
    onError: (error) => {
      console.error('Nova Sonic error:', error);
      const isTimeout = typeof error === 'string' && error.toLowerCase().includes('timed out');
      if (isTimeout) {
        console.log('[VoiceChat] Session timed out (idle). Click mic to reconnect.');
        setStatusText('Session timed out. Click mic to reconnect.');
      } else {
        setStatusText(`Error: ${error}`);
      }
    },
    onToolUse: handleToolUse,
  });

  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder({
    onAudioData: (base64Audio) => {
      sendAudio(base64Audio);
    },
  });

  // Auto-scroll to bottom when transcripts or action log change
  useLayoutEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcripts, actionLog]);

  // Update status text based on state
  useEffect(() => {
    if (recorderError) {
      setStatusText(`Microphone error: ${recorderError}`);
    } else if (sessionState === 'connecting') {
      setStatusText('Connecting...');
    } else if (sessionState === 'error') {
      setStatusText('Connection error. Click mic to reconnect.');
    } else if (isRecording) {
      setStatusText('Listening... (click mic to send)');
    } else if (isPlaying) {
      setStatusText('Assistant speaking...');
    } else if (sessionState === 'connected') {
      setStatusText('Click mic to start talking');
    } else {
      setStatusText('Click mic to start talking');
    }
  }, [sessionState, isRecording, isPlaying, recorderError]);

  // Cleanup on unmount (no auto-connect on load to save Bedrock costs)
  useEffect(() => {
    return () => {
      console.log('[VoiceChat] Cleanup - ending session');
      endSession();
    };
  }, []);

  // Auto-start recording once session connects after mic click
  useEffect(() => {
    if (pendingRecord && sessionState === 'connected') {
      setPendingRecord(false);
      console.log('[VoiceChat] Session connected, auto-starting recording');
      stopAudio();
      startRecording();
    }
  }, [pendingRecord, sessionState, startRecording, stopAudio]);

  // Resolve IoT endpoint on mount
  useEffect(() => {
    getIoTEndpoint()
      .then((ep) => setIotEndpoint(ep))
      .catch(() => setIotEndpoint('unavailable'));
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

    // If not connected, connect first then auto-record once connected
    if (sessionState !== 'connected') {
      if (sessionState === 'disconnected' || sessionState === 'error') {
        setPendingRecord(true);
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

  const getActionIcon = (type: ActionLogEntry['type']) => {
    switch (type) {
      case 'intent': return '\u{1F9E0}';
      case 'publish': return '\u{1F4E4}';
      case 'status': return '\u2705';
      case 'error': return '\u274C';
    }
  };

  return (
    <div className="voice-chat">
      <div className="status-bar">
        <span className={getStatusIndicatorClass()}></span>
        <span className="status-text">
          {sessionState === 'connected' ? 'Connected' : sessionState}
        </span>
      </div>

      <div className="iot-info">
        <span>Endpoint: {iotEndpoint}</span>
        <span>Topic: {IOT_TOPIC}</span>
      </div>

      <HandAnimation />

      <div className="transcript-area" ref={transcriptRef}>
        {transcripts.length === 0 && actionLog.length === 0 ? (
          <p className="placeholder-text">
            Speak and your words will be cleaned and sent to IoT...
          </p>
        ) : (
          <>
            {transcripts.filter((t) => t.role === 'user').map((t, index) => (
              <div key={`t-${index}`} className={`transcript-message ${t.role}`}>
                <span className="role-label">You</span>
                <p className="message-content">{t.content}</p>
              </div>
            ))}
            {actionLog.map((entry) => (
              <div key={entry.id} className={`action-entry action-${entry.type}`}>
                <span className="action-icon">{getActionIcon(entry.type)}</span>
                <div className="action-content">
                  <span className="action-message">{entry.message}</span>
                  {entry.detail && <span className="action-detail">{entry.detail}</span>}
                </div>
              </div>
            ))}
          </>
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
