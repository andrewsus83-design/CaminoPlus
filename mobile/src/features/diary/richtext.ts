// Rich text of a diary page, as plain logic (no React, no React Native): a small Markdown-style subset kept inside the page's own
// `body` string, and the few things that are done to it. Plain node tests cover all of it (npm run test:diary).
//
// What is written, and what a person may also type by hand:
//   **bold**   _italic_   "# " a heading (one level)   "- " a bullet (also "* ")   "> " a quote
// A pair of marks only counts when it hugs its text (no space just inside it), stays on one line and is closed; an underscore
// next to a letter is just an underscore (ana_torres_88 is not italic). Anything else is plain text and shows as it was typed.
// A block mark counts at the very start of a line, followed by one space. Every line break is kept: what the page looks like
// when it is read is what the person typed.
//
// Never trust stored text: nothing here throws, whatever the string is, and every function is linear (or close to it) in the
// length of the text, so twenty thousand characters cost no more than a blink.
//
// Editing (the toolbar above the keyboard) works on a selection {start, end} in UTF-16 offsets, like a TextInput reports it:
//   toggleInline   bold / italic on the selection (or on the word at the caret): wraps what is not yet marked, unwraps what is
//   toggleBlock    heading / bullet / quote on the lines the selection touches
//   continueList   the Return key inside a bullet starts the next bullet, and Return on an empty bullet ends the list
// They answer { text, selection } or null (nothing to do, or it would not fit). They never change a word: the plain text of the
// page is the same before and after, only the marks around it move.

export type Sel = { start: number; end: number };
export type Edit = { text: string; selection: Sel };
export type Span = { text: string; bold: boolean; italic: boolean };
export type BlockKind = 'p' | 'h' | 'li' | 'q' | 'gap';
export type Block = { kind: BlockKind; spans: Span[] };
export type InlineFormat = 'bold' | 'italic';
export type BlockFormat = 'heading' | 'bullet' | 'quote';
export type Formats = { bold: boolean; italic: boolean; heading: boolean; bullet: boolean; quote: boolean };

const BOLD = '**';
const ITALIC = '_';
const BLOCK_MARK: Record<BlockFormat, string> = { heading: '# ', bullet: '- ', quote: '> ' };
const BLOCK_KIND: Record<BlockFormat, BlockKind> = { heading: 'h', bullet: 'li', quote: 'q' };

/* ------------------------------------------------------------------------------------------------ characters */

const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number) => u >= 0xdc00 && u <= 0xdfff;

/** JavaScript's own idea of white space (what /\s/ matches), by UTF-16 unit. */
const isSpaceUnit = (u: number) =>
  u === 32 || (u >= 9 && u <= 13) || u === 0xa0 || u === 0x1680 || (u >= 0x2000 && u <= 0x200a) || u === 0x2028 || u === 0x2029 || u === 0x202f || u === 0x205f || u === 0x3000 || u === 0xfeff;

/** A letter or a digit of any script, near enough: it decides whether an underscore sits inside a word. Emoji and punctuation are not. */
const isWordUnit = (u: number) =>
  (u >= 48 && u <= 57) || (u >= 65 && u <= 90) || (u >= 97 && u <= 122) || u === 0xaa || u === 0xb5 || u === 0xba ||
  (u >= 0xc0 && u <= 0x24f && u !== 0xd7 && u !== 0xf7) || (u >= 0x300 && u <= 0x36f) || (u >= 0x370 && u <= 0x1fff) ||
  (u >= 0x3040 && u <= 0xd7ff && !(u >= 0x3000 && u <= 0x303f)) || (u >= 0xf900 && u <= 0xfaff) || (u >= 0xff10 && u <= 0xff19) || (u >= 0xff21 && u <= 0xff3a) || (u >= 0xff41 && u <= 0xff5a);

/**
 * A code point that belongs to the one before it, so a mark must never be put in front of it: the second half of a surrogate
 * pair, a combining mark, a variation selector, a zero width joiner (and what follows one), a skin tone, an emoji tag.
 */
