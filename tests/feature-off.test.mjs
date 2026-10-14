import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEATURES, parseFeatureOff } from '../cloud/feature-off.mjs';

// Gate M off switches (redesign build plan, section 4.2 step 9): the gtl-api secret GTL_FEATURE_OFF names features
// whose writers refuse. Stage 27 adds the first one, `notes` (M-09's POST /personal/note); stage 23 adds `lines` (M-06's two
// readers, which open lines a player could not read before); stage 26 adds `picks`, the new reader M-08 opens
// (POST /community/picks), whose rollback is switching it off; stage 18 adds `lock-in` (M-02's per-game lock-in on a draft).
test('GTL_FEATURE_OFF lists known feature names; anything else, or no secret, turns nothing off', () => {
  assert.deepEqual(Object.keys(FEATURES), ['notes', 'lines', 'picks', 'lock-in']);
  assert.deepEqual([...parseFeatureOff('lines,notes')].sort(), ['lines', 'notes']);
  assert.deepEqual([...parseFeatureOff('Lock-In, lockin')], ['lock-in']);
  assert.ok(Object.isFrozen(FEATURES));
  assert.deepEqual([...parseFeatureOff('notes')], ['notes']);
  assert.deepEqual([...parseFeatureOff(' NOTES , unknown,,')], ['notes']);
  assert.deepEqual([...parseFeatureOff('picks,notes')], ['picks', 'notes']);
  assert.deepEqual([...parseFeatureOff('pick, Picks ')], ['picks']);
  for (const value of [undefined, null, '', 'note', 'constructor', '__proto__', 'toString', 7, ['notes'], { notes: true }]) {
    assert.equal(parseFeatureOff(value).size, 0, `${JSON.stringify(value)} turns nothing off`);
  }
});

test('gtl-api reads the switch from its own secret, and only there', () => {
  const entry = fs.readFileSync(new URL('../supabase/functions/gtl-api/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /featureOff: Deno\.env\.get\('GTL_FEATURE_OFF'\)/);
  for (const file of ['cloud/handler.mjs', 'cloud/personal.mjs', 'cloud/community.mjs', 'cloud/lines.mjs', 'cloud/feature-off.mjs']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /Deno\.env|process\.env/, `${file} reads no environment itself`);
  }
});
