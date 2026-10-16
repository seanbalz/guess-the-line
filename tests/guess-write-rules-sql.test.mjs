import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL as FUTURE_MIGRATIONS, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, PRELUDE, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, pickSecrets, readersOn } from './helpers/leak-scan.mjs';
import { serviceSql, storeLines } from './helpers/guess-week.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';
import { TODAYS_RULES, readLiveRules } from '../cloud/live-rules.mjs';
import { handlePersonal } from '../cloud/personal.mjs';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';
import { ballotFinal, lockedIn, pickFinal } from '../web/src/sentFinal.js';
import { ballotLockedIn } from '../server/engine.mjs';

// Redesign build plan stage 18, M-02 (20261015030000_gtl_sent_picks_final.sql): a locked-in Guess pick is final in every writer
// (D-37 as amended by D-39). Lock-in is per game and market: a pick in a submitted ballot (every pick the old app's whole-market
// Submit sends, and every ballot sent before M-02), or one the ballot's server-written lockedAt names (the new app's per-game
// lock-in, through /personal/ballot's lockIn). Runs on ALL (the hosted project does not have M-02 yet), through the real
// gtl-api handler and the raw RPCs, on local PGlite only. Fixture accounts and values only, never real player data.
//
// The week: four games; the first kicks off at the deadline, the rest an hour apart. Troy's Spread and Total were sent before
// M-02 (the world's legacy rows). Every other pick and line is an unusual half point, so the leak scan can name each one.
// This suite proves the pre-M-07 stage contract; M-07 has its own full-stack SQL suite.
const ALL = FUTURE_MIGRATIONS.filter(file => file < '20261015190710_gtl_guess_write_window.sql');

const M02 = '20261015030000_gtl_sent_picks_final.sql', M01 = '20261014223000_gtl_guess_gate_per_game.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const LOCKED = { error: 'Sent picks are final.', code: 'GTL_BALLOT_LOCKED' };
const LINES = { spread: [-10.5, 12.5, 5.5, -8.5], total: [57.5, 32.5, 51.5, 35.5] };
const LUKE = { spread: [-4.5, 1.5, 7.5, -13.5], edited: -6.5 };
const SEAN = { total: [38.5, 43.5, 46.5, 27.5], draft: 29.5 };
const REPLACED = ['gtl_guess_locked_in(uuid,integer,integer,text,text)', 'gtl_live_rules()', 'gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean)',
  'gtl_mutate_personal(uuid,text,jsonb)', 'gtl_guard_fresh_submission()'];
const TRIGGERS = [['gtl_ballot_window', 'gtl_ballot_window_guard'], ['gtl_feed_on_ballot', 'gtl_feed_on_ballot'],
  ['gtl_fresh_submission_guard', 'gtl_guard_fresh_submission'], ['gtl_optout_ballot_guard', 'gtl_guard_optout_ballot']];
const id = name => ACCOUNTS[name].id;

