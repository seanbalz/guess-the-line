import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planSocialIntake, socialIntakeSql } from '../scripts/prepare-social-intake.mjs';
import { applySocialMutation, emptySocialState } from '../shared/social-bets.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-09T02:00:00Z');
const intake = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));
const context = () => ({
  mapping: [{ alias: 'sean', id: id(1), active: true, hasAuthUser: true }, { alias: 'troy', id: id(2), active: true, hasAuthUser: true }],
  read: { profiles: [{ id: id(1), displayName: 'Renamed owner' }, { id: id(2), displayName: 'TJ' }], weeks: [{ season: 2026, week: 5, revision: 0, state: emptySocialState(),
    games: [...new Set(intake.entries.flatMap(entry => entry.legs.map(leg => leg.gameId)))].map(gameId => ({ id: gameId, away: gameId.split('-')[0], home: gameId.split('-')[1], kickoff: Date.parse('2026-10-11T17:00:00Z') / 1000 })) }] },
});
const plan = () => planSocialIntake(intake, context(), { now });

test('intake planner preserves supplied unknowns and stable request IDs while rejecting ambiguous or fixture mappings', () => {
  const result = plan();
  assert.equal(result.created, 16); assert.equal(result.expectedRevision, 16);
  assert.deepEqual(result.operations.map(op => op.requestId), intake.entries.map(entry => entry.requestId));
  result.operations.forEach((op, index) => {
    const { owner, ...expected } = structuredClone(intake.entries[index]);
    expected.notes = expected.notes.replace('Imported locally from Sean’s report.', 'Shared by Sean from supplied report.');
    assert.deepEqual(op.body, expected, `Only the provenance wording changes for ${owner}.`);
  });
  assert(result.operations.every(op => op.body.placedAt === null && op.body.quotedAt === null && !('weekRevision' in op.body)));
  assert(result.operations.filter(op => op.owner === 'troy').every(op => op.body.odds === null && op.body.stakeUnits === 1));
  assert.deepEqual(result.operations.filter(op => op.owner === 'sean').map(op => [op.body.odds, op.body.stakeUnits]), [[2100, null], [337.24, null]]);
  assert(result.operations.every(op => op.delta.entry.outcome === 'pending' && op.delta.entry.countsForRecord && op.delta.event.reason.includes('on behalf')));
  assert.match(result.operations[0].body.notes, /^Shared by Sean/);
  assert.match(result.operations[14].body.legs.at(-1).selection, /Jalon Daniels/);
  for (const mutate of [c => c.mapping.push(c.mapping[0]), c => c.mapping[0].active = false, c => c.mapping[0].hasAuthUser = false,
    c => c.mapping[0].id = '00000000-0000-4000-8000-000000000001', c => c.read.profiles = [], c => c.mapping[1].id = c.mapping[0].id]) {
    const c = context(); mutate(c); assert.throws(() => planSocialIntake(intake, c, { now }), /Social intake:/);
  }
});

async function database(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.gtl_profiles(user_id uuid primary key references auth.users(id),display_name text);create table public.gtl_memberships(league_id text,user_id uuid,player_id text,active boolean);create table public.gtl_weekly_slates(season integer,week integer,signature jsonb,primary key(season,week));');
  await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
  await db.query("insert into public.gtl_profiles values($1,'New name'),($2,'TJ')", [id(1), id(2)]);
  await db.query("insert into public.gtl_memberships values('sean-troy-luke',$1,'sean',true),('sean-troy-luke',$2,'troy',true)", [id(1), id(2)]);
  await db.query('insert into public.gtl_weekly_slates values(2026,5,$1)', [{ games: context().read.weeks[0].games }]);
  await db.exec(fs.readFileSync('supabase/migrations/20261009005145_gtl_social_bet_tracker.sql', 'utf8'));
  return db;
}
const sqlOptions = { skip: PGlite ? false : 'Local PGlite unavailable; no hosted database contacted.' };
const snapshot = async db => (await db.query('select revision,state from public.gtl_social_weeks where season=2026 and week=5')).rows[0];
const rollback = async db => db.exec('ROLLBACK');

