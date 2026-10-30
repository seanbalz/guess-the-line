import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HOSTED } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable, ACCOUNTS } from './cloud-browser/community-world.mjs';
import { serviceSql, storeLines, sendBallot } from './helpers/guess-week.mjs';
import { fixture } from './fixtures/research-assessments.mjs';

const migration = '20261030204548_gtl_research_assessments.sql';
test('research intake, snapshot publication and viewer projection preserve scoring and access boundaries', { skip: !pgliteAvailable }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: [...HOSTED, migration] });
  const { db, state } = world; t.after(() => db.close()); const rpc = serviceSql(db);
  const { season, week } = state.league, g = state.games[0], now = new Date(Date.now() - 5000).toISOString();
  const f = fixture(), snap = f.snapshot; snap.season = season; snap.week = week; snap.generatedAt = now;
  snap.candidates[0].gameId = g.id; snap.candidates[0].kickoff = g.kickoff; snap.candidates[0].dependencies[0].gameId = g.id;
  for (const k of ['publishedAt', 'observedAt', 'asOf']) snap.candidates[0].evidence[0][k] = now;
  Object.assign(snap.quotes[0], { gameId: g.id, kickoff: g.kickoff, observedAt: now, capturedAt: now });
  await db.query("insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload) values($1,$2,$3,$4,$5,$6,1,'finished',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '80 seconds',$7)",
    [randomUUID(),randomUUID(),season,week,g.id,['player_reception_yds'],snap.quotes]);
  const hashBallots = async () => (await db.query("select md5(coalesce(jsonb_agg(to_jsonb(b) order by user_id,season,week,mode)::text,'[]')) hash from public.gtl_weekly_ballots b")).rows[0].hash;
  const before = await hashBallots();
  const publication = randomUUID();
  await rpc('gtl_publish_research_snapshot', { p_id: publication, p_payload: snap });
  await rpc('gtl_publish_research_snapshot', { p_id: publication, p_payload: snap });
  assert.equal((await db.query('select count(*) n from public.gtl_research_snapshots')).rows[0].n, 1);
  await assert.rejects(rpc('gtl_publish_research_snapshot', { p_id: publication, p_payload: { ...snap, generatedAt: new Date().toISOString() } }), /GTL_RESEARCH_REPLAY/);
  assert.equal(await hashBallots(), before);
  const closed = await world.api('luke', 'lines/assessments', { season, week });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.ok(!JSON.stringify(closed.body).includes('Synthetic Receiver'));
  await storeLines(db, state, { spread: Object.fromEntries(state.games.map(g => [g.id, -3])), total: Object.fromEntries(state.games.map(g => [g.id, 45])) });
  await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -3])));
  const spreadOnly = await world.api('luke', 'lines/assessments', { season, week });
  assert.ok(!JSON.stringify(spreadOnly.body).includes('Synthetic Receiver'));
  await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(state.games.map(g => [g.id, 45])));
  const locked = await hashBallots();
  const open = await world.api('luke', 'lines/assessments', { season, week });
  assert.equal(open.status, 200, JSON.stringify(open.body));
  assert.equal(open.body.assessments.find(a => a.id === 'fixture-over')?.color, 'yellow');
  assert.match(open.body.assessments.find(a => a.id === 'fixture-over').routeId, /^r-[a-f0-9]{24}$/);
  assert.equal(await hashBallots(), locked);
  const wanted = [{ gameId: g.id, selection: { ...snap.candidates[0].selection, playerName: 'Display name may change' } }];
  assert.equal((await rpc('gtl_read_research_quotes', { p_season: season, p_week: week, p_selections: wanted })).length, 1);
  assert.deepEqual(await rpc('gtl_read_research_quotes', { p_season: season, p_week: week }), []);
  assert.deepEqual(await rpc('gtl_read_research_quotes', { p_season: season, p_week: week, p_selections: [{ ...wanted[0], selection: { ...wanted[0].selection, line: 66.5 } }] }), []);
  // A fresh empty market response withdraws the old offer rather than silently
  // resurrecting it from a previous successful capture.
  await db.query("insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload) values($1,$2,$3,$4,$5,$6,1,'finished',clock_timestamp(),clock_timestamp()+interval '90 seconds','[]')",
    [randomUUID(),randomUUID(),season,week,g.id,['player_reception_yds']]);
  assert.deepEqual(await rpc('gtl_read_research_quotes', { p_season: season, p_week: week, p_selections: wanted }), []);
  assert.ok(!JSON.stringify((await world.api('troy', 'lines/assessments', { season, week })).body).includes('Synthetic Receiver'));

  const requestId = randomUUID(), url = 'https://x.com/ActionNetworkHQ/status/12345?a=tracking';
  const saved = await world.api('luke', 'lines/research-submit', { requestId, url });
  assert.equal(saved.status, 200, JSON.stringify(saved.body)); assert.equal(saved.body.status, 'pending');
  assert.equal((await world.api('luke', 'lines/research-submit', { requestId, url })).body.id, saved.body.id);
  assert.equal((await db.query('select count(*) n from public.gtl_research_submissions')).rows[0].n, 1);
  assert.equal((await world.api('luke', 'lines/research-submit', { requestId, url: 'https://x.com/rotobot_ai/status/12345' })).status, 409);
  assert.equal((await world.api('luke', 'lines/research-links', {})).body.links.length, 1);
  assert.deepEqual((await world.api('troy', 'lines/research-links', {})).body.links, []);
  assert.equal((await world.api('luke', 'lines/research-links', { userId: ACCOUNTS.troy.id })).status, 400);
  assert.equal((await world.api('luke', 'lines/assessments', { season, week, now })).status, 400);
  for (const role of ['anon', 'authenticated']) {
    for (const sql of ['select * from public.gtl_research_submissions', `select public.gtl_read_research_snapshot(${season},${week})`, `select public.gtl_read_research_submissions('${ACCOUNTS.luke.id}')`]) {
      await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql); }), /permission denied/);
    }
  }
  const functions = (await db.query("select proname,prosecdef,proconfig from pg_proc where proname like 'gtl_%research%'")).rows;
  for (const f of functions) { assert.equal(f.prosecdef, false, f.proname); assert.ok(f.proconfig.some(s => s.startsWith('search_path=')), f.proname); }
});

