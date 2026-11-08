// The twelve free books of the Books tab, chosen by the owner: classics that are good companions on the Camino. They are in the
// order the owner gave them, as one flat list. Whether a book has a text in the app is NOT said here: bookText.ts is the only place that
// knows (`hasBookText(id)`), because the texts come from their own data files and a field kept by hand here would drift from them.
// A book with a text says "Free" on its cover and opens in the reader; one without says "Soon" and why (its edition is still being
// checked, see copy.ts). Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark);
// a cover names its colour and the screen looks it up when it draws. Pure: no React, no React Native.
//
// What is on screen, per book: the cover (colour and glyph, drawn by BookCover.tsx), the title, the author, the era, the blurb, and the
// marks "Free" and "Soon". Everything else is DATA ONLY and is never drawn by any component (a test reads every screen file to make sure of it):
//   group             how the owner sorted the twelve; the list on screen is flat, with no headings
//   source            a page where an edition can be read, once the edition is chosen and checked; absent until then
//   licenceFlag       'check-edition' when the edition we would use may still be protected somewhere, else 'public-domain-original'
//   licenceNote       why, in one or two sentences, for whoever picks the editions later
//   editionToConfirm  what must be confirmed about the edition before the book goes into the app
// An id is stable and lower case, because a bookmark is kept under it ("books:confessions", see ../search.ts itemKey) and so is the place
// where a person stopped reading it (see reading.ts).

export type CoverColour = 'goldSoft' | 'blue100' | 'successWash' | 'red100' | 'sand300' | 'goldWash';

/** The glyphs of the covers: names of icons of components/Icon.tsx (the compiler checks it where a cover is drawn, a test checks it too). */
export type CoverIcon = 'shell' | 'heart' | 'sun' | 'moon' | 'building' | 'explore' | 'book' | 'library' | 'shield' | 'pen' | 'chat' | 'star';

export type BookGroup = 'Pilgrims on foot' | 'Spanish and contemplative' | 'Reflection and inner peace' | 'Great classics';

export type LicenceFlag = 'check-edition' | 'public-domain-original';

export type CatalogBook = {
  id: string;
  title: string;
  author: string;
  /** When it was written, in the owner's words: "19th century", "1565", "1522 to 1524", "c. 400". */
  era: string;
  /** The one line under a book on screen. */
  blurb: string;
  /** Every book of the list is free to read. */
  free: true;
  cover: CoverColour;
  icon: CoverIcon;
  group: BookGroup;
  source?: string;
  licenceFlag: LicenceFlag;
  licenceNote: string;
  editionToConfirm: string;
};

const CONFIRM = 'to confirm: translator and year of the edition at the source';
const EDITION_TO_FIND = 'edition to find';

