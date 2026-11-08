// Source-level checks of the Bible screens: the grid of books on the Bible tab, the chapters of a book, the reader, the card that continues the chapter read
// last, the actions on a verse, the search of verses. They read the files, nothing is run: what the pure parts do is checked in reader.test.ts and bible.test.ts;
// here it is that the screens use them the way they must (the routes are registered next to the other screens of the Library with the same guard, an address that
// leads nowhere is a calm "not found", a tile is one button with a name, nothing in the reader needs the network or a new native module, Copy asks for the
// clipboard before it shows, Previous and Next replace the screen and name where they go, the last place is kept only on the phone). Run from wiring.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
const BIBLE = 'src/features/library/bible';
const CHAPTERS = 'app/library/bible/[code]/index.tsx';
const CHAPTER = 'app/library/bible/[code]/[chapter].tsx';

check('the Bible screens are routes: /library/bible/<code> for the chapters and /library/bible/<code>/<chapter> for the words, registered next to the other screens of the Library with the same guard and no options', () => {
  assert.ok(fs.existsSync(path.join(root, CHAPTERS)));
  assert.ok(fs.existsSync(path.join(root, CHAPTER)));
  const layout = read('app/_layout.tsx');
  assert.match(layout, /<Stack\.Screen name="library\/bookmarks" \/>\n\s+<Stack\.Screen name="library\/daily" \/>\n\s+<Stack\.Screen name="library\/bible\/\[code\]\/index" \/>\n\s+<Stack\.Screen name="library\/bible\/\[code\]\/\[chapter\]" \/>/);
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  const end = layout.indexOf('</Stack.Protected>', guard);
  for (const name of ['library/bible/[code]/index', 'library/bible/[code]/[chapter]']) {
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    assert.ok(guard > 0 && at > guard && at < end, `${name} is registered inside the block of screens for someone who has a journey`);
  }
  assert.match(read('src/features/library/bible/order.ts'), /export const bookHref = \(code: string\): string => `\/library\/bible\/\$\{code\}`;/);
  assert.match(read('src/features/library/bible/order.ts'), /const base = `\/library\/bible\/\$\{r\.code\}\/\$\{r\.chapter\}`;\s+return r\.from === undefined \? base : `\$\{base\}\?v=\$\{r\.from\}`;/, 'a verse is ?v= on the address of its chapter');
});

check('the chapter screen: Back, the bookmark of the BOOK in the corner, the name as the title with its count in JetBrains Mono, one handwritten note, the chapter tiles; a code that is no book is "not found"', () => {
  const src = code(read(CHAPTERS));
  assert.match(src, /<Screen tabBar=\{false\}>/);
  assert.match(src, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
  assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(src, /const book = bookByCode\(typeof code === 'string' \? code\.toUpperCase\(\) : ''\);\s+if \(!book\) return <PlaceMissing message=\{MISSING_BOOK\} \/>;/);
  assert.match(src, /const key = itemKey\('Bible', book\.id\);/, 'the book is bookmarked under its id, as every bookmark kept before the tiles is');
  assert.match(src, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{book\.name\} toggle=\{\(\) => marks\.toggle\(key\)\} \/>/);
  assert.match(src, /<AppText variant="h2" accessibilityRole="header">\{book\.name\}<\/AppText>/);
  assert.match(src, /<AppText variant="mono" muted style=\{\{ fontSize: 15, lineHeight: 22 \}\}>\{chaptersLabel\(book\.chapters\)\}<\/AppText>/);
  assert.match(src, /<AppText variant="accent" color=\{role\.accentText\}>\{CHAPTERS_NOTE\}<\/AppText>/);
  assert.match(src, /<ChapterNumbers book=\{book\} onOpen=\{\(n\) => router\.push\(readerHref\(\{ code: book\.code, chapter: n \}\)\)\} \/>/, 'a tile pushes the chapter: Back returns to the tiles');
  assert.doesNotMatch(src, /verse|Verse/, 'verse numbers are not shown here: these are the chapters');
});

check('the chapter tiles: one button each ("Psalm 121", "Chapter 3"), square, at least 56 and filling the row, the number in JetBrains Mono held to 1.3 times its size', () => {
  const src = code(read(`${BIBLE}/ChapterGrid.tsx`));
  assert.match(src, /export const chapterTileLabel = \(book: BibleBook, n: number\): string => \(book\.code === 'PSA' \? `Psalm \$\{n\}` : `Chapter \$\{n\}`\);/);
  assert.match(src, /accessibilityRole="button"\s+accessibilityLabel=\{chapterTileLabel\(book, n\)\}\s+onPress=\{\(\) => onOpen\(n\)\}/);
  assert.match(src, /width: tile, height: tile/, 'square');
  assert.match(src, /<AppText variant="mono" maxFontSizeMultiplier=\{1\.3\} numberOfLines=\{1\} style=\{\{ fontSize: 20, lineHeight: 26 \}\}>\{n\}<\/AppText>/);
  assert.match(src, /const grid = chapterGrid\(width\);/);
  assert.match(src, /Array\.from\(\{ length: book\.chapters \}, \(_, i\) => i \+ 1\)/);
  assert.match(src, /flexDirection: 'row', flexWrap: 'wrap', gap: grid\.gap/);
  assert.match(src, /backgroundColor: pressed \? role\.sunken : role\.surface, borderWidth: 1, borderColor: role\.border/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]|fontFamily/);
  assert.match(code(read('src/features/library/bible/gridMath.ts')), /export const CHAPTER_TILE_MIN = 56;/);
});