function continues(text: string, i: number): boolean {
  const u = text.charCodeAt(i);
  if (isLow(u) && i > 0 && isHigh(text.charCodeAt(i - 1))) return true;
  const cp = text.codePointAt(i) ?? u;
  if (cp === 0x200d || (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f)) return true;
  if ((cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
  if (i > 0) {
    const before = i >= 2 && isLow(text.charCodeAt(i - 1)) && isHigh(text.charCodeAt(i - 2)) ? i - 2 : i - 1;
    if ((text.codePointAt(before) ?? 0) === 0x200d) return true;
  }
  return false;
}
const prevStart = (text: string, i: number) => (i >= 2 && isLow(text.charCodeAt(i - 1)) && isHigh(text.charCodeAt(i - 2)) ? i - 2 : i - 1);
const nextStart = (text: string, i: number) => (isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1)) ? i + 2 : i + 1);
function snapLeft(text: string, i: number): number {
  let at = i;
  while (at > 0 && at < text.length && continues(text, at)) at = prevStart(text, at);
  return at;
}
function snapRight(text: string, i: number): number {
  let at = i;
  while (at > 0 && at < text.length && continues(text, at)) at = nextStart(text, at);
  return at;
}

/** A selection that is a whole number inside the text, the right way round, and never in the middle of an emoji. */
function normalize(text: string, sel: Sel): Sel {
  const n = text.length;
  const clamp = (v: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), n) : 0);
  let a = clamp(sel?.start);
  let b = clamp(sel?.end);
  if (a > b) [a, b] = [b, a];
  if (a === b) { const at = snapLeft(text, a); return { start: at, end: at }; }
  return { start: snapLeft(text, a), end: snapRight(text, b) };
}

/* ------------------------------------------------------------------------------------------------ lines */

type Line = { start: number; end: number; eol: number; kind: BlockKind; prefix: number };

/** Which block a line is, and how long its mark is (0 for a plain line). A line that is only white space is a gap. */
function blockOf(text: string, start: number, end: number): { kind: BlockKind; prefix: number } {
  if (end - start >= 2 && text.charCodeAt(start + 1) === 32) {
    const c = text.charCodeAt(start);
    if (c === 35) return { kind: 'h', prefix: 2 };
    if (c === 45 || c === 42) return { kind: 'li', prefix: 2 };
    if (c === 62) return { kind: 'q', prefix: 2 };
  }
  for (let i = start; i < end; i++) if (!isSpaceUnit(text.charCodeAt(i))) return { kind: 'p', prefix: 0 };
  return { kind: 'gap', prefix: 0 };
}

/** Every line of the text: where its content is (start..end, without the line break) and how long the line break after it is. */
function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl < 0) { out.push({ start, end: text.length, eol: 0, ...blockOf(text, start, text.length) }); break; }
    const end = nl > start && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    out.push({ start, end, eol: nl + 1 - end, ...blockOf(text, start, end) });
    start = nl + 1;
  }
  return out;
}

/** The index of the line a position is on (a position right after a line break is on the next line). */
function lineIndexAt(lines: Line[], pos: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].start <= pos) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The one line a position is on, found without looking at the rest of the text. */
function lineAtPos(text: string, pos: number): Line {
  const nl = pos > 0 ? text.lastIndexOf('\n', pos - 1) : -1;
  const start = nl + 1;
  const next = text.indexOf('\n', start);
  const hardEnd = next < 0 ? text.length : next;
  const end = next > start && text.charCodeAt(next - 1) === 13 ? next - 1 : hardEnd;
  return { start, end, eol: next < 0 ? 0 : next + 1 - end, ...blockOf(text, start, end) };
}

/* ------------------------------------------------------------------------------------------------ reading: marks to cells */

type Cell = { ch: string; bold: boolean; italic: boolean; s: number; e: number };

