// GPS for walking, tuned for battery (target < 15% over a 7 h walking day).
//
// What saves battery here:
// - "saver" (default) asks for Balanced accuracy (~100 m class, mostly Wi-Fi/cell +
//   occasional GNSS), at most one fix per 20 s and only after 25 m of movement.
//   A walker does ~1.4 m/s, so that is roughly one fix every 20 to 30 s.
// - distanceInterval means a resting walker (cafe, albergue) gets no callbacks, and the
//   OS can keep the GNSS chip mostly idle at Balanced accuracy.
// - Updates stop completely when the Maps tab is not visible or the app is in the
//   background (no background location in release 1).
// - The map renders at 30 fps in saver mode and the camera does not chase every fix.
// "precise" is for short moments (finding an albergue door, a hunt step): High
// accuracy, 5 m / 3 s. The UI drops back to saver after PRECISE_TIMEOUT_MS.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { LngLat } from './geo';

export type GpsMode = 'saver' | 'precise' | 'off';
export type WalkerFix = { at: LngLat; accuracyM: number | null; timestamp: number };
export type GpsPermission = 'unknown' | 'granted' | 'denied';

export const PRECISE_TIMEOUT_MS = 10 * 60 * 1000;

const OPTIONS: Record<Exclude<GpsMode, 'off'>, Location.LocationOptions> = {
  saver: {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20_000,
    distanceInterval: 25,
    mayShowUserSettingsDialog: false,
  },
  precise: {
    accuracy: Location.Accuracy.High,
    timeInterval: 3_000,
    distanceInterval: 5,
  },
};

export function useWalkerLocation(mode: GpsMode, visible: boolean) {
  const [fix, setFix] = useState<WalkerFix | null>(null);
  const [permission, setPermission] = useState<GpsPermission>('unknown');
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const running = mode !== 'off' && visible && appActive;

  useEffect(() => {
    if (!running) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const current = await Location.getForegroundPermissionsAsync();
      const perm = current.granted ? current : await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) return;
      // Show the last known fix at once (free, no GPS wake-up), then watch.
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
      if (!cancelled && last) setFix(toFix(last));
      sub = await Location.watchPositionAsync(OPTIONS[mode as 'saver' | 'precise'], (loc) => setFix(toFix(loc)));
      if (cancelled) sub.remove();
    })().catch((e) => console.warn('location failed', e));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [running, mode]);

  return { fix, permission };
}

const toFix = (l: Location.LocationObject): WalkerFix => ({
  at: [l.coords.longitude, l.coords.latitude],
  accuracyM: l.coords.accuracy,
  timestamp: l.timestamp,
});
