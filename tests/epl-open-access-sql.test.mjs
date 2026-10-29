// M-31 executed on PGlite on top of M-30: automatic manager linking by display name, one-tap claims, and the link audit
// (EPL open access plan, Task 1). Same harness as epl-migration-sql.test.mjs; never connects to the hosted project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPLIED, NOT_HOSTED, PRELUDE, REQUIRES } from './migrations.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const M30 = 'supabase/migrations/20261028190000_gtl_epl_pick_a_team.sql';
const FILE = 'supabase/migrations/20261029060000_gtl_epl_open_access.sql';
const U = n => `00000000-0000-4000-8000-00000000000${n}`;
const EVAN = '719658248843632640', SEAN = '473955676301815808', STEVEN = '702644837370929152', DARIN = '1395236217460633600';
const MARK = '1257180071064510465', ADAM = '719745569895018496';

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  await db.exec(fs.readFileSync('supabase/migrations/20261008164249_gtl_private_cloud_state.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261008174007_gtl_profiles_private_games_invites.sql', 'utf8'));
  await db.exec('alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(fs.readFileSync(M30, 'utf8'));
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  await db.exec(`insert into auth.users values ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `('${U(n)}')`).join(',')}`);
  const call = async (sql, params = []) => (await db.query(sql, params)).rows[0].r;
  const profile = (user, name) => db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [user, name]);
  const autoLink = user => call('select public.gtl_epl_auto_link($1) r', [user]);
  const claim = (user, owner) => call('select public.gtl_epl_claim_manager($1,$2) r', [user, owner]);
  const linkedTo = async owner => (await db.query('select user_id from public.gtl_epl_managers where owner_id=$1', [owner])).rows[0].user_id;
  const audit = async () => (await db.query('select owner_id,user_id,action,by from public.gtl_epl_link_audit order by id')).rows;
  return { db, call, profile, autoLink, claim, linkedTo, audit };
}

test('M-31 is hosted (October 29 apply record, hosted 20261029131259) and builds on the hosted M-30', () => {
  assert.ok(!NOT_HOSTED.includes(20261029060000), 'removed from NOT_HOSTED by its apply record (Gate M step 8)');
  assert.ok(APPLIED.includes(20261028190000));
  assert.equal(REQUIRES[20261029060000], undefined);
});

test('a unique first-name match links the caller, and an already-linked caller then gets null', async t => {
  const { profile, autoLink, linkedTo, audit } = await setup(t);
  await profile(U(1), '  evan Smith ');
  assert.equal(await autoLink(U(1)), EVAN);
  assert.equal(await linkedTo(EVAN), U(1));
  assert.deepEqual(await audit(), [{ owner_id: EVAN, user_id: U(1), action: 'auto_link', by: U(1) }]);
  assert.equal(await autoLink(U(1)), null, 'already linked');
  assert.equal((await audit()).length, 1, 'a no-op writes no audit row');
});

test('the whole display name equal to the Sleeper username links too', async t => {
  const { profile, autoLink, linkedTo } = await setup(t);
  await profile(U(1), 'SeanBalz');
  assert.equal(await autoLink(U(1)), SEAN);
  assert.equal(await linkedTo(SEAN), U(1));
});

test('the approved aliases link Sean ("Fistathon") and Steven ("Sthomas")', async t => {
  const { db, profile, autoLink, linkedTo } = await setup(t);
  await profile(U(1), 'Fistathon');
  await profile(U(2), '  sthomas ');
  assert.equal(await autoLink(U(1)), SEAN);
  assert.equal(await autoLink(U(2)), STEVEN);
  assert.deepEqual([await linkedTo(SEAN), await linkedTo(STEVEN)], [U(1), U(2)]);
  assert.deepEqual((await db.query('select owner_id,alias from public.gtl_epl_manager_aliases order by alias')).rows,
    [{ owner_id: SEAN, alias: 'fistathon' }, { owner_id: STEVEN, alias: 'sthomas' }]);
});

test('an alias and a first name naming the same manager are ambiguous: neither links', async t => {
  const { profile, autoLink, linkedTo } = await setup(t);
  await profile(U(1), 'Fistathon');
  await profile(U(2), 'Sean Other');
  assert.equal(await autoLink(U(1)), null);
  assert.equal(await autoLink(U(2)), null);
  assert.equal(await linkedTo(SEAN), null);
});