const findBoldClose = (s: string, from: number, to: number): number => {
  for (let j = from; j + 1 < to; j++) if (s.charCodeAt(j) === 42 && s.charCodeAt(j + 1) === 42 && !isSpaceUnit(s.charCodeAt(j - 1))) return j;
  return -1;
};
const findItalicClose = (s: string, from: number, to: number): number => {
  for (let j = from; j < to; j++) {
    if (s.charCodeAt(j) !== 95) continue;
    const before = s.charCodeAt(j - 1);
    if (isSpaceUnit(before) || before === 95) continue;
    if (j + 1 < to && isWordUnit(s.charCodeAt(j + 1))) continue;
    return j;
  }
  return -1;
};

/**
 * The characters of s[from, to) one by one, each with the marks it sits in and where it stands in s. Marks that pair up are
 * consumed (they have no cell); everything else is a cell of its own, so no character is ever lost or invented. Bold can hold
 * italic and italic can hold bold; a mark of the kind already open is plain text. A search that found no closing mark is not
 * repeated for the openers after it, which keeps a line of nothing but unclosed marks linear.
 */
function parseRange(s: string, from: number, to: number, bold: boolean, italic: boolean, out: Cell[]): void {
  let noBoldFrom = Infinity;
  let noItalicFrom = Infinity;
  let i = from;
  while (i < to) {
    const u = s.charCodeAt(i);
    if (u === 42 && !bold && i + 2 < to && s.charCodeAt(i + 1) === 42 && !isSpaceUnit(s.charCodeAt(i + 2)) && i + 3 < noBoldFrom) {
      const j = findBoldClose(s, i + 3, to);
      if (j >= 0) { parseRange(s, i + 2, j, true, italic, out); i = j + 2; continue; }
      noBoldFrom = i + 3;
    } else if (u === 95 && !italic && i + 2 < to && i + 2 < noItalicFrom) {
      const next = s.charCodeAt(i + 1);
      if (!isSpaceUnit(next) && next !== 95 && (i === from || !isWordUnit(s.charCodeAt(i - 1)))) {
        const j = findItalicClose(s, i + 2, to);
        if (j >= 0) { parseRange(s, i + 1, j, bold, true, out); i = j + 1; continue; }
        noItalicFrom = i + 2;
      }
    }
    const cp = s.codePointAt(i) ?? u;
    const n = cp > 0xffff ? 2 : 1;
    out.push({ ch: s.slice(i, i + n), bold, italic, s: i, e: i + n });
    i += n;
  }
}

const cellsOf = (content: string): Cell[] => {
  const out: Cell[] = [];
  parseRange(content, 0, content.length, false, false, out);
  return out;
};

const spansOf = (cells: Cell[]): Span[] => {
  const spans: Span[] = [];
  for (const c of cells) {
    const last = spans[spans.length - 1];
    if (last && last.bold === c.bold && last.italic === c.italic) last.text += c.ch;
    else spans.push({ text: c.ch, bold: c.bold, italic: c.italic });
  }
  return spans;
};

const isSpaceCell = (c: Cell) => isSpaceUnit(c.ch.charCodeAt(0));

function blockAt(text: string, line: Line): Block {
  if (line.kind === 'gap') return { kind: 'gap', spans: [] };
  const spans = spansOf(cellsOf(text.slice(line.start + line.prefix, line.end)));
  // A mark with nothing after it ("- " just typed) draws nothing yet.
  if (line.kind !== 'p' && !spans.some((s) => /\S/.test(s.text))) return { kind: 'gap', spans: [] };
  return { kind: line.kind, spans };
}

/** The page as blocks, one per line, for drawing it. Never throws, whatever the string is. */
export function parseRich(text: unknown): Block[] {
  if (typeof text !== 'string' || text === '') return [];
  return linesOf(text).map((line) => blockAt(text, line));
}

const plainOfBlock = (b: Block) => b.spans.map((s) => s.text).join('');

