import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, PRELUDE } from './migrations.mjs';

// D-59 fantasy feed bucket on a disposable PGlite database with the Storage stand-in; never the hosted project.
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Install the optional local PGlite runtime; never tests against production.';
const filename = '20261026220000_gtl_fantasy_feed_bucket.sql';
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');

async function fresh(t, before = '') {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  if (before) await db.exec(before);
  return db;
}
const as = (db, role, sql) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql); });
const buckets = async db => (await db.query('select id,name,public,file_size_limit::int size,allowed_mime_types mimes from storage.buckets order by id')).rows;

test('the migration is in ALL and creates one private, JSON-only, 10 MiB bucket with no storage policy', { skip }, async t => {
  assert.ok(ALL.includes(filename));
  const db = await fresh(t);
  await db.exec(migration);
  assert.deepEqual(await buckets(db), [{ id: 'fantasy-feed', name: 'fantasy-feed', public: false, size: 10485760, mimes: ['application/json'] }]);
  assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='storage'")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage') and p.proname like '%fantasy%'")).rows[0].n, 0);
});

test('anon and authenticated read and write nothing in the bucket; service_role does both', { skip }, async t => {
  const db = await fresh(t);
  await db.exec(migration);
  await as(db, 'service_role', "insert into storage.objects(bucket_id,name) values('fantasy-feed','2026/index.json')");
  for (const role of ['anon', 'authenticated']) {
    assert.deepEqual((await as(db, role, "select name from storage.objects where bucket_id='fantasy-feed'")).rows, []);
    assert.deepEqual((await as(db, role, 'select id from storage.buckets')).rows, []);
    await assert.rejects(as(db, role, "insert into storage.objects(bucket_id,name) values('fantasy-feed','x.json')"), /row-level security/);
    // Updates and deletes see no row under default deny, so nothing changes.
    await as(db, role, "update storage.objects set name='y.json' where bucket_id='fantasy-feed'");
    await as(db, role, "delete from storage.objects where bucket_id='fantasy-feed'");
  }
  assert.deepEqual((await as(db, 'service_role', "select name from storage.objects where bucket_id='fantasy-feed'")).rows, [{ name: '2026/index.json' }]);
});

test('it refuses to run, and creates no bucket, when any storage policy already exists', { skip }, async t => {
  const db = await fresh(t, "insert into storage.buckets(id,name,public) values('avatars','avatars',true);create policy avatars_read on storage.objects for select to anon using (true);");
  await assert.rejects(db.exec(migration), /GTL_FANTASY_FEED_POLICY/);
  assert.deepEqual((await buckets(db)).map(row => row.id), ['avatars']);
});

test('it refuses to run when row level security is off on either storage table', { skip }, async t => {
  for (const table of ['objects', 'buckets']) {
    const db = await fresh(t, `alter table storage.${table} disable row level security;`);
    await assert.rejects(db.exec(migration), /GTL_FANTASY_FEED_RLS/);
    assert.deepEqual(await buckets(db), []);
  }
});

// The bucket's privacy rests on there being no storage policy at all, and the migration checks that only once, at its
// apply. This keeps every later migration to the same rule; changing it is a reviewed widening of who reads the feed.
test('no migration adds a storage policy, turns storage row level security off, or changes a bucket', () => {
  const dir = 'supabase/migrations';
  for (const name of fs.readdirSync(dir).filter(entry => entry.endsWith('.sql'))) {
    const sql = fs.readFileSync(`${dir}/${name}`, 'utf8').replace(/--[^\n]*/g, '');
    const storage = String.raw`"?storage"?\s*\.\s*`;
    assert.doesNotMatch(sql, new RegExp(String.raw`\b(?:create|alter)\s+policy\b[^;]*\bon\s+(?:only\s+)?${storage}`, 'i'), `${name} adds or changes a storage policy`);
    assert.doesNotMatch(sql, new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${storage}[^;]*\b(?:disable|no\s+force)\s+row\s+level\s+security`, 'i'), `${name} relaxes storage row level security`);
    const writes = sql.match(new RegExp(String.raw`\b(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?${storage}"?buckets\b`, 'gi')) ?? [];
    assert.equal(writes.length, name === filename ? 1 : 0, `${name} writes storage.buckets`);
  }
});

test('a second apply fails loudly instead of keeping an existing bucket it did not write', { skip }, async t => {
  const db = await fresh(t, "insert into storage.buckets(id,name,public) values('fantasy-feed','fantasy-feed',true);");
  await assert.rejects(db.exec(migration), /duplicate key/);
  assert.equal((await buckets(db))[0].public, true, 'the failed apply changed nothing');
});