test('two profiles named "Adam ..." link neither', async t => {
  const { profile, autoLink, linkedTo, audit } = await setup(t);
  await profile(U(1), 'Adam Harrison');
  await profile(U(2), 'adam jones');
  assert.equal(await autoLink(U(1)), null);
  assert.equal(await autoLink(U(2)), null);
  assert.equal(await linkedTo(ADAM), null);
  assert.deepEqual(await audit(), []);
});

test('no profile, an unmatched name, or a null user links nothing', async t => {
  const { profile, autoLink, audit } = await setup(t);
  assert.equal(await autoLink(U(1)), null, 'no profile');
  await profile(U(2), 'Zed');
  assert.equal(await autoLink(U(2)), null);
  assert.equal(await autoLink(null), null);
  assert.deepEqual(await audit(), []);
});

test('a manager already linked is not auto-linked', async t => {
  const { profile, autoLink, claim, linkedTo } = await setup(t);
  await claim(U(4), STEVEN);
  await profile(U(5), 'Steven');
  assert.equal(await autoLink(U(5)), null);
  assert.equal(await linkedTo(STEVEN), U(4));
});

test('claims: first claim wins, a second claim is GTL_EPL_CLAIMED, a linked caller is GTL_EPL_ALREADY_LINKED, an unknown owner is GTL_EPL_INVALID', async t => {
  const { claim, linkedTo, audit } = await setup(t);
  assert.deepEqual(await claim(U(6), MARK), { ownerId: MARK, userId: U(6), name: 'Mark' });
  assert.equal(await linkedTo(MARK), U(6));
  await assert.rejects(claim(U(7), MARK), /GTL_EPL_CLAIMED/);
  await assert.rejects(claim(U(6), DARIN), /GTL_EPL_ALREADY_LINKED/);
  await assert.rejects(claim(U(6), MARK), /GTL_EPL_ALREADY_LINKED/, 'already linked is checked before claimed');
  await assert.rejects(claim(U(7), '999'), /GTL_EPL_INVALID/);
  await assert.rejects(claim(U(7), null), /GTL_EPL_INVALID/);
  await assert.rejects(claim(null, DARIN), /GTL_EPL_INVALID/);
  assert.equal(await linkedTo(DARIN), null);
  assert.deepEqual(await audit(), [{ owner_id: MARK, user_id: U(6), action: 'claim', by: U(6) }], 'a refused claim writes nothing');
});

