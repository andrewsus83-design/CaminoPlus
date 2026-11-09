// No photo or clip leaves the phone with the place where it was taken. Plain-node checks of src/lib/media/exif.ts,
// videoLocation.ts and clean.ts, judged by a checker written here on its own (it shares no code with what it checks).
// The JPEG files in fixtures/exif are made by fixtures/exif/make.py. Run: npm run test:lib
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripJpegLocation } from '../media/exif';
import { stripVideoLocation } from '../media/videoLocation';
import { UploadRefused, cleanForUpload, normaliseType } from '../media/clean';
import { LOCATION_REFUSED_MESSAGE, UNSUPPORTED_TYPE_MESSAGE, VIDEO_LOCATION_REFUSED_MESSAGE } from '../media/limits';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd();
const FIX = join(root, 'src', 'lib', '__tests__', 'fixtures');

/* ------------------------------------------------------------------ the independent checker */

const B = (x: Uint8Array) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);
function every(b: Buffer, needle: Buffer): number[] {
  const out: number[] = [];
  for (let i = b.indexOf(needle); i >= 0; i = b.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/** Why this file still tells where it was made (empty: it does not). */
function whereFrom(x: Uint8Array): string[] {
  const b = B(x);
  const why: string[] = [];
  for (const id of every(b, Buffer.from('Exif\0\0', 'latin1'))) {
    const t = id + 6;
    if (t + 8 > b.length) continue;
    const le = b.toString('latin1', t, t + 2) === 'II';
    if (!le && b.toString('latin1', t, t + 2) !== 'MM') continue;
    const r16 = (a: number) => (a + 2 <= b.length ? (le ? b.readUInt16LE(a) : b.readUInt16BE(a)) : 0);
    const r32 = (a: number) => (a + 4 <= b.length ? (le ? b.readUInt32LE(a) : b.readUInt32BE(a)) : 0);
    // a GPS pointer, in any of the first IFDs, that leads to a GPS block with entries
    const seen = new Set<number>();
    for (let ifd = t + r32(t + 4), hops = 0; hops < 4 && ifd + 2 <= b.length && !seen.has(ifd); hops++) {
      seen.add(ifd);
      const count = r16(ifd);
      for (let k = 0; k < count && ifd + 2 + k * 12 + 12 <= b.length; k++) {
        const e = ifd + 2 + k * 12;
        if (r16(e) === 0x8825) {
          const g = t + r32(e + 8);
          if (g + 2 <= b.length && r16(g) > 0) why.push('a GPS pointer leads to GPS entries');
        }
      }
      const nx = r32(ifd + 2 + count * 12);
      if (!nx) break;
      ifd = t + nx;
    }
    // a latitude or longitude entry (tag 2 or 4, three rationals), whether or not anything points at it
    const region = b.subarray(t, Math.min(b.length, t + 0x10000));
    const entry = (tag: number) => le ? Buffer.from([tag, 0, 5, 0, 3, 0, 0, 0]) : Buffer.from([0, tag, 0, 5, 0, 0, 0, 3]);
    if (region.includes(entry(2)) || region.includes(entry(4))) why.push('a latitude or longitude entry');
  }
  // the numbers of the fixtures' positions (42° 52′, 8° 32′), as rationals in either byte order
  for (const [d, m] of [[42, 52], [8, 32]]) {
    for (const le of [true, false]) {
      const nb = Buffer.alloc(16);
      if (le) { nb.writeUInt32LE(d, 0); nb.writeUInt32LE(1, 4); nb.writeUInt32LE(m, 8); nb.writeUInt32LE(1, 12); } else { nb.writeUInt32BE(d, 0); nb.writeUInt32BE(1, 4); nb.writeUInt32BE(m, 8); nb.writeUInt32BE(1, 12); }
      if (b.includes(nb)) why.push(`the rationals ${d}/${m}`);
    }
  }
  const text = b.toString('latin1');
  for (const word of ['GPSLatitude', 'GPSLongitude', 'exif:GPS', 'Santiago', 'Photoshop 3.0']) if (text.includes(word)) why.push(`the text ${word}`);
  if (/[+-]\d{1,2}\.\d{2,}[+-]\d{1,3}\.\d{2,}/.test(text)) why.push('an ISO 6709 position');
  return why;
}

/** Every byte that changed lies inside one of the ranges. */
function changesOnlyIn(before: Uint8Array, after: Uint8Array, ranges: Array<[number, number]>, what: string) {
  assert.equal(after.length, before.length, `${what}: the length did not change`);
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    assert.ok(ranges.some(([a, z]) => i >= a && i < z), `${what}: byte ${i} changed outside the metadata`);
  }
}

/** The metadata segments of a JPEG, found by their identifiers (EXIF, XMP, Photoshop), with their headers. */
function metadataRanges(x: Uint8Array): Array<[number, number]> {
  const b = B(x);
  const out: Array<[number, number]> = [];
  for (const id of ['Exif\0\0', 'http://ns.adobe.com/xap/1.0/', 'http://ns.adobe.com/xmp/extension/', 'Photoshop 3.0\0']) {
    for (const at of every(b, Buffer.from(id, 'latin1'))) {
      const header = at >= 4 && b[at - 4] === 0xff;
      const end = header ? at - 2 + b.readUInt16BE(at - 2) : at + 0x10000;
      out.push([at - 4, Math.min(b.length, end)]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ JPEG */

const fixtures = readdirSync(join(FIX, 'exif')).filter((f) => f.endsWith('.jpg')).sort();

check('the fixtures are all there, and the checker finds a location in each (except the cut-off file)', () => {
  for (const f of ['le', 'be', 'ifd1gps', 'ptr_out', 'count_huge', 'loop', 'xmp', 'irb_iptc_city', 'lying_len_before_exif', 'pad_before_exif', 'truncated', 'mpf_secondary']) {
    assert.ok(fixtures.includes(`${f}.jpg`), `${f}.jpg`);
  }
  for (const f of fixtures) {
    if (f === 'truncated.jpg') continue;
    assert.ok(whereFrom(new Uint8Array(readFileSync(join(FIX, 'exif', f)))).length > 0, `${f} carries a location`);
  }
  assert.ok(whereFrom(new Uint8Array(readFileSync(join(FIX, 'gps-exif.jpg')))).length > 0);
});

for (const f of [...fixtures.map((x) => join('exif', x)), 'gps-exif.jpg']) {
  check(`${f}: no location left, same length, only metadata bytes changed, the input untouched`, () => {
    const src = new Uint8Array(readFileSync(join(FIX, f)));
    const copy = new Uint8Array(src);
    const t0 = Date.now();
    const { bytes } = stripJpegLocation(src);
    assert.ok(Date.now() - t0 < 500);
    assert.deepEqual(whereFrom(bytes), [], `${f}: ${whereFrom(bytes).join(', ')}`);
    assert.deepEqual(src, copy, 'the input is not changed');
    if (!f.includes('truncated')) changesOnlyIn(src, bytes, metadataRanges(src), f);
  });
}

check('the orientation stays (the photo is not turned on its side)', () => {
  const be = stripJpegLocation(new Uint8Array(readFileSync(join(FIX, 'exif', 'be.jpg')))).bytes;
  assert.ok(B(be).includes(Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06])));
  const le = stripJpegLocation(new Uint8Array(readFileSync(join(FIX, 'exif', 'le.jpg')))).bytes;
  assert.ok(B(le).includes(Buffer.from([0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00])));
  assert.ok(B(stripJpegLocation(new Uint8Array(readFileSync(join(FIX, 'gps-exif.jpg')))).bytes).includes(Buffer.from('TestCam')), 'other EXIF data stays');
});

check('an extended XMP packet and an MPF file whose second image carries GPS are both cleaned', () => {
  const base = new Uint8Array(readFileSync(join(FIX, 'exif', 'le.jpg')));
  const ext = Buffer.from('http://ns.adobe.com/xmp/extension/\0' + '0123456789ABCDEF0123456789ABCDEF' + '<rdf:Description exif:GPSLongitude="8,32.45W"/>', 'latin1');
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (ext.length + 2) >> 8, (ext.length + 2) & 0xff]), ext]);
  const withExt = new Uint8Array(Buffer.concat([B(base).subarray(0, 2), seg, B(base).subarray(2)]));
  assert.ok(whereFrom(withExt).length > 0);
  const out = stripJpegLocation(withExt).bytes;
  assert.deepEqual(whereFrom(out), []);
  assert.equal(out[2], 0xff); assert.equal(out[3], 0xfe, 'the XMP segment became a comment');
  const mpf = new Uint8Array(readFileSync(join(FIX, 'exif', 'mpf_secondary.jpg')));
  const second = B(mpf).indexOf(Buffer.from([0xff, 0xd8, 0xff]), 2);
  assert.ok(second > 0, 'the fixture has a second image');
  const cleaned = stripJpegLocation(mpf).bytes;
  assert.deepEqual(whereFrom(cleaned.subarray(second)), [], 'the second image has no position either');
  assert.equal(B(cleaned).indexOf(Buffer.from([0xff, 0xd8, 0xff]), 2), second, 'the second image starts where it did');
});

