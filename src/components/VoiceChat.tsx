import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useNovaSonic } from '../hooks/useNovaSonic';
import type { ToolUseEvent } from '../hooks/useNovaSonic';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { lookupSign } from '../data/aslSigns';
import type { HandPose, SignSequence } from '../data/aslSigns';
import { publishServoCommand, getIoTEndpoint, IOT_TOPIC } from '../utils/iotPublisher';
import { HandAnimation } from './HandAnimation';
import './VoiceChat.css';

interface ActionLogEntry {
  id: string;
  type: 'intent' | 'servo' | 'status' | 'error';
  message: string;
  timestamp: number;
  detail?: string;
}

let actionIdCounter = 0;

export function VoiceChat() {
  const [statusText, setStatusText] = useState('Click mic to start talking');
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [currentPose, setCurrentPose] = useState<HandPose | undefined>();
  const [iotEndpoint, setIotEndpoint] = useState<string>('resolving...');
  const hasStartedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number[]>([]);

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

  const animateSignSequence = useCallback((sequence: SignSequence) => {
    animationTimeoutRef.current.forEach(clearTimeout);
    animationTimeoutRef.current = [];

    let delay = 0;
    sequence.poses.forEach((pose) => {
      const timeoutId = window.setTimeout(() => {
        setCurrentPose(pose);
      }, delay);
      animationTimeoutRef.current.push(timeoutId);
      delay += pose.holdMs;
    });

    const resetId = window.setTimeout(() => {
      setCurrentPose(undefined);
    }, delay + 500);
    animationTimeoutRef.current.push(resetId);
  }, []);

  const { queueAudio, stop: stopAudio, isPlaying } = useAudioPlayer();

  const handleToolUse = useCallback(async (event: ToolUseEvent): Promise<string> => {
    console.log('[VoiceChat] Tool use event:', event);

    try {
      const input = JSON.parse(event.content);
      const action = input.action as 'sign' | 'fingerspell' | 'gesture';
      const word = input.word as string;

      addAction('intent', `Translating "${word}" (${action})`, `Tool: ${event.toolName}`);

      const sequence = lookupSign(action, word);
      animateSignSequence(sequence);
      const poseCount = sequence.poses.length;
      addAction('servo', `Servo sequence: ${poseCount} pose(s) for "${sequence.name}"`,
        `Poses: ${JSON.stringify(sequence.poses.slice(0, 3))}${poseCount > 3 ? '...' : ''}`);

      try {
        await publishServoCommand(sequence, action, word);
        addAction('status', `Published "${word}" to Amazing Hand`);
      } catch (iotErr: any) {
        addAction('error', `IoT publish failed: ${iotErr?.message || 'Unknown error'}`);
      }

      return JSON.stringify({
        status: 'success',
        action,
        word,
        posesCount: poseCount,
        signName: sequence.name,
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
    onAudioOutput: (base64Audio) => {
      queueAudio(base64Audio);
    },
    onError: (error) => {
      console.error('Nova Sonic error:', error);
      setStatusText(`Error: ${error}`);
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
      animationTimeoutRef.current.forEach(clearTimeout);
      endSession();
    };
  }, []);

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

  const getActionIcon = (type: ActionLogEntry['type']) => {
    switch (type) {
      case 'intent': return '\u{1F9E0}';
      case 'servo': return '\u{1F916}';
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

      <HandAnimation currentPose={currentPose} />

      <div className="transcript-area" ref={transcriptRef}>
        {transcripts.length === 0 && actionLog.length === 0 ? (
          <p className="placeholder-text">
            Speak and your words will be translated to sign language...
          </p>
        ) : (
          <>
            {transcripts.map((t, index) => (
              <div key={`t-${index}`} className={`transcript-message ${t.role}`}>
                <span className="role-label">
                  {t.role === 'user' ? 'You' : 'Assistant'}
                </span>
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