test('two accounts racing to claim one manager: exactly one wins', async t => {
  const { claim, db } = await setup(t);
  const results = await Promise.allSettled([claim(U(1), DARIN), claim(U(2), DARIN)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(String(results.find(r => r.status === 'rejected').reason), /GTL_EPL_CLAIMED/);
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_link_audit where action='claim'")).rows[0].n, 1);
});

test('the commissioner link and unlink are audited too, with the same argument list', async t => {
  const { db, call, audit, linkedTo } = await setup(t);
  await db.exec('alter table public.gtl_memberships drop constraint gtl_memberships_league_id_fkey');
  await db.exec(`insert into public.gtl_memberships(league_id,user_id,player_id,role,active) values('sean-troy-luke','${U(9)}','sean','commissioner',true)`);
  const link = (owner, user, by = U(9)) => call('select public.gtl_epl_link_manager($1,$2,$3) r', [owner, user, by]);
  assert.deepEqual(await link(EVAN, U(1)), { ownerId: EVAN, userId: U(1) });
  assert.deepEqual(await link(EVAN, null), { ownerId: EVAN, userId: null });
  assert.equal(await linkedTo(EVAN), null);
  await assert.rejects(link(EVAN, U(2), U(1)), /GTL_EPL_FORBIDDEN/);
  await assert.rejects(link('999', U(2)), /GTL_EPL_UNKNOWN_MANAGER/);
  assert.deepEqual(await audit(), [
    { owner_id: EVAN, user_id: U(1), action: 'link', by: U(9) },
    { owner_id: EVAN, user_id: U(1), action: 'unlink', by: U(9) },
  ], 'an unlink records the account it removed');
  const overloads = (await db.query("select count(*)::int n from pg_proc where proname='gtl_epl_link_manager'")).rows[0].n;
  assert.equal(overloads, 1, 'replaced in place, not overloaded');
});

test('a commissioner unlink sticks: neither the automatic link nor a claim takes that manager back', async t => {
  const { db, call, profile, autoLink, claim, linkedTo, audit } = await setup(t);
  await db.exec('alter table public.gtl_memberships drop constraint gtl_memberships_league_id_fkey');
  await db.exec(`insert into public.gtl_memberships(league_id,user_id,player_id,role,active) values('sean-troy-luke','${U(9)}','sean','commissioner',true)`);
  const link = (owner, user) => call('select public.gtl_epl_link_manager($1,$2,$3) r', [owner, user, U(9)]);
  await profile(U(1), 'Evan');
  assert.equal(await autoLink(U(1)), EVAN);
  await link(EVAN, null);
  assert.equal(await autoLink(U(1)), null, 'the unlinked account is not linked back on its next read');
  assert.equal(await linkedTo(EVAN), null);
  await assert.rejects(claim(U(1), EVAN), /GTL_EPL_FORBIDDEN/, 'nor can it claim that manager back');
  assert.equal(await linkedTo(EVAN), null);
  assert.deepEqual(await claim(U(1), MARK), { ownerId: MARK, userId: U(1), name: 'Mark' }, 'it can still claim another manager');
  await link(MARK, null);
  await profile(U(2), 'Evan Two');
  assert.equal(await autoLink(U(2)), null, 'another account named Evan is still ambiguous with the unlinked one');
  assert.deepEqual(await claim(U(2), EVAN), { ownerId: EVAN, userId: U(2), name: 'Evan' }, 'another account can claim Evan');
  await link(EVAN, null);
  assert.deepEqual(await link(EVAN, U(1)), { ownerId: EVAN, userId: U(1) }, 'the commissioner can still relink it');
  assert.deepEqual((await audit()).map(r => r.action), ['auto_link', 'unlink', 'claim', 'unlink', 'claim', 'unlink', 'link']);
});

test('applying M-31 twice is idempotent and keeps the audit', async t => {
  const { db, profile, autoLink, audit } = await setup(t);
  await profile(U(1), 'Evan');
  await autoLink(U(1));
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  assert.equal((await audit()).length, 1);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_manager_aliases')).rows[0].n, 2, 'alias seed rows once');
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_managers')).rows[0].n, 8);
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('gtl_epl_name_owners','gtl_epl_auto_link','gtl_epl_claim_manager')")).rows[0].n, 3);
});

test('anon and authenticated cannot execute either function or read the audit; service_role can', async t => {
  const { db } = await setup(t);
  const can = async (role, fn) => (await db.query('select has_function_privilege($1,$2,\'execute\') r', [role, fn])).rows[0].r;
  for (const fn of ['public.gtl_epl_name_owners(text)', 'public.gtl_epl_auto_link(uuid)', 'public.gtl_epl_claim_manager(uuid,text)', 'public.gtl_epl_link_manager(text,uuid,uuid)']) {
    assert.equal(await can('anon', fn), false, `anon ${fn}`);
    assert.equal(await can('authenticated', fn), false, `authenticated ${fn}`);
    assert.equal(await can('service_role', fn), true, `service_role ${fn}`);
  }
  const table = async (role, priv) => (await db.query('select has_table_privilege($1,\'public.gtl_epl_link_audit\',$2) r', [role, priv])).rows[0].r;
  for (const role of ['anon', 'authenticated']) assert.equal(await table(role, 'select'), false, role);
  const aliases = async role => (await db.query("select has_table_privilege($1,'public.gtl_epl_manager_aliases','select') r", [role])).rows[0].r;
  assert.deepEqual([await aliases('anon'), await aliases('authenticated'), await aliases('service_role')], [false, false, true]);
  assert.equal(await table('service_role', 'select'), true);
  assert.equal(await table('service_role', 'delete'), false, 'the audit is append-only (D-23)');
  assert.equal((await db.query("select relrowsecurity r from pg_class where relname='gtl_epl_link_audit'")).rows[0].r, true);
});