/** A /personal/ballot save as the old app (and the new app) sends it, with the revisions read first. */
async function save(world, account, mode, picks, { submit = false, lockIn } = {}) {
  const { season, week } = world.state.league;
  const workspace = await world.api(account, 'personal');
  assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
  const { revision, weeklyRevision } = workspace.body;
  return world.api(account, 'personal/ballot', { season, week, mode, picks, submit, revision, weeklyRevision, requestId: randomUUID(), ...(lockIn ? { lockIn } : {}) });
}
/** A group ballot save (/ballot), as the old app's group screens send it. */
async function groupSave(world, account, mode, picks, submit) {
  const state = await world.api(account, `state?mode=${mode}`);
  assert.equal(state.status, 200, JSON.stringify(state.body));
  return world.api(account, `ballot?mode=${mode}`, { revision: state.body.revision, picks, submit });
}
const row = async (world, who, mode) => (await world.db.query('select ballot,audit,ballot::text bt,audit::text at from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(who), mode])).rows[0];
const revisionOf = async (world, who) => (await world.db.query('select revision from public.gtl_weekly_versions where user_id=$1', [id(who)])).rows[0]?.revision ?? null;
/** A direct update of one ballot row as the service role (gtl-api's own role, which holds the update grant). */
const directUpdate = (world, who, mode, ballot) => world.db.transaction(async tx => {
  await tx.exec('set local role service_role');
  await tx.query('update public.gtl_weekly_ballots set ballot=$1 where user_id=$2 and mode=$3', [ballot, id(who), mode]);
});
/** Runs `check` with the gtl_fresh_submission_guard trigger switched off, so a writer's own refusal is what is tested. */
async function writersAlone(db, check) {
  await db.exec('alter table public.gtl_weekly_ballots disable trigger gtl_fresh_submission_guard');
  try { await check(); } finally { await db.exec('alter table public.gtl_weekly_ballots enable trigger gtl_fresh_submission_guard'); }
}
const personalBody = async (world, account, mode, picks, extra = {}) => {
  const { season, week } = world.state.league, workspace = (await world.api(account, 'personal')).body;
  return { season, week, mode, weeklyRevision: workspace.weeklyRevision, picks, submit: false, requestId: randomUUID(), revision: workspace.revision, ...extra };
};
const groupRevision = async (world, account, mode) => (await world.api(account, `state?mode=${mode}`)).body.revision;
const md5s = async db => new Map((await db.query("select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows
  .map(r => [r.sig.replace(/ /g, '').replace(/p_\w+/g, '').replace(/\(,/g, '(').replace(/,,/g, ','), r.m]));

test('M-02 is a repo file the hosted project does not have yet, with md5 headers, a rollback and no new argument list', () => {
  assert.ok(ALL.includes(M02) && ALL.at(-1) >= M02, 'M-02 sorts after every file it replaces a body from');
  assert.ok(NOT_HOSTED.includes(version(M02)), 'listed in NOT_HOSTED until the apply record removes it (Gate M step 8)');
  assert.ok(fs.existsSync(path.join(ROLLBACK_DIR, M02)), 'its rollback restores the five previous bodies');
  const cat = catalog(readMigrations(ALL)), own = cat.files.find(f => f.file === M02);
  assert.deepEqual(own.functions.map(fn => fn.name).sort(), ['gtl_ballot_locked_in', 'gtl_guard_fresh_submission', 'gtl_guess_locked_in', 'gtl_live_rules', 'gtl_mutate_personal', 'gtl_save_weekly_ballot']);
  for (const fn of own.functions.filter(fn => fn.previous)) {
    assert.equal(fn.args, fn.previous.args, `${fn.name} keeps its argument list`);
    assert.ok(own.headers.some(h => h.name === fn.name && h.md5 === fn.previous.md5), `${fn.name} names the body it replaces`);
  }
  // Section 5 rule 9: gtl_mutate_personal's newest body is M-29's, gtl_live_rules' and gtl_guess_locked_in's are M-01's.
  assert.deepEqual(Object.fromEntries(own.functions.filter(fn => fn.previous).map(fn => [fn.name, fn.previous.file.slice(0, 14)])), {
    gtl_guess_locked_in: '20261014223000', gtl_live_rules: '20261014223000', gtl_save_weekly_ballot: '20261012230000',
    gtl_mutate_personal: '20261014233000', gtl_guard_fresh_submission: '20261012230000' });
  const sql = migrationSql(M02);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(?:drop|delete|truncate|alter\s+table|insert\s+into\s+public\.gtl_weekly_ballots\s+select)\b/i, 'function-only, additive (D-23)');
});

test('gtl_live_rules (M-02): sentFinal true, lateWindow deadline; revealAt is M-01\'s when M-01 is applied, else today\'s; the rollback puts M-01\'s back', { skip }, async t => {
  const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite(); t.after(() => db.close());
  const optionalRpc = async name => {
    try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}() value`)).rows[0].value; }); }
    catch (error) { if (error.code === '42883') return FEATURE_OFF; throw error; }
  };
  await db.exec(PRELUDE);
  // The schema before October 14, 2026 had neither M-01 nor M-02: the deadline rules.
  for (const file of HOSTED.filter(file => file !== M01)) await db.exec(migrationSql(file));
  assert.deepEqual(await readLiveRules(optionalRpc), TODAYS_RULES);
  // M-02 applied without M-01 (out of order): a working function that keeps today's deadline reveal.
  await db.exec(migrationSql(M02));
  assert.deepEqual(await optionalRpc('gtl_live_rules'), { sentFinal: true, lateWindow: 'deadline', revealAt: 'deadline' });
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['gtl_live_rules()', 'gtl_ballot_locked_in(jsonb,text)', 'gtl_guess_locked_in(uuid,integer,integer,text,text)']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${fn}`);
    }
  }
  // M-01 applied after M-02 puts back its own two bodies (the release card's reason to apply M-01 first); rerunning M-02 fixes it.
  await db.exec(migrationSql(M01));
  assert.deepEqual(await readLiveRules(optionalRpc), { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' });
  await db.exec(migrationSql(M02));
  assert.deepEqual(await readLiveRules(optionalRpc), { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' }, 'whichever is applied second keeps the other\'s field');
  // The rollback restores M-01's body: every view carries sentFinal false again, with M-01's kickoff reveal.
  await db.exec(fs.readFileSync(path.join(ROLLBACK_DIR, M02), 'utf8'));
  assert.deepEqual(await readLiveRules(optionalRpc), { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' });
});

test('the four ballot triggers: gtl_fresh_submission_guard changes; gtl_feed_on_ballot, gtl_optout_ballot_guard and gtl_ballot_window do not', { skip }, async t => {
  const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL.filter(f => f < M02)) await db.exec(migrationSql(file));
  const triggers = async () => (await db.query("select t.tgname,p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.gtl_weekly_ballots'::regclass and not t.tgisinternal order by 1")).rows.map(r => [r.tgname, r.proname]);
  const body = async name => (await db.query('select md5(prosrc) m from pg_proc where proname=$1', [name])).rows[0].m;
  const before = await triggers(), bodies = Object.fromEntries(await Promise.all(TRIGGERS.map(async ([, fn]) => [fn, await body(fn)])));
  assert.deepEqual(before, TRIGGERS);
  await db.exec(migrationSql(M02));
  assert.deepEqual(await triggers(), TRIGGERS, 'the same four triggers on the same functions');
  for (const [, fn] of TRIGGERS) {
    if (fn === 'gtl_guard_fresh_submission') assert.notEqual(await body(fn), bodies[fn], 'changed: the lock-in guard');
    else assert.equal(await body(fn), bodies[fn], `${fn} unchanged`);
  }
  // Rerunnable, one pg_proc row per function, and the replaced functions keep their grants (service role only).
  const once = await md5s(db);
  await db.exec(migrationSql(M02));
  assert.deepEqual(await md5s(db), once);
  for (const sig of [...REPLACED, 'gtl_ballot_locked_in(jsonb,text)']) {
    const name = sig.split('(')[0];
    assert.deepEqual((await db.query('select prosecdef from pg_proc where proname=$1', [name])).rows, [{ prosecdef: false }], `${name}: one invoker function`);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${sig}`, 'EXECUTE'])).rows[0].ok, true, sig);
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${sig}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${sig}`);
  }
});

test('sent picks are final: every writer and a direct update refuse a change; pending-line resolution and an unchanged re-save still pass', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 4, groupScreens: true, optionalRpc: true });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const sql = serviceSql(db), { season, week } = state.league;
  // Luke sends Spread before any line is stored: every guess is pending until the first line collected after it (D-27).
  let sent = await save(world, 'luke', 'guess_spread', map(LUKE.spread), { submit: true });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const original = await row(world, 'luke', 'guess_spread'), revision = await revisionOf(world, 'luke');
  assert.ok(original.ballot.submittedAt);
  assert.deepEqual(Object.keys(original.ballot.lockedAt).sort(), [...ids].sort(), 'a send records each guess it locks in');
  assert.ok(Object.values(original.ballot.lockedAt).every(at => at === original.ballot.updatedAt), 'at the send');
  assert.ok(Object.values(original.ballot.scoringReferences).every(ref => ref.status === 'pending'));
  assert.deepEqual(original.audit.map(e => [e.type, e.lockedGameIds.length]), [['ballot_submitted', 4]]);
  const unchanged = async label => {
    const now = await row(world, 'luke', 'guess_spread');
    assert.equal(now.bt, original.bt, `${label}: the stored ballot is byte for byte the same`);
    assert.equal(now.at, original.at, `${label}: no audit event`);
    assert.equal(await revisionOf(world, 'luke'), revision, `${label}: no revision`);
  };

  await t.test('the old app\'s /personal/ballot (Community Picks and Solo): 409 "Sent picks are final." with its code', async () => {
    for (const [label, picks, submit] of [['an edit sent again', { ...map(LUKE.spread), [ids[1]]: LUKE.edited }, true], ['an edit saved as a draft', { ...map(LUKE.spread), [ids[1]]: LUKE.edited }, false],
      ['a pick left out', Object.fromEntries(ids.slice(1).map((g, i) => [g, LUKE.spread[i + 1]])), false], ['every pick cleared', {}, false]]) {
      const res = await save(world, 'luke', 'guess_spread', picks, { submit });
      assert.deepEqual([res.status, res.body], [409, LOCKED], label);
      await unchanged(label);
    }
    // The raw RPC refuses the same without gtl-api.
    const workspace = (await world.api('luke', 'personal')).body;
    await assert.rejects(() => sql('gtl_mutate_personal', { p_user: id('luke'), p_action: 'personal/ballot', p_body: { season, week, mode: 'guess_spread', weeklyRevision: workspace.weeklyRevision,
      picks: { ...map(LUKE.spread), [ids[2]]: LUKE.edited }, submit: true, requestId: randomUUID(), revision: workspace.revision } }), /GTL_BALLOT_LOCKED/);
    await unchanged('raw gtl_mutate_personal');
  });

  await t.test('the group ballot (/ballot): the engine mirror answers 409 first; gtl_save_weekly_ballot refuses on its own', async () => {
    const res = await groupSave(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[3]]: LUKE.edited }, true);
    assert.deepEqual([res.status, res.body], [409, LOCKED]);
    const revisionNow = (await world.api('luke', 'state?mode=guess_spread')).body.revision;
    await assert.rejects(() => sql('gtl_save_weekly_ballot', { p_user: id('luke'), p_league: 'sean-troy-luke', p_mode: 'guess_spread', p_revision: revisionNow,
      p_picks: { ...map(LUKE.spread), [ids[3]]: LUKE.edited }, p_submit: true }), /GTL_BALLOT_LOCKED/);
    await assert.rejects(() => sql('gtl_save_weekly_ballot', { p_user: id('luke'), p_league: 'sean-troy-luke', p_mode: 'guess_spread', p_revision: revisionNow,
      p_picks: { [ids[0]]: LUKE.spread[0] }, p_submit: false }), /GTL_BALLOT_LOCKED/, 'a group draft save that leaves picks out');
    await unchanged('group ballot');
    // The /state view carries the per-game record the old group screen reads (web/src/sentFinal.js lockedIn).
    const view = (await world.api('luke', 'state?mode=guess_spread')).body;
    assert.deepEqual([view.rules.sentFinal, Object.keys(view.lockedAt).length], [true, 4]);
  });

  await t.test('each writer refuses on its own, with the guard trigger switched off for the check', async () => {
    await writersAlone(db, async () => {
      await assert.rejects(async () => sql('gtl_mutate_personal', { p_user: id('luke'), p_action: 'personal/ballot',
        p_body: await personalBody(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[1]]: LUKE.edited }, { submit: true }) }), /GTL_BALLOT_LOCKED/, 'gtl_mutate_personal');
      await assert.rejects(async () => sql('gtl_save_weekly_ballot', { p_user: id('luke'), p_league: 'sean-troy-luke', p_mode: 'guess_spread',
        p_revision: await groupRevision(world, 'luke', 'guess_spread'), p_picks: { ...map(LUKE.spread), [ids[1]]: LUKE.edited }, p_submit: true }), /GTL_BALLOT_LOCKED/, 'gtl_save_weekly_ballot');
    });
    await unchanged('the writers alone');
  });

  await t.test('a direct update (gtl_fresh_submission_guard): a value, a removal, a lock-in time or a saved line of a locked-in guess', async () => {
    const b = original.ballot, other = { ...b.picks, [ids[0]]: LUKE.edited };
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, picks: other, updatedAt: new Date().toISOString() }), /GTL_BALLOT_LOCKED/, 'a changed value');
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, picks: { ...b.picks, [ids[0]]: undefined } }), /GTL_BALLOT_LOCKED/, 'a removed pick');
    const { lockedAt, ...withoutLocks } = b;
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', withoutLocks), /GTL_BALLOT_LOCKED/, 'the lock-in record removed');
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, lockedAt: { ...lockedAt, [ids[1]]: '2026-01-01T00:00:00Z' } }), /GTL_BALLOT_LOCKED/, 'a lock-in time moved');
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, lockedAt: 'every game' }), /GTL_BALLOT_INVALID/, 'a lock-in record that is not an object');
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, scoringReferences: { ...b.scoringReferences, [ids[2]]: { ...b.scoringReferences[ids[2]], status: 'available', value: LUKE.spread[2] } } }),
      /GTL_SUBMISSION_ODDS_REQUIRED/, 'a forged line for a locked-in guess');
    await assert.rejects(() => directUpdate(world, 'luke', 'guess_spread', { ...b, submittedAt: null }), /GTL_BALLOT_INCOMPLETE/, 'a send is never undone');
    await unchanged('direct updates');
  });

  await t.test('still allowed: an unchanged re-save, and D-27 pending-line resolution through a stored collection', async () => {
    const again = await save(world, 'luke', 'guess_spread', map(LUKE.spread), { submit: true });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const resaved = await row(world, 'luke', 'guess_spread');
    assert.deepEqual([resaved.ballot.picks, resaved.ballot.submittedAt, resaved.ballot.lockedAt, resaved.ballot.scoringReferences],
      [original.ballot.picks, original.ballot.submittedAt, original.ballot.lockedAt, original.ballot.scoringReferences], 'nothing a send stored moves');
    assert.deepEqual(resaved.audit.at(-1).changedGameIds, []);
    // A collection after the send (the commissioner's collect and the scheduled run end in gtl_finish_odds_collection) resolves the
    // pending lines in its own transaction; the guard lets exactly that change through on a sent ballot.
    await db.exec("update public.gtl_odds_budget set last_successful_preflight_at=now(),conservative_remaining=400,last_collection_at=null,lease_token=null,lease_until=null,paused=false");
    const request = randomUUID();
    const begun = await sql('gtl_begin_odds_collection', { p_user: id('sean'), p_request: request, p_operation: 'collect' });
    const captured = new Date(Date.now()).toISOString(), observed = new Date(Date.now() - 1000).toISOString();
    const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: captured, games: begun.games.map((g, i) => ({
      gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
      markets: Object.fromEntries(['spread', 'total'].map(market => { const line = LINES[market][ids.indexOf(g.id)]; return [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
        provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: captured, providerObservedAt: observed,
        outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
      })) }]; })) })) };
    const finished = await sql('gtl_finish_odds_collection', { p_user: id('sean'), p_request: request, p_lease: begun.lease, p_payload: payload, p_quota: { remaining: 398, used: 2, last: 2 }, p_error: null });
    assert.equal(finished.status, 'succeeded', JSON.stringify(finished));
    const resolved = await row(world, 'luke', 'guess_spread');
    assert.ok(Object.entries(resolved.ballot.scoringReferences).every(([g, ref]) => ref.status === 'available' && ref.basis === 'first_line_after_submission' && ref.value === LINES.spread[ids.indexOf(g)]));
    assert.deepEqual([resolved.ballot.picks, resolved.ballot.submittedAt, resolved.ballot.lockedAt], [original.ballot.picks, original.ballot.submittedAt, original.ballot.lockedAt]);
    assert.equal(resolved.audit.at(-1).type, 'reference_resolved');
  });

  await t.test('a ballot sent before M-02 (Troy\'s legacy rows, no lockedAt) is final as stored; no lock-in time is invented for it', async () => {
    const troy = await row(world, 'troy', 'guess_total');
    assert.ok(troy.ballot.submittedAt && !('lockedAt' in troy.ballot));
    assert.equal(await sql('gtl_guess_locked_in', { p_user: id('troy'), p_season: season, p_week: week, p_mode: 'guess_total', p_game: ids[0] }), true);
    const res = await save(world, 'troy', 'guess_total', { ...world.troyPicks.guess_total, [ids[0]]: 40.5 }, { submit: true });
    assert.deepEqual([res.status, res.body], [409, LOCKED]);
    assert.equal((await row(world, 'troy', 'guess_total')).bt, troy.bt);
  });
});

