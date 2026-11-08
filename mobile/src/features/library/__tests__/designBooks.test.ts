// The Books phones of design/index.html are what the books make of them. designBooks.ts draws them from the bundle (the covers, the shelves, the banner, the page of a book with
// the notice of its kind, the reader with a list and a quotation, the rows of a search and of Bookmarks) with the functions of the app, and this test draws them again on every run:
// when the books, a cover, a notice or a screen changes and the page was not drawn again, it fails and says how (the command is at the top of designBooks.ts). The other checks
// say what the page must show whatever the books are: the rules, not the numbers (the numbers come from the bundle).
// Run: npm run test:library (library.test.ts runs this file too).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOOK_CATALOG } from '../books/catalog';
import { BOOKS_BANNER_TITLE, CONTINUE_CTA, START_CTA, kindMark, kindName, shelves } from '../books/copy';
import { coverGrid, coverLabel, coverText } from '../books/cover';
import { GUIDE_NOTICE, READINGS_NOTICE, noticeFor } from '../books/notices';
import { noteStart, passageLabel } from '../books/passages';
import { formatMinutes, nextLabel, previousLabel, chapterNav } from '../books/reading';
import { READER_SIZES } from '../books/readerType';
import { BOOKMARKS_KEPT } from '../sample';
import { applyRegions, DESIGN_PATH, keptPassageRow, regions, SEARCH_BIBLE, SEARCH_BOOKS, SHOWN, searchCountLine } from './designBooks';
import { searchLibrary } from '../search';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const design = fs.readFileSync(DESIGN_PATH, 'utf8');
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The phone with this label, as the text between its label and the label of the next phone. */
const phoneOf = (label: string): string => {
  const start = design.indexOf(`<p class="phone-label"><b>${label}</b>`);
  assert.ok(start > 0, `the design page has no phone "${label}"`);
  const next = design.indexOf('<p class="phone-label">', start + 10);
  return design.slice(start, next > 0 ? next : undefined);
};
const guides = BOOK_CATALOG.filter((b) => b.kind === 'guide');
const readingsBooks = BOOK_CATALOG.filter((b) => b.kind === 'reflection');
const on = shelves(BOOK_CATALOG);

check('the Books phones of the design page are what the books make of them: drawn again from the bundle with the functions of the app, they change nothing', () => {
  assert.ok(applyRegions(design, regions()) === design, 'design/index.html is not what mobile/assets/library makes of it: draw it again (the command is at the top of designBooks.ts), and look at what changed');
  // and every mark is there, once
  for (const word of ['Library · Books phone', 'Search: count', 'Search: books', 'Search: books phone', 'Bookmarks: kept', 'Bookmarks: books', 'Bookmarks: passages', 'Library · Books and the reader']) {
    assert.equal(count(design, new RegExp(`<!-- ${word} \\(start\\) -->`, 'g')), 1, `${word}: its start mark`);
    assert.equal(count(design, new RegExp(`<!-- ${word} \\(end\\) -->`, 'g')), 1, `${word}: its end mark`);
  }
});

