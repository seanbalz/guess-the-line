// D-69 section 4.5: while a layer loads it shows Skeleton blocks in its final shape; no new-app screen announces a bare
// "Loading…" sentence as its only content, and the new app no longer waits on the old app's DeferredScreen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(jsx|js)$/.test(e.name) ? [`${dir}/${e.name}`] : []));

test('loading: no bare role="status" Loading sentence in the new app; Skeleton carries the words for screen readers', () => {
  const offenders = [];
  for (const file of files('web/src/next')) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (/<p(?![^>]*gx-sr-only)[^>]*role="status"[^>]*>\s*(\{[A-Z_]*LOADING[A-Z_]*\}|Loading[^<]*)<\/p>/.test(text)) offenders.push(file);
    if (/FEATURES_COPY\.loading\}<\/p>/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('loading: the new app frames lazy screens with ui/Deferred (a Skeleton), not the old app\'s DeferredScreen', () => {
  const users = files('web/src/next').filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes('DeferredScreen'));
  assert.deepEqual(users, []);
  const deferred = fs.readFileSync(path.join(root, 'web/src/next/ui/Deferred.jsx'), 'utf8');
  assert.match(deferred, /<Skeleton /);
  assert.match(deferred, /<Boundary /);
});
