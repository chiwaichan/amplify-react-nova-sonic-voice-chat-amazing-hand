import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { IoTClient, AttachPolicyCommand } from '@aws-sdk/client-iot';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { SignSequence, HandPose } from '../data/aslSigns';

const REGION = 'us-east-1';
const DEFAULT_TOPIC = 'amazing-hand/servo';
const MAX_POSES_PER_CHUNK = 10;
const IOT_POLICY_NAME = 'AmazingHandPolicy';

let policyAttached = false;

function getEndpoint(): string {
  const endpoint = import.meta.env.VITE_IOT_ENDPOINT;
  if (!endpoint) {
    throw new Error('VITE_IOT_ENDPOINT environment variable is not set');
  }
  return endpoint;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface CompactPose {
  h: 'R' | 'L' | 'B';
  r?: number[];
  l?: number[];
  ms: number;
}

interface MqttPayload {
  id: string;
  chunk: number;
  totalChunks: number;
  action: string;
  word: string;
  poses: CompactPose[];
  ts: number;
}

function toCompactPose(pose: HandPose): CompactPose {
  const compact: CompactPose = {
    h: pose.hand === 'right' ? 'R' : pose.hand === 'left' ? 'L' : 'B',
    ms: pose.holdMs,
  };

  if (pose.right) {
    compact.r = [...pose.right];
  }
  if (pose.left) {
    compact.l = [...pose.left];
  }

  return compact;
}

async function getSession() {
  const session = await fetchAuthSession();
  const credentials = session.credentials;
  if (!credentials) {
    throw new Error('No credentials available for IoT publish');
  }
  return { session, credentials };
}

/**
 * Attach the IoT Core policy to the current Cognito identity.
 * Required for authenticated Cognito identities to publish to IoT Core.
 * Only needs to be done once per identity (idempotent).
 */
async function ensurePolicyAttached(): Promise<void> {
  if (policyAttached) return;

  const { session, credentials } = await getSession();
  const identityId = session.identityId;
  if (!identityId) {
    console.warn('[IoT] No identity ID available, skipping policy attachment');
    return;
  }

  const iotClient = new IoTClient({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    await iotClient.send(new AttachPolicyCommand({
      policyName: IOT_POLICY_NAME,
      target: identityId,
    }));
    console.log(`[IoT] Attached policy "${IOT_POLICY_NAME}" to identity ${identityId}`);
    policyAttached = true;
  } catch (err: any) {
    // ResourceAlreadyExistsException means policy is already attached - that's fine
    if (err.name === 'ResourceAlreadyExistsException' || err.Code === 'ResourceAlreadyExistsException') {
      console.log('[IoT] Policy already attached');
      policyAttached = true;
    } else {
      console.error('[IoT] Failed to attach policy:', err);
      throw err;
    }
  }
}

async function createDataPlaneClient(): Promise<IoTDataPlaneClient> {
  const { credentials } = await getSession();

  return new IoTDataPlaneClient({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    endpoint: `https://${getEndpoint()}`,
  });
}

/**
 * Publish servo commands for a sign sequence via MQTT to AWS IoT Core.
 * Long sequences are split into chunks of MAX_POSES_PER_CHUNK poses.
 */
export async function publishServoCommand(
  sequence: SignSequence,
  action: string,
  word: string,
  topic: string = DEFAULT_TOPIC
): Promise<void> {
  // Ensure IoT Core policy is attached to this Cognito identity
  await ensurePolicyAttached();

  const client = await createDataPlaneClient();
  const compactPoses = sequence.poses.map(toCompactPose);
  const totalChunks = Math.max(1, Math.ceil(compactPoses.length / MAX_POSES_PER_CHUNK));
  const messageId = generateId();
  const ts = Math.floor(Date.now() / 1000);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * MAX_POSES_PER_CHUNK;
    const end = start + MAX_POSES_PER_CHUNK;
    const chunkPoses = compactPoses.slice(start, end);

    const payload: MqttPayload = {
      id: messageId,
      chunk: i,
      totalChunks,
      action,
      word,
      poses: chunkPoses,
      ts,
    };

    const command = new PublishCommand({
      topic,
      payload: new TextEncoder().encode(JSON.stringify(payload)),
      qos: 0,
    });

    console.log(`[IoT] Publishing chunk ${i + 1}/${totalChunks} to ${topic}`, payload);
    await client.send(command);
  }

  console.log(`[IoT] Published ${totalChunks} chunk(s) for "${word}" (${action})`);
}
