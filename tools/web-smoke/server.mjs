// A small static server for the web export of the app (`expo export --platform web` writes a single-page app).
//
// Every path that is a file in the export is served as it is. A path with no file extension (/me, /stay/st1, /) is a
// route of the app: it gets index.html, the way a real host rewrites it. A path WITH an extension that is not in the
// export is a 404, not index.html: a missing script or font must show up as a missing file, not as a baffling
// "Unexpected token <" from HTML that was served in its place.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pbf': 'application/x-protobuf',
  '.wasm': 'application/wasm',
};

/** Starts the server on `host:port` (port 0 = any free port). Resolves with { origin, port, close }. */
export async function serveSpa(root, { port = 0, host = '127.0.0.1' } = {}) {
  const base = resolve(root);
  const index = join(base, 'index.html');
  if (!(await stat(index).catch(() => null))?.isFile()) throw new Error(`${index} not found: ${root} is not a web export (run expo export --platform web)`);

  const server = http.createServer(async (req, res) => {
    const send = (status, headers, body) => { res.writeHead(status, { 'cache-control': 'no-store', ...headers }); res.end(body); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { allow: 'GET, HEAD' }, 'method not allowed');
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = resolve(join(base, pathname));
      if (file !== base && !file.startsWith(base + sep)) return send(403, {}, 'forbidden');
      const st = await stat(file).catch(() => null);
      let serve = null;
      if (st?.isFile()) serve = file;
      else if (extname(pathname) === '') serve = index; // a route of the app
      if (!serve) return send(404, { 'content-type': 'text/plain; charset=utf-8' }, `not found: ${pathname}`);
      const size = (await stat(serve)).size;
      res.writeHead(200, { 'content-type': TYPES[extname(serve).toLowerCase()] || 'application/octet-stream', 'content-length': size, 'cache-control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(serve).on('error', () => res.destroy()).pipe(res);
    } catch (e) {
      send(500, { 'content-type': 'text/plain; charset=utf-8' }, String(e && e.message));
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  const actual = server.address().port;
  return {
    origin: `http://${host}:${actual}`,
    port: actual,
    close: () => new Promise((ok) => { server.close(() => ok()); server.closeAllConnections?.(); }),
  };
}
