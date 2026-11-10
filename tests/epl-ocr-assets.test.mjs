// EPL stage 3: the self-hosted OCR engine. Only exact copies of the pinned package files skip the frontend text scan, and
// only /ocr/* may compile WebAssembly; every page keeps script-src 'self'.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFrontend } from '../scripts/check-cloud-boundary.mjs';
import { OCR_ASSETS, isPinnedOcrAsset, ocrSource } from '../scripts/ocr-assets.mjs';

test('OCR assets are pinned package files that exist; only an exact copy under ocr/ skips the text scan', t => {
  for (const name of Object.keys(OCR_ASSETS)) assert.ok(fs.existsSync(ocrSource(name)), name);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-ocr-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'ocr'));
  fs.copyFileSync(ocrSource('worker.min.js'), path.join(dir, 'ocr', 'worker.min.js'));
  assert.ok(isPinnedOcrAsset('worker.min.js', path.join(dir, 'ocr', 'worker.min.js')));
  assert.doesNotThrow(() => scanFrontend(dir));
  fs.appendFileSync(path.join(dir, 'ocr', 'worker.min.js'), '\n//# sourceMappingURL=worker.map');
  assert.equal(isPinnedOcrAsset('worker.min.js', path.join(dir, 'ocr', 'worker.min.js')), false);
  assert.throws(() => scanFrontend(dir), /Private material/, 'a changed copy is scanned like any file');
  fs.writeFileSync(path.join(dir, 'ocr', 'other.js'), 'sb_secret_abcdefghijklmnop');
  assert.throws(() => scanFrontend(dir), /Private material/);
});

test('only /ocr/* replaces the page policy, adding wasm-unsafe-eval for the worker alone', async () => {
  const headers = fs.readFileSync('web/public/_headers', 'utf8');
  const block = /\n\/ocr\/\*\n((?: {2}.+\n)+)/.exec(headers)?.[1] ?? '';
  assert.match(block, /^ {2}! Content-Security-Policy$/m);
  assert.match(block, /Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self';/);
  assert.equal(headers.match(/wasm-unsafe-eval/g).length, 1);
  const { createServer } = await import('../server/index.mjs');
  const server = createServer({}, { dist: '/nonexistent-gtl-dist' }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const page = (await fetch(`http://127.0.0.1:${server.address().port}/`)).headers.get('content-security-policy');
    const ocr = (await fetch(`http://127.0.0.1:${server.address().port}/ocr/worker.min.js`)).headers.get('content-security-policy');
    assert.doesNotMatch(page, /wasm-unsafe-eval/);
    assert.match(ocr, /script-src 'self' 'wasm-unsafe-eval'/);
  } finally { server.close(); }
});
