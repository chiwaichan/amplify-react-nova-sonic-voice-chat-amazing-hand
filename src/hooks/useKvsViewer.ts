import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  KinesisVideoClient,
  GetDataEndpointCommand,
  APIName,
} from '@aws-sdk/client-kinesis-video';
import {
  KinesisVideoArchivedMediaClient,
  GetHLSStreamingSessionURLCommand,
  HLSPlaybackMode,
  HLSDisplayFragmentTimestamp,
  ContainerFormat,
} from '@aws-sdk/client-kinesis-video-archived-media';
import Hls from 'hls.js';

const REGION = 'us-east-1';
const RETRY_WHEN_OFFLINE_MS = 15000;
const RETRY_ON_ERROR_MS = 5000;
const STALL_TIMEOUT_MS = 20000; // KVS fragments can take 10-15s to appear

export type KvsViewerStatus = 'disconnected' | 'connecting' | 'streaming' | 'error';

export function useKvsViewer(streamName: string) {
  const [status, setStatus] = useState<KvsViewerStatus>('disconnected');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const resetVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    resetVideo();
  }, [resetVideo]);

  const scheduleReconnect = useCallback((delayMs = RETRY_ON_ERROR_MS) => {
    if (reconnectTimerRef.current) return;
    cleanup();
    if (!mountedRef.current) return;
    console.log(`[KVS HLS] Will retry in ${delayMs / 1000}s...`);
    setStatus('disconnected');
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (mountedRef.current) connect();
    }, delayMs);
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current || !streamName) return;

    cleanup();
    setStatus('connecting');

    try {
      const session = await fetchAuthSession();
      if (!session.credentials) {
        console.log('[KVS HLS] No credentials yet, will retry...');
        scheduleReconnect();
        return;
      }
      const credentials = session.credentials;

      const kinesisVideoClient = new KinesisVideoClient({
        region: REGION,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const endpointResponse = await kinesisVideoClient.send(
        new GetDataEndpointCommand({
          StreamName: streamName,
          APIName: APIName.GET_HLS_STREAMING_SESSION_URL,
        })
      );

      const hlsEndpoint = endpointResponse.DataEndpoint!;

      const archivedMediaClient = new KinesisVideoArchivedMediaClient({
        region: REGION,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
        endpoint: hlsEndpoint,
      });

      const hlsResponse = await archivedMediaClient.send(
        new GetHLSStreamingSessionURLCommand({
          StreamName: streamName,
          PlaybackMode: HLSPlaybackMode.LIVE,
          ContainerFormat: ContainerFormat.FRAGMENTED_MP4,
          DisplayFragmentTimestamp: HLSDisplayFragmentTimestamp.ALWAYS,
          Expires: 43200,
        })
      );

      const hlsUrl = hlsResponse.HLSStreamingSessionURL;
      if (!hlsUrl) {
        console.log('[KVS HLS] Stream not active, will poll...');
        scheduleReconnect(RETRY_WHEN_OFFLINE_MS);
        return;
      }

      console.log('[KVS HLS] Got HLS URL, starting playback');

      const video = videoRef.current;
      if (!video) {
        console.error('[KVS HLS] No video element');
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          enableWorker: true,
        });
        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        // Stall detection — reset on every new fragment
        const resetStallTimer = () => {
          if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
          stallTimerRef.current = setTimeout(() => {
            console.log('[KVS HLS] Stream stalled — no data, reconnecting...');
            if (mountedRef.current) {
              scheduleReconnect(RETRY_WHEN_OFFLINE_MS);
            }
          }, STALL_TIMEOUT_MS);
        };

        hls.on(Hls.Events.FRAG_LOADED, () => {
          console.log('[KVS HLS] Fragment loaded');
          resetStallTimer();
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          console.log('[KVS HLS] Manifest parsed, levels:', data.levels.length);
          if (mountedRef.current) {
            video.play().catch((e) => console.warn('[KVS HLS] Autoplay blocked:', e));
            setStatus('streaming');
            resetStallTimer();
          }
        });

        hls.on(Hls.Events.MANIFEST_LOADED, () => {
          console.log('[KVS HLS] Manifest loaded');
        });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          console.log('[KVS HLS] Level loaded');
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('[KVS HLS] Fatal error:', data.type, data.details);
            if (mountedRef.current) {
              scheduleReconnect(RETRY_ON_ERROR_MS);
            }
          } else {
            console.warn('[KVS HLS] Non-fatal error:', data.details);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
          if (mountedRef.current) setStatus('streaming');
        }, { once: true });
        video.addEventListener('stalled', () => {
          if (mountedRef.current) scheduleReconnect();
        }, { once: true });
      } else {
        console.error('[KVS HLS] HLS not supported in this browser');
        setStatus('error');
        return;
      }
    } catch (error: any) {
      const isNoFragments = error?.name === 'ResourceNotFoundException' ||
        error?.message?.includes('No fragments found');
      if (isNoFragments) {
        console.log('[KVS HLS] Stream not active, will poll...');
        if (mountedRef.current) {
          setStatus('disconnected');
          scheduleReconnect(RETRY_WHEN_OFFLINE_MS);
        }
      } else {
        console.error('[KVS HLS] Connection error:', error);
        if (mountedRef.current) {
          setStatus('error');
          scheduleReconnect(RETRY_ON_ERROR_MS);
        }
      }
    }
  }, [streamName, cleanup, scheduleReconnect]);

  const connectRef = useRef(connect);
  connectRef.current = connect;
  const scheduleReconnectRef = useRef(scheduleReconnect);
  scheduleReconnectRef.current = scheduleReconnect;

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [streamName]);

  return { status, videoRef };
}
