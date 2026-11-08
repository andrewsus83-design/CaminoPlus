import { useSyncExternalStore } from 'react';

// Tells the "Continue reading" bar that the search field of the Library has the focus, so that the bar can step aside: with the keyboard up it would float over the keys.
// The search field says so when it is touched and when it is left (SearchBar.tsx); the bar reads it (ContinueBar.tsx). A phone's keyboard also says when it opens and
// closes (the bar listens to that as well), but a browser has no such event and a phone with a keyboard attached shows none: the focus is the one thing that is the same
// everywhere. Same shape as lib/tabBarVisibility.ts: a value, the ones who listen, and a hook.
let focused = false;
const listeners = new Set<() => void>();

export const setSearchFocused = (value: boolean) => {
  if (focused === value) return;
  focused = value;
  listeners.forEach((l) => l());
};

export const useSearchFocused = (): boolean =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => focused, () => false);
