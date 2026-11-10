// EPL stage 3: the reviewed Sleeper weekly-score import (supabase/migrations/20261110110000_gtl_epl_score_import.sql) on
// PGlite. Synthetic scores and hashes only; no screenshot, real score or hosted database is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const FILE = 'supabase/migrations/20261110110000_gtl_epl_score_import.sql';
const OWNERS = ['719658248843632640', '473955676301815808', '702644837370929152', '1259267898757611520',
  '1395236217460633600', '1257180071064510465', '865667912365666304', '719745569895018496'];
const CLUBS = ['ARS', 'CHE', 'LIV', 'EVE', 'MUN', 'MNC', 'TOT', 'NEW'];
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COMMISSIONER = user(1), MEMBER = user(2);
const hash = c => c.repeat(64);
// Synthetic weekly scores: all distinct, so the order is ascending score.
const SCORES = [61.2, 48.75, 90.1, 55.05, 72.4, 33.3, 80, 66.65];
const ascending = (scores = SCORES) => OWNERS.map((id, i) => ({ id, s: scores[i] })).sort((a, b) => a.s - b.s).map(x => x.id);
const rows = (scores = SCORES, extra = {}) => OWNERS.map((owner_id, i) => ({ owner_id, score: scores[i], extracted_score: scores[i], ...extra[owner_id] }));

async function setup(t, { status = 'resolved', apply = true } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ['20261008164249_gtl_private_cloud_state.sql', '20261028190000_gtl_epl_pick_a_team.sql', '20261103212932_gtl_epl_turn_queue.sql'])
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  if (apply) await db.exec(fs.readFileSync(FILE, 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [COMMISSIONER, MEMBER]);
  await db.exec('alter table public.gtl_memberships drop constraint gtl_memberships_league_id_fkey');
  await db.query("insert into public.gtl_memberships(league_id,user_id,player_id,role,active) values('sean-troy-luke',$1,'sean','commissioner',true),('sean-troy-luke',$2,'troy','player',true)", [COMMISSIONER, MEMBER]);
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,11,now()-interval '6 days',now()-interval '1 hour',now()-interval '5 days',$1,$2)", [OWNERS, status]);
  for (let i = 0; i < 4; i++) await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values($1,2026,11,$2,$3,now()-interval '5 days','final',2,0)", [`f${i}`, CLUBS[2 * i], CLUBS[2 * i + 1]]);
  for (let i = 0; i < 8; i++) await db.query("insert into public.gtl_epl_picks(season,week,owner_id,club,source,final) values(2026,11,$1,$2,'pick',true)", [OWNERS[i], CLUBS[i]]);
  const call = async (sql, args = []) => (await db.query(sql, args)).rows[0].r;
  const run = (args = {}) => {
    const a = { by: COMMISSIONER, season: 2026, week: 11, extracted: 11, corrected: false, sources: [hash('a')], scores: rows(), order: ascending(),
      bonus: true, correction: false, awards: [{ owner_id: OWNERS[0], margin: 2, club: 'ARS' }], ...args };
    return call('select public.gtl_epl_import_weekly_scores($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r',
      [a.by, a.season, a.week, a.extracted, a.corrected, a.sources, JSON.stringify(a.scores), a.order, a.bonus, a.correction, a.awards === null ? null : JSON.stringify(a.awards)]);
  };
  const count = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
  const week = async n => (await db.query('select status,pick_order from public.gtl_epl_weeks where season=2026 and week=$1', [n])).rows[0];
  return { db, call, run, count, week };
}

