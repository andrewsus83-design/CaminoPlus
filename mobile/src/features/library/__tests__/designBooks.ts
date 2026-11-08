// The Books phones of design/index.html, drawn from the REAL catalog and the real text of the bundle (mobile/assets/library), with the functions the app itself uses to
// work out what a cover, a page and a chapter say: the covers (cover.ts: the A5 size, how the title is broken into lines, the kind and the time), the shelves, the banner
// and the words (copy.ts), the notice of each kind (notices.ts), the contents, the facts and the reader's layout (reading.ts), the type scale of the reader (readerType.ts),
// the passages (passages.ts) and the search (search.ts). Nothing here is typed by hand that the app knows, so the page cannot say a number, a title or a notice that the
// app does not: designBooks.test.ts draws the page again on every run and fails when design/index.html is not what this file makes of the bundle.
//
// The page has marked places, lines like "<!-- Library · Books phone (start) -->" and "<!-- ... (end) -->", and what this file makes goes between each pair (MARKERS):
//  - the phone "Library · Books" among the Library phones,
//  - the line that counts the results of the Search phone, and the group of books in it (there is none for the word the phone shows),
//  - a second Search phone, for a word that finds books,
//  - in the Bookmarks phone, the line that says where the bookmarks are kept, the group of books and the group of passages,
//  - the page of the diary that Note, in the bar of a chosen passage, opens (among the Diary phones),
//  - the group "Library · Books and the reader": its words, its style and all the other phones (the shelves, the book page, the reader).
// To draw the page again after the books, the covers or a screen changed (from mobile/):
//   npx tsc -p tsconfig.librarytest.json && node node_modules/.cache/library-test/features/library/__tests__/designBooks.js --write
// Without --write it only says whether the page is what the books make of it.
import './bundleShim'; // first: the compiled bookBundle.ts finds the files of the books through it
import fs from 'node:fs';
import path from 'node:path';
import { VERSE_RESULTS_MAX } from '../bible/verseRows';
import { BOOK_CATALOG, type CatalogBook } from '../books/catalog';
import { booksBanner, kindMark, kindName, pageNote, shelves, type BooksBannerView, type Shelf } from '../books/copy';
import { coverGrid, coverLabel, coverMetrics, coverText } from '../books/cover';
import type { Block, BookContent, Span } from '../books/index';
import { noticeFor } from '../books/notices';
import { noteStart, passageKey, passageLabel, passageRowsForKeys } from '../books/passages';
import {
  bookFacts, chapterNav, chapterWords, formatMinutes, groupThousands, layoutBlocks, LONG_LABEL, nextLabel, partName, partSubtitle, positionLine, previousLabel, readButtonLabel,
  readButtonSpoken, readingTime, resumeAt, splitTitle, tocGroups, type BookPlace, type Item,
} from '../books/reading';
import { DEFAULT_STEP, LAST_STEP, readerType } from '../books/readerType';
import { safeText } from '../books/safeText';
import { BOOKMARKS_KEPT } from '../sample';
import { itemKey, resultsLine, searchLibrary } from '../search';

/* ================================================================ the words of HTML */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nb = (s: string): string => esc(s).replace(/ /g, '&nbsp;');
const svg = (name: string, style = ''): string => `<svg class="cp-icon"${style ? ` style="${style}"` : ''}><use href="#i-${name}"/></svg>`;
const indent = (html: string, n: number): string => html.split('\n').map((l) => (l.length > 0 ? ' '.repeat(n) + l : l)).join('\n');
/** The same words as bookmarkLabel (BookmarkToggle.tsx), which a screen reader hears on every bookmark button. */
const bookmarkWords = (on: boolean, title: string): string => `${on ? 'Remove bookmark' : 'Bookmark'}: ${title}`;

const STATUS = '<div class="status"><span>9:41</span><span class="island"></span><span>●●●</span></div>';
const DOCK = `<div class="tabdock"><nav class="cp-tabbar">
  <div class="cp-tab"><span class="ico">${svg('me')}</span>Me</div>
  <div class="cp-tab"><span class="ico">${svg('stays')}</span>Stays</div>
  <div class="cp-tab"><span class="ico">${svg('maps')}</span>Maps</div>
  <div class="cp-tab"><span class="ico">${svg('explore')}</span>Discover</div>
  <div class="cp-tab on"><span class="ico">${svg('library')}</span>Library</div>
</nav></div>`;
const LIB_HEAD = `<div class="lib-head">
  <div class="lib-search">${svg('search')}<span class="t">Search the Library</span></div>
  <button class="cp-icon-btn flat" aria-label="Bookmarks">${svg('bookmark')}</button>
</div>
<div class="cp-subtabs" style="margin:16px 0"><span>Bible</span><span class="on">Books</span></div>`;

/** A phone of the page: its label (a name and a line under it) and its screen. */
function phone(title: string, sub: string, inner: string, o: { dark?: boolean; width?: number } = {}): string {
  return `<div class="phone-wrap">
  <p class="phone-label"><b>${title}</b>${sub}</p>
  <div class="phone${o.dark ? ' dk' : ''}"${o.width ? ` style="width:${o.width}px"` : ''}>
    ${STATUS}
${indent(inner, 4)}
    <span class="home-ind"></span>
  </div>
</div>`;
}

/* ================================================================ the books the page shows */

const GUIDE = BOOK_CATALOG.find((b) => b.kind === 'guide');
const READINGS = BOOK_CATALOG.find((b) => b.kind === 'reflection');
if (!GUIDE || !READINGS) throw new Error('the bundle holds no guide or no book of readings: the design page has nothing to show of one of the kinds');

const textOf = (b: CatalogBook): BookContent => {
  const t = safeText(b.id);
  if (!t) throw new Error(`the text of ${b.id} cannot be read`);
  return t;
};

/** The chapter of a book whose first block of one of these kinds comes earliest (a list near the top of a chapter, a quotation near the top of a day). */
function chapterWithEarliest(text: BookContent, kinds: readonly Block['t'][]): { index: number; block: number } {
  let index = -1;
  let block = Number.POSITIVE_INFINITY;
  for (let i = 0; i < text.chapters.length; i += 1) {
    const at = text.chapters[i].blocks.findIndex((b) => kinds.includes(b.t));
    if (at >= 0 && at < block) { index = i; block = at; }
  }
  if (index < 0) throw new Error(`no chapter of ${text.id} has a block of kind ${kinds.join(' or ')}`);
  return { index, block };
}

/** The chapter between the first and the last with the fewest words: a short one, drawn whole, for the phone that shows the end of a chapter with Next and Previous. */
function shortestMiddleChapter(text: BookContent): number {
  let best = 1;
  for (let i = 1; i < text.chapters.length - 1; i += 1) if (chapterWords(text.chapters[i].title, text.chapters[i].blocks) < chapterWords(text.chapters[best].title, text.chapters[best].blocks)) best = i;
  return best;
}

/** The pages of the guide and of the readings that the phones show: the chapter with a list near its top, and the chapter with a quotation near its top. */
export const SHOWN = (() => {
  const guide = textOf(GUIDE);
  const readings = textOf(READINGS);
  return { guide, readings, list: chapterWithEarliest(guide, ['ul', 'ol']), quote: chapterWithEarliest(readings, ['quote']) };
})();

/* ================================================================ the covers */

