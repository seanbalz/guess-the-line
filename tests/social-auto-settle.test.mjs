import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeSocialEntry, socialSettleEligibleAt } from '../shared/social-auto-settle.mjs';
import { applySocialMutation, emptySocialState, summarizeSocialBets } from '../shared/social-bets.mjs';
import { handleSocial } from '../cloud/social.mjs';
import { ALL, NOT_HOSTED, PRELUDE, migrationSql, version } from './migrations.mjs';

// M-19 / D-64 (proposed): automatic settlement of pending shared Bet Tracker tickets after the game's Pacific day ends.
// Node: the grading rule (shared/social-auto-settle.mjs). PGlite (ALL): public.gtl_settle_social_pending and its twin.
const MIGRATION = '20261028120000_gtl_social_auto_settle.sql';
const single = (leg, extra = {}) => ({ id: 'e1', ownerId: 'u1', kind: 'single', legs: [{ gameId: 'TB-DAL', ...leg }], odds: -110, stakeUnits: 1, outcome: 'pending', ...extra });
const SNF = '2026-10-19T00:20:00Z'; // Sunday October 18, 5:20 PM PDT
const final = (home, away, extra = {}) => ({ version: 1, status: 'final', home, away, observedAt: '2026-10-19T04:00:00Z', source: 'nflverse', sourceUrl: 'https://example.test/games.csv', ...extra });
const AFTER = Date.parse('2026-10-19T07:00:00Z'); // 00:00 PDT Monday

test('eligibility is 00:00 America/Los_Angeles after the game day, across daylight time', () => {
  assert.equal(socialSettleEligibleAt(SNF), '2026-10-19T07:00:00.000Z');
  assert.equal(socialSettleEligibleAt('2026-10-18T17:00:00Z'), '2026-10-19T07:00:00.000Z', '10 AM PDT London game');
  assert.equal(socialSettleEligibleAt('2026-11-02T01:20:00Z'), '2026-11-02T08:00:00.000Z', 'Nov 1 PST after the change');
  assert.equal(socialSettleEligibleAt('2026-10-20T00:15:00Z'), '2026-10-20T07:00:00.000Z', 'Monday night');
});

test('grading: spread, total, push, half points, unknown price, before day end', () => {
  const at = { kickoff: SNF, now: AFTER };
  // DAL 24, TB 20: home -3.5 covers; home -4 pushes; away +3.5 loses.
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'spread', side: 'home', line: -3.5 }), { ...at, results: [final(24, 20)] })), { outcome: 'win', margin: 0.5, netUnits: 0.9091 });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'spread', side: 'home', line: -4 }), { ...at, results: [final(24, 20)] })), { outcome: 'push', margin: 0, netUnits: 0 });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'spread', side: 'away', line: 3.5 }), { ...at, results: [final(24, 20)] })), { outcome: 'loss', margin: -0.5, netUnits: -1 });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'total', side: 'over', line: 44 }, { odds: 120, stakeUnits: 2 }), { ...at, results: [final(24, 20)] })), { outcome: 'push', margin: 0, netUnits: 0 });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'total', side: 'under', line: 44.5 }, { odds: 120, stakeUnits: 2 }), { ...at, results: [final(24, 20)] })), { outcome: 'win', margin: 0.5, netUnits: 2.4 });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'total', side: 'over', line: 44.5 }, { odds: null, stakeUnits: null }), { ...at, results: [final(24, 20)] })), { outcome: 'loss', margin: -0.5, netUnits: null });
  assert.deepEqual(pick(gradeSocialEntry(single({ market: 'spread', side: 'home', line: -3.5 }, { odds: null }), { ...at, results: [final(24, 20)] })), { outcome: 'win', margin: 0.5, netUnits: null }, 'an unpriced win settles and stays outside ROI');
  const early = gradeSocialEntry(single({ market: 'spread', side: 'home', line: -3.5 }), { kickoff: SNF, now: AFTER - 60_000, results: [final(24, 20)] });
  assert.deepEqual(early, { status: 'waiting', reason: 'before_day_end', gameId: 'TB-DAL', eligibleAt: '2026-10-19T07:00:00.000Z' });
});

