// D-69 section 4.5: while a layer loads it shows Skeleton blocks in its final shape; no new-app screen announces a bare
// "Loading…" sentence as its only content, and the new app no longer waits on the old app's DeferredScreen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(jsx|js)$/.test(e.name) ? [`${dir}/${e.name}`] : []));

// Two screens keep a deliberately visually hidden status beside visible content (their placeholder or content is
// already on screen); everything else must use a Skeleton, whose words stay for screen readers.
const HIDDEN_STATUS = new Set(['web/src/next/lines/LinesBoard.jsx', 'web/src/next/lines/GameNote.jsx']);
// A <p> or <div role=status> whose only content is Loading text or a {…loading…} expression (copy constant, ternary).
const LOADING_STATUS = /<(p|div)\b[^>]*role="status"[^>]*>\s*(\{(?=[^<]*loading)[^<]*\}|Loading[^<]*)\s*<\/\1>/i;

test('loading: no bare role="status" Loading sentence in the new app; Skeleton carries the words for screen readers', () => {
  const offenders = [];
  for (const file of files('web/src/next')) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (!HIDDEN_STATUS.has(file) && LOADING_STATUS.test(text)) offenders.push(file);
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
