// Walk view preferences kept on the device (not per account): the 3D buildings switch, so a phone that struggles
// keeps it off. Everything else (map light, compass mode) resets each time on purpose.
import { useCallback, useEffect, useState } from 'react';
import { localStore } from '../../lib/localStore';

const KEY = 'map.walk.settings';
type Settings = { buildings3d: boolean };

export function useWalkSettings() {
  const [s, setS] = useState<Settings>({ buildings3d: true });

  useEffect(() => {
    let alive = true;
    localStore.getJSON<Partial<Settings>>(KEY).then((v) => {
      if (alive && v && typeof v.buildings3d === 'boolean') setS((x) => ({ ...x, buildings3d: v.buildings3d as boolean }));
    });
    return () => {
      alive = false;
    };
  }, []);

  const setBuildings3d = useCallback((on: boolean) => {
    setS((x) => {
      const next = { ...x, buildings3d: on };
      void localStore.setJSON(KEY, next);
      return next;
    });
  }, []);

  return { buildings3d: s.buildings3d, setBuildings3d };
}
