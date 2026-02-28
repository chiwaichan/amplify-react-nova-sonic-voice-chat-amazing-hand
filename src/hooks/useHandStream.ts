import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';

const client = generateClient();

export interface HandState {
  id: string;
  deviceName: string;
  gesture?: string | null;
  letter?: string | null;
  indexAngle1?: number | null;
  indexAngle2?: number | null;
  middleAngle1?: number | null;
  middleAngle2?: number | null;
  ringAngle1?: number | null;
  ringAngle2?: number | null;
  thumbAngle1?: number | null;
  thumbAngle2?: number | null;
  timestamp: number;
  videoUrl?: string | null;
  createdAt?: string;
}

export function useHandStream(deviceName?: string): {
  latestState: HandState | null;
  recentStates: HandState[];
  isConnected: boolean;
} {
  const [recentStates, setRecentStates] = useState<HandState[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.log('Setting up hand stream for:', deviceName || 'all devices');

    // Query existing data
    const fetchExistingData = async () => {
      try {
        const listHandStates = /* GraphQL */ `
          query ListHandStates($filter: ModelHandStateFilterInput) {
            listHandStates(filter: $filter, limit: 20) {
              items {
                id
                deviceName
                gesture
                letter
                indexAngle1
                indexAngle2
                middleAngle1
                middleAngle2
                ringAngle1
                ringAngle2
                thumbAngle1
                thumbAngle2
                timestamp
                videoUrl
                createdAt
              }
            }
          }
        `;

        const result = await client.graphql({
          query: listHandStates,
          variables: deviceName
            ? { filter: { deviceName: { eq: deviceName } } }
            : {},
        });

        const items = (result as any).data?.listHandStates?.items || [];
        setRecentStates(
          items.sort((a: HandState, b: HandState) => (b.timestamp || 0) - (a.timestamp || 0))
        );
        setIsConnected(true);
        console.log(`Found ${items.length} existing hand states`);
      } catch (error) {
        console.error('Error fetching hand states:', error);
        setIsConnected(false);
      }
    };

    fetchExistingData();

    // Set up subscription for real-time updates
    const onCreateHandState = /* GraphQL */ `
      subscription OnCreateHandState($filter: ModelSubscriptionHandStateFilterInput) {
        onCreateHandState(filter: $filter) {
          id
          deviceName
          gesture
          letter
          indexAngle1
          indexAngle2
          middleAngle1
          middleAngle2
          ringAngle1
          ringAngle2
          thumbAngle1
          thumbAngle2
          timestamp
          videoUrl
          createdAt
        }
      }
    `;

    const subscription = client.graphql({
      query: onCreateHandState,
      variables: deviceName
        ? { filter: { deviceName: { eq: deviceName } } }
        : {},
    });

    if ('subscribe' in subscription) {
      const sub = subscription.subscribe({
        next: ({ data }: any) => {
          const newHandState = data?.onCreateHandState;
          if (newHandState) {
            console.log('New hand state received:', newHandState);
            setRecentStates((prev) => {
              const updated = [newHandState, ...prev].slice(0, 20);
              return updated.sort(
                (a: HandState, b: HandState) => (b.timestamp || 0) - (a.timestamp || 0)
              );
            });
          }
        },
        error: (error: any) => {
          console.error('Subscription error:', error);
          setIsConnected(false);
        },
      });

      return () => {
        sub.unsubscribe();
        setIsConnected(false);
      };
    }

    return () => {
      setIsConnected(false);
    };
  }, [deviceName]);

  return {
    latestState: recentStates.length > 0 ? recentStates[0] : null,
    recentStates,
    isConnected,
  };
}
