// The sample journey: what the My journey tab shows while a pilgrim has no posts of their own, so the grid, the
// full-screen viewer and the short clips can be seen working. The pictures and clips are AI-generated (Google Nano
// Banana 2 for the stills, Google Veo 3.1 for the clips, made through OpenArt; see assets/journey-sample/README.md).
// So everything that shows them says "Sample", and none of it is ever presented as a pilgrim's own photo.
//
// Pure data and rules, no React Native, so it is tested in plain node (npm run test:lib). The bundled files are
// attached in features/me/sampleJourneyAssets.ts.

export type SampleKey =
  | 'cobbled-street'
  | 'fog-hiker'
  | 'passport-stamp'
  | 'breakfast'
  | 'stone-bridge'
  | 'tired-feet'
  | 'wheat-arrow'
  | 'pilgrim-dinner'
  | 'ridge-cross'
  | 'fountain';

export type SampleItem = {
  key: SampleKey;
  /** Shown on the tile. General on purpose: the pictures are generated, they do not show these exact places. */
  place: string;
  body: string;
  /** true = a 6 second silent clip exists next to the picture; the picture is its poster. */
  video: boolean;
};

// An even number, so the two-column grid ends on a full row. Clips are mixed in between stills.
export const SAMPLE_JOURNEY: readonly SampleItem[] = [
  { key: 'cobbled-street', place: 'Start of the Camino', body: 'First yellow arrow, first cobbles. Boots on, here we go.', video: false },
  { key: 'fog-hiker', place: 'Pyrenees', body: 'Up into the fog. Legs say no, heart says yes.', video: true },
  { key: 'fountain', place: 'Village fountain', body: 'Refill at the village fountain.', video: true },
  { key: 'stone-bridge', place: 'Stone bridge', body: 'The old bridge at golden hour.', video: false },
  { key: 'passport-stamp', place: 'Albergue', body: 'Stamp number one in the credencial!', video: true },
  { key: 'tired-feet', place: 'Evening in the albergue', body: 'Blister plasters and a bunk. Worth every step.', video: false },
  { key: 'breakfast', place: 'Morning coffee', body: 'Café con leche and tostada. Best breakfast ever.', video: true },
  { key: 'pilgrim-dinner', place: 'Pilgrim dinner', body: 'Soup, bread and wine with new friends.', video: false },
  { key: 'wheat-arrow', place: 'Navarra fields', body: 'Just follow the yellow arrow.', video: true },
  { key: 'ridge-cross', place: 'Sunset ridge', body: 'The cross on the ridge at sunset.', video: true },
];

/** Above the grid. Says what this is and what to do next. */
export const SAMPLE_BANNER = 'Sample journey: AI-generated pictures and clips. Tap the pen to write your own first post.';
/** Inside the full-screen viewer, above the caption. */
export const SAMPLE_VIEWER_LABEL = 'Sample · AI-generated';

const ID_PREFIX = 'sample-';
export const sampleId = (key: SampleKey) => `${ID_PREFIX}${key}`;
export const isSampleId = (id: string) => id.startsWith(ID_PREFIX);
