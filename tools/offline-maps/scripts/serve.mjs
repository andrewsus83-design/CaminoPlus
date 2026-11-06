// Tiny static server for the viewer (ES modules and range requests need http://,
// not file://). Serves tools/offline-maps on http://localhost:8787 with HTTP
// Range support, which is how MapLibre reads a .pmtiles file by URL.
// Dev tool: listens on 127.0.0.1 only.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json',
  '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream',
};

const GLYPH_RANGE = /^\/viewer\/glyphs\/[^/]+\/\d+-\d+\.pbf$/;

// Maps a request URL to a file under root: {file, pathname}, or {status} (400 for a bad escape,
// since "%zz" makes decodeURIComponent throw, or a NUL byte; 403 for anything outside root).
// normalize() already folds "/../.." into root; the separator check below is a second fence.
export function resolveRequest(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://x').pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, clean.endsWith('/') ? clean + 'index.html' : clean);
  // "root + sep": a sibling folder named like the root must not match.
  if (file !== root && !file.startsWith(root + sep)) return { status: 403 };
  return { file, pathname };
}

export function serve(port = Number(process.env.PORT) || 8787) {
  const server = createServer(async (req, res) => {
    try {
      const hit = resolveRequest(req.url || '/');
      if (!hit.file) { res.writeHead(hit.status).end(); return; }
      const { file } = hit;
      let st;
      try { st = await stat(file); } catch {
        // Glyph ranges we do not ship (for example the triangle in the peak label) answer with an
        // empty file, exactly like the app does on the device: "no glyphs in this range", not an error.
        if (GLYPH_RANGE.test(hit.pathname)) { res.writeHead(200, { 'Content-Type': TYPES['.pbf'], 'Content-Length': 0 }).end(); return; }
        res.writeHead(404).end('not found');
        return;
      }
      if (!st.isFile()) { res.writeHead(404).end(); return; }
      const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      let start = 0;
      let end = st.size - 1;
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
        end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
          return;
        }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': st.size });
      }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (e) {
      // Never let a request kill the dev server (an async handler error is an unhandled rejection).
      console.error('serve:', e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await serve();
  console.log(`viewer: http://localhost:${s.address().port}/viewer/`);
  console.log('  open a .pmtiles with the button, or add ?pack=../dist/<file>.pmtiles&route=../dist/<slug>.route.geojson&corridor=../dist/<file>.corridor.geojson');
}