check('anything that is not a JPEG comes back as it was; a broken file does not throw', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  assert.equal(stripJpegLocation(png).bytes, png);
  assert.doesNotThrow(() => stripJpegLocation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00])));
  assert.doesNotThrow(() => stripJpegLocation(new Uint8Array([0xff, 0xd8, 0xff])));
});

check('a 20 MB photo is cleaned in well under a second here', () => {
  const big = new Uint8Array(20 * 1024 * 1024);
  big.set(readFileSync(join(FIX, 'exif', 'xmp.jpg')));
  const t0 = Date.now();
  const out = stripJpegLocation(big).bytes;
  assert.deepEqual(whereFrom(out.subarray(0, 4096)), []);
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
});

/* ------------------------------------------------------------------ MP4 / MOV */

const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const full = (v = 0) => Buffer.from([v, 0, 0, 0]);
const u32 = (x: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(x); return b; };
const POS = '+42.8800-008.5450+260.000/';

function movie(o: { quicktime: boolean; bigMdat: boolean; moovFirst: boolean }) {
  const xyz = (text: string) => box('©xyz', Buffer.from([0, text.length, 0x15, 0xc7]), Buffer.from(text, 'latin1'));
  const loci = box('loci', full(), Buffer.from([0x15, 0xc7]), Buffer.from('Santiago\0', 'latin1'), Buffer.from([0]), u32(0x0008_8000), u32(0x002a_e000), u32(260 << 16), Buffer.from('earth\0\0', 'latin1'));
  const key = (name: string) => Buffer.concat([u32(name.length + 8), Buffer.from('mdta' + name, 'latin1')]);
  const data = (text: string) => box('data', u32(1), u32(0), Buffer.from(text, 'latin1'));
  const item = (index: number, ...parts: Buffer[]) => { const b = box('xxxx', ...parts); b.writeUInt32BE(index, 4); return b; };
  const hdlr = box('hdlr', full(), Buffer.from('\0\0\0\0mdta', 'latin1'), Buffer.alloc(12), Buffer.from('\0'));
  const metaBody = [hdlr, box('keys', full(), u32(2), key('com.apple.quicktime.make'), key('com.apple.quicktime.location.ISO6709')), box('ilst', item(1, data('Apple')), item(2, data(POS)))];
  const meta = o.quicktime ? box('meta', ...metaBody) : box('meta', full(), ...metaBody);
  const moov = box('moov', box('mvhd', full(), Buffer.alloc(96, 7)), box('udta', xyz(POS), loci), meta, box('trak', box('tkhd', full(), Buffer.alloc(80, 9)), box('udta', xyz('+42.88-008.54/'))));
  const picture = Buffer.alloc(4000);
  for (let i = 0; i < picture.length; i++) picture[i] = (i * 31 + 7) & 0xff;
  let mdat: Buffer;
  if (o.bigMdat) {
    const head = Buffer.alloc(16);
    head.writeUInt32BE(1, 0); head.write('mdat', 4, 'latin1'); head.writeUInt32BE(0, 8); head.writeUInt32BE(picture.length + 16, 12);
    mdat = Buffer.concat([head, picture]);
  } else mdat = box('mdat', picture);
  const ftyp = box('ftyp', Buffer.from(o.quicktime ? 'qt  ' : 'isom', 'latin1'), u32(0x200), Buffer.from(o.quicktime ? 'qt  ' : 'isommp42', 'latin1'));
  const parts = o.quicktime ? [ftyp, box('wide')] : [ftyp];
  return new Uint8Array(o.moovFirst ? Buffer.concat([...parts, moov, mdat]) : Buffer.concat([...parts, mdat, moov]));
}

