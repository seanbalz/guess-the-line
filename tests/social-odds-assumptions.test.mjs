import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planSocialIntake, socialIntakeSql } from '../scripts/prepare-social-intake.mjs';
import { planSocialOddsAssumptions, socialOddsAssumptionsSql } from '../scripts/prepare-social-odds-assumptions.mjs';
import { applySocialMutation, emptySocialState, socialPotentialProfit } from '../shared/social-bets.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-15T18:00:00Z');
const intake = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));
const config = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-odds-assumptions.json', import.meta.url), 'utf8'));
function emptyContext() {
  return { mapping: ['sean', 'troy'].map((alias, i) => ({ alias, id: id(i + 1), active: true, hasAuthUser: true })),
    read: { profiles: [{ id: id(1) }, { id: id(2) }, { id: id(3) }], weeks: [{ season: 2026, week: 5, revision: 0, state: emptySocialState(),
      games: [...new Set(intake.entries.flatMap(entry => entry.legs.map(leg => leg.gameId)))].map(gameId => ({ id: gameId, away: gameId.split('-')[0], home: gameId.split('-')[1], kickoff: Date.parse('2026-10-11T17:00:00Z') / 1000 })) }] } };
}
const otherBody = n => ({ requestId: id(500 + n), season: 2026, week: 5, kind: 'single', origin: 'tracked',
  legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'away', line: 7 + n / 2 }], odds: -115, stakeUnits: 2, source: 'Another supplied ticket', countsForRecord: false });
function context() {
  const c = emptyContext(), initial = planSocialIntake(intake, c, { now: now - 1000 }), week = c.read.weeks[0];
  week.state = { version: 1, entries: initial.operations.map(op => op.delta.entry), audit: initial.operations.map(op => op.delta.event), receipts: initial.operations.map(op => op.delta.receipt) };
  for (let i = 0; i < 8; i++) week.state = applySocialMutation(week.state, { actorId: id(3), action: 'create', body: otherBody(i), games: week.games, now: now - 500 });
  week.revision = 24;
  return c;
}
const plan = c => planSocialOddsAssumptions(intake, config, c ?? context(), { now });

test('only the fourteen supplied Troy tickets receive labeled assumptions; original audits, other tickets and unknown facts survive', () => {
  const c = context(), before = structuredClone(c), result = plan(c), after = result.finalState, original = c.read.weeks[0].state;
  assert.equal(result.corrected, 14); assert.equal(result.expectedRevision, 38); assert.equal(after.entries.length, 24);
  assert.deepEqual(c, before, 'preparation is read-only');
  assert.deepEqual(after.entries.slice(14), original.entries.slice(14), 'both parlays and all eight other tickets are byte-for-byte unchanged');
  assert.deepEqual(after.audit.slice(0, 24), original.audit); assert.deepEqual(after.receipts.slice(0, 24), original.receipts);
  assert(original.audit.slice(0, 14).every(event => event.after.odds === null));
  for (const entry of after.entries.slice(0, 14)) {
    assert.equal(entry.odds, -110); assert.equal(entry.stakeUnits, 1); assert.equal(entry.revision, 2);
    assert.equal(entry.placedAt, null); assert.equal(entry.quotedAt, null); assert.equal(entry.outcome, 'pending');
    assert.equal(socialPotentialProfit(entry), 0.90909091);
    assert.match(entry.source, /assumed -110 for accounting/); assert.match(entry.notes, /actual accepted odds, book and any point-buy cost remain unknown/);
  }
  assert.deepEqual(after.entries.slice(14, 16).map(entry => [entry.odds, entry.stakeUnits]), [[2100, null], [337.24, null]]);
});

