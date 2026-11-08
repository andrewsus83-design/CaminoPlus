# Makes the JPEG test files in this folder: each hides a GPS position, XMP or IPTC data somewhere a reader could find it.
# Run from mobile/: python3 src/lib/__tests__/fixtures/exif/make.py src/lib/__tests__/fixtures/exif   (needs Pillow)
# Used by src/lib/__tests__/mediaLocation.test.ts.
import io, struct, sys, os
from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def base_jpeg(w=64, h=48):
    b = io.BytesIO()
    Image.new('RGB', (w, h), (200, 30, 30)).save(b, 'JPEG', quality=80)
    return b.getvalue()


def tiff(le=True, gps_in_ifd1=False, gps_ptr_off=None, gps_count=None, loop=False):
    e = '<' if le else '>'
    hdr = (b'II' if le else b'MM') + struct.pack(e + 'HI', 42, 8)
    # layout: IFD0 at 8: 2 entries (Orientation, GPS ptr) + next IFD
    ifd0_n = 2
    ifd0_size = 2 + ifd0_n * 12 + 4
    gps_at = 8 + ifd0_size
    # GPS IFD: 4 entries LatRef, Lat, LonRef, Lon
    gps_n = 4
    gps_size = 2 + gps_n * 12 + 4
    data_at = gps_at + gps_size
    lat = struct.pack(e + 'IIIIII', 42, 1, 52, 1, 3000, 100)
    lon = struct.pack(e + 'IIIIII', 8, 1, 32, 1, 4500, 100)
    ifd1_at = data_at + len(lat) + len(lon)
    next_ifd = ifd1_at if gps_in_ifd1 else 0
    if loop:
        next_ifd = 8
    ptr = gps_at if gps_ptr_off is None else gps_ptr_off
    ifd0 = struct.pack(e + 'H', ifd0_n)
    ifd0 += struct.pack(e + 'HHI', 0x0112, 3, 1) + struct.pack(e + 'HH', 6, 0)
    ifd0 += struct.pack(e + 'HHII', 0x8825, 4, 1, ptr)
    ifd0 += struct.pack(e + 'I', next_ifd)
    gps = struct.pack(e + 'H', gps_count if gps_count is not None else gps_n)
    gps += struct.pack(e + 'HHI', 1, 2, 2) + b'N\0\0\0'
    gps += struct.pack(e + 'HHII', 2, 5, 3, data_at)
    gps += struct.pack(e + 'HHI', 3, 2, 2) + b'W\0\0\0'
    gps += struct.pack(e + 'HHII', 4, 5, 3, data_at + 24)
    gps += struct.pack(e + 'I', 0)
    body = hdr + ifd0 + gps + lat + lon
    if gps_in_ifd1:
        # IFD1 (thumbnail IFD) with its own GPS pointer to a second GPS IFD
        gps2_at = ifd1_at + 2 + 12 + 4
        ifd1 = struct.pack(e + 'H', 1) + struct.pack(e + 'HHII', 0x8825, 4, 1, gps2_at) + struct.pack(e + 'I', 0)
        lat2_at = gps2_at + 2 + 12 + 4
        gps2 = struct.pack(e + 'H', 1) + struct.pack(e + 'HHII', 2, 5, 3, lat2_at) + struct.pack(e + 'I', 0)
        body += ifd1 + gps2 + lat
    return body


def app(marker, payload):
    return b'\xff' + bytes([marker]) + struct.pack('>H', len(payload) + 2) + payload


def with_segments(jpeg, segs):
    return jpeg[:2] + b''.join(segs) + jpeg[2:]


j = base_jpeg()
xmp = b'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="42,52.30N" exif:GPSLongitude="8,32.45W"/></x:xmpmeta>'
irb = b'Photoshop 3.0\0' + b'8BIM\x04\x04\0\0' + struct.pack('>I', 20) + b'\x1c\x02\x5a\x00\x10Santiago de Comp'
cases = {
    'le': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True))]),
    'be': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(False))]),
    'ifd1gps': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True, gps_in_ifd1=True))]),
    'ptr_out': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True, gps_ptr_off=0xFFFFFFF0))]),
    'count_huge': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True, gps_count=0xFFFF))]),
    'loop': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True, loop=True))]),
    'xmp': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True)), app(0xE1, xmp)]),
    'irb_iptc_city': with_segments(j, [app(0xED, irb)]),
    # a JFIF APP0 whose length lies (too long by 1): the parser stops, GPS after it stays
    'lying_len_before_exif': j[:2] + b'\xff\xe0\x00\x11JFIF\0\x01\x01\0\0\x01\0\x01\0\0' + app(0xE1, b'Exif\0\0' + tiff(True)) + j[2:],
    # padding 0x00 between segments
    'pad_before_exif': j[:2] + b'\x00' + app(0xE1, b'Exif\0\0' + tiff(True)) + j[2:],
    'truncated': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True))])[:60],
    # MPF: a second JPEG with its own GPS EXIF appended after the first image's EOI
    'mpf_secondary': with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True))]) + with_segments(j, [app(0xE1, b'Exif\0\0' + tiff(True))]),
}
for k, v in cases.items():
    open(os.path.join(OUT, k + '.jpg'), 'wb').write(v)
print('\n'.join(cases))
