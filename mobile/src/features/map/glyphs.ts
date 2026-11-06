// Map labels need SDF glyphs. They are bundled (assets/glyphs, Noto Sans, OFL) and
// copied once to <documents>/glyphs/<font>/<range>.pbf, so labels render with no
// network on both platforms. The style's glyphs URL is a file:// template.
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

const FILES = {
  'Noto Sans Regular': {
    '0-255': require('../../../assets/glyphs/noto-sans-regular-0-255.pbf'),
    '256-511': require('../../../assets/glyphs/noto-sans-regular-256-511.pbf'),
    '8192-8447': require('../../../assets/glyphs/noto-sans-regular-8192-8447.pbf'),
  },
  'Noto Sans Medium': {
    '0-255': require('../../../assets/glyphs/noto-sans-medium-0-255.pbf'),
    '256-511': require('../../../assets/glyphs/noto-sans-medium-256-511.pbf'),
    '8192-8447': require('../../../assets/glyphs/noto-sans-medium-8192-8447.pbf'),
  },
  'Noto Sans Italic': {
    '0-255': require('../../../assets/glyphs/noto-sans-italic-0-255.pbf'),
    '256-511': require('../../../assets/glyphs/noto-sans-italic-256-511.pbf'),
    '8192-8447': require('../../../assets/glyphs/noto-sans-italic-8192-8447.pbf'),
  },
} as const;

const VERSION = '2';
const root = () => new Directory(Paths.document, 'glyphs');

let ready: Promise<string> | null = null;

/** Resolves to the style "glyphs" URL once the files are on disk. */
export function ensureGlyphs(): Promise<string> {
  ready ??= install().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function install() {
  const dir = root();
  const marker = new File(dir, `.v${VERSION}`);
  if (!marker.exists) {
    dir.create({ intermediates: true, idempotent: true });
    for (const [font, ranges] of Object.entries(FILES)) {
      const fontDir = new Directory(dir, font);
      fontDir.create({ intermediates: true, idempotent: true });
      for (const [range, mod] of Object.entries(ranges)) {
        const asset = await Asset.fromModule(mod).downloadAsync();
        if (!asset.localUri) throw new Error(`glyph asset ${font} ${range} has no local file`);
        const target = new File(fontDir, `${range}.pbf`);
        if (target.exists) target.delete();
        new File(asset.localUri).copySync(target);
      }
      // Every other range gets an empty glyph file. An empty file is a valid "no glyphs here"
      // answer, so MapLibre stops logging "Failed to load glyph range" for characters we do not bundle.
      for (let start = 0; start < 65536; start += 256) {
        const range = `${start}-${start + 255}`;
        if (range in ranges) continue;
        const empty = new File(fontDir, `${range}.pbf`);
        if (!empty.exists) empty.create({ overwrite: true });
      }
    }
    marker.create({ overwrite: true });
  }
  // MapLibre fills {fontstack} with the font name (spaces included) and {range}.
  return `${dir.uri.replace(/\/$/, '')}/{fontstack}/{range}.pbf`;
}
