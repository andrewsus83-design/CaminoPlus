"""The picture files of the store build: the iOS app icon, the Android icon layers, the launch mark and the Play Store icon.

They come from the brand SVG files (brand/svg/app-icon) through `node tools/export_app_icons.mjs`, and nowhere else. This test reads the PNG files with
the standard library only (no Pillow, no Node) and pins what the stores and the phones require of each one:

  * the iOS icon is 1024 x 1024 RGB with no alpha channel and no tRNS chunk (App Store Connect refuses an icon with transparency), and its corners are
    square, that is the brand blue all the way into the corner (iOS rounds them itself);
  * the Android icon layers are 1024 x 1024, the front layer and the themed (monochrome) layer have an alpha channel, nothing of their art is outside the
    safe circle of 66 dp in 108 dp (61 percent of the width), and the back layer is opaque;
  * the launch mark is RGBA, transparent around the mark and fits the circle Android 12 shows (192 dp of the 200 dp the mark is drawn in);
  * the Play Store icon is 512 x 512, 32-bit PNG with alpha (colour type 6), a full square, and smaller than 1 MB;
  * none of them is the picture create-expo-app made (the hashes of those files are below);
  * brand/store/exported-icons.json, written by the exporter, still says what the files are: an SVG that changed without a new export, a PNG that was
    edited by hand, or an exporter that changed without a new run fails here.

Run from the repository root:  python3 -m unittest discover -s tools/tests -v
"""
import hashlib
import json
import math
import pathlib
import struct
import unittest
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
MANIFEST = "brand/store/exported-icons.json"

NAVY = (0x14, 0x36, 0x5D)  # Atlantic Blue, the brand's icon colour
SAFE_RADIUS = 33 / 108  # Android: the safe circle is 66 dp of the 108 dp layer, as a share of the width (radius)

ICON = "mobile/assets/icon.png"
FOREGROUND = "mobile/assets/android-icon-foreground.png"
BACKGROUND = "mobile/assets/android-icon-background.png"
MONOCHROME = "mobile/assets/android-icon-monochrome.png"
SPLASH = "mobile/assets/splash-icon.png"
PLAY = "brand/store/play-store-icon-512.png"

RGB, RGBA = 2, 6  # PNG colour types

# The five pictures of the Expo template (a blue chevron on guide lines), as they were on main at release 1.1.0.
TEMPLATE_SHA256 = {
    ICON: "119462bb78eb240a65c869fc067ee599639b3cb5a41953f25c07b17d2a8c7e0f",
    FOREGROUND: "9e3d0315a33c6799de601dd34cd8bf8cc3a8d16f3bf75592baec2ceb7240b391",
    BACKGROUND: "fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d",
    MONOCHROME: "6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83",
    SPLASH: "5f4c0a732b6325bf4071d9124d2ae67e037cb24fcc9c482ef82bea742109a3b8",
}