/**
 * The words of the page without any mark, one line per line: what a list preview or a page name shows. With `maxChars` it stops
 * reading once that many characters are in hand (a preview of a page never needs the rest), so it costs the same on a long page.
 */
export function plainText(text: unknown, maxChars = Infinity): string {
  if (typeof text !== 'string' || text === '') return '';
  const out: string[] = [];
  let have = 0;
  let start = 0;
  while (start <= text.length && have < maxChars) {
    const nl = text.indexOf('\n', start);
    const hardEnd = nl < 0 ? text.length : nl;
    const end = nl > start && text.charCodeAt(nl - 1) === 13 ? nl - 1 : hardEnd;
    const line = plainOfBlock(blockAt(text, { start, end, eol: 0, ...blockOf(text, start, end) }));
    out.push(line);
    have += line.length + 1;
    if (nl < 0) break;
    start = nl + 1;
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------------------------------------ writing: cells back to marks */

/**
 * The line as text again: bold runs in `**`, italic runs in `_`, bold outside italic. White space at the edge of a run stays
 * outside its marks (a mark must hug its text to count), and a run of nothing but white space has no marks at all.
 */
function serialize(cells: Cell[]): { out: string; pos: number[] } {
  let out = '';
  const pos: number[] = new Array(cells.length);
  const put = (from: number, to: number) => { for (let k = from; k < to; k++) { pos[k] = out.length; out += cells[k].ch; } };
  const trimmed = (from: number, to: number): [number, number] => {
    let a = from;
    let b = to;
    while (a < b && isSpaceCell(cells[a])) a++;
    while (b > a && isSpaceCell(cells[b - 1])) b--;
    return [a, b];
  };
  const italics = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      let j = i;
      const on = cells[i].italic;
      while (j < to && cells[j].italic === on) j++;
      if (!on) { put(i, j); i = j; continue; }
      const [a, b] = trimmed(i, j);
      put(i, a);
      if (a < b) { out += ITALIC; put(a, b); out += ITALIC; }
      put(b, j);
      i = j;
    }
  };
  let i = 0;
  while (i < cells.length) {
    let j = i;
    const on = cells[i].bold;
    while (j < cells.length && cells[j].bold === on) j++;
    if (!on) { italics(i, j); i = j; continue; }
    const [a, b] = trimmed(i, j);
    italics(i, a);
    if (a < b) { out += BOLD; italics(a, b); out += BOLD; }
    italics(b, j);
    i = j;
  }
  return { out, pos };
}

const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && a.every((c, k) => c.ch === b[k].ch && c.bold === b[k].bold && c.italic === b[k].italic);

/** The word (letters and digits) the caret touches, within one line's content, or null. */
function wordAt(text: string, line: Line, pos: number): { a: number; b: number } | null {
  const lo = line.start + line.prefix;
  let a = pos;
  let b = pos;
  while (a > lo && isWordUnit(text.charCodeAt(a - 1))) a--;
  while (b < line.end && isWordUnit(text.charCodeAt(b))) b++;
  return a === b ? null : { a, b };
}

/** Italic is only drawn at the edge of a word, so a selection that ends inside a word reaches out to the whole word. */
function toWholeWords(text: string, lines: Line[], sel: Sel): Sel {
  let { start, end } = sel;
  const first = lines[lineIndexAt(lines, start)];
  const last = lines[lineIndexAt(lines, end)];
  while (start > first.start + first.prefix && isWordUnit(text.charCodeAt(start)) && isWordUnit(text.charCodeAt(start - 1))) start--;
  while (end < last.end && isWordUnit(text.charCodeAt(end - 1)) && isWordUnit(text.charCodeAt(end))) end++;
  return { start: snapLeft(text, start), end: snapRight(text, end) };
}

type Work = { idx: number; cells: Cell[]; cs: number; lo: number; hi: number };
type Rewrite = { out: string; pos: number[]; cells: Cell[]; cs: number };

