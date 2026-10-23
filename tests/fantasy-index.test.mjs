// Contract: content-addressed names; the index is replaced last and only names files that exist; superseded copies are
// pruned to the newest three per week; malformed indexes are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFileName, reviewFileName, updateFantasyIndex, validateFantasyIndex, assetsToPrune, publishPlan } from '../shared/fantasy-index.mjs';

const sha = c => c.repeat(64);
const snap = (week, c, over = {}) => ({ week, file: snapshotFileName(2026, week, sha(c)), sha256: sha(c), bytes: 900000, generatedAt: '2026-10-20T11:00:00Z', statsThroughWeek: week - 1, publishedAfterFreeze: false, rosterFallbackTeams: 0, ...over });
const rev = (week, c, status = 'PROVISIONAL') => ({ week, file: reviewFileName(2026, week, sha(c)), sha256: sha(c), bytes: 50000, generatedAt: '2026-10-20T11:00:00Z', status });

test('file names carry season, two-digit week and the first eight checksum characters', () => {
  assert.equal(snapshotFileName(2026, 8, sha('a')), '2026-week-08.aaaaaaaa.json');
  assert.equal(reviewFileName(2026, 7, sha('b')), '2026-review-week-07.bbbbbbbb.json');
});

test('updating replaces one week, keeps the rest, sorts, and validates', () => {
  const first = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  const next = updateFantasyIndex(first, { season: 2026, snapshot: snap(7, 'c'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  assert.deepEqual(next.snapshots.map(e => e.sha256), [sha('c')]);
  assert.equal(next.reviews.length, 1);
  assert.equal(validateFantasyIndex(next).valid, true);
  assert.throws(() => updateFantasyIndex(next, { season: 2027, snapshot: null, review: null, updatedAt: '2027-09-01T00:00:00Z' }), /season/);
});

test('validation refuses wrong names, oversize files, duplicate weeks and unknown statuses', () => {
  const ok = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  for (const broken of [
    { ...ok, snapshots: [{ ...snap(7, 'a'), file: '../index.json' }] },
    { ...ok, snapshots: [{ ...snap(7, 'a'), file: snapshotFileName(2026, 8, sha('a')) }] },
    { ...ok, snapshots: [snap(7, 'a', { bytes: 3_000_001 })] },
    { ...ok, snapshots: [snap(7, 'a'), snap(7, 'c')] },
    { ...ok, reviews: [rev(6, 'b', 'DONE')] },
    { ...ok, schemaVersion: 2 },
  ]) assert.equal(validateFantasyIndex(broken).valid, false);
});

test('pruning keeps indexed files and the three newest superseded copies per week', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'f'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  const assets = ['a', 'b', 'c', 'd', 'e', 'f'].map((c, i) => ({ name: snapshotFileName(2026, 7, sha(c)), createdAt: `2026-10-1${i}T11:00:00Z` }))
    .concat([{ name: 'index.json', createdAt: '2026-10-21T11:00:00Z' }]);
  assert.deepEqual(assetsToPrune(assets, index), [snapshotFileName(2026, 7, sha('a')), snapshotFileName(2026, 7, sha('b'))]);
});

test('publish order: new data files without clobber, then index.json with clobber, then prunes', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  const steps = publishPlan({ files: [index.snapshots[0].file, index.reviews[0].file], existing: [index.reviews[0].file], index, assets: [] });
  assert.deepEqual(steps, [
    { action: 'upload', name: index.snapshots[0].file, clobber: false },
    { action: 'upload', name: 'index.json', clobber: true },
  ]);
});

test('publishing refuses an index that names a file neither uploaded nor already present, or an invalid index', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  assert.throws(() => publishPlan({ files: [index.snapshots[0].file], existing: [], index, assets: [] }), /names missing files: 2026-review-week-06\.bbbbbbbb\.json/);
  assert.throws(() => publishPlan({ files: [], existing: [], index: { ...index, schemaVersion: 2 }, assets: [] }), /invalid index/);
  assert.equal(validateFantasyIndex({ ...index, snapshots: [{ ...index.snapshots[0], sha256: ['a'.repeat(64)] }] }).valid, false, 'a non-string checksum is refused');
});

test('superseded copies are deleted only after index.json is uploaded', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'f'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  const assets = ['a', 'b', 'c', 'd', 'e'].map((c, i) => ({ name: snapshotFileName(2026, 7, sha(c)), createdAt: `2026-10-1${i}T11:00:00Z` }));
  const steps = publishPlan({ files: [index.snapshots[0].file], existing: assets.map(a => a.name), index, assets });
  assert.deepEqual(steps.map(s => `${s.action}:${s.name}`), [
    `upload:${index.snapshots[0].file}`, 'upload:index.json',
    `delete:${snapshotFileName(2026, 7, sha('a'))}`, `delete:${snapshotFileName(2026, 7, sha('b'))}`,
  ]);
});
