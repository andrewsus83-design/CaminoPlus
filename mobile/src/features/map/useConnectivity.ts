import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** true = internet reachable, false = offline, null = not known yet. */
export function useOnline() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        // isInternetReachable is null while the check runs; fall back to isConnected.
        setOnline(s.isInternetReachable ?? s.isConnected ?? null);
      }),
    [],
  );
  return online;
}
