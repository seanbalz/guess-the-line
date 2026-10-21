import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotModule } from '../scripts/prepare-trends-research.mjs';
const fixture = () => ({ version: 'fixture', generatedAt: '2026-10-21T12:00:00.000Z', season: 2026,
  source: { sha256: 'test', latestCompleted: '2026-10-19' }, candidates: [],
  targets: [{ played: false, spread: null, total: null, homeScore: null, awayScore: null, referee: null, wind: null, temp: null }] });
test('prepared snapshot module decodes exactly and caches its public dataset', async () => {
  const input = fixture();
  const source = snapshotModule(input);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.deepEqual(await mod.default(), input);
  assert.equal(await mod.default(), await mod.default());
  assert.equal(mod.snapshotMetadata.generatedAt, input.generatedAt);
});
test('snapshot writer refuses unplayed line, score, weather, referee and player data', () => {
  for (const [key, value] of Object.entries({ spread: -3, total: 45, homeScore: 21, awayScore: 17, wind: 10, temp: 60, referee: 'name', oddsHome: -110, mlAway: 120 })) {
    const input = fixture(); input.targets[0][key] = value;
    assert.throws(() => snapshotModule(input), /redacted/);
  }
  for (const key of ['userId', 'picks', 'reviewedFeed', 'trent']) {
    const input = fixture(); input[key] = 'private';
    assert.throws(() => snapshotModule(input), /Unexpected/);
  }
});
test('snapshot loader decodes only the selected period and bounds its period cache', async () => {
  const input = fixture();
  input.candidates = [{ id: 'one', periods: {
    recent30: { record: { sample: 30 } }, recent25: { record: { sample: 25 } }, all: { record: { sample: 500 } },
  } }];
  const mod = await import('data:text/javascript;base64,' + Buffer.from(snapshotModule(input)).toString('base64'));
  const first = await mod.default('recent30');
  assert.deepEqual(Object.keys(first.candidates[0].periods), ['recent30']);
  assert.equal(first.candidates[0].periods.recent30.record.sample, 30);
  assert.equal(await mod.default('recent30'), first);
  await mod.default('recent25');
  assert.equal((await mod.default('all')).candidates[0].periods.all.record.sample, 500);
  assert.notEqual(await mod.default('recent30'), first, 'third period evicts the oldest cached period');
  await assert.rejects(mod.default('unexpected'), /Unknown research period/);
});
