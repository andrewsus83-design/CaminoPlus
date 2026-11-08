// Removes the place where a clip was recorded from an MP4 or MOV file before it leaves the phone. Pure, checked by
// src/lib/__tests__/media.test.ts on constructed MP4 and MOV files.
//
// Phones write the position into the movie's header box (moov), not into the picture data:
// - QuickTime / Android: moov/udta/©xyz ("+42.8800-008.5450/"), sometimes also inside trak/udta;
// - iPhone: moov/meta, the item named com.apple.quicktime.location.ISO6709 (keys + ilst);
// - 3GPP: moov/udta/loci.
// Only the box headers are read: the walk jumps over the picture data (mdat) by its size, so a 45 MB clip costs almost
// nothing. The values are overwritten with the same number of neutral bytes (spaces, or zeros for loci), so no box and
// no offset moves (the chunk offsets in stco / co64 stay right) and the clip plays as before.
// The bytes are changed IN PLACE (a clip can be 45 MB; a copy would double the memory).

const SPACE = 0x20;

type Box = { type: string; start: number; body: number; end: number };

const typeAt = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);

/** The boxes between `from` and `to`; stops at the first header that does not make sense. */
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = u32(b, at + 8) * 0x100000000 + u32(b, at + 12);
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) break;
    out.push({ type: typeAt(b, at + 4), start: at, body, end: at + size });
    at += size;
  }
  return out;
}

/** Does this look like an MP4 / MOV file (ISO base media)? */
export function isIsoMedia(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const t = typeAt(b, 4);
  return t === 'ftyp' || t === 'moov' || t === 'mdat' || t === 'wide' || t === 'free' || t === 'skip';
}

const XYZ = '©xyz';
const isLocationKey = (key: string) => /location/i.test(key);

function blankDataBoxes(b: Uint8Array, from: number, to: number): number {
  let n = 0;
  for (const d of boxes(b, from, to)) {
    if (d.type !== 'data' || d.body + 8 > d.end) continue;
    b.fill(SPACE, d.body + 8, d.end); // after the type indicator and the locale: the value itself
    n += 1;
  }
  return n;
}

/** ©xyz in udta: QuickTime text (length, language, text) or an iTunes-style box holding a data box. */
function blankXyz(b: Uint8Array, box: Box): number {
  if (box.body + 8 <= box.end && typeAt(b, box.body + 4) === 'data') return blankDataBoxes(b, box.body, box.end);
  const text = Math.min(box.end, box.body + 4);
  b.fill(SPACE, text, box.end);
  return box.end > text ? 1 : 0;
}

function walkMeta(b: Uint8Array, meta: Box): number {
  // ISO meta is a full box (4 bytes of version and flags before its children); QuickTime meta is not.
  const full = meta.body + 12 <= meta.end && u32(b, meta.body) === 0 && typeAt(b, meta.body + 8) === 'hdlr';
  const children = boxes(b, full ? meta.body + 4 : meta.body, meta.end);
  const wanted = new Set<number>();
  for (const c of children) {
    if (c.type !== 'keys' || c.body + 8 > c.end) continue;
    const count = u32(b, c.body + 4);
    let at = c.body + 8;
    for (let i = 1; i <= count && at + 8 <= c.end; i++) {
      const size = u32(b, at);
      if (size < 8 || at + size > c.end) break;
      if (size <= 520 && isLocationKey(String.fromCharCode(...b.subarray(at + 8, at + size)))) wanted.add(i);
      at += size;
    }
  }
  let n = 0;
  for (const c of children) {
    if (c.type !== 'ilst') continue;
    for (const item of boxes(b, c.body, c.end)) {
      const index = u32(b, item.start + 4);
      if (wanted.has(index) || item.type === XYZ) n += blankDataBoxes(b, item.body, item.end);
    }
  }
  return n;
}

function walk(b: Uint8Array, from: number, to: number, depth: number): number {
  if (depth > 6) return 0;
  let n = 0;
  for (const box of boxes(b, from, to)) {
    if (box.type === 'mdat') continue;
    if (box.type === XYZ) n += blankXyz(b, box);
    else if (box.type === 'loci') { if (box.body + 6 < box.end) { b.fill(0, box.body + 6, box.end); n += 1; } }
    else if (box.type === 'meta') n += walkMeta(b, box);
    else if (box.type === 'moov' || box.type === 'trak' || box.type === 'udta') n += walk(b, box.body, box.end, depth + 1);
  }
  return n;
}

/** Overwrite the recording place of an MP4 / MOV in place. Anything else is left alone. `removed`: something was there. */
export function stripVideoLocation(b: Uint8Array): { bytes: Uint8Array; removed: boolean } {
  if (!isIsoMedia(b)) return { bytes: b, removed: false };
  return { bytes: b, removed: walk(b, 0, b.length, 0) > 0 };
}
