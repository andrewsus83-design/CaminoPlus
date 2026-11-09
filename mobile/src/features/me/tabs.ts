// The sub-tabs of the Me screen, the one floating button of Me, and the words of the card that writes a journey post, as plain data: no React, no React
// Native, so plain node tests cover it (npm run test:me). app/(tabs)/me.tsx draws the strip from ME_TABS and the button from ME_FAB.
//
// The strip, left to right: Notes (the private diary as a feed: features/notes), Journey (the posts, which is the social part of Me), Plan and Health.
// Me opens on Journey, not on the first label: the highlights under the My Camino card lead to the Journey grid (from Plan, Health and Notes too), and
// the journey is what most people open Me for. Notes is simply the first label of the strip.
//
// ONE gold button floats over Me and it is the same on every sub-tab (components/Fab.tsx draws it, Me draws exactly one, never none and never two): the
// CHAT button, bottom right, above the tab bar. It opens the inbox (app/inbox.tsx), which holds the notifications, the messages and the groups, and it
// carries the unread badge that the bell used to carry in the header, whose top right now keeps only the gear. Writing no longer floats: on Journey the
// first card of the grid writes a journey post (features/me/JourneyGrid.tsx), and on Notes the card at the top of the feed writes a note (features/notes).

export const ME_TABS = ['Notes', 'Journey', 'Plan', 'Health'] as const;
export type MeTab = (typeof ME_TABS)[number];

/** The sub-tab Me opens on. */
export const DEFAULT_ME_TAB: MeTab = 'Journey';

/** The floating button of Me: which icon of components/Icon.tsx it shows, where it leads, what a screen reader says when nothing is unread, and what it does. */
export type MeFab = { icon: 'chat'; href: '/inbox'; label: string; hint: string };

export const INBOX_LABEL = 'Inbox';

/** The same button on Notes, Journey, Plan and Health. */
export const ME_FAB: MeFab = { icon: 'chat', href: '/inbox', label: INBOX_LABEL, hint: 'Opens your notifications, messages and groups' };

/** The card at the head of the Journey grid: it writes a journey post. It is a card of the grid, not a button that floats. */
export const JOURNEY_WRITE = { label: 'Write a journey post', href: '/write' } as const;
/** What the card looks like beyond its label (features/me/WriteCard.tsx): the invitation in the title type, and how strongly the gold shows, the wash over the
 * whole card and the large shell drawn as art behind the words. The words keep their contrast over both (tabs.test.ts mixes the colours). */
export const JOURNEY_WRITE_CARD = { prompt: 'What did you see today?', wash: 0.07, shell: 0.22 } as const;

/* ------------------------------------------------------------------------------------------------ the numbers of the chat button */

/** What the app knows is unread (features/social, useUnreadTotals). `total` is not needed here: the button works from the parts it was given. */
export type UnreadCounts = { notifications?: number; chats?: number; groups?: number };

/** The tabs of the inbox that the chat button opens on. app/inbox.tsx reads `?tab=`: `messages` is its Messages tab, anything but `messages` and `groups` is Notifications. */
export type InboxTab = 'messages' | 'notifications';

/** A count that can be shown: a whole number, never below 0; anything that is not a number (the server sent nothing yet) is 0. */
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/**
 * The tab of the inbox the chat button opens on, by what waits there: Messages when a chat or a group has something unread, else Notifications when a
 * notification does, else Messages (a chat button opens the chats when nothing is new). Messages is also where a group message that is unread is looked
 * for first: its Groups tab shows its own number next to it.
 */
export function inboxTab(unread: UnreadCounts | null | undefined): InboxTab {
  if (count(unread?.chats) + count(unread?.groups) > 0) return 'messages';
  return count(unread?.notifications) > 0 ? 'notifications' : 'messages';
}

/** The most the badge shows as a number; more says "99+". */
export const BADGE_MAX = 99;

/** The text of the badge on the chat button: '' for none (no badge is drawn), the number up to 99, and "99+" above (the design page says 99+). */
export function badgeText(total: unknown): string {
  const n = count(total);
  if (n === 0) return '';
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(n);
}

/** What a screen reader says for the chat button: "Inbox", or "Inbox, 3 unread" with the real number (the badge is the one that is capped). */
export function inboxLabel(total: unknown): string {
  const n = count(total);
  return n > 0 ? `${INBOX_LABEL}, ${n} unread` : INBOX_LABEL;
}
