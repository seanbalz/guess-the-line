// Stage 1 of the dashboard design handoff (Sean's decision of October 12, 2026): Inter, Barlow Condensed
// and IBM Plex Mono load from Google Fonts with font-display: swap; no font file is distributed, and
// both content security policies allow exactly the two Google Fonts origins and nothing else new.
// Redesign stage 6 (D-38): the new app adds Figtree, Big Shoulders Display and Barlow Condensed from
// the same two origins when it mounts, so the policies stay exactly as they are. web/index.html keeps
// the old app's fonts until the flip (stage 80).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from '../server/index.mjs';
import { createStore } from '../server/store.mjs';
import { NEXT_FONT_ORIGIN, NEXT_FONT_STYLESHEET, addNextFontLinks } from '../web/src/next/styles/fonts.js';

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

test('the Google Fonts stylesheet never blocks the first paint: it loads as print and the app applies it to the screen', () => {
  // Lighthouse mobile (October 26, 2026, local build): first paint 2.11 s to 1.81 s, layout shift unchanged at 0.
  assert.match(read('web/index.html'), /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" media="print" data-gtl-fonts\/>/);
  assert.match(read('web/src/main.jsx'), /document\.querySelector\('link\[data-gtl-fonts\]'\)\?\.setAttribute\('media', 'all'\);/);
});

test('the font tokens keep the brand guide system fallbacks behind each webfont', () => {
  const { fonts } = JSON.parse(read('design/tokens.json'));
  assert.match(fonts.body, /^Inter, system-ui, -apple-system, Segoe UI, sans-serif$/);
  assert.match(fonts.display, /^Barlow Condensed, Impact, Arial Narrow, sans-serif$/);
  assert.match(fonts.mono, /^IBM Plex Mono, ui-monospace, SFMono-Regular, monospace$/);
});

test('the new app (D-38) loads Figtree, Big Shoulders Display and Barlow Condensed from Google Fonts with display=swap', () => {
  const tokens = JSON.parse(read('design/tokens-next.json'));
  assert.equal(NEXT_FONT_STYLESHEET, tokens.webfonts.stylesheet, 'fonts.js and tokens-next.json name the same stylesheet');
  assert.equal(NEXT_FONT_ORIGIN, tokens.webfonts.preconnect);
  const url = new URL(NEXT_FONT_STYLESHEET);
  assert.equal(url.origin, 'https://fonts.googleapis.com');
  assert.equal(url.pathname, '/css2');
  const weights = Object.fromEntries(url.searchParams.getAll('family').map(value => {
    const [family, axes] = value.split(':');
    assert.match(axes, /^wght@\d{3}(;\d{3})*$/, `${family} asks for static weights only`);
    return [family, axes.slice('wght@'.length).split(';').map(Number)];
  }));
  assert.deepEqual(Object.keys(weights).sort(), ['Barlow Condensed', 'Big Shoulders Display', 'Figtree']);
  assert.deepEqual(weights, tokens.webfonts.weights);
  assert.equal(url.searchParams.get('display'), 'swap');
  assert.equal(NEXT_FONT_ORIGIN, 'https://fonts.gstatic.com');
  // The old app's link is unchanged until the flip.
  assert.doesNotMatch(read('web/index.html'), /Figtree|Big\+Shoulders/);
});

test('addNextFontLinks adds the preconnect and stylesheet once', () => {
  const links = [];
  const head = { querySelectorAll: () => links, appendChild: link => links.push(link) };
  const doc = { head, createElement: () => { const attributes = new Map(); return { setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name) ?? null }; } };
  assert.equal(addNextFontLinks(doc), 2);
  assert.equal(addNextFontLinks(doc), 0, 'a second mount adds nothing');
  assert.deepEqual(links.map(link => [link.getAttribute('rel'), link.getAttribute('href'), link.getAttribute('crossorigin')]), [
    ['preconnect', 'https://fonts.gstatic.com', ''],
    ['stylesheet', NEXT_FONT_STYLESHEET, null],
  ]);
  assert.equal(addNextFontLinks({}), 0, 'no document, no links');
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
