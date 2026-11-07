// How the engagement of a post (likes, comments, shares, bookmarks) is counted and written: compact counts ("1.2K") and
// the words for screen readers. The one action rail of the app (lib/actionRail.ts) is built on these. No React Native
// imports on purpose: plain node tests cover all of it (npm run test:me).

/**
 * The numbers the rail is made of. A Post fits. Every count is optional because the rail only shows what it knows:
 * save_count and share_count come from their own query (see lib/postEngagement.ts) and are missing until the database
 * has them. A missing count is left out, never shown as 0.
 */
export type EngagementSource = {
  like_count?: number;
  comment_count?: number;
  save_count?: number;
  share_count?: number;
};

export type EngagementKind = 'likes' | 'comments' | 'shares' | 'bookmarks';

/** true for a real count: a finite number that is not negative. Anything else (null, NaN, "12", -1) is "not known". */
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

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