test('a confirmed import settles the resolved week from the verified awards and opens the next draft in ascending order', async t => {
  const f = await setup(t);
  const out = await f.run();
  assert.equal(out.reconciliation, 'new');
  assert.deepEqual(out.order, ascending());
  assert.equal(out.opening.outcome, 'opened');
  assert.equal(out.opening.week, 12);
  assert.equal(out.opening.fixtures, 0);
  assert.equal(out.opening.firstKickoff, null, 'no kickoff is reported before the next fixtures exist');
  assert.equal(out.awarded, 1);
  assert.deepEqual(await f.week(11), { status: 'settled', pick_order: OWNERS });
  assert.deepEqual((await f.week(12)).pick_order, ascending());
  const bonus = (await f.db.query('select owner_id,points,margin,club from public.gtl_epl_bonus')).rows;
  assert.deepEqual(bonus, [{ owner_id: OWNERS[0], points: 0, margin: 2, club: 'ARS' }], 'Sean adds bonuses in Sleeper: zero additional points');
  const stored = (await f.db.query('select owner_id,score::text s,edited from public.gtl_epl_score_import_rows order by owner_id')).rows;
  assert.equal(stored.length, 8);
  assert.ok(stored.some(r => r.s === '48.75'), 'two-decimal scores are kept exactly');
  assert.ok(stored.every(r => r.edited === false));
  const imp = (await f.db.query('select source,source_sha256,bonus_included,extracted_week from public.gtl_epl_score_imports')).rows[0];
  assert.equal(imp.source, 'commissioner_screenshot_import');
  assert.match(imp.source_sha256, /^[0-9a-f]{64}$/);
  assert.equal(imp.bonus_included, true);
  assert.equal(await f.count('gtl_epl_snapshots'), 0, 'an import never writes a cumulative snapshot');
  assert.deepEqual((await f.db.query('select outcome,applied_order from public.gtl_epl_score_import_openings')).rows, [{ outcome: 'opened', applied_order: ascending() }]);
});

test('commissioner only; attestation, open draft, mixed or changed week and order mismatch are refused before any write', async t => {
  const f = await setup(t);
  await assert.rejects(f.run({ by: MEMBER }), /GTL_EPL_FORBIDDEN/);
  await assert.rejects(f.run({ by: null }), /GTL_EPL_FORBIDDEN/);
  await assert.rejects(f.run({ bonus: false }), /GTL_EPL_IMPORT_ATTESTATION/);
  await assert.rejects(f.run({ bonus: null }), /GTL_EPL_IMPORT_ATTESTATION/);
  await assert.rejects(f.run({ extracted: 10 }), /GTL_EPL_IMPORT_WEEK_MISMATCH/, 'a silent change of week is refused');
  await assert.rejects(f.run({ order: [...ascending()].reverse() }), /GTL_EPL_IMPORT_ORDER_CHANGED/);
  await assert.rejects(f.run({ sources: [] }), /GTL_EPL_IMPORT_INVALID/);
  await assert.rejects(f.run({ sources: ['not-a-hash'] }), /GTL_EPL_IMPORT_INVALID/);
  await assert.rejects(f.run({ week: 13, extracted: 13 }), /GTL_EPL_NO_WEEK/);
  await f.db.exec("update public.gtl_epl_weeks set status='open' where week=11");
  await assert.rejects(f.run(), /GTL_EPL_IMPORT_WEEK_OPEN/);
  for (const table of ['gtl_epl_score_imports', 'gtl_epl_score_import_rows', 'gtl_epl_score_import_sources', 'gtl_epl_score_import_openings', 'gtl_epl_bonus']) assert.equal(await f.count(table), 0, table);
  assert.equal(await f.week(12), undefined);
});

