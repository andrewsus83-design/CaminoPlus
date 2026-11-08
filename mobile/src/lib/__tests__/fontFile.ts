import { readFileSync } from 'node:fs';

// A minimal reader of a TrueType font file (the static Inter, Fraunces and JetBrains Mono files of @expo-google-fonts), for tests only: it reads the real file,
// so a number taken from it is the font's own. It answers three questions in font units: which glyph a character has (the cmap, format 4), how far the glyph
// advances (hmtx), and how far its ink reaches (the bounding box in its glyf record; for a bar such as "l" or "I" that is the width of the stem).
// Kerning (GPOS) is not read: a width worked out from the advances alone is the width without kerning, which is the wider one for nearly every pair.

export type GlyphBox = { xMin: number; yMin: number; xMax: number; yMax: number };
export type FontFile = {
  unitsPerEm: number;
  /** The glyph of a character, 0 (the "missing" glyph) when the font has none. */
  glyphOf: (ch: string) => number;
  /** How far the pen moves after the glyph. */
  advance: (glyph: number) => number;
  /** The box of the glyph's ink; a glyph with no outline (the space) has none and gives zeros. */
  box: (glyph: number) => GlyphBox;
  /** The width of the text in em, from the advances, without kerning. */
  width: (text: string) => number;
  /** The characters of the text that the font has no glyph for. */
  missing: (text: string) => string[];
};

export function readFont(path: string): FontFile {
  const buf = readFileSync(path);
  const tables = new Map<string, number>();
  const count = buf.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    tables.set(buf.toString('latin1', at, at + 4), buf.readUInt32BE(at + 8));
  }
  const table = (tag: string): number => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`${path} has no ${tag} table`);
    return at;
  };
  const head = table('head');
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const longLoca = buf.readInt16BE(head + 50) === 1;
  const metrics = buf.readUInt16BE(table('hhea') + 34); // numberOfHMetrics
  const hmtx = table('hmtx');
  const loca = table('loca');
  const glyf = table('glyf');
  // cmap: the Windows Unicode BMP subtable (platform 3, encoding 1), which is format 4
  const cmap = table('cmap');
  let sub = -1;
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i += 1) {
    const record = cmap + 4 + i * 8;
    if (buf.readUInt16BE(record) === 3 && buf.readUInt16BE(record + 2) === 1) sub = cmap + buf.readUInt32BE(record + 4);
  }
  if (sub < 0 || buf.readUInt16BE(sub) !== 4) throw new Error(`${path} has no format 4 cmap for Unicode`);
  const segments = buf.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  const glyphOf = (ch: string): number => {
    const code = ch.codePointAt(0)!;
    for (let s = 0; s < segments; s += 1) {
      if (buf.readUInt16BE(ends + s * 2) < code) continue;
      const start = buf.readUInt16BE(starts + s * 2);
      if (start > code) return 0;
      const delta = buf.readUInt16BE(deltas + s * 2);
      const offset = buf.readUInt16BE(offsets + s * 2);
      if (offset === 0) return (code + delta) & 0xffff;
      const glyph = buf.readUInt16BE(offsets + s * 2 + offset + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
  const advance = (glyph: number): number => buf.readUInt16BE(hmtx + Math.min(glyph, metrics - 1) * 4);
  const box = (glyph: number): GlyphBox => {
    const at = longLoca ? buf.readUInt32BE(loca + glyph * 4) : buf.readUInt16BE(loca + glyph * 2) * 2;
    const next = longLoca ? buf.readUInt32BE(loca + glyph * 4 + 4) : buf.readUInt16BE(loca + glyph * 2 + 2) * 2;
    if (next === at) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    return { xMin: buf.readInt16BE(glyf + at + 2), yMin: buf.readInt16BE(glyf + at + 4), xMax: buf.readInt16BE(glyf + at + 6), yMax: buf.readInt16BE(glyf + at + 8) };
  };
  const width = (text: string): number => [...text].reduce((sum, ch) => sum + advance(glyphOf(ch)), 0) / unitsPerEm;
  const missing = (text: string): string[] => [...new Set([...text].filter((ch) => glyphOf(ch) === 0))];
  return { unitsPerEm, glyphOf, advance, box, width, missing };
}

const PACKAGES: Record<string, string> = { Inter: 'inter', Fraunces: 'fraunces', JetBrainsMono: 'jetbrains-mono', Caveat: 'caveat' };

/** The file of an @expo-google-fonts font by the name the app loads it under ("Inter_300Light" is node_modules/@expo-google-fonts/inter/300Light/Inter_300Light.ttf). */
export function fontPath(root: string, family: string): string {
  const [name, style] = family.split('_');
  if (!PACKAGES[name] || !style) throw new Error(`${family} is not one of the four families of the app`);
  return `${root}/node_modules/@expo-google-fonts/${PACKAGES[name]}/${style}/${family}.ttf`;
}
