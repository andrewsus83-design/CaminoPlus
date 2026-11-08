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

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

const DIR = 'src/features/library/books';
const B = (f: string) => `${DIR}/${f}`;
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

/** The files of this feature that are mine: the screens and what they use. (bookText.ts, bookTextApi.ts, books.generated.ts, bookTextTypes.ts are the texts', catalog.ts is the catalog.) */
const SCREENS = ['BookCover.tsx', 'BookPage.tsx', 'BookRows.tsx', 'BookUi.tsx', 'BooksBanner.tsx', 'BooksGrid.tsx', 'BooksNotice.tsx', 'ChapterFooter.tsx', 'Reader.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx'];
const LOGIC = ['copy.ts', 'cover.ts', 'readerType.ts', 'reading.ts', 'typeMetrics.ts'];
const HOOKS = ['readingStore.ts', 'safeText.ts', 'useBooksReading.ts', 'useReaderSize.ts', 'useReadingWriter.ts'];
const MINE = [...SCREENS, ...LOGIC, ...HOOKS];
const ROUTES = ['app/library/book/[id]/index.tsx', 'app/library/book/[id]/read.tsx'];
const sources = (): Record<string, string> => Object.fromEntries([...MINE.map((f) => [f, code(read(B(f)))] as const), ...ROUTES.map((f) => [f, code(read(f))] as const)]);
const src = sources();

check('the Books feature is the files this test expects: every file of the books folder is one of mine, the texts\' or the catalog\'s (a new one is looked at by the scans below)', () => {
  const theirs = ['bookText.ts', 'bookTextApi.ts', 'bookTextTypes.ts', 'books.generated.ts', 'catalog.ts'];
  const inFolder = fs.readdirSync(path.join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).sort();
  assert.deepEqual(inFolder, [...MINE, ...theirs].sort());
  for (const r of ROUTES) assert.ok(fs.existsSync(path.join(root, r)), r);
});

