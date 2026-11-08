// The tiles of the Bible phones of design/index.html, drawn from the 73 books of the app with the functions the app itself uses to size a tile and to fit a name to it
// (gridMath.ts bookGrid, tileFit.ts fitName, books.ts), so that the page cannot show a size, a line break or a count that the app does not: reader.test.ts draws them
// again on every run and fails when design/index.html is not what the app makes of the books. Before this the tiles were typed into the page and went stale the day the
// sums changed.
//
// The page has marked places, lines like "<!-- Bible tiles: library (start) -->" and "<!-- ... (end) -->" inside a grid, and what this file makes goes between each pair
// (TILES): one grid for each phone that has tiles (the Old Testament, the New Testament with the card that continues, the dark phone, the Deuterocanon and the New
// Testament on a phone 320 wide). The look of a tile (its padding, radius and type, all CSS variables of tokens.css) is in the page's own style, not here.
// To draw the page again after the sums or the books changed (from mobile/):
//   npx tsc -p tsconfig.librarytest.json && node node_modules/.cache/library-test/features/library/__tests__/designBible.js --write
// Without --write it only says whether the page is what the app makes of it.
import fs from 'node:fs';
import path from 'node:path';
import { booksOf, chaptersLabel, type BibleBook, type Testament } from '../bible/books';
import { bookGrid } from '../bible/gridMath';
import { fitName } from '../bible/tileFit';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NBSP = String.fromCharCode(160);
const html = (s: string): string => esc(s).split(NBSP).join('&nbsp;');
/** The same words as tileLabel (BookGrid.tsx), which a screen reader hears: "Genesis, 50 chapters". */
const labelOf = (b: BibleBook): string => `${b.name}, ${chaptersLabel(b.chapters).split(NBSP).join(' ')}`;

/** One tile as the Bible tab draws it on a phone `width` wide: the variant (h4, h5 or h6) and the lines tileFit.ts chose, then the count. */
export function tileHtml(b: BibleBook, width: number): string {
  const fit = fitName(b.name, bookGrid(width).innerWidth);
  return `<button class="lib-tile" aria-label="${esc(labelOf(b))}"><span class="nm ${fit.variant}">${fit.lines.map(esc).join('<br>')}</span><span class="ct">${html(chaptersLabel(b.chapters))}</span></button>`;
}

export type TilesName = 'library' | 'continue' | 'dark' | 'deutero' | 'narrow';

/** Which part of the Bible each grid of the page shows, and how wide the phone is. */
export const TILES: Record<TilesName, { part: Testament; width: number }> = {
  library: { part: 'old', width: 390 },
  continue: { part: 'new', width: 390 },
  dark: { part: 'old', width: 390 },
  deutero: { part: 'deutero', width: 390 },
  narrow: { part: 'new', width: 320 },
};

const INDENT = '            ';

/** The two lines that mark a grid of design/index.html: what is between them is drawn here. */
export const MARKERS = (name: TilesName): { start: string; end: string } => ({ start: `${INDENT}<!-- Bible tiles: ${name} (start) -->`, end: `${INDENT}<!-- Bible tiles: ${name} (end) -->` });

/** What goes between the marks of one grid: a line for each book of the part. */
export const tiles = (name: TilesName): string => booksOf(TILES[name].part).map((b) => `${INDENT}${tileHtml(b, TILES[name].width)}`).join('\n');

/** The page with every grid of tiles drawn again. A grid whose marks are missing (or doubled) is an error: the page and this file have to agree on where things go. */
export function applyTiles(design: string): string {
  let out = design;
  for (const name of Object.keys(TILES) as TilesName[]) {
    const { start, end } = MARKERS(name);
    const a = out.indexOf(start);
    const b = out.indexOf(end);
    if (a < 0 || b < 0 || out.indexOf(start, a + 1) >= 0 || out.indexOf(end, b + 1) >= 0 || b < a) throw new Error(`the page has no (or two) marks for the tiles "${name}": ${start.trim()}`);
    out = `${out.slice(0, a + start.length)}\n${tiles(name)}\n${out.slice(b)}`;
  }
  return out;
}

export const DESIGN_PATH = path.join(process.cwd(), '..', 'design', 'index.html');

if (require.main === module) {
  const page = fs.readFileSync(DESIGN_PATH, 'utf8');
  const next = applyTiles(page);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(DESIGN_PATH, next, 'utf8');
    console.log(`drew ${Object.keys(TILES).length} grids of tiles in ${DESIGN_PATH} (${page === next ? 'nothing changed' : 'changed'})`);
  } else {
    console.log(page === next ? 'design/index.html has the tiles the app draws' : 'design/index.html does NOT have the tiles the app draws: run again with --write');
    process.exitCode = page === next ? 0 : 1;
  }
}