/**
 * Bold or italic on a selection. With nothing selected it works on the word at the caret, or, away from any word, puts a pair of
 * marks at the caret and the caret between them (and removes that empty pair again). A selection across lines is done line by
 * line, since a mark never crosses a line. If everything selected already has the format it is taken off, otherwise it is put on
 * all of it. The result is checked: if the marks would not read back as intended (stray marks typed by hand next to it) nothing
 * changes and the answer is null.
 */
export function toggleInline(text: string, selection: Sel, format: InlineFormat, max = Infinity): Edit | null {
  if (typeof text !== 'string') return null;
  const mark = format === 'bold' ? BOLD : ITALIC;
  let sel = normalize(text, selection);
  const lines = linesOf(text);
  let caret: number | null = null;
  let word: { a: number; b: number } | null = null;

  if (sel.start === sel.end) {
    const line = lines[lineIndexAt(lines, sel.start)];
    const cs = line.start + line.prefix;
    const at = sel.start;
    if (at - mark.length >= cs && at + mark.length <= line.end && text.startsWith(mark, at - mark.length) && text.startsWith(mark, at)) {
      const out = text.slice(0, at - mark.length) + text.slice(at + mark.length);
      return { text: out, selection: { start: at - mark.length, end: at - mark.length } };
    }
    word = wordAt(text, line, at);
    if (!word) {
      if (text.length + 2 * mark.length > max) return null;
      const where = Math.max(at, cs);
      const out = text.slice(0, where) + mark + mark + text.slice(where);
      return { text: out, selection: { start: where + mark.length, end: where + mark.length } };
    }
    caret = at;
    sel = { start: word.a, end: word.b };
  } else if (format === 'italic') {
    sel = toWholeWords(text, lines, sel);
  }

  const first = lineIndexAt(lines, sel.start);
  let last = lineIndexAt(lines, sel.end);
  if (last > first && sel.end === lines[last].start) last -= 1; // a selection that ends at the start of a line does not touch it

  const works: Work[] = [];
  for (let k = first; k <= last; k++) {
    const line = lines[k];
    if (line.kind === 'gap') continue;
    const cs = line.start + line.prefix;
    const cells = cellsOf(text.slice(cs, line.end));
    let lo = -1;
    let hi = -1;
    for (let c = 0; c < cells.length; c++) {
      if (cs + cells[c].s >= sel.start && cs + cells[c].e <= sel.end) { if (lo < 0) lo = c; hi = c + 1; }
    }
    if (lo >= 0) works.push({ idx: k, cells, cs, lo, hi });
  }

  // what is selected, without the white space at the edges of each line's part
  const ranges = works.map((w) => {
    let a = w.lo;
    let b = w.hi;
    while (a < b && isSpaceCell(w.cells[a])) a++;
    while (b > a && isSpaceCell(w.cells[b - 1])) b--;
    return [a, b] as const;
  });
  let any = false;
  let all = true;
  works.forEach((w, k) => {
    for (let c = ranges[k][0]; c < ranges[k][1]; c++) {
      if (isSpaceCell(w.cells[c])) continue;
      any = true;
      if (!w.cells[c][format]) all = false;
    }
  });
  if (!any) return null;

  const rewrites = new Map<number, Rewrite>();
  for (let k = 0; k < works.length; k++) {
    const w = works[k];
    const [a, b] = ranges[k];
    const cells = w.cells.map((c) => ({ ...c }));
    let changed = false;
    for (let c = a; c < b; c++) {
      if (cells[c][format] === !all) continue;
      cells[c][format] = !all;
      changed = true;
    }
    if (!changed) continue;
    const ser = serialize(cells);
    if (!sameCells(cellsOf(ser.out), cells)) return null; // would not read back as intended: leave the words exactly as they are
    rewrites.set(w.idx, { out: ser.out, pos: ser.pos, cells, cs: w.cs });
  }
  if (rewrites.size === 0) return null;

  const starts: number[] = [];
  const pieces: string[] = [];
  let total = 0;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    starts.push(total);
    const rw = rewrites.get(k);
    const piece = rw ? text.slice(line.start, rw.cs) + rw.out + text.slice(line.end, line.end + line.eol) : text.slice(line.start, line.end + line.eol);
    pieces.push(piece);
    total += piece.length;
  }
  if (total > max && total > text.length) return null;

  // where an offset of the old text is in the new one: before the marks of what follows it (start), or after the text it follows (end)
  const map = (old: number, side: 'start' | 'end'): number => {
    const k = lineIndexAt(lines, old);
    const line = lines[k];
    const rw = rewrites.get(k);
    const shift = starts[k] - line.start;
    if (!rw || old <= rw.cs) return old + shift;
    const rel = old - rw.cs;
    if (old > line.end) return starts[k] + (rw.cs - line.start) + rw.out.length + (old - line.end);
    const base = starts[k] + (rw.cs - line.start);
    if (side === 'start') {
      const c = rw.cells.findIndex((cell) => cell.s >= rel);
      return base + (c < 0 ? rw.out.length : rw.pos[c]);
    }
    let c = -1;
    for (let q = rw.cells.length - 1; q >= 0; q--) if (rw.cells[q].e <= rel) { c = q; break; }
    return base + (c < 0 ? 0 : rw.pos[c] + rw.cells[c].ch.length);
  };

  const outText = pieces.join('');
  if (caret !== null && word) {
    const at = map(caret, caret === word.b ? 'end' : 'start');
    return { text: outText, selection: { start: at, end: at } };
  }
  const start = map(sel.start, 'start');
  const end = Math.max(start, map(sel.end, 'end'));
  return { text: outText, selection: { start, end } };
}