check('the pure files stay pure: reading, covers, sizes, metrics and words import nothing but each other and the plain data of the feature (no React, no React Native, no theme, no store)', () => {
  for (const f of LOGIC) {
    for (const m of src[f].matchAll(/^import [^;]*? from '([^']+)';/gm)) assert.match(m[1], /^\.\.?\//, `${f} imports ${m[1]}`);
    assert.doesNotMatch(src[f], /from '\.\.?\/[^']*(?:\.tsx|bookText'|readingStore|use[A-Z])/, `${f} reaches a screen, a hook or the text data`);
  }
  assert.match(src['copy.ts'], /from '\.\.\/sample';/, 'copy.ts reads only sample.ts, which is plain data too');
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
  assert.match(cover, /backgroundColor: fixed\[book\.cover\]/, 'the colour of a cover is one of the catalog\'s six');
  assert.doesNotMatch(cover, /\brole\.|\bc\.(?!\w*Bright)/, 'a cover does not change with light and dark: no role, no flipping palette colour');
  assert.match(cover, /fixed\.goldBright/, 'the ribbon of a bookmarked book is the bright gold');
  for (const f of ['BookPage.tsx', 'BookRows.tsx', 'BookUi.tsx', 'ChapterFooter.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx', 'Reader.tsx']) {
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
  assert.match(cover, /variant="label"[\s\S]{0,420}text\.author\.lines\.join/, 'the author is Inter, in small spaced capitals');
  assert.match(cover, /variant="mono"[^\n]*>\{book\.era\}</, 'the era is JetBrains Mono');
  assert.match(cover, /variant="mono"[^\n]*>\{free \? 'FREE' : 'SOON'\}</, 'Free and Soon are JetBrains Mono');
  const page = src['BookPage.tsx'];
  assert.match(page, /<AppText variant="h3" accessibilityRole="header" style=\{\{ textAlign: 'center' \}\}>\{book\.title\}<\/AppText>/, 'the title of the book is Fraunces');
  assert.match(page, /<AppText variant="mono" muted style=\{\{ fontSize: 14, lineHeight: 20 \}\}>\{book\.era\}<\/AppText>/);
  assert.match(page, /bookFacts\(index\.chapters, index\.words\)/, 'the chapters, words and reading time are mono');
  assert.match(page, /<AppText variant="mono" muted style=\{\{ fontSize: 14, lineHeight: 20 \}\}>\{`\$\{chapters\.length\}/);
  assert.match(page, /<View accessible accessibilityRole="header" accessibilityLabel=\{g\.part\} style=\{\{ gap: 2, marginTop: gi === 0 \? 0 : 8 \}\}>/, 'a part is one heading for a screen reader, with its whole name');
  assert.match(page, /<AppText variant="h4" style=\{\{ fontSize: 19, lineHeight: 25 \}\}>\{partName\(g\.part\)\}<\/AppText>/, 'a part is a heading in Fraunces: its name');
  assert.match(page, /\{!!partSubtitle\(g\.part\) && <AppText variant="small" muted numberOfLines=\{4\}/, 'and what it is about under it, in Inter, in at most four lines');
  assert.match(page, /<AppText variant="mono" muted style=\{\{ width: 36, textAlign: 'right'/, 'the number of a chapter is mono');
  assert.match(page, /<AppText variant="label">\{label\}<\/AppText>/, 'the chapter in the contents is Inter');
  const reader = src['Reader.tsx'];
  assert.match(reader, /<AppText variant="h3" maxFontSizeMultiplier=\{face\.maxMultiplier\}[^>]*>\{head\.label\}<\/AppText>/, 'the title of a chapter is Fraunces');
  assert.match(reader, /const face = head\.label\.length > LONG_LABEL \? type\.heading : type\.title;/, 'a label that is a whole sentence is set in the size of a heading, not of a title');
  assert.match(reader, /<AppText variant="mono" muted maxFontSizeMultiplier=\{type\.meta\.maxMultiplier\}[^>]*>\{`\$\{readingTime\(words\)\} · \$\{groupThousands\(words\)\} words`\}<\/AppText>/, 'the time and the words are mono');
  const blocks = src['ReaderBlocks.tsx'];
  for (const name of ['Paragraph', 'Quotation', 'Point']) {
    const from = blocks.indexOf(`const ${name} = memo(`);
    assert.ok(from >= 0, name);
    const body = blocks.slice(from, blocks.indexOf('\n});', from));
    assert.doesNotMatch(body, /variant=/, `${name}: the running text of the reader is Inter, the body variant of AppText`);
  }
  assert.doesNotMatch(blocks, /variant="(?:mono|accent)"/, 'no mono and no handwriting in the words of a chapter');
  assert.match(blocks, /<AppText variant="h4" accessibilityRole="header"/, 'a heading inside a chapter is Fraunces and a heading for a screen reader');
  const header = src['ReaderHeader.tsx'];
  assert.match(header, /<AppText variant="mono" muted numberOfLines=\{1\}[^>]*>\{positionLine\(nav\)\}<\/AppText>/, '"Chapter 7 of 40" is mono');
  assert.match(header, /<AppText variant="label" numberOfLines=\{1\}[^>]*>\{bookTitle\}<\/AppText>/, 'the title of the book in the header is Inter');
  const footer = src['ChapterFooter.tsx'];
  assert.match(footer, /<AppText variant="mono"[^>]*textTransform: 'uppercase'/, 'NEXT and PREVIOUS are mono');
});

check('the handwritten font, Caveat Bold, is one short note on a screen, max one, and never in a button or in running text: the Books tab, the book page and the reader each have one at most', () => {
  const accent = (f: string) => count(src[f], /variant="accent"/g);
  // the Books tab: the one note is the banner's (CompactBanner draws it, beside the gold pill), and nothing else of the tab is handwritten
  for (const f of ['BookCover.tsx', 'BooksGrid.tsx', 'BooksNotice.tsx', 'BookRows.tsx', 'BookUi.tsx']) assert.equal(accent(f), 0, `${f}: the Books tab has one handwritten note, the banner's`);
  const banner = src['BooksBanner.tsx'];
  assert.equal(count(banner, /note=\{view\.note\}/g), 1);
  assert.match(banner, /if \(view\.kind === 'none'\) return <CompactBanner label=\{view\.label\} title=\{view\.title\} line=\{view\.line\} \/>;/, 'no note when there is no button: the plain line says the texts are being checked');
  // the book page and the reader: one each
  assert.equal(accent('BookPage.tsx'), 1);
  assert.equal(accent('ChapterFooter.tsx'), 1);
  for (const f of ['Reader.tsx', 'ReaderBlocks.tsx', 'ReaderHeader.tsx']) assert.equal(accent(f), 0, `${f}: the reader's one note is at the end of the chapter`);
  // and it is a few words, drawn alone, outside every button
  for (const f of ['BookPage.tsx', 'ChapterFooter.tsx']) {
    const at = src[f].indexOf('variant="accent"');
    const before = src[f].slice(0, at);
    assert.ok(count(before, /<Pressable\b/g) <= count(before, /<\/Pressable>/g) + (f === 'ChapterFooter.tsx' ? 0 : 0), `${f}: the handwritten note is not inside a button`);
    assert.match(src[f].slice(at - 20, at + 160), /<AppText variant="accent" color=\{role\.accentText\} style=\{\{ textAlign: 'center'/, `${f}: drawn alone, in the accent colour of the text`);
  }
  const { START_NOTE, CONTINUE_NOTE } = { START_NOTE: /START_NOTE = '([^']+)'/.exec(src['copy.ts'])![1], CONTINUE_NOTE: /CONTINUE_NOTE = '([^']+)'/.exec(src['copy.ts'])![1] };
  const notes = [START_NOTE, CONTINUE_NOTE, /PAGE_NOTE = '([^']+)'/.exec(src['BookPage.tsx'])![1], /CHAPTER_NOTE = '([^']+)'/.exec(src['ChapterFooter.tsx'])![1], /BOOK_NOTE = '([^']+)'/.exec(src['ChapterFooter.tsx'])![1]];
  for (const note of notes) assert.ok(note.split(' ').length <= 5 && note.length <= 24, `"${note}" is a few words`);
  for (const note of [START_NOTE, CONTINUE_NOTE]) assert.ok(note.length <= 7, `"${note}": the note beside the pill on a 320 phone has room for about seven characters`);
});

/* ================================================================ the cover and the grid */

check('a cover is ONE button labelled "title, author, free" (or soon) and its ribbon is another button beside it, never inside it; a small cover is no button and has no ribbon', () => {
  const cover = src['BookCover.tsx'];
  assert.match(cover, /accessibilityLabel=\{coverLabel\(book, hasText\)\}/);
  assert.match(cover, /accessibilityRole="button"\s+accessibilityLabel=\{coverLabel\(book, hasText\)\}/);
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
  assert.match(cover, /borderRadius: m\.radius, overflow: 'hidden', backgroundColor: fixed\[book\.cover\]/);
  assert.match(cover, /\.\.\.shadowStyle\('md'\)/, 'a soft shadow under the book');
  assert.match(cover, /const height = a5Height\(width\);/, 'an A5 page: as high as 210/148 of its width');
  assert.match(cover, /style=\{\{ width, height, borderRadius: m\.radius, backgroundColor: fixed\[book\.cover\], \.\.\.shadowStyle\('md'\) \}\}/);
  assert.match(cover, /right: right - \(touch - width\) \/ 2, width: touch, height: touch/, 'the ribbon button is touch by touch (44)');
  assert.equal(count(cover, /borderTopWidth: notch/g), 2, 'the notch at the foot of the ribbon is two triangles');
  assert.match(cover, /color=\{on \? fixed\.goldBright : PAPER\}[^\n]*filled=\{on\}/, 'a bookmarked book has a gold, filled bookmark on its ribbon; the others an outline: not the colour alone');
  assert.match(cover, /\{free \? 'FREE' : 'SOON'\}/);
  assert.match(cover, /backgroundColor: free \? INK : 'transparent', borderWidth: 1, borderColor: INK/, 'Free is a filled mark and Soon an empty ring: different in shape, not only in colour');
});

check('the words of a cover never grow with the phone\'s text size (the cover is a page of a fixed size, and the same words are on the book page), and are set where the fit was measured', () => {
  const cover = src['BookCover.tsx'];
  assert.equal(count(cover, /<AppText\b/g), count(cover, /maxFontSizeMultiplier=\{1\}/g), 'every text of a cover has a multiplier of 1');
  assert.match(cover, /\{text\.title\.lines\.join\('\\n'\)\}/, 'the title breaks where cover.ts measured it');
  assert.match(cover, /numberOfLines=\{text\.title\.lines\.length\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}/, 'and shrinks if a phone sets a word wider than the table says');
  assert.match(cover, /\{text\.author\.lines\.join\('\\n'\)\}/);
  assert.match(cover, /const text = coverText\(book, width\);/);
});

check('the Books tab: the notice, then the twelve books as covers in two columns that open the book page, each with the ribbon that keeps the bookmark under "books:<id>"', () => {
  const grid = src['BooksGrid.tsx'];
  assert.match(grid, /const grid = coverGrid\(width, layout\.screenMargin\);/, 'the width of a cover comes from the width of the screen and the margins of the screens');
  assert.match(grid, /const \{ width \} = useWindowDimensions\(\);/);
  assert.match(grid, /width: grid\.width, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: grid\.gap, rowGap: ROW_GAP/);
  assert.match(grid, /export const ROW_GAP = 16;/);
  assert.match(grid, /const open = useCallback\(\(id: string\) => router\.push\(bookPath\(id\)\), \[router\]\);/, 'a cover opens the book page');
  assert.match(grid, /hasText=\{hasBookText\(b\.id\)\}/, 'whether a book has a text is asked of bookText.ts, never kept by hand');
  assert.match(grid, /bookmarked=\{marks \? marks\.has\(itemKey\('Books', b\.id\)\) : undefined\}/);
  assert.match(grid, /const bookmark = useCallback\(\(id: string\) => toggle\?\.\(itemKey\('Books', id\)\), \[toggle\]\);/, 'the key of the bookmark is still books:<id>');
  assert.match(grid, /onOpen=\{open\}/);
  const tabs = code(read('src/features/library/LibraryTabs.tsx'));
  const tab = tabs.slice(tabs.indexOf('export function BooksTab'));
  assert.match(tab, /<BooksNotice \/>\s+<BooksGrid items=\{BOOK_CATALOG\} marks=\{marks\} \/>/);
  assert.doesNotMatch(tab, /BookRows|Pressable/);
  assert.match(tabs, /import \{ BooksGrid \} from '\.\/books\/BooksGrid';/);
  assert.match(tabs, /\{group === 'Books' && <BookRows items=\{hits\.Books\} marks=\{marks\} \/>\}/, 'a search and Bookmarks still list the books as rows, which open the page');
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /import \{ BooksBanner \} from '@\/features\/library\/books\/BooksBanner';/);
  assert.doesNotMatch(screen, /useBooksReading|booksReading/, 'the screen no longer reads the places of the books for the banner: the Continue reading bar above the tab bar reads them itself (continueBarWiring.test.ts)');
  assert.match(screen, /\{tab === 'Books' && <BooksBanner \/>\}/, 'the banner takes nothing: it never says "Continue reading" now');
  assert.doesNotMatch(screen, /BooksBanner\b[^;]*from '@\/features\/library\/LibraryBanner'/, 'the banner of the Books tab is not the old one of LibraryBanner.tsx');
});

check('the banner of the Books tab is the compact banner of the Bible tab with words of its own: nothing to press while no book has a text, "Start reading" opens the page of the first book that has one; it no longer continues a book: the Continue reading bar above the tab bar does, for the Bible and for the books', () => {
  const banner = src['BooksBanner.tsx'];
  assert.match(banner, /import \{ CompactBanner \} from '\.\.\/LibraryBanner';/, 'the same card, fonts and pill as the daily reading, not a second invention');
  assert.equal(count(banner, /<Pressable\b/g), 0, 'the card is the one button CompactBanner makes of it');
  assert.match(banner, /const view = booksBanner\(BOOK_CATALOG, hasBookText, null\);/, 'no place is passed, so the banner never says "Continue reading": that is the bar above the tab bar');
  assert.doesNotMatch(banner, /useBooksReading|reading\.last|readerPath/, 'the banner reads no place and opens no reader');
  assert.match(banner, /note=\{view\.note\} cta=\{view\.cta\} onPress=\{\(\) => router\.push\(bookPath\(view\.bookId\)\)\} hint=\{view\.hint\}/, 'the pill opens the page of the book');
  const compact = code(read('src/features/library/LibraryBanner.tsx'));
  assert.match(compact, /export function CompactBanner\(/);
  assert.match(compact, /height: 44, paddingHorizontal: 16, borderRadius: radius\.pill, backgroundColor: c\.gold/, 'the gold pill is 44 high');
  assert.match(compact, /export const COMPACT_BANNER_MAX_HEIGHT = 120;/);
});

check('the rows of a search and of Bookmarks: ONE button that opens the book page, the bookmark button beside it, a small cover, the mark Free or Soon; the Soon notices come only with a book that says Soon', () => {
  const rows = src['BookRows.tsx'];
  assert.match(rows, /accessibilityLabel=\{coverLabel\(b, has\)\}/);
  assert.match(rows, /onPress=\{\(\) => router\.push\(bookPath\(b\.id\)\)\}/);
  assert.match(rows, /<BookCover book=\{b\} width=\{THUMB_WIDTH\} hasText=\{has\} thumb \/>/);
  assert.match(rows, /\{has \? <Free \/> : <Soon \/>\}/, 'Free for a book with a text, Soon for one without: never both');
  assert.match(rows, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{b\.title\} toggle=\{\(\) => marks\.toggle\(key\)\} \/>/);
  assert.match(rows, /const key = itemKey\('Books', b\.id\);/);
  assert.match(rows, /Free to read/);
  assert.match(rows, /Coming soon/);
  assert.match(code(read('src/features/library/SearchResults.tsx')), /found\.hits\.Books\.some\(\(b\) => !hasBookText\(b\.id\)\) && <SampleNotice title="Coming soon">\{SEARCH_NOTICE\}<\/SampleNotice>/);
  assert.match(code(read('app/library/bookmarks.tsx')), /hits\.Books\.some\(\(b\) => !hasBookText\(b\.id\)\)\s+\? <SampleNotice title="Coming soon">\{BOOKMARKS_NOTICE\}<\/SampleNotice>/);
});

/* ================================================================ the book page */

check('the book page: the cover with its ribbon, the title, the author, the era and Free or Soon; for a book with a text the gold button, the contents and the credit of the edition; for one without, "Not in the app yet" and no button', () => {
  const page = src['BookPage.tsx'];
  assert.match(page, /<BookCover book=\{book\} width=\{coverWidth\} hasText=\{!!text\} bookmarked=\{marks\.has\(key\)\} onBookmark=\{toggle\} \/>/);
  assert.match(page, /export const coverWidthOf = \(screen: number\): number => Math\.min\(Math\.max\(Math\.round\(\(screen - 32\) \* 0\.6\), 150\), 240\);/, 'larger than the covers of the grid');
  assert.match(page, /\{text && target && nav \? \(/, 'the button and the contents are for a book that has a text, and can be read');
  assert.match(page, /\) : \(\s*<Card style=\{\{ gap: 8 \}\}>\s*<AppText variant="h4" accessibilityRole="header">\{NOT_YET_TITLE\}<\/AppText>\s*<AppText variant="small">\{NOT_YET_TEXT\}<\/AppText>/);
  const readable = page.slice(page.indexOf('{text && target && nav ? ('), page.indexOf(') : (\n        <Card'));
  assert.match(readable, /<ReadButton\s+label=\{readButtonLabel\(chapters, place\)\}\s+spoken=\{readButtonSpoken\(chapters, place\)\}/, '"Start reading" or "Continue: Chapter 7", and the whole title for a screen reader');
  assert.match(readable, /onPress=\{\(\) => open\(target\.id\)\}/);
  assert.match(page, /router\.push\(readerPath\(book\.id, chapterId\)\)/);
  assert.match(readable, /\{text\.credit\}/, 'the credit line of the edition, as the text gives it');
  assert.doesNotMatch(page.slice(page.indexOf(') : (\n        <Card')), /ReadButton|Pressable|TocRow/, 'a book without a text has no button and no contents');
  assert.match(page, /const text = useMemo\(\(\) => safeText\(book\.id\), \[book\.id\]\);/, 'a text that cannot be read is a book that is not in the app yet');
  assert.match(page, /const groups = useMemo\(\(\) => tocGroups\(chapters\), \[chapters\]\);/);
  assert.match(page, /\{groups\.map\(\(g, gi\) => \(/, 'the chapters under their parts');
  assert.match(page, /read=\{readSet\.has\(e\.id\)\} here=\{!!place && place\.c === e\.id\}/, 'the chapters read are marked, and the one where the person stopped');
  assert.match(page, /\{read && <View style=\{\{ marginTop: 1 \}\}><Icon name="check"/);
  assert.match(page, /LAST READ/);
  assert.match(page, /minHeight: 56/, 'a row of the contents is at least 56 high');
  assert.match(page, /const spoken = `\$\{entry\.title\}\$\{read \? ', read' : ''\}\$\{here \? ', where you stopped' : ''\}`;/);
  const missing = page.slice(page.indexOf('function Missing()'), page.indexOf('/** The page of the book with this id'));
  assert.match(missing, /UNKNOWN_TITLE/);
  assert.match(page, /if \(!book\) return <Missing \/>;/, 'an id that is no book is a calm sentence with the way to the Library');
  assert.match(page, /\{!!notice && <FormMessage tone="info">\{notice\}<\/FormMessage>\}/);
  assert.match(page, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
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
  assert.match(reader, /<Reader key=\{`\$\{typeof id === 'string' \? id : ''\}\.\$\{typeof c === 'string' \? c : ''\}`\} id=\{typeof id === 'string' \? id : ''\} chapterId=\{typeof c === 'string' && c \? c : undefined\} \/>/);
  assert.match(code(read('src/features/library/books/copy.ts')), /export const readerPath = \(id: string, chapterId\?: string\): string => `\/library\/book\/\$\{id\}\/read\$\{chapterId \? `\?c=\$\{encodeURIComponent\(chapterId\)\}` : ''\}`;/);
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
  assert.match(reader, /y: startAt\(writer\.peek\(\), chapters\[i\]\.id\)/, 'a chapter opens at the line where the person was in it, when it is the saved one');
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
  assert.match(reader, /<ReaderBlocks items=\{items\} t=\{type\} \/>/);
  assert.match(reader, /<View accessible accessibilityRole="header" accessibilityLabel=\{chapter\.title\}/, 'one heading with the whole title, however it is split for the eye');
  assert.match(reader, /maxWidth: type\.measure/, 'a line is about 70 characters on a wide window');
  assert.match(reader, /paddingBottom: insets\.bottom \+ 48/);
  const blocks = src['ReaderBlocks.tsx'];
  assert.ok(count(blocks, /= memo\(function /g) >= 7, 'every block, and the chapter, is memoised: a scroll draws only the thin line');
  assert.match(blocks, /export const ReaderBlocks = memo\(function ReaderBlocks/);
});

check('the header of the reader: Contents, Smaller and Larger text, Previous and Next named by where they go and dimmed and disabled at the ends, the title of the book with "Chapter 7 of 40", and a thin line that is only a picture', () => {
  const header = src['ReaderHeader.tsx'];
  assert.match(header, /accessibilityLabel="Contents"\s+accessibilityHint="Back to the table of contents of this book"/);
  assert.match(header, /minHeight: 44, flexDirection: 'row', alignItems: 'center'/);
  assert.match(header, /<SizeTap larger=\{false\} disabled=\{!canShrink\} onPress=\{onSmaller\} \/>/);
  assert.match(header, /<SizeTap larger disabled=\{!canGrow\} onPress=\{onLarger\} \/>/);
  assert.match(header, /<IconTap icon="back" label=\{previousLabel\(nav\)\} disabled=\{!nav\.prev\} onPress=\{onPrevious\} \/>/);
  assert.match(header, /<IconTap icon="chevron" label=\{nextLabel\(nav\)\} disabled=\{!nav\.next\} onPress=\{onNext\} \/>/);
  assert.match(header, /<AppText accessibilityLiveRegion="polite" style=\{VISUALLY_HIDDEN\}>\{sizeLine\(step\)\}<\/AppText>/, '"Text size 4 of 5" is said when the size changes');
  assert.match(header, /<View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\{ height: 3, backgroundColor: role\.border \}\}>/, 'the line is a picture: the position is said in words');
  assert.match(header, /width: `\$\{Math\.round\(fraction \* 100\)\}%`, backgroundColor: role\.action/);
  assert.match(header, /paddingTop: insets\.top \+ layout\.screenTop/, 'under the camera, like every screen');
  assert.match(header, /maxFontSizeMultiplier=\{HEADER_FONT_LIMIT\}/, 'the header never takes the page when the text is large');
  assert.match(header, /const HEADER_FONT_LIMIT = 1\.3;/);
  const ui = src['BookUi.tsx'];
  assert.equal(count(ui, /width: 44, height: 44/g), 2, 'the round buttons are 44 by 44');
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

check('the words of a chapter: a heading is a heading for a screen reader, a quotation or a poem is indented with a rule, a point has its marker hanging in a column of its own, a break is for the eye only, and every size comes from the step', () => {
  const blocks = src['ReaderBlocks.tsx'];
  assert.match(blocks, /<AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier=\{t\.heading\.maxMultiplier\}/);
  assert.match(blocks, /borderLeftWidth: RULE, borderLeftColor: role\.borderStrong/);
  assert.match(blocks, /const \{ marker, rest \} = splitMarker\(item\.t\);/);
  assert.match(blocks, /width: Math\.round\(t\.body\.size \* 1\.9\)/);
  assert.match(blocks, /<View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\{ alignSelf: 'center', width: 48, height: 1/);
  assert.match(blocks, /marginBottom: item\.end \? t\.gap : 0/, 'the pieces of a long paragraph follow each other with no space');
  assert.equal(count(blocks, /maxFontSizeMultiplier=\{t\.(?:body|quote|heading)\.maxMultiplier\}/g), 5, 'every text of the chapter has the cap of its face');
  assert.doesNotMatch(blocks, /fontSize: \d/, 'no size of its own: they all come from the step chosen');
  assert.doesNotMatch(blocks, /textAlign: 'justify'/, 'no justified text: it makes rivers on a narrow column');
  const reader = src['Reader.tsx'];
  assert.match(reader, /fontSize: face\.size, lineHeight: face\.lineHeight/);
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
  const store = src['readingStore.ts'];
  assert.match(store, /import \{ localStore \} from '@\/lib\/localStore';/);
  assert.match(store, /let queue: Promise<unknown> = Promise\.resolve\(\);/);
  assert.match(store, /await queue;\s+return parseReading\(await localStore\.getJSON<unknown>\(key\)\) \?\? emptyReading\(\);/, 'a read waits for the writes before it: the reader of one chapter is left while the next is opened');
  assert.match(store, /parseStep\(await localStore\.getJSON<unknown>\(SIZE_NAME\)\) \?\? DEFAULT_STEP/);
  assert.doesNotMatch(store, /userKey/, 'the text size belongs to the phone, not to a person: logging out does not wipe it');
  assert.match(src['useBooksReading.ts'], /const key = uid \? userKey\(uid, READING_NAME\) : null;/);
  assert.match(src['useBooksReading.ts'], /useFocusEffect\(/, 'read again every time the screen comes back: the reader changes the places under it');
  assert.match(src['useBooksReading.ts'], /last: ready \? lastRead\(stored, hasBookText\) : null,/, 'a place in a book that has no text is never offered');
  assert.match(src['useReaderSize.ts'], /void saveSize\(next\);/);
  assert.match(src['readerType.ts'], /export const SIZE_NAME = 'library\.books\.size';/);
  assert.match(src['reading.ts'], /export const READING_NAME = 'library\.reading';/);
  const store2 = read('src/lib/localStore.ts');
  assert.match(store2, /export const clearUserData = \(uid: string\) => localStore\.removeByPrefix\(`u\.\$\{uid\}\.`\);/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'signing out wipes every u.<userId>. key, the places included');
});

/* ================================================================ honest words, data only, touch */

check('honest words: a book without a text says Soon and why, nothing says "verified", "official" or "certified", and whether a book has a text is asked of bookText.ts and never kept in the catalog', () => {
  for (const [f, s] of Object.entries(src)) assert.doesNotMatch(s, /verified|official|certified|approved|guaranteed/i, `${f}: an honest word`);
  const copy = read(B('copy.ts'));
  assert.match(copy, /export const NOT_YET_TITLE = 'Not in the app yet';/);
  assert.match(copy, /export const NOT_YET_TEXT = 'We are checking the edition of this book before we add it\.';/, 'the one honest sentence: the edition is being checked');
  assert.match(copy, /export const NONE_LINE = 'The texts are being checked\.';/);
  assert.doesNotMatch(read('src/features/library/sample.ts'), /verified|official|certified/i);
  const catalog = code(read(B('catalog.ts')));
  assert.doesNotMatch(catalog, /\b(?:hasText|available|isReady|ready|readable|inApp)\b\s*[:?]/, 'availability is never a field of the catalog');
  assert.doesNotMatch(catalog, /bookText|BOOK_TEXT_INDEX/, 'the catalog does not know the texts');
  for (const f of ['BooksGrid.tsx', 'BookRows.tsx', 'BooksNotice.tsx', 'BooksBanner.tsx']) assert.match(src[f], /hasBookText/, `${f} asks bookText.ts`);
  assert.match(src['BookPage.tsx'], /safeText\(book\.id\)/, 'the page asks for the text through safeText, which asks bookText.ts');
  assert.match(src['safeText.ts'], /if \(!hasBookText\(id\)\) return null;/);
});

check('data only: the screens of the books never read or print the group, the source, the licence flag or note, or the edition to confirm of a book', () => {
  for (const [f, s] of Object.entries(src)) {
    assert.doesNotMatch(s, /\blicence\w*|editionToConfirm|\.group\b|\.source\b|\bgroup:|\bsource:/, `${f}: data that is only for later`);
    assert.doesNotMatch(s, /gutenberg|ccel\.org/i, `${f}: names a source site`);
  }
});

check('every button of the Books screens has a role, a label for a screen reader and a touch target of at least 44, and nothing in them is pressed that is not a button', () => {
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/<Pressable\b/g)) {
      const around = s.slice(m.index, (m.index ?? 0) + 500);
      assert.match(around, /accessibilityRole="button"/, `${f}: a Pressable that is not a button`);
      assert.match(around, /accessibilityLabel=/, `${f}: a Pressable without a label`);
    }
    assert.doesNotMatch(s, /\bonClick\b|<TouchableOpacity|<TouchableWithoutFeedback|<Text[^>]*onPress/, `${f}: another way to press`);
  }
  assert.match(src['BookPage.tsx'], /minHeight: 56/);
  assert.match(src['ReaderHeader.tsx'], /minHeight: 44/);
  assert.match(src['ChapterFooter.tsx'], /minHeight: 64/);
  assert.match(src['BookRows.tsx'], /import \{ BookmarkToggle \} from '\.\.\/BookmarkToggle';/, 'the bookmark button of a row is the one of the Library, 44 by 44');
  assert.match(read('src/features/library/BookmarkToggle.tsx'), /width: 44, height: 44/);
  for (const f of ['BooksBanner.tsx', 'BooksGrid.tsx', 'BooksNotice.tsx', 'ReaderBlocks.tsx']) assert.equal(count(src[f], /<Pressable\b/g), 0, `${f} is not a button`);
});

check('text sizes grow with the phone, up to a cap: the running text of the reader and the contents have no fixed size, the header, the cover and the banner are held at their own limits', () => {
  assert.equal(count(src['ReaderHeader.tsx'], /maxFontSizeMultiplier=\{HEADER_FONT_LIMIT\}/g), 3);
  assert.match(src['ChapterFooter.tsx'], /maxFontSizeMultiplier=\{1\.3\}/);
  const page = src['BookPage.tsx'];
  assert.doesNotMatch(page, /maxFontSizeMultiplier/, 'the book page grows with the phone without a limit');
  assert.doesNotMatch(page, /numberOfLines=\{1\}/, 'and cuts nothing to one line');
  assert.match(page, /numberOfLines=\{3\}/, 'except the line under a chapter in the contents, which is cut at three lines');
});

check('the design page shows the Books screens as the app draws them: the twelve covers at the size the grid works out, Free or Soon as their label says, the paper of the tokens, one handwritten note a phone, and the group stays before the daily reading', () => {
  const design = fs.readFileSync(path.join(root, '..', 'design', 'index.html'), 'utf8');
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { color: Record<string, string> };
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** The phone with this label: the text from its label to the next phone (or the script or the heading that follows the last of the group). */
  const phoneOf = (label: string): string => {
    const open = `<p class="phone-label"><b>${label}</b>`;
    assert.equal(design.split(open).length - 1, 1, `the design page has exactly one phone "${label}"`);
    const start = design.indexOf(open);
    const ends = ['<p class="phone-label">', '<script>', '<h3 '].map((x) => design.indexOf(x, start + 10)).filter((i) => i > 0);
    return design.slice(start, Math.min(...ends));
  };
  const GROUP = ['Library · Books', 'Books · dark', 'Books · 320 wide', 'Books · no texts yet', 'Book page', 'Book page · Continue', 'Book page · Soon', 'Reader', 'Reader · dark', 'Reader · large text', 'Reader · end of a chapter'];
  const phones = Object.fromEntries(GROUP.map((l) => [l, phoneOf(l)] as const));

  // the group stands before the daily reading (which stays the last of the screens), once, between its markers
  const at = (needle: string) => design.indexOf(needle);
  assert.ok(at('<h3 id="books-reader">') > 0 && at('<h3 id="books-reader">') < at('<h3 id="daily-reading">'), 'the Books group is before the Daily reading group');
  assert.equal(count(design, /<h3 id="books-reader">/g), 1);
  assert.ok(at('<!-- Library · Books phone (start) -->') > 0 && at('<!-- Library · Books phone (start) -->') < at('<!-- Library · Books phone (end) -->'));
  assert.doesNotMatch(design, /class="lib-book"|Preview · Books|Twelve free companions for the road/, 'the old Books rows and banner are gone from the phones');

  // the grid: twelve covers of the size the grid works out, A5 portrait, in the order of the catalog, each ONE button whose label says what the mark says
  const grids: Array<[string, number]> = [['Library · Books', 390], ['Books · dark', 390], ['Books · 320 wide', 320], ['Books · no texts yet', 390]];
  for (const [label, width] of grids) {
    const phone = phones[label];
    const g = coverGrid(width, 16);
    const m = coverMetrics(g.tile);
    assert.equal(m.height, a5Height(g.tile), `${label}: the cover is an A5 page`);
    const covers = phone.split('<div class="bk-cover"').slice(1);
    assert.equal(covers.length, 12, `${label}: twelve covers`);
    covers.forEach((seg, i) => {
      const book = BOOK_CATALOG[i];
      assert.match(seg, new RegExp(`^ style="width:${g.tile}px;height:${m.height}px;border-radius:${m.radius}px;--paper:var\\(--bk-paper-${book.cover}\\)"`), `${label}: ${book.title} is ${g.tile} by ${m.height}`);
      const spoken = /role="button" aria-label="([^"]+)"/.exec(seg)?.[1];
      const mark = /class="bk-mark (free|soon)"/.exec(seg)?.[1];
      assert.ok(spoken && mark, `${label}: ${book.title} is one button with a mark`);
      assert.equal(spoken, esc(coverLabel(book, mark === 'free')), `${label}: the label of ${book.title} says what its mark says`);
      assert.match(seg, new RegExp(`class="bk-ribbon[^"]*" aria-label="(Remove bookmark|Bookmark): ${esc(book.title)}"`), `${label}: the ribbon of ${book.title} is a button of its own`);
      assert.equal(count(seg, /role="button"/g), 1, `${label}: ${book.title} has one button inside its cover`);
    });
    assert.match(phone, new RegExp(`grid-template-columns:repeat\\(2,${g.tile}px\\)`), `${label}: two columns`);
  }
  assert.doesNotMatch(phones['Books · no texts yet'], /class="bk-mark free"/, 'with no text in any book every cover says Soon');
  assert.match(phones['Books · no texts yet'], /<div class="cp-banner cmp"><div class="ey">Books · Soon<\/div><h4>Books for the road<\/h4><div class="row"><span class="ln">The texts are being checked\.<\/span><\/div><\/div>/, 'and the banner has no button and says why');
  assert.match(phones['Books · no texts yet'], /<div class="h">Preview<\/div><div class="p">Books are not in the app yet\. We are checking the editions before we add them\.<\/div>/);

  // the banner of a phone with books: one button for a screen reader that opens a book which the same phone shows as Free
  for (const [label, cta, note] of [['Library · Books', 'Start reading', 'No rush'], ['Books · dark', 'Continue reading', 'Onward!'], ['Books · 320 wide', 'Start reading', 'No rush']]) {
    const phone = phones[label];
    const m = /<div class="cp-banner cmp" role="button" aria-label="([^"]+)"><div class="ey">([^<]+)<\/div><h4>Books for the road<\/h4><div class="row"><span class="hw">([^<]+)<\/span><span class="pill">([^<]+)<\/span><\/div><\/div>/.exec(phone);
    assert.ok(m, `${label}: the compact banner with a note and a pill`);
    assert.deepEqual([m[3], m[4]], [note, cta], `${label}: the words of the banner`);
    assert.equal(m[1], `${cta}. Books for the road. ${m[2]}`, `${label}: what a screen reader says`);
    const book = BOOK_CATALOG.find((b) => esc(b.title) === m[2]);
    assert.ok(book, `${label}: the label of the banner is the title of a book`);
    assert.ok(phone.includes(`aria-label="${esc(coverLabel(book, true))}"`), `${label}: the book the banner opens says Free on its cover`);
  }
  assert.match(phones['Books · dark'], /<div class="phone dk"/);
  assert.match(phones['Books · 320 wide'], /<div class="phone" style="width:320px">/);

  // the paper of a cover is the pale colours of the LIGHT palette, which dark mode does not swap
  const grid = /\.bk-cover, \.bk-pg, \.bk-grid \{([^}]*)\}/.exec(design)?.[1] ?? '';
  for (const colour of new Set(BOOK_CATALOG.map((b) => b.cover))) {
    assert.match(grid, new RegExp(`--bk-paper-${colour}:\\s*${tokens.color[colour]}\\b`, 'i'), `the paper ${colour} is ${tokens.color[colour]}`);
  }
  assert.match(grid, new RegExp(`--bk-ink:\\s*${tokens.color.blue}`, 'i'), 'the ink on a cover is the navy of the light palette');

  // one handwritten note on a screen, at most: the banner, the page of a book, the end of a chapter
  for (const label of GROUP) assert.ok(count(phones[label], /class="hw"/g) <= 1, `${label}: at most one handwritten note`);
  assert.equal(count(phones['Book page'], /class="hw"/g), 1);
  assert.equal(count(phones['Book page · Soon'], /class="hw"/g), 0, 'a book without a text has no note and no button');
  assert.equal(count(phones['Reader · end of a chapter'], /class="hw"/g), 1);

  // the book page: a book with a text has the gold button and the contents, one without says Not in the app yet and has neither
  assert.match(phones['Book page'], /<div class="btn" role="button" aria-label="Start reading">Start reading<\/div>[^]*<h4>Contents<\/h4>/);
  assert.match(phones['Book page · Continue'], /aria-label="Continue: [^"]+">Continue: [^<]+<\/div>/);
  assert.match(phones['Book page · Continue'], /LAST READ/);
  assert.match(phones['Book page · Continue'], /<div class="phone dk">/);
  assert.match(phones['Book page · Soon'], /<h4>Not in the app yet<\/h4><p>We are checking the edition of this book before we add it\.<\/p>/);
  assert.doesNotMatch(phones['Book page · Soon'], /class="btn"|bk-contents|class="bk-toc"/);

  // the reader: the sizes are the ones readerType works out for the step, the header is the one of the app
  const body = (step: number) => readerType(step).body;
  assert.match(phones['Reader'], new RegExp(`<p style="font-size:${body(DEFAULT_STEP).size}px;line-height:${body(DEFAULT_STEP).lineHeight}px;`));
  assert.match(phones['Reader · large text'], new RegExp(`<p style="font-size:${body(LAST_STEP).size}px;line-height:${body(LAST_STEP).lineHeight}px;`));
  assert.match(phones['Reader · large text'], /aria-label="Larger text"/);
  assert.match(phones['Reader · large text'], /class="a l off"/, 'at the largest step the larger button is dimmed');
  for (const label of ['Reader', 'Reader · dark', 'Reader · large text', 'Reader · end of a chapter']) {
    assert.match(phones[label], /aria-label="Contents"[^]*aria-label="Smaller text"[^]*aria-label="Larger text"/, `${label}: the header has Contents and the two sizes`);
    assert.match(phones[label], /class="bk-prog"/, `${label}: the thin progress line`);
    assert.match(phones[label], /aria-label="(Previous|Next): [^"]+"/, `${label}: Previous and Next name where they go`);
  }
  assert.match(phones['Reader · dark'], /<div class="phone dk">/);
  assert.match(phones['Reader · end of a chapter'], /class="step next" role="button" aria-label="Next: Chapter II[^"]*"[^]*class="step off" role="button" aria-label="Previous chapter\. This is the first chapter" aria-disabled="true"/, 'at the end of the first chapter Next is there and Previous is off');
});

console.log(`${n} of ${n} passed (Books screens)`);
