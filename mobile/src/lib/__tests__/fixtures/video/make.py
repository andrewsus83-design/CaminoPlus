# Makes the MP4 / MOV test files in this folder (ffmpeg needed): clips with a recording place in every layout we know of,
# and broken ones (cut short, lying sizes, a child longer than its parent, deep nesting, a HEIC that says it is a video).
# Run from mobile/: python3 src/lib/__tests__/fixtures/video/make.py src/lib/__tests__/fixtures/video
# Used by src/lib/__tests__/mediaLocation.test.ts. Based on the second review's vtest.py.

import json, os, struct, subprocess, sys, time, hashlib

D = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
LOC = b'+42.8800-008.5450/'
LOC3 = b'+42.8800-008.5450+250.000/'

def box(t, body):
    return struct.pack('>I', 8 + len(body)) + t + body

def full(t, body, v=0, f=0):
    return box(t, struct.pack('>I', (v << 24) | f) + body)

def parse(b, a=0, e=None):
    e = len(b) if e is None else e
    out = []
    while a + 8 <= e:
        s, = struct.unpack('>I', b[a:a + 4]); t = b[a + 4:a + 8]; h = 8
        if s == 1: s, = struct.unpack('>Q', b[a + 8:a + 16]); h = 16
        elif s == 0: s = e - a
        if s < h or a + s > e: break
        out.append((t, a, a + h, a + s)); a += s
    return out

def find(b, path):
    a, e = 0, len(b)
    for t in path:
        hit = [x for x in parse(b, a, e) if x[0] == t]
        if not hit: return None
        _, s, a, e = hit[0]
    return s, a, e

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def framemd5(p):
    r = run(['ffmpeg', '-v', 'error', '-i', p, '-map', '0', '-f', 'framemd5', '-'])
    if r.returncode != 0: return 'DECODE-ERROR ' + r.stderr.strip()[:120]
    return hashlib.md5(r.stdout.encode()).hexdigest()

def tags(p):
    r = run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', p])
    try:
        j = json.loads(r.stdout)
    except Exception:
        return 'PROBE-ERROR'
    t = dict(j.get('format', {}).get('tags', {}))
    for s in j.get('streams', []): t.update({'s.' + k: v for k, v in s.get('tags', {}).items()})
    return {k: v for k, v in t.items() if 'loc' in k.lower() or 'xyz' in k.lower() or '42.88' in v}

def changed(a, b):
    r = []; i = 0
    while i < len(a):
        if a[i] != b[i]:
            j = i
            while j < len(a) and a[j] != b[j]: j += 1
            r.append((i, j)); i = j
        else: i += 1
    return r