test('grading: no final, postponed stays pending, cancelled voids, a rescheduled final waits for its own day, a correction wins', () => {
  const leg = { market: 'spread', side: 'home', line: -3.5 };
  assert.equal(gradeSocialEntry(single(leg), { kickoff: SNF, now: AFTER, results: [] }).reason, 'no_final');
  assert.equal(gradeSocialEntry(single(leg), { kickoff: SNF, now: AFTER, results: [{ version: 1, status: 'postponed', observedAt: '2026-10-18T20:00:00Z' }] }).reason, 'postponed');
  const voided = gradeSocialEntry(single(leg), { kickoff: SNF, now: Date.parse('2026-10-20T07:00:00Z'), results: [{ version: 1, status: 'cancelled', observedAt: '2026-10-19T03:00:00Z', source: 'ruling' }] });
  assert.equal(voided.outcome, 'void'); assert.equal(voided.netUnits, null);
  const replayed = [{ version: 1, status: 'postponed', observedAt: '2026-10-18T20:00:00Z' }, final(24, 20, { version: 2, observedAt: '2026-10-21T04:00:00Z' })];
  assert.equal(gradeSocialEntry(single(leg), { kickoff: SNF, now: Date.parse('2026-10-21T06:59:00Z'), results: replayed }).reason, 'before_day_end');
  assert.equal(gradeSocialEntry(single(leg), { kickoff: SNF, now: Date.parse('2026-10-21T07:00:00Z'), results: replayed }).outcome, 'win');
  const corrected = gradeSocialEntry(single(leg), { kickoff: SNF, now: AFTER, results: [final(24, 20), final(20, 24, { version: 2 })] });
  assert.equal(corrected.outcome, 'loss'); assert.equal(corrected.version, 2);
});

test('grading: parlays, props and malformed tickets stay pending and are flagged for manual settlement', () => {
  const at = { kickoff: SNF, now: AFTER, results: [final(24, 20)] };
  assert.deepEqual(gradeSocialEntry({ ...single({ market: 'spread', side: 'home', line: -3.5 }), kind: 'parlay', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -3.5 }, { gameId: 'TB-DAL', market: 'total', side: 'over', line: 40 }] }, at), { status: 'manual', reason: 'parlay' });
  assert.deepEqual(gradeSocialEntry(single({ market: 'prop', side: 'Baker Mayfield', line: 250.5, selection: 'Over 250.5 passing yards' }), at), { status: 'manual', reason: 'prop', gameId: 'TB-DAL' });
  assert.equal(gradeSocialEntry(single({ market: 'spread', side: 'over', line: 3 }), at).reason, 'invalid');
  assert.equal(gradeSocialEntry(single({ market: 'spread', side: 'home', line: -3 }), { ...at, kickoff: null }).reason, 'unknown_game');
});
const pick = grade => ({ outcome: grade.outcome, margin: grade.margin, netUnits: grade.netUnits });

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

