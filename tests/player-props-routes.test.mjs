// D-82 Player Props routes: the real gtl-api handler and Supabase adapter over the real (unapplied) migration on local
// PGlite, plus the dark-launch flag and old-client/unapplied-schema compatibility. The stubbed fetch serves local
// database results and fixture provider data. It makes no network requests and uses no credits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ALL, PRELUDE, migrationSql } from './migrations.mjs';
import { createCloudHandler, createSupabaseAdapter, ROUTE_METHODS } from '../cloud/handler.mjs';
import { handleProps, playerPropsOn, propGuessView, PROPS_METHODS, sharedView } from '../cloud/player-props.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EVENT = '2026_10_DAL_PHI', PLAYER = '00-0036358';
const iso = ms => new Date(ms).toISOString();
const MIGRATION = '20261110130000_gtl_player_props.sql';
const REFRESH = '20261112031000_gtl_player_props_refresh.sql';
// These migrations need the Player Props storage, so the legacy fixture leaves them out too.
const DEPENDENTS = ['20261110160000_gtl_player_props_jobs.sql', '20261110180000_gtl_player_props_shared.sql', REFRESH];
const SHARED = '20261110180000_gtl_player_props_shared.sql';

/** Normalized research quotes, as cloud/research-provider.mjs retains them, for one prop at three books. */
function retainedQuotes(lines, observedAt, kickoff) {
  return ['draftkings', 'fanduel', 'betmgm'].flatMap((book, i) => ['over', 'under'].map(side => ({
    gameId: 'DAL-PHI', kickoff, selection: { market: 'prop', key: 'player_reception_yds', side, line: lines[i], playerId: PLAYER, playerName: 'Fixture Receiver', unit: 'yards' },
    provider: 'the-odds-api', providerEventId: 'evt-fixture', book, source: book, odds: -110, observedAt, capturedAt: observedAt })));
}

