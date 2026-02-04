import { useRef, useCallback, useState } from 'react';
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fetchAuthSession } from 'aws-amplify/auth';

const MODEL_ID = 'amazon.nova-2-sonic-v1:0';
const REGION = 'us-east-1';

type SessionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Transcript {
  role: 'user' | 'assistant';
  content: string;
}

interface UseNovaSonicOptions {
  onAudioOutput?: (base64Audio: string) => void;
  onTranscript?: (transcript: Transcript) => void;
  onStateChange?: (state: SessionState) => void;
  onError?: (error: string) => void;
}

interface UseNovaSonicReturn {
  sessionState: SessionState;
  startSession: () => Promise<void>;
  sendAudio: (base64Audio: string) => void;
  stopAudioInput: () => void;
  endSession: () => Promise<void>;
  transcripts: Transcript[];
}

// Helper to create event chunk
function createEventChunk(event: object): { chunk: { bytes: Uint8Array } } {
  const encoder = new TextEncoder();
  return {
    chunk: {
      bytes: encoder.encode(JSON.stringify(event)),
    },
  };
}

// Diagnostic logger
function log(step: string, data?: any) {
  const timestamp = new Date().toISOString().split('T')[1];
  if (data !== undefined) {
    console.log(`[${timestamp}] [NovaSonic] ${step}:`, data);
  } else {
    console.log(`[${timestamp}] [NovaSonic] ${step}`);
  }
}