test('M-19 is written, not applied, and adds functions only', () => {
  assert.ok(ALL.includes(MIGRATION)); assert.ok(NOT_HOSTED.includes(version(MIGRATION)));
  const sql = fs.readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /create or replace function|^-- replaces /m, 'nothing existing is replaced');
  assert.doesNotMatch(sql, /cron\.schedule|insert into public\.gtl_social_commits/);
  const admin = fs.readFileSync(new URL('../supabase/admin/settle_pending_backfill.sql', import.meta.url), 'utf8');
  const live = admin.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(live, /p_dry_run\s*=>\s*false/, 'the backfill write is commented out until Sean has read the preview');
  assert.match(admin, /-- select public\.gtl_settle_social_pending\(p_season=>2026,p_week=>null,p_now=>null,p_dry_run=>false\);/);
});

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TROY = uid(1), SEAN = uid(2);
const SEASON = 2026, WEEK = 7, CREATED = Date.parse('2026-10-18T16:00:00Z');
const GAMES = [
  { id: 'TB-DAL', away: 'TB', home: 'DAL', kickoff: '2026-10-19T00:20:00Z' },
  { id: 'SEA-SF', away: 'SEA', home: 'SF', kickoff: '2026-10-20T00:15:00Z' },
  { id: 'NYJ-NE', away: 'NYJ', home: 'NE', kickoff: '2026-10-18T17:00:00Z' },
  { id: 'BUF-MIA', away: 'BUF', home: 'MIA', kickoff: '2026-10-18T17:00:00Z' },
  { id: 'GB-CHI', away: 'GB', home: 'CHI', kickoff: '2026-10-18T20:25:00Z' },
];
const TICKETS = {
  winHome: [TROY, { market: 'spread', side: 'home', line: -3.5 }, { odds: -110, stakeUnits: 1 }],
  pushTotal: [TROY, { market: 'total', side: 'over', line: 44 }, { odds: 120, stakeUnits: 2 }],
  lossAway: [SEAN, { market: 'spread', side: 'away', line: 3.5 }, { odds: 150, stakeUnits: 1 }],
  mnf: [SEAN, { gameId: 'SEA-SF', market: 'total', side: 'under', line: 47.5 }, { odds: -105, stakeUnits: 1.5 }],
  postponed: [TROY, { gameId: 'NYJ-NE', market: 'spread', side: 'home', line: -6 }, {}],
  cancelled: [TROY, { gameId: 'BUF-MIA', market: 'total', side: 'under', line: 49 }, {}],
  noFinal: [SEAN, { gameId: 'GB-CHI', market: 'spread', side: 'away', line: 1.5 }, {}],
  prop: [SEAN, { market: 'prop', side: 'Baker Mayfield', line: 250.5, selection: 'Over 250.5 passing yards' }, {}],
  manual: [TROY, { market: 'total', side: 'under', line: 40.5 }, {}],
  reopened: [SEAN, { market: 'spread', side: 'home', line: -1 }, {}],
};

