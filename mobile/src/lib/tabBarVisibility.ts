import { useSyncExternalStore } from 'react';

// Lets a screen (e.g. the Maps sheet) hide the floating tab bar while it is open.
let hidden = false;
const listeners = new Set<() => void>();
export const setTabBarHidden = (v: boolean) => {
  if (hidden === v) return;
  hidden = v;
  listeners.forEach((l) => l());
};
export const useTabBarHidden = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => hidden, () => false);
