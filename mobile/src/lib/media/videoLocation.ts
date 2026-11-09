// Removes the place where a clip was recorded from an MP4 or MOV file before it leaves the phone. Pure, checked by
// src/lib/__tests__/mediaLocation.test.ts on clips made with ffmpeg and on broken ones (fixtures/video).
//
// Phones write the position into the movie's header box (moov), not into the picture data:
// - QuickTime / Android: moov/udta/©xyz ("+42.8800-008.5450/"), sometimes also inside trak/udta or an iTunes-style
//   udta/meta/ilst/©xyz;
// - iPhone: moov/meta, the item named com.apple.quicktime.location.ISO6709 (keys + ilst);
// - 3GPP: moov/udta/loci;
// - XMP: udta/XMP_, or a top-level uuid box with the XMP uuid (it can hold exif:GPSLatitude).
// Only the box headers are read: the walk jumps over the picture data (mdat) by its size. The values are overwritten
// with the same number of neutral bytes (©xyz, loci and XMP_ become `free` boxes of zeros; the meta values become spaces),
// so no box and no offset moves (the chunk offsets in
// stco / co64 stay right) and the clip plays as before. The bytes are changed IN PLACE (a clip can be 45 MB).
//
// A file whose boxes do not add up (cut short, a size that lies, nesting deeper than we read) is not "clean": `complete`
// is false and clean.ts refuses it, because a position may sit in the part we could not read. After cleaning, everything
// outside the picture data is searched once more for a position or XMP GPS text; any left also makes it incomplete.

const SPACE = 0x20;
const MAX_DEPTH = 8;
/** HEIF / AVIF still-image brands: such a file is a photo (with EXIF), never a clip. */
const STILL_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);
/** The uuid of an XMP box in an ISO media file (BE7ACFCB-97A9-42E8-9C71-999491E3AFAC). */
const XMP_UUID = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac];

type Box = { type: string; start: number; body: number; end: number };

const typeAt = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);

class Incomplete extends Error {}

/** The boxes between `from` and `to`. Throws Incomplete unless they fill the range exactly. */
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
  // QuickTime may end a list of boxes with a 32-bit zero; any other leftover means the sizes do not add up.
  if (at !== to && !(to - at < 8 && b.subarray(at, to).every((x) => x === 0))) throw new Incomplete();
  return out;
}

/** Does this look like an MP4 / MOV clip (ISO base media, and not a HEIF / AVIF photo)? */
export function isIsoMedia(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const t = typeAt(b, 4);
  if (t === 'ftyp') {
    const size = Math.min(u32(b, 0), b.length);
    if (STILL_BRANDS.has(typeAt(b, 8))) return false;
    for (let at = 16; at + 4 <= size; at += 4) if (STILL_BRANDS.has(typeAt(b, at))) return false;
    return true;
  }
  return t === 'moov' || t === 'mdat' || t === 'wide' || t === 'free' || t === 'skip';
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

/** Turn a box into a `free` box of the same size (readers skip it), its content overwritten with `fill`. */
function toFree(b: Uint8Array, box: Box, fill: number) {
  b[box.start + 4] = 0x66; b[box.start + 5] = 0x72; b[box.start + 6] = 0x65; b[box.start + 7] = 0x65; // 'free'
  b.fill(fill, box.body, box.end);
}

function walkMeta(b: Uint8Array, meta: Box): number {
  // ISO meta is a full box (4 bytes of version and flags before its children); QuickTime meta is not.
  const full = meta.body + 12 <= meta.end && u32(b, meta.body) === 0 && typeAt(b, meta.body + 8) === 'hdlr';
  const children = boxes(b, full ? meta.body + 4 : meta.body, meta.end);
  const wanted = new Set<number>();
  for (const c of children) {
    if (c.type !== 'keys') continue;
    if (c.body + 8 > c.end) throw new Incomplete();
    const count = u32(b, c.body + 4);
    let at = c.body + 8;
    for (let i = 1; i <= count; i++) {
      const size = at + 8 <= c.end ? u32(b, at) : 0;
      if (size < 8 || at + size > c.end) throw new Incomplete(); // a key we cannot read may be the location
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

const isXmpUuid = (b: Uint8Array, box: Box) => box.body + 16 <= box.end && XMP_UUID.every((v, i) => b[box.body + i] === v);

function walk(b: Uint8Array, from: number, to: number, depth: number): number {
  if (depth > MAX_DEPTH) throw new Incomplete();
  let n = 0;
  for (const box of boxes(b, from, to)) {
    if (box.type === 'mdat') continue;
    // gone, not just emptied: a loci of zeros would read as a real place (0° N 0° E)
    if (box.type === XYZ || box.type === 'loci' || box.type === 'XMP_') { toFree(b, box, 0); n += 1; }
    else if (box.type === 'uuid' && isXmpUuid(b, box)) { b.fill(SPACE, box.body + 16, box.end); n += 1; }
    else if (box.type === 'meta') n += walkMeta(b, box);
    else if (box.type === 'moov' || box.type === 'trak' || box.type === 'udta') n += walk(b, box.body, box.end, depth + 1);
  }
  return n;
}

/** A position (ISO 6709, like +42.8800-008.5450) or XMP GPS text between `from` and `to`. */
function positionLeft(b: Uint8Array, from: number, to: number): boolean {
  const digit = (c: number) => c >= 0x30 && c <= 0x39;
  for (let i = from; i < to; i++) {
    const c = b[i];
    if (c === 0x47 && b[i + 1] === 0x50 && b[i + 2] === 0x53 && (b[i + 3] === 0x4c || b[i + 3] === 0x41)) return true; // GPSL(at|ong), GPSA(ltitude)
    if (c !== 0x2b && c !== 0x2d) continue; // + or -
    let k = i + 1;
    let d = 0;
    while (k < to && digit(b[k]) && d < 3) { k++; d++; }
    if (d === 0 || b[k] !== 0x2e) continue;
    k++;
    let f = 0;
    while (k < to && digit(b[k])) { k++; f++; }
    if (f >= 2 && (b[k] === 0x2b || b[k] === 0x2d) && digit(b[k + 1])) return true;
  }
  return false;
}

/**
 * Overwrite the recording place of an MP4 / MOV in place. `removed`: something was there. `complete`: the whole file was
 * read and nothing that looks like a position is left outside the picture data; when false, do not upload it.
 * Anything that is not a clip is left alone (complete: false).
 */
export function stripVideoLocation(b: Uint8Array): { bytes: Uint8Array; removed: boolean; complete: boolean } {
  if (!isIsoMedia(b)) return { bytes: b, removed: false, complete: false };
  let removed = false;
  try {
    const top = boxes(b, 0, b.length);
    if (!top.some((x) => x.type === 'moov')) throw new Incomplete();
    removed = walk(b, 0, b.length, 0) > 0;
    for (const x of top) if (x.type !== 'mdat' && positionLeft(b, x.start, x.end)) throw new Incomplete();
  } catch (e) {
    if (e instanceof Incomplete) return { bytes: b, removed, complete: false };
    throw e;
  }
  return { bytes: b, removed, complete: true };
}
