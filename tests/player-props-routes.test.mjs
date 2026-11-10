// D-82 Player Props routes: the real gtl-api handler and Supabase adapter over the real (unapplied) migration on local
// PGlite, plus the dark-launch flag and old-client/unapplied-schema compatibility. No hosted, provider or credit
// request is made: the stubbed fetch serves only PGlite RPCs and the retained research-quote table. Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, PRELUDE, migrationSql } from './migrations.mjs';
import { createCloudHandler, createSupabaseAdapter, ROUTE_METHODS } from '../cloud/handler.mjs';
import { handleProps, playerPropsOn, propGuessView, PROPS_METHODS } from '../cloud/player-props.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EVENT = '2026_10_DAL_PHI', PLAYER = '00-0036358';
const iso = ms => new Date(ms).toISOString();
const MIGRATION = '20261110130000_gtl_player_props.sql';
// The jobs migration builds on MIGRATION (tests/migrations.mjs REQUIRES), so an unapplied MIGRATION leaves it out too.
const DEPENDENTS = ['20261110160000_gtl_player_props_jobs.sql'];

/** Normalized research quotes, as cloud/research-provider.mjs retains them, for one prop at three books. */
function retainedQuotes(lines, observedAt, kickoff) {
  return ['draftkings', 'fanduel', 'betmgm'].flatMap((book, i) => ['over', 'under'].map(side => ({
    gameId: 'DAL-PHI', kickoff, selection: { market: 'prop', key: 'player_reception_yds', side, line: lines[i], playerId: PLAYER, playerName: 'Fixture Receiver', unit: 'yards' },
    provider: 'the-odds-api', providerEventId: 'evt-fixture', book, source: book, odds: -110, observedAt, capturedAt: observedAt })));
}

async function setup(t, { flag = 'on', ready = true, schema = true, quotes = true } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) if (schema || (file !== MIGRATION && !DEPENDENTS.includes(file))) await db.exec(migrationSql(file));
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
  const calls = [], providerHosts = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url), name = u.pathname.split('/').at(-1);
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
        order by started_at desc,request_id desc limit 20`, [Number(q.season), Number(q.week), q.game_id, q.status, q.started_at]);
      return Response.json(rows);
    }
    throw new Error(`Unexpected private read ${name}`);
  };
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'fixture', serviceRoleKey: 'fixture', fetchImpl });
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
    for (const action of ['read', 'draft', 'lock', 'history']) {
      const r = await f.call(action, action === 'read' ? { season: 2026, week: 10 } : save(72.5));
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