async function world(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  await db.query('insert into auth.users values($1),($2)', [TROY, SEAN]);
  await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Troy'),($2,'Sean')", [TROY, SEAN]);
  await db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [SEASON, WEEK, { season: SEASON, week: WEEK, games: GAMES.map(g => ({ ...g, kickoff: Date.parse(g.kickoff) / 1000 })) }]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const service = { rpc: async (name, args) => {
    const keys = Object.keys(args);
    return (await as('service_role', `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  } };
  const readState = async () => (await db.query('select revision,state from public.gtl_social_weeks where season=$1 and week=$2', [SEASON, WEEK])).rows[0];
  let request = 100;
  const commit = async (actor, action, body, now = CREATED) => {
    const saved = (await readState()) ?? { revision: 0, state: emptySocialState() };
    const payload = { requestId: uid(++request), season: SEASON, week: WEEK, ...body };
    const next = applySocialMutation(saved.state, { actorId: actor, action, body: payload, games: GAMES.map(g => ({ ...g, season: SEASON, week: WEEK })), now });
    await service.rpc('gtl_commit_social', { p_user: actor, p_season: SEASON, p_week: WEEK, p_expected_revision: Number(saved.revision), p_request_id: payload.requestId, p_action: action, p_body: payload, p_state: next });
    return next.entries.at(-1);
  };
  const ids = {};
  for (const [name, [owner, leg, extra]] of Object.entries(TICKETS)) {
    const entry = await commit(owner, 'create', { kind: 'single', legs: [{ gameId: 'TB-DAL', ...leg }], odds: -110, stakeUnits: 1, source: 'Fixture ticket', ...extra });
    ids[name] = entry.id;
  }
  // A parlay, a ticket its owner already settled, and one its owner reported and then reopened as pending.
  ids.parlay = (await commit(TROY, 'create', { kind: 'parlay', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -3.5 }, { gameId: 'SEA-SF', market: 'total', side: 'over', line: 40 }], odds: 260, stakeUnits: 1, source: 'Fixture ticket' })).id;
  const entryOf = async id => (await readState()).state.entries.find(e => e.id === id);
  await commit(TROY, 'settle', { entryId: ids.manual, revision: 1, outcome: 'loss', reason: 'My book graded it' });
  await commit(SEAN, 'settle', { entryId: ids.reopened, revision: 1, outcome: 'win', reason: 'Reported' });
  await commit(SEAN, 'settle', { entryId: ids.reopened, revision: 2, outcome: 'pending', reason: 'Book regraded, waiting' });
  const ledger = (game, version, status, home, away, observed) => db.query('insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,source_url,observed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [SEASON, WEEK, game, version, status, home, away, 'nflverse nfldata games.csv final scores', 'https://example.test/games.csv', observed]);
  await ledger('TB-DAL', 1, 'final', 24, 20, '2026-10-19T04:00:00Z');
  await ledger('SEA-SF', 1, 'final', 27, 17, '2026-10-20T04:00:00Z');
  await ledger('NYJ-NE', 1, 'postponed', null, null, '2026-10-18T15:00:00Z');
  await ledger('BUF-MIA', 1, 'cancelled', null, null, '2026-10-18T15:00:00Z');
  const settle = (args = {}) => service.rpc('gtl_settle_social_pending', { p_season: SEASON, p_week: null, p_now: null, p_dry_run: false, ...args });
  return { db, as, service, settle, readState, entryOf, ids, commit, ledger };
}

test('grants: browser roles cannot run either function; both are service-only security invoker', { skip }, async t => {
  const { db, as } = await world(t);
  for (const fn of ['gtl_settle_social_pending(integer,integer,timestamptz,boolean)', 'gtl_social_auto_grade(integer,integer,jsonb,timestamptz)']) {
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${fn}`);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${fn}`, 'EXECUTE'])).rows[0].ok, true);
  }
  assert.ok((await db.query("select bool_and(not prosecdef and proconfig @> array['search_path=\"\"']) ok from pg_proc where proname in ('gtl_settle_social_pending','gtl_social_auto_grade')")).rows[0].ok);
  await assert.rejects(() => as('authenticated', 'select public.gtl_settle_social_pending()'), /permission denied/);
});

test('settles after the Pacific day, leaves player results alone, and is replay-safe', { skip }, async t => {
  const w = await world(t);
  const before = await w.readState();
  await assert.rejects(() => w.settle({ p_now: new Date(Date.now() + 3_600_000).toISOString() }), /GTL_SOCIAL_SETTLE_INPUT/, 'the clock only moves back');
  await assert.rejects(() => w.settle({ p_season: null, p_week: 7 }), /GTL_SOCIAL_SETTLE_INPUT/);

  // Sunday 11:59 PM PDT: the Sunday night game's day has not ended; nothing is written.
  const sunday = await w.settle({ p_now: '2026-10-19T06:59:00Z' });
  assert.equal(sunday.settled + sunday.voided, 0); assert.deepEqual(sunday.weeks, []);
  assert.equal((await w.readState()).revision, before.revision);

  // A dry run reports what a run would do and writes nothing.
  const preview = await w.settle({ p_now: '2026-10-19T07:00:00Z', p_dry_run: true });
  assert.equal(preview.settled, 3); assert.equal(preview.voided, 1);
  assert.equal((await w.readState()).revision, before.revision);

  // Monday 00:00 PDT: TB-DAL settles, Monday night waits, postponed and no-final stay pending, cancelled voids.
  const monday = await w.settle({ p_now: '2026-10-19T07:00:00Z' });
  assert.deepEqual({ settled: monday.settled, voided: monday.voided, outcomes: monday.outcomes, waiting: monday.waiting, needsManual: monday.needsManual, userReopened: monday.userReopened },
    { settled: 3, voided: 1, outcomes: { win: 1, push: 1, loss: 1, void: 1 }, waiting: { before_day_end: 1, postponed: 1, no_final: 1 }, needsManual: { prop: 1, parlay: 1 }, userReopened: 1 });
  assert.deepEqual(monday.weeks, [{ season: SEASON, week: WEEK, revision: Number(before.revision) + 1, settled: 4 }]);
  const win = await w.entryOf(w.ids.winHome);
  assert.equal(win.outcome, 'win'); assert.equal(win.settlementSource, 'automatic_final'); assert.equal(win.revision, 2);
  assert.match(win.settledAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual({ home: win.autoSettlement.home, away: win.autoSettlement.away, margin: win.autoSettlement.margin, netUnits: win.autoSettlement.netUnits, version: win.autoSettlement.version, actor: win.autoSettlement.actor },
    { home: 24, away: 20, margin: 0.5, netUnits: 0.9091, version: 1, actor: 'system' });
  assert.equal(win.odds, -110); assert.equal(win.stakeUnits, 1); assert.deepEqual(win.legs[0].line, -3.5, 'saved terms never change');
  assert.equal((await w.entryOf(w.ids.pushTotal)).outcome, 'push');
  assert.equal((await w.entryOf(w.ids.lossAway)).outcome, 'loss');
  assert.equal((await w.entryOf(w.ids.cancelled)).outcome, 'void');
  for (const name of ['mnf', 'postponed', 'noFinal', 'prop', 'parlay', 'reopened']) assert.equal((await w.entryOf(w.ids[name])).outcome, 'pending', name);
  const manual = await w.entryOf(w.ids.manual);
  assert.equal(manual.outcome, 'loss'); assert.equal(manual.settlementSource, 'user_reported', 'the owner\'s own result is never overwritten');
  const audit = (await w.readState()).state.audit.filter(e => e.actorId === 'system');
  assert.equal(audit.length, 4);
  assert.ok(audit.every(e => e.action === 'settle' && e.before.outcome === 'pending' && e.source === 'nflverse nfldata games.csv final scores' && e.observedAt && e.reason.startsWith('Settled automatically')));
  assert.equal((await w.db.query('select count(*)::int n from public.gtl_social_commits')).rows[0].n, Object.keys(TICKETS).length + 4, 'no player commit (or feed post) is invented');

  // Replay: same run again changes nothing.
  const again = await w.settle({ p_now: '2026-10-19T07:00:00Z' });
  assert.equal(again.settled + again.voided + again.regraded, 0); assert.deepEqual(again.weeks, []);
  assert.equal((await w.readState()).revision, Number(before.revision) + 1);

  // Tuesday: Monday night settles; a corrected TB-DAL final re-grades only the system's own settlements.
  await w.ledger('TB-DAL', 2, 'final', 20, 24, '2026-10-20T15:00:00Z');
  const tuesday = await w.settle({ p_now: '2026-10-20T07:00:00Z' });
  assert.equal(tuesday.settled, 1); assert.equal(tuesday.regraded, 3);
  assert.equal((await w.entryOf(w.ids.mnf)).outcome, 'win');
  const regraded = await w.entryOf(w.ids.winHome);
  assert.equal(regraded.outcome, 'loss'); assert.equal(regraded.autoSettlement.version, 2); assert.equal(regraded.revision, 3);
  assert.equal((await w.entryOf(w.ids.manual)).outcome, 'loss', 'still the owner\'s result');
  assert.equal((await w.settle({ p_now: '2026-10-20T07:00:00Z' })).regraded, 0, 'one re-grade per ledger version');

  // A later postponement never un-settles; a rescheduled final settles after its own day.
  await w.ledger('NYJ-NE', 2, 'final', 30, 10, '2026-10-22T03:00:00Z');
  assert.equal((await w.settle({ p_now: '2026-10-22T06:59:00Z' })).waiting.before_day_end, 1);
  assert.equal((await w.settle({ p_now: '2026-10-22T07:00:00Z' })).settled, 1);
  assert.equal((await w.entryOf(w.ids.postponed)).outcome, 'win');
});

test('the twin matches the SQL grade, and players keep working after a system settlement', { skip }, async t => {
  const w = await world(t);
  const state = (await w.readState()).state;
  const rows = (await w.db.query('select game_id,version,status,home,away,observed_at,source,source_url from public.gtl_virtual_units_settlements')).rows;
  for (const now of ['2026-10-19T06:59:00Z', '2026-10-19T07:00:00Z', '2026-10-20T07:00:00Z']) for (const entry of state.entries) {
    const sql = (await w.service.rpc('gtl_social_auto_grade', { p_season: SEASON, p_week: WEEK, p_entry: entry, p_now: now }));
    const game = GAMES.find(g => g.id === entry.legs[0].gameId);
    const js = gradeSocialEntry(entry, { kickoff: game?.kickoff ?? null, now: Date.parse(now), results: rows.filter(r => r.game_id === entry.legs[0].gameId)
      .map(r => ({ version: Number(r.version), status: r.status, home: r.home, away: r.away, observedAt: r.observed_at.toISOString(), source: r.source, sourceUrl: r.source_url })) });
    assert.equal(sql.status, js.status, `${entry.id} ${now}`); assert.equal(sql.reason, js.reason); assert.equal(sql.outcome, js.outcome);
    if (sql.status === 'settle') {
      assert.equal(Number(sql.netUnits ?? NaN), Number(js.netUnits ?? NaN)); assert.equal(Number(sql.margin ?? NaN), Number(js.margin ?? NaN));
      assert.equal(Date.parse(sql.eligibleAt), Date.parse(js.eligibleAt));
    }
  }
  // The backfill script's read-only preview (part 1) sees every pending ticket and what it would become.
  const admin = fs.readFileSync(new URL('../supabase/admin/settle_pending_backfill.sql', import.meta.url), 'utf8');
  const preview = admin.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').split(';')[0];
  const previewRows = (await w.db.query(preview)).rows, total = status => previewRows.filter(r => r.status === status).reduce((n, r) => n + Number(r.tickets), 0);
  assert.deepEqual([total('settle'), total('waiting'), total('manual')], [6, 2, 2]);
  assert.equal(Number(previewRows.find(r => r.would_be === 'void').tickets), 1);
  await w.settle({ p_now: '2026-10-19T07:00:00Z' });
  // The owner of a tracked ticket can still report a different result over the system's; it is then never re-graded.
  const win = await w.entryOf(w.ids.winHome);
  await w.commit(TROY, 'settle', { entryId: win.id, revision: win.revision, outcome: 'push', reason: 'Book graded a push' }, Date.now());
  await w.ledger('TB-DAL', 2, 'final', 25, 20, '2026-10-20T15:00:00Z');
  await w.settle({ p_now: '2026-10-20T07:00:00Z' });
  const mine = await w.entryOf(w.ids.winHome);
  assert.equal(mine.outcome, 'push'); assert.equal(mine.settlementSource, 'user_reported');
  // A stale write from before the system settlement is refused, not merged over it.
  const saved = await w.readState();
  await assert.rejects(() => w.service.rpc('gtl_commit_social', { p_user: SEAN, p_season: SEASON, p_week: WEEK, p_expected_revision: Number(saved.revision) - 2, p_request_id: uid(900),
    p_action: 'include', p_body: { requestId: uid(900) }, p_state: saved.state }), /GTL_SOCIAL_CONFLICT|GTL_SOCIAL_INVALID/);
  // The public projection reads the system settlement like any other: record and net units from the saved price.
  const view = await handleSocial({ route: '/social/read', body: { season: SEASON, week: WEEK }, user: { id: SEAN, emailConfirmed: true, email: 'fixture@example.invalid' }, service: w.service, clock: () => Date.now() });
  const sean = view.entries.filter(e => e.ownerId === SEAN);
  const loss = sean.find(e => e.id === w.ids.lossAway);
  assert.equal(loss.outcome, 'loss'); assert.equal(loss.netUnits, -1); assert.equal(loss.settlementSource, 'automatic_final');
  assert.ok(loss.audit.some(e => e.action === 'settle' && e.after.settlementSource === 'automatic_final'));
  assert.equal(summarizeSocialBets(sean).losses, 1);
});