/** One cover as the Books tab draws it: the sizes cover.ts worked out, the title broken where it measured, the ribbon hung beside the cover button (not inside it). */
export function coverHtml(b: CatalogBook, width: number, o: { bookmarked?: boolean } = {}): string {
  const t = coverText(b, width);
  const m = t.m;
  const on = !!o.bookmarked;
  const half = m.ribbon.width;
  const ribbonRight = m.ribbon.right - (m.ribbon.touch - m.ribbon.width) / 2;
  return `<div class="bk-cover" style="width:${width}px;height:${m.height}px;border-radius:${m.radius}px;--paper:var(--bk-paper-${b.cover.colour})">`
    + `<div class="bk-body" role="button" aria-label="${esc(coverLabel(b))}" style="border-radius:${m.radius}px">`
    + `<span class="bk-spine" style="width:${m.spine}px"></span><span class="bk-groove" style="left:${m.spine}px"></span><span class="bk-hinge" style="left:${m.spine + 2}px"></span><span class="bk-edge" style="width:${m.edge}px"></span>`
    + `<span class="bk-face" style="left:${m.spine + m.padX}px;right:${m.edge + m.padX}px;top:${m.padTop}px;bottom:${m.padBottom}px">`
    + `<span class="bk-ring" style="width:${m.medallion}px;height:${m.medallion}px">${svg(b.cover.icon, `width:${m.glyph}px;height:${m.glyph}px;stroke-width:1.5px`)}</span>`
    + `<span class="bk-t"><span style="font-size:${t.title.size}px;line-height:${t.title.lineHeight}px">${t.title.lines.map(esc).join('<br>')}</span></span>`
    + `<span class="bk-kind" style="font-size:${t.kind.size}px;line-height:${t.kind.lineHeight}px;letter-spacing:${t.kind.spacing}px">${t.kind.lines.map(esc).join('<br>')}</span>`
    + `<span class="bk-time" style="font-size:${m.time.size}px;line-height:${m.time.lineHeight}px">${esc(t.time)}</span>`
    + '</span></div>'
    + `<button class="bk-ribbon${on ? ' on' : ''}" aria-label="${esc(bookmarkWords(on, b.title))}" style="right:${ribbonRight}px;width:${m.ribbon.touch}px;height:${m.ribbon.touch}px">`
    + `<span class="rb" style="width:${half}px;height:${m.ribbon.height - m.ribbon.notch}px">${svg('bookmark', `width:${Math.round(half * 0.68)}px;height:${Math.round(half * 0.68)}px`)}</span><span class="nt" style="width:${half}px;height:${m.ribbon.notch}px"></span></button>`
    + '</div>';
}

/** The small cover of a row (BookCover with `thumb`): the spine, the page edges and the glyph, no words, no ribbon. */
function thumbHtml(b: CatalogBook): string {
  const w = 52;
  const m = coverMetrics(w);
  return `<div class="bk-cover" style="width:${w}px;height:${m.height}px;border-radius:${m.radius}px;--paper:var(--bk-paper-${b.cover.colour})" aria-hidden="true"><div class="bk-body" style="border-radius:${m.radius}px">`
    + `<span class="bk-spine" style="width:${m.spine}px"></span><span class="bk-groove" style="left:${m.spine}px"></span><span class="bk-hinge" style="left:${m.spine + 2}px"></span><span class="bk-edge" style="width:${m.edge}px"></span>`
    + `<span class="bk-face" style="left:${m.spine + 2}px;right:${m.edge}px;top:0;bottom:0;justify-content:center">${svg(b.cover.icon, `width:${Math.round(w * 0.42)}px;height:${Math.round(w * 0.42)}px;stroke-width:1.5px`)}</span></div></div>`;
}

/* ================================================================ the Books tab */

/** The compact banner of the Bible tab with the words of the Books tab (books/BooksBanner.tsx). */
export function bannerHtml(view: BooksBannerView): string {
  if (view.kind === 'none') return `<div class="cp-banner cmp"><div class="ey">${esc(view.label)}</div><h4>${esc(view.title)}</h4><div class="row"><span class="ln">${esc(view.line)}</span></div></div>`;
  return `<div class="cp-banner cmp" role="button" aria-label="${esc([view.cta, view.title, view.label].join('. '))}"><div class="ey">${esc(view.label)}</div><h4>${esc(view.title)}</h4><div class="row"><span class="hw">${esc(view.note)}</span><span class="pill">${esc(view.cta)}</span></div></div>`;
}

/** A shelf: its heading with the number of its books, its quiet line, and the covers, two in a row. `limit` shows only the first covers (a phone that is cut short anyway). */
function shelfHtml(shelf: Shelf<CatalogBook>, screen: number, marked: readonly string[], limit?: number): string {
  const grid = coverGrid(screen, 16);
  const books = limit ? shelf.books.slice(0, limit) : shelf.books;
  return `<div class="bk-shelf">
  <div class="hd"><h4>${esc(shelf.title)}</h4><span class="ct">${shelf.books.length} ${shelf.books.length === 1 ? 'book' : 'books'}</span></div>
  ${shelf.line ? `<p class="ln">${esc(shelf.line)}</p>` : ''}
  <div class="bk-grid" style="grid-template-columns:repeat(2,${grid.tile}px)">${books.map((b) => coverHtml(b, grid.tile, { bookmarked: marked.includes(b.id) })).join('')}</div>
</div>`;
}

type TabOptions = { title: string; sub: string; dark?: boolean; width?: number; last?: string | null; marked?: readonly string[]; limit?: number; only?: 'second' };

/** The Books tab: the banner and the first shelf (the phone is cut short there), or only the second shelf, as the tab looks scrolled down to it. */
function booksTabPhone(o: TabOptions): string {
  const width = o.width ?? 390;
  const view = booksBanner(BOOK_CATALOG, o.last ? { id: o.last } : null);
  const on = shelves(BOOK_CATALOG);
  const marked = o.marked ?? [];
  const inner = o.only === 'second'
    ? `<div class="scroll" style="padding-top:8px">\n${indent(shelfHtml(on[1], width, marked), 2)}\n</div>\n${DOCK}`
    : `<div class="scroll">
${indent(LIB_HEAD, 2)}
  ${bannerHtml(view)}
  <div style="margin-top:24px">
${indent(shelfHtml(on[0], width, marked, o.limit), 4)}
  </div>
</div>
${DOCK}`;
  return phone(o.title, o.sub, inner, { dark: o.dark, width: o.width });
}

/* ================================================================ the rows of a search and of Bookmarks */

/** A book as a row (books/BookRows.tsx): a small cover, the title, the subtitle, the description, the kind and the time; the bookmark button beside the button of the row. */
export function rowHtml(b: CatalogBook, marked: boolean): string {
  return `<div class="bk-brow"><span class="bk-bt" role="button" aria-label="${esc(coverLabel(b))}">${thumbHtml(b)}<span class="tx"><span class="t">${esc(b.title)}</span><span class="a">${esc(b.subtitle)}</span><span class="b">${esc(b.description)}</span><span class="m"><span class="k" aria-label="${esc(kindName(b.kind))}">${esc(kindMark(b.kind))}</span><span class="mn">${esc(formatMinutes(b.minutes))}</span></span></span></span>`
    + `<button class="lib-mark${marked ? ' on' : ''}" aria-label="${esc(bookmarkWords(marked, b.title))}">${svg('bookmark')}</button></div>`;
}

const rowsCard = (books: readonly CatalogBook[], marked: readonly string[], style: string): string => `<div class="cp-card" style="${style}">\n${books.map((b) => `  ${rowHtml(b, marked.includes(b.id))}`).join('\n')}\n</div>`;

/** The word the first Search phone shows (the books of the Bible and the verses: no book of the Library has it), and the word of the second (books only). */
export const SEARCH_BIBLE = 'john';
export const SEARCH_BOOKS = 'camino';
/** How many rows of books the second Search phone draws: the phone is cut short, the label counts them all. */
const SEARCH_ROWS = 3;
/** The book kept in the Bookmarks phone, and the passage (a block of a chapter of the readings). */
const KEPT = GUIDE;