check('the Books tab on the page: the strip with Books on, the compact banner with the words of the tab, one shelf for each kind with its heading and the count of its books, and no mark of free, soon or preview', () => {
  const books = phoneOf('Library · Books');
  assert.match(books, /<div class="cp-subtabs"[^>]*><span>Bible<\/span><span class="on">Books<\/span><\/div>/, 'two tabs, Books on');
  const banner = books.slice(books.indexOf('class="cp-banner cmp"'), books.indexOf('class="bk-shelf"'));
  assert.match(banner, new RegExp(`^class="cp-banner cmp" role="button" aria-label="${START_CTA}\\. ${BOOKS_BANNER_TITLE}\\. ${esc(BOOK_CATALOG[0].title)}"><div class="ey">${esc(BOOK_CATALOG[0].title)}</div><h4>${BOOKS_BANNER_TITLE}</h4><div class="row"><span class="hw">[^<]+</span><span class="pill">${START_CTA}</span></div></div>`));
  assert.doesNotMatch(banner, /<button|cp-btn/, 'the banner is one button for a screen reader: the pill is only its look');
  assert.equal(count(books, /class="bk-shelf"/g), 1, 'the first shelf: the phone is cut short there, and the second shelf has its own phone');
  assert.match(books, new RegExp(`<div class="hd"><h4>${esc(on[0].title)}</h4><span class="ct">${on[0].books.length} books</span></div>\\s*<p class="ln">${esc(on[0].line)}</p>`), 'the heading, the count and the quiet line of the first shelf');
  const second = phoneOf('Books · second shelf');
  assert.match(second, new RegExp(`<div class="hd"><h4>${esc(on[1].title)}</h4><span class="ct">${on[1].books.length} books</span></div>\\s*<p class="ln">${esc(on[1].line)}</p>`), 'the second shelf, with its heading and its count');
  assert.equal(count(books, /class="bk-cover"/g), on[0].books.length, 'a cover for every book of the first shelf');
  assert.equal(count(second, /class="bk-cover"/g), on[1].books.length, 'a cover for every book of the second shelf');
  assert.equal(on[0].books.length + on[1].books.length, BOOK_CATALOG.length, 'two shelves hold every book of the bundle');
  for (const phone of [books, second, phoneOf('Books · dark'), phoneOf('Books · 320 wide')]) {
    assert.doesNotMatch(phone, /lib-chip|lib-book\b|lib-notice|\bFREE\b|\bSOON\b|Free to read|Coming soon|Preview|Soon</, 'no chip, no notice, no mark of free or soon: every book is in the app');
    assert.doesNotMatch(phone, /gutenberg|ccel\.org|licen[cs]e|translator|public domain|route_slug/i, 'what is only data is not on the page');
    assert.doesNotMatch(phone, /lib-seg|role="radiogroup"|fab-slot|cp-fab-write/, 'Books has neither the choices of the Bible nor a gold pen');
  }
});

