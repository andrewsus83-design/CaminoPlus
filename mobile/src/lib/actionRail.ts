// The one action rail of the app, as data: what it shows, in which order and in which state. Discover (the standard) and
// the full-screen journey viewer both draw it with components/ActionRail.tsx from the items below, so the two cannot
// drift apart. Four 56 px circles in a column: love, bookmark, comments, share. No React Native imports on purpose: plain
// node tests cover all of it (npm run test:lib).
//
// Counts are honest. A count goes in only when it was read (from the database, or from the comments on this phone): a
// count that was never read (undefined, null, NaN, negative, text) shows nothing, never 0. A real 0 is shown. Compact
// counts ("1.2K", formatCount) are for the eye, the whole number is in the screen reader label.
import { countLabel, formatCount, isCount, type EngagementKind, type EngagementSource } from './engagement';

export type RailKind = 'love' | 'save' | 'comments' | 'share';

/** Top to bottom. This order is the standard (Discover): love, bookmark, comments, share. */
export const RAIL_ORDER: readonly RailKind[] = ['love', 'save', 'comments', 'share'];

export type RailIcon = 'heart' | 'bookmark' | 'chat' | 'share';

export type RailItem = {
  kind: RailKind;
  /** Name of the icon in components/Icon.tsx. */
  icon: RailIcon;
  /** Heart and bookmark 28, comments and share 26 (what Discover has always had). */
  iconSize: number;
  /** love is red, the other three are blue. The component turns this into the fixed colours. */
  tone: 'love' | 'action';
  /** love and bookmark: this person has done it, so the icon is filled. Always false for comments and share. */
  on: boolean;
  /** The count that was read, whole. Undefined when it was never read. */
  count?: number;
  /** Compact count under the icon ("1.2K"). Undefined with `count`. */
  countText?: string;
  /** Screen reader label: the action, the full count, and "not available yet" for a button that cannot work yet. */
  label: string;
  /** Cannot be pressed: the action is not available yet. */
  disabled: boolean;
};

export type RailInput = {
  loved?: boolean;
  saved?: boolean;
  /** Counts by button. `unknown` on purpose: whatever is not a count is treated as "never read". */
  counts?: Partial<Record<RailKind, unknown>>;
  /** Buttons that cannot work yet. They stay in the rail, disabled, and say so. */
  unavailable?: Partial<Record<RailKind, boolean>>;
};

/** The counts of a real post, by button: likes, bookmarks, comments, shares. What the post does not have stays undefined. */
export function railCounts(post: EngagementSource): Partial<Record<RailKind, number | undefined>> {
  return { love: post.like_count, save: post.save_count, comments: post.comment_count, share: post.share_count };
}

const ICON: Record<RailKind, RailIcon> = { love: 'heart', save: 'bookmark', comments: 'chat', share: 'share' };
const ICON_SIZE: Record<RailKind, number> = { love: 28, save: 28, comments: 26, share: 26 };
// The counts are of likes, bookmarks, comments and shares, whatever the button is called.
const NOUN: Record<RailKind, EngagementKind> = { love: 'likes', save: 'bookmarks', comments: 'comments', share: 'shares' };
const ACTION: Record<RailKind, (on: boolean) => string> = {
  love: (on) => (on ? 'Remove love' : 'Love'),
  save: (on) => (on ? 'Remove bookmark' : 'Bookmark'),
  comments: () => 'Comments',
  share: () => 'Share',
};

/** The four buttons, in rail order. */
export function railItems(input: RailInput = {}): RailItem[] {
  return RAIL_ORDER.map((kind) => {
    const on = kind === 'love' ? !!input.loved : kind === 'save' ? !!input.saved : false;
    const raw = input.counts?.[kind];
    const disabled = !!input.unavailable?.[kind];
    const item: RailItem = {
      kind,
      icon: ICON[kind],
      iconSize: ICON_SIZE[kind],
      tone: kind === 'love' ? 'love' : 'action',
      on,
      label: '',
      disabled,
    };
    if (isCount(raw)) {
      item.count = Math.floor(raw);
      item.countText = formatCount(raw);
    }
    item.label = [ACTION[kind](on), item.count === undefined ? '' : countLabel(NOUN[kind], item.count), disabled ? 'not available yet' : '']
      .filter(Boolean)
      .join(', ');
    return item;
  });
}