check('the book tiles on the Bible tab: ONE button each named "Genesis, 50 chapters", square, the name in Fraunces (h4) fitted by tileFit.ts and the count in JetBrains Mono, no bookmark and no chip, three in a row between the side margins', () => {
  const src = code(read(`${BIBLE}/BookGrid.tsx`));
  assert.match(src, /export const tileLabel = \(b: BibleBook\): string => `\$\{b\.name\}, \$\{chaptersLabel\(b\.chapters\)\.replace\(\/\\u00a0\/g, ' '\)\}`;/);
  assert.match(src, /accessibilityRole="button"\s+accessibilityLabel=\{tileLabel\(book\)\}\s+onPress=\{\(\) => onOpen\(book\.code\)\}/);
  assert.equal((src.match(/<Pressable\b/g) ?? []).length, 1, 'a tile is one Pressable, and nothing else in it can be pressed');
  assert.match(src, /width: grid\.tile, height: grid\.tile, paddingHorizontal: grid\.padX, paddingVertical: grid\.padY/, 'the name is the hero: as little padding across as the round corners allow');
  assert.match(src, /const name = fitName\(book\.name, grid\.innerWidth, fontScale\);/);
  assert.match(src, /const count = fitCount\(chaptersLabel\(book\.chapters\), grid\.innerWidth, fontScale\);/);
  assert.match(src, /<AppText\s+variant="h4"\s+maxFontSizeMultiplier=\{TEXT_SCALE_CAP\}\s+numberOfLines=\{name\.lines\.length\}\s+style=\{\{ fontSize: name\.size, lineHeight: name\.lineHeight, letterSpacing: name\.tracking \}\}\s+>\s+\{name\.lines\.join\('\\n'\)\}/);
  assert.match(src, /<AppText\s+variant="mono"\s+muted\s+maxFontSizeMultiplier=\{TEXT_SCALE_CAP\}\s+numberOfLines=\{1\}\s+style=\{\{ fontSize: count\.size, lineHeight: count\.lineHeight \}\}\s+>\s+\{chaptersLabel\(book\.chapters\)\}/);
  assert.match(src, /const \{ width, fontScale \} = useWindowDimensions\(\);\s+const grid = bookGrid\(width\);/);
  assert.match(src, /flexDirection: 'row', flexWrap: 'wrap', gap: grid\.gap/);
  assert.match(src, /backgroundColor: pressed \? role\.sunken : role\.surface, borderWidth: 1, borderColor: role\.border/);
  assert.doesNotMatch(src, /BookmarkToggle|marks|Soon|Chip|#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]|fontFamily|adjustsFontSizeToFit/, 'the 44 touch target of a bookmark does not fit a square of 90: the book is bookmarked on its own screen; no chip; no literal colour or font');
  assert.match(src, /memo\(function BookTile/, 'a tile is drawn again only when its own props change');
  // where it is used: the Bible tab, for the books of the chosen part
  assert.match(code(read('src/features/library/LibraryTabs.tsx')), /<BibleBookGrid books=\{booksOf\(testament\)\} onOpen=\{onOpenBook\} \/>/);
});

check('the Bible tab: the continue card (only when something was read), the compact banner, the three choices, the heading with the count and the quiet source line, then the tiles; the tab opens a book and the card opens the chapter', () => {
  const screen = code(read('app/(tabs)/library.tsx'));
  const bible = screen.slice(screen.indexOf('<Screen keyboard>'));
  const order = ["tab === 'Bible' && lastRead.place && <ContinueCard", "tab === 'Bible' && <DailyBanner", "tab === 'Bible' && <BibleTab"].map((needle) => bible.indexOf(needle));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `the card, the banner, the Bible tab (${order})`);
  assert.match(bible, /<ContinueCard place=\{lastRead\.place\} onOpen=\{\(\) => router\.push\(readerHref\(\{ code: lastRead\.place!\.code, chapter: lastRead\.place!\.chapter \}\)\)\} \/>/);
  assert.match(bible, /<BibleTab testament=\{testament\} onTestament=\{setTestament\} onOpenBook=\{\(code\) => router\.push\(bookHref\(code\)\)\} \/>/);
  assert.match(screen, /const lastRead = useLastRead\(\);/);
  assert.match(screen, /useState<Testament>\('old'\)/, 'the Old Testament is on first');
  const tabs = code(read('src/features/library/LibraryTabs.tsx'));
  const tab = tabs.slice(tabs.indexOf('export function BibleTab'), tabs.indexOf('export function BooksTab'));
  const parts = ['<TestamentBar value={testament} onChange={onTestament} />', 'Books of the Bible', 'BIBLE_SOURCE_LINE', '<BibleBookGrid'].map((needle) => tab.indexOf(needle));
  assert.ok(parts.every((i) => i > 0) && parts.every((i, k) => k === 0 || i > parts[k - 1]), `the choice, the heading, the source line, the tiles (${parts})`);
  assert.match(tab, /<AppText variant="h4" accessibilityRole="header">Books of the Bible<\/AppText>/);
  assert.match(tab, /<AppText variant="mono" muted accessibilityLiveRegion="polite" accessibilityLabel=\{`\$\{TESTAMENT_LABEL\[testament\]\}, \$\{countLine\(testament\)\}`\}/, 'the count is data, and a polite live region that says the part with it');
  assert.match(tab, /\{testament === 'deutero' && <AppText variant="caption" muted>\{ADDITIONS_NOTE\}<\/AppText>\}\s+\{testament === 'deutero' && <AppText variant="caption" muted>\{DEUTERO_NOTE\}<\/AppText>\}/, 'under the Deuterocanon: where the Greek additions are, and the Orthodox note');
  assert.doesNotMatch(tab, /Notice|SampleNotice|Preview|Soon/, 'the Bible tab has no Preview notice any more: one quiet source line');
  assert.match(tab, /BIBLE_SOURCE_LINE\.replace\('public domain', 'public\\u00a0domain'\)/, 'a line that has to wrap never leaves "domain" alone');
  // the daily reading banner opens the same screen as before
  assert.match(screen, /<DailyBanner onOpen=\{\(\) => router\.push\('\/library\/daily'\)\} \/>/);
});

check('the reader is the screen at /library/bible/<code>/<chapter>: the address is read by placeFromParams, a place that is none is "not found", and the reader is keyed on the chapter so that a new chapter starts at its top', () => {
  const src = code(read(CHAPTER));
  assert.match(src, /const \{ code, chapter, v \} = useLocalSearchParams<\{ code\?: string; chapter\?: string; v\?: string \}>\(\);/);
  assert.match(src, /const at = placeFromParams\(code, chapter, v\);/);
  assert.match(src, /if \(!at\) return <PlaceMissing message=\{MISSING_CHAPTER\} code=\{typeof code === 'string' \? code : undefined\} \/>;/);
  assert.match(src, /return <Reader key=\{`\$\{at\.place\.code\}\.\$\{at\.place\.chapter\}`\} place=\{at\.place\} verse=\{at\.verse\} \/>;/);
  const missing = code(read(`${BIBLE}/PlaceMissing.tsx`));
  assert.match(missing, /<Screen tabBar=\{false\}>/);
  assert.match(missing, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
  assert.match(missing, /<AppText variant="h2" accessibilityRole="header">Not found<\/AppText>/);
  assert.match(missing, /router\.replace\('\/library'\)/, 'a way on to the Bible');
  assert.match(missing, /router\.replace\(bookHref\(book\.code\)\)/, 'and to the chapters of the book when there is one');
});

check('the reader: the title of the chapter, the name of the book, the title of a psalm, Previous and Next at the top and at the end, the words, one handwritten note, the credit and the plain line that it is not read at Mass', () => {
  const src = code(read(`${BIBLE}/Reader.tsx`));
  assert.match(src, /<Screen tabBar=\{false\} scrollRef=\{scroller\} onScroll=\{onScroll\}>/, 'the reader reads the scroll of its screen, to keep a chosen verse above the bar');
  assert.match(src, /<AppText variant="h4" color=\{role\.accentText\} maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\}>\{book\.name\}<\/AppText>/, 'the name of the book is in Fraunces');
  assert.match(src, /<AppText variant="h2" accessibilityRole="header" maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\}>\{chapterTitle\(place\)\}<\/AppText>/, 'the chapter title is the heading of the screen, in Fraunces');
  assert.match(src, /\{!!chapter\.title && <AppText variant="h4" muted /);
  const order = ['<IconButton name="back"', '<ChaptersLink', '{book.name}', '{chapterTitle(place)}', 'chapter.title', '<ChapterNav place={place} variant="top"', '<ReaderText', '<ChapterNav place={place} variant="foot"', '{READER_NOTE}', 'creditLines(TRANSLATION.credit)'].map((needle) => src.indexOf(needle));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `Back, all chapters, book, title, psalm title, Previous/Next, the words, Previous/Next, the note, the credit (${order})`);
  assert.match(src, /<AppText variant="accent" color=\{role\.accentText\}>\{READER_NOTE\}<\/AppText>/, 'one handwritten note');
  assert.equal((src.match(/variant="accent"/g) ?? []).length, 1);
  assert.match(src, /creditLines\(TRANSLATION\.credit\)\.map\(\(line\) => <AppText key=\{line\} variant="caption" muted>\{line\}<\/AppText>\)/);
  assert.match(src, /import \{ hasBook, loadBook, TRANSLATION \} from '\.\/text';/, 'the words and the credit come from the text layer only');
  assert.match(src, /if \(!hasBook\(place\.code\)\) return null;\s+return loadBook\(place\.code\)\.chapters\.find\(\(c\) => c\.c === place\.chapter\) \?\? null;/);
  assert.match(src, /catch \{\s+return null;/, 'a book that cannot be read is no chapter');
  assert.match(src, /if \(!chapter\) return <PlaceMissing message=\{MISSING_CHAPTER\} code=\{place\.code\} \/>;/);
  assert.doesNotMatch(src, /fetch\(|supabase|lib\/net|lib\/api/, 'the words are in the app: nothing here uses the network');
  // the credit is what the licence says, said by the text layer
  assert.match(code(read(`${BIBLE}/credit.ts`)), /export const NOT_AT_MASS = 'This is not the translation read at Mass\.';/);
  // the notes: one per screen (the chapters screen has its own), in the handwriting variant
  assert.match(code(read(`${BIBLE}/credit.ts`)), /export const READER_NOTE = 'Peace on the road';/);
  assert.match(code(read(`${BIBLE}/credit.ts`)), /export const CHAPTERS_NOTE = 'Pick a chapter';/);
});

check('Previous and Next replace the reader (Back still goes to where the person came from) and the way to all the chapters pushes the chapters; the chapter read is remembered; a link to a verse scrolls to it', () => {
  const src = code(read(`${BIBLE}/Reader.tsx`));
  assert.match(src, /const go = \(to: Place\) => router\.replace\(readerHref\(\{ code: to\.code, chapter: to\.chapter \}\)\);/);
  assert.match(src, /<ChaptersLink onPress=\{\(\) => router\.push\(bookHref\(place\.code\)\)\} \/>/);
  assert.match(src, /const goBack = \(\) => \(router\.canGoBack\(\) \? router\.back\(\) : router\.replace\(bookHref\(place\.code\)\)\);/, 'opened by a link there is nothing to go back to: the chapters of the book are');
  assert.match(src, /useEffect\(\(\) => \{ if \(chapter\) remember\(\{ code: place\.code, chapter: place\.chapter \}\); \}, \[chapter, place\.code, place\.chapter, remember\]\);/, 'only a chapter that has words is the one read last');
  assert.match(src, /const linked = useMemo\(\(\) => \(chapter && verse !== null \? labelOfNumber\(chapter, verse\) : null\), \[chapter, verse\]\);/);
  assert.match(src, /const \[selected, setSelected\] = useState<string \| null>\(linked\);/, 'the verse a link names is chosen');
  assert.match(src, /scroller\.current\?\.scrollTo\(\{ y: Math\.max\(0, top\.current \+ box\.y \+ box\.h \* at\.at - SCROLL_MARGIN\), animated: false \}\);/);
  assert.match(src, /const choosing = selectedNow\.current !== label;[^\n]*\s+setSelected\(choosing \? label : null\);/, 'touching the chosen verse again lets it go');
  assert.match(src, /if \(!choosing \|\| pageY === undefined\) return;\s+const down = scrollForBar\(pageY, windowHeight, covered, BODY_LINE\);\s+if \(down > 0\) scroller\.current\?\.scrollTo\(\{ y: scrollY\.current \+ down, animated: true \}\);/, 'a verse touched where the bar is about to be is brought up above it');
  assert.match(src, /const covered = barCovers\(insets\.bottom\);/);
  assert.match(src, /const onScroll = useCallback\(\(e: NativeSyntheticEvent<NativeScrollEvent>\) => \{ scrollY\.current = e\.nativeEvent\.contentOffset\.y; \}, \[\]\);/);
  assert.match(src, /\{selected !== null && <View style=\{\{ height: roomUnder\(insets\.bottom\) \}\} \/>\}/, 'room under the last words while the bar is up: the end of the chapter can be scrolled above it');
  const nav = code(read(`${BIBLE}/ChapterNav.tsx`));
  assert.match(nav, /const spoken = \(side === 'previous' \? previousLabel\(place\) : nextLabel\(place\)\) \?\? \(side === 'previous' \? NO_PREVIOUS : NO_NEXT\);/, 'the name of the button is where it goes');
  assert.match(nav, /accessibilityRole="button"\s+accessibilityLabel=\{spoken\}\s+accessibilityState=\{\{ disabled: !to \}\}\s+disabled=\{!to\}\s+onPress=\{\(\) => \{ if \(to\) onGo\(to\); \}\}/, 'disabled at Genesis 1 and at Revelation 22, still drawn');
  assert.match(nav, /minHeight: 48,/, 'never under 44');
  assert.match(nav, /<Step side="previous" place=\{place\} variant=\{variant\} onGo=\{onGo\} \/>\s+<Step side="next" place=\{place\} variant=\{variant\} onGo=\{onGo\} \/>/);
  assert.match(nav, /flexDirection: 'row', flexWrap: 'wrap', gap: 8/, 'side by side when the names fit, one under the other when they do not');
  assert.match(nav, /<AppText variant="mono"[^>]*>\{placeLabel\(to\)\}<\/AppText>/, 'the chapter named is a reference: JetBrains Mono');
  assert.match(nav, /import \{ nextLabel, nextPlace, placeLabel, previousLabel, previousPlace, type Place \} from '\.\/order';/, 'the order is the one of order.ts: across the books and the three parts');
});

check('the words of the reader: prose is paragraphs and poetry is stanzas, each ONE text for a screen reader; headings are headings in Fraunces; a verse is a link to touch; its number is raised JetBrains Mono; a chosen verse is a gold ground and an underline; only the blocks that need it are drawn again', () => {
  const src = code(read(`${BIBLE}/ReaderText.tsx`));
  assert.match(src, /export const READER_MAX_FONT_SCALE = 1\.6;/);
  assert.match(src, /export const BODY_SIZE = 19;\s+export const BODY_LINE = 32;/);
  assert.match(src, /<AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\} style=\{\{ fontSize: 22, lineHeight: 28 \}\}>\{block\.text\}<\/AppText>/);
  assert.match(src, /<Text accessibilityRole="link" onPress=\{\(e\) => onSelect\(verse, e\.nativeEvent\.pageY\)\} style=\{on \? chosen\(\) : undefined\}>/, 'a touch says which verse and how far down the screen it was');
  assert.match(src, /const chosen = \(\) => \(\{ backgroundColor: c\.goldSoft, textDecorationLine: 'underline' as const \}\);/, 'not the colour alone: an underline too');
  assert.match(src, /<AppText variant="mono" maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\} color=\{on \? role\.text : role\.muted\} style=\{\{ fontSize: NUMBER_SIZE, lineHeight: BODY_LINE, letterSpacing: NUMBER_TRACKING \}\}>\{superscript\(label\)\}<\/AppText>/);
  assert.match(src, /export const NUMBER_TRACKING = -3;/, 'the raised digits of a number of two or three figures are drawn close together: JetBrains Mono is monospaced');
  assert.match(src, /export const NUMBER_SIZE = 17;/);
  assert.match(src, /const BlockView = memo\(function BlockView/);
  assert.match(src, /const holding = useMemo\(\(\) => new Set\(selected \? blocksOfVerse\(blocks, selected\) : \[\]\), \[blocks, selected\]\);/);
  assert.match(src, /selected=\{holding\.has\(i\) \? selected : null\}/, 'a block that does not hold the chosen verse gets nothing new and is not drawn again');
  assert.match(src, /export const INDENT = '\\u2003';/, 'an em space of Inter for each tab');
  assert.match(src, /\{INDENT\.repeat\(l\.indent\)\}/);
  assert.match(src, /\{l\.parts\.map\(\(p, j\) => \(\s*<Text key=\{j\}>\s*\{j > 0 \? ' ' : ''\}\s*<Words verse=\{p\.verse\} number=\{p\.n\} text=\{p\.text\} on=\{p\.verse === selected\} onSelect=\{onSelect\} \/>\s*<\/Text>\s*\)\)\}/, 'a line that two verses share has a text for each verse, a space between them, and a touch chooses its own verse');
  assert.match(src, /\{k < lines\.length - 1 \? '\\n' : ''\}/, 'a stanza is one text, a line after the other');
  assert.match(src, /const lines = useMemo\(\(\) => wrapPoem\(block\.lines, \{ width: width - 2 \* SIDE, size: BODY_SIZE, scale, numberSize: NUMBER_SIZE, numberOf: superscript \}\), \[block, width, scale\]\);/, 'a long line is cut by the reader, to the width of the page, and the rest hangs');
  assert.match(src, /const scale = Math\.min\(fontScale, READER_MAX_FONT_SCALE\);/, 'at the text size the phone has, held to what the text is held to');
  assert.match(src, /const \{ width, fontScale \} = useWindowDimensions\(\);/);
  assert.equal((src.match(/<AppText maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\} style=\{\{ fontSize: BODY_SIZE, lineHeight: BODY_LINE \}\}>/g) ?? []).length, 2, 'one text for a paragraph and one for a stanza, Inter');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|fontFamily|variant="accent"/, 'colours are roles and the gold wash; the fonts are variants; the handwriting is not in the words');
  assert.match(src, /import \{ c, role \} from '@\/theme';/);
});

