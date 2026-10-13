// Stage 1 of the dashboard design handoff (Sean's decision of October 12, 2026): Inter, Barlow Condensed
// and IBM Plex Mono load from Google Fonts with font-display: swap; no font file is distributed, and
// both content security policies allow exactly the two Google Fonts origins and nothing else new.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from '../server/index.mjs';
import { createStore } from '../server/store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const directives = csp => Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));

test('index.html loads the three OFL families from Google Fonts with display=swap', () => {
  const html = read('web/index.html');
  const href = html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/)?.[1];
  assert.ok(href, 'the Google Fonts stylesheet link is present');
  const url = new URL(href.replaceAll('&amp;', '&'));
  const families = url.searchParams.getAll('family').map(value => value.split(':')[0]);
  assert.deepEqual(families.sort(), ['Barlow Condensed', 'IBM Plex Mono', 'Inter']);
  assert.equal(url.searchParams.get('display'), 'swap');
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin\/>/);
});

test('the font tokens keep the brand guide system fallbacks behind each webfont', () => {
  const { fonts } = JSON.parse(read('design/tokens.json'));
  assert.match(fonts.body, /^Inter, system-ui, -apple-system, Segoe UI, sans-serif$/);
  assert.match(fonts.display, /^Barlow Condensed, Impact, Arial Narrow, sans-serif$/);
  assert.match(fonts.mono, /^IBM Plex Mono, ui-monospace, SFMono-Regular, monospace$/);
});

test('the Pages and local content security policies allow only the two Google Fonts origins', async t => {
  const pages = read('web/public/_headers').match(/Content-Security-Policy: (.+)/)[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-csp-'));
  const server = createServer(createStore(path.join(dir, 'state.json'), () => Date.parse('2026-10-08T16:00:00Z')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const local = (await fetch(`http://127.0.0.1:${server.address().port}/api/state?player=troy`)).headers.get('content-security-policy');
  for (const [name, csp] of [['Pages', pages], ['local', local]]) {
    const policy = directives(csp);
    assert.deepEqual(policy['style-src'], ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], `${name} style-src`);
    assert.deepEqual(policy['font-src'], ["'self'", 'https://fonts.gstatic.com'], `${name} font-src`);
    assert.deepEqual(policy['script-src'], ["'self'"], `${name} script-src stays self-only`);
    assert.deepEqual(policy['default-src'], ["'self'"], `${name} default-src stays self-only`);
  }
});

test('no font file is distributed from the repository', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter(file => /\.(woff2?|ttf|otf|eot)$/i.test(file)), []);
});
