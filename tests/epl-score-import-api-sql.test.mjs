// EPL stage 3: the commissioner weekly-score routes behind the real HTTP handler and Supabase adapter, on PGlite with the
// actual migration. Synthetic scores and hashes only; no hosted request.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const OWNERS = ['719658248843632640', '473955676301815808', '702644837370929152', '1259267898757611520',
  '1395236217460633600', '1257180071064510465', '865667912365666304', '719745569895018496'];
const CLUBS = ['ARS', 'CHE', 'LIV', 'EVE', 'MUN', 'MNC', 'TOT', 'NEW'];
const SCORES = [61.2, 48.75, 90.1, 55.05, 72.4, 33.3, 80, 66.65];
const id = n => `00000000-0000-4000-8000-00000000000${n}`;
const ascending = () => OWNERS.map((o, i) => [o, SCORES[i]]).sort((a, b) => a[1] - b[1]).map(x => x[0]);

async function setup(t, { apply = true, goals = [[3, 0], [1, 1], [0, 2], [2, 1]] } = {}) {
  const db = new PGlite(); t.after(() => db.close()); await db.exec(PRELUDE);
  for (const file of ['20261008164249_gtl_private_cloud_state.sql', '20261028190000_gtl_epl_pick_a_team.sql', '20261103212932_gtl_epl_turn_queue.sql', ...(apply ? ['20261110110000_gtl_epl_score_import.sql'] : [])])
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec("create function public.gtl_community_admin(p_user uuid) returns boolean language sql stable set search_path='' as $$ select exists(select 1 from public.gtl_memberships where user_id=p_user and league_id='sean-troy-luke' and role='commissioner' and active) $$; grant execute on function public.gtl_community_admin(uuid) to service_role;");
  await db.query('insert into auth.users(id) values($1),($2)', [id(1), id(2)]);
  await db.exec('alter table public.gtl_memberships drop constraint gtl_memberships_league_id_fkey');
  await db.query("insert into public.gtl_memberships(league_id,user_id,player_id,role,active) values('sean-troy-luke',$1,'sean','commissioner',true),('sean-troy-luke',$2,'troy','player',true)", [id(1), id(2)]);
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,11,now()-interval '6 days',now()-interval '1 hour',now()-interval '5 days',$1,'resolved')", [OWNERS]);
  for (let i = 0; i < 4; i++) await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values($1,2026,11,$2,$3,now()-interval '5 days',$4,$5,$6)",
    [`f${i}`, CLUBS[2 * i], CLUBS[2 * i + 1], goals[i] ? 'final' : 'scheduled', goals[i]?.[0] ?? null, goals[i]?.[1] ?? null]);
  for (let i = 0; i < 8; i++) await db.query("insert into public.gtl_epl_picks(season,week,owner_id,club,source,final) values(2026,11,$1,$2,'pick',true)", [OWNERS[i], CLUBS[i]]);
  const sent = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url), name = u.pathname.split('/').at(-1);
    if (!u.pathname.includes('/rpc/')) throw new Error(`Unexpected read ${name}`);
    const body = JSON.parse(options.body); sent.push({ name, body });
    try {
      const result = await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query(`select public.${name}(${Object.keys(body).map((k, i) => `${k}=>$${i + 1}`).join(',')}) as value`, Object.values(body).map(v => (v !== null && typeof v === 'object' && !Array.isArray(v)) || (Array.isArray(v) && v.some(x => typeof x === 'object')) ? JSON.stringify(v) : v)); });
      return Response.json(result.rows[0].value);
    } catch (e) {
      const absent = e.code === '42883' && e.message.includes(`function public.${name}(`);
      return Response.json({ code: absent ? 'PGRST202' : e.code, message: e.message }, { status: absent ? 404 : 400 });
    }
  };
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'fixture', serviceRoleKey: 'fixture', fetchImpl });
  const handler = createCloudHandler({ epl: adapter.epl, authenticate: async token => ({ id: id(Number(token)), email: 'fixture@example.test', emailConfirmed: true }) });
  const call = async (action, body = {}, user = 1) => {
    const response = await handler(new Request(`https://fixture.test/epl/admin/scores/${action}`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const body = (extra = {}) => ({ season: 2026, week: 11, extractedWeek: 11, sources: ['a'.repeat(64)], bonusIncluded: true,
    scores: OWNERS.map((ownerId, i) => ({ ownerId, score: SCORES[i], extractedScore: SCORES[i] })), expectedOrder: ascending(), ...extra });
  return { db, call, body, sent };
}

test('the commissioner reads the mapping and imports; the drafted week settles from stored finals and the next draft opens', async t => {
  const f = await setup(t);
  const read = await f.call('read', { week: 11 });
  assert.equal(read.status, 200);
  assert.equal(read.body.available, true);
  assert.equal(read.body.managers.length, 8);
  assert.ok(read.body.managers.every(m => m.name && m.sleeperName));
  assert.deepEqual(read.body.weeks.map(w => [w.week, w.status]), [[11, 'resolved']]);
  const saved = await f.call('import', f.body());
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.reconciliation, 'new');
  assert.equal(saved.body.opening.outcome, 'opened');
  assert.equal(saved.body.opening.week, 12);
  assert.equal(saved.body.opening.firstPicker.ownerId, ascending()[0]);
  assert.equal(saved.body.opening.firstKickoff, null);
  assert.equal(saved.body.awarded, 1);
  // ARS won 3-0, the widest margin: that manager's earned bonus, zero additional points.
  assert.deepEqual((await f.db.query('select owner_id,points,margin from public.gtl_epl_bonus')).rows, [{ owner_id: OWNERS[0], points: 0, margin: 3 }]);
  const sentImport = f.sent.find(s => s.name === 'gtl_epl_import_weekly_scores').body;
  assert.deepEqual(Object.keys(sentImport).sort(), ['p_awards', 'p_bonus_included', 'p_by', 'p_correction', 'p_expected_order', 'p_extracted_week', 'p_scores', 'p_season', 'p_sources', 'p_week', 'p_week_corrected']);
  assert.ok(!JSON.stringify(f.sent).match(/image\/|base64|data:/), 'no image data is sent anywhere');
  const after = await f.call('read', { week: 11 });
  assert.equal(after.body.import.rows.length, 8);
  assert.equal(after.body.import.opening.outcome, 'opened');
  assert.equal(after.body.next.week, 12);
});

test('non-commissioners are refused before any read or write; malformed bodies never reach the database', async t => {
  const f = await setup(t);
  assert.equal((await f.call('read', {}, 2)).status, 403);
  assert.equal((await f.call('import', f.body(), 2)).status, 403);
  assert.ok(!f.sent.some(s => s.name !== 'gtl_community_admin'));
  for (const [extra, code] of [
    [{ bonusIncluded: false }, 'GTL_EPL_IMPORT_ATTESTATION'],
    [{ sources: [] }, 'GTL_EPL_IMPORT_INVALID'],
    [{ sources: ['zz'] }, 'GTL_EPL_IMPORT_INVALID'],
    [{ image: 'data:image/png;base64,AAAA' }, 'GTL_EPL_IMPORT_INVALID'],
    [{ scores: f.body().scores.map((r, i) => (i === 2 ? { ...r, score: null } : r)) }, 'GTL_EPL_IMPORT_INCOMPLETE'],
    [{ scores: f.body().scores.map((r, i) => (i === 2 ? { ...r, score: 1.234 } : r)) }, 'GTL_EPL_IMPORT_INVALID'],
    [{ scores: f.body().scores.map((r, i) => (i === 2 ? { ...r, projection: 70 } : r)) }, 'GTL_EPL_IMPORT_INVALID'],
  ]) {
    const r = await f.call('import', f.body(extra));
    assert.equal(r.body.code, code, JSON.stringify(extra));
    assert.equal(r.status, 400);
  }
  assert.ok(!f.sent.some(s => s.name === 'gtl_epl_import_weekly_scores'));
  const seven = await f.call('import', f.body({ scores: f.body().scores.slice(0, 7) }));
  assert.equal(seven.status, 400);
  assert.equal(seven.body.code, 'GTL_EPL_IMPORT_INCOMPLETE');
  const mixed = await f.call('import', f.body({ extractedWeek: 10 }));
  assert.equal(mixed.status, 409);
  assert.equal(mixed.body.code, 'GTL_EPL_IMPORT_WEEK_MISMATCH');
  assert.equal(Number((await f.db.query('select count(*) n from public.gtl_epl_score_imports')).rows[0].n), 0);
});

test('a pending drafted result keeps the import and waits to open; conflicting scores answer 409 until corrected', async t => {
  const f = await setup(t, { goals: [[3, 0], [1, 1], [0, 2], null] });
  const saved = await f.call('import', f.body());
  assert.equal(saved.status, 200);
  assert.equal(saved.body.opening.outcome, 'pending_results');
  assert.equal(saved.body.opening.firstPicker, null);
  assert.equal(Number((await f.db.query('select count(*) n from public.gtl_epl_weeks where week=12')).rows[0].n), 0);
  const scores = f.body().scores.map((r, i) => (i === 0 ? { ...r, score: 60.2 } : r));
  const conflict = await f.call('import', f.body({ scores }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'GTL_EPL_IMPORT_CONFLICT');
  const corrected = await f.call('import', f.body({ scores, correction: true }));
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.reconciliation, 'correction');
});

test('before the migration is applied the read says unavailable and the import is the coming-soon refusal', async t => {
  const f = await setup(t, { apply: false });
  const read = await f.call('read', {});
  assert.deepEqual(read.body, { available: false });
  const saved = await f.call('import', f.body());
  assert.equal(saved.status, 404);
  assert.equal(saved.body.code, 'GTL_EPL_OFF');
});
