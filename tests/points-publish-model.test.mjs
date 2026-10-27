// The commissioner's "Publish now" helpers (web/src/next/play/points/pointsModel.js): which week it checks, the sentence
// for each refusal (gtl-api sends these without their codes, so the status decides), and the preview rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRows, publishProblem, publishTarget } from '../web/src/next/play/points/pointsModel.js';

const current = { season: 2026, week: 8, deadline: '2026-10-30T00:15:00Z', games: 14 };

test('publishTarget: an unopened read names its week, or falls back to the Community week', () => {
  assert.deepEqual(publishTarget({ status: 'unopened', season: 2026, week: 9 }, current), { season: 2026, week: 9 });
  assert.deepEqual(publishTarget({ status: 'unopened', season: null, week: null }, current), { season: 2026, week: 8 });
  assert.equal(publishTarget({ status: 'unopened', season: null, week: null }, null), null);
});

test('publishTarget: an open week checks only a later current week', () => {
  assert.deepEqual(publishTarget({ status: 'open', season: 2026, week: 7 }, current), { season: 2026, week: 8 });
  assert.equal(publishTarget({ status: 'open', season: 2026, week: 8 }, current), null);
  assert.equal(publishTarget({ status: 'open', season: 2026, week: 9 }, current), null);
  assert.deepEqual(publishTarget({ status: 'open', season: 2025, week: 18 }, { season: 2026, week: 1 }), { season: 2026, week: 1 });
  assert.equal(publishTarget({ status: 'open', season: 2026, week: 7 }, null), null);
  assert.equal(publishTarget(null, current), null);
});

test('publishProblem: each refusal reads plainly', () => {
  assert.equal(publishProblem({ status: 404, message: 'No Points slate is stored for that week.' }, { week: 8 }), 'This week’s slate hasn’t been drafted yet — projections are still loading.');
  assert.equal(publishProblem({ status: 403 }, { week: 8 }), 'Only the commissioner can publish the Points slate.');
  assert.equal(publishProblem({ status: 409 }, { week: 8 }), 'Week 8’s first game has kicked off, so this slate can no longer be published.');
  assert.equal(publishProblem({ status: 404, code: 'GTL_POINTS_OFF' }, { week: 8 }), 'Points is coming soon.');
  assert.equal(publishProblem({ status: 503, message: 'Guess the Points saves are paused right now. Nothing you saved is lost.' }, { week: 8 }), 'Guess the Points saves are paused right now. Nothing you saved is lost.');
  assert.equal(publishProblem({ status: 0, uncertain: true }, { week: 8 }), 'We could not confirm the publish. Check again; publishing twice is safe.');
  assert.equal(publishProblem({ status: 502, uncertain: true }, { week: 8, action: 'preview' }), 'The slate could not be checked. Try again.');
  assert.equal(publishProblem(new TypeError('Failed to fetch'), { week: 8 }), 'No connection. Reconnect and try again.');
});

test('previewRows: slot, player, matchup and kickoff; never the House; "—" for missing', () => {
  const rows = previewRows({ house: { QB: 19.4 }, slots: [
    { slot: 'QB', name: 'Fixture QB Player', team: 'PIT', gameKey: '2026_08_PIT_CLE', kickoff: '2026-10-30T00:15:00.000Z' },
    { slot: 'FLEX', name: '', team: 'MIA', gameKey: 'other', kickoff: 'bad' }, null, { name: 'no slot' },
  ] });
  assert.deepEqual(rows, [
    { slot: 'QB', name: 'Fixture QB Player', matchup: 'PIT @ CLE', kickoff: 'Thu 5:15 PM PT' },
    { slot: 'FLEX', name: '—', matchup: 'MIA', kickoff: '—' },
  ]);
  assert.deepEqual(previewRows(null), []);
});
