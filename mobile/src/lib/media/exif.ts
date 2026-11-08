// Removes the location from a JPEG before it leaves the phone. Pure (bytes in, bytes out), checked by
// src/lib/__tests__/media.test.ts on JPEGs that carry GPS data in every place we know of.
//
// prepareImage saves every photo again, which already drops all EXIF data. This is the second line: a build without the
// resizing module, or a photo the module could not read, uploads the original file, and an original from a phone camera
// carries the GPS position. So every JPEG goes through this in mediaStorage.upload().
//
// What it does, without changing the length of the file (so offsets inside it, like those of a second image in an MPF
// file, stay right and the picture still decodes):
// - every EXIF block in the whole file (also the one of a second, embedded image, and also after a broken or padded
//   segment header) gets its GPS block emptied, wherever IFD0 or IFD1 points to one;
// - every XMP packet (also the extended one) and every Photoshop/IPTC block (it can hold a city name) becomes a
//   comment segment full of spaces.
// The orientation and the rest of the EXIF data stay, so the photo is not turned on its side.
// Not covered: location text in an XMP or IPTC block whose segment header is broken (no phone camera writes that).

const GPS_POINTER_TAG = 0x8825;
const COM = 0xfe;
const SPACE = 0x20;
/** Bytes per value of each EXIF type (1 BYTE, 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL, 7 UNDEFINED, 9 SLONG, 10 SRATIONAL). */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const MAX_SEGMENT = 0xffff;

const bytesOf = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
const EXIF_ID = bytesOf('Exif\0\0');
const XMP_IDS = [bytesOf('http://ns.adobe.com/xap/1.0/'), bytesOf('http://ns.adobe.com/xmp/extension/')];
const PHOTOSHOP_ID = bytesOf('Photoshop 3.0\0');

/** A JPEG starts with FF D8 (usually FF D8 FF; a padding byte after FF D8 is tolerated by decoders and handled here too). */
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/** Every index where `needle` starts in `b` (a plain scan: a 20 MB photo takes a few tens of milliseconds). */
export function indexesOf(b: Uint8Array, needle: Uint8Array): number[] {
  const out: number[] = [];
  const first = needle[0];
  const last = b.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    if (b[i] !== first) continue;
    for (let k = 1; k < needle.length; k++) if (b[i + k] !== needle[k]) continue outer;
    out.push(i);
  }
  return out;
}

/** The end of the segment whose identifier starts at `id` (the 0xFF, marker and length sit just before it), or -1. */
function segmentEnd(b: Uint8Array, id: number, markers: readonly number[]): number {
  const at = id - 4;
  if (at < 2 || b[at] !== 0xff || !markers.includes(b[at + 1])) return -1;
  const len = (b[at + 2] << 8) | b[at + 3];
  if (len < 2 || at + 2 + len > b.length) return -1;
  return at + 2 + len;
}

/** Empty every GPS block of the TIFF data at `tiff` (in place), visiting IFD0 and IFD1. Returns the entries removed. */
function clearGps(b: Uint8Array, tiff: number, end: number): number {
  if (tiff + 8 > end) return 0;
  const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const be = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!le && !be) return 0;
  const u16 = (at: number) => (le ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1]);
  const u32 = (at: number) => (le ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000 : b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]));
  const inside = (at: number, n: number) => at >= tiff && n >= 0 && at + n <= end;
  let removed = 0;
  const seen = new Set<number>();
  let ifd = tiff + u32(tiff + 4);
  for (let hop = 0; hop < 2 && inside(ifd, 2) && !seen.has(ifd); hop++) { // IFD0, then IFD1 (the thumbnail's)
    seen.add(ifd);
    const n = Math.min(u16(ifd), Math.floor((end - ifd - 2) / 12));
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) !== GPS_POINTER_TAG) continue;
      const gps = tiff + u32(e + 8);
      if (!inside(gps, 2) || seen.has(gps)) continue;
      seen.add(gps);
      const gn = Math.min(u16(gps), Math.floor((end - gps - 2) / 12));
      for (let g = 0; g < gn; g++) {
        const ge = gps + 2 + g * 12;
        const size = (TYPE_SIZE[u16(ge + 2)] ?? 1) * u32(ge + 4);
        if (size > 4) {
          const at = tiff + u32(ge + 8);
          if (inside(at, size)) b.fill(0, at, at + size); // the values themselves (latitude, longitude, altitude, time)
        }
        b.fill(0, ge, ge + 12); // the entry
        removed += 1;
      }
      if (u16(gps) !== 0) { b[gps] = 0; b[gps + 1] = 0; removed += 1; } // the GPS block now has no entries
    }
    const next = ifd + 2 + u16(ifd) * 12;
    if (!inside(next, 4)) break;
    const off = u32(next);
    if (off === 0) break;
    ifd = tiff + off;
  }
  // A GPS block no pointer leads to (a broken or edited file): find it by its shape. GPS tags are 0 to 31, in order, and
  // a position has a latitude or longitude (tag 2 or 4) of three rationals. Only bytes inside the EXIF block are touched.
  for (let at = tiff + 8; at + 2 + 12 <= end; at += 2) {
    const n = u16(at);
    if (n < 1 || n > 32 || at + 2 + n * 12 > end) continue;
    let prev = -1;
    let position = false;
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      const e = at + 2 + k * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      if (tag > 31 || tag <= prev || !TYPE_SIZE[type]) ok = false;
      if ((tag === 2 || tag === 4) && (type === 5 || type === 10) && u32(e + 4) === 3) position = true;
      prev = tag;
    }
    if (!ok || !position) continue;
    for (let k = 0; k < n; k++) {
      const e = at + 2 + k * 12;
      const size = (TYPE_SIZE[u16(e + 2)] ?? 1) * u32(e + 4);
      if (size > 4) {
        const v = tiff + u32(e + 8);
        if (inside(v, size)) b.fill(0, v, v + size);
      }
    }
    b.fill(0, at, at + 2 + n * 12);
    removed += n;
  }
  return removed;
}

/** Turn the segment that ends at `end` and whose identifier starts at `id` into a comment of spaces (same length). */
function blankSegment(b: Uint8Array, id: number, end: number) {
  b[id - 3] = COM;
  b.fill(SPACE, id, end);
}

/**
 * The JPEG without its location (a copy; the length never changes). Anything that is not a JPEG comes back unchanged.
 * `removed` says whether there was something to remove.
 */
export function stripJpegLocation(input: Uint8Array): { bytes: Uint8Array; removed: boolean } {
  if (!isJpeg(input)) return { bytes: input, removed: false };
  const b = new Uint8Array(input);
  let removed = false;
  for (const id of indexesOf(b, EXIF_ID)) {
    const end = segmentEnd(b, id, [0xe1]);
    const bound = end > 0 ? end : Math.min(b.length, id + MAX_SEGMENT);
    if (clearGps(b, id + EXIF_ID.length, bound) > 0) removed = true;
  }
  for (const [ids, markers] of [[XMP_IDS, [0xe1]], [[PHOTOSHOP_ID], [0xed]]] as const) {
    for (const needle of ids) {
      for (const id of indexesOf(b, needle)) {
        const end = segmentEnd(b, id, markers);
        if (end < 0) continue;
        blankSegment(b, id, end);
        removed = true;
      }
    }
  }
  return { bytes: b, removed };
}