async function setup(t, { flag = 'on', ready = true, schema = true, quotes = true, shared = true, refresh = false, refreshSchema = true } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) {
    if ((!schema && (file === MIGRATION || DEPENDENTS.includes(file))) || (!shared && file === SHARED) || (!refreshSchema && file === REFRESH)) continue;
    await db.exec(migrationSql(file));
  }
  for (const n of [1, 2, 3]) await db.query('insert into auth.users values($1)', [id(n)]);
  await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Troy Fixture'),($2,'Luke Fixture')", [id(1), id(2)]);
  const now = Date.now(), kickoff = iso(now + 86_400_000);
  if (schema) {
    if (ready) await db.exec('update public.gtl_prop_capability set live_lock_in=true');
    await db.query("select public.gtl_props_record_offer($1)", [{ season: 2026, week: 10, eventId: EVENT, playerId: PLAYER, stat: 'player_reception_yds',
      playerName: 'Fixture Receiver', team: 'DAL', position: 'WR', away: 'DAL', home: 'PHI', kickoff, source: 'fixture' }]);
    await db.query("select public.gtl_props_record_offer($1)", [{ season: 2026, week: 10, eventId: EVENT, playerId: PLAYER, stat: 'player_receptions',
      playerName: 'Fixture Receiver', team: 'DAL', position: 'WR', away: 'DAL', home: 'PHI', kickoff, source: 'fixture' }]);
  }
  if (quotes) await db.query(`insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload)
    values($1,$2,2026,10,'DAL-PHI',array['player_reception_yds'],1,'finished',$3,$3,$4)`, [randomUUID(), randomUUID(), iso(now - 5 * 60_000), JSON.stringify(retainedQuotes([66.5, 67.5, 68.5], iso(now - 5 * 60_000), kickoff))]);
  const away = 'Dallas Cowboys', home = 'Philadelphia Eagles';
  const rosterFile = 'roster_weekly_2026.csv';
  const rosterUrl = `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/${rosterFile}`;
  const rosterCsv = `season,week,game_type,gsis_id,team,position,status,full_name\n2026,10,REG,${PLAYER},DAL,WR,ACT,Fixture Receiver\n2026,10,REG,00-0000001,PHI,WR,ACT,Other Receiver\n`;
  if (refresh) {
    const signature = { season: 2026, week: 10, games: [{ id: 'DAL-PHI', away: 'DAL', home: 'PHI', kickoff: Date.parse(kickoff) / 1000 }] };
    const snapshot = { games: [{ gameId: 'DAL-PHI', away, home, kickoff, providerEventId: 'evt-fixture', matchStatus: 'matched' }] };
    const snapshotId = randomUUID();
    await db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,10,$1)', [signature]);
    await db.query(`insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
      values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,10,$4)`, [snapshotId, id(1), randomUUID(), signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,10,$2,$3,$4)',
      [snapshotId, signature, snapshot, iso(now)]);
    await db.exec("update public.gtl_odds_budget set conservative_remaining=100,last_successful_preflight_at=clock_timestamp() where provider='the-odds-api'");
  }
  const calls = [], providerHosts = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url), name = u.pathname.split('/').at(-1);
    if (refresh && u.href === 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/weekly_rosters') {
      const asset = { name: rosterFile, browser_download_url: rosterUrl, size: Buffer.byteLength(rosterCsv), state: 'uploaded', updated_at: iso(now - 300_000),
        digest: `sha256:${createHash('sha256').update(rosterCsv).digest('hex')}` };
      return Response.json({ tag_name: 'weekly_rosters', draft: false, assets: [asset] });
    }
    if (refresh && u.href === rosterUrl) return new Response(rosterCsv);
    if (refresh && u.hostname === 'api.the-odds-api.com') {
      providerHosts.push(u.hostname);
      assert.match(u.pathname, /\/events\/evt-fixture\/odds$/);
      assert.equal(u.searchParams.get('markets'), 'player_reception_yds');
      return Response.json({ id: 'evt-fixture', sport_key: 'americanfootball_nfl', away_team: away, home_team: home, commence_time: kickoff,
        bookmakers: ['draftkings', 'fanduel', 'betmgm'].map((key, index) => ({ key, markets: [{ key: 'player_reception_yds', last_update: iso(now - 60_000),
          outcomes: ['Over', 'Under'].map(side => ({ name: side, description: 'Fixture Receiver', point: 66.5 + index, price: -110 })) }] })) },
      { headers: { 'x-requests-remaining': '99', 'x-requests-used': '401', 'x-requests-last': '1' } });
    }
    if (u.hostname !== 'fixture.supabase.co') { providerHosts.push(u.hostname); throw new Error('no external request'); }
    if (u.pathname.includes('/rpc/')) {
      const body = JSON.parse(options.body); calls.push(name);
      try {
        const result = await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query(`select public.${name}(${Object.keys(body).map((key, i) => `${key}=>$${i + 1}`).join(',')}) as value`, Object.values(body).map(v => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v))); });
        return Response.json(result.rows[0].value);
      } catch (e) {
        const absent = e.code === '42883' && e.message.includes(`function public.${name}(`);
        return Response.json({ code: absent ? 'PGRST202' : e.code, message: e.message }, { status: absent ? 404 : 400 });
      }
    }
    if (name === 'gtl_research_quote_fetches') {
      calls.push(name);
      const q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k, v.replace(/^(eq|gte)\./, '')]));
      const { rows } = await db.query(`select status,error,quote_payload from public.gtl_research_quote_fetches where season=$1 and week=$2 and game_id=$3 and status=$4 and started_at>=$5
        and markets @> $6::text[] and error is null order by started_at desc,request_id desc limit $7`, [Number(q.season), Number(q.week), q.game_id, q.status, q.started_at, q.markets.slice(3), Number(q.limit)]);
      return Response.json(rows);
    }
    if (name === 'gtl_market_snapshots' && refresh) {
      const { rows } = await db.query(`select created_at,payload->'games' games from public.gtl_market_snapshots
        where season=$1 and week=$2 order by created_at desc,id desc limit 1`, [Number(u.searchParams.get('season').slice(3)), Number(u.searchParams.get('week').slice(3))]);
      return Response.json(rows);
    }
    throw new Error(`Unexpected private read ${name}`);
  };
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'fixture', serviceRoleKey: 'fixture', fetchImpl,
    playerPropsOddsKey: refresh ? 'fixture-odds-key' : undefined });
  let authenticated = 0;
  const handler = createCloudHandler({ props: adapter.props, playerProps: flag, authenticate: async token => { authenticated += 1; return { id: id(Number(token)), email: 'fixture@example.test', emailConfirmed: true }; } });
  const call = async (action, body = {}, user = 1) => {
    const response = await handler(new Request(`https://fixture.test/props/${action}`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const stored = async () => (await db.query('select stat,guess::float8 guess,status from public.gtl_prop_guesses order by stat')).rows;
  return { db, call, calls, stored, providerHosts, authenticated: () => authenticated, now };
}
const save = (guess, extra = {}) => ({ eventId: EVENT, playerId: PLAYER, stat: 'player_reception_yds', guess, requestId: randomUUID(), ...extra });

test('flag off (default): every /props route answers exactly like a missing route, before sign-in and without any storage call', { skip }, async t => {
  assert.equal(playerPropsOn(undefined), false, 'unset secret is off');
  assert.equal(playerPropsOn(' ON '), true);
  for (const flag of [null, '', 'true', 'off', '1', 'yes']) {
    const f = await setup(t, { flag });
    for (const action of ['read', 'draft', 'lock', 'history', 'shared']) {
      const r = await f.call(action, ['read', 'shared'].includes(action) ? { season: 2026, week: 10 } : save(72.5));
      assert.equal(r.status, 404); assert.deepEqual(r.body, { error: 'Not found.' });
    }
    assert.equal(f.authenticated(), 0); assert.deepEqual(f.calls, []); assert.deepEqual(await f.stored(), []);
  }
  assert.deepEqual(Object.keys(PROPS_METHODS).filter(route => !Object.hasOwn(ROUTE_METHODS, route)), []);
});

test('flag on, capability off: reads say not_enabled and offer nothing; writers refuse GTL_PROPS_OFF', { skip }, async t => {
  const f = await setup(t, { ready: false });
  const read = await f.call('read', { season: 2026, week: 10 });
  assert.equal(read.status, 200); assert.equal(read.body.available, false); assert.equal(read.body.reason, 'not_enabled'); assert.deepEqual(read.body.offers, []);
  for (const action of ['draft', 'lock']) {
    const r = await f.call(action, save(72.5));
    assert.equal(r.status, 404); assert.equal(r.body.code, 'GTL_PROPS_OFF');
  }
  assert.deepEqual(await f.stored(), []);
});

test('unapplied schema: reads fall back to schema_unavailable, writers say off; Spread/Total code paths are untouched', { skip }, async t => {
  const f = await setup(t, { schema: false, quotes: false });
  const read = await f.call('read', { season: 2026, week: 10 });
  assert.equal(read.status, 200); assert.equal(read.body.available, false); assert.equal(read.body.reason, 'schema_unavailable');
  const write = await f.call('draft', save(72.5));
  assert.equal(write.status, 404); assert.equal(write.body.code, 'GTL_PROPS_OFF');
  const shared = await f.call('shared', { season: 2026, week: 10 });
  assert.equal(shared.status, 200); assert.deepEqual(shared.body, { available: false, season: 2026, week: 10, selections: [] });
  const handler = createCloudHandler({ authenticate: async () => null });
  for (const route of ['/state', '/community/read', '/personal/read']) assert.equal((await handler(new Request(`https://fixture.test${route}`, { method: route === '/state' ? 'GET' : 'POST' }))).status, 401, `${route} unchanged`);
});

test('draft, lock from retained quotes only, idempotent replay, final refusal; no provider host is ever contacted', { skip }, async t => {
  const f = await setup(t);
  const read = await f.call('read', { season: 2026, week: 10 });
  assert.equal(read.body.available, true);
  assert.deepEqual(read.body.offers.map(o => o.stat).sort(), ['player_reception_yds', 'player_receptions']);
  assert.ok(read.body.offers.every(o => !('line' in o) && !('reference' in o)), 'entry offers never carry a market number');
  const draft = await f.call('draft', save(70));
  assert.equal(draft.status, 200); assert.equal(draft.body.status, 'draft'); assert.equal(draft.body.reference, null);
  const body = save(72.5);
  const locked = await f.call('lock', body);
  assert.equal(locked.status, 200); assert.equal(locked.body.status, 'locked'); assert.equal(locked.body.guess, 72.5);
  assert.equal(locked.body.reference.line, 67.5); assert.deepEqual(locked.body.reference.books.map(b => b.book), ['betmgm', 'draftkings', 'fanduel']);
  assert.ok(f.calls.includes('gtl_research_quote_fetches') && f.calls.includes('gtl_props_record_reference'));
  const replay = await f.call('lock', body);
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.reference.line, 67.5);
  const changed = await f.call('lock', save(80));
  assert.equal(changed.status, 409); assert.equal(changed.body.code, 'GTL_PROPS_LOCKED');
  assert.deepEqual(f.providerHosts, []);
  assert.deepEqual((await f.call('read', { season: 2026, week: 10 }, 2)).body.own, [], 'another member never receives my guess');
});

test('no qualifying reference: lock refused with a retry code, draft kept with the typed value', { skip }, async t => {
  const f = await setup(t);
  const r = await f.call('lock', save(5.5, { stat: 'player_receptions' }));
  assert.equal(r.status, 409); assert.equal(r.body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  assert.match(r.body.error, /kept your draft/);
  assert.deepEqual(await f.stored(), [{ stat: 'player_receptions', guess: 5.5, status: 'draft' }]);
});

test('on-demand lock retains a provider capture through the real shared reservation and finish RPCs', { skip }, async t => {
  const f = await setup(t, { quotes: false, refresh: true });
  const body = save(72.5);
  const lock = await f.call('lock', body);
  assert.equal(lock.status, 200, JSON.stringify(lock.body));
  assert.equal(lock.body.reference.line, 67.5);
  assert.deepEqual(await f.stored(), [{ stat: 'player_reception_yds', guess: 72.5, status: 'locked' }]);
  const { rows: fetches } = await f.db.query('select status,reserved_credits,jsonb_array_length(quote_payload) quotes,error from public.gtl_research_quote_fetches');
  assert.deepEqual(fetches, [{ status: 'finished', reserved_credits: 1, quotes: 6, error: null }]);
  const { rows: budget } = await f.db.query('select conservative_remaining,lease_token from public.gtl_odds_budget');
  assert.deepEqual(budget, [{ conservative_remaining: 99, lease_token: null }]);
  const { rows: audit } = await f.db.query('select action,request_id from public.gtl_prop_guess_events order by created_at');
  assert.deepEqual(audit.map(row => row.action), ['draft', 'lock']);
  assert.equal(audit[1].request_id, body.requestId);
  assert.equal((await f.call('lock', body)).body.replayed, true);
  assert.deepEqual(f.providerHosts, ['api.the-odds-api.com']);
});

test('an older Player Props schema keeps the draft when the refresh reservation is absent', { skip }, async t => {
  const f = await setup(t, { quotes: false, refresh: true, refreshSchema: false });
  const result = await f.call('lock', save(72.5));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  assert.deepEqual(await f.stored(), [{ stat: 'player_reception_yds', guess: 72.5, status: 'draft' }]);
  assert.ok(f.calls.includes('gtl_props_begin_refresh'));
  assert.deepEqual(f.providerHosts, []);
});

test('input validation, paused writers and history', { skip }, async t => {
  const f = await setup(t);
  for (const bad of [save(-1, { stat: 'player_receptions' }), save(72.25), save(72.5, { playerId: 'CeeDee Lamb' }), save(72.5, { requestId: 'x' }), { ...save(72.5), extra: 1 }]) {
    const r = await f.call('draft', bad); assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await f.call('history', { from: { season: 2026, week: 9 }, to: { season: 2026, week: 1 } })).status, 400);
  await f.call('lock', save(72.5));
  const history = await f.call('history', { from: { season: 2026, week: 1 }, to: { season: 2026, week: 18 } });
  assert.equal(history.status, 200); assert.equal(history.body.complete, true); assert.equal(history.body.rows.length, 1);
  assert.equal(history.body.rows[0].result, null);
  const paused = await handleProps({ route: '/props/draft', body: save(72.5), user: { id: id(1) }, service: { rpc: async () => { throw new Error('not called'); } }, featureOff: new Set(['player-props']) }).catch(e => e);
  assert.equal(paused.status, 503);
});

test('reply views drop a broadened payload: a draft never carries a reference or latest line', () => {
  const view = propGuessView({ eventId: EVENT, playerId: PLAYER, stat: 'player_reception_yds', guess: 70, status: 'draft', savedAt: new Date().toISOString(), lockedAt: null,
    reference: { line: 66.5 }, latest: { line: 66.5, observedTo: new Date().toISOString() }, otherUsers: [{ guess: 1 }] });
  assert.equal(view.reference, null); assert.equal(view.latest, null); assert.ok(!('otherUsers' in view));
});

test('shared: another member’s locked guess opens only on your own lock of that exact selection or at kickoff; never a draft or line', { skip }, async t => {
  const f = await setup(t);
  const week = { season: 2026, week: 10 };
  assert.equal((await f.call('lock', save(72.5))).status, 200);
  assert.equal((await f.call('draft', save(70), 2)).status, 200);
  assert.equal((await f.call('draft', save(4.5, { stat: 'player_receptions' }), 2)).status, 200);
  // Luke has only drafts: Troy's lock stays closed to him, and Troy sees his own selection with no one else in.
  assert.deepEqual((await f.call('shared', week, 2)).body.selections, []);
  const own = (await f.call('shared', week, 1)).body;
  assert.equal(own.available, true); assert.equal(own.selections.length, 1);
  assert.equal(own.selections[0].ownLocked, true); assert.deepEqual(own.selections[0].rows, [], 'a draft is never shown nor counted');
  // Luke locks the same exact selection: Troy's guess opens to him, as a value and a name only.
  assert.equal((await f.call('lock', save(66, {}), 2)).status, 200);
  const opened = (await f.call('shared', week, 2)).body.selections;
  assert.deepEqual(opened.map(s => [s.stat, s.ownLocked, s.rows.map(r => [r.name, r.guess])]), [['player_reception_yds', true, [['Troy Fixture', 72.5]]]]);
  const json = JSON.stringify(opened);
  for (const word of ['line', 'reference', 'books', 'latest', 'savedAt', 'draft']) assert.ok(!json.includes(`"${word}`), `${word} never leaves the server`);
  // A different stat for the same athlete is a different selection: Luke's receptions draft opens nothing.
  assert.ok(!opened.some(s => s.stat === 'player_receptions'));
  // At kickoff the event opens for every member, still locked guesses only.
  await f.db.exec("update public.gtl_prop_offers set kickoff=now()-interval '1 minute'");
  const kicked = (await f.call('shared', week, 1)).body.selections;
  assert.deepEqual(kicked.map(s => [s.stat, s.started, s.rows.map(r => r.guess)]), [['player_reception_yds', true, [66]]]);
  assert.equal((await f.call('shared', { season: 2026, week: 11 }, 1)).body.selections.length, 0);
  assert.equal((await f.call('shared', { season: 2026 }, 1)).status, 400);
});

test('shared: an unapplied shared reader answers available:false; everything else keeps working', { skip }, async t => {
  const f = await setup(t, { shared: false });
  assert.equal((await f.call('lock', save(72.5))).status, 200);
  const shared = await f.call('shared', { season: 2026, week: 10 });
  assert.equal(shared.status, 200); assert.deepEqual(shared.body, { available: false, season: 2026, week: 10, selections: [] });
});

test('shared view is a second gate: closed selections, own rows, drafts and invalid values never pass', () => {
  const base = { eventId: EVENT, playerId: PLAYER, stat: 'player_reception_yds', playerName: 'Fixture Receiver', team: 'DAL', position: 'WR', away: 'DAL', home: 'PHI', kickoff: new Date().toISOString() };
  const row = (n, guess) => ({ userId: id(n), displayName: `P${n}`, guess, lockedAt: new Date().toISOString(), line: 66.5 });
  const view = sharedView({ season: 2026, week: 10, selections: [
    { ...base, ownLocked: false, started: false, rows: [row(2, 70)] },
    { ...base, stat: 'player_receptions', ownLocked: true, started: false, rows: [row(1, 5), row(2, 4.25), row(3, 4.5)] },
  ] }, { season: 2026, week: 10 }, id(1));
  assert.deepEqual(view.selections.map(s => [s.stat, s.rows.map(r => [r.name, r.guess])]), [['player_receptions', [['P3', 4.5]]]]);
  assert.ok(!('line' in view.selections[0].rows[0]));
});
