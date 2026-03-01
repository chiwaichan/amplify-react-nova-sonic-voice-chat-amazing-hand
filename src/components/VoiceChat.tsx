import { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useNovaSonic } from '../hooks/useNovaSonic';
import type { ToolUseEvent } from '../hooks/useNovaSonic';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useHandStream } from '../hooks/useHandStream';
import { publishSentence, getIoTEndpoint, IOT_TOPIC } from '../utils/iotPublisher';
import { HandAnimation } from './HandAnimation';
import type { FingerAngles } from './HandAnimation';
import './VoiceChat.css';

interface ActionLogEntry {
  id: string;
  type: 'intent' | 'publish' | 'status' | 'error';
  message: string;
  timestamp: number;
  detail?: string;
}

type FeedItem =
  | { kind: 'transcript'; role: 'user' | 'assistant'; content: string; timestamp: number; key: string }
  | { kind: 'action'; entry: ActionLogEntry; key: string; timestamp: number };

let actionIdCounter = 0;

export function VoiceChat() {
  const [statusText, setStatusText] = useState('Click mic to start talking');
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [iotEndpoint, setIotEndpoint] = useState<string>('resolving...');
  const [pendingRecord, setPendingRecord] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const micLevelRef = useRef<HTMLDivElement>(null);

  // Hand stream subscription for real-time servo updates
  const { latestState: handState, isConnected: isHandStreamConnected } = useHandStream('XIAOAmazingHandRight');

  // Accumulate signed letters from hand state updates
  const [signedLetters, setSignedLetters] = useState<{ letter: string; timestamp: number }[]>([]);
  const lastHandStateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!handState?.letter || !handState.id) return;
    if (handState.id === lastHandStateIdRef.current) return;
    lastHandStateIdRef.current = handState.id;
    setSignedLetters((prev) => [...prev, { letter: handState.letter!, timestamp: handState.timestamp }]);
  }, [handState?.id, handState?.letter, handState?.timestamp]);

  // Convert HandState to FingerAngles for the animation
  const fingerAngles: FingerAngles | undefined = useMemo(() => {
    if (!handState) return undefined;
    return {
      index: {
        angle_1: handState.indexAngle1 ?? 0,
        angle_2: handState.indexAngle2 ?? 0,
      },
      middle: {
        angle_1: handState.middleAngle1 ?? 0,
        angle_2: handState.middleAngle2 ?? 0,
      },
      ring: {
        angle_1: handState.ringAngle1 ?? 0,
        angle_2: handState.ringAngle2 ?? 0,
      },
      thumb: {
        angle_1: handState.thumbAngle1 ?? 0,
        angle_2: handState.thumbAngle2 ?? 0,
      },
    };
  }, [handState]);

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

  const onAudioLevel = useCallback((level: number) => {
    micLevelRef.current?.style.setProperty('--mic-level', String(level));
  }, []);

  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder({
    onAudioData: (base64Audio) => {
      sendAudio(base64Audio);
    },
    onAudioLevel,
  });

  // Build a single chronological feed from transcripts + action log
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    for (let i = 0; i < transcripts.length; i++) {
      const t = transcripts[i];
      if (t.role === 'user') {
        items.push({
          kind: 'transcript',
          role: t.role,
          content: t.content,
          timestamp: t.timestamp,
          key: `t-${i}`,
        });
      }
    }

    for (const entry of actionLog) {
      items.push({
        kind: 'action',
        entry,
        timestamp: entry.timestamp,
        key: entry.id,
      });
    }

    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }, [transcripts, actionLog]);

  // Auto-scroll to bottom when feed changes
  useLayoutEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [feed]);

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

  // Reset mic level when recording stops
  useEffect(() => {
    if (!isRecording) {
      micLevelRef.current?.style.setProperty('--mic-level', '0');
    }
  }, [isRecording]);

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
      <div className="left-panel">
        <div className="hand-stream-status">
          Hand Stream: {isHandStreamConnected ? 'Connected' : 'Disconnected'}
        </div>

        <HandAnimation fingerAngles={fingerAngles} />

        <div className="video-container">
          {handState?.videoUrl ? (
            <video
              key={handState.videoUrl}
              src={handState.videoUrl}
              autoPlay
              muted
              controls
            />
          ) : (
            <div className="video-placeholder">No video available</div>
          )}
        </div>

        <div className="hand-data-panel">
          <div className="hand-data-header">Hand State Raw Data</div>
          {handState ? (
            <div className="hand-data-grid">
              <div className="hand-data-row">
                <span className="hand-data-label">id</span>
                <span className="hand-data-value meta">{handState.id}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">gesture</span>
                <span className="hand-data-value text">{handState.gesture ?? 'null'}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">letter</span>
                <span className="hand-data-value text">{handState.letter ?? 'null'}</span>
              </div>
              <div className="hand-data-separator">Thumb</div>
              <div className="hand-data-row">
                <span className="hand-data-label">thumbAngle1</span>
                <span className="hand-data-value">{handState.thumbAngle1 ?? 'null'}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">thumbAngle2</span>
                <span className="hand-data-value">{handState.thumbAngle2 ?? 'null'}</span>
              </div>
              <div className="hand-data-separator">Index</div>
              <div className="hand-data-row">
                <span className="hand-data-label">indexAngle1</span>
                <span className="hand-data-value">{handState.indexAngle1 ?? 'null'}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">indexAngle2</span>
                <span className="hand-data-value">{handState.indexAngle2 ?? 'null'}</span>
              </div>
              <div className="hand-data-separator">Middle</div>
              <div className="hand-data-row">
                <span className="hand-data-label">middleAngle1</span>
                <span className="hand-data-value">{handState.middleAngle1 ?? 'null'}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">middleAngle2</span>
                <span className="hand-data-value">{handState.middleAngle2 ?? 'null'}</span>
              </div>
              <div className="hand-data-separator">Ring</div>
              <div className="hand-data-row">
                <span className="hand-data-label">ringAngle1</span>
                <span className="hand-data-value">{handState.ringAngle1 ?? 'null'}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">ringAngle2</span>
                <span className="hand-data-value">{handState.ringAngle2 ?? 'null'}</span>
              </div>
              <div className="hand-data-separator">Video</div>
              <div className="hand-data-row">
                <span className="hand-data-label">videoUrl</span>
                <span className="hand-data-value meta">
                  {handState.videoUrl ? (
                    <a href={handState.videoUrl} target="_blank" rel="noopener noreferrer" className="hand-data-link">
                      {(() => { try { return new URL(handState.videoUrl).pathname.split('/').pop() || handState.videoUrl; } catch { return handState.videoUrl; } })()}
                    </a>
                  ) : 'null'}
                </span>
              </div>
              <div className="hand-data-separator">Timestamp</div>
              <div className="hand-data-row">
                <span className="hand-data-label">timestamp</span>
                <span className="hand-data-value meta">{handState.timestamp}</span>
              </div>
              <div className="hand-data-row">
                <span className="hand-data-label">createdAt</span>
                <span className="hand-data-value meta">{handState.createdAt ?? 'null'}</span>
              </div>
            </div>
          ) : (
            <div className="hand-data-empty">No hand data received yet</div>
          )}
        </div>

        <div className="signed-history-panel">
          <div className="signed-history-header">Signed Letters</div>
          {signedLetters.length > 0 ? (
            <div className="signed-history-letters">
              {signedLetters.map((entry, i) => (
                <span key={i} className="signed-letter">{entry.letter}</span>
              ))}
            </div>
          ) : (
            <div className="signed-history-empty">No letters signed yet</div>
          )}
        </div>
      </div>

      <div className="right-panel">
        <div className="status-bar">
          <span className={getStatusIndicatorClass()}></span>
          <span className="status-text">
            Nova Sonic: {sessionState === 'connected' ? 'Connected' : sessionState}
          </span>
        </div>

        <div className="iot-info">
          <span>Endpoint: {iotEndpoint}</span>
          <span>Topic: {IOT_TOPIC}</span>
        </div>

        <div className="transcript-area" ref={transcriptRef}>
          {feed.length === 0 ? (
            <p className="placeholder-text">
              Speak and your message will be sent to AWS IoT...
            </p>
          ) : (
            feed.map((item) =>
              item.kind === 'transcript' ? (
                <div key={item.key} className={`transcript-message ${item.role}`}>
                  <span className="role-label">You</span>
                  <p className="message-content">{item.content}</p>
                </div>
              ) : (
                <div key={item.key} className={`action-entry action-${item.entry.type}`}>
                  <span className="action-icon">{getActionIcon(item.entry.type)}</span>
                  <div className="action-content">
                    <span className="action-message">{item.entry.message}</span>
                    {item.entry.detail && <span className="action-detail">{item.entry.detail}</span>}
                  </div>
                </div>
              )
            )
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

          {isRecording && (
            <div
              className="mic-level-bar-container"
              ref={micLevelRef}
              style={{ '--mic-level': '0' } as React.CSSProperties}
            >
              <div className="mic-level-bar-fill" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