/* ================================================================ the book page */

/** How wide the cover is on the page (BookPage.tsx coverWidthOf): about 60 % of the screen, never under 150 nor over 240. */
export const coverWidthOf = (screen: number): number => Math.min(Math.max(Math.round((screen - 32) * 0.6), 150), 240);

function tocRowHtml(index: number, title: string, minutes: number | undefined, o: { read: boolean; here: boolean; first: boolean }): string {
  const { label, subtitle } = splitTitle(title);
  const spoken = `${title}${minutes ? `, ${formatMinutes(minutes)}` : ''}${o.read ? ', read' : ''}${o.here ? ', where you stopped' : ''}`;
  return `<div class="bk-row${o.first ? ' first' : ''}" role="button" aria-label="${esc(spoken)}"><span class="n">${index + 1}</span><span class="tx"><span class="l">${nb(label)}</span>${subtitle ? `<span class="s">${esc(subtitle)}</span>` : ''}${o.here ? '<span class="here">LAST READ</span>' : ''}</span>`
    + `<span class="rt">${minutes ? `<span class="mn">${esc(formatMinutes(minutes))}</span>` : ''}${o.read ? svg('check', 'color:var(--cp-success);stroke-width:2.2px;width:20px;height:20px') : ''}</span></div>`;
}

type PageOptions = { title: string; sub: string; dark?: boolean; width?: number; place?: BookPlace | null; marked?: boolean };

/** The page of a book: the cover, the title, the subtitle, the kind, the facts, the description, THE NOTICE OF ITS KIND, the button, the contents with the minutes, the credit. */
function bookPagePhone(b: CatalogBook, o: PageOptions): string {
  const text = textOf(b);
  const chapters = text.chapters;
  const place = o.place ?? null;
  const resume = resumeAt(chapters, place);
  const nav = chapterNav(chapters, resume.index)!;
  const minutes = new Map(b.chapters.map((c) => [c.id, c.minutes] as const));
  const read = new Set(place?.read ?? []);
  const coverWidth = coverWidthOf(o.width ?? 390);
  const groups = tocGroups(chapters);
  const cta = place && !resume.fresh
    ? `<div class="cap">${esc([nav.part ? partName(nav.part) : null, positionLine(nav)].filter(Boolean).join(' · '))}</div>`
    : '';
  const toc = groups.map((g, gi) => `${g.part ? `<h5 class="part"${gi === 0 ? '' : ' style="margin-top:8px"'}>${esc(partName(g.part))}</h5>${partSubtitle(g.part) ? `<p class="ps">${esc(partSubtitle(g.part))}</p>` : ''}` : ''}<div class="cp-card bk-toc">${g.entries.map((e, i) => tocRowHtml(e.index, e.title, minutes.get(e.id), { read: read.has(e.id), here: !!place && place.c === e.id, first: i === 0 })).join('')}</div>`).join('');
  const inner = `<div class="scroll" style="padding-bottom:40px">
  <div class="bk-pg">
    <div class="biz-top"><button class="cp-icon-btn" aria-label="Back">${svg('back')}</button></div>
    <div class="bk-head">${coverHtml(b, coverWidth, { bookmarked: !!o.marked })}
      <h3>${esc(b.title)}</h3>${b.subtitle ? `<div class="su">${esc(b.subtitle)}</div>` : ''}
      <span class="kind" aria-label="${esc(kindName(b.kind))}">${esc(kindName(b.kind).toUpperCase())}</span>
      <div class="facts">${esc(bookFacts(b.chapters.length, b.words))}</div>
    </div>
    <p class="blurb">${esc(b.description)}</p>
    <div class="bk-notice" role="note">${svg('flag')}<p>${esc(noticeFor(b.kind))}</p></div>
    <div class="bk-cta"><div class="btn" role="button" aria-label="${esc(readButtonSpoken(chapters, place))}">${esc(readButtonLabel(chapters, place))}</div>${cta}<div class="hw" style="text-align:center">${esc(pageNote(b.kind))}</div></div>
    <div class="bk-contents"><div class="hd"><h4>Contents</h4><span class="ct">${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}</span></div>
      ${toc}
    </div>
    ${text.credit ? `<div class="bk-edition"><div class="k">Credit</div><div class="v">${esc(text.credit)}</div></div>` : ''}
  </div>
</div>`;
  return phone(o.title, o.sub, inner, { dark: o.dark, width: o.width });
}

/* ================================================================ the reader */

const inline = (spans: readonly Span[]): string => spans.map((s) => (s.b ? `<span style="font-weight:600">${esc(s.t)}</span>` : s.i ? `<span style="font-style:italic">${esc(s.t)}</span>` : esc(s.t))).join('');
const around = (html: string, chosen: boolean): string => (chosen ? `<span class="on">${html}</span>` : html);

/** One thing the reader draws (ReaderBlocks.tsx), at a step of the text size. `chosen` is true for the passage that is chosen. */
function itemHtml(item: Item, t: ReturnType<typeof readerType>, chosen: boolean): string {
  const gap = t.gap;
  switch (item.k) {
    case 'p': return `<p style="font-size:${t.body.size}px;line-height:${t.body.lineHeight}px;margin:0 0 ${item.end ? gap : 0}px">${around(inline(item.spans), chosen)}</p>`;
    case 'h': {
      const face = item.level <= 2 ? t.heading : t.body;
      return `<div class="hh" role="heading" aria-level="3" style="font-size:${face.size}px;line-height:${face.lineHeight}px;margin:${Math.round(gap * 0.6)}px 0 ${Math.round(gap * 0.5)}px">${esc(item.spans.map((s) => s.t).join(''))}</div>`;
    }
    case 'q': {
      const para = (spans: readonly Span[]) => `<p style="font-size:${t.quote.size}px;line-height:${t.quote.lineHeight}px;margin:0">${around(inline(spans), chosen)}</p>`;
      const cite = item.cite ? `<p style="font-size:${t.quote.size}px;line-height:${t.quote.lineHeight}px;margin:0;color:var(--cp-text-muted)">${inline(item.cite)}</p>` : '';
      return `<div class="rq" style="margin:0 0 ${gap}px 2px;padding-left:18px;border-left:2px solid var(--cp-border-strong);display:flex;flex-direction:column;gap:${Math.round(gap * 0.5)}px">${item.paras.map(para).join('')}${cite}</div>`;
    }
    case 'list': {
      const column = Math.round(t.body.size * (item.ordered ? 1.9 : 1.2));
      const rows = item.items.map((spans, i) => `<div style="display:flex"><span style="width:${column}px;flex:none;font-size:${t.body.size}px;line-height:${t.body.lineHeight}px;color:var(--cp-text-muted)">${item.ordered ? `${i + 1}.` : '•'}</span><span style="flex:1;min-width:0;font-size:${t.body.size}px;line-height:${t.body.lineHeight}px">${around(inline(spans), chosen)}</span></div>`).join('');
      return `<div class="rl" style="margin:0 0 ${gap}px;padding-left:4px;display:flex;flex-direction:column;gap:${Math.round(gap * 0.5)}px">${rows}</div>`;
    }
    case 'hr': return `<div class="rk" style="width:48px;height:1px;background:var(--cp-border-strong);margin:${Math.round(gap * 0.4)}px auto ${Math.round(gap * 1.2)}px"></div>`;
  }
}

