import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('private game migrations and RPCs enforce SQL permissions and transactional invariants', { skip: PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync('supabase/migrations/20261008164249_gtl_private_cloud_state.sql', 'utf8'));
  const original = seed();
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', original]);
  for (let n = 1; n <= 30; n++) await db.query('insert into auth.users values($1)', [id(n)]);
  await db.query('insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)', [id(30), 'sean-troy-luke', 'sean', 'commissioner']);
  await db.exec(fs.readFileSync('supabase/migrations/20261008174007_gtl_profiles_private_games_invites.sql', 'utf8'));
  async function queryAs(role, sql, values = []) {
    return db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, values); });
  }
  async function rpc(name, args) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    const result = await queryAs('service_role', `select public.${name}(${placeholders}) as value`, args);
    return result.rows[0].value;
  }
  let serial = 100;
  const nextRequest = () => id(++serial);
  const profile = (user, name = `Test Player ${user}`) => rpc('gtl_save_profile', [id(user), name]);
  const create = (user, format = 'group', practice = false, key = nextRequest()) => rpc('gtl_create_league', [id(user), 'Private test game', format, practice, key]);
  const invite = (user, league, email, hash, key = nextRequest()) => rpc('gtl_create_invite', [id(user), `user${user}@example.invalid`, league, email, hash, key]);
  const accept = (user, email, hash = null, inviteId = null) => rpc('gtl_accept_invite', [id(user), email, hash, inviteId]);
  const state = async league => (await db.query('select state,revision from public.gtl_leagues where id=$1', [league])).rows[0];

  await t.test('existing Triple Threat state/mapping remain unchanged and schedule copy is allowlisted', async () => {
    assert.deepEqual((await state('sean-troy-luke')).state, original);
    const members = (await db.query('select player_id,role from public.gtl_memberships where league_id=$1', ['sean-troy-luke'])).rows;
    assert.deepEqual(members, [{ player_id: 'sean', role: 'commissioner' }]);
    const template = (await db.query('select games from public.gtl_schedule_templates')).rows[0];
    assert.equal(template.games.length, 15);
    assert.deepEqual(Object.keys(template.games[0]).sort(), ['id', 'away', 'home', 'awayCode', 'homeCode', 'matchup', 'kickoff'].sort());
    assert.equal(JSON.stringify(template).includes('originalPick'), false);
  });

  await t.test('all tables have RLS and browser roles cannot select, mutate, or execute RPCs', async () => {
    const tables = ['gtl_leagues', 'gtl_memberships', 'gtl_profiles', 'gtl_invites', 'gtl_schedule_templates', 'gtl_access_audit'];
    for (const table of tables) {
      const flags = (await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0];
      assert.equal(flags.relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(() => queryAs(role, `select * from public.${table}`), /permission denied/);
        await assert.rejects(() => queryAs(role, `delete from public.${table}`), /permission denied/);
      }
    }
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => queryAs(role, 'select public.gtl_lobby($1,$2)', [id(1), 'user1@example.invalid']), /permission denied/);
      await assert.rejects(() => queryAs(role, 'select public.gtl_save_profile($1,$2)', [id(1), 'Spoofed']), /permission denied/);
      await assert.rejects(() => queryAs(role, 'select public.gtl_accept_invite($1,$2,$3,$4)', [id(1), 'user1@example.invalid', 'a'.repeat(64), null]), /permission denied/);
    }
    const functions = (await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'gtl_%'")).rows;
    assert(functions.every(fn => fn.prosecdef === false));
  });

  let duel, group;
  await t.test('confirmed server actor can create an empty independent game, preserving deadline and idempotency', async () => {
    await assert.rejects(() => create(1), /GTL_PROFILE_REQUIRED/);
    await profile(1); await profile(2); await profile(3); await profile(4);
    const key = nextRequest();
    duel = (await create(1, 'duel', true, key)).leagueId;
    assert.equal((await create(1, 'duel', true, key)).leagueId, duel);
    await assert.rejects(() => create(1, 'group', true, key), /GTL_REQUEST_CONFLICT/);
    group = (await create(1)).leagueId;
    const fresh = await state(duel);
    assert.equal(fresh.state.league.practice, true); assert.equal(fresh.state.league.maxMembers, 2);
    assert.equal(Date.parse(fresh.state.league.deadline), Date.parse(original.league.deadline));
    assert.equal(fresh.state.league.roster.length, 1); assert.equal(fresh.state.league.roster[0].id, `u_${id(1).replaceAll('-', '')}`);
    for (const field of ['ballots', 'bets', 'results', 'frozen']) assert.deepEqual(fresh.state[field], {});
    assert.deepEqual(fresh.state.history, []); assert.deepEqual(fresh.state.audit, []); assert.equal(fresh.state.archivedCount, 0);
    assert.deepEqual((await state('sean-troy-luke')).state, original);
  });

  let invitation;
  await t.test('only commissioner invites, fixed roster stays protected, and pending invitations reserve capacity', async () => {
    await assert.rejects(() => invite(2, duel, 'user3@example.invalid', 'b'.repeat(64)), /GTL_FORBIDDEN/);
    await assert.rejects(() => invite(30, 'sean-troy-luke', 'user2@example.invalid', 'b'.repeat(64)), /GTL_FIXED_ROSTER/);
    await assert.rejects(() => queryAs('service_role', 'insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)', [id(4), 'sean-troy-luke', `u_${id(4).replaceAll('-', '')}`, 'player']), /GTL_FIXED_ROSTER/);
    const key = nextRequest();
    invitation = await invite(1, duel, 'user2@example.invalid', 'a'.repeat(64), key);
    assert.equal(new Date(invitation.expiresAt).getTime() > Date.now() + 6 * 86400000, true);
    await assert.rejects(() => invite(1, duel, 'user2@example.invalid', 'b'.repeat(64), key), /GTL_INVITE_RETRY/);
    await assert.rejects(() => invite(1, duel, 'user2@example.invalid', 'b'.repeat(64)), /GTL_PENDING_INVITE/);
    await assert.rejects(() => invite(1, duel, 'user3@example.invalid', 'b'.repeat(64)), /GTL_GAME_FULL/);
  });

  await t.test('lobby lists only exact confirmed recipient invitations and no token hashes', async () => {
    const recipient = await rpc('gtl_lobby', [id(2), 'USER2@EXAMPLE.INVALID']);
    assert.equal(recipient.pendingInvites.length, 1); assert.equal(recipient.pendingInvites[0].id, invitation.inviteId);
    const outsider = await rpc('gtl_lobby', [id(3), 'user3@example.invalid']);
    assert.deepEqual(outsider.pendingInvites, []); assert.deepEqual(outsider.leagues, []);
    const listed = await rpc('gtl_list_invites', [id(1), duel]);
    assert.equal(listed[0].email, 'user2@example.invalid');
    assert.equal(JSON.stringify([recipient, listed]).includes('token_hash'), false);
    assert.equal(JSON.stringify([recipient, listed]).includes('a'.repeat(64)), false);
  });

  await t.test('acceptance checks email, is atomic and idempotent, and invalidates stale ballot revision', async () => {
    await assert.rejects(() => accept(3, 'user3@example.invalid', 'a'.repeat(64)), /GTL_INVITE_UNAVAILABLE/);
    await assert.rejects(() => accept(2, null, 'a'.repeat(64)), /GTL_INVALID_INVITE/);
    assert.equal((await state(duel)).revision, 0);
    assert.equal((await accept(2, 'user2@example.invalid', 'a'.repeat(64))).leagueId, duel);
    assert.equal((await accept(2, 'user2@example.invalid', null, invitation.inviteId)).leagueId, duel);
    const joined = await state(duel);
    assert.equal(joined.revision, 1); assert.equal(joined.state.league.roster.length, 2);
    const stale = await queryAs('service_role', 'update public.gtl_leagues set revision=revision+1 where id=$1 and revision=0 returning id', [duel]);
    assert.equal(stale.rows.length, 0);
    const events = (await db.query("select count(*)::int as count from public.gtl_access_audit where league_id=$1 and event='invite_accepted'", [duel])).rows[0];
    assert.equal(events.count, 1);
    await assert.rejects(() => invite(1, duel, 'user2@example.invalid', 'f'.repeat(64)), /GTL_ALREADY_MEMBER/);
    await assert.rejects(() => rpc('gtl_revoke_invite', [id(1), duel, invitation.inviteId]), /GTL_INVITE_ACCEPTED/);
  });

  await t.test('revoked and expired invitations never add membership; revoke retry is harmless', async () => {
    const revoked = await invite(1, group, 'user3@example.invalid', 'c'.repeat(64));
    await assert.rejects(() => rpc('gtl_revoke_invite', [id(2), group, revoked.inviteId]), /GTL_FORBIDDEN/);
    assert.deepEqual(await rpc('gtl_revoke_invite', [id(1), group, revoked.inviteId]), { revoked: true });
    assert.deepEqual(await rpc('gtl_revoke_invite', [id(1), group, revoked.inviteId]), { revoked: true });
    await assert.rejects(() => accept(3, 'user3@example.invalid', 'c'.repeat(64)), /GTL_INVITE_UNAVAILABLE/);
    const expired = await invite(1, group, 'user3@example.invalid', 'd'.repeat(64));
    await db.query("update public.gtl_invites set created_at=now()-interval '8 days', expires_at=now()-interval '1 day' where id=$1", [expired.inviteId]);
    await assert.rejects(() => accept(3, 'user3@example.invalid', 'd'.repeat(64)), /GTL_INVITE_UNAVAILABLE/);
    assert.equal((await state(group)).state.league.roster.length, 1);
    const renewed = await invite(1, group, 'user3@example.invalid', 'e'.repeat(64));
    assert.notEqual(renewed.inviteId, expired.inviteId);
  });

  await t.test('capacity is checked again during acceptance and failed joining leaves no partial writes', async () => {
    const spare = (await create(4, 'duel')).leagueId;
    await invite(4, spare, 'user2@example.invalid', '2'.repeat(64));
    // Simulate another authorized transaction taking the final seat before accept.
    await db.query('insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)', [id(3), spare, `u_${id(3).replaceAll('-', '')}`, 'player']);
    await assert.rejects(() => accept(2, 'user2@example.invalid', '2'.repeat(64)), /GTL_GAME_FULL/);
    const count = (await db.query('select count(*)::int as count from public.gtl_memberships where user_id=$1 and league_id=$2', [id(2), spare])).rows[0];
    assert.equal(count.count, 0); assert.equal((await state(spare)).revision, 0);
    const status = (await db.query('select status from public.gtl_invites where token_hash=$1', ['2'.repeat(64)])).rows[0];
    assert.equal(status.status, 'pending');
  });

  await t.test('per-owner creation limit allows retries without creating an eleventh game', async () => {
    await profile(10); const key = nextRequest(); const first = await create(10, 'group', false, key);
    for (let i = 1; i < 10; i++) await create(10);
    await assert.rejects(() => create(10), /GTL_GAME_LIMIT/);
    assert.deepEqual(await create(10, 'group', false, key), first);
  });

  await t.test('new member roles cannot be escalated by direct service membership insertion', async () => {
    await assert.rejects(() => queryAs('service_role', 'insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)', [id(4), group, `u_${id(4).replaceAll('-', '')}`, 'commissioner']), /GTL_FORBIDDEN/);
    assert.deepEqual((await state('sean-troy-luke')).state, original);
  });
});
