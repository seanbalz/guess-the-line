import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { ALL } from './migrations.mjs';

const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const RUN = '11111111-1111-4111-8111-111111111111', CLAIM = '22222222-2222-4222-8222-222222222222';

test('Tuesday recheck persists append-only evidence after the next draft opens, preserves picks and flags changed totals', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const db = world.db;
  const owners = (await db.query('select owner_id from public.gtl_epl_managers order by owner_id')).rows.map(r => r.owner_id);
  const snapshot = changed => ({ state: { week: 10, season: '2026' }, rosters: owners.map((id, i) => ({ owner_id: id,
    settings: { fpts: 500 + i + (changed && i === 0 ? 1 : 0), fpts_decimal: 25, fpts_against: 400, fpts_against_decimal: 50 } })) });
  const rpc = (name, args) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return (await tx.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  });
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,9,'2026-10-30','2026-11-04','2026-10-31T12:30Z',$1,'settled'),(2026,10,'2026-11-04','2026-11-11','2026-11-07T12:30Z',$1,'open')", [owners]);
  await db.query("insert into public.gtl_epl_picks(season,week,owner_id,club,source) values(2026,10,$1,'ARS','pick')", [owners[0]]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values('fixture',2026,9,'ARS','LIV','2026-11-02T20:00Z','final',2,0)");
  await db.query("insert into public.gtl_epl_snapshots(label,week,captured_at,payload) values('after-mw9',9,'2026-11-03T02:00Z',$1)", [snapshot(false)]);
  // A newer, resolved round is not due yet; it must not hide the older Tuesday recheck.
  await db.query("update public.gtl_epl_weeks set status='resolved' where week=10");
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values('newer',2026,10,'ARS','LIV','2026-11-09T20:00Z','final',2,0)");
  await db.query("insert into public.gtl_epl_snapshots(label,week,captured_at,payload) values('after-mw10',10,'2026-11-10T02:00Z',$1)", [{ ...snapshot(false), state: { week: 11, season: '2026' } }]);
  await db.query("insert into public.gtl_epl_job_runs(id,job,slot_start,capability_hash,status,claim_token,claimed_at) values($1,'snapshot',clock_timestamp(),$2,'running',$3,clock_timestamp())", [RUN, 'a'.repeat(64), CLAIM]);
  assert.equal(await rpc('gtl_epl_recheck_state', [RUN, CLAIM, '2026-11-03T19:59Z']), null, 'not due before Tuesday noon Pacific');
  const state = await rpc('gtl_epl_recheck_state', [RUN, CLAIM, '2026-11-03T20:05Z']);
  assert.equal(state.week, 9, 'the open MW10 does not hide MW9 from the correction reader');
  assert.equal(state.season, 2026);
  assert.deepEqual(Object.keys(state).sort(), ['lastKickoff', 'originalCapturedAt', 'season', 'week']);
  const before = (await db.query('select jsonb_agg(to_jsonb(w) order by week) value from public.gtl_epl_weeks w')).rows[0].value;
  const picks = (await db.query('select jsonb_agg(to_jsonb(p)) value from public.gtl_epl_picks p')).rows[0].value;
  for (const payload of [{ ...snapshot(false), state: { week: 11, season: '2026' } }, { ...snapshot(false), state: { week: 10, season: '2027' } },
    { ...snapshot(false), rosters: snapshot(false).rosters.slice(1) }, { ...snapshot(false), rosters: snapshot(false).rosters.map(r => ({ ...r, owner_id: owners[0] })) },
    { ...snapshot(false), rosters: snapshot(false).rosters.map(r => ({ ...r, settings: {} })) },
    { ...snapshot(false), rosters: snapshot(false).rosters.map(r => ({ ...r, settings: { ...r.settings, fpts: '500' } })) }]) {
    await assert.rejects(() => rpc('gtl_epl_record_recheck', [RUN, CLAIM, 2026, 9, '2026-11-03T20:05Z', {}, payload]), /GTL_EPL_INVALID/);
  }
  await assert.rejects(() => rpc('gtl_epl_record_recheck', [RUN, CLAIM, 2026, 9, '2026-11-03T19:59Z', {}, snapshot(false)]), /GTL_EPL_INVALID/, 'SQL also enforces due time');
  assert.equal((await db.query('select count(*)::integer count from public.gtl_epl_snapshots')).rows[0].count, 2, 'invalid evidence saved no immutable labels');
  const reply = await rpc('gtl_epl_record_recheck', [RUN, CLAIM, 2026, 9, '2026-11-03T20:05Z', { rosters: 'a'.repeat(64) }, snapshot(true)]);
  assert.deepEqual(reply, { recorded: true, scoresChanged: true, status: 'needs_review' });
  const stored = (await db.query('select label,payload from public.gtl_epl_snapshots order by id')).rows;
  assert.deepEqual(stored.map(r => r.label), ['after-mw9', 'after-mw10', 'after-mw9-recheck']);
  assert.deepEqual(stored[0].payload, snapshot(false), 'the original snapshot is preserved');
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(w) order by week) value from public.gtl_epl_weeks w')).rows[0].value, before);
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(p)) value from public.gtl_epl_picks p')).rows[0].value, picks);
  assert.deepEqual(await rpc('gtl_epl_record_recheck', [RUN, CLAIM, 2026, 9, '2026-11-03T21:05Z', {}, snapshot(false)]), { recorded: false, scoresChanged: true, status: 'needs_review' });
  assert.equal((await db.query('select count(*)::integer count from public.gtl_epl_snapshots')).rows[0].count, 3);
  assert.equal(await rpc('gtl_epl_recheck_state', [RUN, CLAIM, '2026-11-03T20:05Z']), null, 'a retry sees no unchecked candidate');
  assert.equal((await rpc('gtl_epl_recheck_state', [RUN, CLAIM, '2026-11-10T20:05Z'])).week, 10);
  const unchanged = { ...snapshot(false), state: { week: 11, season: '2026' }, rosters: [...snapshot(false).rosters].reverse() };
  assert.deepEqual(await rpc('gtl_epl_record_recheck', [RUN, CLAIM, 2026, 10, '2026-11-10T20:05Z', {}, unchanged]), { recorded: true, scoresChanged: false, status: 'unchanged' }, 'roster row ordering is not a stat correction');
  await assert.rejects(() => rpc('gtl_epl_recheck_state', [RUN, RUN]), /GTL_SCHEDULE_RUN/);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select * from public.gtl_epl_stat_rechecks'); }), /permission denied/);
    await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select public.gtl_epl_recheck_state($1,$2)', [RUN, CLAIM]); }), /permission denied/);
  }
  await assert.rejects(() => db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.exec("update public.gtl_epl_stat_rechecks set status='unchanged'"); }), /permission denied/);
});
