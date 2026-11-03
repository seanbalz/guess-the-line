// M-34 executed locally. The historical provider fixture and a trusted service clock make replay deterministic.
// No hosted database or provider call; all capabilities are disposable PGlite fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, NOT_HOSTED, FIX_FORWARD } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { eplStandingsPositions } from '../shared/epl-standings.mjs';

const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';
const RECORD = JSON.parse(fs.readFileSync('data/epl/standings/wikimedia-2026-round-08-2026-10-29.json', 'utf8'));
const CAPTURE = Date.parse(RECORD.capturedAt), SAVE = new Date(CAPTURE + 60e3).toISOString();
const DEADLINE = new Date(CAPTURE + 10 * 60e3).toISOString(), USE = new Date(CAPTURE + 11 * 60e3).toISOString();
const FILE = 'supabase/migrations/20261029161613_gtl_epl_standings.sql';

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close()); const db = world.db;
  const owners = (await db.query('select owner_id from public.gtl_epl_managers order by owner_id limit 2')).rows.map(r => r.owner_id);
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,'2026-10-28','2026-11-04',$1,$2)", [DEADLINE, owners]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('standings-test',2026,9,'MNC','ARS',$1)", [DEADLINE]);
  const rpc = (name, args) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) r`, Object.values(args))).rows[0].r;
  });
  const run = async job => {
    await db.query("insert into public.gtl_epl_jobs_schedule(job,enabled) values($1,true) on conflict(job) do update set enabled=true", [job]);
    return (await db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,claimed_at,claim_token) values($1,clock_timestamp(),repeat('a',64),'running',clock_timestamp(),gen_random_uuid()) returning id p_run,claim_token p_claim", [job])).rows[0];
  };
  const save = (claim, record = RECORD, now = SAVE) => rpc('gtl_epl_save_standings', { ...claim, p_season: 2026, p_week: 9, p_record: record, p_now: now });
  const state = (claim, now = USE) => rpc('gtl_epl_standings_state', { ...claim, p_season: 2026, p_week: 9, p_now: now });
  const resolve = (claim, snapshot, now = USE) => rpc('gtl_epl_resolve_with_standings', { ...claim, p_season: 2026, p_week: 9,
    p_rows: owners.map((owner_id, i) => ({ owner_id, club: i ? 'MNC' : null, source: i ? 'auto' : 'none' })), p_standings: snapshot, p_now: now });
  return { db, rpc, owners, run, save, state, resolve };
}

test('M-34 is pending/fix-forward and creates no standing schedule or enabled collector', { skip }, async t => {
  const f = await fixture(t);
  assert.ok(NOT_HOSTED.includes(20261029161613)); assert.ok(FIX_FORWARD.includes(20261029161613));
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_epl_jobs_schedule where job='standings'")).rows[0].n, 0);
  await f.db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('standings',false)");
  assert.deepEqual((await f.db.query("select public.gtl_epl_dispatch_jobs('standings') r")).rows[0].r, { status: 'disabled' });
  // Independent M-36 may apply first and leave a disabled moneyline row. M-34 must never narrow that admission.
  await f.db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('moneyline',false)");
  await f.db.exec(fs.readFileSync(FILE,'utf8'));
  assert.deepEqual((await f.db.query("select public.gtl_epl_dispatch_jobs('moneyline') r")).rows[0].r, { status: 'disabled' });
});

test('dated source persistence is private, append-only and replay-safe; the same identity cannot be rewritten', { skip }, async t => {
  const f = await fixture(t), claim = await f.run('standings');
  const first = await f.save(claim); assert.equal(first.saved, true);
  assert.deepEqual(await f.save(claim), { id: first.id, saved: false });
  const changed = structuredClone(RECORD); changed.license.changes += ' different';
  await assert.rejects(f.save(claim, changed), /GTL_EPL_STANDINGS_CONFLICT/);
  const read = await f.state(claim); assert.equal(read.enabled, true); assert.equal(read.snapshot.id, first.id);
  assert.deepEqual(read.snapshot.record, RECORD);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_standings')).rows[0].n, 1);
  for (const table of ['gtl_epl_standings', 'gtl_epl_standings_usage']) {
    for (const role of ['anon', 'authenticated']) assert.equal((await f.db.query("select has_table_privilege($1,$2,'select') r", [role, `public.${table}`])).rows[0].r, false);
    for (const grant of ['update', 'delete']) assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) r', ['service_role', `public.${table}`, grant])).rows[0].r, false);
  }
  const fn = 'public.gtl_epl_save_standings(uuid,uuid,integer,integer,jsonb,timestamptz)';
  for (const role of ['anon', 'authenticated']) assert.equal((await f.db.query("select has_function_privilege($1,$2,'execute') r", [role, fn])).rows[0].r, false);
});

test('the database repeats strict row/provenance/time validation and agrees with the JavaScript validator', { skip }, async t => {
  const f = await fixture(t), claim = await f.run('standings');
  const bad = [];
  for (const mutate of [r => r.rows.pop(), r => r.rows[1].position = r.rows[0].position, r => r.rows[0].club = 'XXX',
    r => r.rows[0].points++, r => r.rows[0].played++, r => r.source.official = true, r => r.license.url = 'https://example.org/',
    r => r.dataAsOf = '2026-10-01', r => r.capturedAt = '2026-11-01T00:00:00Z']) {
    const r = structuredClone(RECORD); mutate(r); bad.push(r);
  }
  for (const record of [RECORD, ...bad]) {
    const sql = await f.rpc('gtl_epl_standings_valid', { p_record: record, p_season: 2026, p_round: 8, p_now: SAVE });
    assert.equal(sql, eplStandingsPositions(record, { season: 2026, completedRound: 8, now: Date.parse(SAVE) }).status === 'ready');
    if (!sql) await assert.rejects(f.save(claim, record), /GTL_EPL_STANDINGS_INVALID/);
  }
  await f.db.exec("set timezone='America/New_York'");
  const boundary = structuredClone(RECORD); boundary.capturedAt = '2026-10-31T12:00:00Z';
  assert.equal(await f.rpc('gtl_epl_standings_valid', { p_record: boundary, p_season: 2026, p_round: 8, p_now: '2026-11-01T00:00:00Z' }), true, 'data date always uses UTC');
});

test('fresh source resolves atomically with an immutable reference and historical license provenance', { skip }, async t => {
  const f = await fixture(t), collection = await f.run('standings');
  const saved = await f.save(collection), run = await f.run('resolve');
  const result = await f.resolve(run, saved.id); assert.equal(result.added, 2); assert.equal(result.standingsId, saved.id);
  assert.equal((await f.db.query('select standings_id from public.gtl_epl_standings_usage')).rows[0].standings_id, saved.id);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_picks')).rows[0].n, 2);
  assert.equal((await f.resolve(run, saved.id)).added, 0);
  const provenance = await f.rpc('gtl_epl_standings_provenance', { p_season: 2026, p_week: 9 });
  assert.equal(provenance.kind, 'wikimedia-community'); assert.equal(provenance.official, false);
  assert.equal(provenance.source.revision, RECORD.source.revision); assert.equal(provenance.license.id, 'CC-BY-SA-4.0');
  assert.equal(provenance.rows, undefined); assert.equal(provenance.run_id, undefined);
  await f.db.exec(fs.readFileSync(FILE, 'utf8'));
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_standings_usage')).rows[0].n, 1, 'rerunning migration preserves evidence');
});

test('stale-at-use evidence writes no picks or usage; disabled, wrong-job, expired and after-deadline collection is refused', { skip }, async t => {
  const f = await fixture(t), collection = await f.run('standings'), saved = await f.save(collection), run = await f.run('resolve');
  assert.equal((await f.state(run)).snapshot.id, saved.id);
  await assert.rejects(f.resolve(run, saved.id, new Date(CAPTURE + 25 * 3600e3).toISOString()), /GTL_EPL_STANDINGS_INVALID/);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_picks')).rows[0].n, 0);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_standings_usage')).rows[0].n, 0);
  await assert.rejects(f.save(run), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.save(collection, RECORD, USE), /GTL_EPL_DRAFT_CLOSED/);
  await f.db.exec("update public.gtl_epl_jobs_schedule set enabled=false where job='standings'");
  await assert.rejects(f.save(collection), /GTL_SCHEDULE_RUN/);
  await f.db.exec("update public.gtl_epl_jobs_schedule set enabled=true where job='standings';update public.gtl_epl_job_runs set claimed_at=clock_timestamp()-interval '11 minutes' where job='standings'");
  await assert.rejects(f.save(collection), /GTL_SCHEDULE_RUN/);
});

test('a newer eligible capture requires a fresh decision; an existing usage reference cannot be replaced', { skip }, async t => {
  const f = await fixture(t), collection = await f.run('standings'), first = await f.save(collection);
  const newer = structuredClone(RECORD); newer.capturedAt = new Date(CAPTURE + 30e3).toISOString();
  const second = await f.save(collection, newer), run = await f.run('resolve');
  await assert.rejects(f.resolve(run, first.id), /GTL_EPL_STANDINGS_CONFLICT/);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_picks')).rows[0].n, 0);
  assert.equal((await f.resolve(run, second.id)).standingsId, second.id);
  await assert.rejects(f.resolve(run, first.id), /GTL_EPL_STANDINGS_CONFLICT/);
  assert.equal((await f.db.query('select standings_id from public.gtl_epl_standings_usage')).rows[0].standings_id, second.id);
});

test('even otherwise valid records captured at or after kickoff cannot be used as a pre-deadline reference', { skip }, async t => {
  const f = await fixture(t), run = await f.run('resolve');
  for (const captured of [DEADLINE, USE]) {
    const record = structuredClone(RECORD); record.capturedAt = captured;
    // Simulate legacy/administrator-inserted evidence: the reader still checks the deadline itself.
    await f.db.query('insert into public.gtl_epl_standings(season,completed_round,captured_at,data_as_of,source_revision,record) values(2026,8,$1,$2,$3,$4)',
      [captured, record.dataAsOf, record.source.revision, record]);
  }
  assert.equal((await f.state(run)).snapshot, null);
});
