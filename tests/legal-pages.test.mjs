import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/index.mjs';
import { createStore } from '../server/store.mjs';
import { scanFrontend } from '../scripts/check-cloud-boundary.mjs';

// Vite copies web/public verbatim into dist, so these files are exactly what Cloudflare Pages serves at /privacy and /terms.
const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'web/public');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const pages = { privacy: 'Privacy Policy', terms: 'Terms of Service' };

test('/privacy and /terms return the static HTML pages from dist, before the SPA fallback', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-legal-'));
  const dist = path.join(dir, 'dist'); fs.mkdirSync(dist);
  for (const name of Object.keys(pages)) fs.copyFileSync(path.join(pub, `${name}.html`), path.join(dist, `${name}.html`));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  const server = createServer(createStore(path.join(dir, 'state.json'), () => Date.parse('2026-10-12T16:00:00Z')), { dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, heading] of Object.entries(pages)) for (const route of [`/${name}`, `/${name}.html`]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/html/, route);
    assert.match(await response.text(), new RegExp(`<h1>${heading}</h1>`), route);
  }
  assert.match(await (await fetch(base + '/not-a-page')).text(), /<title>spa<\/title>/, 'other routes still fall back to the app');
});

test('the legal pages are self-contained, accurate on the essentials and use only brand token colors', () => {
  const allowed = new Set([...Object.values(tokens.colors), ...Object.values(tokens.themes.light), ...Object.values(tokens.themes.dark)].map(value => value.toUpperCase()));
  for (const name of Object.keys(pages)) {
    const html = fs.readFileSync(path.join(pub, `${name}.html`), 'utf8');
    assert.doesNotMatch(html, /<script/i, `${name}: must work without JavaScript and under script-src 'self'`);
    assert.doesNotMatch(html, /<link[^>]+stylesheet/i, `${name}: styles stay inline`);
    assert.doesNotMatch(html, /https?:\/\//, `${name}: no external resources or links`);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /prefers-color-scheme:light/, `${name}: light theme follows the device`);
    assert.match(html, /Effective October 14, 2026/);
    assert.match(html, /mailto:sbalsiger2@gmail\.com/);
    assert.match(html, /href="\/"/, `${name}: links back to the app`);
    for (const [hex] of html.matchAll(/#[0-9A-Fa-f]{6}\b/g)) assert.ok(allowed.has(hex.toUpperCase()), `${name}: ${hex} is not a design token color`);
  }
  const privacy = fs.readFileSync(path.join(pub, 'privacy.html'), 'utf8');
  for (const phrase of ['Supabase', 'Cloudflare', 'Google', 'Google Fonts', 'Open-Meteo', 'do not sell', 'Solo journal is private', 'notes on games']) assert.ok(privacy.includes(phrase), `privacy mentions ${phrase}`);
  // D-42 (Sean, October 14, 2026: "Always keep the name"): a deleted account's past entries stay under the display name.
  assert.match(privacy, /remove your sign-in details and email address; your past game entries stay under your display name/);
  assert.doesNotMatch(privacy, /anonymous label|anonymi[sz]e/i, 'D-42: deletion never swaps the name for an anonymous label');
  const terms = fs.readFileSync(path.join(pub, 'terms.html'), 'utf8');
  for (const phrase of ['not a sportsbook', 'may be wrong, delayed or missing', 'as is']) assert.ok(terms.includes(phrase), `terms mentions ${phrase}`);
  // D-46: the official team logos carry their trademark notice.
  assert.ok(terms.includes('NFL and team names, logos and marks are trademarks of the NFL and its teams; used here only to identify the teams. No endorsement.'), 'terms carries the D-46 trademark notice');
});

test('the frontend email guard allows a contact address only as a mailto: link on the top-level legal pages', () => {
  const scan = files => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-legal-scan-'));
    try {
      for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); }
      scanFrontend(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const linked = '<a href="mailto:owner@realmail.co">owner@realmail.co</a>';
  assert.doesNotThrow(() => scan({ 'privacy.html': linked, 'terms.html': linked }));
  assert.throws(() => scan({ 'privacy.html': 'owner@realmail.co' }), /Non-example email/);
  // D-42 ("allow it on those two pages"): each address must itself be a mailto: link; a linked one does not excuse another.
  assert.throws(() => scan({ 'terms.html': `${linked} other@realmail.co` }), /Non-example email/);
  assert.throws(() => scan({ 'index.html': linked }), /Non-example email/);
  assert.throws(() => scan({ 'assets/privacy.html': linked }), /Non-example email/);
  const built = path.join(os.tmpdir(), `gtl-legal-built-${process.pid}`);
  fs.mkdirSync(built, { recursive: true });
  try {
    for (const name of Object.keys(pages)) fs.copyFileSync(path.join(pub, `${name}.html`), path.join(built, `${name}.html`));
    assert.doesNotThrow(() => scanFrontend(built), 'the shipped legal pages pass the frontend boundary scan');
  } finally { fs.rmSync(built, { recursive: true, force: true }); }
});