export function useNovaSonic(options: UseNovaSonicOptions = {}): UseNovaSonicReturn {
  console.log('[NovaSonic] Hook initialized');
  const { onAudioOutput, onTranscript, onStateChange, onError } = options;

  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  const clientRef = useRef<BedrockRuntimeClient | null>(null);
  const isActiveRef = useRef(false);
  const promptNameRef = useRef<string>('');
  const audioContentNameRef = useRef<string>('');
  const currentRoleRef = useRef<'user' | 'assistant'>('user');
  const sessionIdRef = useRef<string>('');

  // Stream control - using a class to ensure proper isolation
  const streamControlRef = useRef<{
    eventQueue: any[];
    resolver: ((value: any) => void) | null;
    closed: boolean;
  } | null>(null);

  const updateState = useCallback(
    (state: SessionState) => {
      log(`State change: ${sessionState} -> ${state}`);
      setSessionState(state);
      onStateChange?.(state);
    },
    [onStateChange, sessionState]
  );

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const pushEvent = useCallback((event: object) => {
    const control = streamControlRef.current;
    if (!control) {
      log('ERROR: No stream control - cannot push event');
      return;
    }

    const chunk = createEventChunk(event);
    const eventName = Object.keys((event as any).event)[0];

    // Only log non-audio events to reduce noise
    if (eventName !== 'audioInput') {
      log(`Push event: ${eventName}`);
    }

    if (control.resolver) {
      control.resolver(chunk);
      control.resolver = null;
    } else {
      control.eventQueue.push(chunk);
    }
  }, []);

  const createClient = useCallback(async () => {
    log('Step 1: Fetching auth session...');
    const session = await fetchAuthSession();

    log('Step 2: Auth session received', {
      hasTokens: !!session.tokens,
      hasCredentials: !!session.credentials,
      identityId: session.identityId,
    });

    const credentials = session.credentials;
    if (!credentials) {
      throw new Error('No credentials available. Please sign in.');
    }

    log('Step 3: Credentials available', {
      accessKeyId: credentials.accessKeyId?.substring(0, 8) + '...',
      hasSecretKey: !!credentials.secretAccessKey,
      hasSessionToken: !!credentials.sessionToken,
    });

    log('Step 4: Creating BedrockRuntimeClient', { region: REGION, modelId: MODEL_ID });

    const client = new BedrockRuntimeClient({
      region: REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    log('Step 5: BedrockRuntimeClient created successfully');
    return client;
  }, []);

  const buildInitializationEvents = useCallback(() => {
    const promptName = promptNameRef.current;
    const contentName = generateUUID();
    const audioContentName = audioContentNameRef.current;

    const systemPrompt =
      'You are a friendly assistant. The user and you will engage in a spoken dialog ' +
      'exchanging the transcripts of a natural real-time conversation. Keep your responses short, ' +
      'generally two or three sentences for chatty scenarios.';

    return [
      {
        event: {
          sessionStart: {
            inferenceConfiguration: {
              maxTokens: 1024,
              topP: 0.9,
              temperature: 0.7,
            },
          },
        },
      },
      {
        event: {
          promptStart: {
            promptName,
            textOutputConfiguration: {
              mediaType: 'text/plain',
            },
            audioOutputConfiguration: {
              mediaType: 'audio/lpcm',
              sampleRateHertz: 24000,
              sampleSizeBits: 16,
              channelCount: 1,
              voiceId: 'matthew',
              encoding: 'base64',
              audioType: 'SPEECH',
            },
          },
        },
      },
      {
        event: {
          contentStart: {
            promptName,
            contentName,
            type: 'TEXT',
            interactive: true,
            role: 'SYSTEM',
            textInputConfiguration: {
              mediaType: 'text/plain',
            },
          },
        },
      },
      {
        event: {
          textInput: {
            promptName,
            contentName,
            content: systemPrompt,
          },
        },
      },
      {
        event: {
          contentEnd: {
            promptName,
            contentName,
          },
        },
      },
      {
        event: {
          contentStart: {
            promptName,
            contentName: audioContentName,
            type: 'AUDIO',
            interactive: true,
            role: 'USER',
            audioInputConfiguration: {
              mediaType: 'audio/lpcm',
              sampleRateHertz: 16000,
              sampleSizeBits: 16,
              channelCount: 1,
              audioType: 'SPEECH',
              encoding: 'base64',
            },
          },
        },
      },
    ];
  }, []);

  const processResponseStream = useCallback(async (responseStream: AsyncIterable<any>, sid: string) => {
    log(`[${sid}] Starting response stream processing...`);

    try {
      let eventCount = 0;
      for await (const event of responseStream) {
        if (!isActiveRef.current || sessionIdRef.current !== sid) {
          log(`[${sid}] Session no longer active, stopping`);
          break;
        }

        eventCount++;

        // Log raw event structure for debugging
        const eventKeys = Object.keys(event || {});
        log(`[${sid}] Raw event #${eventCount} keys:`, eventKeys);

        // Handle different event formats from the SDK
        let jsonResponse: any = null;

        // Format 1: event.chunk.bytes (raw bytes)
        if (event.chunk?.bytes) {
          try {
            const textResponse = new TextDecoder().decode(event.chunk.bytes);
            jsonResponse = JSON.parse(textResponse);
          } catch (e) {
            log(`[${sid}] Could not parse chunk.bytes as JSON`);
          }
        }

        // Format 2: event.output (SDK deserialized) - only if Format 1 didn't work
        if (!jsonResponse && event.output) {
          jsonResponse = { event: event.output };
          log(`[${sid}] Using event.output format`);
        }

        // Format 3: Direct event properties (SDK fully deserialized)
        if (!jsonResponse && (event.sessionStart || event.promptStart || event.contentStart ||
            event.textOutput || event.audioOutput || event.contentEnd || event.promptEnd || event.sessionEnd)) {
          jsonResponse = { event };
          log(`[${sid}] Using direct event format`);
        }

        if (jsonResponse?.event) {
          const eventType = Object.keys(jsonResponse.event)[0] || 'unknown';
          log(`[${sid}] Received event #${eventCount}: ${eventType}`);

          if (jsonResponse.event.contentStart) {
            const role = jsonResponse.event.contentStart.role?.toLowerCase();
            if (role === 'user' || role === 'assistant') {
              currentRoleRef.current = role;
              log(`[${sid}] Role set to: ${role}`);
            }
          } else if (jsonResponse.event.textOutput) {
            const content = jsonResponse.event.textOutput.content;
            const role = currentRoleRef.current;

            if (content && !content.includes('{ "interrupted" : true }')) {
              log(`[${sid}] Text output (${role}): ${content.substring(0, 50)}...`);
              const transcript: Transcript = { role, content };
              setTranscripts((prev) => {
                // Check for duplicate - don't add if last message already ends with this content
                if (prev.length > 0 && prev[prev.length - 1].role === role) {
                  const lastContent = prev[prev.length - 1].content;
                  // Skip if this content is already at the end (duplicate)
                  if (lastContent.endsWith(content)) {
                    return prev;
                  }
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: lastContent + content,
                  };
                  return updated;
                }
                return [...prev, transcript];
              });
              onTranscript?.(transcript);
            }
          } else if (jsonResponse.event.audioOutput) {
            const audioContent = jsonResponse.event.audioOutput.content;
            if (audioContent) {
              log(`[${sid}] Audio output received, length: ${audioContent.length}`);
              onAudioOutput?.(audioContent);
            }
          }
        } else {
          log(`[${sid}] Unrecognized event format:`, JSON.stringify(event).substring(0, 200));
        }
      }
      log(`[${sid}] Response stream ended, processed ${eventCount} events`);
    } catch (err: any) {
      // Don't treat $unknown errors as fatal - the SDK may not recognize all Nova Sonic events
      if (err?.message?.includes('$unknown')) {
        log(`[${sid}] SDK encountered unknown event type (non-fatal):`, err.message);
        return;
      }
      log(`[${sid}] Response stream error:`, err);
      if (isActiveRef.current && sessionIdRef.current === sid) {
        const message = err instanceof Error ? err.message : 'Stream processing error';
        onError?.(message);
        updateState('error');
      }
    }
  }, [onAudioOutput, onTranscript, onError, updateState]);

  const startSession = useCallback(async () => {
    const sid = generateUUID().substring(0, 8);
    log(`========== Starting new session: ${sid} ==========`);

    try {
      // Create fresh stream control for this session
      streamControlRef.current = {
        eventQueue: [],
        resolver: null,
        closed: false,
      };

      updateState('connecting');
      isActiveRef.current = true;
      sessionIdRef.current = sid;
      promptNameRef.current = generateUUID();
      audioContentNameRef.current = generateUUID();
      setTranscripts([]);

      log(`[${sid}] Step 6: Creating client...`);
      clientRef.current = await createClient();

      // Pre-queue initialization events
      const initEvents = buildInitializationEvents();
      log(`[${sid}] Step 7: Pre-queuing ${initEvents.length} init events`);

      const control = streamControlRef.current;
      for (const event of initEvents) {
        control.eventQueue.push(createEventChunk(event));
      }
      log(`[${sid}] Step 8: Queue ready, length: ${control.eventQueue.length}`);

      // Create async generator for input stream (SDK expects AsyncIterable)
      log(`[${sid}] Step 9: Creating async generator for input`);

      async function* createInputStream() {
        const ctrl = streamControlRef.current;
        if (!ctrl) {
          log(`[${sid}] AsyncGenerator: No control, returning`);
          return;
        }

        log(`[${sid}] AsyncGenerator: Started, initial queue: ${ctrl.eventQueue.length}`);

        while (isActiveRef.current && sessionIdRef.current === sid && !ctrl.closed) {
          // Yield all queued events
          while (ctrl.eventQueue.length > 0) {
            const event = ctrl.eventQueue.shift();
            yield event;
          }

          // Wait for next event
          const nextEvent = await new Promise<any>((resolve) => {
            ctrl.resolver = resolve;
          });

          if (nextEvent === null || ctrl.closed) {
            log(`[${sid}] AsyncGenerator: Received close signal`);
            break;
          }

          yield nextEvent;
        }

        log(`[${sid}] AsyncGenerator: Finished`);
      }

      const inputStream = createInputStream();

      log(`[${sid}] Step 10: Creating InvokeModelWithBidirectionalStreamCommand`);
      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: MODEL_ID,
        body: inputStream,
      });

      log(`[${sid}] Step 11: Calling client.send()...`);
      const response = await clientRef.current.send(command);
      log(`[${sid}] Step 12: Response received!`, { hasBody: !!response.body });

      if (!response.body) {
        throw new Error('No response body received from Bedrock');
      }

      // Start processing responses
      log(`[${sid}] Step 13: Starting response processing...`);
      processResponseStream(response.body, sid);

      log(`[${sid}] Step 14: Session connected successfully!`);
      updateState('connected');
    } catch (err: any) {
      log(`[${sid}] ERROR in startSession:`, {
        message: err?.message,
        name: err?.name,
        code: err?.$metadata?.httpStatusCode,
        requestId: err?.$metadata?.requestId,
        stack: err?.stack?.split('\n').slice(0, 5),
      });

      const message = err instanceof Error ? err.message : 'Failed to start session';
      onError?.(message);
      updateState('error');
      isActiveRef.current = false;
      sessionIdRef.current = '';
    }
  }, [createClient, buildInitializationEvents, processResponseStream, updateState, onError]);

  const sendAudio = useCallback(
    (base64Audio: string) => {
      if (!isActiveRef.current || sessionState !== 'connected') {
        log('sendAudio: not active or not connected', { isActive: isActiveRef.current, state: sessionState });
        return;
      }

      pushEvent({
        event: {
          audioInput: {
            promptName: promptNameRef.current,
            contentName: audioContentNameRef.current,
            content: base64Audio,
          },
        },
      });
    },
    [pushEvent, sessionState]
  );

  // Signal end of current audio input (user released mic) without ending session
  const stopAudioInput = useCallback(() => {
    if (!isActiveRef.current) return;

    const sid = sessionIdRef.current;
    log(`[${sid}] Stopping audio input (user released mic)`);

    // Send contentEnd for the audio content
    pushEvent({
      event: {
        contentEnd: {
          promptName: promptNameRef.current,
          contentName: audioContentNameRef.current,
        },
      },
    });

    // Generate new content name for next audio input
    audioContentNameRef.current = generateUUID();

    // Send new contentStart for next audio input
    pushEvent({
      event: {
        contentStart: {
          promptName: promptNameRef.current,
          contentName: audioContentNameRef.current,
          type: 'AUDIO',
          interactive: true,
          role: 'USER',
          audioInputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 16000,
            sampleSizeBits: 16,
            channelCount: 1,
            audioType: 'SPEECH',
            encoding: 'base64',
          },
        },
      },
    });

    log(`[${sid}] Ready for next audio input`);
  }, [pushEvent]);

  const endSession = useCallback(async () => {
    if (!isActiveRef.current) {
      log('endSession: already inactive');
      return;
    }

    const sid = sessionIdRef.current;
    log(`[${sid}] Ending session...`);
    isActiveRef.current = false;

    try {
      pushEvent({
        event: {
          contentEnd: {
            promptName: promptNameRef.current,
            contentName: audioContentNameRef.current,
          },
        },
      });

      await sleep(100);

      pushEvent({
        event: {
          promptEnd: {
            promptName: promptNameRef.current,
          },
        },
      });

      await sleep(100);

      pushEvent({
        event: {
          sessionEnd: {},
        },
      });

      await sleep(100);

      // Close the stream
      const control = streamControlRef.current;
      if (control) {
        control.closed = true;
        if (control.resolver) {
          control.resolver(null);
          control.resolver = null;
        }
      }
    } catch (err) {
      log(`[${sid}] Error ending session`, err);
    }

    clientRef.current = null;
    sessionIdRef.current = '';
    updateState('disconnected');
  }, [pushEvent, updateState]);

  return {
    sessionState,
    startSession,
    sendAudio,
    stopAudioInput,
    endSession,
    transcripts,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