test('a missing, duplicate, unknown or non-numeric score is refused, never written as zero', async t => {
  const f = await setup(t);
  const seven = rows().slice(0, 7);
  await assert.rejects(f.run({ scores: seven }), /GTL_EPL_IMPORT_INCOMPLETE/);
  await assert.rejects(f.run({ scores: rows().map((r, i) => (i === 3 ? { ...r, score: null } : r)) }), /GTL_EPL_IMPORT_INCOMPLETE/);
  await assert.rejects(f.run({ scores: rows().map((r, i) => (i === 3 ? { owner_id: r.owner_id } : r)) }), /GTL_EPL_IMPORT_INCOMPLETE/);
  await assert.rejects(f.run({ scores: rows().map((r, i) => (i === 3 ? { ...r, score: '55.05' } : r)) }), /GTL_EPL_IMPORT_INCOMPLETE/);
  await assert.rejects(f.run({ scores: [...seven, { ...rows()[0] }] }), /GTL_EPL_IMPORT_INVALID/, 'the same manager twice');
  await assert.rejects(f.run({ scores: [...seven, { owner_id: '999', score: 1 }] }), /GTL_EPL_IMPORT_INVALID/, 'a manager outside the order');
  await assert.rejects(f.run({ scores: rows().map((r, i) => (i === 0 ? { ...r, score: 61.234 } : r)) }), /GTL_EPL_IMPORT_INVALID/, 'more than two decimals');
  await assert.rejects(f.run({ scores: rows().map((r, i) => (i === 0 ? { ...r, rank: 1 } : r)) }), /GTL_EPL_IMPORT_INVALID/);
  assert.equal(await f.count('gtl_epl_score_imports'), 0);
  // An explicit zero is a real score.
  const zero = SCORES.map((s, i) => (i === 5 ? 0 : s));
  assert.equal((await f.run({ scores: rows(zero), order: ascending(zero) })).order[0], OWNERS[5]);
});

test('tied weekly scores need season totals; the lower season total picks first', async t => {
  const f = await setup(t);
  const tied = SCORES.map((s, i) => (i === 1 ? 61.2 : s)); // owners 0 and 1 tie at 61.20
  const base = ascending(tied);
  await assert.rejects(f.run({ scores: rows(tied), order: base }), /GTL_EPL_IMPORT_TIE_TOTALS/);
  await assert.rejects(f.run({ scores: rows(tied, { [OWNERS[0]]: { season_total: 700 } }), order: base }), /GTL_EPL_IMPORT_TIE_TOTALS/);
  const totals = { [OWNERS[0]]: { season_total: 700.5 }, [OWNERS[1]]: { season_total: 650.25 } };
  const expected = [...base];
  const a = expected.indexOf(OWNERS[0]), b = expected.indexOf(OWNERS[1]);
  [expected[Math.min(a, b)], expected[Math.max(a, b)]] = [OWNERS[1], OWNERS[0]];
  assert.ok(a < b);
  await assert.rejects(f.run({ scores: rows(tied, totals), order: base }), /GTL_EPL_IMPORT_ORDER_CHANGED/, 'the owner-id order is not the tie-break');
  const out = await f.run({ scores: rows(tied, totals), order: expected });
  assert.ok(out.order.indexOf(OWNERS[1]) < out.order.indexOf(OWNERS[0]), 'lower season total first');
});

test('repeat uploads reconcile by week and hash; different scores need an explicit, audited correction', async t => {
  const f = await setup(t);
  await f.run();
  const again = await f.run();
  assert.equal(again.reconciliation, 'duplicate');
  assert.equal(again.opening.outcome, 'same_order');
  const crop = await f.run({ sources: [hash('a'), hash('b')] });
  assert.equal(crop.reconciliation, 'reconciled', 'another crop of the same scores adds its hash to the confirmed import');
  assert.equal(await f.count('gtl_epl_score_imports'), 1);
  assert.equal(await f.count('gtl_epl_score_import_sources'), 2);
  const changed = SCORES.map((s, i) => (i === 2 ? 20.5 : s));
  await assert.rejects(f.run({ scores: rows(changed), order: ascending(changed), sources: [hash('c')] }), /GTL_EPL_IMPORT_CONFLICT/);
  assert.equal(await f.count('gtl_epl_score_imports'), 1, 'a conflicting candidate does not replace the confirmed import');
  const fixed = await f.run({ scores: rows(changed), order: ascending(changed), sources: [hash('c')], correction: true });
  assert.equal(fixed.reconciliation, 'correction');
  assert.equal(fixed.opening.outcome, 'order_applied', 'the next draft has no picks yet, so the corrected order applies');
  assert.deepEqual((await f.week(12)).pick_order, ascending(changed));
  const chain = (await f.db.query('select supersedes is null root from public.gtl_epl_score_imports order by confirmed_at')).rows.map(r => r.root);
  assert.deepEqual(chain, [true, false]);
  const opened = (await f.db.query('select outcome,previous_order from public.gtl_epl_score_import_openings order by id')).rows;
  assert.deepEqual(opened.map(r => r.outcome), ['opened', 'same_order', 'same_order', 'order_applied']);
  assert.deepEqual(opened[3].previous_order, ascending());
  assert.equal(await f.count('gtl_epl_bonus'), 1, 'awards are written once');
  const state = await f.call('select public.gtl_epl_score_import_state($1,2026,11) r', [COMMISSIONER]);
  assert.equal(state.import.corrections, 1);
  assert.deepEqual(state.import.order, ascending(changed));
  assert.equal(state.import.rows.length, 8);
  assert.equal(state.next.week, 12);
});

