import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, NOT_HOSTED } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';

// D-61 (20261027160000_gtl_odds_slots_before_points_open.sql): the twelve-hour odds slots move from 08:15/20:15 UTC to
// 06:15/18:15 UTC so market data refreshes before the Tuesday 12:00 AM PT Points open. Local PGlite only; the pg_net call is
// replaced by a local outbox double (as tests/points-jobs-sql.test.mjs does).
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const dir = new URL('../supabase/migrations/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, dir), 'utf8');
const D61 = '20261027160000_gtl_odds_slots_before_points_open.sql';
const HOUR = 3_600_000, ANCHOR = Date.parse('2000-01-01T06:15:00Z');

function body(sql, name) {
  const starts = [...sql.matchAll(new RegExp(`create (or replace )?function public\\.${name}\\(`, 'g'))].map(m => m.index);
  const start = starts.at(-1);
  return sql.slice(start, sql.indexOf('end $$;', start) + 'end $$;'.length).replace(/^create (or replace )?function/, 'create or replace function');
}

test('D-61 is written, not applied, and changes only the slot anchor and the reported times in the three odds functions', () => {
  assert(NOT_HOSTED.includes(20261027160000));
  const next = read(D61);
  for (const [file, name] of [['20261008200926_gtl_twelve_hour_odds_refresh.sql', 'gtl_dispatch_odds_refresh'],
    ['20261012230000_gtl_submit_with_line_at_guess.sql', 'gtl_claim_odds_refresh'], ['20261012230000_gtl_submit_with_line_at_guess.sql', 'gtl_read_odds_schedule']]) {
    const expected = body(read(file), name).replaceAll("timestamptz '2000-01-01 08:15:00+00'", "timestamptz '2000-01-01 06:15:00+00'")
      .replace("'utcTimes',jsonb_build_array('08:15','20:15')", "'utcTimes',jsonb_build_array('06:15','18:15')");
    assert.equal(body(next, name), expected, `${name} is the current definition with the new anchor`);
  }
  assert.doesNotMatch(next.replace(/^--.*$/gm, ''), /08:15|20:15|\b(create|alter|drop) table|\bgrant\b|\brevoke\b/i, 'no old slot, table or grant change');
});

test('the dispatcher queues runs in 06:15/18:15 UTC slots and the claim refuses a run queued in an old 08:15/20:15 slot', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.outbox(url,body,headers) values(url,body,headers) returning id$$;");
  await db.exec('set session_replication_role = replica');
  await db.query("insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) values('nfl-12h',true,'https://example.supabase.co/functions/v1/gtl-odds-refresh',gen_random_uuid(),2026,8,'{}')");
  await db.exec('set session_replication_role = origin');
  const queued = (await db.query('select public.gtl_dispatch_odds_refresh() value')).rows[0].value;
  assert.equal(queued.status, 'queued');
  const run = (await db.query('select slot_start from public.gtl_odds_refresh_runs where id=$1', [queued.runId])).rows[0];
  const slot = new Date(run.slot_start).getTime();
  assert.equal((slot - ANCHOR) % (12 * HOUR), 0, 'the slot starts at 06:15 or 18:15 UTC');
  assert(slot <= Date.now() && Date.now() - slot < 12 * HOUR, 'the current slot');
  const cap = (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1", [queued.runId])).rows[0].auth.slice(7);
  await db.query("update public.gtl_odds_refresh_runs set slot_start=slot_start+interval '2 hours' where id=$1", [queued.runId]);
  const claim = () => db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query('select public.gtl_claim_odds_refresh($1,$2) value', [cap, queued.runId]); });
  await assert.rejects(claim, /GTL_SCHEDULE_AUTH/, 'a run in an old-anchor slot is refused');
});
