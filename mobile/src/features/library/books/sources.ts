// Where the passages of the books of readings come from: one entry for each public-domain edition named in the `sources` of a books/<id>/book.json, for the Licences screen
// (app/licences.tsx). Plain data, kept by hand: the fields are the ones of book.json (the id and the link are not in the app's copy of the book, so they are here), and
// __tests__/booksWiring.test.ts reads every books/*/book.json and fails when a source of a book is missing here, or says something else. The checked table, and the editions
// that were looked at and turned down, are in books/sources/SOURCES.md.
//
// The original text around the passages is not listed as a source: it was written for CaminoPlus, and who holds the rights is for the owner to say (books/series.md). The
// Licences screen says only that, and claims no licence for it.

export type ReadingSource = {
  /** The id of the source in book.json ("gutenberg-1653"). */
  id: string;
  work: string;
  author: string;
  /** The translator or editor, as book.json has it. */
  translator?: string;
  year?: string;
  licence: string;
  /** The page of the edition. */
  url: string;
  /** The book of readings that quotes it, and its title (what the screen says). */
  bookId: string;
  usedIn: string;
};

export const READING_SOURCES: readonly ReadingSource[] = [
  { id: 'gutenberg-1653', work: 'The Imitation of Christ', author: 'Thomas à Kempis', translator: 'William Benham', year: 'date not given in the file', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/1653', bookId: 'imitation-of-christ-readings', usedIn: 'The Quiet Road' },
  { id: 'gutenberg-3296', work: 'The Confessions of St. Augustine', author: 'Augustine of Hippo', translator: 'E. B. Pusey', year: '1838', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/3296', bookId: 'confessions-readings', usedIn: 'The Restless Heart' },
  { id: 'gutenberg-131', work: 'The Pilgrim\'s Progress', author: 'John Bunyan', translator: 'none (English original)', year: '1678', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/131', bookId: 'pilgrims-progress-readings', usedIn: 'The Slough and the City' },
  { id: 'gutenberg-1002', work: 'The Divine Comedy: Purgatory', author: 'Dante Alighieri', translator: 'Henry Wadsworth Longfellow', year: '1867', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/1002', bookId: 'purgatory-readings', usedIn: 'The Mountain of the Heart' },
  { id: 'gutenberg-13871', work: 'The Practice of the Presence of God the Best Rule of a Holy Life', author: 'Brother Lawrence', translator: 'anonymous translation from the French, Fleming H. Revell Company edition', year: 'undated old print edition', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/13871', bookId: 'presence-of-god-readings', usedIn: 'Present at Every Step' },
  { id: 'gutenberg-8294', work: 'The Psalms of Ascent (Psalms 120 to 134)', author: 'The psalmists (the headings name David and Solomon for some)', translator: 'World English Bible', year: 'modern translation', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/8294', bookId: 'songs-of-ascents-readings', usedIn: 'Songs for the Climb' },
  { id: 'gutenberg-52958', work: 'Revelations of Divine Love', author: 'Julian of Norwich', translator: 'Grace Warrack (editor; modernised text)', year: '1901', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/52958', bookId: 'revelations-readings', usedIn: 'All Shall Be Well' },
  { id: 'gutenberg-8120', work: 'The Life of St. Teresa of Jesus', author: 'Teresa of Ávila', translator: 'David Lewis', year: '1904 edition', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/8120', bookId: 'teresa-life-readings', usedIn: 'The Road to Ávila' },
  { id: 'gutenberg-24534', work: 'The Autobiography of St. Ignatius', author: 'Ignatius of Loyola', translator: 'edited by J. F. X. O\'Conor, S.J. (the edition names no translator)', year: '1900', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/24534', bookId: 'ignatius-pilgrim-readings', usedIn: 'The Pilgrim\'s Tale' },
  { id: 'gutenberg-1022', work: 'Walking', author: 'Henry David Thoreau', translator: 'none (English original)', year: '1862', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/1022', bookId: 'walking-readings', usedIn: 'Toward the Sunset' },
  { id: 'gutenberg-63084', work: 'St. Francis of Assisi', author: 'G. K. Chesterton', translator: 'none (English original)', year: '1923', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/63084', bookId: 'francis-readings', usedIn: 'The Poor Man of the Road' },
  { id: 'gutenberg-46921', work: 'The Thoughts of Blaise Pascal', author: 'Blaise Pascal', translator: 'C. Kegan Paul (edited by Auguste Molinier)', year: '1885', licence: 'Public domain', url: 'https://www.gutenberg.org/ebooks/46921', bookId: 'pascal-readings', usedIn: 'The Silence of the Heart' },
];

/** What the Licences screen says of the text the books are made of, apart from the passages: only where it comes from. */
export const ORIGINAL_TEXT = { name: 'The books of the Library', what: 'Original text written for CaminoPlus.' } as const;
