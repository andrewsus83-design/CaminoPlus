// Source-level checks of the Books screens (the Books tab with its covers and banner, the book page, the reader, the places kept on the phone), in the style of
// wiring.test.ts: they read the files, nothing is run. What the pure parts do (the neighbours of a chapter, the saved place, the text sizes, the A5 covers and how
// their words are fitted, the three states of the banner) is checked in reading.test.ts; here it is that the screens use them the way they must: a cover is ONE button
// and its ribbon another, nothing is cut off or enlarged past what the cover can hold, the four fonts of the brand are used in their roles and the handwritten
// one once a screen, no colour of its own, every touch target 44 or more, Previous and Next replace the screen and Contents goes back to the page, nothing is saved
// before the person has been put back where they were, what is kept stays on the phone, and a book without text says so and why.
// Run: npm run test:library (wiring.test.ts runs this file too).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOOK_CATALOG } from '../books/catalog';
import { a5Height, coverGrid, coverLabel, coverMetrics } from '../books/cover';
import { DEFAULT_STEP, LAST_STEP, readerType } from '../books/readerType';
import { fontPath, readFont } from '../../../lib/__tests__/fontFile';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

const DIR = 'src/features/library/books';
const B = (f: string) => `${DIR}/${f}`;
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

/** The files of this feature that are mine: the screens and what they use. (catalog.ts reads the bundle that tools/build_books.py makes, and index.ts, sources.ts and notices.ts are plain data.) */
const SCREENS = ['BookCover.tsx', 'BookPage.tsx', 'BookRows.tsx', 'BookUi.tsx', 'BooksBanner.tsx', 'BooksGrid.tsx', 'ChapterFooter.tsx', 'PassageActions.tsx', 'PassageRows.tsx', 'Reader.tsx', 'ReaderBar.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx'];
const LOGIC = ['copy.ts', 'cover.ts', 'index.ts', 'notices.ts', 'passages.ts', 'readerType.ts', 'reading.ts', 'sources.ts', 'typeMetrics.ts'];
const HOOKS = ['readingStore.ts', 'safeText.ts', 'useBooksReading.ts', 'useReaderSize.ts', 'useReadingWriter.ts'];
const MINE = [...SCREENS, ...LOGIC, ...HOOKS];
const ROUTES = ['app/library/book/[id]/index.tsx', 'app/library/book/[id]/read.tsx'];
const sources = (): Record<string, string> => Object.fromEntries([...MINE.map((f) => [f, code(read(B(f)))] as const), ...ROUTES.map((f) => [f, code(read(f))] as const)]);
const src = sources();

check('the Books feature is the files this test expects: every file of the books folder is one of mine or the catalog\'s (a new one is looked at by the scans below)', () => {
  const theirs = ['catalog.ts'];
  const inFolder = fs.readdirSync(path.join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).sort();
  assert.deepEqual(inFolder, [...MINE, ...theirs].sort());
  for (const r of ROUTES) assert.ok(fs.existsSync(path.join(root, r)), r);
});