test('intake SQL uses the real RPC, is atomic, replays without duplicates, and preserves later owner edits', sqlOptions, async t => {
  const db = await database(t), prepared = plan(), sql = socialIntakeSql(prepared);
  await db.exec(sql);
  const first = await snapshot(db);
  assert.equal(first.revision, 16); assert.equal(first.state.entries.length, 16); assert.equal(first.state.audit.length, 16); assert.equal(first.state.receipts.length, 16);
  assert.equal((await db.query('select count(*)::integer n from public.gtl_social_commits')).rows[0].n, 16);
  await db.exec(sql); assert.deepEqual(await snapshot(db), first);
  const bet = first.state.entries[0], body = { season: 2026, week: 5, requestId: id(500), entryId: bet.id, revision: 1, reason: 'Owner excludes this ticket', countsForRecord: false };
  const next = applySocialMutation(first.state, { actorId: id(2), action: 'include', body, now: now + 1000 });
  await db.query("select public.gtl_commit_social($1,2026,5,16,$2,'include',$3,$4)", [id(2), body.requestId, body, next]);
  const edited = await snapshot(db); assert.equal(edited.revision, 17);
  await db.exec(sql); assert.deepEqual(await snapshot(db), edited);
  const refreshed = context(); Object.assign(refreshed.read.weeks[0], edited);
  const resumed = planSocialIntake(intake, refreshed, { now: now + 2000 });
  assert.equal(resumed.created, 0); assert.equal(resumed.alreadyPresent, 16);
  await db.exec(socialIntakeSql(resumed)); assert.deepEqual(await snapshot(db), edited);
});

test('intake SQL rolls back earlier calls on a late failure and rejects changed mapping, source or snapshot', sqlOptions, async t => {
  const db = await database(t), prepared = plan();
  const broken = structuredClone(prepared); broken.operations[8].delta.entry.ownerId = id(1);
  await assert.rejects(() => db.exec(socialIntakeSql(broken)), /GTL_SOCIAL_FORBIDDEN/); await rollback(db);
  assert.equal(await snapshot(db), undefined);
  assert.equal((await db.query('select count(*)::integer n from public.gtl_social_commits')).rows[0].n, 0);
  await db.exec("update public.gtl_memberships set active=false where player_id='troy'");
  await assert.rejects(() => db.exec(socialIntakeSql(prepared)), /GTL_INTAKE_MAPPING_CHANGED/); await rollback(db);
  await db.exec("update public.gtl_memberships set active=true where player_id='troy'");
  const changedSlate = structuredClone(prepared); changedSlate.sourceGames[0].kickoff += 60;
  await assert.rejects(() => db.exec(socialIntakeSql(changedSlate)), /GTL_INTAKE_SLATE_CHANGED/); await rollback(db);
  await db.query('insert into public.gtl_social_weeks(season,week,revision) values(2026,5,1)');
  await assert.rejects(() => db.exec(socialIntakeSql(prepared)), /GTL_INTAKE_SNAPSHOT_CHANGED/); await rollback(db);
  assert.equal((await snapshot(db)).revision, 1);
});

test('a used request ID with changed ticket content fails without rewriting the saved import', sqlOptions, async t => {
  const db = await database(t), prepared = plan(); await db.exec(socialIntakeSql(prepared));
  const before = await snapshot(db), changed = structuredClone(prepared);
  changed.operations[0].body.odds = -110;
  await assert.rejects(() => db.exec(socialIntakeSql(changed)), /GTL_INTAKE_RETRY_CONFLICT/); await rollback(db);
  assert.deepEqual(await snapshot(db), before);
});

test('a nonempty import preserves another owner’s bet, audit, and receipt exactly', sqlOptions, async t => {
  const db = await database(t), existingOwner = id(3);
  await db.query('insert into auth.users values($1)', [existingOwner]);
  await db.query("insert into public.gtl_profiles values($1,'Existing player')", [existingOwner]);
  const body = { season: 2026, week: 5, requestId: id(900), kind: 'single', origin: 'tracked',
    legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'away', line: 7 }],
    odds: -115, stakeUnits: 2, source: 'Existing synthetic ticket', countsForRecord: false };
  const existing = applySocialMutation(emptySocialState(), { actorId: existingOwner, action: 'create', body, games: context().read.weeks[0].games, now: now - 1000 });
  await db.query("select public.gtl_commit_social($1,2026,5,0,$2,'create',$3,$4)", [existingOwner, body.requestId, body, existing]);
  const before = await snapshot(db), c = context(); Object.assign(c.read.weeks[0], before);
  const prepared = planSocialIntake(intake, c, { now });
  assert.equal(prepared.initialRevision, 1); assert.equal(prepared.expectedRevision, 17);
  await db.exec(socialIntakeSql(prepared));
  const after = await snapshot(db);
  assert.equal(after.revision, 17); assert.equal(after.state.entries.length, 17);
  for (const field of ['entries', 'audit', 'receipts']) assert.deepEqual(after.state[field].slice(0, before.state[field].length), before.state[field]);
  assert.equal(after.state.entries.filter(entry => entry.ownerId === existingOwner).length, 1);
});