check('the actions on a verse: one at a time, Bookmark (under the place of the verse), Copy (only when the phone has the clipboard module: it is asked for first), Share (React Native\'s own); all at least 88 wide and 68 high with a glyph of 30 and a word of 16 (Inter SemiBold); the chosen verse is announced', () => {
  const src = code(read(`${BIBLE}/VerseActions.tsx`));
  assert.match(src, /const canCopy = hasNativeModule\(NativeName\.clipboard\);/, 'asked before the button is drawn');
  assert.match(src, /\{canCopy && \(\s+<ActionButton\s+icon="copy"/, 'without the module there is no Copy button');
  assert.match(src, /import \{ copyText \} from '@\/lib\/clipboard';/, 'the copy itself goes through the guard of lib/clipboard.ts');
  assert.match(src, /import \{ NativeName, hasNativeModule \} from '@\/lib\/optionalNative';/);
  assert.doesNotMatch(src, /require\(|expo-clipboard/, 'the module is never required here');
  assert.match(src, /void copyText\(text\)\.then\(\(ok\) => \{ if \(ok\) setCopied\(true\); \}\);/);
  assert.match(src, /void Share\.share\(\{ message: text \}\)\.catch\(\(\) => \{\}\);/);
  assert.match(src, /const text = verseShareText\(place, words\);/, 'the verse, where it is and "(World English Bible)"');
  assert.match(src, /spoken=\{bookmarkLabel\(bookmarked, place\)\}/, 'the words of the button are those of every bookmark button');
  assert.match(src, /disabled=\{!canBookmark\}/, 'a tap before the list of bookmarks was read is not taken');
  assert.match(src, /AccessibilityInfo\.announceForAccessibility\?\.\(chosenAnnouncement\(place\)\);/, 'the verse that was chosen is said');
  assert.match(src, /accessibilityLiveRegion="polite" accessibilityLabel=\{`\$\{place\} selected`\}/);
  assert.match(src, /accessibilityRole="toolbar"/);
  assert.match(src, /flex: 1, minWidth: ACTION_MIN_WIDTH, minHeight: ACTION_MIN_HEIGHT, alignItems: 'center'/, 'at least 88 wide and 68 high');
  assert.match(src, /<Icon name=\{icon\} color=\{role\.action\} size=\{ACTION_ICON\} filled=\{filled\} \/>/, 'the glyph is 30');
  assert.match(src, /<AppText variant="label" maxFontSizeMultiplier=\{1\.3\} numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.77\} style=\{\{ fontSize: ACTION_LABEL, lineHeight: ACTION_LABEL_LINE \}\}>\{label\}<\/AppText>/, 'the word is Inter SemiBold 16, and never under 16 at the largest text size the screen allows (16 x 1.3 x 0.77)');
  assert.match(src, /label="Bookmark" spoken=\{bookmarkLabel\(bookmarked, place\)\}/, 'the word does not change with the state: "Bookmarked" would not fit 88 at 16; the glyph is filled and a screen reader says "Remove bookmark"');
  assert.match(src, /backgroundColor: pressed \|\| filled \? role\.sunken : 'transparent'/, 'a bookmarked verse has its button tinted');
  assert.match(src, /style=\{\{ flex: 1, fontSize: PLACE_SIZE, lineHeight: PLACE_LINE \}\}>\{place\}/, 'the reference is 17');
  assert.match(src, /<AppText variant="mono"[^>]*color=\{role\.accentText\}[^>]*>\{place\}<\/AppText>/, 'the place of the verse is a reference: JetBrains Mono');
  assert.match(src, /accessibilityLabel="Close the verse actions"/);
  assert.match(src, /left: BAR_SIDE, right: BAR_SIDE, bottom: insets\.bottom \+ BAR_BOTTOM/, 'above the safe area');
  assert.match(src, /borderRadius: radius\.lg, backgroundColor: role\.surface, borderWidth: 1, borderColor: role\.border, \.\.\.shadowStyle\('lg'\)/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]|fontFamily/);
  // the reader gives it the verse, its place in words, whether it is bookmarked, and the key the bookmark is kept under
  const reader = code(read(`${BIBLE}/Reader.tsx`));
  assert.match(reader, /const key = ref \? verseKey\(ref\) : null;/);
  assert.match(reader, /bookmarked=\{marks\.has\(key\)\}\s+canBookmark=\{marks\.ready\}\s+onBookmark=\{\(\) => marks\.toggle\(key\)\}/);
  assert.match(reader, /place=\{refLabel\(ref\)\}\s+words=\{verseText\(chosen\)\}/);
});

check('the card that continues the chapter read last is kept only on the phone under a per-person key, shows only a place that exists, and opens that chapter', () => {
  const hook = code(read(`${BIBLE}/useLastRead.ts`));
  assert.match(hook, /const key = uid \? userKey\(uid, LAST_READ_NAME\) : null;/);
  assert.match(hook, /localStore\.getJSON<unknown>\(key\)/);
  assert.match(hook, /const p = parseLastRead\(raw\);/, 'a value that does not read, or names a chapter that is gone, is no place');
  assert.match(hook, /localStore\.setJSON\(key, packLastRead\(p, Date\.now\(\)\)\)/);
  assert.match(hook, /if \(!key \|\| !isPlace\(p\) \|\| samePlace\(latest\.current, p\)\) return;/, 'only a chapter of the Bible is kept');
  assert.match(hook, /useFocusEffect\(/, 'read again whenever the screen comes into view, because the reader changes it');
  assert.doesNotMatch(hook, /supabase|lib\/api|lib\/net|fetch\(/, 'the place never leaves the phone');
  assert.match(read(`${BIBLE}/lastRead.ts`), /export const LAST_READ_NAME = 'library\.lastRead';/);
  const card = code(read(`${BIBLE}/ContinueCard.tsx`));
  assert.match(card, /accessibilityRole="button"\s+accessibilityLabel=\{continueLabel\(place\)\}/);
  assert.match(card, /minHeight: 64/);
  assert.match(card, /<AppText variant="mono"[^>]*>\{placeLabel\(place\)\}<\/AppText>/, 'the chapter is a reference: JetBrains Mono');
  assert.match(card, /<AppText variant="label" muted[^>]*>\{CONTINUE_TITLE\}<\/AppText>/);
  assert.match(card, /backgroundColor: pressed \? role\.sunken : role\.surface, borderWidth: 1, borderColor: role\.border/);
  assert.doesNotMatch(card, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]|fontFamily/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'logging out wipes it with every u.<userId>. key');
});

check('the search of verses never stands between a keystroke and the screen: it runs from an effect after the typing has paused, from a timer of its own, says "Searching…" when it is likely to take a moment, and is cut at 100', () => {
  const hook = code(read(`${BIBLE}/useVerseSearch.ts`));
  assert.match(hook, /export const VERSE_SEARCH_DEBOUNCE_MS = 250;/);
  assert.match(hook, /const wanted = verseQuery\(query\);/);
  assert.match(hook, /useEffect\(\(\) => \{\s+if \(!wanted\) \{ setFound\(null\); setSearching\(false\); return; \}/, 'a query that is too short is not searched');
  assert.match(hook, /const wait = setTimeout\(\(\) => \{\s+const say = announcesSearch\(lastTook\);\s+if \(say\) setSearching\(true\);\s+run = setTimeout\(\(\) => \{/, 'the state says "searching" a beat before the thread is busy');
  assert.match(hook, /try \{ hits = searchVerses\(wanted, VERSE_RESULTS_MAX\); \} catch \{ hits = \[\]; \}/, 'the text layer is asked, and a failure is no verses');
  assert.match(hook, /\}, say \? 50 : 0\);\s+\}, VERSE_SEARCH_DEBOUNCE_MS\);/);
  assert.match(hook, /return \(\) => \{ alive = false; clearTimeout\(wait\); if \(run\) clearTimeout\(run\); \};/, 'a search that was overtaken is dropped');
  assert.match(hook, /import \{ searchVerses \} from '\.\/searchText';/);
  assert.doesNotMatch(hook, /setInterval|fetch\(|supabase/);
  const results = code(read('src/features/library/SearchResults.tsx'));
  assert.match(results, /const verses = useVerseSearch\(query\);/);
  assert.match(results, /const goTo = useMemo\(\(\) => parseRef\(query\), \[query\]\);/);
  assert.doesNotMatch(results, /SampleNotice|SEARCH_NOTICE|hasBookText/, 'no notice about books: every book that is found is in the app');
  assert.match(results, /accessibilityLabel=\{`Go to \$\{refLabel\(goTo\)\}`\}\s+onPress=\{\(\) => onOpenVerse\(goTo\)\}/);
  assert.match(results, /\{verses\.state === 'searching' && <AppText variant="caption" muted>\{SEARCHING\}<\/AppText>\}/);
  assert.match(results, /export const SEARCHING = 'Searching…';/);
  assert.match(results, /onOpenBook=\{onOpenBook\} onOpenVerse=\{onOpenVerse\} versesCapped=\{verses\.capped\}/);
  assert.match(code(read('src/features/library/bible/verseRows.ts')), /export const VERSE_RESULTS_MAX = 100;/);
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /const openBook = \(code: string\) => router\.push\(bookHref\(code\)\);\s+const openVerse = \(ref: Ref\) => router\.push\(readerHref\(ref\)\);/, 'a book of the results opens its chapters, a verse opens the reader at it');
  assert.equal((screen.match(/<SearchResults\b[^]*?onOpenBook=\{openBook\} onOpenVerse=\{openVerse\} \/>/g) ?? []).length, 1, 'the results are drawn once, in the screen\'s own scroll (the Library has no second host: Notes is on Me), and open these places');
  assert.equal((screen.match(/<SearchResults\b/g) ?? []).length, 1);
  // the verse rows: ONE button for the row and the bookmark beside it, the place in JetBrains Mono, the words in Inter, the match marked by a ground and an underline
  const rows = code(read(`${BIBLE}/VerseRows.tsx`));
  assert.match(rows, /accessibilityRole="button" accessibilityLabel=\{verseRowLabel\(row\)\} accessibilityHint="Opens the chapter at this verse" onPress=\{\(\) => onOpen\(row\.ref\)\}/);
  assert.match(rows, /<\/Pressable>\s+\{marks && <BookmarkToggle on=\{marks\.has\(key\)\} title=\{row\.label\} toggle=\{\(\) => marks\.toggle\(key\)\} \/>\}/);
  assert.match(rows, /const key = verseKey\(row\.ref\);/);
  assert.match(rows, /<AppText variant="mono" color=\{role\.accentText\} style=\{\{ fontSize: 14, lineHeight: 20 \}\}>\{row\.label\}<\/AppText>/);
  assert.match(rows, /backgroundColor: c\.goldSoft, textDecorationLine: 'underline'/);
  assert.match(rows, /numberOfLines=\{ROW_TEXT_LINES\}/);
  assert.match(rows, /excerpt\(row\.text, row\.marks\)/, 'a long verse is cut around the match');
  assert.doesNotMatch(rows, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|fontFamily/);
});

check('the text of the Bible is imported only by the screens that read it and by the search (the files are bundled as JavaScript: 7.5 MB in the Hermes bundle; a screen that only needs counts uses books.ts), and the search is made ready when its field is touched', () => {
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__' || e.name === 'node_modules') return [];
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : /\.tsx?$/.test(e.name) ? [rel] : [];
  });
  const files = [...walk('app'), ...walk('src')];
  const resolve = (file: string, spec: string): string | null => (spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : null);
  const importers = (target: string): string[] => files.filter((f) => [...read(f).matchAll(/from '([^']+)'/g)].some((m) => resolve(f, m[1]) === target)).sort();
  assert.deepEqual(importers(`${BIBLE}/text`), [`${BIBLE}/Reader.tsx`, `${BIBLE}/searchText.ts`, 'app/library/bookmarks.tsx'].sort(), 'the reader, the search and Bookmarks (which shows the words of a verse) read the text; nothing else does: not the Licences screen, not the tiles, not the Continue card');
  assert.deepEqual(importers(`${BIBLE}/searchText`), [`${BIBLE}/useVerseSearch.ts`, 'app/(tabs)/library.tsx'].sort(), 'the search of verses, and the Library screen that makes it ready');
  assert.deepEqual(importers(`${BIBLE}/webc.generated`), [`${BIBLE}/text.ts`], 'the files of the text are reached through text.ts only');
  // the search is made ready when its field is touched, a beat before the first letter (the first search reads and folds the words of 35,408 verses: 100 to 135 ms on a laptop)
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /import \{ prepareSearch \} from '@\/features\/library\/bible\/searchText';/);
  assert.match(screen, /<LibraryHeader [^]*? onSearchFocus=\{prepareSearch\} \/>/);
  assert.match(code(read('src/features/library/LibraryHeader.tsx')), /<SearchBar value=\{query\} onChangeText=\{onQuery\} onFocus=\{onSearchFocus\} \/>/);
  assert.match(code(read('src/features/library/SearchBar.tsx')), /onFocus=\{\(\) => \{ setFocus\(true\); onFocus\?\.\(\); \}\}/);
});

check('the Bible side draws no colour of its own and no font of its own: every colour is a theme role (or the gold wash of a marked verse), every font a variant of AppText', () => {
  const files = fs.readdirSync(path.join(root, BIBLE)).filter((f) => /\.tsx$/.test(f)).map((f) => `${BIBLE}/${f}`).concat([CHAPTERS, CHAPTER]);
  const offenders: string[] = [];
  for (const f of files) {
    code(read(f)).split('\n').forEach((line, i) => {
      if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|\bfixed\./.test(line)) offenders.push(`${f}:${i + 1}  a literal colour  ${line.trim().slice(0, 90)}`);
      if (/fontFamily|fonts\./.test(line)) offenders.push(`${f}:${i + 1}  a font of its own  ${line.trim().slice(0, 90)}`);
      if (/StyleSheet\.create/.test(line)) offenders.push(`${f}:${i + 1}  StyleSheet.create`);
    });
  }
  assert.deepEqual(offenders, []);
});

console.log(`${n} of ${n} passed (Bible screens)`);
