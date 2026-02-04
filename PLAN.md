# Nova Sonic Voice Chat - Minimal MVP Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           React App (Browser)                           │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ VoiceChat       │  │ useAudioRecorder │  │ useNovaSonic          │  │
│  │ Component       │──│ (16kHz PCM)      │──│ (Bedrock SDK)         │  │
│  │ - Mic button    │  │ - getUserMedia   │  │ - WebSocket stream    │  │
│  │ - Status text   │  │ - AudioWorklet   │  │ - Event handling      │  │
│  └─────────────────┘  └──────────────────┘  └───────────┬───────────┘  │
│                                                          │              │
│  ┌──────────────────┐                                    │              │
│  │ useAudioPlayer   │◄───────────────────────────────────┘              │
│  │ (24kHz playback) │   (audioOutput events)                            │
│  └──────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ AWS Credentials (Cognito Identity Pool)
                                    ▼
                    ┌───────────────────────────────────┐
                    │  Amazon Bedrock Runtime           │
                    │  InvokeModelWithBidirectionalStream │
                    │  Model: amazon.nova-sonic-v1:0    │
                    └───────────────────────────────────┘
```

## Implementation Steps

### Step 1: Update Amplify Backend - Add Bedrock IAM Policy

**File:** `amplify/backend.ts`

Add IAM policy to allow authenticated users to invoke Nova Sonic:

```typescript
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
});

// Grant authenticated users permission to invoke Nova Sonic
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModelWithResponseStream',
      'bedrock:InvokeModel',
    ],
    resources: [
      'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-sonic-v1:0',
    ],
  })
);
```

**Then run:** `npm run sandbox` to deploy

### Step 2: Install Dependencies

```bash
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers
```

### Step 3: Create Nova Sonic Hook

**File:** `src/hooks/useNovaSonic.ts`

Core responsibilities:
- Initialize Bedrock client with Cognito credentials
- Manage bidirectional stream lifecycle
- Send session events (sessionStart, promptStart, contentStart, audioInput)
- Handle response events (textOutput, audioOutput, contentEnd)
- Expose methods: `startSession()`, `sendAudio()`, `endSession()`

**Event Flow:**
```
1. sessionStart      → Configure inference (maxTokens, temp, topP)
2. promptStart       → Set audio output config (24kHz, voiceId)
3. contentStart      → System prompt (TEXT, SYSTEM role)
4. textInput         → System prompt content
5. contentEnd        → End system prompt
6. contentStart      → Audio input config (16kHz, USER role)
7. audioInput        → Stream mic audio chunks (base64 encoded)
8. contentEnd        → End audio input when user stops
```

**Response Events to Handle:**
- `textOutput` → Transcript of user speech & assistant response
- `audioOutput` → Base64 encoded audio to play back
- `contentEnd` → End of content block
- `completionEnd` → End of response

### Step 4: Create Audio Recorder Hook

**File:** `src/hooks/useAudioRecorder.ts`

Core responsibilities:
- Request microphone access via `navigator.mediaDevices.getUserMedia()`
- Use AudioWorklet to capture raw PCM audio
- Resample to 16kHz if needed (most mics are 44.1kHz or 48kHz)
- Convert to 16-bit PCM format
- Expose methods: `startRecording()`, `stopRecording()`
- Callback: `onAudioChunk(pcmData: Uint8Array)`

**Audio Format Requirements:**
- Sample rate: 16000 Hz
- Bit depth: 16-bit
- Channels: 1 (mono)
- Encoding: PCM (raw), then base64 for transmission

### Step 5: Create Audio Player Hook

**File:** `src/hooks/useAudioPlayer.ts`

Core responsibilities:
- Decode base64 audio from Nova Sonic responses
- Queue audio chunks for seamless playback
- Use Web Audio API (AudioContext) for playback
- Handle 24kHz sample rate output
- Expose methods: `playAudio(base64Data)`, `stop()`

### Step 6: Create VoiceChat Component

**File:** `src/components/VoiceChat.tsx`

Minimal UI:
```
┌────────────────────────────────┐
│                                │
│      ● Connected               │  ← Status indicator
│                                │
│   "Press and hold to talk"     │  ← Instructions
│                                │
│         ┌──────┐               │
│         │  🎤  │               │  ← Large mic button
│         └──────┘               │
│                                │
│   User: "Hello there"          │  ← Live transcript
│   Assistant: "Hi! How can..."  │
│                                │
└────────────────────────────────┘
```

**States:**
- `idle` - Ready to record
- `connecting` - Establishing Nova Sonic session
- `listening` - Recording user audio
- `processing` - Waiting for response
- `speaking` - Playing assistant audio

### Step 7: Create AudioWorklet Processor

**File:** `public/audio-processor.js`

AudioWorklet for capturing raw PCM data from microphone in real-time.

## File Structure After Implementation

```
src/
├── components/
│   └── VoiceChat.tsx          # Main voice chat UI
├── hooks/
│   ├── useNovaSonic.ts        # Bedrock streaming client
│   ├── useAudioRecorder.ts    # Microphone capture
│   └── useAudioPlayer.ts      # Audio playback
├── utils/
│   └── audioUtils.ts          # PCM encoding/decoding helpers
├── App.tsx                    # Updated with VoiceChat
└── main.tsx                   # Entry point (unchanged)

public/
└── audio-processor.js         # AudioWorklet processor

amplify/
├── auth/
│   └── resource.ts            # Unchanged
└── backend.ts                 # Updated with Bedrock IAM policy
```

## Key Technical Details

### Nova Sonic Model Configuration
- **Model ID:** `amazon.nova-sonic-v1:0`
- **Region:** `us-east-1` (must match Amplify deployment)
- **Voice ID:** `matthew` (or other available voices)

### Audio Specifications
| Direction | Sample Rate | Bit Depth | Channels | Format |
|-----------|-------------|-----------|----------|--------|
| Input (mic) | 16,000 Hz | 16-bit | Mono | PCM → Base64 |
| Output (speaker) | 24,000 Hz | 16-bit | Mono | Base64 → PCM |

### Credential Flow
1. User authenticates via Cognito User Pool
2. Amplify SDK exchanges tokens for temporary AWS credentials via Identity Pool
3. Bedrock SDK uses these credentials to sign requests
4. Credentials auto-refresh via Amplify

## MVP Scope (What's Included)

- Push-to-talk voice interaction
- Real-time audio streaming to Nova Sonic
- Audio response playback
- Basic transcript display
- Connection status indicator
- Error handling

## Out of Scope (Future Iterations)

- Voice Activity Detection (auto start/stop)
- Tool/function calling
- Conversation history persistence
- Multiple voice options
- Audio visualizer/waveform
- Interrupt/barge-in handling
