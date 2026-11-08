// The sub-tabs of the Me screen and the one floating button that goes with each of them, as plain data: no React, no React Native, so plain
// node tests cover it (npm run test:me). app/(tabs)/me.tsx draws the strip from ME_TABS and the button from ME_FAB.
//
// The strip, left to right: Notes (the private diary as a feed: features/notes), Journey (the posts, which is the social part of Me), Plan and Health.
// Me opens on Journey, not on the first label: the highlights under the My Camino card lead to the Journey grid (from Plan, Health and Notes too), and
// the journey is what most people open Me for. Notes is simply the first label of the strip.
//
// One gold button floats at a time, and it follows the sub-tab (components/Fab.tsx draws it, Me draws exactly one): on Notes it writes a note, on
// Journey it writes a journey post, and on Plan and Health there is none. So Me never has two write buttons.

export const ME_TABS = ['Notes', 'Journey', 'Plan', 'Health'] as const;
export type MeTab = (typeof ME_TABS)[number];

/** The sub-tab Me opens on. */
export const DEFAULT_ME_TAB: MeTab = 'Journey';

/** The floating button of a sub-tab: what a screen reader says, which icon of components/Icon.tsx it shows, and where it leads. */
export type MeFab = { label: string; icon: 'pen' | 'compose'; href: '/diary/new' | '/write' };

export const ME_FAB: Record<MeTab, MeFab | null> = {
  Notes: { label: 'Write a note', icon: 'compose', href: '/diary/new' },
  Journey: { label: 'Write a journey post', icon: 'pen', href: '/write' },
  Plan: null,
  Health: null,
};