export const BOOK_CATALOG: readonly CatalogBook[] = [
  {
    id: 'way-of-a-pilgrim', title: 'The Way of a Pilgrim', author: 'Anonymous', era: '19th century',
    blurb: 'A Russian wanderer walks and prays the Jesus Prayer.', free: true, cover: 'goldSoft', icon: 'shell', group: 'Pilgrims on foot',
    source: 'https://ccel.org/ccel/philip_allan/pilgrim', licenceFlag: 'check-edition',
    licenceNote: 'CCEL page shows no translator, year or licence; the 1930 R. M. French translation (Philip Allan) is only just public domain in the US; other countries unchecked.',
    editionToConfirm: CONFIRM,
  },
  {
    id: 'life-of-st-teresa', title: 'The Life of St. Teresa of Jesus', author: 'Teresa of Ávila', era: '1565',
    blurb: 'Her own story, written in Spain: prayer, struggle and courage.', free: true, cover: 'blue100', icon: 'heart', group: 'Pilgrims on foot',
    source: 'https://www.gutenberg.org/ebooks/8120', licenceFlag: 'public-domain-original',
    licenceNote: 'Translator David Lewis (1814-1895); Gutenberg: public domain in the USA.',
    editionToConfirm: CONFIRM,
  },
  {
    id: 'little-flowers', title: 'The Little Flowers of Saint Francis', author: 'Anonymous', era: '14th century',
    blurb: 'Simple, warm stories of Francis and his brothers on the road.', free: true, cover: 'successWash', icon: 'sun', group: 'Pilgrims on foot',
    licenceFlag: 'public-domain-original', licenceNote: EDITION_TO_FIND, editionToConfirm: CONFIRM,
  },
  {
    id: 'dark-night', title: 'Dark Night of the Soul', author: 'John of the Cross', era: '16th century',
    blurb: 'For lonely or doubting days: a poem and its guide, from Spain.', free: true, cover: 'red100', icon: 'moon', group: 'Spanish and contemplative',
    licenceFlag: 'public-domain-original', licenceNote: EDITION_TO_FIND, editionToConfirm: CONFIRM,
  },
  {
    id: 'interior-castle', title: 'The Interior Castle', author: 'Teresa of Ávila', era: '1577',
    blurb: 'The soul as a castle of seven rooms, to read a chapter at a time.', free: true, cover: 'sand300', icon: 'building', group: 'Spanish and contemplative',
    licenceFlag: 'public-domain-original', licenceNote: EDITION_TO_FIND, editionToConfirm: CONFIRM,
  },
  {
    id: 'spiritual-exercises', title: 'The Spiritual Exercises', author: 'Ignatius of Loyola', era: '1522 to 1524',
    blurb: 'A guide to prayer begun at Manresa, in Spain.', free: true, cover: 'goldWash', icon: 'explore', group: 'Spanish and contemplative',
    licenceFlag: 'public-domain-original', licenceNote: 'edition to find; Gutenberg 70790 is a Jesuit adaptation by Coppens, not the plain translation', editionToConfirm: CONFIRM,
  },
  {
    id: 'imitation-of-christ', title: 'The Imitation of Christ', author: 'Thomas à Kempis', era: 'c. 1420',
    blurb: 'Short, sharp counsels on humility and the daily cross.', free: true, cover: 'goldSoft', icon: 'book', group: 'Reflection and inner peace',
    source: 'https://www.gutenberg.org/ebooks/1653', licenceFlag: 'public-domain-original',
    licenceNote: 'Translator William Benham (1831-1910); Gutenberg: public domain in the USA.',
    editionToConfirm: CONFIRM,
  },
  {
    id: 'devout-life', title: 'Introduction to the Devout Life', author: 'Francis de Sales', era: '1609',
    blurb: 'Practical holiness for ordinary people in the middle of life.', free: true, cover: 'blue100', icon: 'library', group: 'Reflection and inner peace',
    licenceFlag: 'public-domain-original', licenceNote: EDITION_TO_FIND, editionToConfirm: CONFIRM,
  },
  {
    id: 'abandonment-to-providence', title: 'Abandonment to Divine Providence', author: 'Jean-Pierre de Caussade', era: '18th century',
    blurb: 'Giving each moment to God: calm for tired and lost days.', free: true, cover: 'successWash', icon: 'shield', group: 'Reflection and inner peace',
    source: 'https://www.gutenberg.org/ebooks/52057', licenceFlag: 'public-domain-original',
    licenceNote: "Translator Ella McMahon, editor H. Ramiere; Gutenberg: public domain in the USA; translator's death year to check for other countries.",
    editionToConfirm: CONFIRM,
  },
  {
    id: 'confessions', title: 'Confessions', author: 'Augustine of Hippo', era: 'c. 400',
    blurb: 'The great story of a restless heart finding rest in God.', free: true, cover: 'red100', icon: 'pen', group: 'Great classics',
    source: 'https://www.gutenberg.org/ebooks/3296', licenceFlag: 'public-domain-original',
    licenceNote: 'Translator E. B. Pusey (1800-1882); Gutenberg: public domain in the USA.',
    editionToConfirm: CONFIRM,
  },
  {
    id: 'dialogue-of-st-catherine', title: 'The Dialogue of Saint Catherine of Siena', author: 'Catherine of Siena', era: '1370',
    blurb: 'A conversation with God, and Christ as the bridge.', free: true, cover: 'sand300', icon: 'chat', group: 'Great classics',
    licenceFlag: 'public-domain-original', licenceNote: 'English edition to find', editionToConfirm: CONFIRM,
  },
  {
    id: 'story-of-a-soul', title: 'The Story of a Soul', author: 'Thérèse of Lisieux', era: '1898',
    blurb: 'The little way: love in small things, even a smile when tired.', free: true, cover: 'goldWash', icon: 'star', group: 'Great classics',
    source: 'https://www.gutenberg.org/ebooks/16772', licenceFlag: 'check-edition',
    licenceNote: 'Translator Thomas N. Taylor (1873-1963), 1912; Gutenberg: public domain in the USA; the translator died in 1963, so outside the US the translation may be protected until 2033.',
    editionToConfirm: CONFIRM,
  },
];

const NO_BREAK_SPACE = '\u00a0';

/**
 * "Thomas à Kempis · c. 1420": the line under a title. The era is joined with no-break spaces, so when the line has to wrap it wraps before
 * "16th century" and "1522 to 1524", never inside them ("century" alone on a second line).
 */
export const bookByline = (b: Pick<CatalogBook, 'author' | 'era'>): string => `${b.author} · ${b.era.replace(/ /g, NO_BREAK_SPACE)}`;

/** The book with this id, or undefined (an old or a wrong link). */
export const bookById = (id: string | null | undefined): CatalogBook | undefined => BOOK_CATALOG.find((b) => b.id === id);