def sha256(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()


class Png:
    """Header, chunks and (when asked) the pixel rows of an 8-bit PNG, read with zlib and struct."""

    def __init__(self, rel: str):
        self.rel = rel
        self.data = (ROOT / rel).read_bytes()
        if self.data[:8] != b"\x89PNG\r\n\x1a\n":
            raise AssertionError(f"{rel} is not a PNG file")
        self.chunks: list[tuple[bytes, bytes]] = []
        pos = 8
        while pos < len(self.data):
            (length,) = struct.unpack(">I", self.data[pos : pos + 4])
            kind = self.data[pos + 4 : pos + 8]
            body = self.data[pos + 8 : pos + 8 + length]
            (crc,) = struct.unpack(">I", self.data[pos + 8 + length : pos + 12 + length])
            if zlib.crc32(kind + body) != crc:
                raise AssertionError(f"{rel}: the {kind.decode('latin1')} chunk has a wrong checksum")
            self.chunks.append((kind, body))
            pos += 12 + length
        if not self.chunks or self.chunks[0][0] != b"IHDR" or self.chunks[-1][0] != b"IEND":
            raise AssertionError(f"{rel}: the chunks do not start with IHDR and end with IEND")
        self.width, self.height, self.depth, self.colour_type, _compression, _filter, self.interlace = struct.unpack(">IIBBBBB", self.chunks[0][1])
        self._rows: list[bytearray] | None = None

    @property
    def kinds(self) -> list[str]:
        return [k.decode("latin1") for k, _ in self.chunks]

    @property
    def channels(self) -> int:
        return {RGB: 3, RGBA: 4}[self.colour_type]

    @property
    def rows(self) -> list[bytearray]:
        if self._rows is None:
            stride = self.width * self.channels
            raw = zlib.decompress(b"".join(body for kind, body in self.chunks if kind == b"IDAT"))
            rows: list[bytearray] = []
            prev = bytearray(stride)
            pos = 0
            for _ in range(self.height):
                flt = raw[pos]
                line = bytearray(raw[pos + 1 : pos + 1 + stride])
                pos += 1 + stride
                bpp = self.channels
                if flt == 1:
                    for i in range(bpp, stride):
                        line[i] = (line[i] + line[i - bpp]) & 255
                elif flt == 2:
                    for i in range(stride):
                        line[i] = (line[i] + prev[i]) & 255
                elif flt == 3:
                    for i in range(stride):
                        left = line[i - bpp] if i >= bpp else 0
                        line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
                elif flt == 4:
                    for i in range(stride):
                        a = line[i - bpp] if i >= bpp else 0
                        b = prev[i]
                        c = prev[i - bpp] if i >= bpp else 0
                        pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                        pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                        line[i] = (line[i] + pred) & 255
                elif flt != 0:
                    raise AssertionError(f"{self.rel}: unknown PNG filter {flt}")
                rows.append(line)
                prev = line
            self._rows = rows
        return self._rows

    def pixel(self, x: int, y: int) -> tuple[int, ...]:
        row = self.rows[y]
        return tuple(row[x * self.channels : (x + 1) * self.channels])

    def farthest_visible_pixel(self) -> float:
        """How far from the centre (in pixels) the farthest pixel with an alpha above 0 is. Only for RGBA files."""
        centre = self.width / 2
        far = 0.0
        for y, row in enumerate(self.rows):
            alpha = bytes(row[3::4])
            solid = alpha.lstrip(b"\x00")
            if not solid:
                continue
            left = len(alpha) - len(solid)
            right = len(alpha.rstrip(b"\x00")) - 1
            far = max(far, *(math.hypot(x + 0.5 - centre, y + 0.5 - self.height / 2) for x in (left, right)))
        return far

    def has_opaque_pixel(self) -> bool:
        return any(255 in bytes(row[3::4]) for row in self.rows)


class IosIcon(unittest.TestCase):
    def test_it_is_1024_rgb_without_any_transparency(self):
        png = Png(ICON)
        self.assertEqual((png.width, png.height), (1024, 1024))
        self.assertEqual((png.depth, png.interlace), (8, 0))
        self.assertEqual(png.colour_type, RGB, "the iOS icon must have no alpha channel: App Store Connect refuses an icon with transparency")
        for forbidden in ("tRNS", "PLTE"):
            self.assertNotIn(forbidden, png.kinds, f"the iOS icon has a {forbidden} chunk")

    def test_the_corners_are_square(self):
        # iOS rounds the corners itself. A picture that is already rounded would show its background (or black) in the corner.
        png = Png(ICON)
        for x, y in ((0, 0), (1023, 0), (0, 1023), (1023, 1023), (512, 0), (0, 512), (1023, 512), (512, 1023)):
            self.assertEqual(png.pixel(x, y), NAVY, f"the pixel at {x},{y} of the iOS icon is not the brand blue")

    def test_the_shell_is_in_the_middle(self):
        png = Png(ICON)
        gold = [png.pixel(x, 512) for x in range(300, 724) if png.pixel(x, 512) != NAVY]
        self.assertTrue(gold, "no shell pixel on the middle row of the iOS icon")


class AndroidIcon(unittest.TestCase):
    def test_the_three_layers_are_1024(self):
        for rel, colour_type in ((FOREGROUND, RGBA), (BACKGROUND, RGB), (MONOCHROME, RGBA)):
            png = Png(rel)
            self.assertEqual((png.width, png.height, png.depth, png.interlace), (1024, 1024, 8, 0), rel)
            self.assertEqual(png.colour_type, colour_type, rel)

    def test_the_front_layer_and_the_themed_layer_keep_their_art_inside_the_safe_circle(self):
        limit = SAFE_RADIUS * 1024
        for rel in (FOREGROUND, MONOCHROME):
            png = Png(rel)
            self.assertEqual(png.pixel(0, 0)[3], 0, f"{rel}: the corner is not transparent")
            self.assertTrue(png.has_opaque_pixel(), f"{rel}: nothing is drawn")
            far = png.farthest_visible_pixel()
            self.assertLessEqual(far, limit, f"{rel}: the art reaches {far:.0f} px from the centre, the safe circle of an Android icon ends at {limit:.0f} px")

    def test_the_themed_layer_is_one_colour(self):
        # Android 13 colours the layer itself and only reads its alpha; the colour under it must not be a picture.
        png = Png(MONOCHROME)
        for y, row in enumerate(png.rows):
            for plane in (0, 1, 2):
                self.assertEqual(bytes(row[plane::4]).count(0), png.width, f"the themed icon layer must be black pixels with an alpha (row {y})")

    def test_the_back_layer_is_the_opaque_brand_blue(self):
        png = Png(BACKGROUND)
        for x, y in ((0, 0), (1023, 1023), (512, 512)):
            self.assertEqual(png.pixel(x, y), NAVY)


class LaunchMark(unittest.TestCase):
    def test_it_is_transparent_around_a_mark_that_fits_the_android_12_circle(self):
        png = Png(SPLASH)
        self.assertEqual((png.width, png.height, png.colour_type, png.depth, png.interlace), (1024, 1024, RGBA, 8, 0))
        for x, y in ((0, 0), (1023, 0), (0, 1023), (1023, 1023)):
            self.assertEqual(png.pixel(x, y)[3], 0, f"the corner {x},{y} of the launch mark is not transparent")
        self.assertEqual(png.pixel(512, 512)[3], 255)
        far = png.farthest_visible_pixel()
        # expo-splash-screen draws the 1024 picture 200 dp wide; on Android 12 the phone shows a circle of 192 dp of it.
        self.assertLessEqual(far, 1024 * 192 / 200 / 2, "the mark is wider than the circle Android 12 shows")
        self.assertGreaterEqual(far, 1024 * 0.2, "the mark is too small to be seen at 200 dp")


class PlayStoreIcon(unittest.TestCase):
    def test_it_is_512_with_alpha_and_under_a_megabyte(self):
        png = Png(PLAY)
        self.assertEqual((png.width, png.height, png.depth, png.interlace), (512, 512, 8, 0))
        self.assertEqual(png.colour_type, RGBA, "Google Play asks for a 32-bit PNG with alpha")
        self.assertLess(len(png.data), 1024 * 1024, "Google Play's limit for the icon is 1024 KB")

    def test_it_is_a_full_square_without_rounded_corners(self):
        png = Png(PLAY)
        for x, y in ((0, 0), (511, 0), (0, 511), (511, 511)):
            self.assertEqual(png.pixel(x, y), (*NAVY, 255), f"the corner {x},{y} of the Play Store icon is not the opaque brand blue")

    def test_it_is_not_inside_the_app_bundle(self):
        self.assertFalse((ROOT / "mobile" / "assets" / "play-store-icon-512.png").exists())
        self.assertIn("play-store-icon-512.png", (ROOT / "brand/store/README.md").read_text(encoding="utf-8"), "brand/store/README.md says what the file is")


class NotTheTemplate(unittest.TestCase):
    def test_no_picture_is_one_of_the_template_images(self):
        for rel, template in TEMPLATE_SHA256.items():
            self.assertNotEqual(sha256(rel), template, f"{rel} is still the create-expo-app picture: run node tools/export_app_icons.mjs")

    def test_the_sizes_are_not_the_template_sizes(self):
        # The template's Android layers are 512 and 432 px, its launch picture a palette PNG.
        self.assertEqual(Png(FOREGROUND).width, 1024)
        self.assertEqual(Png(MONOCHROME).width, 1024)
        self.assertEqual(Png(SPLASH).colour_type, RGBA)


class ExportManifest(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((ROOT / MANIFEST).read_text(encoding="utf-8"))

    def test_it_lists_every_exported_file(self):
        self.assertEqual({f["png"] for f in self.manifest["files"]}, {ICON, FOREGROUND, BACKGROUND, MONOCHROME, SPLASH, PLAY})

    def test_every_png_and_svg_is_the_one_the_exporter_wrote(self):
        for f in self.manifest["files"]:
            self.assertEqual(sha256(f["svg"]), f["svgSha256"], f"{f['svg']} changed since the last export: run node tools/export_app_icons.mjs and commit the PNG files")
            self.assertEqual(sha256(f["png"]), f["pngSha256"], f"{f['png']} is not what the exporter wrote (edited by hand?): run node tools/export_app_icons.mjs")
            png = Png(f["png"])
            self.assertEqual((png.width, png.height, png.colour_type), (f["width"], f["height"], f["colorType"]), f["png"])

    def test_the_exporter_has_not_changed_since_it_ran(self):
        exporter = self.manifest["exporter"]
        self.assertEqual(exporter["path"], "tools/export_app_icons.mjs")
        self.assertEqual(sha256(exporter["path"]), exporter["sha256"], "tools/export_app_icons.mjs changed after the last export: run it again and commit the result")


if __name__ == "__main__":
    unittest.main()