check('the pure files stay pure: reading, covers, sizes, metrics and words import nothing but each other and the plain data of the feature (no React, no React Native, no theme, no store)', () => {
  for (const f of LOGIC) {
    for (const m of src[f].matchAll(/^import [^;]*? from '([^']+)';/gm)) assert.match(m[1], /^\.\.?\//, `${f} imports ${m[1]}`);
    assert.doesNotMatch(src[f], /from '\.\.?\/[^']*(?:\.tsx|bookBundle|catalog'|safeText|readingStore|use[A-Z])/, `${f} reaches a screen, a hook or the bundle of the books`);
  }
  assert.doesNotMatch(src['copy.ts'], /from '\.\.\//, 'copy.ts reads no file of the Library: it is told what it needs');
});

check('no new native module and no network: the Books files import React, React Native, expo-router, the safe-area module and the app\'s own files, and never fetch, link out or touch the account', () => {
  const allowed = /^(react|react-native|expo-router|react-native-safe-area-context)$|^\.{1,2}\/|^@\//;
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/^import [^;]*? from '([^']+)';/gm)) assert.match(m[1], allowed, `${f}: ${m[1]}`);
    assert.doesNotMatch(s, /\bfetch\(|XMLHttpRequest|WebSocket|supabase|lib\/api|lib\/net|Linking|expo-web-browser|expo-file-system|\bPlatform\./, `${f}: the Books screens use no network and no platform of their own`);
  }
  assert.doesNotMatch(src['readingStore.ts'], /supabase|fetch\(/);
});

check('the Books files use no console, no interval, no StyleSheet.create and no timer but the one that waits to save a place (colours are read while drawing, so dark mode follows)', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /\bconsole\.|StyleSheet\.create|\bsetInterval\(/, f);
    if (f !== 'useReadingWriter.ts') assert.doesNotMatch(s, /\bsetTimeout\(/, `${f}: the only timer is the one that waits to save a place`);
  }
  assert.equal(count(src['useReadingWriter.ts'], /\bsetTimeout\(/g), 1);
  assert.equal(count(src['useReadingWriter.ts'], /\bclearTimeout\(/g), 2, 'a timer is cleared when another is set and when the place is written');
});

/* ================================================================ colours */

check('no colour of its own: no hex, no rgb(a) of numbers, no named colour but "transparent", in any Books file; the fixed palette is read in the cover and nowhere else', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d|hsla?\(|['"](?:white|black|red|blue|gold|gray|grey|navy)['"]/i, `${f}: a colour of its own`);
    if (f !== 'BookCover.tsx') assert.doesNotMatch(s, /\bfixed\b|\bFIXED\b/, `${f}: the fixed palette is for the paper of a cover`);
  }
  const cover = src['BookCover.tsx'];
  assert.match(cover, /import \{ fixed, shadowStyle \} from '@\/theme';/);
  assert.match(cover, /const INK = fixed\.blue;/, 'what is printed on a cover is the navy of the brand');
  assert.match(cover, /const paper = fixed\[book\.cover\.colour\]/, 'the colour of a cover is the one the book names, one of the six');
  assert.doesNotMatch(cover, /\brole\.|\bc\.(?!\w*Bright)/, 'a cover does not change with light and dark: no role, no flipping palette colour');
  assert.match(cover, /fixed\.goldBright/, 'the ribbon of a bookmarked book is the bright gold');
  for (const f of ['BookPage.tsx', 'BookRows.tsx', 'BookUi.tsx', 'ChapterFooter.tsx', 'ReaderBar.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx', 'Reader.tsx']) {
    assert.match(src[f], /\brole\./, `${f} draws with the roles of the theme`);
  }
});

/* ================================================================ the four fonts */

check('the four fonts keep their roles, as the brand design system says: Fraunces for titles, Inter for the text, JetBrains Mono for numbers, Caveat for one note a screen; the screens use the variants of AppText and never a family of their own', () => {
  const theme = read('src/theme/index.ts');
  assert.match(theme, /title: 'Fraunces_600SemiBold'/);
  assert.match(theme, /body: 'Inter_400Regular'/);
  assert.match(theme, /mono: 'JetBrainsMono_400Regular'/);
  assert.match(theme, /accent: 'Caveat_700Bold'/);
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { font: Record<string, string>; text: Record<string, { font: string }> };
  assert.deepEqual([tokens.font.title, tokens.font.body, tokens.font.mono, tokens.font.accent], ['Fraunces', 'Inter', 'JetBrains Mono', 'Caveat']);
  for (const v of ['display', 'h1', 'h2', 'h3', 'h4']) assert.equal(tokens.text[v].font, 'title', `${v} is Fraunces`);
  for (const v of ['lead', 'body', 'small', 'label', 'caption']) assert.equal(tokens.text[v].font, 'body', `${v} is Inter`);
  assert.equal(tokens.text.mono.font, 'mono');
  assert.equal(tokens.text.accent.font, 'accent');
  const layout = read('app/_layout.tsx');
  for (const font of ['Fraunces_600SemiBold', 'Inter_400Regular', 'JetBrainsMono_400Regular', 'Caveat_700Bold']) assert.match(layout, new RegExp(`\\b${font}\\b`), `${font} is loaded`);
  for (const [f, s] of Object.entries(src)) assert.doesNotMatch(s, /fontFamily|fonts\.(title|body|bodyMedium|bodyBold|mono|accent)|\bfontWeight\b/, `${f}: a font of its own where a variant exists`);
});

check('each text is in its role: titles and headings are the Fraunces variants (h1 to h4), the numbers, the era and the chips are mono, the running text of the reader and the page is Inter', () => {
  const cover = src['BookCover.tsx'];
  assert.match(cover, /variant="h4"[^\n]*(?:\n[^\n]*){0,2}color=\{INK\}[\s\S]{0,200}text\.title\.lines\.join/, 'the title of a cover is Fraunces');
  assert.match(cover, /variant="label"[\s\S]{0,420}text\.kind\.lines\.join/, 'the kind of book is Inter, in small spaced capitals');
  assert.match(cover, /variant="mono"[^\n]*>\{text\.time\}</, 'the time is JetBrains Mono');
  const page = src['BookPage.tsx'];
  assert.match(page, /<AppText variant="h3" accessibilityRole="header" style=\{\{ textAlign: 'center' \}\}>\{book\.title\}<\/AppText>/, 'the title of the book is Fraunces');
  assert.match(page, /<AppText variant="mono" color=\{role\.muted\} style=\{\{ fontSize: 12, lineHeight: 16, letterSpacing: 1 \}\}>\{kindName\(kind\)\.toUpperCase\(\)\}<\/AppText>/, 'the kind of book is a mono mark');
  assert.match(page, /bookFacts\(book\.chapters\.length, book\.words\)/, 'the chapters, words and reading time are mono');
  assert.match(page, /<AppText variant="mono" muted style=\{\{ fontSize: 14, lineHeight: 20 \}\}>\{`\$\{chapters\.length\}/);
  assert.match(page, /<View accessible accessibilityRole="header" accessibilityLabel=\{g\.part\} style=\{\{ gap: 2, marginTop: gi === 0 \? 0 : 8 \}\}>/, 'a part is one heading for a screen reader, with its whole name');
  assert.match(page, /<AppText variant="h4" style=\{\{ fontSize: 19, lineHeight: 25 \}\}>\{partName\(g\.part\)\}<\/AppText>/, 'a part is a heading in Fraunces: its name');
  assert.match(page, /\{!!partSubtitle\(g\.part\) && <AppText variant="small" muted numberOfLines=\{4\}/, 'and what it is about under it, in Inter, in at most four lines');
  assert.match(page, /<AppText variant="mono" muted style=\{\{ width: 28, textAlign: 'right'/, 'the number of a chapter is mono');
  assert.match(page, /<AppText variant="label">\{label\}<\/AppText>/, 'the chapter in the contents is Inter');
  const reader = src['Reader.tsx'];
  assert.match(reader, /<AppText variant="h3" maxFontSizeMultiplier=\{face\.maxMultiplier\}[^>]*>\{head\.label\}<\/AppText>/, 'the title of a chapter is Fraunces');
  assert.match(reader, /const face = head\.label\.length > LONG_LABEL \? type\.heading : type\.title;/, 'a label that is a whole sentence is set in the size of a heading, not of a title');
  assert.match(reader, /<AppText variant="mono" muted maxFontSizeMultiplier=\{type\.meta\.maxMultiplier\}[^>]*>\{`\$\{readingTime\(words\)\} · \$\{groupThousands\(words\)\} words`\}<\/AppText>/, 'the time and the words are mono');
  const blocks = src['ReaderBlocks.tsx'];
  for (const name of ['Paragraph', 'Quotation', 'List']) {
    const from = blocks.indexOf(`const ${name} = memo(`);
    assert.ok(from >= 0, name);
    const body = blocks.slice(from, blocks.indexOf('\n});', from));
    assert.doesNotMatch(body, /variant=/, `${name}: the running text of the reader is Inter, the body variant of AppText`);
  }
  assert.doesNotMatch(blocks, /variant="(?:mono|accent)"/, 'no mono and no handwriting in the words of a chapter');
  assert.match(blocks, /<AppText variant="h4" accessibilityRole="header"/, 'a heading inside a chapter is Fraunces and a heading for a screen reader');
  const bar = src['ReaderBar.tsx'];
  assert.match(bar, /<AppText variant="mono" muted numberOfLines=\{1\}[^>]*>\{positionLine\(nav\)\}<\/AppText>/, '"Chapter 7 of 40" is mono');
  assert.match(bar, /<AppText variant="label" numberOfLines=\{1\}[^>]*>\{bookTitle\}<\/AppText>/, 'the title of the book in the bar at the bottom is Inter');
  const footer = src['ChapterFooter.tsx'];
  assert.match(footer, /<AppText variant="mono"[^>]*textTransform: 'uppercase'/, 'NEXT and PREVIOUS are mono');
});

check('the handwritten font, Caveat Bold, is one short note on a screen, max one, and never in a button or in running text: the Books tab, the book page and the reader each have one at most', () => {
  const accent = (f: string) => count(src[f], /variant="accent"/g);
  // the Books tab: the one note is the banner's (CompactBanner draws it, beside the gold pill), and nothing else of the tab is handwritten
  for (const f of ['BookCover.tsx', 'BooksGrid.tsx', 'BookRows.tsx', 'BookUi.tsx']) assert.equal(accent(f), 0, `${f}: the Books tab has one handwritten note, the banner's`);
  const banner = src['BooksBanner.tsx'];
  assert.equal(count(banner, /note=\{view\.note\}/g), 1);
  assert.match(banner, /if \(view\.kind === 'none'\) return <CompactBanner label=\{view\.label\} title=\{view\.title\} line=\{view\.line\} \/>;/, 'no note when there is no button: the plain line says the texts are being checked');
  // the book page and the reader: one each
  assert.equal(accent('BookPage.tsx'), 1);
  assert.equal(accent('ChapterFooter.tsx'), 1);
  for (const f of ['Reader.tsx', 'ReaderBar.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx']) assert.equal(accent(f), 0, `${f}: the reader's one note is at the end of the chapter`);
  // and it is a few words, drawn alone, outside every button
  for (const f of ['BookPage.tsx', 'ChapterFooter.tsx']) {
    const at = src[f].indexOf('variant="accent"');
    const before = src[f].slice(0, at);
    assert.ok(count(before, /<Pressable\b/g) <= count(before, /<\/Pressable>/g) + (f === 'ChapterFooter.tsx' ? 0 : 0), `${f}: the handwritten note is not inside a button`);
    assert.match(src[f].slice(at - 20, at + 160), /<AppText variant="accent" color=\{role\.accentText\} style=\{\{ textAlign: 'center'/, `${f}: drawn alone, in the accent colour of the text`);
  }
  const { START_NOTE, CONTINUE_NOTE } = { START_NOTE: /START_NOTE = '([^']+)'/.exec(src['copy.ts'])![1], CONTINUE_NOTE: /CONTINUE_NOTE = '([^']+)'/.exec(src['copy.ts'])![1] };
  const pageNotes = /PAGE_NOTE: Record<BookKind, string> = \{ guide: '([^']+)', reflection: '([^']+)' \}/.exec(src['copy.ts'])!.slice(1);
  const notes = [START_NOTE, CONTINUE_NOTE, ...pageNotes, /CHAPTER_NOTE = '([^']+)'/.exec(src['ChapterFooter.tsx'])![1], /BOOK_NOTE = '([^']+)'/.exec(src['ChapterFooter.tsx'])![1]];
  for (const note of notes) assert.ok(note.split(' ').length <= 5 && note.length <= 24, `"${note}" is a few words`);
  for (const note of [START_NOTE, CONTINUE_NOTE]) assert.ok(note.length <= 7, `"${note}": the note beside the pill on a 320 phone has room for about seven characters`);
});

/* ================================================================ the cover and the grid */

check('a cover is ONE button labelled "title, kind of book, time" and its ribbon is another button beside it, never inside it; a small cover is no button and has no ribbon', () => {
  const cover = src['BookCover.tsx'];
  assert.match(cover, /accessibilityLabel=\{coverLabel\(book\)\}/);
  assert.match(cover, /accessibilityRole="button"\s+accessibilityLabel=\{coverLabel\(book\)\}/);
  assert.match(cover, /onPress=\{\(\) => onOpen\(book\.id\)\}/);
  const body = cover.indexOf('const body = (');
  const pressable = cover.indexOf('const cover = onOpen ? (');
  const ribbon = cover.indexOf('{onBookmark && !thumb && <Ribbon');
  assert.ok(body > 0 && pressable > body && ribbon > pressable, 'the ribbon is drawn after the button, in the same box, not in the body of the cover');
  assert.equal(count(cover.slice(body, pressable), /<Ribbon\b/g), 0, 'no button inside the cover that is a button');
  assert.match(cover, /accessibilityLabel=\{bookmarkLabel\(on, title\)\}/, 'the ribbon says what the tap does, like every bookmark of the Library');
  assert.match(cover, /import \{ bookmarkLabel \} from '\.\.\/BookmarkToggle';/);
  assert.match(cover, /\) : \(\s*<View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\{ flex: 1 \}\}>\{body\}<\/View>/, 'a cover that is no button is a picture, hidden from a screen reader');
  assert.match(cover, /\{thumb \? \(/);
});

check('a cover is drawn as a book: a spine with a groove and the shade of the hinge, page edges, a small radius, the shadow of the theme under it, and the ribbon is 44 by 44 with a notch of two triangles', () => {
  const cover = src['BookCover.tsx'];
  assert.match(cover, /width: m\.spine, backgroundColor: withAlpha\(INK, 0\.16\)/, 'the spine is a darker band');
  assert.match(cover, /left: m\.spine, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha\(INK, 0\.28\)/, 'the groove: a dark line');
  assert.match(cover, /left: m\.spine \+ 1, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha\(fixed\.white, 0\.6\)/, 'and a light one');
  assert.match(cover, /const HINGE = \[0\.1, 0\.07, 0\.05, 0\.035, 0\.02\] as const;/);
  assert.match(cover, /width: m\.edge, backgroundColor: withAlpha\(fixed\.white, 0\.9\)/, 'the page edges are a pale strip on the right');
  assert.match(cover, /borderRadius: m\.radius, overflow: 'hidden', backgroundColor: paper/);
  assert.match(cover, /\.\.\.shadowStyle\('md'\)/, 'a soft shadow under the book');
  assert.match(cover, /const height = a5Height\(width\);/, 'an A5 page: as high as 210/148 of its width');
  assert.match(cover, /style=\{\{ width, height, borderRadius: m\.radius, backgroundColor: paper, \.\.\.shadowStyle\('md'\) \}\}/);
  assert.match(cover, /right: right - \(touch - width\) \/ 2, width: touch, height: touch/, 'the ribbon button is touch by touch (44)');
  assert.equal(count(cover, /borderTopWidth: notch/g), 2, 'the notch at the foot of the ribbon is two triangles');
  assert.match(cover, /color=\{on \? fixed\.goldBright : fixed\.parchment\}[^\n]*filled=\{on\}/, 'a bookmarked book has a gold, filled bookmark on its ribbon; the others an outline: not the colour alone');
  assert.doesNotMatch(cover, /FREE|SOON|hasText/, 'no mark of free or soon: every book of the bundle has its text');
});

check('the words of a cover never grow with the phone\'s text size (the cover is a page of a fixed size, and the same words are on the book page), and are set where the fit was measured', () => {
  const cover = src['BookCover.tsx'];
  assert.equal(count(cover, /<AppText\b/g), count(cover, /maxFontSizeMultiplier=\{1\}/g), 'every text of a cover has a multiplier of 1');
  assert.match(cover, /\{text\.title\.lines\.join\('\\n'\)\}/, 'the title breaks where cover.ts measured it');
  assert.match(cover, /numberOfLines=\{text\.title\.lines\.length\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}/, 'and shrinks if a phone sets a word wider than the table says');
  assert.match(cover, /\{text\.kind\.lines\.join\('\\n'\)\}/);
  assert.match(cover, /const text = coverText\(book, width\);/);
});

check('the Books tab: the books as covers in two columns on one shelf for each kind, that open the book page, each with the ribbon that keeps the bookmark under "books:<id>"', () => {
  const grid = src['BooksGrid.tsx'];
  assert.match(grid, /const grid = coverGrid\(width, layout\.screenMargin\);/, 'the width of a cover comes from the width of the screen and the margins of the screens');
  assert.match(grid, /const \{ width \} = useWindowDimensions\(\);/);
  assert.match(grid, /width: grid\.width, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: grid\.gap, rowGap: ROW_GAP/);
  assert.match(grid, /const onShelves = useMemo\(\(\) => shelves\(items\), \[items\]\);/, 'a shelf for each kind of book, in the order of the shelves');
  assert.match(grid, /<AppText variant="h4" accessibilityRole="header">\{shelf\.title\}<\/AppText>/, 'the heading of a shelf is Fraunces and a heading for a screen reader');
  assert.match(grid, /export const ROW_GAP = 16;/);
  assert.match(grid, /const open = useCallback\(\(id: string\) => router\.push\(bookPath\(id\)\), \[router\]\);/, 'a cover opens the book page');
  assert.doesNotMatch(grid, /hasText|hasBookText/, 'every book of the bundle has its text: there is nothing to ask');
  assert.match(grid, /bookmarked=\{marks \? marks\.has\(itemKey\('Books', b\.id\)\) : undefined\}/);
  assert.match(grid, /const bookmark = useCallback\(\(id: string\) => toggle\?\.\(itemKey\('Books', id\)\), \[toggle\]\);/, 'the key of the bookmark is still books:<id>');
  assert.match(grid, /onOpen=\{open\}/);
  const tabs = code(read('src/features/library/LibraryTabs.tsx'));
  const tab = tabs.slice(tabs.indexOf('export function BooksTab'));
  assert.match(tab, /<BooksGrid items=\{BOOK_CATALOG\} marks=\{marks\} \/>/);
  assert.doesNotMatch(tab, /BooksNotice|SampleNotice/, 'no notice above the covers');
  assert.doesNotMatch(tab, /BookRows|Pressable/);
  assert.match(tabs, /import \{ BooksGrid \} from '\.\/books\/BooksGrid';/);
  assert.match(tabs, /\{group === 'Books' && <BookRows items=\{hits\.Books\} marks=\{marks\} \/>\}/, 'a search and Bookmarks still list the books as rows, which open the page');
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /import \{ BooksBanner \} from '@\/features\/library\/books\/BooksBanner';/);
  assert.match(screen, /const booksReading = useBooksReading\(\);/, 'read with the screen, so the banner says Continue from its first frame');
  assert.match(screen, /\{tab === 'Books' && <BooksBanner reading=\{booksReading\} \/>\}/);
  assert.doesNotMatch(screen, /BooksBanner\b[^;]*from '@\/features\/library\/LibraryBanner'/, 'the banner of the Books tab is not the old one of LibraryBanner.tsx');
});

check('the banner of the Books tab is the compact banner of the Bible tab with words of its own: nothing to press while there is no book, "Start reading" opens the first book, "Continue reading" opens the reader of the book read last', () => {
  const banner = src['BooksBanner.tsx'];
  assert.match(banner, /import \{ CompactBanner \} from '\.\.\/LibraryBanner';/, 'the same card, fonts and pill as the daily reading, not a second invention');
  assert.equal(count(banner, /<Pressable\b/g), 0, 'the card is the one button CompactBanner makes of it');
  assert.match(banner, /const view = booksBanner\(BOOK_CATALOG, reading\.last\);/);
  assert.match(banner, /router\.push\(view\.kind === 'continue' \? readerPath\(view\.bookId\) : bookPath\(view\.bookId\)\)/);
  assert.match(banner, /note=\{view\.note\} cta=\{view\.cta\} onPress=\{open\} hint=\{view\.hint\}/);
  const compact = code(read('src/features/library/LibraryBanner.tsx'));
  assert.match(compact, /export function CompactBanner\(/);
  assert.match(compact, /height: 44, paddingHorizontal: 16, borderRadius: radius\.pill, backgroundColor: c\.gold/, 'the gold pill is 44 high');
  assert.match(compact, /export const COMPACT_BANNER_MAX_HEIGHT = 120;/);
});

check('the rows of a search and of Bookmarks: ONE button that opens the book page, the bookmark button beside it, a small cover, the title, the subtitle, the description and the kind of book; no notice: every book is in the app', () => {
  const rows = src['BookRows.tsx'];
  assert.match(rows, /accessibilityLabel=\{coverLabel\(b\)\}/);
  assert.match(rows, /onPress=\{\(\) => router\.push\(bookPath\(b\.id\)\)\}/);
  assert.match(rows, /<BookCover book=\{b\} width=\{THUMB_WIDTH\} thumb \/>/);
  assert.match(rows, /<AppText variant="h4" style=\{\{ fontSize: 19, lineHeight: 24 \}\}>\{b\.title\}<\/AppText>/, 'the title is Fraunces');
  assert.match(rows, /<AppText variant="caption" muted>\{b\.subtitle\}<\/AppText>/);
  assert.match(rows, /<AppText variant="small" numberOfLines=\{3\}>\{b\.description\}<\/AppText>/, 'the description, in at most three lines');
  assert.match(rows, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{b\.title\} toggle=\{\(\) => marks\.toggle\(key\)\} \/>/);
  assert.match(rows, /const key = itemKey\('Books', b\.id\);/);
  assert.match(rows, /<AppText variant="mono" color=\{role\.muted\}[^>]*>\{kindMark\(kind\)\}<\/AppText>/, 'the kind of book is a mono mark');
  assert.doesNotMatch(rows, /FREE|SOON|Free to read|Coming soon|hasBookText/, 'no mark of free or soon');
  assert.doesNotMatch(code(read('src/features/library/SearchResults.tsx')), /SampleNotice|SEARCH_NOTICE/);
  assert.doesNotMatch(code(read('app/library/bookmarks.tsx')), /SampleNotice|BOOKMARKS_NOTICE/);
});

/* ================================================================ the book page */

check('the book page: the cover with its ribbon, the title, the subtitle, the kind, the facts and the description; THE NOTICE OF ITS KIND on every page; for a book that reads the gold button, the contents with the minutes of each chapter and the credit; for one that does not read, a calm sentence and no button', () => {
  const page = src['BookPage.tsx'];
  assert.match(page, /<BookCover book=\{book\} width=\{coverWidth\} bookmarked=\{marks\.has\(key\)\} onBookmark=\{toggle\} \/>/);
  assert.match(page, /export const coverWidthOf = \(screen: number\): number => Math\.min\(Math\.max\(Math\.round\(\(screen - 32\) \* 0\.6\), 150\), 240\);/, 'larger than the covers of the grid');
  assert.match(page, /\{!!book\.subtitle && <AppText variant="small" muted style=\{\{ textAlign: 'center' \}\}>\{book\.subtitle\}<\/AppText>\}/);
  assert.match(page, /<AppText variant="body">\{book\.description\}<\/AppText>/);
  // the notice: once, unconditionally, before the button, for every book; its words are in notices.ts and nowhere else
  assert.equal(count(page, /<BookNotice text=\{noticeFor\(book\.kind\)\} \/>/g), 1, 'the notice of its kind is on the page');
  assert.ok(page.indexOf('<BookNotice') > page.indexOf('{book.description}') && page.indexOf('<BookNotice') < page.indexOf('{text && target && nav ? ('), 'under the description, before the button, outside any condition');
  assert.match(page, /import \{ noticeFor \} from '\.\/notices';/);
  for (const f of Object.keys(src)) if (f !== 'notices.ts') assert.doesNotMatch(src[f], /Written with AI assistance|word for word from the public-domain/, `${f}: the wording of the notice is in notices.ts only`);
  assert.match(page, /\{text && target && nav \? \(/, 'the button and the contents are for a book whose text reads');
  assert.match(page, /\) : \(\s*<Card style=\{\{ gap: 8 \}\}>\s*<AppText variant="h4" accessibilityRole="header">\{UNREADABLE_TITLE\}<\/AppText>\s*<AppText variant="small">\{UNREADABLE_TEXT\}<\/AppText>/);
  const readable = page.slice(page.indexOf('{text && target && nav ? ('), page.indexOf(') : (\n        <Card'));
  assert.match(readable, /<ReadButton\s+label=\{readButtonLabel\(chapters, place\)\}\s+spoken=\{readButtonSpoken\(chapters, place\)\}/, '"Start reading" or "Continue: Day 3", and the whole title for a screen reader');
  assert.match(readable, /onPress=\{\(\) => open\(target\.id\)\}/);
  assert.match(page, /router\.push\(readerPath\(book\.id, chapterId\)\)/);
  assert.match(readable, /\{text\.credit\}/, 'the credit line of the book, as the file gives it');
  assert.doesNotMatch(page.slice(page.indexOf(') : (\n        <Card')), /ReadButton|Pressable|TocRow/, 'a book that does not read has no button and no contents');
  assert.match(page, /const text = useMemo\(\(\) => safeText\(book\.id\), \[book\.id\]\);/, 'a text that cannot be read is a book that could not be opened');
  assert.match(page, /const minutes = useMemo\(\(\) => new Map\(book\.chapters\.map\(\(x\) => \[x\.id, x\.minutes\] as const\)\), \[book\]\);/, 'the minutes of a chapter are the catalog\'s');
  assert.match(page, /const groups = useMemo\(\(\) => tocGroups\(chapters\), \[chapters\]\);/);
  assert.match(page, /\{groups\.map\(\(g, gi\) => \(/, 'the chapters under their parts, when a book has parts');
  assert.match(page, /read=\{readSet\.has\(e\.id\)\} here=\{!!place && place\.c === e\.id\}/, 'the chapters read are marked, and the one where the person stopped');
  assert.match(page, /\{read && <Icon name="check"/);
  assert.match(page, /LAST READ/);
  assert.match(page, /minHeight: 56/, 'a row of the contents is at least 56 high');
  assert.match(page, /const spoken = `\$\{entry\.title\}\$\{minutes \? `, \$\{formatMinutes\(minutes\)\}` : ''\}\$\{read \? ', read' : ''\}\$\{here \? ', where you stopped' : ''\}`;/);
  const missing = page.slice(page.indexOf('function Missing()'), page.indexOf('/** The page of the book with this id'));
  assert.match(missing, /UNKNOWN_TITLE/);
  assert.match(page, /if \(!book\) return <Missing \/>;/, 'an id that is no book is a calm sentence with the way to the Library');
  assert.match(page, /\{!!notice && <FormMessage tone="info">\{notice\}<\/FormMessage>\}/);
  assert.equal(count(page, /<BackButton fallback="\/library" \/>/g), 2, 'the page and the page of a book that is not there both have the Back button of the app, which goes to the Library when there is nothing behind them');
  assert.doesNotMatch(page, /<IconButton\b/, 'and no button of their own for it');
});

check('the routes are /library/book/<id> and /library/book/<id>/read?c=<chapter>, registered for a pilgrim with a journey next to Bookmarks and the daily reading with no options; a link with ?c= goes on to the reader', () => {
  const layout = read('app/_layout.tsx');
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  for (const name of ['library/book/[id]/index', 'library/book/[id]/read']) {
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    assert.ok(guard > 0 && at > guard && layout.indexOf('</Stack.Protected>', guard) > at, `${name} is registered inside the block of screens for someone who has a journey`);
  }
  assert.match(layout, /<Stack\.Screen name="library\/bookmarks" \/>\n\s+<Stack\.Screen name="library\/daily" \/>/);
  assert.ok(layout.indexOf('library/book/[id]/index') > layout.indexOf('library/daily'), 'next to the other screens of the Library');
  const route = src['app/library/book/[id]/index.tsx'];
  assert.match(route, /if \(book && chapter\) return <Redirect href=\{readerPath\(book, chapter\)\} \/>;/, '/library/book/<id>?c=<chapter> is a link to the reader');
  assert.match(route, /return <BookPage id=\{book\} \/>;/);
  const reader = src['app/library/book/[id]/read.tsx'];
  assert.match(reader, /<Reader key=\{`\$\{typeof id === 'string' \? id : ''\}\.\$\{typeof c === 'string' \? c : ''\}\.\$\{passage \?\? ''\}`\} id=\{typeof id === 'string' \? id : ''\} chapterId=\{typeof c === 'string' && c \? c : undefined\} passage=\{passage\} \/>/);
  assert.match(reader, /const passage = typeof c === 'string' && c \? passageParam\(p\) : undefined;/, 'a passage is named only together with a chapter');
  const copy = code(read('src/features/library/books/copy.ts'));
  assert.match(copy, /export const readerPath = \(id: string, chapterId\?: string, block\?: number\): string =>/, 'the reader can be opened at a passage');
  assert.match(copy, /\/library\/book\/\$\{id\}\/read\$\{chapterId \? `\?c=\$\{encodeURIComponent\(chapterId\)\}\$\{block !== undefined && Number\.isInteger\(block\) && block >= 0 \? `&p=\$\{block\}` : ''\}` : ''\}`;/);
  assert.equal(count(layout, /library\/book\//g), 2);
});

/* ================================================================ the reader */

check('the reader: Previous and Next replace the screen (Back goes to where the reader came from), Contents goes back to the page of the book, and a chapter that is not there shows the page with a sentence that says so', () => {
  const reader = src['Reader.tsx'];
  assert.match(reader, /const goTo = useCallback\(\(id: string\) => router\.replace\(readerPath\(bookId, id\)\), \[router, bookId\]\);/);
  assert.match(reader, /const contents = useCallback\(\(\) => router\.dismissTo\(bookPath\(bookId\)\), \[router, bookId\]\);/, 'back to the page if it is below, else the page replaces the reader');
  assert.match(reader, /onPrevious=\{\(\) => nav\.prev && goTo\(nav\.prev\.id\)\}/);
  assert.match(reader, /onNext=\{\(\) => nav\.next && goTo\(nav\.next\.id\)\}/);
  assert.match(reader, /if \(target\.missing\) return <BookPage id=\{bookId\} notice=\{NO_CHAPTER_TEXT\} \/>;/);
  assert.match(reader, /if \(!text \|\| text\.chapters\.length === 0\) return <BookPage id=\{id\} \/>;/, 'a book with no text, or a text that cannot be read, shows its page');
  assert.match(reader, /key=\{chapters\[target\.index\]\.id\}/, 'every chapter is a screen of its own: nothing of the last one is kept');
  assert.match(reader, /const text = useMemo\(\(\) => \(bookById\(id\) \? safeText\(id\) : null\), \[id\]\);/);
  assert.match(reader, /const ready = size\.ready && writer\.ready;/, 'the words are shown once the size and the place have been read: never at one size and then another');
  assert.match(reader, /if \(!target\) return <View style=\{\{ flex: 1, backgroundColor: role\.bg \}\} \/>;/);
  assert.match(reader, /const r = resumeAt\(chapters, writer\.peek\(\)\);/, 'without a chapter in the address it opens where the person stopped, or at the start');
  assert.match(reader, /y: passage !== undefined \? 0 : startAt\(writer\.peek\(\), chapters\[i\]\.id\)/, 'a chapter opens at the line where the person was in it, when it is the saved one');
  assert.match(reader, /const nav = chapterNav\(text\.chapters, index\)!;/);
});

check('the reader keeps the place well: nothing is saved before the person was put back, the place follows the scroll, a chapter is read from 90 %, and the text size keeps the same line on the screen', () => {
  const reader = src['Reader.tsx'];
  const apply = reader.slice(reader.indexOf('const apply = useCallback'), reader.indexOf('/** Once the text and the screen both have a size'));
  assert.match(apply, /const p = scrollProgress\(offset, content, viewport\);/);
  assert.match(apply, /progress\.current\?\.\(p\);/);
  assert.ok(apply.indexOf('if (!placed.current) return;') > 0 && apply.indexOf('if (!placed.current) return;') < apply.indexOf('writer.save(chapter.id, p);'), 'the first scroll event of a chapter that is not at its top must not say "top"');
  assert.match(apply, /if \(!counted\.current && isRead\(p\)\) \{ counted\.current = true; writer\.markRead\(chapter\.id\); \}/);
  const place = reader.slice(reader.indexOf('const place = useCallback'), reader.indexOf('// A new size of the text'));
  assert.match(place, /if \(content <= 0 \|\| viewport <= 0\) return;/, 'nothing is done before the text and the screen have a size');
  assert.match(place, /const y = offsetFor\(startY, content, viewport\);/);
  assert.match(place, /scroller\.current\?\.scrollTo\(\{ y, animated: false \}\);/);
  assert.ok(place.indexOf('placed.current = true;') < place.indexOf('apply();', place.indexOf('placed.current = true;')), 'saving starts after the person was put back');
  assert.match(reader, /keep\.current = scrollProgress\(offset, content, viewport\);/, 'a new size of the text remembers the line that was on the screen');
  assert.match(reader, /const y = offsetFor\(keep\.current, content, viewport\);/);
  assert.match(reader, /if \(lastStep\.current === size\.step\) return;/, 'a render that does not change the size does nothing');
  assert.match(reader, /scrollEventThrottle=\{50\}/);
  assert.match(reader, /onContentSizeChange=\{onContentSizeChange\}/);
  assert.match(reader, /const type = useMemo\(\(\) => readerType\(size\.step\), \[size\.step\]\);/);
  assert.match(reader, /const items = useMemo\(\(\) => layoutBlocks\(chapter\.blocks\), \[chapter\]\);/, 'a chapter is made into things to draw once');
  assert.match(reader, /<ReaderBlocks items=\{items\} t=\{type\} selected=\{selected\} choose=\{choose\} spot=\{spot\} \/>/);
  assert.match(reader, /<View accessible accessibilityRole="header" accessibilityLabel=\{chapter\.title\}/, 'one heading with the whole title, however it is split for the eye');
  assert.match(reader, /maxWidth: type\.measure/, 'a line is about 70 characters on a wide window');
  assert.match(reader, /paddingBottom: 48,/, 'the bar under the chapter has the home indicator\'s room, so the chapter needs none of its own');
  assert.doesNotMatch(code(reader), /useSafeAreaInsets|insets\./, 'the reader leaves the insets to the header at the top and the bar at the bottom');
  const blocks = src['ReaderBlocks.tsx'];
  assert.ok(count(blocks, /= memo\(function /g) >= 7, 'every block, and the chapter, is memoised: a scroll draws only the thin line');
  assert.match(blocks, /export const ReaderBlocks = memo\(function ReaderBlocks/);
});

check('the header of the reader has one row, as the top of a Kindle has: the Back button of the app (to the contents), and Smaller and Larger text, all 48 by 48; the title of the book, Previous, Next and the line are not at the top', () => {
  const header = src['ReaderHeader.tsx'];
  assert.match(header, /<BackButton onPress=\{onContents\} hint="Back to the contents of this book" \/>/, 'the way back is the Back button of the app, which goes to the contents of the book and says so');
  assert.doesNotMatch(header, /Contents<\/AppText>|accessibilityLabel="Contents"|<Pressable\b|<Icon\b/, 'no pill of its own that says "Contents", and no icon drawn by hand');
  assert.match(header, /<SizeTap larger=\{false\} disabled=\{!canShrink\} onPress=\{onSmaller\} \/>/);
  assert.match(header, /<SizeTap larger disabled=\{!canGrow\} onPress=\{onLarger\} \/>/);
  assert.match(header, /<AppText accessibilityLiveRegion="polite" style=\{VISUALLY_HIDDEN\}>\{sizeLine\(step\)\}<\/AppText>/, '"Text size 4 of 5" is said when the size changes');
  assert.match(header, /paddingTop: insets\.top \+ layout\.screenTop/, 'under the camera, like every screen');
  assert.match(header, /paddingHorizontal: layout\.screenMargin/, 'the Back button is as far from the edge as on every other screen');
  assert.doesNotMatch(code(header), /bookTitle|IconTap|positionLine|previousLabel|nextLabel|ReadingProgress|onPrevious|onNext/, 'the title of the book, Previous, Next and the line are at the bottom only');
  const reader = src['Reader.tsx'];
  assert.match(reader, /<ReaderHeader\s+step=\{size\.step\}\s+canShrink=\{size\.canShrink\}\s+canGrow=\{size\.canGrow\}\s+onSmaller=\{size\.smaller\}\s+onLarger=\{size\.larger\}\s+onContents=\{contents\}\s+\/>/, 'the header is given the way back and the size, and nothing else');
});

check('the bar at the bottom of the reader, as on a Kindle: the thin line that is only a picture, Previous and Next named by where they go and dimmed and disabled at the ends, the title of the book with "Chapter 7 of 40" between them, above the home indicator, under the chapter', () => {
  const bar = src['ReaderBar.tsx'];
  assert.match(bar, /<IconTap icon="back" label=\{previousLabel\(nav\)\} disabled=\{!nav\.prev\} size=\{BAR_BUTTON\} onPress=\{onPrevious\} \/>/);
  assert.match(bar, /<IconTap icon="chevron" label=\{nextLabel\(nav\)\} disabled=\{!nav\.next\} size=\{BAR_BUTTON\} onPress=\{onNext\} \/>/);
  assert.ok(bar.indexOf('previousLabel(nav)') < bar.indexOf('{bookTitle}') && bar.indexOf('{bookTitle}') < bar.indexOf('{positionLine(nav)}') && bar.indexOf('{positionLine(nav)}') < bar.indexOf('nextLabel(nav)'), 'Previous, the title, "Chapter 7 of 40", Next: from left to right');
  assert.match(bar, /<View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\{ height: 4, backgroundColor: role\.border \}\}>/, 'the line is a picture: the position is said in words');
  assert.match(bar, /width: `\$\{Math\.round\(fraction \* 100\)\}%`, backgroundColor: role\.action/);
  assert.match(bar, /backgroundColor: role\.bg, paddingBottom: insets\.bottom/, 'above the home indicator of the phone');
  assert.ok(bar.indexOf('<ReadingProgress api={progress} />') < bar.indexOf('<IconTap icon="back"'), 'the line is on top of the row');
  assert.match(bar, /maxFontSizeMultiplier=\{BAR_FONT_LIMIT\}/, 'the bar never takes the page when the text is large');
  assert.match(bar, /const BAR_FONT_LIMIT = 1\.3;/);
  // the bar is the part the thumb rests on, so it is large: the buttons are 56 (never under 44), the title is the body of the type scale (19 on 28) and the place 14
  assert.match(bar, /const BAR_BUTTON = 56;/);
  assert.equal(count(bar, /size=\{BAR_BUTTON\}/g), 2, 'Previous and Next are both 56');
  assert.match(bar, /const TITLE = \{ fontSize: textStyle\('body'\)\.fontSize, lineHeight: textStyle\('body'\)\.lineHeight \};/, 'the size and the line of the title are the body of the type scale (tokens.json)');
  assert.match(bar, /<AppText variant="label" numberOfLines=\{1\} maxFontSizeMultiplier=\{BAR_FONT_LIMIT\} style=\{\{ \.\.\.TITLE, textAlign: 'center' \}\}>\{bookTitle\}<\/AppText>/, 'the title of the book is a label (SemiBold) at that size');
  assert.doesNotMatch(bar, /fontSize: 1[5-9]|fontSize: 2\d/, 'no size of its own for the title: 18 was not on the type scale');
  const scale = JSON.parse(read('src/theme/tokens.json')) as { text: { body: { size: number; lineHeight: number } } };
  assert.deepEqual([scale.text.body.size, scale.text.body.lineHeight], [19, 28], 'the body of the type scale is 19 on 28: the title of the book in the bar is that');
  assert.match(bar, /style=\{\{ fontSize: 14, lineHeight: 20, textAlign: 'center' \}\}>\{positionLine\(nav\)\}/, '"Chapter 7 of 40" is 14');
  const reader = src['Reader.tsx'];
  assert.match(reader, /<\/ScrollView>\s*\{selected !== null && key && \(\s*<PassageActions[^]*?\/>\s*\)\}\s*<ReaderBar\s+bookTitle=\{text\.title\}\s+nav=\{nav\}\s+onPrevious=\{\(\) => nav\.prev && goTo\(nav\.prev\.id\)\}\s+onNext=\{\(\) => nav\.next && goTo\(nav\.next\.id\)\}\s+progress=\{progress\}\s+\/>/, 'the bar is under the chapter, not inside the scroll: it stays');
  assert.match(reader, /import \{ ReaderBar, type ProgressApi \} from '\.\/ReaderBar';/);
});

check('the title of the book in the bar is ONE line between the two 56 buttons and every one of the 26 titles of the Library is whole on a phone 390 wide (and 430): measured with the real advances of Inter SemiBold, at the size of the type scale, and no larger size of the scale would keep that', () => {
  const bar = src['ReaderBar.tsx'];
  const button = Number(/const BAR_BUTTON = (\d+);/.exec(bar)![1]);
  const row = Number(/<View style=\{\{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: (\d+), paddingVertical: 4 \}\}>/.exec(bar)![1]);
  const mid = Number(/<View style=\{\{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: (\d+) \}\}>/.exec(bar)![1]);
  // the room of the title: the screen, less the two buttons and the padding of the row and of the title on both sides
  const room = (screen: number): number => screen - 2 * button - 2 * row - 2 * mid;
  assert.deepEqual([320, 360, 390, 430].map(room), [184, 224, 254, 294]);
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { text: Record<string, { size: number }> };
  const size = tokens.text.body.size;
  const inter = readFont(fontPath(root, 'Inter_600SemiBold'));
  const titles = BOOK_CATALOG.map((b) => b.title);
  assert.equal(titles.length, 26, 'the 26 books of the Library');
  assert.deepEqual(inter.missing(titles.join('')), [], 'Inter has every letter of every title');
  const width = (title: string, px: number): number => inter.width(title) * px;
  const fitting = (screen: number, px: number): number => titles.filter((t) => width(t, px) <= room(screen)).length;
  // 19 (the body of the scale): all 26 whole on 390 and on 430, with room to spare for a browser that rounds every glyph to a whole pixel (measured: at most 2.5 px wider)
  assert.equal(fitting(390, size), 26, `at ${size}: every title is on one line on a phone 390 wide (the widest is ${Math.max(...titles.map((t) => width(t, size))).toFixed(1)} px of ${room(390)})`);
  assert.equal(fitting(430, size), 26);
  const widest = Math.max(...titles.map((t) => width(t, size)));
  assert.ok(room(390) - widest >= 8, `the widest title has ${(room(390) - widest).toFixed(1)} px to spare on a phone 390 wide: a browser that hints the glyphs draws it up to 2.5 px wider, so keep 8`);
  // the narrower phones cut what does not fit with an ellipsis: how many is on record, so that a new title or a larger size is noticed
  assert.ok(fitting(360, size) >= 23, `${fitting(360, size)} of 26 titles are whole on a phone 360 wide`);
  assert.ok(fitting(320, size) >= 15, `${fitting(320, size)} of 26 titles are whole on a phone 320 wide`);
  // and no larger size of the type scale would do: each is a title cut on a phone 390 wide (22 cuts five, 24 eight, 28 fifteen)
  const larger = [...new Set(Object.values(tokens.text).map((t) => t.size))].filter((px) => px > size && px <= 28).sort((a, b) => a - b);
  assert.deepEqual(larger, [22, 24, 28], 'the sizes of the scale above the body that a title could take');
  for (const px of larger) assert.ok(fitting(390, px) < 26, `${px} would keep all 26 titles whole on 390: then it is the size of the title, the largest of the scale that does`);
  assert.deepEqual(larger.map((px) => 26 - fitting(390, px)), [5, 8, 15]);
  // one line: the title is cut, not wrapped, and the bar is as tall for every book
  assert.match(bar, /<AppText variant="label" numberOfLines=\{1\}/);
});

check('the round buttons of the reader are named, the size buttons of its header are 48 by 48 like the Back button (the bar\'s are 56), a dimmed button is disabled for a screen reader too, and the buttons at the end of a chapter name where they go', () => {
  const ui = src['BookUi.tsx'];
  assert.match(ui, /const HEADER_BUTTON = 48;/, 'the size buttons are 48 by 48, the size of IconButton and so of the Back button next to them');
  assert.equal(count(ui, /width: HEADER_BUTTON, height: HEADER_BUTTON/g), 1);
  assert.equal(count(ui, /width: 44, height: 44/g), 0, 'no round button of 44 is left in the header');
  assert.match(ui, /size = 44/, 'a round button of the reader\'s bar is 44 by 44 unless it is asked to be larger (the bar asks for 56)');
  assert.match(ui, /width: size, height: size/);
  assert.match(ui, /accessibilityLabel=\{larger \? 'Larger text' : 'Smaller text'\}/);
  assert.match(ui, /accessibilityState=\{\{ disabled: !!disabled \}\}/);
  assert.equal(count(ui, /accessibilityState=\{\{ disabled: !!disabled \}\}/g), 2, 'a dimmed button is disabled for a screen reader too');
  assert.match(ui, /minHeight: 56, paddingHorizontal: 24/, 'the gold button is at least 56 high');
  assert.match(ui, /backgroundColor: c\.gold/);
  const footer = src['ChapterFooter.tsx'];
  assert.match(footer, /accessibilityLabel=\{next \? nextLabel\(nav\) : previousLabel\(nav\)\}/, 'the buttons at the end of a chapter name the destination too');
  assert.match(footer, /accessibilityState=\{\{ disabled: !to \}\}\s+disabled=\{!to\}/);
  assert.match(footer, /minHeight: 64/);
  assert.match(footer, /\{last && \(\s*<View style=\{\{ gap: 12, alignItems: 'center', marginTop: 8 \}\}>\s*<AppText variant="h4" accessibilityRole="header" style=\{\{ textAlign: 'center' \}\}>\{END_OF_BOOK\}<\/AppText>\s*<AppText variant="caption" muted style=\{\{ textAlign: 'center' \}\}>\{credit\}<\/AppText>/, 'the credit line is printed at the end of the book');
  assert.match(footer, /<Step side="next" nav=\{nav\} onPress=\{onNext\} \/>\s+<Step side="previous" nav=\{nav\} onPress=\{onPrevious\} \/>/);
});

check('a passage of a chapter can be chosen, as a verse of the Bible can: a touch on its words, a pale gold ground and an underline, the bar of Bookmark, Copy and Share between the chapter and the bar at the bottom, a bookmark under its key, and an address that names it scrolls to it', () => {
  const blocks = src['ReaderBlocks.tsx'];
  assert.match(blocks, /const chosen = \(\) => \(\{ backgroundColor: c\.goldSoft, textDecorationLine: 'underline' as const \}\);/, 'a pale gold ground and an underline, like a verse');
  assert.match(blocks, /on=\{selected !== null && blockOfItem\(item\.key\) === selected\}/, 'every piece of a long paragraph shows the passage that is chosen');
  assert.match(blocks, /if \(item\.k !== 'p' \|\| !item\.cont\) spot\(/, 'a long paragraph reports where it starts once');
  assert.equal(count(blocks, /<Words /g), 3, 'a paragraph, a quotation and a list have words that can be chosen; a heading and a break do not');
  assert.doesNotMatch(blocks.slice(blocks.indexOf('const Heading'), blocks.indexOf('const Quotation')), /Words/, 'a heading cannot be chosen');
  assert.doesNotMatch(blocks.slice(blocks.indexOf('const Break'), blocks.indexOf('const Block =')), /Words/, 'a break cannot be chosen');
  const actions = src['PassageActions.tsx'];
  assert.match(actions, /accessibilityRole="toolbar"/);
  assert.match(actions, /accessibilityLabel=\{`Actions for \$\{label\}`\}/);
  assert.match(actions, /icon="bookmark" filled=\{bookmarked\}/);
  assert.match(actions, /Share\.share\(\{ message: text \}\)/);
  assert.match(actions, /hasNativeModule\(NativeName\.clipboard\)/, 'Copy only where the phone has the module, asked for first');
  assert.match(actions, /accessibilityLabel="Close the passage actions"/);
  assert.match(actions, /from '\.\.\/bible\/actionBar'/, 'the bar is as big as the Bible\'s: its sizes are the same numbers');
  assert.doesNotMatch(code(actions), /position: 'absolute'/, 'the bar takes its own room between the chapter and the bar at the bottom: nothing is hidden behind it');
  const reader = src['Reader.tsx'];
  assert.match(reader, /const key = selected !== null && isPassageBlock\(block\) \? passageKey\(bookId, chapter\.id, selected\) : null;/);
  assert.match(reader, /bookmarked=\{marks\.has\(key\)\}\s+canBookmark=\{marks\.ready && parsePassageKey\(key\) !== null\}\s+canNote=\{parsePassageKey\(key\) !== null\}\s+onBookmark=\{\(\) => marks\.toggle\(key\)\}\s+onNote=\{\(\) => router\.push\(noteHref\(bookId, chapter\.id, selected\)\)\}/, 'the bookmark is the Library\'s own, under the key of the passage; Note opens a new note of the diary about it');
  assert.match(actions, /<ActionButton icon="pen" label="Note" spoken=\{`Write a note: \$\{label\}`\} disabled=\{!canNote\}/, 'the fourth action: Note, named by where the passage is');
  assert.ok(actions.indexOf('label="Bookmark"') < actions.indexOf('label="Note"') && actions.indexOf('label="Note"') < actions.indexOf('icon="copy"') && actions.indexOf('icon="copy"') < actions.indexOf('label="Share"'), 'Bookmark, Note, Copy, Share');
  assert.match(actions, /minWidth: compact \? 0 : ACTION_MIN_WIDTH/, 'with four actions they share the bar, as wide as 320 allows');
  const diaryPage = read('app/diary/[id].tsx');
  assert.match(diaryPage, /const start = useMemo\(\(\) => \(id === NEW_PAGE && quote \? noteStartFor\(quote\) : null\), \[id, quote\]\);/, 'only a NEW page can start from a passage, and a key that finds nothing opens it blank');
  assert.match(diaryPage, /useState\(initial\?\.body \?\? start \?\? ''\)/, 'the quotation is on the screen before anything is typed');
  assert.match(diaryPage, /const seed = \(\) => \{ if \(start && !initial && !seeded\.current\) \{ seeded\.current = true; saver\.edit\(\{ body \}\); \} \};/, 'the quotation is kept with the first thing that is saved, and a page that was only opened is not saved');
  assert.match(diaryPage, /seed\(\);\s+say\(attachMessage\(await saver\.attach\(picked\.assets\)\)\);/, 'a photo added first carries the quotation with it');
  assert.match(reader, /const next = chosenNow\.current === block \? null : block;/, 'a second touch lets it go');
  assert.match(reader, /const release = useCallback\(\(\) => \{ chosenNow\.current = null; setSelected\(null\); \}, \[\]\);/, 'Close lets it go too');
  assert.match(reader, /const ACTIONS_COVER = BAR_HEIGHT \+ 8;/, 'the room the bar of actions takes is the Bible\'s bar and the 8 under it');
  assert.match(reader, /if \(visible > 0 && top - offset > visible - ZONE\) scroller\.current\?\.scrollTo\(/, 'a passage that would be under the bar of actions is brought up, as a verse is');
  assert.match(reader, /passage !== undefined && isPassageBlock\(chapter\.blocks\[passage\]\) \? passage : null/, 'a passage the text does not have is no passage');
  assert.match(reader, /scroller\.current\?\.scrollTo\(\{ y: to, animated: false \}\)/, 'a linked passage is scrolled into view once its block and the column are measured');
  assert.match(reader, /label=\{passageLabel\(chapter, selected\)\}\s+text=\{passageShareText\(text\.title, chapter, selected\)\}/);
  const rows = src['PassageRows.tsx'];
  assert.match(rows, /export const passagesLabel = \(count: number\): string => `Passages · \$\{count\}`;/);
  assert.match(rows, /accessibilityHint="Opens the book at this passage"/);
  assert.match(rows, /<BookmarkToggle on=\{marks\.has\(r\.key\)\} title=\{`\$\{r\.bookTitle\}, \$\{r\.label\}`\} toggle=\{\(\) => marks\.toggle\(r\.key\)\} \/>/, 'the bookmark button of a row is the Library\'s, beside the row and not inside it');
  assert.match(rows, /<AppText variant="mono" color=\{role\.accentText\}/, 'where the passage is, is mono');
  assert.doesNotMatch(code(read('src/features/library/search.ts')), /passage/i, 'the search of the Library does not look for passages');
});

check('the words of a chapter: a heading is a heading for a screen reader, a quotation is indented with a rule and says whose words they are, a list has its bullet or number hanging in a column of its own, bold and italic are drawn, a break is for the eye only, and every size comes from the step', () => {
  const blocks = src['ReaderBlocks.tsx'];
  assert.match(blocks, /<AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier=\{face\.maxMultiplier\}/);
  assert.match(blocks, /const face = item\.level <= 2 \? t\.heading : t\.body;/, 'a heading of a lower level is Fraunces at the size of the text');
  assert.match(blocks, /borderLeftWidth: RULE, borderLeftColor: role\.borderStrong/);
  assert.match(blocks, /const INDENT = 18;/);
  assert.match(blocks, /paddingLeft: INDENT, borderLeftWidth: RULE/, 'a quotation is indented from the rule at its left');
  assert.match(blocks, /\{!!item\.cite && <AppText muted /, 'under a quotation, muted, whose words they are');
  assert.match(blocks, /\{item\.ordered \? `\$\{i \+ 1\}\.` : '•'\}/, 'a number or a bullet, hanging');
  assert.match(blocks, /const column = Math\.round\(t\.body\.size \* \(item\.ordered \? 1\.9 : 1\.2\)\);/);
  assert.match(blocks, /variant=\{x\.b \? 'label' : 'body'\}[^\n]*fontStyle: x\.i \? 'italic' : 'normal'/, 'bold is Inter SemiBold and italic is a slant: no family of its own');
  assert.match(blocks, /<View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\{ alignSelf: 'center', width: 48, height: 1/);
  assert.match(blocks, /marginBottom: item\.end \? t\.gap : 0/, 'the pieces of a long paragraph follow each other with no space');
  assert.equal(count(blocks, /maxFontSizeMultiplier=\{(?:t\.(?:body|quote|heading)|face).maxMultiplier\}/g), 7, 'every text of the chapter has the cap of its face');
  assert.doesNotMatch(blocks, /fontSize: \d/, 'no size of its own: they all come from the step chosen');
  assert.doesNotMatch(blocks, /textAlign: 'justify'/, 'no justified text: it makes rivers on a narrow column');
  assert.doesNotMatch(blocks, /href|Linking|openURL/, 'a link in a book is its words and nothing to follow: no network, nowhere to go');
  const reader = src['Reader.tsx'];
  assert.match(reader, /fontSize: face\.size, lineHeight: face\.lineHeight/);
  assert.match(reader, /const words = useMemo\(\(\) => chapterWords\(chapter\.title, chapter\.blocks\), \[chapter\]\);/, 'the words of a chapter are counted as the bundle counts them: its title and its blocks');
});

/* ================================================================ what is kept on the phone */

check('what is kept stays on the phone: the places under u.<userId>.library.reading (wiped when the person logs out), the text size on the phone itself; written after the last scroll, when the screen is left and when the app goes to the background', () => {
  const writer = src['useReadingWriter.ts'];
  assert.match(writer, /const key = uid \? userKey\(uid, READING_NAME\) : null;/);
  assert.match(writer, /export const SAVE_AFTER_MS = 700;/);
  assert.match(writer, /timer\.current = setTimeout\(flush, SAVE_AFTER_MS\);/);
  assert.match(writer, /AppState\.addEventListener\('change', \(s\) => \{ if \(s !== 'active'\) flush\(\); \}\);/, 'the place is written when the app goes to the background');
  assert.match(writer, /return \(\) => \{ sub\.remove\(\); flush\(\); \};/, 'and when the screen is left');
  assert.match(writer, /if \(!ready\) return;/, 'a save before the places were read could write over what is kept');
  assert.match(writer, /const ready = !!loaded && loaded\.key === key;/, 'ready only when the places of this very person have been read');
  const store = src['readingStore.ts'];
  assert.match(store, /import \{ localStore \} from '@\/lib\/localStore';/);
  assert.match(store, /let queue: Promise<unknown> = Promise\.resolve\(\);/);
  assert.equal(count(store, /const done = queue\.then\(\(\) => localStore\.setJSON\(/g), 2, 'a write (a place, the text size) waits for the write before it');
  assert.match(store, /await queue;\s+return parseReading\(await localStore\.getJSON<unknown>\(key\)\) \?\? emptyReading\(\);/, 'a read waits for the writes before it: the reader of one chapter is left while the next is opened');
  assert.match(store, /parseStep\(await localStore\.getJSON<unknown>\(SIZE_NAME\)\) \?\? DEFAULT_STEP/);
  assert.doesNotMatch(store, /userKey/, 'the text size belongs to the phone, not to a person: logging out does not wipe it');
  assert.match(src['useBooksReading.ts'], /const key = uid \? userKey\(uid, READING_NAME\) : null;/);
  assert.match(src['useBooksReading.ts'], /useFocusEffect\(/, 'read again every time the screen comes back: the reader changes the places under it');
  assert.match(src['useBooksReading.ts'], /last: ready \? lastRead\(stored, inLibrary\) : null,/, 'a place in a book that is no longer in the Library is never offered');
  assert.match(src['useBooksReading.ts'], /const inLibrary = \(id: string\): boolean => !!bookById\(id\);/);
  assert.match(src['useReaderSize.ts'], /void saveSize\(next\);/);
  assert.match(src['readerType.ts'], /export const SIZE_NAME = 'library\.books\.size';/);
  assert.match(src['reading.ts'], /export const READING_NAME = 'library\.reading';/);
  const store2 = read('src/lib/localStore.ts');
  assert.match(store2, /export const clearUserData = \(uid: string\) => localStore\.removeByPrefix\(`u\.\$\{uid\}\.`\);/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'signing out wipes every u.<userId>. key, the places included');
});

/* ================================================================ honest words, data only, touch */

check('what other screens rely on stays: useBooksReading() gives { ready, last, placeOf, readSet } and the places are read from the one key, so a bar elsewhere can say where the person stopped', () => {
  const hook = read(B('useBooksReading.ts'));
  assert.match(hook, /export type BooksReading = \{[^}]*\bready: boolean;[^}]*\blast: BookPlace \| null;[^}]*\bplaceOf: \(bookId: string\) => BookPlace \| null;[^}]*\breadSet: \(bookId: string\) => ReadonlySet<string>;[^}]*\};/);
  assert.match(hook, /export function useBooksReading\(\): BooksReading \{/);
  assert.match(read(B('reading.ts')), /export type BookPlace = \{ id: string; c: string; y: number; at: number; read: string\[\] \};/, 'a place: the book, the chapter, how far down, when (milliseconds), the chapters read');
  assert.match(read(B('readingStore.ts')), /export async function loadReading\(key: string\): Promise<StoredReading>/);
  assert.match(code(read(B('useReadingWriter.ts'))), /current\.current = savePlace\(current\.current, bookId, chapterId, y, Date\.now\(\)\);/, 'every place that is saved is stamped with the time');
});

check('honest words: no book says Soon or Preview (every book has its text), nothing says "verified", "official" or "certified", and the notice of each kind is in notices.ts and in nothing else', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /verified|official|certified|approved|guaranteed/i, `${f}: an honest word`);
    assert.doesNotMatch(s, /\bSoon\b|\bSOON\b|Preview|Coming soon|not in the app yet|Not in the app yet/i, `${f}: no book is "soon": the bundle holds the books that can be read`);
  }
  assert.doesNotMatch(read('src/features/library/sample.ts'), /BOOKS_NOTICE|SEARCH_NOTICE|BOOKMARKS_NOTICE|verified|official|certified/i, 'the notices about books that were not there yet are gone');
  const copy = read(B('copy.ts'));
  assert.match(copy, /export const NONE_LINE = 'There are no books to show yet\.';/);
  assert.match(copy, /export const UNREADABLE_TITLE = 'This book could not be opened';/);
  const catalog = code(read(B('catalog.ts')));
  assert.doesNotMatch(catalog, /\b(?:hasText|available|isReady|ready|readable|inApp)\b\s*[:?]/, 'availability is never a field of the catalog: a book of the bundle is a book that can be read');
  assert.match(catalog, /import \{ CATALOG \} from '\.\.\/bookBundle';/, 'the list of books is the bundle of tools/build_books.py, and nothing kept by hand');
  assert.match(src['safeText.ts'], /import \{ loadBookContent \} from '\.\.\/bookBundle';/);
});

check('data only: the screens of the books never print the rights, the disclosure or the Camino of a book (the wording of what is said about how the books were written is notices.ts, the editions are on the Licences screen)', () => {
  for (const f of [...SCREENS, 'copy.ts', 'cover.ts']) {
    assert.doesNotMatch(src[f], /ai_disclosure|\brights\b|route_slug|\blicence\w*/, `${f}: data that is not for this screen`);
    assert.doesNotMatch(src[f], /gutenberg|ccel\.org/i, `${f}: names a source site`);
  }
});

check('the bundle names no model: no file of the app bundle (the catalog and a file for each book) and no file of the Books feature says which tool helped to write the books, and a book of the bundle has no ai_disclosure (the notice of each kind says that AI helped, in notices.ts, and nothing more)', () => {
  const bundle = path.join('assets', 'library');
  const files = [path.join(bundle, 'catalog.json'), ...fs.readdirSync(path.join(root, bundle, 'books')).sort().map((f) => path.join(bundle, 'books', f))];
  assert.equal(files.length, BOOK_CATALOG.length + 1, 'the catalog and one file for each book');
  const MODEL = /\b(?:claude|anthropic|sonnet|opus|haiku|gpt|chatgpt|openai|gemini|llama|mistral|copilot)\b/i;
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, MODEL, `${f} names a model`);
    assert.doesNotMatch(text, /"ai_disclosure"/, `${f} carries the disclosure of the series: the app never reads it, and its words can name the tool`);
  }
  for (const f of [...MINE.map(B), ...ROUTES, 'src/features/library/bookBundle.ts']) assert.doesNotMatch(read(f), MODEL, `${f} names a model`);
  assert.match(read(B('notices.ts')), /AI assistance/, 'the notices do say that AI helped');
});

check('the Licences screen lists every source of every book of readings, as books/*/book.json says it (the id, the work, the author, the translator, the year, the licence and the page), and the original text with no licence claimed', () => {
  const root2 = path.join(root, '..', 'books');
  const dirs = fs.readdirSync(root2).filter((d) => fs.existsSync(path.join(root2, d, 'book.json')));
  assert.ok(dirs.length >= 12, 'the books are there');
  const screen = read('app/licences.tsx');
  const sources = read(B('sources.ts'));
  let seen = 0;
  for (const d of dirs) {
    const book = JSON.parse(fs.readFileSync(path.join(root2, d, 'book.json'), 'utf8')) as { id: string; title: string; kind: string; sources?: Array<Record<string, string>> };
    if (book.kind === 'reflection') assert.ok((book.sources ?? []).length > 0, `${book.id}: a book of readings names its source`);
    for (const x of book.sources ?? []) {
      seen += 1;
      const q = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      const entry = `{ id: ${q(x.id)}, work: ${q(x.work)}, author: ${q(x.author)}${x.translator ? `, translator: ${q(x.translator)}` : ''}${x.year ? `, year: ${q(x.year)}` : ''}, licence: ${q(x.licence)}, url: ${q(x.url)}, bookId: ${q(book.id)}, usedIn: ${q(book.title)} }`;
      assert.ok(sources.includes(entry), `${book.id}: the source ${x.id} is on the Licences screen as book.json says it`);
    }
  }
  assert.equal(count(sources, /\{ id: 'gutenberg-/g), seen, 'and nothing is listed that no book has');
  assert.match(screen, /import \{ ORIGINAL_TEXT, READING_SOURCES, type ReadingSource \} from '@\/features\/library\/books\/sources';/);
  assert.match(screen, /<Group title="BOOKS IN THE LIBRARY" items=\{BOOKS\} \/>\s*<OriginalText \/>/);
  assert.match(sources, /export const ORIGINAL_TEXT = \{ name: 'The books of the Library', what: 'Original text written for CaminoPlus\.' \} as const;/);
  assert.doesNotMatch(sources.slice(sources.indexOf('export const ORIGINAL_TEXT')), /licen[cs]e|copyright|©|rights/i, 'no licence is claimed for the original text: who holds the rights is the owner\'s to say');
});

check('every button of the Books screens has a role, a label for a screen reader and a touch target of at least 44, and nothing in them is pressed that is not a button', () => {
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/<Pressable\b/g)) {
      const around = s.slice(m.index, (m.index ?? 0) + 500);
      assert.match(around, /accessibilityRole="button"/, `${f}: a Pressable that is not a button`);
      assert.match(around, /accessibilityLabel=/, `${f}: a Pressable without a label`);
    }
    // the words of a passage are the one text that can be pressed (as a verse of the Bible is): a link for a screen reader, in ReaderBlocks.tsx only
    const pressable = f === 'ReaderBlocks.tsx' ? s.replace(/<Text accessibilityRole="link" onPress=\{onChoose\} style=\{on \? chosen\(\) : undefined\}>/g, '') : s;
    assert.doesNotMatch(pressable, /\bonClick\b|<TouchableOpacity|<TouchableWithoutFeedback|<Text[^>]*onPress/, `${f}: another way to press`);
  }
  assert.match(src['BookPage.tsx'], /minHeight: 56/);
  assert.match(src['ReaderHeader.tsx'], /<BackButton onPress=\{onContents\} /, 'the way back is the app\'s Back button, 48 by 48');
  assert.match(src['ChapterFooter.tsx'], /minHeight: 64/);
  assert.match(src['BookRows.tsx'], /import \{ BookmarkToggle \} from '\.\.\/BookmarkToggle';/, 'the bookmark button of a row is the one of the Library, 44 by 44');
  assert.match(read('src/features/library/BookmarkToggle.tsx'), /width: 44, height: 44/);
  for (const f of ['BooksBanner.tsx', 'BooksGrid.tsx']) assert.equal(count(src[f], /<Pressable\b/g), 0, `${f} is not a button`);
  assert.equal(count(src['ReaderBlocks.tsx'], /<Text accessibilityRole="link" onPress=\{onChoose\}/g), 1, 'the words of a passage: one text, a link, that a touch chooses');
  assert.match(src['PassageActions.tsx'], /minHeight: ACTION_MIN_HEIGHT/, 'Bookmark, Copy and Share are as high as the Bible\'s (68)');
  assert.match(src['PassageRows.tsx'], /minHeight: 44/, 'a row of a bookmarked passage is at least 44 high');
});

check('text sizes grow with the phone, up to a cap: the running text of the reader and the contents have no fixed size, the header, the cover and the banner are held at their own limits', () => {
  assert.doesNotMatch(src['ReaderHeader.tsx'], /maxFontSizeMultiplier/, 'the header has no text that grows: its three buttons are a letter A, which stops at 1, and an icon');
  assert.equal(count(src['ReaderBar.tsx'], /maxFontSizeMultiplier=\{BAR_FONT_LIMIT\}/g), 2, 'the bar has two: the title of the book and "Chapter 7 of 40"');
  assert.match(src['ChapterFooter.tsx'], /maxFontSizeMultiplier=\{1\.3\}/);
  const page = src['BookPage.tsx'];
  assert.doesNotMatch(page, /maxFontSizeMultiplier/, 'the book page grows with the phone without a limit');
  assert.doesNotMatch(page, /numberOfLines=\{1\}/, 'and cuts nothing to one line');
  assert.match(page, /numberOfLines=\{3\}/, 'except the line under a chapter in the contents, which is cut at three lines');
});

check('the design page: the group of the Books phones stands before the daily reading, once, and no phone has more than one handwritten note (what the phones show is checked in designBooks.test.ts, which draws them again from the bundle)', () => {
  const design = fs.readFileSync(path.join(root, '..', 'design', 'index.html'), 'utf8');
  const at = (needle: string) => design.indexOf(needle);
  assert.ok(at('<h3 id="books-reader">') > 0 && at('<h3 id="books-reader">') < at('<h3 id="daily-reading">'), 'the Books group is before the Daily reading group');
  assert.equal(count(design, /<h3 id="books-reader">/g), 1);
  const group = design.slice(at('<h3 id="books-reader">'), at('<h3 id="daily-reading">'));
  for (const phone of group.split('<p class="phone-label">').slice(1)) assert.ok(count(phone, /class="hw"/g) <= 1, 'at most one handwritten note on a screen');
});

console.log(`${n} of ${n} passed (Books screens)`);
