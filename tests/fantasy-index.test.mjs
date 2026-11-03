// Contract: content-addressed names; the index is replaced last and only names files that exist; superseded review copies
// are pruned to the newest three per week; a snapshot copy is never pruned, because a Points slate cites whichever copy the
// index named when the worker drafted it; malformed indexes are refused.
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

test('pruning keeps the indexed review and its three newest superseded copies per week, and every snapshot copy', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'f'), review: rev(6, 'f'), updatedAt: '2026-10-21T11:00:00Z' });
  const copies = (name, week) => ['a', 'b', 'c', 'd', 'e', 'f'].map((c, i) => ({ name: name(2026, week, sha(c)), createdAt: `2026-10-1${i}T11:00:00Z` }));
  const assets = [...copies(snapshotFileName, 7), ...copies(reviewFileName, 6), { name: 'index.json', createdAt: '2026-10-21T11:00:00Z' }];
  assert.deepEqual(assetsToPrune(assets, index), [reviewFileName(2026, 6, sha('a')), reviewFileName(2026, 6, sha('b'))]);
});

// One week's publishes as scripts/fantasy-publish.mjs runs them: the asset list is read before the uploads, then each step
// is applied. Returns the asset names left on the release.
function publishWeek(runs) {
  let index = null, assets = [];
  for (const run of runs) {
    index = updateFantasyIndex(index, { season: 2026, snapshot: run.snapshot ?? null, review: null, updatedAt: run.at });
    if (run.review) index = updateFantasyIndex(index, { season: 2026, snapshot: null, review: run.review, updatedAt: run.at });
    const files = [run.snapshot?.file, run.review?.file].filter(Boolean);
    const steps = publishPlan({ files, existing: assets.map(a => a.name), index, assets });
    for (const step of steps) {
      if (step.action === 'delete') assets = assets.filter(a => a.name !== step.name);
      else if (step.name !== 'index.json') assets.push({ name: step.name, createdAt: run.at });
    }
  }
  return assets.map(a => a.name);
}

test('a snapshot copy a Points slate may cite survives every later publish of its week (the first copy and any later one)', () => {
  // Week 8 as November 3 could run it: four Tuesday copies land before the worker's 10:30 UTC catch-up run, which drafts
  // from the copy index.json names then (the fourth, not the first), then daily copies until the weekend freeze. Each run
  // also rebuilds the provisional Week 7 review.
  const at = ['2026-11-03T09:20:00Z', '2026-11-03T09:50:00Z', '2026-11-03T10:05:00Z', '2026-11-03T10:20:00Z', '2026-11-03T13:20:00Z',
    '2026-11-03T14:00:00Z', '2026-11-04T15:00:00Z', '2026-11-05T15:00:00Z', '2026-11-06T15:00:00Z', '2026-11-07T15:00:00Z', '2026-11-08T15:00:00Z'];
  const marks = 'abcdef0123456789';
  const runs = at.map((time, i) => ({ at: time, snapshot: snap(8, marks[i], { generatedAt: time }), review: rev(7, marks[i]) }));
  const first = runs[0].snapshot.file, cited = runs.filter(run => run.at < '2026-11-03T10:30:00Z').at(-1).snapshot.file;
  assert.notEqual(cited, first, 'the slate cites a later copy than the first one');
  const left = publishWeek(runs);
  assert.ok(left.includes(first), 'the first copy of the week is kept');
  assert.ok(left.includes(cited), 'the copy the slate cites is kept');
  assert.deepEqual(left.filter(name => name.includes('-week-08.')).sort(), runs.map(run => run.snapshot.file).sort(), 'no snapshot copy is pruned');
  assert.deepEqual(left.filter(name => name.includes('-review-week-07.')).sort(), runs.slice(-4).map(run => run.review.file).sort(),
    'reviews keep the indexed copy and the three newest superseded ones');
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
  const index = updateFantasyIndex(null, { season: 2026, snapshot: null, review: rev(7, 'f'), updatedAt: '2026-10-21T11:00:00Z' });
  const assets = ['a', 'b', 'c', 'd', 'e'].map((c, i) => ({ name: reviewFileName(2026, 7, sha(c)), createdAt: `2026-10-1${i}T11:00:00Z` }));
  const steps = publishPlan({ files: [index.reviews[0].file], existing: assets.map(a => a.name), index, assets });
  assert.deepEqual(steps.map(s => `${s.action}:${s.name}`), [
    `upload:${index.reviews[0].file}`, 'upload:index.json',
    `delete:${reviewFileName(2026, 7, sha('a'))}`, `delete:${reviewFileName(2026, 7, sha('b'))}`,
  ]);
});

test('publishing refuses an index that drops a published week, but allows a superseded copy of an indexed week', () => {
  const only7 = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'b'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  const keep = [only7.snapshots[0].file];
  assert.throws(() => publishPlan({ files: [], existing: [snapshotFileName(2026, 6, sha('a')), ...keep], index: only7, assets: [] }),
    /drops published weeks: .*week 6/i, 'a snapshot week missing from the index');
  assert.doesNotThrow(() => publishPlan({ files: [], existing: [snapshotFileName(2026, 7, sha('a')), ...keep], index: only7, assets: [] }), 'older copy of an indexed week');
  const withReview = updateFantasyIndex(only7, { season: 2026, snapshot: null, review: rev(6, 'd'), updatedAt: '2026-10-21T11:00:00Z' });
  const files = [...keep, withReview.reviews[0].file];
  assert.doesNotThrow(() => publishPlan({ files: [], existing: [reviewFileName(2026, 6, sha('c')), ...files], index: withReview, assets: [] }), 'older review copy of an indexed week');
  assert.throws(() => publishPlan({ files: [], existing: [reviewFileName(2026, 5, sha('c')), ...files], index: withReview, assets: [] }),
    /drops published weeks: .*review.*week 5/i, 'a review week missing from the index');
});