for (const o of [{ quicktime: false, bigMdat: false, moovFirst: true }, { quicktime: true, bigMdat: true, moovFirst: false }, { quicktime: false, bigMdat: true, moovFirst: false }]) {
  const name = `${o.quicktime ? 'MOV' : 'MP4'} (moov ${o.moovFirst ? 'before' : 'after'} the picture data${o.bigMdat ? ', 64-bit mdat size' : ''})`;
  check(`${name}: ©xyz, loci and the ISO6709 item are overwritten; the length, the picture data and every other byte stay`, () => {
    const src = movie(o);
    assert.ok(whereFrom(src).length > 0);
    assert.ok(B(src).includes(Buffer.from('Santiago')));
    const copy = new Uint8Array(src);
    const { bytes, removed } = stripVideoLocation(src);
    assert.equal(removed, true);
    assert.equal(bytes, src, 'changed in place, no copy of a 45 MB clip');
    assert.deepEqual(whereFrom(bytes), []);
    assert.ok(B(bytes).includes(Buffer.from('Apple')), 'the other metadata items stay');
    // the changed bytes are exactly: the ©xyz and loci boxes (turned into free boxes, type and body), the ISO6709 value
    const ranges: Array<[number, number]> = [];
    for (const at of every(B(copy), Buffer.from(POS, 'latin1'))) ranges.push([at, at + POS.length]);
    for (const type of ['\u00a9xyz', 'loci']) {
      for (const at of every(B(copy), Buffer.from(type, 'latin1'))) ranges.push([at, at - 4 + B(copy).readUInt32BE(at - 4)]);
    }
    assert.ok(B(bytes).includes(Buffer.from('free', 'latin1')));
    changesOnlyIn(copy, bytes, ranges, name);
    const mdat = B(copy).indexOf(Buffer.from('mdat', 'latin1'));
    assert.deepEqual(B(bytes).subarray(mdat, mdat + 4000), B(copy).subarray(mdat, mdat + 4000), 'the picture data is untouched');
  });
}