/**
 * Heading, bullet or quote on the lines the selection touches (the line the caret is on when nothing is selected). If every one
 * of those lines already has it, it is taken off; otherwise it is put on each of them, replacing another block mark. Blank lines
 * are skipped, unless they are all there is.
 */
export function toggleBlock(text: string, selection: Sel, format: BlockFormat, max = Infinity): Edit | null {
  if (typeof text !== 'string') return null;
  const sel = normalize(text, selection);
  const lines = linesOf(text);
  const first = lineIndexAt(lines, sel.start);
  let last = lineIndexAt(lines, sel.end);
  if (last > first && sel.end === lines[last].start) last -= 1;
  const touched = lines.slice(first, last + 1);
  const live = touched.filter((l) => l.kind !== 'gap');
  const targets = live.length > 0 ? live : touched;
  const want = BLOCK_KIND[format];
  const off = targets.every((l) => l.kind === want);
  const mark = off ? '' : BLOCK_MARK[format];

  const edits = new Map<number, { line: Line; old: string }>();
  for (const line of targets) {
    const old = text.slice(line.start, line.start + line.prefix);
    if (old !== mark) edits.set(line.start, { line, old });
  }
  if (edits.size === 0) return null;

  let out = '';
  let from = 0;
  for (const { line, old } of edits.values()) {
    out += text.slice(from, line.start) + mark;
    from = line.start + old.length;
  }
  out += text.slice(from);
  if (out.length > max && out.length > text.length) return null;

  const map = (pos: number): number => {
    let shift = 0;
    for (const { line, old } of edits.values()) {
      if (pos > line.start + old.length) { shift += mark.length - old.length; continue; }
      if (pos < line.start) break;
      // at the start of the line, or inside or just after its old mark: behind the new mark (before it when there is none)
      const inside = pos - line.start;
      const within = inside === 0 ? mark.length : Math.min(Math.max(inside - old.length + mark.length, 0), mark.length);
      return line.start + shift + within;
    }
    return pos + shift;
  };
  return { text: out, selection: { start: map(sel.start), end: Math.max(map(sel.start), map(sel.end)) } };
}

