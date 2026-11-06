// The dev server must survive hostile or broken requests (a bad "%" escape used to throw inside the
// async handler: an unhandled rejection that killed the process). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, resolveRequest } from '../scripts/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// http.request with a raw path: fetch() would normalise "%zz" away before it reaches the server.
const get = (port, path, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, headers, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
  });
  req.on('error', reject);
  req.end();
});

async function withServer(fn) {
  const server = await serve(0);
  try {
    await fn(server.address().port);
  } finally {
    server.close();
  }
}

test('a malformed percent escape answers 400 and the server keeps working', () => withServer(async (port) => {
  assert.equal((await get(port, '/%zz')).status, 400);
  assert.equal((await get(port, '/viewer/%E0%A4%A')).status, 400);
  assert.equal((await get(port, '/viewer/%00.html')).status, 400);
  assert.equal((await get(port, '/viewer/')).status, 200); // still alive
}));

test('path traversal never leaves the folder', () => withServer(async (port) => {
  for (const p of ['/../../../etc/passwd', '/..%2f..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '//etc/passwd']) {
    const hit = resolveRequest(p);
    assert.ok(hit.status || hit.file.startsWith(root + sep), `${p} resolved to ${hit.file}`);
    const res = await get(port, p);
    assert.notEqual(res.status, 200, p);
    assert.doesNotMatch(res.body.toString(), /root:/, p);
  }
}));

test('range requests work, a bad range answers 416, unknown glyph ranges answer an empty file', () => withServer(async (port) => {
  const part = await get(port, '/viewer/style.js', { Range: 'bytes=0-9' });
  assert.equal(part.status, 206);
  assert.equal(part.body.length, 10);
  assert.equal((await get(port, '/viewer/style.js', { Range: 'bytes=99999999-' })).status, 416);
  const glyph = await get(port, '/viewer/glyphs/Nope/9472-9727.pbf');
  assert.equal(glyph.status, 200);
  assert.equal(glyph.body.length, 0);
  assert.equal((await get(port, '/viewer/not-there.js')).status, 404);
}));