test('a next draft with picks, closed or past kickoff keeps its order; the import is still kept', async t => {
  const f = await setup(t);
  await f.run();
  await f.db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('n1',2026,12,'ARS','CHE',now()+interval '3 days')");
  await f.db.query("update public.gtl_epl_weeks set first_kickoff=now()+interval '3 days' where week=12");
  await f.db.query("insert into public.gtl_epl_picks(season,week,owner_id,club,source) values(2026,12,$1,'ARS','pick')", [ascending()[0]]);
  const changed = SCORES.map((s, i) => (i === 2 ? 20.5 : s));
  const out = await f.run({ scores: rows(changed), order: ascending(changed), sources: [hash('d')], correction: true });
  assert.equal(out.opening.outcome, 'preserved_picks');
  assert.deepEqual((await f.week(12)).pick_order, ascending(), 'never overwrite a draft with picks');
  assert.equal(await f.count('gtl_epl_score_imports'), 2);
  assert.equal(out.opening.fixtures, 1);
  assert.ok(out.opening.firstKickoff);
  await f.db.exec('delete from public.gtl_epl_picks where week=12');
  await f.db.query("update public.gtl_epl_weeks set first_kickoff=now()-interval '1 minute' where week=12");
  const late = SCORES.map((s, i) => (i === 2 ? 21.5 : s));
  const closed = await f.run({ scores: rows(late), order: ascending(late), sources: [hash('e')], correction: true });
  assert.equal(closed.opening.outcome, 'preserved_closed');
  assert.deepEqual((await f.week(12)).pick_order, ascending());
});

test('results not yet verified: the confirmed import is kept and the opening waits; a later confirmation opens it', async t => {
  const f = await setup(t);
  const out = await f.run({ awards: null });
  assert.equal(out.opening.outcome, 'pending_results');
  assert.equal((await f.week(11)).status, 'resolved');
  assert.equal(await f.week(12), undefined);
  assert.equal(await f.count('gtl_epl_score_imports'), 1);
  await assert.rejects(f.run({ awards: [{ owner_id: OWNERS[0], margin: 2, club: 'CHE' }] }), /GTL_EPL_IMPORT_INVALID/, 'an award must name the manager\'s drafted club');
  await assert.rejects(f.run({ awards: [{ owner_id: OWNERS[0], margin: 2.5, club: 'ARS' }] }), /GTL_EPL_IMPORT_INVALID/);
  const retry = await f.run({ awards: [] });
  assert.equal(retry.reconciliation, 'duplicate');
  assert.equal(retry.opening.outcome, 'opened');
  assert.equal((await f.week(11)).status, 'settled');
});

