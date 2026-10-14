import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';
import { accuracy } from '../server/domain.mjs';
import { sendBallot, serviceSql, storeLines } from './helpers/guess-week.mjs';

// Redesign build plan stage 16, M-01: History shows the viewer's own guesses always, but the line with a guess only once that
// game and market is open to the viewer (D-39): an unlocked draft's line stays hidden until that game's kickoff, and a draft
// never scores. Runs on ALL on local PGlite through the real handler and the raw reader; fixture values only.
//
// Writers never save a line with a draft today (only a sent guess saves one, D-27), so the draft below is given one directly
// in the database, as a future per-game record or an import could carry: the reader must hide it either way.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const LINES = { spread: [-11.5, 13.5, 6.5], total: [58.5, 31.5, 52.5] };
const LUKE = { spread: [-4.5, 3.5, 8.5], total: [33.5, 55.5, 47.5] };
const TROY = { total: [37.5, 61.5, 44.5] };

test('own History: an unlocked draft shows its guesses but never its line before kickoff, and never scores; a sent guess shows its line and scores from kickoff', { skip }, async t => {
  let clock = null;
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), { season, week } = state.league;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const id = name => ACCOUNTS[name].id, iso = ms => new Date(ms).toISOString();
  const sql = serviceSql(db);
  const history = (who, now) => sql('gtl_read_community_history', { p_user: id(who), p_season: season, p_now: iso(now) });
  const entry = (reply, who, mode) => reply.weeks.find(w => w.week === week).entries.find(e => e.userId === id(who) && e.mode === mode);

  const snapshot = await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(world, 'luke', 'guess_spread', map(LUKE.spread), false);
  await sendBallot(world, 'luke', 'guess_total', map(LUKE.total));
  await sendBallot(world, 'troy', 'guess_total', map(TROY.total));
  // A line stored with each of Luke's draft Spread guesses (see the header): the reader must not hand it back.
  const refs = Object.fromEntries(ids.map((g, i) => [g, { status: 'available', value: LINES.spread[i], basis: 'line_at_guess', snapshotId: snapshot, savedAt: iso(Date.now() - 500), observedAt: iso(Date.now() - 2000), ageSeconds: 1 }]));
  await db.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('scoringReferences',$1::jsonb) where user_id=$2 and season=$3 and week=$4 and mode='guess_spread'", [refs, id('luke'), season, week]);
  const row = (await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id('luke')])).rows[0].ballot;
  assert.deepEqual([row.submittedAt ?? null, Object.keys(row.scoringReferences).length], [null, 3], 'a draft carrying stored lines');
  const NOW = Date.now(), FIRST = kickoff[0], LAST = kickoff[2];
  assert.ok(NOW < FIRST);
  const spreadLines = lineSecrets(map(LINES.spread), { market: 'spread' });
  // The leak scan exempts a viewer's own entries, so these checks scan the reply as a stranger would read it.
  const stranger = 'not-a-member';

  await t.test('before any kickoff: the draft\'s guesses come back, its lines and points do not; no Spread line anywhere', async () => {
    const reply = await history('luke', NOW);
    const draft = entry(reply, 'luke', 'guess_spread');
    assert.deepEqual([draft.status, draft.picksHidden, draft.hiddenGames, draft.weekPoints, draft.weekScored], ['draft', false, [], null, 0]);
    assert.deepEqual(draft.picks.map(p => [p.gameId, p.guess, p.reference, p.points, p.scorable, p.hidden]), ids.map((g, i) => [g, LUKE.spread[i], null, null, false, false]));
    assertNoLeak(reply, { viewer: stranger, secrets: spreadLines }, 'Luke\'s own History');
    assert.deepEqual(reply.weeks.find(w => w.week === week).gate, Object.fromEntries(ids.map(g => [g, { spread: false, total: true }])), 'a draft locks nothing in');
  });

  await t.test('a sent guess is locked in: its line comes back at once, its points from kickoff', async () => {
    const sent = entry(await history('luke', NOW), 'luke', 'guess_total');
    assert.deepEqual([sent.status, sent.weekPoints, sent.weekScored], ['submitted', 0, 0]);
    assert.deepEqual(sent.picks.map(p => [p.guess, p.reference.value, p.points]), ids.map((g, i) => [LUKE.total[i], LINES.total[i], null]));
    const after = entry(await history('luke', LAST), 'luke', 'guess_total');
    assert.deepEqual(after.picks.map(p => Number(p.points)), ids.map((g, i) => accuracy(LUKE.total[i], LINES.total[i])));
    assert.equal(Number(after.weekPoints), Math.round(ids.reduce((sum, g, i) => sum + accuracy(LUKE.total[i], LINES.total[i]), 0) * 100) / 100);
  });

  await t.test('a kickoff opens that game\'s line for everyone, the draft\'s owner too; the draft still never scores', async () => {
    const first = await history('luke', FIRST);
    const draft = entry(first, 'luke', 'guess_spread');
    assert.deepEqual(draft.picks.map(p => [p.guess, p.reference?.value ?? null, p.points]), ids.map((g, i) => [LUKE.spread[i], i === 0 ? LINES.spread[0] : null, null]));
    assert.deepEqual([draft.weekPoints, draft.weekScored], [null, 0]);
    assertNoLeak(first, { viewer: stranger, secrets: spreadLines.slice(1) }, 'after the first kickoff');
    assert.ok(leakScan(first, { viewer: stranger, secrets: spreadLines.slice(0, 1) }).length >= 1, 'the first game\'s line is open');
    const last = entry(await history('luke', LAST), 'luke', 'guess_spread');
    assert.deepEqual([last.picks.every(p => p.points === null), last.weekPoints], [true, null]);
  });

  await t.test('nobody else ever sees the draft, before or after kickoff', async () => {
    for (const now of [NOW, FIRST, LAST]) {
      const troy = await history('troy', now);
      assert.equal(entry(troy, 'luke', 'guess_spread'), undefined);
      assertNoLeak(troy, { viewer: id('troy'), secrets: pickSecrets(map(LUKE.spread), { market: 'spread', owner: 'luke' }) }, `Troy at ${iso(now)}`);
    }
  });

  await t.test('through the handler: the draft keeps its guesses, no line, and no points: null, never 0 (stage 17, DP-1)', async () => {
    const reply = await world.api('luke', 'community/history', {});
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const draft = entry(reply.body, 'luke', 'guess_spread');
    assert.deepEqual([draft.status, draft.weekPoints, draft.picksHidden, draft.picks.map(p => [p.guess, p.reference, p.points, p.hidden])],
      ['draft', null, false, ids.map((g, i) => [LUKE.spread[i], null, null, false])], 'the owner\'s own rows are never withheld');
    clock = FIRST;
    const later = await world.api('luke', 'community/history', {});
    clock = null;
    assert.deepEqual(entry(later.body, 'luke', 'guess_spread').picks.map(p => p.reference?.value ?? null), ids.map((g, i) => (i === 0 ? LINES.spread[0] : null)));
  });

  await t.test('nothing was written: the draft row is exactly as stored (D-23)', async () => {
    assert.deepEqual((await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id('luke')])).rows[0].ballot, row);
  });
});
