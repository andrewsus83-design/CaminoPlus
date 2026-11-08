// Removes the location from a JPEG before it leaves the phone. Pure (bytes in, bytes out), checked by
// src/lib/__tests__/media.test.ts on a JPEG that carries GPS data.
//
// prepareImage saves every photo again, which already drops all EXIF data. This is the second line: a build without the
// resizing module uploads the original file, and an original from a phone camera carries the GPS position. So every JPEG
// goes through this in mediaStorage.upload(): the GPS block of the EXIF data is emptied and XMP data (which can hold a
// position too) is removed. Everything else stays, the orientation included, so the photo is not turned on its side.

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP1 = 0xe1;
const GPS_POINTER_TAG = 0x8825;
/** Bytes per value of each EXIF type (1 BYTE, 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL, 7 UNDEFINED, 9 SLONG, 10 SRATIONAL). */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const ascii = (b: Uint8Array, at: number, text: string) => {
  if (at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === SOI;

type Segment = { marker: number; start: number; end: number; data: number };

/** The marker segments before the image data (start: the 0xFF, data: after the length, end: after the segment). */
function segments(b: Uint8Array): Segment[] {
  const out: Segment[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === SOS || marker === EOI) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) break;
    out.push({ marker, start: i, end: i + 2 + len, data: i + 4 });
    i += 2 + len;
  }
  return out;
}

/** Empty the GPS block of one EXIF segment in place. Returns how many GPS entries were removed. */
function clearGps(b: Uint8Array, seg: Segment): number {
  const tiff = seg.data + 6; // after "Exif\0\0"
  if (tiff + 8 > seg.end) return 0;
  const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const be = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!le && !be) return 0;
  const u16 = (at: number) => (le ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1]);
  const u32 = (at: number) => (le ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000 : b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]));
  const inSeg = (at: number, n: number) => at >= tiff && at + n <= seg.end;
  const ifd0 = tiff + u32(tiff + 4);
  if (!inSeg(ifd0, 2)) return 0;
  const n0 = u16(ifd0);
  let removed = 0;
  for (let k = 0; k < n0; k++) {
    const e = ifd0 + 2 + k * 12;
    if (!inSeg(e, 12)) break;
    if (u16(e) !== GPS_POINTER_TAG) continue;
    const gps = tiff + u32(e + 8);
    if (!inSeg(gps, 2)) continue;
    const n = u16(gps);
    for (let g = 0; g < n; g++) {
      const ge = gps + 2 + g * 12;
      if (!inSeg(ge, 12)) break;
      const size = (TYPE_SIZE[u16(ge + 2)] ?? 1) * u32(ge + 4);
      if (size > 4) {
        const at = tiff + u32(ge + 8);
        if (inSeg(at, size)) b.fill(0, at, at + size); // the values themselves (latitude, longitude, altitude, time)
      }
      b.fill(0, ge, ge + 12); // the entry
      removed += 1;
    }
    b[gps] = 0; b[gps + 1] = 0; // the GPS block now has no entries
  }
  return removed;
}

/**
 * The JPEG without its location: GPS entries of the EXIF data emptied, XMP segments removed. Anything that is not a JPEG
 * comes back unchanged. `removed` says whether there was something to remove.
 */
export function stripJpegLocation(input: Uint8Array): { bytes: Uint8Array; removed: boolean } {
  if (!isJpeg(input)) return { bytes: input, removed: false };
  const b = new Uint8Array(input); // a copy: the caller's bytes stay as they were
  let removed = false;
  const drop: Segment[] = [];
  for (const seg of segments(b)) {
    if (seg.marker !== APP1) continue;
    if (ascii(b, seg.data, 'Exif\0\0')) {
      if (clearGps(b, seg) > 0) removed = true;
    } else if (ascii(b, seg.data, 'http://ns.adobe.com/xap/1.0/') || ascii(b, seg.data, 'http://ns.adobe.com/xmp/extension/')) {
      drop.push(seg);
    }
  }
  if (drop.length === 0) return { bytes: b, removed };
  const keep = b.length - drop.reduce((n, s) => n + (s.end - s.start), 0);
  const out = new Uint8Array(keep);
  let w = 0;
  let r = 0;
  for (const s of drop) {
    out.set(b.subarray(r, s.start), w); w += s.start - r; r = s.end;
  }
  out.set(b.subarray(r), w);
  return { bytes: out, removed: true };
}

/** For tests and checks: does this JPEG still carry a position (a non-empty GPS block, or XMP data)? */
export function jpegHasLocation(b: Uint8Array): boolean {
  if (!isJpeg(b)) return false;
  const copy = new Uint8Array(b);
  for (const seg of segments(copy)) {
    if (seg.marker !== APP1) continue;
    if (ascii(copy, seg.data, 'http://ns.adobe.com/xap/1.0/')) return true;
    if (ascii(copy, seg.data, 'Exif\0\0') && clearGps(copy, seg) > 0) return true;
  }
  return false;
}