test('a settled week (opened by the snapshot path) only corrects an untouched next order; the last matchweek opens nothing', async t => {
  const f = await setup(t, { status: 'settled' });
  await f.db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,12,now(),now()+interval '7 days',now()+interval '7 days',$1,'open')", [OWNERS]);
  const out = await f.run({ awards: null });
  assert.equal(out.opening.outcome, 'order_applied');
  assert.equal(out.awarded, 0);
  assert.equal(await f.count('gtl_epl_bonus'), 0, 'a settled week keeps its stored awards');
  await f.db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,38,now()-interval '6 days',now(),now()-interval '5 days',$1,'settled')", [OWNERS]);
  const end = await f.run({ week: 38, extracted: 38, awards: null });
  assert.equal(end.opening.outcome, 'season_end');
  assert.equal(await f.week(39), undefined);
});

test('the review state is commissioner-only and exposes the known mapping and saved season totals', async t => {
  const f = await setup(t);
  await assert.rejects(f.call('select public.gtl_epl_score_import_state($1,2026,11) r', [MEMBER]), /GTL_EPL_FORBIDDEN/);
  await f.db.query("insert into public.gtl_epl_snapshots(captured_at,label,week,payload) values(now(),'after-mw11',11,$1)",
    [JSON.stringify({ state: { season: '2026', week: 12 }, rosters: [{ owner_id: OWNERS[0], settings: { fpts: 700, fpts_decimal: 50 } }] })]);
  const state = await f.call('select public.gtl_epl_score_import_state($1,null,11) r', [COMMISSIONER]);
  assert.equal(state.season, 2026);
  assert.equal(state.managers.length, 8);
  assert.ok(state.managers.every(m => /^[0-9]+$/.test(m.ownerId) && m.sleeperName));
  assert.deepEqual(state.weeks.map(w => w.week), [11]);
  assert.equal(state.import, null);
  assert.equal(state.next, null);
  assert.deepEqual(state.snapshotTotals, { [OWNERS[0]]: 700.5 });
});

test('service-only functions and append-only tables; applying the file twice changes nothing', async t => {
  const f = await setup(t);
  await f.run();
  await f.db.exec(fs.readFileSync(FILE, 'utf8'));
  assert.equal(await f.count('gtl_epl_score_imports'), 1);
  const sig = 'public.gtl_epl_import_weekly_scores(uuid,integer,integer,integer,boolean,text[],jsonb,text[],boolean,boolean,jsonb)';
  for (const fn of [sig, 'public.gtl_epl_score_import_state(uuid,integer,integer)', 'public.gtl_epl_score_import_head(integer,integer)']) {
    const g = (await f.db.query(`select has_function_privilege('anon','${fn}','EXECUTE') a,has_function_privilege('authenticated','${fn}','EXECUTE') u,has_function_privilege('service_role','${fn}','EXECUTE') s`)).rows[0];
    assert.deepEqual(g, { a: false, u: false, s: true }, fn);
  }
  for (const table of ['gtl_epl_score_imports', 'gtl_epl_score_import_rows', 'gtl_epl_score_import_sources', 'gtl_epl_score_import_openings']) {
    const g = (await f.db.query(`select has_table_privilege('service_role','public.${table}','UPDATE') up,has_table_privilege('service_role','public.${table}','DELETE') del,has_table_privilege('authenticated','public.${table}','SELECT') sel`)).rows[0];
    assert.deepEqual(g, { up: false, del: false, sel: false }, table);
  }
});

test('the writer is atomic: a failure after the import row leaves nothing behind', async t => {
  const f = await setup(t);
  // An award naming another manager's club fails after the import rows are inserted; the transaction rolls back whole.
  await assert.rejects(f.run({ awards: [{ owner_id: OWNERS[1], margin: 1, club: 'ARS' }] }), /GTL_EPL_IMPORT_INVALID/);
  for (const table of ['gtl_epl_score_imports', 'gtl_epl_score_import_rows', 'gtl_epl_score_import_sources', 'gtl_epl_score_import_openings', 'gtl_epl_bonus']) assert.equal(await f.count(table), 0, table);
  assert.equal((await f.week(11)).status, 'resolved');
  assert.equal(await f.week(12), undefined);
});