/** The step of the end of a chapter (ChapterFooter.tsx): Next filled, Previous plain, each named by where it goes. */
function stepHtml(side: 'previous' | 'next', nav: NonNullable<ReturnType<typeof chapterNav>>): string {
  const to = side === 'previous' ? nav.prev : nav.next;
  const next = side === 'next';
  const part = to && to.part && to.part !== nav.part ? partName(to.part) : null;
  const { label, subtitle } = to ? splitTitle(to.title) : { label: next ? 'This is the last chapter' : 'This is the first chapter', subtitle: '' };
  const k = part ? `${next ? 'Next' : 'Previous'} · ${part}` : next ? 'Next' : 'Previous';
  const words = `<span class="x"><span class="k">${esc(k)}</span><span class="l">${nb(label)}</span>${subtitle ? `<span class="s">${esc(subtitle)}</span>` : ''}</span>`;
  const cls = `step${next ? ' next' : ''}${to ? '' : ' off'}`;
  const spoken = esc(next ? nextLabel(nav) : previousLabel(nav));
  return next
    ? `<div class="${cls}" role="button" aria-label="${spoken}"${to ? '' : ' aria-disabled="true"'}>${words}${svg('chev', `width:22px;height:22px${to ? '' : ';color:var(--cp-action)'}`)}</div>`
    : `<div class="${cls}" role="button" aria-label="${spoken}"${to ? '' : ' aria-disabled="true"'}>${svg('back', 'width:22px;height:22px;color:var(--cp-action)')}${words}</div>`;
}

type ReaderOptions = {
  title: string; sub: string; text: BookContent; chapter: number; dark?: boolean; width?: number; step?: number;
  /** The first block to draw (0: the chapter from its head; more: the chapter as it looks scrolled down to that block). */
  from?: number;
  /** The last block to draw. */
  to?: number;
  /** The whole chapter to its end, with Next and Previous and the note: the phone is scrolled down to the end. */
  end?: boolean;
  /** The block that is chosen (a passage), and whether it is bookmarked. */
  chosen?: number;
  bookmarked?: boolean;
  progress?: number;
};

function readerPhone(o: ReaderOptions): string {
  const t = readerType(o.step ?? DEFAULT_STEP);
  const chapter = o.text.chapters[o.chapter];
  const nav = chapterNav(o.text.chapters, o.chapter)!;
  const items = layoutBlocks(chapter.blocks);
  const from = o.from ?? 0;
  const shown = items.filter((i) => { const b = Number.parseInt(i.key, 10); return b >= from && (o.end || b <= (o.to ?? from + 6)); });
  const words = chapterWords(chapter.title, chapter.blocks);
  const head = splitTitle(chapter.title);
  const face = head.label.length > LONG_LABEL ? t.heading : t.title;
  const chead = from > 0 ? '' : `<div class="chead">${chapter.part ? `<div class="part" style="font-size:${t.meta.size}px;line-height:${t.meta.lineHeight}px">${esc(partName(chapter.part))}</div>` : ''}
    <div role="heading" aria-level="2" aria-label="${esc(chapter.title)}"><div class="ti" style="font-size:${face.size}px;line-height:${face.lineHeight}px">${esc(head.label)}</div>${head.subtitle ? `<div class="su" style="font-size:${t.quote.size}px;line-height:${t.quote.lineHeight}px">${esc(head.subtitle)}</div>` : ''}</div>
    <div class="me" style="font-size:${t.meta.size}px;line-height:${t.meta.lineHeight}px">${esc(`${readingTime(words)} · ${groupThousands(words)} words`)}</div></div>`;
  const body = shown.map((i) => itemHtml(i, t, o.chosen !== undefined && Number.parseInt(i.key, 10) === o.chosen)).join('\n    ');
  const footer = o.end
    ? `\n    <div class="bk-end">\n      ${stepHtml('next', nav)}\n      ${stepHtml('previous', nav)}\n      <div class="hw" style="text-align:center">${nav.next ? 'Rest a little' : 'Buen Camino!'}</div>\n    </div>`
    : '';
  const label = o.chosen !== undefined ? passageLabel(chapter, o.chosen) : '';
  const actions = o.chosen !== undefined
    ? `\n<div class="rd-act dock four" role="toolbar" aria-label="${esc(`Actions for ${label}`)}">
  <div class="top"><span class="pl">${esc(label)}</span><button class="x" aria-label="Close the passage actions">${svg('x')}</button></div>
  <div class="btns"><button${o.bookmarked ? ' class="on"' : ''} aria-label="${esc(bookmarkWords(!!o.bookmarked, label))}">${svg('bookmark')}<span>Bookmark</span></button><button aria-label="${esc(`Write a note: ${label}`)}">${svg('pen')}<span>Note</span></button><button aria-label="${esc(`Copy: ${label}`)}">${svg('copy')}<span>Copy</span></button><button aria-label="${esc(`Share: ${label}`)}">${svg('share')}<span>Share</span></button></div>
</div>`
    : '';
  const progress = Math.round((o.progress ?? (o.end ? 0.97 : from > 0 ? 0.3 : 0.05)) * 100);
  const inner = `<div class="bk-rhead">
  <div class="r1"><span class="bk-back" role="button" aria-label="Contents">${svg('back')}<span>Contents</span></span><span class="sz"><span class="a s" role="button" aria-label="Smaller text"><i>A</i></span><span class="a l" role="button" aria-label="Larger text"><i>A</i></span></span></div>
</div>
<div class="scroll bk-rscroll${o.chosen !== undefined ? ' pa' : ''}"${o.end ? ' data-bk-end' : ''}>
  <div class="bk-rtx" style="max-width:${t.measure}px">
    ${chead}${chead ? '\n    ' : ''}${body}${footer}
  </div>
</div>${actions}
<div class="bk-rbar">
  <div class="bk-prog" aria-hidden="true"><i style="width:${progress}%"></i></div>
  <div class="r2"><span class="bk-ic${nav.prev ? '' : ' off'}" role="button" aria-label="${esc(previousLabel(nav))}">${svg('back')}</span><span class="mid"><span class="bt">${esc(o.text.title)}</span><span class="ps">${esc(positionLine(nav))}</span></span><span class="bk-ic${nav.next ? '' : ' off'}" role="button" aria-label="${esc(nextLabel(nav))}">${svg('chev')}</span></div>
</div>`;
  return phone(o.title, o.sub, inner, { dark: o.dark, width: o.width });
}

/* ================================================================ the page of the diary that Note opens */

/** What the person writes under the quotation: the note is a note of the diary like any other. */
const NOTE_WORDS = 'Walking the first day, and thinking of this.';

/** The page of the diary for a new note about the passage that the phones choose: it starts as passages.ts noteStart says (the passage in the marks of the diary, whose words and where). */
export function diaryNotePhone(): string {
  const chapter = SHOWN.readings.chapters[SHOWN.quote.index];
  const start = noteStart(SHOWN.readings.title, chapter, SHOWN.quote.block);
  if (start === null) throw new Error('the passage of the phones is not a passage');
  return phone('Diary · note about a passage', 'Note in the bar of a passage opens a new page that starts with the passage as a quotation, whose words and where, and an empty line · words and photos go under it · it appears in Notes', `<div class="scroll" style="display:flex;flex-direction:column;padding-bottom:104px">
  <div class="biz-top" style="justify-content:space-between"><button class="cp-icon-btn flat" aria-label="Back">${svg('back')}</button><span style="display:flex;align-items:center;gap:8px"><button class="cp-btn md" style="height:48px;padding:0 20px;font-size:17px;background:var(--cp-surface);color:var(--cp-text);box-shadow:inset 0 0 0 1px var(--cp-border)">Read</button><button class="cp-icon-btn flat" aria-label="Delete this page">${svg('trash')}</button></span></div>
  <p class="note" style="margin:12px 0 10px">Friday 6 November</p>
  <div class="cp-card" style="padding:0;flex:1;min-height:236px;box-shadow:inset 0 0 0 2px var(--cp-color-gold)">
    <div style="font-family:var(--cp-font-title);font-weight:600;font-size:24px;line-height:30px;padding:14px 18px 10px;color:var(--cp-text-muted)">Title (optional)</div>
    <div style="height:1px;margin:0 18px;background:var(--cp-border)"></div>
    <div class="dn-text" style="font-size:19px;line-height:28px;padding:14px 18px;white-space:pre-wrap">${esc(`${start}${NOTE_WORDS}`).replace(/\n/g, '&#10;')}</div>
  </div>
  <p class="note" style="margin:10px 0 0;font-size:14px">Saved on this phone</p>
</div>
<div class="dy-bar">
  <button class="t" aria-label="Bold"><i>${svg('bold')}</i></button>
  <button class="t" aria-label="Italic"><i>${svg('italic')}</i></button>
  <button class="t" aria-label="Heading"><i>${svg('heading')}</i></button>
  <button class="t" aria-label="Bulleted list"><i>${svg('list')}</i></button>
  <button class="t" aria-label="Quote"><i>${svg('quote')}</i></button>
  <span class="sep"></span>
  <button class="t" aria-label="Add photos or videos"><i>${svg('image')}</i></button>
  <button class="t" aria-label="Change place"><i>${svg('pin')}</i></button>
</div>`);
}

