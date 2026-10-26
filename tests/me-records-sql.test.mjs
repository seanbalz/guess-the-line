import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, lineSecrets, pickSecrets, readerReply, withoutTimes } from './helpers/leak-scan.mjs';
import { storeLines } from './helpers/guess-week.mjs';
import { gradeBet } from '../server/domain.mjs';

// Redesign build plan stage 72, M-27 (20261026230000_gtl_me_history.sql): /me/records, the older records, through the real
// gtl-api handler on ALL and local PGlite. Contracts:
// - the retired Betting Challenge (D-35): every player's recorded selections, another player's only after its game's kickoff
//   and only to a community member (D-21; before that a count), the owner's own always; graded by the old engine (gradeBet)
//   from each week's newest recorded final;
// - saved games and notes, forecasts, the journal (Q8, read-only; archived records labelled, never left out) and forfeit
//   records go only to their owner; a journal record is held, counted, until its game's line is open to its owner;
// - the older group scoring views go to members of that group; the archived original picks and points to the commissioner
//   seat only, as the old History page showed them; a removed account keeps its own records.
// Fixture accounts and unusual half-point values only; never hosted data.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = name => ACCOUNTS[name].id;
const OUTSIDER = '00000000-0000-4000-8000-000000000009';
const LINES = { spread: [-11.5, 13.5, 6.5], total: [58.5, 31.5, 52.5] };
// Troy's Betting Challenge lines and private values: unusual half points the leak scan can name.
const TROY = { spreadLine: -7.5, totalLine: 43.5, forecast: 29.5, journalLine: -12.5, note: 'Troy fixture note: lean 37.5 early.' };

async function personal(world, who, route, body) {
  const workspace = await world.api(who, 'personal');
  const reply = await world.api(who, route, { ...body, requestId: randomUUID(), revision: workspace.body.revision });
  assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
  return reply.body;
}
async function sendSpread(world, who, picks) {
  const { season, week } = world.state.league, workspace = (await world.api(who, 'personal')).body;
  const reply = await world.api(who, 'personal/ballot', { season, week, mode: 'guess_spread', picks, submit: true, revision: workspace.revision, weeklyRevision: workspace.weeklyRevision, requestId: randomUUID() });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
}