test('per-game lock-in (D-39): locking in one game leaves the market\'s other games editable drafts; the last lock-in is the send', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 4, groupScreens: true, optionalRpc: true });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const sql = serviceSql(db), { season, week } = state.league;
  const lockedInSql = (who, mode, game) => sql('gtl_guess_locked_in', { p_user: id(who), p_season: season, p_week: week, p_mode: mode, p_game: game });
  const visible = async (who, now = new Date().toISOString()) => sql('gtl_markets_visible', { p_user: id(who), p_season: season, p_week: week, p_now: now });
  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  const draftPicks = { [ids[0]]: SEAN.total[0], [ids[1]]: SEAN.total[1] };

  // Sean locks in the first game's Total on a draft that also holds a second guess.
  let res = await save(world, 'sean', 'guess_total', draftPicks, { lockIn: [ids[0]] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const first = await row(world, 'sean', 'guess_total');
  assert.equal(first.ballot.submittedAt, null, 'still a draft: the market is not sent');
  assert.deepEqual(first.ballot.lockedAt, { [ids[0]]: first.ballot.updatedAt });
  assert.deepEqual(Object.keys(first.ballot.scoringReferences), [ids[0]], 'only the locked-in guess saves its line');
  assert.deepEqual([first.ballot.scoringReferences[ids[0]].status, first.ballot.scoringReferences[ids[0]].value, first.ballot.scoringReferences[ids[0]].savedAt],
    ['available', LINES.total[0], first.ballot.updatedAt], 'the line at the lock-in');
  assert.deepEqual([first.audit.at(-1).type, first.audit.at(-1).lockedGameIds], ['guess_locked_in', [ids[0]]]);
  assert.deepEqual([await lockedInSql('sean', 'guess_total', ids[0]), await lockedInSql('sean', 'guess_total', ids[1]), await lockedInSql('sean', 'guess_spread', ids[0])], [true, false, false]);
  // The same reading in the old app (web/src/sentFinal.js) and the engine mirror.
  const rules = { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
  assert.deepEqual(ids.map(g => [lockedIn(first.ballot, g), ballotLockedIn(first.ballot, g), pickFinal(rules, first.ballot, g)]), [[true, true, true], [false, false, false], [false, false, false], [false, false, false]]);
  assert.equal(ballotFinal(rules, first.ballot, ids), false);
  // M-01's gate opens that one game and market for Sean, nothing else.
  assert.deepEqual(await visible('sean'), Object.fromEntries(ids.map((g, i) => [g, { spread: false, total: i === 0 }])));

  await t.test('the other games stay drafts: changed, cleared and changed again through either writer', async () => {
    for (const picks of [{ ...draftPicks, [ids[1]]: SEAN.draft }, { [ids[0]]: SEAN.total[0] }, { ...draftPicks, [ids[2]]: SEAN.total[2] }]) {
      res = await save(world, 'sean', 'guess_total', picks);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const now = await row(world, 'sean', 'guess_total');
      assert.deepEqual([now.ballot.picks, now.ballot.lockedAt, now.ballot.scoringReferences, now.ballot.submittedAt], [picks, first.ballot.lockedAt, first.ballot.scoringReferences, null]);
    }
    res = await groupSave(world, 'sean', 'guess_total', { ...draftPicks, [ids[2]]: SEAN.draft }, false);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual((await row(world, 'sean', 'guess_total')).ballot.lockedAt, first.ballot.lockedAt, 'a group draft save keeps the lock-in');
  });

  await t.test('the locked-in game is final through every writer and a direct update', async () => {
    const before = await row(world, 'sean', 'guess_total');
    for (const [label, picks] of [['changed', { ...before.ballot.picks, [ids[0]]: SEAN.draft }], ['left out', { [ids[1]]: SEAN.total[1] }]]) {
      res = await save(world, 'sean', 'guess_total', picks);
      assert.deepEqual([res.status, res.body], [409, LOCKED], `/personal/ballot: ${label}`);
      res = await groupSave(world, 'sean', 'guess_total', picks, false);
      assert.deepEqual([res.status, res.body], [409, LOCKED], `/ballot: ${label}`);
    }
    await assert.rejects(() => directUpdate(world, 'sean', 'guess_total', { ...before.ballot, picks: { ...before.ballot.picks, [ids[0]]: SEAN.draft } }), /GTL_BALLOT_LOCKED/);
    await writersAlone(db, async () => {
      await assert.rejects(async () => sql('gtl_mutate_personal', { p_user: id('sean'), p_action: 'personal/ballot',
        p_body: await personalBody(world, 'sean', 'guess_total', { ...before.ballot.picks, [ids[0]]: SEAN.draft }) }), /GTL_BALLOT_LOCKED/, 'gtl_mutate_personal alone');
      await assert.rejects(async () => sql('gtl_save_weekly_ballot', { p_user: id('sean'), p_league: 'sean-troy-luke', p_mode: 'guess_total',
        p_revision: await groupRevision(world, 'sean', 'guess_total'), p_picks: { [ids[1]]: SEAN.total[1] }, p_submit: false }), /GTL_BALLOT_LOCKED/, 'gtl_save_weekly_ballot alone');
    });
    const after = await row(world, 'sean', 'guess_total');
    assert.deepEqual([after.bt, after.at], [before.bt, before.at]);
  });

  await t.test('a lock-in only the server can write: a forged lockedAt, or one without its line, is refused', async () => {
    const b = (await row(world, 'sean', 'guess_total')).ballot, stamp = new Date().toISOString();
    await assert.rejects(() => directUpdate(world, 'sean', 'guess_total', { ...b, lockedAt: { ...b.lockedAt, [ids[1]]: '2026-01-01T00:00:00Z' } }), /GTL_BALLOT_INVALID/, 'not this write\'s time');
    await assert.rejects(() => directUpdate(world, 'sean', 'guess_total', { ...b, lockedAt: { ...b.lockedAt, [ids[3]]: stamp }, updatedAt: stamp }), /GTL_BALLOT_INVALID/, 'a game with no guess');
    await assert.rejects(() => directUpdate(world, 'sean', 'guess_total', { ...b, lockedAt: { ...b.lockedAt, [ids[1]]: stamp }, updatedAt: stamp }), /GTL_SUBMISSION_ODDS_REQUIRED/, 'no line saved with it');
    await assert.rejects(() => directUpdate(world, 'sean', 'guess_total', { ...b, scoringReferences: { [ids[0]]: { ...b.scoringReferences[ids[0]], value: SEAN.draft } } }), /GTL_SUBMISSION_ODDS_REQUIRED/, 'the locked-in line edited');
  });

  await t.test('lockIn is checked: distinct games, each with a guess in the same save', async () => {
    for (const lockIn of [[ids[3]], [ids[0], ids[0]], ['XX-YY']]) {
      res = await save(world, 'sean', 'guess_total', draftPicks, { lockIn });
      assert.equal(res.status, 400, `${JSON.stringify(lockIn)}: ${JSON.stringify(res.body)}`);
    }
    const workspace = (await world.api('sean', 'personal')).body;
    await assert.rejects(() => sql('gtl_mutate_personal', { p_user: id('sean'), p_action: 'personal/ballot', p_body: { season, week, mode: 'guess_total', weeklyRevision: workspace.weeklyRevision,
      picks: draftPicks, submit: false, lockIn: [ids[3]], requestId: randomUUID(), revision: workspace.revision } }), /GTL_PERSONAL_INVALID/, 'the SQL checks it too');
    await assert.rejects(() => sql('gtl_mutate_personal', { p_user: id('sean'), p_action: 'favorite/set', p_body: { season, week, gameId: ids[0], saved: true, notes: '',
      lockIn: [ids[0]], requestId: randomUUID(), revision: workspace.revision } }), /GTL_PERSONAL_INVALID/, 'only personal/ballot takes lockIn');
  });

  await t.test('no leak: a draft is the owner\'s alone; a locked-in guess opens only to players who locked in that game, sat out or saw it kick off', async () => {
    const drafts = pickSecrets({ [ids[1]]: SEAN.total[1] }, { market: 'total', owner: 'sean' }), lockedPick = pickSecrets({ [ids[0]]: SEAN.total[0] }, { market: 'total', owner: 'sean' });
    for (const [route, method, body] of readersOn(ALL).filter(([route]) => !route.startsWith('/virtual-units'))) {
      for (const [who, secrets] of [['luke', [...drafts, ...lockedPick]], ['troy', drafts]]) {
        const reply = await world.api(who, route.replace(/^\//, ''), method === 'POST' ? body : undefined);
        assertNoLeak(reply.body, { viewer: id(who), secrets }, `${who} ${route}`);
      }
    }
  });

  await t.test('the last lock-in is the send: submittedAt, the feed post, and the earlier lock-ins keep their time and line', async () => {
    const before = (await row(world, 'sean', 'guess_total')).ballot;
    res = await save(world, 'sean', 'guess_total', { ...draftPicks, [ids[2]]: SEAN.total[2] }, { lockIn: [ids[1], ids[2]] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const three = (await row(world, 'sean', 'guess_total')).ballot;
    assert.deepEqual([three.submittedAt, Object.keys(three.lockedAt).sort(), three.lockedAt[ids[0]], three.scoringReferences[ids[0]]],
      [null, [ids[0], ids[1], ids[2]].sort(), before.lockedAt[ids[0]], before.scoringReferences[ids[0]]]);
    res = await save(world, 'sean', 'guess_total', map(SEAN.total), { lockIn: [ids[3]] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const sent = await row(world, 'sean', 'guess_total');
    assert.equal(sent.ballot.submittedAt, sent.ballot.updatedAt, 'every game locked in: the market is sent');
    assert.deepEqual(sent.ballot.lockedAt, { ...three.lockedAt, [ids[3]]: sent.ballot.updatedAt });
    for (const g of ids.slice(0, 3)) assert.deepEqual(sent.ballot.scoringReferences[g], three.scoringReferences[g], `${g} keeps the line from its own lock-in`);
    assert.deepEqual([sent.audit.at(-1).type, sent.audit.at(-1).lockedGameIds], ['ballot_submitted', [ids[3]]]);
    const posts = (await db.query("select count(*)::int n from public.gtl_feed_posts where actor_id=$1 and kind='ballot_submitted' and mode='guess_total'", [id('sean')])).rows[0].n;
    assert.equal(posts, 1, 'gtl_feed_on_ballot posts the send once');
    res = await save(world, 'sean', 'guess_total', { ...map(SEAN.total), [ids[3]]: SEAN.draft }, { submit: true });
    assert.deepEqual([res.status, res.body], [409, LOCKED]);
  });
});

test('old edited ballots: stored D-16 edits stay and score the same after M-02; M-02 writes no row', { skip }, async t => {
  const before = ALL.filter(f => f !== M02);
  const world = await createCommunityWorld({ migrations: before, games: 4 });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  let res = await save(world, 'luke', 'guess_spread', map(LUKE.spread), { submit: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  res = await save(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[1]]: LUKE.edited }, { submit: true });
  assert.equal(res.status, 200, 'a D-16 edit before M-02');
  const scores = async () => (await db.query("select b.user_id::text u,b.mode,s.game_id,s.guess::text guess,s.points::text points from public.gtl_weekly_ballots b,public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) s order by 1,2,3")).rows;
  const rows = async () => (await db.query('select user_id::text u,mode,ballot::text b,audit::text a,provenance::text p from public.gtl_weekly_ballots order by 1,2')).rows;
  const [scored, stored] = [await scores(), await rows()];
  assert.ok(scored.some(r => r.points !== null), 'the fixture scores something');
  assert.deepEqual((await row(world, 'luke', 'guess_spread')).audit.map(e => e.type), ['ballot_submitted', 'ballot_edited']);
  await db.exec(migrationSql(M02));
  assert.deepEqual(await rows(), stored, 'M-02 writes no row; submittedAt and the ballot_edited event stay (D-16, D-23)');
  assert.deepEqual(await scores(), scored, 'the same points per pick');
  res = await save(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[1]]: LUKE.spread[1] }, { submit: true });
  assert.deepEqual([res.status, res.body], [409, LOCKED], 'from the apply on, the edited ballot is final as it stands');
});

test('deployed before the apply: on the hosted schema the new gtl-api keeps D-16 edits and the database refuses lockIn', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED, games: 2, groupScreens: true, optionalRpc: true });
  t.after(() => world.db.close());
  const ids = world.state.games.map(g => g.id), map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  let res = await save(world, 'luke', 'guess_spread', map([-4.5, 1.5]), { submit: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await world.api('luke', 'personal')).body.rules.sentFinal, false, 'the live rules are today\'s');
  res = await save(world, 'luke', 'guess_spread', map([-6.5, 1.5]), { submit: true });
  assert.equal(res.status, 200, `/personal/ballot edit: ${JSON.stringify(res.body)}`);
  res = await groupSave(world, 'luke', 'guess_spread', map([-7.5, 1.5]), true);
  assert.equal(res.status, 200, `/ballot edit, the engine mirror stays off: ${JSON.stringify(res.body)}`);
  assert.equal('lockedAt' in (await row(world, 'luke', 'guess_spread')).ballot, false);
  res = await save(world, 'sean', 'guess_total', { [ids[0]]: 38.5 }, { lockIn: [ids[0]] });
  assert.equal(res.status, 503, 'the API refuses per-game lock-in until the live database advertises support');
});

test('/personal/ballot lockIn on the route: checked before the database; the lock-in off switch; no refresh is tried first', async () => {
  const calls = [], service = { rpc: async (name, args) => { calls.push([name, args]); return { saved: true }; } };
  const user = { id: id('sean') }, body = lockIn => ({ season: 2026, week: 7, mode: 'guess_total', weeklyRevision: 1, picks: { 'SEA-DEN': 38.5, 'NE-NYJ': 43.5 }, submit: false, revision: 2, requestId: randomUUID(), ...(lockIn === undefined ? {} : { lockIn }) });
  const submitBallot = async () => { throw new Error('the refresh path is not used for a lock-in'); };
  assert.deepEqual(await handlePersonal({ route: '/personal/ballot', body: body(['SEA-DEN']), user, service, submitBallot }), { saved: true });
  assert.deepEqual(calls.at(-1)[1].p_body.lockIn, ['SEA-DEN']);
  for (const lockIn of ['SEA-DEN', ['SEA-DEN', 'SEA-DEN'], ['KC-LV'], [7], Array(33).fill('SEA-DEN')]) {
    await assert.rejects(() => handlePersonal({ route: '/personal/ballot', body: body(lockIn), user, service, submitBallot }), error => error.status === 400, JSON.stringify(lockIn));
  }
  await assert.rejects(() => handlePersonal({ route: '/personal/ballot', body: body(['SEA-DEN']), user, service, submitBallot, featureOff: new Set(['lock-in']) }), error => error.status === 503 && error.code === 'GTL_FEATURE_OFF');
  // The switch stops only the per-game lock-in: a draft save and a whole-market send keep working.
  let refreshed = 0;
  assert.deepEqual(await handlePersonal({ route: '/personal/ballot', body: body(), user, service, submitBallot: async (payload, commit) => { refreshed++; return commit(); }, featureOff: new Set(['lock-in']) }), { saved: true });
  assert.equal(refreshed, 1, 'a save without lockIn still goes through the refresh path');
  await assert.rejects(() => handlePersonal({ route: '/favorite/set', body: { season: 2026, week: 7, gameId: 'SEA-DEN', saved: true, notes: '', lockIn: ['SEA-DEN'], revision: 2, requestId: randomUUID() }, user, service }), error => error.status === 400, 'only /personal/ballot takes lockIn');
});
