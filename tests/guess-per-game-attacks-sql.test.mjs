import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, ACCOUNTS, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql, storeLines } from './helpers/guess-week.mjs';

const skip = pgliteAvailable ? false : 'PGlite unavailable; no hosted tests';
const id = who => ACCOUNTS[who].id;
const bodyFor = (w, game, value, extra = {}) => ({ season: w.state.league.season, week: w.state.league.week,
  mode: 'guess_spread', revision: 0, weeklyRevision: 0, requestId: randomUUID(), picks: { [game.id]: value }, submit: false, lockIn: [game.id], ...extra });
const submit = (w, body) => serviceSql(w.db)('gtl_mutate_personal', { p_user: id('luke'), p_action: 'personal/ballot', p_body: body });
async function stored(w) {
  return (await w.db.query('select user_id,season,week,mode,ballot,audit from public.gtl_weekly_ballots where user_id=$1', [id('luke')])).rows;
}
async function quotes(w) {
  await storeLines(w.db, w.state, Object.fromEntries(['spread', 'total'].map(m => [m, Object.fromEntries(w.state.games.map(g => [g.id, m === 'spread' ? -3 : 45]))])));
}

test('M07 serialized competing devices: one immutable same-game lock wins; losing revision and altered replay cannot replace it', { skip }, async t => {
  const w = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false }); t.after(() => w.db.close());
  await quotes(w);
  const [a, b] = w.state.games, first = bodyFor(w, a, -4), competing = bodyFor(w, a, -8);
  // PGlite serializes transactions; this proves the CAS/replay outcome, not production lock scheduling.
  const results = await Promise.allSettled([submit(w, first), submit(w, competing)]);
  assert.deepEqual(results.map(x => x.status), ['fulfilled', 'rejected']);
  assert.match(results[1].reason.message, /GTL_PERSONAL_CONFLICT|GTL_WEEKLY_CONFLICT/);
  const original = await stored(w);
  assert.equal(original[0].ballot.picks[a.id], -4);
  assert.equal(original[0].audit.length, 1);
  assert.deepEqual(await submit(w, first), results[0].value, 'lost-response retry is exact and does not score twice');
  await assert.rejects(submit(w, { ...first, picks: { [a.id]: -8 } }), /GTL_PERSONAL_RETRY_CONFLICT/);
  await assert.rejects(serviceSql(w.db)('gtl_save_weekly_ballot', { p_user: id('luke'), p_league: 'sean-troy-luke',
    p_mode: 'guess_spread', p_revision: 0, p_picks: { [a.id]: -8, [b.id]: -3 }, p_submit: true }), /GTL_WEEKLY_CONFLICT/);
  await assert.rejects(submit(w, bodyFor(w, a, -8, { revision: 1, weeklyRevision: 1 })), /GTL_BALLOT_LOCKED/);
  assert.deepEqual(await stored(w), original);
  assert.equal((await w.db.query('select count(*)::int n from public.gtl_personal_receipts where user_id=$1', [id('luke')])).rows[0].n, 1);
});

test('M07 direct service writes cannot move a locked ballot or turn a locked guess into a closed draft', { skip }, async t => {
  const w = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false }); t.after(() => w.db.close());
  await quotes(w); const [a] = w.state.games;
  await submit(w, bodyFor(w, a, -4));
  const original = await stored(w);
  for (const [assignment, args] of [
    ['user_id=$2', [id('troy')]], ['mode=$2', ['guess_total']], ['week=$2', [w.state.league.week + 1]],
    ["ballot=ballot||jsonb_build_object('closedAtKickoff',jsonb_build_array($2::text),'updatedAt',clock_timestamp())", [a.id]],
  ]) {
    await assert.rejects(w.db.transaction(async tx => {
      await tx.exec('set local role service_role');
      await tx.query(`update public.gtl_weekly_ballots set ${assignment} where user_id=$1`, [id('luke'), ...args]);
    }), /GTL_BALLOT_LOCKED|GTL_SUBMISSION_ODDS_REQUIRED/);
    assert.deepEqual(await stored(w), original);
  }
});

test('M07 raw readers: a spread lock never reveals total guesses, total scores or unrevealed game aggregates', { skip }, async t => {
  const w = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false }); t.after(() => w.db.close());
  await quotes(w); const [a, b] = w.state.games, { season, week } = w.state.league, sql = serviceSql(w.db);
  await submit(w, bodyFor(w, a, -4));
  await submit(w, bodyFor(w, b, 46, { mode: 'guess_total', revision: 1, weeklyRevision: 1 }));
  const seanBody = bodyFor(w, a, -3);
  await sql('gtl_mutate_personal', { p_user: id('sean'), p_action: 'personal/ballot', p_body: seanBody });
  const history = await sql('gtl_read_community_history', { p_user: id('sean'), p_season: season });
  const entries = history.weeks[0].entries.filter(x => x.userId === id('luke'));
  const total = entries.find(x => x.mode === 'guess_total'), spread = entries.find(x => x.mode === 'guess_spread');
  assert.equal(total.picks, null); assert.equal(total.weekPoints, null); assert.equal(total.weekScored, 0);
  assert.equal(spread.picks.find(x => x.gameId === a.id).points, 8);
  assert.equal(spread.weekPoints, null, 'permitted details do not inflate shared aggregate before kickoff');
  const totals = await sql('gtl_read_guess_picks', { p_user: id('sean'), p_season: season, p_week: week, p_mode: 'guess_total', p_game: b.id, p_target: id('luke'), p_now: new Date().toISOString() });
  const hidden = totals.games[0].rows[0];
  assert.equal(hidden.pick, null); assert.equal(hidden.points, null); assert.equal(hidden.error, null); assert.equal(hidden.rank, null);
  const lines = await sql('gtl_read_lines', { p_user: id('sean'), p_season: season, p_week: week });
  assert.deepEqual(lines.games.find(g => g.id === b.id).total, { visible: false });
  assert.deepEqual(lines.games.find(g => g.id === a.id).total, { visible: false });
  const feed = await sql('gtl_read_community', { p_user: id('sean') });
  assert(feed.standings.every(row => row.weekPoints === null && row.seasonPoints === null));
  assert(feed.posts.filter(p => p.actorId === id('luke') && p.mode === 'guess_total').every(p => p.picks === null));
});