test('selective game/prop fetches share the existing budget/lease and keep retries and failures conservative', { skip: !pgliteAvailable }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: [...HOSTED, migration] });
  const { db, state } = world; t.after(() => db.close()); const rpc = serviceSql(db);
  await db.query("update public.gtl_odds_budget set conservative_remaining=60,paused=false,last_successful_preflight_at=clock_timestamp(),lease_token=null");
  const args = { p_request: randomUUID(), p_season: state.league.season, p_week: state.league.week, p_game: state.games[0].id, p_markets: ['player_reception_yds', 'player_receptions'] };
  const lease = await rpc('gtl_begin_research_quotes', args);
  assert.equal(lease.replay, false);
  assert.equal((await db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining, 58);
  assert.equal((await rpc('gtl_begin_research_quotes', args)).replay, true);
  await assert.rejects(rpc('gtl_begin_research_quotes', { ...args, p_request: randomUUID() }), /GTL_ODDS_BUSY/);
  await assert.rejects(rpc('gtl_begin_research_quotes', { ...args, p_markets: ['player_rush_yds'] }), /GTL_RESEARCH_REPLAY/);
  await rpc('gtl_finish_research_quotes', { p_request: args.p_request, p_lease: lease.lease, p_quota: { remaining: 59, used: 441, last: 1 }, p_error: null });
  assert.equal((await db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining, 58);
  await db.query('update public.gtl_odds_budget set conservative_remaining=51');
  await assert.rejects(rpc('gtl_begin_research_quotes', { ...args, p_request: randomUUID() }), /GTL_ODDS_BUDGET/);
  await db.query('update public.gtl_odds_budget set conservative_remaining=70');
  const next = { ...args, p_request: randomUUID() }, fresh = await rpc('gtl_begin_research_quotes', next);
  await rpc('gtl_finish_research_quotes', { p_request: next.p_request, p_lease: fresh.lease, p_quota: {}, p_error: 'provider_unavailable' });
  assert.equal((await db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining, 68);
  const ml = { ...args, p_request: randomUUID(), p_markets: ['h2h', 'alternate_spreads'] };
  const mlLease = await rpc('gtl_begin_research_quotes', ml);
  assert.equal(mlLease.replay, false);
  await rpc('gtl_finish_research_quotes', { p_request: ml.p_request, p_lease: mlLease.lease, p_quota: { remaining: 66, last: 2 }, p_error: null });
});
