import { useQuery } from '@tanstack/react-query';
import { push } from './push';

export const pushDeviceKey = ['push-current'] as const;

/** This device's push subscription endpoint (null when not subscribed or unsupported). */
export function usePushDevice() {
  return useQuery({
    queryKey: pushDeviceKey,
    queryFn: () => {
      const adapter = push.get();
      return adapter.supported() ? adapter.currentEndpoint() : Promise.resolve(null);
    },
    staleTime: 60_000,
  });
}