/* ================================================================ the phones of the group, and the style and the words of the group */

const cover390 = coverGrid(390, 16);
const cover320 = coverGrid(320, 16);
const cover430 = coverGrid(430, 16);

/** The place the "Continue" phones show: the third chapter of the guide, the first two read. */
function placeIn(text: BookContent): BookPlace {
  return { id: text.id, c: text.chapters[2].id, y: 0.35, at: 0, read: [text.chapters[0].id, text.chapters[1].id] };
}

const STYLE = `<style>
  /* Library > Books: the shelves of covers (A5, two in a row), the book page and the reader. This page is DRAWN by mobile/src/features/library/__tests__/designBooks.ts from the books of the
     bundle and from the functions of the app (cover.ts, copy.ts, notices.ts, reading.ts, readerType.ts, passages.ts): do not edit what is between the marks, draw it again. */
  /* A cover is paper and does not change with light and dark: these are the six pale colours of the catalog, the navy ink and the paper of the page edges, read from the
     LIGHT palette of tokens.json (a test compares them), and not variables that the dark phones swap. */
  .bk-cover, .bk-pg, .bk-grid { --bk-paper-goldSoft:#F3DFA6; --bk-paper-blue100:#DCE5EF; --bk-paper-successWash:#DDEBE2; --bk-paper-red100:#F4DEDA; --bk-paper-sand300:#E4D7BF; --bk-paper-goldWash:#FBF3DC; --bk-ink:#14365D; --bk-white:#FFFDF8; --bk-parchment:#F6EFE2; --bk-gold-bright:#E8B53A; }
  .bk-grid { display: grid; justify-content: center; column-gap: 12px; row-gap: 16px; }
  .bk-cover { position: relative; flex: none; background: var(--paper); box-shadow: var(--cp-shadow-md); color: var(--bk-ink); }
  .bk-body { position: absolute; inset: 0; overflow: hidden; background: var(--paper); box-shadow: inset 0 0 0 1px rgba(20, 54, 93, .14); }
  .bk-spine { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(20, 54, 93, .16); }
  .bk-groove { position: absolute; top: 0; bottom: 0; width: 2px; background: linear-gradient(to right, rgba(20, 54, 93, .28) 50%, rgba(255, 253, 248, .6) 50%); }
  .bk-hinge { position: absolute; top: 0; bottom: 0; width: 5px; background: linear-gradient(to right, rgba(20, 54, 93, .1), rgba(20, 54, 93, .02)); }
  .bk-edge { position: absolute; right: 0; top: 0; bottom: 0; background: rgba(255, 253, 248, .9); box-shadow: inset 1px 0 0 rgba(20, 54, 93, .22), inset -2px 0 0 rgba(20, 54, 93, .1); }
  .bk-face { position: absolute; display: flex; flex-direction: column; align-items: center; }
  .bk-ring { flex: none; display: grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(20, 54, 93, .45); }
  .bk-t { flex: 1; align-self: stretch; display: flex; align-items: center; justify-content: center; text-align: center; font-family: var(--cp-font-title); font-weight: 600; }
  .bk-kind { text-align: center; font-family: var(--cp-font-body); font-weight: 600; }
  .bk-time { margin-top: 4px; text-align: center; font-family: var(--cp-font-mono); white-space: nowrap; }
  .bk-ribbon { position: absolute; top: 0; padding: 0; border: 0; background: none; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
  .bk-ribbon .rb { display: grid; place-items: center; background: var(--bk-ink); color: var(--bk-parchment); padding-bottom: 2px; }
  .bk-ribbon .rb .cp-icon { stroke-width: 1.75px; }
  .bk-ribbon.on .rb { color: var(--bk-gold-bright); }
  .bk-ribbon.on .rb .cp-icon { fill: currentColor; }
  .bk-ribbon .nt { background: var(--bk-ink); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 0, 0 100%); }
  /* a shelf of the Books tab (books/BooksGrid.tsx): the heading with the number of its books, one quiet line, the covers */
  .bk-shelf .hd { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; column-gap: 12px; }
  .bk-shelf h4 { margin: 0; font-family: var(--cp-font-title); font-weight: 600; font-size: 24px; line-height: 30px; }
  .bk-shelf .ct { font-family: var(--cp-font-mono); font-size: 14px; line-height: 20px; color: var(--cp-text-muted); }
  .bk-shelf .ln, .bk-cap { margin: 2px 0 12px; font-size: 15px; line-height: 21px; letter-spacing: .4px; font-weight: 500; color: var(--cp-text-muted); }
  .cp-banner.cmp .ln { flex: 1; min-width: 0; font-size: 15px; line-height: 20px; }
  .cp-banner.cmp .ey { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* the label is one line (numberOfLines 1): a long title ends in an ellipsis */
  /* the rows of a search and of Bookmarks (books/BookRows.tsx): a small cover, the title in Fraunces, the subtitle, the description, the kind and the time */
  .bk-brow { display: flex; align-items: flex-start; gap: 6px; padding: 10px 6px 10px 12px; border-top: 1px solid var(--cp-border); }
  .bk-brow:first-child { border-top: 0; }
  .bk-bt { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 14px; padding: 4px 0; }
  .bk-bt .bk-cover { --bk-ink: #14365D; --bk-paper-goldSoft:#F3DFA6; --bk-paper-blue100:#DCE5EF; --bk-paper-successWash:#DDEBE2; --bk-paper-red100:#F4DEDA; --bk-paper-sand300:#E4D7BF; --bk-paper-goldWash:#FBF3DC; --bk-white:#FFFDF8; }
  .bk-bt .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .bk-bt .t { font-family: var(--cp-font-title); font-weight: 600; font-size: 19px; line-height: 24px; }
  .bk-bt .a { font-size: 15px; line-height: 21px; letter-spacing: .4px; font-weight: 500; color: var(--cp-text-muted); }
  .bk-bt .b { font-size: 17px; line-height: 25px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .bk-bt .m { display: flex; align-items: center; gap: 10px; }
  .bk-bt .k, .bk-head .kind { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: var(--cp-radius-pill); background: var(--cp-surface-sunken); color: var(--cp-text-muted); font-family: var(--cp-font-mono); font-size: 12px; line-height: 16px; letter-spacing: 1px; }
  .bk-bt .mn { font-family: var(--cp-font-mono); font-size: 13px; line-height: 19px; color: var(--cp-text-muted); }
  /* the book page */
  .bk-pg { display: flex; flex-direction: column; gap: 16px; }
  .bk-head { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .bk-head h3 { margin: 8px 0 0; font-family: var(--cp-font-title); font-weight: 600; font-size: 28px; line-height: 34px; letter-spacing: -.25px; text-align: center; }
  .bk-head .su { font-size: 17px; line-height: 25px; color: var(--cp-text-muted); text-align: center; margin-top: -8px; }
  .bk-head .kind { height: 26px; padding: 0 12px; }
  .bk-head .facts { font-family: var(--cp-font-mono); font-size: 13px; line-height: 19px; color: var(--cp-text-muted); text-align: center; }
  .bk-pg .blurb { margin: 0; font-size: 19px; line-height: 28px; }
  .bk-notice { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: var(--cp-radius-lg); background: var(--cp-surface-sunken); }
  .bk-notice .cp-icon { flex: none; width: 20px; height: 20px; color: var(--cp-text-muted); }
  .bk-notice p { flex: 1; min-width: 0; margin: 0; font-size: 17px; line-height: 25px; }
  .bk-cta { display: flex; flex-direction: column; gap: 8px; }
  .bk-cta .btn { min-height: 56px; padding: 12px 24px; display: flex; align-items: center; justify-content: center; border-radius: var(--cp-radius-pill); background: var(--cp-color-gold); color: var(--cp-on-highlight); font-weight: 600; font-size: 17px; line-height: 22px; text-align: center; }
  .bk-cta .cap { font-family: var(--cp-font-mono); font-size: 13px; line-height: 19px; color: var(--cp-text-muted); text-align: center; }
  .bk-contents { display: flex; flex-direction: column; gap: 12px; }
  .bk-contents .hd { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; column-gap: 12px; }
  .bk-contents h4 { margin: 0; font-family: var(--cp-font-title); font-weight: 600; font-size: 24px; line-height: 30px; }
  .bk-contents .ct { font-family: var(--cp-font-mono); font-size: 14px; line-height: 20px; color: var(--cp-text-muted); }
  .bk-contents .part { margin: 0; font-family: var(--cp-font-title); font-weight: 600; font-size: 19px; line-height: 25px; }
  .bk-contents .ps { margin: 0; font-size: 15px; line-height: 21px; color: var(--cp-text-muted); }
  .bk-toc { padding: 0; overflow: hidden; }
  .bk-row { min-height: 56px; display: flex; align-items: flex-start; gap: 12px; padding: 17px 12px; border-top: 1px solid var(--cp-border); }
  .bk-row.first { border-top: 0; }
  .bk-row .n { width: 28px; margin-top: 1px; text-align: right; font-family: var(--cp-font-mono); font-size: 14px; line-height: 20px; color: var(--cp-text-muted); }
  .bk-row .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bk-row .l { font-weight: 600; font-size: 17px; line-height: 22px; }
  .bk-row .s { font-size: 15px; line-height: 21px; color: var(--cp-text-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .bk-row .here { align-self: flex-start; height: 20px; padding: 0 8px; display: inline-flex; align-items: center; border-radius: var(--cp-radius-pill); background: var(--cp-surface-sunken); color: var(--cp-text-muted); font-family: var(--cp-font-mono); font-size: 11px; line-height: 14px; letter-spacing: 1px; }
  .bk-row .rt { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .bk-row .rt .mn { font-family: var(--cp-font-mono); font-size: 13px; line-height: 20px; color: var(--cp-text-muted); }
  .bk-edition .k { font-family: var(--cp-font-mono); font-size: 12px; line-height: 16px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--cp-text-muted); }
  .bk-edition .v { font-size: 15px; line-height: 21px; letter-spacing: .4px; font-weight: 500; color: var(--cp-text-muted); }
  /* the reader: a header at the top that stays (one row: the way back and the size of the text), the chapter under it, and a bar at the bottom that stays (the thin line, Previous, the title of the book with the place, Next) */
  .bk-rhead { position: absolute; top: 54px; left: 0; right: 0; z-index: 4; background: var(--cp-bg); padding-top: 8px; }
  .bk-rhead .r1 { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; }
  .bk-rbar .r2 { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; }
  .bk-rbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; background: var(--cp-bg); padding-bottom: 34px; }
  .bk-back { min-height: 44px; display: inline-flex; align-items: center; gap: 4px; padding: 0 14px 0 6px; font-weight: 600; font-size: 16px; line-height: 22px; }
  .bk-back .cp-icon { width: 24px; height: 24px; }
  .bk-rhead .sz { display: flex; gap: 8px; }
  .bk-rhead .a { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--cp-surface); box-shadow: inset 0 0 0 1px var(--cp-border); font-family: var(--cp-font-title); font-weight: 600; }
  .bk-rhead .a i { font-style: normal; }
  .bk-rhead .a.s i { font-size: 15px; line-height: 20px; }
  .bk-rhead .a.l i { font-size: 24px; line-height: 28px; }
  .bk-rhead .off, .bk-rbar .off { opacity: .35; }
  .bk-ic { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%; flex: none; }
  .bk-ic .cp-icon { width: 31px; height: 31px; }
  .bk-rbar .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; padding: 0 4px; }
  .bk-rbar .bt { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 18px; line-height: 24px; }
  .bk-rbar .ps { font-family: var(--cp-font-mono); font-size: 14px; line-height: 20px; color: var(--cp-text-muted); }
  .bk-prog { height: 4px; background: var(--cp-border); }
  .bk-prog i { display: block; height: 4px; background: var(--cp-action); }
  .phone .scroll.bk-rscroll { top: 106px; bottom: 102px; padding: 20px 20px 48px; }
  /* a passage that is chosen: the gold ground and underline of a verse; the bar of actions (the Bible's, 138 high) takes its own room above the bar at the bottom, and the chapter has that much less */
  .bk-rtx .on { background: var(--cp-color-gold-soft); text-decoration: underline; }
  .phone .scroll.bk-rscroll.pa { bottom: 248px; }
  .rd-act.dock { bottom: 110px; }
  /* four actions (Copy is there) share the bar: as wide as the phone allows, the word shrinks to fit */
  .rd-act.four .btns button { min-width: 0; }
  .rd-act.four .btns button { font-size: 16px; }
  @media (max-width: 359px) { .rd-act.four .btns button { font-size: 13px; } }
  /* a bookmarked passage on the Bookmarks screen: the book, where it is, the first words; one button, and the bookmark beside it (books/PassageRows.tsx) */
  .bk-prow { display: flex; align-items: flex-start; gap: 6px; padding: 10px 6px 10px 12px; }
  .bk-pt { flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .bk-pt .bn { font-family: var(--cp-font-title); font-weight: 600; font-size: 19px; line-height: 24px; }
  .bk-pt .pl { font-family: var(--cp-font-mono); font-size: 14px; line-height: 20px; color: var(--cp-text-accent); }
  .bk-pt .px { font-size: 15px; line-height: 21px; }
  .bk-rtx { margin: 0 auto; }
  .bk-rtx .chead { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
  .bk-rtx .chead .part, .bk-rtx .chead .me { font-family: var(--cp-font-mono); color: var(--cp-text-muted); }
  .bk-rtx .chead .part { text-transform: uppercase; letter-spacing: 1.5px; }
  .bk-rtx .ti { font-family: var(--cp-font-title); font-weight: 600; }
  .bk-rtx .su { color: var(--cp-text-muted); margin-top: 6px; }
  .bk-rtx .hh { font-family: var(--cp-font-title); font-weight: 600; }
  .bk-end { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
  .bk-end .step { min-height: 64px; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--cp-radius-lg); background: var(--cp-surface); box-shadow: inset 0 0 0 1px var(--cp-border); }
  .bk-end .step.next { background: var(--cp-action); color: var(--cp-on-action); box-shadow: none; }
  .bk-end .step.off { opacity: .45; }
  .bk-end .x { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bk-end .next .x { align-items: flex-end; text-align: right; }
  .bk-end .k { font-family: var(--cp-font-mono); font-size: 12px; line-height: 16px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--cp-text-muted); }
  .bk-end .next .k { color: var(--cp-on-action); }
  .bk-end .l { font-weight: 600; font-size: 17px; line-height: 22px; }
  .bk-end .s { font-size: 15px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  </style>`;