test('preparation fails closed for changed mapping, altered target list, existing prices or changed ticket terms', () => {
  for (const mutate of [c => c.mapping.push(c.mapping[1]), c => c.mapping[1].active = false, c => c.mapping[1].hasAuthUser = false,
    c => c.mapping[1].id = '00000000-0000-4000-8000-000000000002', c => c.read.weeks[0].state.entries[0].odds = -120,
    c => c.read.weeks[0].state.entries[0].legs[0].line = -7, c => c.read.weeks[0].state.entries[0].stakeUnits = 2,
    c => c.read.weeks[0].state.receipts.shift(), c => c.read.weeks[0].state.audit[0].after.odds = -110]) {
    const c = context(); mutate(c); assert.throws(() => plan(c));
  }
  for (const mutate of [a => a.odds = -120, a => a.entries[0].createRequestId = intake.entries[14].requestId,
    a => a.entries[1].requestId = a.entries[0].requestId, a => a.sourceSha256 = 'changed', a => a.notesSuffix = 'Verified odds']) {
    const changed = structuredClone(config); mutate(changed); assert.throws(() => planSocialOddsAssumptions(intake, changed, context(), { now }));
  }
});

test('a fresh replay preserves later owner changes and rejects reuse for a different assumption', () => {
  const c = context(), first = plan(c), week = c.read.weeks[0];
  const entry = first.finalState.entries[0];
  const body = { requestId: id(800), entryId: entry.id, revision: 2, season: 2026, week: 5, reason: 'Owner excludes this bet', countsForRecord: false };
  week.state = applySocialMutation(first.finalState, { actorId: id(2), action: 'include', body, now: now + 1000 }); week.revision = 39;
  const replay = plan(c);
  assert.equal(replay.corrected, 0); assert.equal(replay.alreadyPresent, 14); assert.equal(replay.expectedRevision, 39);
  assert.deepEqual(replay.finalState, week.state); assert.deepEqual(replay.operations.map(op => op.body), first.operations.map(op => op.body));
  const changed = structuredClone(config); changed.reason += ' Changed payload.';
  assert.throws(() => planSocialOddsAssumptions(intake, changed, c, { now }), /different assumptions/);
});

test('local fixture preparation is explicit and cannot generate hosted SQL', () => {
  const c = emptyContext(), week = c.read.weeks[0];
  c.mapping.forEach((row, i) => { row.id = `00000000-0000-4000-8000-00000000000${i + 1}`; row.hasAuthUser = false; });
  c.read.profiles = c.mapping.map(row => ({ id: row.id }));
  for (const { owner, ...body } of intake.entries) week.state = applySocialMutation(week.state, { actorId: c.mapping.find(row => row.alias === owner).id, action: 'create', body, games: week.games, now });
  week.revision = 16;
  assert.throws(() => plan(c));
  const local = planSocialOddsAssumptions(intake, config, c, { now, environment: 'local' });
  assert.equal(local.corrected, 14); assert.equal(local.expectedRevision, 30);
  assert.throws(() => socialOddsAssumptionsSql(local), /local fixture plans/);
});