check('a cover on the page is a cover of the app: each book once, ONE button named "title, kind, time" with its own ribbon beside it (not inside), the time under the title and no kind line, in the sizes of cover.ts', () => {
  const shelvesText = `${phoneOf('Library · Books')}${phoneOf('Books · second shelf')}`;
  const g = coverGrid(390, 16);
  for (const b of BOOK_CATALOG) {
    const label = `aria-label="${esc(coverLabel(b))}"`;
    assert.equal(count(shelvesText, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), 1, `${b.id}: its cover is on the page once`);
    const t = coverText(b, g.tile);
    assert.ok(shelvesText.includes(`<span class="bk-time" style="font-size:${t.m.time.size}px;line-height:${t.m.time.lineHeight}px">${esc(formatMinutes(b.minutes))}</span>`), `${b.id}: the time under the title, the mono token (15 on 22)`);
    assert.ok(shelvesText.includes(t.title.lines.map(esc).join('<br>')), `${b.id}: the title broken where cover.ts measured it`);
    assert.ok(shelvesText.includes(`aria-label="Bookmark: ${esc(b.title)}"`) || shelvesText.includes(`aria-label="Remove bookmark: ${esc(b.title)}"`), `${b.id}: the ribbon`);
  }
  assert.equal(count(shelvesText, /class="bk-cover"/g), BOOK_CATALOG.length);
  assert.doesNotMatch(shelvesText, /bk-kind|PILGRIM'S GUIDE|READINGS FOR THE WAY/, 'no cover has the kind of book printed on it (the book page has it, and the label of the cover says it)');
  assert.equal(count(shelvesText, /<\/div><button class="bk-ribbon/g), BOOK_CATALOG.length, 'the ribbon is next to the button of the cover, not inside it');
  assert.equal(count(shelvesText, /width:44px;height:44px"><span class="rb"/g), BOOK_CATALOG.length, 'every ribbon is a 44 by 44 button');
  assert.match(shelvesText, new RegExp(`width:${g.tile}px;height:${g.height}px`), `a cover is ${g.tile} by ${g.height} on a 390 phone`);
  assert.match(phoneOf('Books · 320 wide'), new RegExp(`width:${coverGrid(320, 16).tile}px;height:${coverGrid(320, 16).height}px`), 'and as cover.ts says on a phone of 320');
  assert.match(phoneOf('Books · 320 wide'), /<div class="phone" style="width:320px">/);
  const dark = phoneOf('Books · dark');
  assert.match(dark, /<div class="phone dk">/);
  // once something was read the bar above the tab bar says so: it names a book of the catalog and the chapter, in the app's own words (spot.ts), and has a close button of its own
  const bar = /<div class="cont-bar">\s*<div class="main" role="button" aria-label="Continue reading, ([^"]+), Chapter (\d+)"><svg class="cp-icon ic"><use href="#i-library"\/><\/svg><div class="t"><div class="k">Continue reading<\/div><div class="r"><span class="h">([^<]+)<\/span><span class="c">· Chapter (\d+)<\/span><\/div><\/div><\/div>\s*<button class="x" aria-label="Hide Continue reading"><svg class="cp-icon"><use href="#i-x"\/><\/svg><\/button>\s*<\/div>/.exec(dark);
  assert.ok(bar, 'Books · dark: the bar above the tab bar');
  assert.equal(bar[1], bar[3], 'what a screen reader says names the book the bar draws');
  assert.equal(bar[2], bar[4], 'and its chapter');
  const barBook = BOOK_CATALOG.find((b) => esc(b.title) === bar[1]);
  assert.ok(barBook, 'the bar names a book of the catalog, by the title its cover has');
  assert.ok(dark.includes(`aria-label="${esc(coverLabel(barBook))}"`) || BOOK_CATALOG.indexOf(barBook) >= 6, 'the cover of that book is in the same phone when the phone is long enough to show it');
  assert.ok(dark.indexOf('class="cont-bar"') < dark.indexOf('class="scroll"'), 'the bar floats: it is not inside the scroll');
  assert.match(dark, /<div class="scroll" style="padding-bottom:202px">/, 'the list keeps the bar\'s room at its end: 130 for the tab bar and 72 for the bar');
  assert.equal(count(dark, /class="cont-bar"/g), 1, 'one bar');
  assert.equal(count(dark, /class="hw"/g), 1, 'the bar adds no handwriting: the banner has the one note');
  assert.doesNotMatch(dark, new RegExp(`aria-label="${CONTINUE_CTA}\\. |Onward!`), 'the banner of the Books tab does not continue a book any more');
  assert.match(dark, new RegExp(`aria-label="${START_CTA}\\. ${BOOKS_BANNER_TITLE}\\. ${esc(BOOK_CATALOG[0].title)}"`), 'it starts the first book');
  // a phone with nothing read has no bar: the bar is there only for a place to go back to
  for (const label of ['Library · Books', 'Books · second shelf', 'Books · 320 wide']) assert.doesNotMatch(phoneOf(label), /cont-bar|Continue reading/, `${label}: nothing read, no bar`);
});

check('the page of a book on the page: the notice of its kind above the gold button (the words of notices.ts, nothing else), the kind, the facts, the description, the contents with the minutes of every chapter, the credit', () => {
  const guide = phoneOf('Book page · guide');
  const readings = phoneOf('Book page · readings');
  assert.ok(guide.includes(`<p>${esc(GUIDE_NOTICE)}</p>`) && readings.includes(`<p>${esc(READINGS_NOTICE)}</p>`), 'each kind has its notice');
  assert.equal(noticeFor(guides[0].kind), GUIDE_NOTICE);
  assert.equal(noticeFor(readingsBooks[0].kind), READINGS_NOTICE);
  assert.doesNotMatch(guide, new RegExp(esc(READINGS_NOTICE).slice(0, 40)), 'a guide does not carry the notice of readings');
  assert.doesNotMatch(readings, new RegExp(esc(GUIDE_NOTICE).slice(0, 40)), 'a book of readings does not carry the notice of guides');
  for (const page of [guide, readings, phoneOf('Book page · Continue'), phoneOf('Book page · 320 wide')]) {
    assert.ok(page.indexOf('class="bk-notice"') > 0 && page.indexOf('class="bk-notice"') < page.indexOf('class="bk-cta"'), 'the notice is read before the button');
    assert.ok(page.indexOf('class="blurb"') < page.indexOf('class="bk-notice"'), 'the description, then the notice');
    assert.doesNotMatch(page, /lib-chip|Soon|SOON|FREE|Preview|Not in the app yet/, 'no chip, no mark, no book without text');
  }
  for (const [page, book] of [[guide, SHOWN.guide], [readings, SHOWN.readings]] as const) {
    const entry = BOOK_CATALOG.find((b) => b.id === book.id)!;
    assert.ok(page.includes(`<span class="kind" aria-label="${esc(kindName(entry.kind))}">${esc(kindName(entry.kind).toUpperCase())}</span>`), 'the kind under the title');
    assert.equal(count(page, /class="bk-row[ "]/g), book.chapters.length, 'a row for every chapter');
    for (const c of entry.chapters) assert.ok(page.includes(`<span class="mn">${esc(formatMinutes(c.minutes))}</span>`), `${c.id}: the minutes of the chapter`);
    assert.ok(page.includes(esc(book.credit)), 'the credit of the book');
    assert.ok(page.includes(`<h3>${esc(book.title)}</h3>`) && page.includes(`<div class="su">${esc(book.subtitle)}</div>`), 'the title and the subtitle');
  }
  const again = phoneOf('Book page · Continue');
  assert.match(again, /<div class="phone dk">/);
  assert.match(again, /class="here">LAST READ</, 'where you stopped is marked');
  assert.equal(count(again, /<svg class="cp-icon" style="color:var\(--cp-success\)/g), 2, 'the two chapters read are ticked');
  assert.match(again, /<div class="btn" role="button" aria-label="Continue: /, 'the button goes on where you stopped');
  assert.match(again, /<div class="cap">Chapter 3 of \d+<\/div>/, 'and says where that is');
});

check('the reader on the page: a list with its bullets and a quotation with its rule and its line of whose words they are, laid out as the app lays them out; the bar at the bottom names Previous and Next; the end of a chapter; the text sizes; a passage chosen and bookmarked', () => {
  const list = phoneOf('Reader · a list');
  const quote = phoneOf('Reader · a quotation');
  assert.match(list, /<div class="rl" style="[^"]*">(?:<div style="display:flex"><span style="[^"]*">(?:•|\d+\.)<\/span>)/, 'a list: the bullet or the number hangs in a column of its own');
  assert.match(quote, /<div class="rq" style="[^"]*border-left:2px solid var\(--cp-border-strong\)/, 'a quotation: a rule at its left');
  assert.match(quote, /<div class="rq"[^]*?color:var\(--cp-text-muted\)">/, 'and, under it, the muted line that says whose words they are');
  for (const [phone, text] of [[list, SHOWN.guide], [quote, SHOWN.readings]] as const) {
    assert.match(phone, /<div class="bk-rhead">/);
    assert.ok(phone.includes(`<span class="bt">${esc(text.title)}</span>`), 'the title of the book in the bar at the bottom');
    assert.match(phone, /<span class="ps">Chapter \d+ of \d+<\/span>/);
    assert.equal(count(phone, /class="bk-ic/g), 2, 'Previous and Next');
    assert.equal(count(phone, /class="hw"/g), 0, 'no handwriting in the middle of a chapter: the note is at its end');
  }
  const chapterOf = (text: typeof SHOWN.guide, index: number) => chapterNav(text.chapters, index)!;
  assert.ok(list.includes(`aria-label="${esc(nextLabel(chapterOf(SHOWN.guide, SHOWN.list.index)))}"`) && list.includes(`aria-label="${esc(previousLabel(chapterOf(SHOWN.guide, SHOWN.list.index)))}"`), 'Previous and Next named by where they go');
  assert.match(phoneOf('Reader · dark'), /<div class="phone dk">/);
  assert.match(phoneOf('Reader · 320 wide'), /<div class="phone" style="width:320px">/);
  assert.match(phoneOf('Reader · large text'), new RegExp(`font-size:${READER_SIZES[READER_SIZES.length - 1]}px;line-height:`), 'the largest of five steps');
  const end = phoneOf('Reader · end of a chapter');
  assert.match(end, /<div class="scroll bk-rscroll" data-bk-end>/, 'scrolled to the end');
  assert.match(end, /<div class="step next" role="button" aria-label="Next: /);
  assert.match(end, /<div class="step" role="button" aria-label="Previous: /);
  assert.equal(count(end, /class="hw"/g), 1, 'one handwritten note');
  const chosen = phoneOf('Reader · passage chosen');
  const chapter = SHOWN.readings.chapters[SHOWN.quote.index];
  const label = passageLabel(chapter, SHOWN.quote.block);
  assert.match(chosen, /<span class="on">/, 'the passage has the gold ground and the underline of a verse');
  assert.ok(chosen.includes(`aria-label="Actions for ${esc(label)}"`) && chosen.includes(`<span class="pl">${esc(label)}</span>`), 'the bar of actions says which passage it is');
  assert.match(chosen, /<div class="rd-act dock four" role="toolbar"/, 'four actions share the bar');
  assert.match(chosen, /<button aria-label="Bookmark: [^"]+">[^]*?<span>Bookmark<\/span><\/button><button aria-label="Write a note: [^"]+">[^]*?<span>Note<\/span><\/button><button aria-label="Copy: [^"]+">[^]*?<span>Copy<\/span><\/button><button aria-label="Share: [^"]+">[^]*?<span>Share<\/span>/, 'Bookmark, Note, Copy, Share, in the order of the bar of the app');
  assert.match(phoneOf('Reader · passage bookmarked'), /<button class="on" aria-label="Remove bookmark: [^"]+">[^]*?<span>Bookmark<\/span>/, 'the word stays, the glyph is filled and the button tinted');
  // the page of the diary that Note opens starts with the passage as a quotation, whose words and where, and an empty line (passages.ts noteStart), made from the real text
  const start = noteStart(SHOWN.readings.title, chapter, SHOWN.quote.block)!;
  const diary = phoneOf('Diary · note about a passage');
  assert.ok(start.startsWith('> ') && start.endsWith('\n\n') && start.includes(`> — ${SHOWN.readings.title}, ${label}`), 'the start of a note about a passage');
  assert.ok(diary.includes(esc(start).replace(/\n/g, '&#10;')), 'the diary page of the design is the one the app opens, with the quotation in the marks of the diary (the line breaks are written as entities, so that nothing indents them)');
  assert.match(diary, /<div class="dy-bar">/, 'with the bar of the diary under it');
});

check('the rows of a search and of Bookmarks on the page: a small cover, the title, the subtitle, the description, the kind and the time, the bookmark beside the button of the row; no chip; the counts are the app\'s own', () => {
  const search = phoneOf('Library · Search');
  const found = searchLibrary(SEARCH_BOOKS);
  const second = phoneOf('Library · Search, books');
  assert.ok(search.includes(`<p class="lib-count" style="margin:16px 0 0">${esc(searchCountLine(SEARCH_BIBLE))}</p>`), 'the count of the first search');
  assert.equal(searchLibrary(SEARCH_BIBLE).hits.Books.length, 0, 'the word of the first Search phone finds no book of the Library: there is no group of books in it');
  assert.doesNotMatch(search, /class="lib-label"[^>]*>Books · /, 'so the phone has none');
  assert.ok(second.includes(`<p class="lib-count" style="margin:16px 0 0">${esc(searchCountLine(SEARCH_BOOKS))}</p>`), 'the count of the second');
  assert.match(second, new RegExp(`class="lib-label"[^>]*>Books · ${found.hits.Books.length}</div>`), 'the group of books counts all it found');
  assert.equal(count(second, /class="bk-brow"/g), 3, 'the first rows of the group (the phone is cut short)');
  for (const b of found.hits.Books.slice(0, 3)) {
    assert.ok(second.includes(`aria-label="${esc(coverLabel(b))}"`), `${b.id}: the row is one button named like the cover`);
    assert.ok(second.includes(`<span class="t">${esc(b.title)}</span><span class="a">${esc(b.subtitle)}</span><span class="b">${esc(b.description)}</span>`), `${b.id}: title, subtitle, description`);
    assert.ok(second.includes(`<span class="k" aria-label="${esc(kindName(b.kind))}">${esc(kindMark(b.kind))}</span><span class="mn">${esc(formatMinutes(b.minutes))}</span>`), `${b.id}: the kind and the time`);
  }
  const marks = phoneOf('Library · Bookmarks');
  assert.ok(marks.includes(`<p class="bk-cap" style="margin:0">${esc(BOOKMARKS_KEPT)}</p>`), 'where the bookmarks are kept, said once');
  assert.match(marks, /class="lib-label">Books · 1<\/div>\s*<div class="cp-card" style="padding:4px">\s*<div class="bk-brow">/);
  assert.match(marks, /<button class="lib-mark on" aria-label="Remove bookmark: [^"]+"><svg class="cp-icon"><use href="#i-bookmark"\/><\/svg><\/button><\/div>\s*<\/div>\s*<!-- Bookmarks: books \(end\) -->\s*<div class="lib-label">Verses · 2<\/div>/, 'the book kept is bookmarked');
  const row = keptPassageRow();
  assert.ok(marks.includes(`<div class="lib-label">Passages · 1</div>`) && marks.includes(`<span class="bn">${esc(row.bookTitle)}</span><span class="pl">${esc(row.label)}</span><span class="px">${esc(row.excerpt)}</span>`), 'the passage kept is the row passages.ts makes of the real text');
  for (const phone of [search, second, marks]) assert.doesNotMatch(phone, /lib-chip|lib-book\b|lib-notice|Coming soon|Preview|Soon<|SOON|FREE/, 'no chip, no notice');
  assert.ok(marks.indexOf('Bible · 1') < marks.indexOf('Books · 1') && marks.indexOf('Books · 1') < marks.indexOf('Verses · 2') && marks.indexOf('Verses · 2') < marks.indexOf('Passages · 1') && marks.indexOf('Passages · 1') < marks.indexOf('>Posts<'), 'the groups, in the order of the app, then the posts');
});

check('the paper of a cover on the page is the catalog\'s six colours of the light palette and the navy of the brand, and no phone of the Books has more than one handwritten note', () => {
  const tokens = JSON.parse(fs.readFileSync(path.join(root, 'src', 'theme', 'tokens.json'), 'utf8')) as { color: Record<string, string> };
  const group = design.slice(design.indexOf('<h3 id="books-reader">'), design.indexOf('<h3 id="daily-reading">'));
  for (const name of ['goldSoft', 'blue100', 'successWash', 'red100', 'sand300', 'goldWash']) assert.ok(group.includes(`--bk-paper-${name}:${tokens.color[name].toUpperCase()};`), `the paper ${name}`);
  assert.ok(group.includes(`--bk-ink:${tokens.color.blue.toUpperCase()};`), 'the navy ink');
  for (const b of BOOK_CATALOG) assert.ok(group.includes(`--bk-paper-${b.cover.colour}`) || tokens.color[b.cover.colour], `${b.id}: the paper of its cover is one of the six`);
  assert.equal(count(design, /<h3 id="books-reader">/g), 1, 'the group is on the page once');
  assert.ok(design.indexOf('<h3 id="books-reader">') < design.indexOf('<h3 id="daily-reading">'), 'before the Daily reading group, which stays the last of the Screens section');
  for (const phone of group.split('<p class="phone-label">').slice(1)) assert.ok(count(phone, /class="hw"/g) <= 1, 'at most one handwritten note on a screen');
  const labels = [...design.matchAll(/<p class="phone-label"><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.equal(new Set(labels).size, labels.length, 'no two phones of the page have the same label (render_screens.mjs finds a picture by its label)');
});

check('the glyph of the Note action on the page is the app\'s pen: the sprite of the design page has it under i-pen, the same drawing as Icon.tsx, and the bars of a chosen verse and of a chosen passage use it', () => {
  const icons = fs.readFileSync(path.join(root, 'src', 'components', 'Icon.tsx'), 'utf8');
  const line = icons.split('\n').find((l) => /^ {2}pen: \[/.test(l));
  assert.ok(line, 'Icon.tsx has a pen');
  const app = [...line!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const sprite = /<symbol id="i-pen"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(sprite, 'the sprite of the design page has no i-pen');
  assert.deepEqual([...sprite![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), app, 'the pen of the design page and of the app are the same drawing');
  const bars = [...design.matchAll(/<div class="rd-act[^"]*"[^>]*>[^]*?<\/div>\s*<\/div>/g)].map((m) => m[0]);
  assert.ok(bars.length >= 5, 'the bars of actions of the page (verses and passages)');
  for (const bar of bars) assert.ok(bar.includes('<use href="#i-pen"/>') && bar.includes('<span>Note</span>'), 'every bar of actions has Note');
  assert.equal(count(design, /<use href="#i-pen"\/>/g) >= bars.length, true);
});

console.log(`${n} of ${n} passed (design page, Books)`);