const SCRIPT = `<script>
  /* The phone marked data-bk-end shows the reader scrolled to the end of the chapter, where Next and Previous are. */
  (function () {
    var go = function () { document.querySelectorAll('[data-bk-end]').forEach(function (el) { el.scrollTop = el.scrollHeight; }); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    window.addEventListener('load', go);
  })();
  </script>`;

/** The words above the phones of the group, with the numbers the app works out. */
function groupNotes(): string {
  const on = shelves(BOOK_CATALOG);
  const count = (kind: string) => on.find((s) => s.kind === kind)?.books.length ?? 0;
  const first = coverText(GUIDE!, cover390.tile);
  return `<h3 id="books-reader">Library · Books and the reader</h3>
  <p class="note" style="margin:-8px 0 12px;max-width:760px"><b>Drawn from the books of the app.</b> Every phone of this group, the Books phone of Library and the Books rows of Search and Bookmarks are made by <code>mobile/src/features/library/__tests__/designBooks.ts</code>
  from the bundle (<code>mobile/assets/library</code>: ${BOOK_CATALOG.length} books, ${count('guide')} pilgrim's guides and ${count('reflection')} books of readings) with the functions the app uses, and a test draws them again on every run: a title, a time, a notice or a size on this page is the app's.
  After a change of the books or of a screen, draw them again (the command is in that file).</p>
  <p class="note" style="margin:-4px 0 20px;max-width:760px">The Books tab shows its books as <b>covers</b> on one <b>shelf</b> for each kind of book (Pilgrim's guides, then Readings for the Way), each shelf with its heading, the number of its books and one quiet line.
  A cover is an A5 page, portrait (148 by 210 mm, so as high as 210/148 of its width), two in a row, 16 from the edge and 12 apart (${cover390.tile} by ${cover390.height} on a 390 phone, ${cover320.tile} by ${cover320.height} on 320, ${cover430.tile} by ${cover430.height} on 430).
  Each is drawn like a book: a spine with a groove and the shade of the hinge, the edges of the pages on the right, a small radius, a soft shadow, the glyph of the book in a ring, the title set like a cover in Fraunces
  (as large as fits, never a word cut: "${esc(first.title.lines.join(' '))}" is set at ${first.title.size}), the kind of book in small spaced capitals (Inter) and how long it takes in JetBrains Mono. There is no mark of free or soon: every book is in the app.
  The paper does not change with light and dark, nor does the navy printed on it. A cover is <b>one button</b> ("${esc(coverLabel(GUIDE!))}") and the ribbon at its top right is <b>another</b>, 44 by 44, that bookmarks the book (the key is <code>books:id</code>).
  The banner is the compact one of the Bible tab: a label (the first book, or the one read last), a title, one short handwritten note and a gold pill: <b>Start reading</b> or, once something was read, <b>Continue reading</b>, which goes on at the line where you stopped.
  A cover opens the <b>book page</b>: a larger cover, the title, the subtitle, the kind, the chapters, the words and the time, the description, <b>the notice of its kind</b> (what was written with AI assistance and what has not been checked: <code>notices.ts</code>) above the gold button
  (<b>${esc(readButtonLabel(SHOWN.guide.chapters, null))}</b> or <b>${esc(readButtonLabel(SHOWN.guide.chapters, placeIn(SHOWN.guide)))}</b>), the table of contents with the minutes of each chapter, the ones read ticked and the place where you stopped marked, and the credit.
  The <b>reader</b> keeps a header at the top while the chapter scrolls under it, with one row as on a Kindle: the way back to the contents and two buttons for smaller and larger text (five steps, kept on the phone). At the bottom it keeps a bar: a thin line that shows how far down you are,
  and under it Previous and Next named by where they go (off at the first and the last chapter) with the title of the book and "${esc(positionLine({ position: 3, total: SHOWN.guide.chapters.length }))}" between them. It sets paragraphs, headings, <b>lists</b> and <b>quotations</b> (the passage of a book of readings is one, with a rule at its left and a line that says whose words they are).
  A touch on a paragraph, a list or a quotation <b>chooses that passage</b>, as a touch on a verse of the Bible does, and raises Bookmark, Copy and Share; a bookmarked passage is a row of Bookmarks that opens the reader at it.
  Where you stopped, the chapters you read and the size of the text stay on the phone and nothing is fetched: the books work with no signal.</p>`;
}