async function database(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.gtl_profiles(user_id uuid primary key references auth.users(id),display_name text);create table public.gtl_memberships(league_id text,user_id uuid,player_id text,active boolean);create table public.gtl_weekly_slates(season integer,week integer,signature jsonb,primary key(season,week));');
  await db.query('insert into auth.users values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_profiles values($1,'Sean'),($2,'Troy'),($3,'Another player')", [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_memberships values('sean-troy-luke',$1,'sean',true),('sean-troy-luke',$2,'troy',true)", [id(1), id(2)]);
  await db.query('insert into public.gtl_weekly_slates values(2026,5,$1)', [{ games: emptyContext().read.weeks[0].games }]);
  await db.exec(fs.readFileSync('supabase/migrations/20261009005145_gtl_social_bet_tracker.sql', 'utf8'));
  await db.exec(socialIntakeSql(planSocialIntake(intake, emptyContext(), { now: now - 1000 })));
  for (let i = 0; i < 8; i++) {
    const prior = await snapshot(db), body = otherBody(i);
    const next = applySocialMutation(prior.state, { actorId: id(3), action: 'create', body, games: emptyContext().read.weeks[0].games, now: now - 500 });
    await db.query("select public.gtl_commit_social($1,2026,5,$2,$3,'create',$4,$5)", [id(3), prior.revision, body.requestId, body, next]);
  }
  return db;
}
const snapshot = async db => (await db.query('select revision,state from public.gtl_social_weeks where season=2026 and week=5')).rows[0];
const rollback = async db => db.exec('ROLLBACK');
const sqlOptions = { skip: PGlite ? false : 'Local PGlite unavailable; no hosted database contacted.' };
async function databasePlan(db) { const c = emptyContext(); Object.assign(c.read.weeks[0], await snapshot(db)); return plan(c); }

test('real audited RPC corrects fourteen tickets atomically and exact replay never overwrites a later owner edit', sqlOptions, async t => {
  const db = await database(t), prepared = await databasePlan(db), sql = socialOddsAssumptionsSql(prepared), before = await snapshot(db);
  await db.exec(sql);
  const after = await snapshot(db);
  assert.equal(after.revision, 38); assert.deepEqual(after.state, prepared.finalState);
  assert.deepEqual(after.state.entries.slice(14), before.state.entries.slice(14));
  assert.equal((await db.query("select count(*)::integer n from public.gtl_social_commits where action='correct'")).rows[0].n, 14);
  await db.exec(sql); assert.deepEqual(await snapshot(db), after);
  const entry = after.state.entries[0], body = { requestId: id(900), entryId: entry.id, revision: 2, season: 2026, week: 5, reason: 'Owner reports a final result', outcome: 'loss', actualReturnUnits: 0 };
  const settled = applySocialMutation(after.state, { actorId: id(2), action: 'settle', body, now: now + 1000 });
  await db.query("select public.gtl_commit_social($1,2026,5,38,$2,'settle',$3,$4)", [id(2), body.requestId, body, settled]);
  const final = await snapshot(db); await db.exec(sql); assert.deepEqual(await snapshot(db), final);
  const refreshed = await databasePlan(db); assert.equal(refreshed.corrected, 0);
  await db.exec(socialOddsAssumptionsSql(refreshed)); assert.deepEqual(await snapshot(db), final);
});

test('SQL guards mapping, snapshot, original receipt and whole-transaction rollback', sqlOptions, async t => {
  const db = await database(t), prepared = await databasePlan(db), before = await snapshot(db);
  const broken = structuredClone(prepared); broken.operations[8].delta.entry.ownerId = id(1);
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(broken)), /GTL_SOCIAL_FORBIDDEN/); await rollback(db);
  assert.deepEqual(await snapshot(db), before);
  assert.equal((await db.query("select count(*)::integer n from public.gtl_social_commits where action='correct'")).rows[0].n, 0);
  await db.exec("update public.gtl_memberships set active=false where player_id='troy'");
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(prepared)), /GTL_ODDS_MAPPING_CHANGED/); await rollback(db);
  await db.exec("update public.gtl_memberships set active=true where player_id='troy'");
  const stale = structuredClone(prepared); stale.initialState.entries[0].notes += ' stale';
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(stale)), /GTL_ODDS_SNAPSHOT_CHANGED/); await rollback(db);
  const wrongOriginal = structuredClone(prepared); wrongOriginal.operations[0].createRequestId = id(999);
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(wrongOriginal)), /GTL_ODDS_ORIGINAL_CHANGED/); await rollback(db);
  const wrongSlate = structuredClone(prepared); wrongSlate.sourceGames[0].kickoff += 1;
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(wrongSlate)), /GTL_ODDS_SLATE_CHANGED/); await rollback(db);
  assert.deepEqual(await snapshot(db), before);
  await db.exec(socialOddsAssumptionsSql(prepared));
  const completed = await snapshot(db), conflict = structuredClone(prepared); conflict.operations[0].body.odds = -120;
  await assert.rejects(() => db.exec(socialOddsAssumptionsSql(conflict)), /GTL_ODDS_RETRY_CONFLICT/); await rollback(db);
  assert.deepEqual(await snapshot(db), completed);
});
