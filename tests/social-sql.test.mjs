import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptySocialState, applySocialMutation } from '../shared/social-bets.mjs';
import { handleSocial } from '../cloud/social.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const season = 2026, week = 5, now = Date.parse('2026-10-08T20:00:00Z');
const games = [{ id: 'TB-DAL', away: 'TB', home: 'DAL', kickoff: '2026-10-09T00:15:00Z' }];
const create = (request = 101) => ({ season, week, weekRevision: 0, requestId: id(request), kind: 'single', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -6.5 }], odds: -140, stakeUnits: 1, source: 'User ticket', quotedAt: '2026-10-08T19:00:00Z' });

test('social migration uses service-only invoker RPCs, atomic receipts, ownership and append-only audits', { skip: PGlite ? false : 'Local PGlite unavailable; no hosted database contacted.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;create table public.gtl_profiles(user_id uuid primary key references auth.users(id),display_name text);create table public.gtl_weekly_slates(season integer,week integer,signature jsonb,primary key(season,week));grant select,update on public.gtl_profiles to service_role;grant select on public.gtl_weekly_slates to service_role;');
  await db.query('insert into auth.users values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_profiles values($1,'Troy'),($2,'Sean')", [id(1), id(2)]);
  await db.query('insert into public.gtl_weekly_slates values(2026,5,$1),(2026,6,$2)', [{ games: games.map(g => ({ ...g, kickoff: Date.parse(g.kickoff) / 1000 })) }, { games: games.map(g => ({ ...g, kickoff: Date.parse(g.kickoff) / 1000 + 604800 })) }]);
  await db.exec(fs.readFileSync('supabase/migrations/20261009005145_gtl_social_bet_tracker.sql', 'utf8'));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const service = { rpc: async (name, args) => {
    const params = Object.values(args), placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    return (await as('service_role', `select public.${name}(${placeholders}) value`, params)).rows[0].value;
  } };
  const actor = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const call = (action, body = {}, user = 1) => handleSocial({ route: `/social/${action}`, body, user: actor(user), service, clock: () => now });
  const read = (user = 1) => service.rpc('gtl_read_social', { p_user: id(user), p_season: season, p_week: week, p_all: false });
  const commit = (actor, body, state, action = 'create') => service.rpc('gtl_commit_social', { p_user: id(actor), p_season: body.season, p_week: body.week, p_expected_revision: body.weekRevision, p_request_id: body.requestId, p_action: action, p_body: body, p_state: state });
  const candidate = (state, body, actor = 1, action = 'create') => {
    const { weekRevision, ...payload } = body;
    return applySocialMutation(state, { actorId: id(actor), action, body: payload, games, now });
  };
  await t.test('browser roles cannot access any table or RPC, missing profile fails closed', async () => {
    for (const table of ['gtl_social_weeks', 'gtl_social_commits', 'gtl_social_follows', 'gtl_social_follow_receipts']) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) for (const op of ['select * from', 'delete from']) await assert.rejects(() => as(role, `${op} public.${table}`), /permission denied/);
    }
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => as(role, 'select public.gtl_read_social($1,2026,5,false)', [id(1)]), /permission denied/);
      await assert.rejects(() => as(role, 'select public.gtl_follow_social($1,$2,$3,true)', [id(1), id(500), id(2)]), /permission denied/);
      await assert.rejects(() => as(role, "select public.gtl_commit_social($1,2026,5,0,$2,'create',$3,$4)", [id(1), id(100), create(100), emptySocialState()]), /permission denied/);
    }
    const flags = (await db.query("select prosecdef from pg_proc where proname in ('gtl_read_social','gtl_commit_social','gtl_follow_social')")).rows;
    assert.equal(flags.length, 3); assert(flags.every(row => row.prosecdef === false));
    await assert.rejects(() => read(3), /GTL_SOCIAL_PROFILE/);
    await assert.rejects(() => call('read', {}, 3), error => error.status === 400);
  });
  let first;
  await t.test('new records visible across users without membership or ballot reads and return no raw audit/receipts', async () => {
    first = await call('create', create());
    assert.equal(first.weekRevision, 1); assert.equal(first.entries.length, 1); assert.equal(first.entries[0].ownerId, id(1)); assert.equal(first.entries[0].countsForRecord, true);
    assert.equal(first.entries[0].potentialProfitUnits, 0.71428571);
    const other = await call('read', { season, week }, 2);
    assert.equal(other.entries[0].id, first.entries[0].id); assert.equal(other.entries[0].canTail, true);
    assert.deepEqual(Object.keys(other.profiles[0]).sort(), ['displayName', 'id']);
    assert.equal(other.audit, undefined); assert.equal(other.entries[0].audit.length, 1);
    for (const privateKey of ['receipts', 'signature', 'email', 'ballots', 'journal', 'memberships']) assert.equal(JSON.stringify(other).includes(`"${privateKey}"`), false);
    assert.equal(Date.parse(other.games[0].kickoff), Date.parse(games[0].kickoff));
  });
  await t.test('identical retry succeeds before stale revision, changed retry fails, other owners cannot correct or settle', async () => {
    const replay = await call('create', create()); assert.equal(replay.replayed, true); assert.equal(replay.entries.length, 1);
    await assert.rejects(() => call('create', { ...create(), odds: -110 }), error => error.status === 409);
    await assert.rejects(() => call('create', { ...create(), weekRevision: 1 }), error => error.status === 409);
    const body = { season, week, weekRevision: 1, requestId: id(104), entryId: first.entries[0].id, revision: 1, reason: 'Owner result', outcome: 'win' };
    await assert.rejects(() => call('settle', body, 2), error => error.status === 404);
    const current = (await read()).weeks[0].state;
    const tampered = candidate(current, { ...body, outcome: 'loss' }, 1, 'settle');
    tampered.audit.at(-1).actorId = id(2); tampered.receipts.at(-1).actorId = id(2);
    await assert.rejects(() => commit(2, body, tampered, 'settle'), /GTL_SOCIAL_FORBIDDEN/);
  });
  await t.test('concurrent distinct CAS writes commit once and never discard the winner', async () => {
    const current = (await read()).weeks[0].state;
    const a = { ...create(110), weekRevision: 1 }, b = { ...create(111), weekRevision: 1, odds: 120 };
    const results = await Promise.allSettled([commit(1, a, candidate(current, a)), commit(2, b, candidate(current, b, 2))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected' && /GTL_SOCIAL_CONFLICT/.test(r.reason.message)).length, 1);
    const saved = (await read()).weeks[0]; assert.equal(saved.revision, 2); assert.equal(saved.state.entries.length, 2); assert.equal(saved.state.audit.length, 2);
    assert.equal((await db.query('select count(*)::integer n from public.gtl_social_commits')).rows[0].n, 2);
  });
  await t.test('follow retry cannot reverse a newer choice and history is complete across weeks', async () => {
    const follow = { requestId: id(120), targetUserId: id(2), following: true };
    assert.deepEqual((await call('follow', follow)).following, [id(2)]);
    assert.deepEqual((await call('follow', { ...follow, requestId: id(121), following: false })).following, []);
    assert.deepEqual((await call('follow', follow)).following, []);
    await assert.rejects(() => call('follow', { ...follow, following: false }), error => error.status === 409);
    await call('create', { ...create(130), week: 6 });
    const all = await call('read', { allHistory: true }); assert.equal(all.entries.length, 3); assert.equal(all.weekRevision, null); assert.equal(all.historyScope, 'all');
    assert.equal((await call('read', { season, week: 6 })).entries.length, 1);
    for (const table of ['gtl_social_commits', 'gtl_social_follow_receipts']) for (const sql of [`delete from public.${table}`, `update public.${table} set request_id='${id(999)}'`]) await assert.rejects(() => as('service_role', sql), /permission denied/);
  });
});
