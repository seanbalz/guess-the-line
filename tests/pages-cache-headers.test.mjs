// Contract: Vite's content-hashed build output under /assets/ is cached for a year and never revalidated (a new build
// gets new names), while the page, the service worker and the unhashed public files keep revalidating.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const headers = fs.readFileSync(new URL('../web/public/_headers', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const rules = Object.fromEntries(headers.trim().split(/\n(?=\S)/).map(block => {
  const [path, ...lines] = block.split('\n');
  return [path.trim(), Object.fromEntries(lines.filter(Boolean).map(line => line.trim().split(/:\s(.+)/).slice(0, 2)))];
}));

test('hashed build assets are immutable for a year', () => {
  assert.equal(rules['/assets/*']?.['Cache-Control'], 'public, max-age=31536000, immutable');
});

test('the page and the service worker still revalidate, and no other path is made immutable', () => {
  assert.equal(rules['/index.html']['Cache-Control'], 'no-cache');
  assert.equal(rules['/sw.js']['Cache-Control'], 'no-cache');
  assert.equal(rules['/*']['Cache-Control'], undefined, 'unhashed public files (icons, team logos) are not pinned');
  for (const [path, values] of Object.entries(rules)) if (path !== '/assets/*') assert.doesNotMatch(values['Cache-Control'] ?? '', /immutable/, path);
});

test('Vite writes hashed files to the default assets directory', () => {
  const config = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /assetsDir|entryFileNames|chunkFileNames|assetFileNames/, 'a custom output layout would need this rule updated');
});
