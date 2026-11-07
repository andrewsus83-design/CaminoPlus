// The engagement stats of a journey post (likes, comments, shares, bookmarks): compact counts and the list
// of stats the viewer shows. No React Native imports on purpose: plain node tests cover all of it
// (npm run test:me).

/**
 * The numbers the stats are made of. A Post fits. Every count is optional because the viewer only shows
 * what it knows: save_count and share_count come from their own query (see lib/postEngagement.ts) and are
 * missing until the database has them. A missing count is left out, never shown as 0.
 */
export type EngagementSource = {
  like_count?: number;
  comment_count?: number;
  save_count?: number;
  share_count?: number;
};

export type EngagementKind = 'likes' | 'comments' | 'shares' | 'bookmarks';

export type EngagementItem = {
  kind: EngagementKind;
  /** Name of the icon in components/Icon.tsx. */
  icon: 'heart' | 'chat' | 'share' | 'bookmark';
  count: number;
  /** Compact, for under the icon: 1,234 -> "1.2K". */
  text: string;
  /** Whole number in words, for screen readers: "1,234 likes". */
  label: string;
};

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

const UNITS = [
  { size: 1e9, suffix: 'B' },
  { size: 1e6, suffix: 'M' },
  { size: 1e3, suffix: 'K' },
] as const;

/**
 * A count the way social apps write it: 999 -> "999", 1,234 -> "1.2K", 12,345 -> "12.3K", 1,000,000 -> "1M".
 * One decimal at most, and rounded down, so the figure is never more than the real count (999,999 is
 * "999.9K", never "1000K"). Something that is not a count (NaN, negative) gives "" rather than a made-up number.
 */
export function formatCount(n: number): string {
  if (!isCount(n)) return '';
  const v = Math.floor(n);
  for (const u of UNITS) {
    if (v >= u.size) {
      const tenths = Math.floor(v / (u.size / 10));
      const whole = Math.floor(tenths / 10);
      const frac = tenths % 10;
      return `${whole}${frac ? `.${frac}` : ''}${u.suffix}`;
    }
  }
  return String(v);
}

const NOUNS: Record<EngagementKind, [one: string, many: string]> = {
  likes: ['like', 'likes'],
  comments: ['comment', 'comments'],
  shares: ['share', 'shares'],
  bookmarks: ['bookmark', 'bookmarks'],
};

/** "1 like", "12 likes", "1,234 likes": the full number, for screen readers. */
export function countLabel(kind: EngagementKind, n: number): string {
  const v = Math.floor(n);
  const [one, many] = NOUNS[kind];
  return `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${v === 1 ? one : many}`;
}

/** The stats to show, in rail order: heart, comment bubble, share arrow, bookmark. Counts that are not known are left out. */
export function engagementItems(post: EngagementSource): EngagementItem[] {
  const rows: [EngagementKind, EngagementItem['icon'], unknown][] = [
    ['likes', 'heart', post.like_count],
    ['comments', 'chat', post.comment_count],
    ['shares', 'share', post.share_count],
    ['bookmarks', 'bookmark', post.save_count],
  ];
  const items: EngagementItem[] = [];
  for (const [kind, icon, v] of rows) {
    if (isCount(v)) items.push({ kind, icon, count: Math.floor(v), text: formatCount(v), label: countLabel(kind, v) });
  }
  return items;
}