/** All the phones of the group, in the order of the page. */
function groupPhones(): string {
  const { guide, readings, list, quote } = SHOWN;
  const second = shelves(BOOK_CATALOG)[1];
  const place = placeIn(guide);
  const out: string[] = [
    booksTabPhone({ title: 'Books · second shelf', sub: `The tab scrolled down to ${esc(second.title)}: ${second.books.length} books, every cover with its kind and its time`, only: 'second' }),
    booksTabPhone({ title: 'Books · dark', sub: 'Continue reading · the covers are paper: they do not change', dark: true, last: GUIDE!.id, limit: 6 }),
    booksTabPhone({ title: 'Books · 320 wide', sub: `The smallest phone: ${cover320.tile} by ${cover320.height} covers, titles fitted`, width: 320, limit: 6 }),
    bookPagePhone(GUIDE!, { title: 'Book page · guide', sub: 'Cover and ribbon · the notice of a guide above the button · Start reading · the minutes of each chapter', marked: true }),
    bookPagePhone(READINGS!, { title: 'Book page · readings', sub: 'The notice of a book of readings: the passages are word for word, the reflections are original' }),
    bookPagePhone(GUIDE!, { title: 'Book page · Continue', sub: 'Where you stopped, the chapters read · dark', dark: true, place }),
    bookPagePhone(GUIDE!, { title: 'Book page · 320 wide', sub: 'The smallest phone', width: 320 }),
    readerPhone({ title: 'Reader · a list', sub: `${esc(guide.title)}, ${esc(splitTitle(guide.chapters[list.index].title).label)}, scrolled to its list · one row at the top, at the bottom the title of the book with Previous and Next · the line shows how far you are`, text: guide, chapter: list.index, from: Math.max(0, list.block - 2), to: list.block + 1 }),
    readerPhone({ title: 'Reader · a quotation', sub: `${esc(readings.title)}, ${esc(splitTitle(readings.chapters[quote.index].title).label)} · the passage of the day has a rule at its left and a line that says whose words they are`, text: readings, chapter: quote.index, from: 0, to: quote.block + 3 }),
    readerPhone({ title: 'Reader · dark', sub: 'The same chapter in dark', dark: true, text: readings, chapter: quote.index, from: 0, to: quote.block + 3 }),
    readerPhone({ title: 'Reader · large text', sub: `The largest of five steps, ${readerType(LAST_STEP).body.size} · still one column`, step: LAST_STEP, text: guide, chapter: list.index, from: Math.max(0, list.block - 2), to: list.block + 1 }),
    readerPhone({ title: 'Reader · 320 wide', sub: 'The smallest phone', width: 320, text: readings, chapter: quote.index, from: 0, to: quote.block + 3 }),
    readerPhone({ title: 'Reader · end of a chapter', sub: 'Next and Previous, named by where they go · one handwritten note', text: guide, chapter: shortestMiddleChapter(guide), end: true, from: 0 }),
    readerPhone({ title: 'Reader · passage chosen', sub: 'A touch chooses a passage: a gold ground and an underline · Bookmark, Copy, Share, as big as the Bible\'s · the bar takes its own room above the bar at the bottom', text: readings, chapter: quote.index, from: 0, to: quote.block + 2, chosen: quote.block, progress: 0.08 }),
    readerPhone({ title: 'Reader · passage bookmarked', sub: 'The same passage after Bookmark: the glyph is filled and the button tinted; the word stays', text: readings, chapter: quote.index, from: 0, to: quote.block + 2, chosen: quote.block, bookmarked: true, progress: 0.08 }),
  ];
  return out.join('\n\n');
}

