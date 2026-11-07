import type { Post, PostMediaUrl } from '@/lib/api';
import { SAMPLE_JOURNEY, sampleId, type SampleKey } from '@/lib/sampleJourney';

// The bundled files of the sample journey (see lib/sampleJourney.ts for what it is and why it is labelled).
// Metro gives every require() an asset id (a number). Image and expo-video take that id directly, which works offline
// and in release builds, so no URL is ever needed.

/** One picture or clip. `source` is what to show or play; `poster` is the still picture (the first frame of a clip). */
export type SampleVisual = PostMediaUrl & { source: number; poster: number };

/* eslint-disable @typescript-eslint/no-require-imports */
const IMAGE: Record<SampleKey, number> = {
  'cobbled-street': require('../../../assets/journey-sample/cobbled-street.webp'),
  'fog-hiker': require('../../../assets/journey-sample/fog-hiker.webp'),
  'passport-stamp': require('../../../assets/journey-sample/passport-stamp.webp'),
  breakfast: require('../../../assets/journey-sample/breakfast.webp'),
  'stone-bridge': require('../../../assets/journey-sample/stone-bridge.webp'),
  'tired-feet': require('../../../assets/journey-sample/tired-feet.webp'),
  'wheat-arrow': require('../../../assets/journey-sample/wheat-arrow.webp'),
  'pilgrim-dinner': require('../../../assets/journey-sample/pilgrim-dinner.webp'),
  'ridge-cross': require('../../../assets/journey-sample/ridge-cross.webp'),
  fountain: require('../../../assets/journey-sample/fountain.webp'),
};
// Only the keys that have `video: true` in SAMPLE_JOURNEY; the test in lib/__tests__/sampleJourney.test.ts checks the files exist.
const VIDEO: Partial<Record<SampleKey, number>> = {
  'fog-hiker': require('../../../assets/journey-sample/fog-hiker.mp4'),
  'passport-stamp': require('../../../assets/journey-sample/passport-stamp.mp4'),
  breakfast: require('../../../assets/journey-sample/breakfast.mp4'),
  'wheat-arrow': require('../../../assets/journey-sample/wheat-arrow.mp4'),
  'ridge-cross': require('../../../assets/journey-sample/ridge-cross.mp4'),
  fountain: require('../../../assets/journey-sample/fountain.mp4'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

function build() {
  const posts: Post[] = [];
  const media: Record<string, SampleVisual[]> = {};
  for (const s of SAMPLE_JOURNEY) {
    const id = sampleId(s.key);
    const clip = s.video ? VIDEO[s.key] : undefined;
    // No dates and no counts: a sample has not been published and nobody has liked it.
    posts.push({ id, body: s.body, place_name: s.place, published_at: null, like_count: 0, comment_count: 0, media_count: 1, health_summary: null });
    media[id] = [clip !== undefined
      ? { type: 'video', url: '', source: clip, poster: IMAGE[s.key] }
      : { type: 'image', url: '', source: IMAGE[s.key], poster: IMAGE[s.key] }];
  }
  return { posts, media };
}

/** Built once: the same objects every time, so the grid does not re-render for nothing. */
export const SAMPLE = build();