def gen():
    os.makedirs(D, exist_ok=True)
    src = os.path.join(D, 'base.mp4')
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=0.3:size=160x120:rate=30', '-f', 'lavfi', '-i', 'sine=duration=0.3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src])
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c', 'copy', '-metadata', 'location=' + LOC.decode(), os.path.join(D, 'ff_android_like.mp4')])
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', '-metadata', 'location=' + LOC.decode(), os.path.join(D, 'ff_faststart.mp4')])
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', 'use_metadata_tags', '-metadata', 'com.apple.quicktime.location.ISO6709=' + LOC3.decode(), '-metadata', 'com.apple.quicktime.make=Apple', '-metadata', 'location=' + LOC.decode(), os.path.join(D, 'ff_iphone_like.mov')])
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', 'frag_keyframe+empty_moov', '-metadata', 'location=' + LOC.decode(), os.path.join(D, 'ff_fragmented.mp4')])

    b = open(os.path.join(D, 'ff_android_like.mp4'), 'rb').read()
    tops = parse(b)
    ftyp = [b[s:e] for t, s, _, e in tops if t == b'ftyp'][0]
    moov_t = [x for x in tops if x[0] == b'moov'][0]
    mdat_t = [x for x in tops if x[0] == b'mdat'][0]
    moov = b[moov_t[1]:moov_t[3]]
    w = lambda n, d: open(os.path.join(D, n), 'wb').write(d)
    # moov with size 0 as last box
    w('h_moov_size0.mp4', b[:moov_t[1]] + b'\x00\x00\x00\x00' + moov[4:])
    # 64-bit mdat: rebuild as ftyp + mdat(size=1) + moov (offsets in stco would shift by 8, decode not expected)
    mdat_body = b[mdat_t[2]:mdat_t[3]]
    w('h_mdat64.mp4', ftyp + struct.pack('>I4sQ', 1, b'mdat', 16 + len(mdat_body)) + mdat_body + moov)
    # truncated in the middle of moov (moov at end)
    w('h_truncated_mid_moov.mp4', b[:moov_t[1] + (moov_t[3] - moov_t[1]) // 2 + 40])
    # a lying top-level box before moov (free with size past the end)
    w('h_lying_free_before_moov.mp4', ftyp + struct.pack('>I4s', 0x7fffffff, b'free') + b'\x00' * 8 + b[len(ftyp):])
    # loop: a box whose size (4) is smaller than its header, inside udta before ©xyz
    u = find(moov, [b'moov', b'udta'])
    s, a, e = u
    udta_body = moov[a:e]
    bad = struct.pack('>I4s', 4, b'junk')
    newudta = box(b'udta', bad + udta_body)
    m2 = moov[:s] + newudta + moov[e:]
    m2 = struct.pack('>I', len(m2)) + m2[4:]
    w('h_loop_in_udta.mp4', b[:moov_t[1]] + m2)
    # nested child longer than parent: a box in udta claiming 1 MB, then ©xyz
    long_child = struct.pack('>I4s', 1 << 20, b'smta') + b'\x00' * 8
    newudta = box(b'udta', long_child + udta_body)
    m3 = moov[:s] + newudta + moov[e:]
    m3 = struct.pack('>I', len(m3)) + m3[4:]
    w('h_child_longer_than_parent.mp4', b[:moov_t[1]] + m3)
    # ISO meta (mdir, ilst ©xyz with data box) in udta + QuickTime meta (keys) in moov + loci + trak/udta ©xyz + XMP
    hdlr_mdir = full(b'hdlr', b'\x00' * 4 + b'mdir' + b'appl' + b'\x00' * 8 + b'\x00')
    data = lambda v: box(b'data', struct.pack('>II', 1, 0) + v)
    iso_meta = full(b'meta', hdlr_mdir + box(b'ilst', box(b'\xa9xyz', data(LOC))))
    loci = full(b'loci', b'\x15\xc7' + b'Santiago\x00' + b'\x00' + struct.pack('>iii', -555, 2810, 250) + b'earth\x00' + b'note\x00')
    xmp = box(b'XMP_', b'<x:xmpmeta><rdf:Description exif:GPSLatitude="42,52.8N"/></x:xmpmeta>')
    keys = full(b'keys', struct.pack('>I', 2) + box(b'mdta', b'com.apple.quicktime.make') + box(b'mdta', b'com.apple.quicktime.location.ISO6709'))
    qt_hdlr = full(b'hdlr', b'\x00' * 4 + b'mdta' + b'\x00' * 12 + b'\x00')
    ilst = box(b'ilst', box(struct.pack('>I', 1), data(b'Apple')) + box(struct.pack('>I', 2), data(LOC3)))
    qt_meta = box(b'meta', qt_hdlr + keys + ilst)
    uuid_xmp = box(b'uuid', bytes.fromhex('BE7ACFCB97A942E89C71999491E3AFAC') + b'<x:xmpmeta exif:GPSLongitude="8,32.7W"/>')
    trak = find(moov, [b'moov', b'trak'])
    ts, ta, te = trak
    trak_new = moov[ts:te] + b''
    trak_new = box(b'trak', moov[ta:te] + box(b'udta', box(b'\xa9xyz', struct.pack('>HH', len(LOC), 0x15c7) + LOC)))
    m4 = moov[:ts] + trak_new + moov[te:s] + box(b'udta', udta_body + iso_meta + loci + xmp) + moov[e:] + qt_meta
    m4 = struct.pack('>I', len(m4)) + m4[4:]
    w('h_all_layouts.mov', b[:moov_t[1]] + m4 + uuid_xmp)
    # keys entry with a lying size before the location key
    keys_bad = full(b'keys', struct.pack('>I', 2) + struct.pack('>I4s', 999, b'mdta') + b'com.apple.quicktime.make' + box(b'mdta', b'com.apple.quicktime.location.ISO6709'))
    m5 = moov + b''
    m5 = moov[:] + box(b'meta', qt_hdlr + keys_bad + ilst)
    m5 = struct.pack('>I', len(m5)) + m5[4:]
    w('h_keys_lying_entry.mov', b[:moov_t[1]] + m5)
    # a HEIC-shaped file with EXIF GPS, uploaded with type video/mp4
    heic = box(b'ftyp', b'heic' + b'\x00\x00\x00\x00' + b'mif1heic') + full(b'meta', full(b'hdlr', b'\x00' * 4 + b'pict' + b'\x00' * 13)) + box(b'mdat', b'Exif\x00\x00MM\x00*' + b'GPS ' + LOC)
    w('h_heic_as_video.mp4', heic)
    # many nested udta/trak levels deeper than 6 with ©xyz at the bottom
    inner = box(b'\xa9xyz', struct.pack('>HH', len(LOC), 0x15c7) + LOC)
    for _ in range(7): inner = box(b'udta', inner)
    w('h_deep_nesting.mp4', ftyp + box(b'moov', inner))

if __name__ == '__main__':
    gen()