/* ================================================================ the regions of the page */

export type RegionName = 'books-tab' | 'search-count' | 'search-books' | 'search-books-phone' | 'bookmarks-kept' | 'bookmarks-books' | 'bookmarks-passages' | 'diary-note' | 'group';

/** The two lines that mark a region of design/index.html: what is between them is drawn here. */
export const MARKERS: Record<RegionName, { start: string; end: string }> = {
  'books-tab': { start: '    <!-- Library · Books phone (start) -->', end: '    <!-- Library · Books phone (end) -->' },
  'search-count': { start: '          <!-- Search: count (start) -->', end: '          <!-- Search: count (end) -->' },
  'search-books': { start: '          <!-- Search: books (start) -->', end: '          <!-- Search: books (end) -->' },
  'search-books-phone': { start: '    <!-- Search: books phone (start) -->', end: '    <!-- Search: books phone (end) -->' },
  'bookmarks-kept': { start: '            <!-- Bookmarks: kept (start) -->', end: '            <!-- Bookmarks: kept (end) -->' },
  'bookmarks-books': { start: '            <!-- Bookmarks: books (start) -->', end: '            <!-- Bookmarks: books (end) -->' },
  'bookmarks-passages': { start: '            <!-- Bookmarks: passages (start) -->', end: '            <!-- Bookmarks: passages (end) -->' },
  'diary-note': { start: '    <!-- Diary: note about a passage (start) -->', end: '    <!-- Diary: note about a passage (end) -->' },
  group: { start: '  <!-- Library · Books and the reader (start) -->', end: '  <!-- Library · Books and the reader (end) -->' },
};

/** The line of a search that counts what was found: the rows are found at once, and the verses (a hundred at most) after the keystroke, which the page shows as found. */
export function searchCountLine(query: string): string {
  const found = searchLibrary(query);
  return resultsLine({ ...found, total: found.total + (query === SEARCH_BIBLE ? VERSE_RESULTS_MAX : 0) });
}

/** The passage kept in the Bookmarks phone: the row the app draws for it (passages.ts), made from the real text. */
export function keptPassageRow() {
  const key = passageKey(READINGS!.id, SHOWN.readings.chapters[SHOWN.quote.index].id, SHOWN.quote.block);
  const rows = passageRowsForKeys([key], safeText);
  if (rows.length !== 1) throw new Error('the passage kept in the Bookmarks phone is not a passage of the text');
  return rows[0];
}

/** What goes between the marks of each region. */
export function regions(): Record<RegionName, string> {
  const booksFound = searchLibrary(SEARCH_BOOKS).hits.Books;
  const dev = searchLibrary(SEARCH_BIBLE).hits.Books;
  const row = keptPassageRow();
  const searchBooks = (books: readonly CatalogBook[], limit: number): string => (books.length === 0 ? '' : `<div class="lib-label" style="margin-top:24px">Books · ${books.length}</div>\n${rowsCard(books.slice(0, limit), [], 'padding:4px;margin-top:16px')}`);
  return {
    'books-tab': indent(booksTabPhone({ title: 'Library · Books', sub: `Banner of the Bible tab, compact · ${shelves(BOOK_CATALOG).map((s) => `${s.books.length} ${esc(s.title.toLowerCase())}`).join(' and ')}, A5 covers, two in a row · the ribbon bookmarks`, marked: [KEPT.id] }), 4),
    'search-count': `          <p class="lib-count" style="margin:16px 0 0">${esc(searchCountLine(SEARCH_BIBLE))}</p>`,
    'search-books': indent(searchBooks(dev, dev.length), 10),
    'search-books-phone': indent(phone('Library · Search, books', `A word that finds books: a small cover, the title, the subtitle, the description, the kind and the time · the first ${SEARCH_ROWS} of ${booksFound.length}`, `<div class="scroll">
  <div class="lib-head">
    <div class="lib-search">${svg('search')}<span class="t typed">${SEARCH_BOOKS}</span><span class="x">${svg('x')}</span></div>
    <button class="cp-icon-btn flat" aria-label="Bookmarks">${svg('bookmark')}</button>
  </div>
  <p class="lib-count" style="margin:16px 0 0">${esc(searchCountLine(SEARCH_BOOKS))}</p>
${indent(searchBooks(booksFound, SEARCH_ROWS), 2)}
</div>`), 4),
    'bookmarks-kept': `            <p class="bk-cap" style="margin:0">${esc(BOOKMARKS_KEPT)}</p>`,
    'bookmarks-books': indent(`<div class="lib-label">Books · 1</div>\n${rowsCard([KEPT], [KEPT.id], 'padding:4px')}`, 12),
    'bookmarks-passages': indent(`<div class="lib-label">Passages · 1</div>
<div class="cp-card" style="padding:4px">
  <div class="bk-prow"><span class="bk-pt" role="button" aria-label="${esc(`${row.bookTitle}, ${row.label}: ${row.excerpt}`)}"><span class="bn">${esc(row.bookTitle)}</span><span class="pl">${esc(row.label)}</span><span class="px">${esc(row.excerpt)}</span></span><button class="lib-mark on" aria-label="${esc(bookmarkWords(true, `${row.bookTitle}, ${row.label}`))}">${svg('bookmark')}</button></div>
</div>`, 12),
    'diary-note': indent(diaryNotePhone(), 4),
    group: `  ${groupNotes()}\n  ${STYLE}\n  <div class="phones">\n${indent(groupPhones(), 4)}\n  </div>\n  ${SCRIPT}`,
  };
}

/** The page with every region drawn again. A region whose marks are missing (or doubled) is an error: the page and this file have to agree on where things go. */
export function applyRegions(design: string, drawn: Record<RegionName, string> = regions()): string {
  let out = design;
  for (const name of Object.keys(MARKERS) as RegionName[]) {
    const { start, end } = MARKERS[name];
    const a = out.indexOf(start);
    const b = out.indexOf(end);
    if (a < 0 || b < 0 || out.indexOf(start, a + 1) >= 0 || out.indexOf(end, b + 1) >= 0 || b < a) throw new Error(`the page has no (or two) marks for ${name}: ${start.trim()}`);
    out = `${out.slice(0, a + start.length)}\n${drawn[name] ? `${drawn[name]}\n` : ''}${out.slice(b)}`;
  }
  return out;
}

export const DESIGN_PATH = path.join(process.cwd(), '..', 'design', 'index.html');

if (require.main === module) {
  const html = fs.readFileSync(DESIGN_PATH, 'utf8');
  const next = applyRegions(html);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(DESIGN_PATH, next, 'utf8');
    console.log(`drew ${Object.keys(MARKERS).length} regions of ${DESIGN_PATH} (${html === next ? 'nothing changed' : 'changed'})`);
  } else {
    console.log(html === next ? 'design/index.html is what the books make of it' : 'design/index.html is NOT what the books make of it: run again with --write');
    process.exitCode = html === next ? 0 : 1;
  }
}