check('a clip without a location, a broken clip, and a file that is not a clip are left alone', () => {
  const plain = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1'), u32(0)), box('mdat', Buffer.alloc(50, 1)), box('moov', box('mvhd', full(), Buffer.alloc(96)))]));
  const copy = new Uint8Array(plain);
  assert.equal(stripVideoLocation(plain).removed, false);
  assert.deepEqual(plain, copy);
  const broken = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1')), Buffer.from([0, 0, 0xff, 0xff, 0x6d, 0x6f, 0x6f, 0x76, 1, 2])]));
  assert.doesNotThrow(() => stripVideoLocation(broken));
  assert.equal(stripVideoLocation(new Uint8Array([1, 2, 3])).removed, false);
});

/* ------------------------------------------------------------------ clips made with ffmpeg, and broken ones (fixtures/video/make.py) */

const VID = join(FIX, 'video');
const vfile = (f: string) => new Uint8Array(readFileSync(join(VID, f)));
const typeOf = (f: string) => (f.endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
/** A loci box holds the position as 16.16 numbers: 42.88 and -8.545 as ffmpeg writes them, and -555 / 2810 of make.py. */
const lociNumbers = (x: Uint8Array) => [[0x00, 0x2a, 0xe1, 0x47], [0xff, 0xf7, 0x74, 0x7b], [0xff, 0xff, 0xfd, 0xd5, 0x00, 0x00, 0x0a, 0xfa]].some((n) => B(x).includes(Buffer.from(n)));

const GOOD_CLIPS = ['ff_android_like.mp4', 'ff_faststart.mp4', 'ff_fragmented.mp4', 'ff_iphone_like.mov', 'h_all_layouts.mov', 'h_moov_size0.mp4', 'h_mdat64.mp4', 'h_deep_nesting.mp4'];
const BROKEN_CLIPS = ['h_truncated_mid_moov.mp4', 'h_lying_free_before_moov.mp4', 'h_loop_in_udta.mp4', 'h_child_longer_than_parent.mp4', 'h_keys_lying_entry.mov'];

check('the clip fixtures are all there, and each carries a place before cleaning', () => {
  const have = readdirSync(VID);
  for (const f of [...GOOD_CLIPS, ...BROKEN_CLIPS, 'h_heic_as_video.mp4']) assert.ok(have.includes(f), f);
  for (const f of [...GOOD_CLIPS, ...BROKEN_CLIPS].filter((x) => !x.includes('truncated'))) assert.ok(whereFrom(vfile(f)).length > 0 || lociNumbers(vfile(f)), `${f} carries a place`);
});

for (const f of GOOD_CLIPS) {
  check(`${f}: goes up without its place, same length, only the place bytes changed`, () => {
    const src = vfile(f);
    const before = new Uint8Array(src);
    const out = cleanForUpload(src, typeOf(f));
    assert.deepEqual(whereFrom(out.bytes), [], `${f}: ${whereFrom(out.bytes).join(', ')}`);
    assert.equal(lociNumbers(out.bytes), false);
    assert.equal(out.bytes.length, before.length);
    const mdat = B(before).indexOf(Buffer.from('mdat', 'latin1'));
    const mdatSize = mdat >= 4 ? B(before).readUInt32BE(mdat - 4) : 0;
    if (mdatSize > 16) {
      const from = mdat + (mdatSize === 1 ? 12 : 4);
      const to = mdatSize === 1 ? mdat - 4 + Number(B(before).readBigUInt64BE(mdat + 4)) : mdat - 4 + mdatSize;
      assert.ok(B(out.bytes).subarray(from, to).equals(B(before).subarray(from, to)), `${f}: the picture data is untouched`);
    }
  });
}

for (const f of BROKEN_CLIPS) {
  check(`${f}: a clip whose boxes do not add up is refused, with a plain message`, () => {
    assert.throws(() => cleanForUpload(vfile(f), typeOf(f)), (e: unknown) => e instanceof UploadRefused && e.message === VIDEO_LOCATION_REFUSED_MESSAGE);
    assert.equal(stripVideoLocation(vfile(f)).complete, false);
  });
}

check('nesting deeper than the walk reads is refused, not skipped', () => {
  let inner = box('\u00a9xyz', Buffer.from([0, 18, 0x15, 0xc7]), Buffer.from('+42.8800-008.5450/', 'latin1'));
  for (let i = 0; i < 12; i++) inner = box('udta', inner);
  const deep = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1'), u32(0)), box('moov', inner)]));
  assert.throws(() => cleanForUpload(deep, 'video/mp4'), (e: unknown) => e instanceof UploadRefused && e.message === VIDEO_LOCATION_REFUSED_MESSAGE);
});

check('a clip cut short by 1, 3 or 8 bytes is refused (its place may sit in the part that cannot be read)', () => {
  const whole = vfile('ff_android_like.mp4');
  assert.equal(stripVideoLocation(new Uint8Array(whole)).complete, true);
  for (const cut of [1, 3, 8]) {
    assert.throws(() => cleanForUpload(new Uint8Array(whole.subarray(0, whole.length - cut)), 'video/mp4'), (e: unknown) => e instanceof UploadRefused, `cut ${cut}`);
  }
});

check('a HEIC photo that says it is a video is refused (its brands are those of a photo)', () => {
  assert.throws(() => cleanForUpload(vfile('h_heic_as_video.mp4'), 'video/mp4'), (e: unknown) => e instanceof UploadRefused && e.message === UNSUPPORTED_TYPE_MESSAGE);
  for (const brand of ['heic', 'heix', 'mif1', 'msf1', 'avif']) {
    const f = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from(brand, 'latin1'), u32(0)), box('moov', box('mvhd', full(), Buffer.alloc(96)))]));
    assert.throws(() => cleanForUpload(f, 'video/mp4'), UploadRefused, brand);
  }
  const compat = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('mif1', 'latin1')), box('moov', box('mvhd', full(), Buffer.alloc(96)))]));
  assert.throws(() => cleanForUpload(compat, 'video/mp4'), UploadRefused, 'a still brand among the compatible ones');
});