/**
 * The Return key. `prev` is the text before the key, `next` what the field holds after it; when the key put one line break into
 * a bullet line the next bullet is started ("- " goes after the break, the caret behind it), and a line break typed on an empty
 * bullet ends the list instead (the mark goes, and no break is added). Anything else is not for this function (null): the field
 * keeps what the person typed. `caret` is where the caret was before the key, to tell apart the places a repeated line break
 * could have gone.
 */
export function continueList(prev: string, next: string, caret?: number, max = Infinity): Edit | null {
  if (typeof prev !== 'string' || typeof next !== 'string' || next.length !== prev.length + 1) return null;
  let at = -1;
  if (typeof caret === 'number' && Number.isInteger(caret) && caret >= 0 && caret <= prev.length && next.charCodeAt(caret) === 10 && next.slice(0, caret) + next.slice(caret + 1) === prev) at = caret;
  if (at < 0) {
    let p = 0;
    while (p < prev.length && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
    if (next.charCodeAt(p) !== 10 || next.slice(0, p) + next.slice(p + 1) !== prev) return null;
    at = p;
  }
  const line = lineAtPos(prev, at);
  if (line.kind !== 'li' || at < line.start + line.prefix) return null;
  const mark = prev.slice(line.start, line.start + line.prefix);
  const before = prev.slice(line.start + line.prefix, at);
  const after = prev.slice(at, line.end);
  if (!/\S/.test(before) && !/\S/.test(after)) {
    // Return on an empty bullet: the list ends here
    const out = prev.slice(0, line.start) + prev.slice(line.end);
    return { text: out, selection: { start: line.start, end: line.start } };
  }
  const out = next.slice(0, at + 1) + mark + next.slice(at + 1);
  if (out.length > max) return null;
  const c = at + 1 + mark.length;
  return { text: out, selection: { start: c, end: c } };
}

/** Which formats are on where the caret is (or all through the selection): for the pressed look of the toolbar buttons. */
export function formatsAt(text: string, selection: Sel): Formats {
  const none: Formats = { bold: false, italic: false, heading: false, bullet: false, quote: false };
  if (typeof text !== 'string' || text === '') return none;
  const sel = normalize(text, selection);
  const first = lineAtPos(text, sel.start);
  const firstLine: Line[] = [first];
  let lines = firstLine;
  if (sel.end > first.end + first.eol) {
    const all = linesOf(text);
    let last = lineIndexAt(all, sel.end);
    const from = lineIndexAt(all, sel.start);
    if (last > from && sel.end === all[last].start) last -= 1;
    lines = all.slice(from, last + 1);
  }
  const live = lines.filter((l) => l.kind !== 'gap');
  const blockIs = (kind: BlockKind) => live.length > 0 && live.every((l) => l.kind === kind);

  let bold = false;
  let italic = false;
  if (sel.start === sel.end) {
    // the character before the caret decides (what typing there would continue); at the start of a line, the one after it
    const cs = first.start + first.prefix;
    if (first.kind !== 'gap' && sel.start >= cs) {
      const cells = cellsOf(text.slice(cs, first.end));
      const rel = sel.start - cs;
      const cell = cells.find((c) => c.s < rel && rel <= c.e) ?? cells.find((c) => c.s === rel);
      if (cell) { bold = cell.bold; italic = cell.italic; }
    }
  } else {
    let any = false;
    bold = true;
    italic = true;
    for (const line of lines) {
      if (line.kind === 'gap') continue;
      const cs = line.start + line.prefix;
      for (const cell of cellsOf(text.slice(cs, line.end))) {
        if (cs + cell.s < sel.start || cs + cell.e > sel.end || isSpaceCell(cell)) continue;
        any = true;
        if (!cell.bold) bold = false;
        if (!cell.italic) italic = false;
      }
    }
    if (!any) { bold = false; italic = false; }
  }
  return { bold, italic, heading: blockIs('h'), bullet: blockIs('li'), quote: blockIs('q') };
}