test('/me/records: every player\'s Betting Challenge after kickoff, graded by the old engine; private records to their owner only', { skip }, async t => {
  let clock = null;
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false, optionalRpc: true, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), { season, week } = state.league;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const records = async (who, at = null) => { clock = at; try { const r = await world.api(who, 'me/records', {}); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; } finally { clock = null; } };
  const afterKickoffs = Date.parse(state.games.at(-1).kickoff) + 60_000;
  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });

  // Recorded Betting Challenge selections (the retired mode has no writer in the new app; these are stored rows).
  const selection = async (who, gameId, market, side, line) => {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [id(who), season, week]);
    const value = { gameId, market, side, line, odds: -110, source: 'Fixture Book', quotedAt: new Date(Date.now() - 3_600_000).toISOString(), id: randomUUID(),
      selectedAt: new Date().toISOString(), enteredAt: new Date().toISOString(), verification: 'Manually entered; not independently verified' };
    await db.query("insert into public.gtl_weekly_selections(user_id,season,week,game_id,selection,audit) values($1,$2,$3,$4,$5,jsonb_build_array(jsonb_build_object('type','selection_recorded','after',$5::jsonb)))",
      [id(who), season, week, gameId, value]);
  };
  await selection('troy', ids[0], 'spread', 'home', TROY.spreadLine);
  await selection('troy', ids[1], 'total', 'over', TROY.totalLine);
  await selection('luke', ids[0], 'total', 'under', 41.5);
  // Finals: the commissioner reviewed 27–20 first; a later automatic settlement corrected it to 20–27, which the old engine grades from.
  await db.query("insert into public.gtl_reviewed_result_events(season,week,game_id,version,actor_id,request_id,payload,result,reviewed_at) values($1,$2,$3,1,$4,$5,'{}'::jsonb,$6,now()-interval '2 hours')",
    [season, week, ids[0], id('sean'), randomUUID(), { status: 'final', home: 27, away: 20 }]);
  await db.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,observed_at,settled_at) values($1,$2,$3,1,'final',20,27,'nflverse games.csv',now()-interval '1 hour',now()-interval '1 hour')",
    [season, week, ids[0]]);

  // Troy's private records: a saved game with a note, a forecast, a journal record (after sending Spread) and an archived one.
  await personal(world, 'troy', 'favorite/set', { season, week, gameId: ids[0], saved: true, notes: TROY.note });
  await personal(world, 'troy', 'personal/forecast', { season, week, gameId: ids[1], market: 'spread', value: TROY.forecast - 1 });
  await personal(world, 'troy', 'personal/forecast', { season, week, gameId: ids[1], market: 'spread', value: TROY.forecast });
  await sendSpread(world, 'troy', map([-6.5, 2.5, 9.5]));
  const journal = { season, week, gameId: ids[2], kind: 'research_note', market: 'spread', side: 'home', line: TROY.journalLine, odds: -110, source: 'Fixture Book',
    quotedAt: new Date(Date.now() - 600_000).toISOString(), placedAt: null, notes: 'Fixture journal', outcome: 'pending', currency: null, stakeMinor: null, returnedMinor: null };
  const created = await personal(world, 'troy', 'journal/create', journal);
  const archivedEntry = await personal(world, 'troy', 'journal/create', { ...journal, notes: 'Fixture journal, archived later' });
  await personal(world, 'troy', 'journal/archive', { entryId: archivedEntry.entryId, reason: 'Fixture: duplicate record', archived: true });
  // A Total record stored without a sent Total (a stored row; the writer requires one). Troy's skip below sits his Total out,
  // which opens its line, so it shows. Sean's Spread record, with no Spread ballot, stays held until kickoff.
  await db.query("insert into public.gtl_journal_entries(user_id,season,week,game_id,entry) values($1,$2,$3,$4,$5)",
    [id('troy'), season, week, ids[1], { ...journal, market: 'total', side: 'over', line: 33.5, gameId: undefined }]);
  await db.query("insert into public.gtl_journal_entries(user_id,season,week,game_id,entry) values($1,$2,$3,$4,$5)",
    [id('sean'), season, week, ids[2], { ...journal, line: 21.5, notes: 'Sean fixture journal', gameId: undefined }]);
  // Troy skips the rest of the week (his Spread keeps counting); Luke sits out his Total the old way.
  assert.equal((await world.api('troy', 'community/forfeit', { season, week, reason: 'skip' })).status, 200);
  assert.equal((await world.api('luke', 'community/sit-out', { season, week, mode: 'guess_total' })).status, 200);

  await t.test('before kickoff: your own selections; another player\'s are a count only', async () => {
    const luke = await records('luke');
    assert.equal(luke.ownerId, id('luke'));
    assert.deepEqual(luke.challenge.selections.map(s => [s.userId, s.gameId, s.market, s.side, s.line, s.grade]), [[id('luke'), ids[0], 'total', 'under', 41.5, 'L']],
      'graded from the newest final: 20–27 is 47 points, so Under 41.5 lost');
    const sean = await records('sean');
    assert.deepEqual(sean.challenge.selections, []);
    assert.deepEqual(sean.challenge.hidden.map(h => [h.userId, h.count]).sort(), [[id('luke'), 1], [id('troy'), 2]].sort());
    assert.deepEqual(sean.challenge.players.map(p => p.displayName).sort(), ['Luke Fixture', 'Sean Fixture', 'Troy Fixture']);
    for (const [who, reply] of [['luke', luke], ['sean', sean]]) {
      assertNoLeak(readerReply(reply), { viewer: id(who), secrets: [
        ...lineSecrets({ [ids[0]]: TROY.spreadLine }, { market: 'spread' }), ...lineSecrets({ [ids[1]]: TROY.totalLine }, { market: 'total' }),
        ...pickSecrets({ forecast: TROY.forecast, journal: TROY.journalLine }, { market: 'total', owner: 'troy' }),
        ...lineSecrets(map(LINES.spread), { market: 'spread' }).slice(1), ...lineSecrets(map(LINES.total), { market: 'total' }),
      ] }, `/me/records ${who}`);
      const text = withoutTimes(JSON.stringify(reply));
      assert.ok(!text.includes('Troy fixture note') && !text.includes('37.5') && !text.includes('Fixture journal'), `${who} reads none of Troy's private records`);
      assert.deepEqual([reply.saved, reply.forecasts, reply.forfeits], [[], [], []]);
      assert.deepEqual(reply.journal, [], `${who} has no open journal record`);
    }
  });

  await t.test('the old engine grades each selection; the grade equals gradeBet on the newest final', async () => {
    const sean = await records('sean', afterKickoffs);
    assert.deepEqual(sean.challenge.selections.map(s => [s.userId, s.gameId, s.side, s.line, s.final?.home ?? null, s.final?.away ?? null, s.grade]), [
      [id('luke'), ids[0], 'under', 41.5, 20, 27, 'L'],
      [id('troy'), ids[0], 'home', TROY.spreadLine, 20, 27, 'L'],
      [id('troy'), ids[1], 'over', TROY.totalLine, null, null, null],
    ], 'every player\'s selection once its game has kicked off; a game with no final is ungraded, never a loss');
    for (const s of sean.challenge.selections) assert.equal(s.grade, gradeBet(s, s.final), `${s.userId} ${s.gameId}`);
    const byUser = Object.fromEntries(sean.challenge.records.map(r => [r.userId, [r.W, r.L, r.P, r.selections, r.ungraded]]));
    assert.deepEqual(byUser[id('troy')], [0, 1, 0, 2, 1]);
    assert.deepEqual(byUser[id('luke')], [0, 1, 0, 1, 0]);
    assert.deepEqual(byUser[id('sean')], [0, 0, 0, 0, 0], 'Sean has no selections');
    assert.equal(sean.challenge.hidden.length, 0, 'every game has kicked off');
    const slate = sean.slates.find(s => s.season === season && s.week === week);
    assert.deepEqual(slate.results[ids[0]], { status: 'final', home: 20, away: 27, origin: 'settlement' }, 'the later automatic settlement is the newest final');
  });

  await t.test('Troy\'s own records: saved game and note, forecast changes, journal with its archived record, the skip', async () => {
    const troy = await records('troy');
    assert.deepEqual(troy.saved.map(f => [f.gameId, f.saved, f.note, f.changes.length]), [[ids[0], true, TROY.note, 1]]);
    assert.deepEqual(troy.forecasts.map(f => [f.gameId, f.market, f.value, f.revision, f.changes.map(c => [c.before, c.after])]),
      [[ids[1], 'spread', TROY.forecast, 2, [[null, TROY.forecast - 1], [TROY.forecast - 1, TROY.forecast]]]]);
    assert.deepEqual(troy.journal.filter(j => j.market === 'spread').map(j => [j.id, j.archived, j.line, j.notes]).sort(),
      [[created.entryId, false, TROY.journalLine, 'Fixture journal'], [archivedEntry.entryId, true, TROY.journalLine, 'Fixture journal, archived later']].sort(), 'the archived record is listed, labelled');
    const archived = troy.journal.find(j => j.archived);
    assert.deepEqual(archived.changes.map(c => [c.action, c.reason]), [['journal/create', null], ['journal/archive', 'Fixture: duplicate record']]);
    assert.deepEqual([troy.journal.find(j => j.market === 'total')?.line, troy.journalHidden], [33.5, 0], 'his skip sat Total out, so its line is open');
    const sean = await records('sean');
    assert.deepEqual([sean.journal, sean.journalHidden], [[], 1], "Sean's Spread record waits for its line to open: counted, not listed");
    assert.deepEqual((await records('sean', afterKickoffs)).journal.map(j => j.notes), ['Sean fixture journal'], 'after kickoff it shows');
    assert.deepEqual(troy.forfeits.map(f => [f.week, f.reason, f.modes]), [[week, 'skip', ['guess_total']]]);
    assert.deepEqual(troy.sitOuts, [], 'the skip\'s own opt-out is the forfeit, not a separate sit-out');
    assert.deepEqual((await records('luke')).sitOuts.map(o => [o.week, o.mode]), [[week, 'guess_total']]);
    assert.equal((await records('troy', afterKickoffs)).journal.length, 3, 'nothing is left out');
  });

  await t.test('older group scoring views: members only; the original picks, points and totals to the commissioner seat only', async () => {
    const sean = await records('sean'), luke = await records('luke');
    const own = sean.archives.find(a => a.leagueId === 'sean-troy-luke'), other = luke.archives.find(a => a.leagueId === 'sean-troy-luke');
    assert.ok(own && other, 'both members see their group');
    assert.equal(own.own, true); assert.equal(other.own, false);
    assert.ok(own.snapshots.length > 0 && own.snapshots.every(s => Number.isFinite(s.total)), 'the archived score movement');
    assert.ok([own, other].every(a => a.snapshots.every(s => Object.keys(s.games).length === 0)), "before kickoff no game's line, for anyone");
    assert.ok(other.snapshots.every(s => s.total === null), 'another member sees the source timeline, never the totals');
    const [seanAfter, lukeAfter] = [(await records('sean', afterKickoffs)).archives[0], (await records('luke', afterKickoffs)).archives[0]];
    assert.ok(seanAfter.snapshots.every(s => Object.keys(s.games).length === ids.length && Object.values(s.games).every(g => 'originalPick' in g && 'points' in g)));
    assert.ok(lukeAfter.snapshots.every(s => Object.keys(s.games).length === ids.length && Object.values(s.games).every(g => Object.keys(g).join() === 'value')));
    assert.equal(other.archivedCount, own.archivedCount);
    // An account with no membership in the group reads no archive; with no profile, History is refused.
    await db.query('insert into auth.users values($1)', [OUTSIDER]);
    const outsider = { id: OUTSIDER };
    const raw = await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query('select public.gtl_read_me_records($1) v', [outsider.id]); }).catch(e => e);
    assert.match(String(raw.message), /GTL_ME_PROFILE/);
    await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Outsider Fixture')", [OUTSIDER]);
    const value = (await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query('select public.gtl_read_me_records($1) v', [outsider.id]); })).rows[0].v;
    assert.deepEqual([value.archives, value.benchmarks], [[], []]);
  });

  await t.test('a removed account keeps its own records and reads no other player\'s selection', async () => {
    await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [id('luke'), id('sean')]);
    try {
      const luke = await records('luke', afterKickoffs);
      assert.equal(luke.member, false);
      assert.deepEqual(luke.challenge.selections.map(s => s.userId), [id('luke')]);
      assert.deepEqual([luke.challenge.hidden, luke.challenge.players.map(p => p.userId)], [[], [id('luke')]]);
      const sean = await records('sean', afterKickoffs);
      assert.deepEqual(sean.challenge.players.find(p => p.userId === id('luke')).removed, true, 'listed with the removed flag (D-23)');
      assert.ok(sean.challenge.selections.some(s => s.userId === id('luke')), 'a removed player\'s record stays visible to members');
    } finally { await db.query('delete from public.gtl_community_removals where user_id=$1', [id('luke')]); }
  });

  await t.test('the route takes no fields: identity comes from sign-in', async () => {
    for (const body of [{ userId: id('troy') }, { season }, { all: true }]) assert.equal((await world.api('luke', 'me/records', body)).status, 400, JSON.stringify(body));
  });
});