check('XMP in udta/XMP_ and in a top-level XMP uuid box is blanked; a QuickTime list of boxes that ends with a zero is fine', () => {
  const xmpUuid = Buffer.from('BE7ACFCB97A942E89C71999491E3AFAC', 'hex');
  const clip = new Uint8Array(Buffer.concat([
    box('ftyp', Buffer.from('isom', 'latin1'), u32(0)),
    box('moov', box('mvhd', full(), Buffer.alloc(96)), box('udta', box('XMP_', Buffer.from('<x exif:GPSLatitude="42,52.8N"/>', 'latin1')), u32(0))),
    box('uuid', xmpUuid, Buffer.from('<x exif:GPSLongitude="8,32.7W"/>', 'latin1')),
    box('mdat', Buffer.alloc(32, 3)),
  ]));
  const out = cleanForUpload(clip, 'video/mp4');
  assert.deepEqual(whereFrom(out.bytes), []);
  assert.ok(B(out.bytes).includes(xmpUuid), 'the uuid itself stays');
});

/* ------------------------------------------------------------------ what may go up at all */

check('the type is read from the bytes: image/jpg becomes image/jpeg, a HEIC or a PNG is refused, an MP4 or MOV goes up without its location', () => {
  const jpeg = new Uint8Array(readFileSync(join(FIX, 'exif', 'le.jpg')));
  assert.equal(normaliseType('image/jpg'), 'image/jpeg');
  const a = cleanForUpload(jpeg, 'image/jpg');
  assert.equal(a.contentType, 'image/jpeg');
  assert.deepEqual(whereFrom(a.bytes), []);
  assert.equal(cleanForUpload(jpeg, null).contentType, 'image/jpeg', 'a JPEG with no type is a JPEG');
  const heic = new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('heic', 'latin1'), u32(0), Buffer.from('mif1heic', 'latin1')), box('meta', full())]));
  assert.throws(() => cleanForUpload(heic, 'image/heic'), (e: unknown) => e instanceof UploadRefused && e.message === LOCATION_REFUSED_MESSAGE);
  assert.throws(() => cleanForUpload(heic, 'image/jpeg'), (e: unknown) => e instanceof UploadRefused, 'a HEIC that says it is a JPEG');
  assert.throws(() => cleanForUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png'), UploadRefused);
  const mov = movie({ quicktime: true, bigMdat: false, moovFirst: true });
  const v = cleanForUpload(mov, 'video/quicktime');
  assert.equal(v.contentType, 'video/quicktime');
  assert.deepEqual(whereFrom(v.bytes), []);
  assert.throws(() => cleanForUpload(movie({ quicktime: false, bigMdat: false, moovFirst: true }), 'video/3gpp'), (e: unknown) => e instanceof UploadRefused && e.message === UNSUPPORTED_TYPE_MESSAGE);
  assert.throws(() => cleanForUpload(jpeg, 'video/mp4'), UploadRefused);
  assert.throws(() => cleanForUpload(new Uint8Array([1, 2, 3, 4]), 'video/mp4'), UploadRefused);
});

console.log(`${n} of ${n} passed`);
