import test from 'node:test';
import assert from 'node:assert/strict';
import { T, historyCsv, seasonCsv, registry, venues, corrections } from './trends-fixture.mjs';
const input = { historyCsv, seasonCsv, season: 2026, week: 6, registry, venues, corrections, allowPending: true };
test('weekly windows use the registered side; entities retain both orientations', () => {
 const result = T.generateWeek({ ...input, includeWindows: true });
 const card = Object.values(result.cards).find(c => c.sideRule === 'B');
 assert.ok(card.windows, 'opt-in windows are present');
 assert.equal(card.windows.all.W, card.record.W);
 assert.equal(card.windows.all.L, card.record.L);
 assert.equal(card.windows.last5.n, 5);
 assert.equal(card.windows.last10.n, 10);
 const entity = Object.values(result.rows).find(r => r.market === 'team_ats' && !r.registered);
 assert.equal(entity.windows.all.A.W, entity.split[0]);
 assert.equal(entity.windows.all.B.W, entity.split[1]);
 assert.equal(entity.windows.all.A.P, entity.windows.all.B.P);
 const registered = Object.values(result.rows).find(r => r.registered);
 assert.equal(registered.windows.all.A.W, registered.split[0]);
 assert.equal(registered.windows.all.B.W, registered.split[1]);
 for (const c of Object.values(result.cards)) for (const w of Object.values(c.windows)) {
  assert.equal(w.n, w.W + w.L + w.P);
  assert.ok(w.from === null || w.from <= w.to);
 }
});

const cloudModule = () => import('../cloud/trends.mjs');
const viewer = { id: '10000000-0000-4000-8000-000000000001' };
const slate = () => ({ published: true, season: 2026, week: 6, games: [{ id: 'BUF-LV', kickoff: '2026-10-18T20:25:00Z', spread: { visible: false, value: 987654 }, total: { visible: false, value: 987655 } }] });
test('weekly hosted generation authorizes every read, scopes slate, and single-flights TTL refresh', async () => {
 const { createTrendsService, handleTrends } = await cloudModule();
 let now = Date.parse('2026-10-12T08:00:00Z'), fetches = 0, reads = 0, deny = false;
 const service = createTrendsService({ clock: () => now, rpc: async () => { reads++; if (deny) throw Object.assign(new Error('removed'), { status: 403 }); return slate(); },
  readSeason: async () => { fetches++; await new Promise(resolve => setTimeout(resolve, 5)); return seasonCsv; },
  seed: { ...input, sourceAsOf: '2026-10-12' } });
 const read = body => handleTrends({ route: '/trends/week', body: body ?? { season: 2026, week: 6 }, user: viewer, service });
 const [a, b] = await Promise.all([read(), read()]);
 assert.deepEqual(a,b); assert.equal(fetches,1); assert.equal(reads,2);
 assert.deepEqual(a.games.map(g => g.id), ['BUF-LV']);
 assert.ok(a.pending.some(p => p.team === 'BUF'));
 assert.ok(!JSON.stringify(a).includes('987654'));
 await read(); assert.equal(fetches,1);
 deny = true; await assert.rejects(read(), { status: 403 }); assert.equal(fetches,1);
 deny = false; now += 5 * 60_000 + 1; await read(); assert.equal(fetches,2);
 await assert.rejects(read({ season: 2026, week: 6, userId: viewer.id }), { status: 400 });
 await assert.rejects(read({ season: '2026', week: 6 }), { status: 400 });
});
test('unpublished week refuses without source work; failed refresh returns explicitly dated stale evidence', async () => {
 const { createTrendsService, handleTrends } = await cloudModule();
 let published = false, fetches = 0;
 const service = createTrendsService({ rpc: async () => ({ ...slate(), published }), clock: () => Date.parse('2026-10-12T08:00:00Z'),
  readSeason: async () => { fetches++; throw new Error('outage'); }, seed: { ...input, sourceAsOf: '2026-10-12' } });
 const read = () => handleTrends({ route: '/trends/week', body: { season: 2026, week: 6 }, user: viewer, service });
 await assert.rejects(read(), { status: 404 }); assert.equal(fetches,0);
 published = true;
 const result = await read();
 assert.equal(result.availability.stale,true);
 assert.equal(result.availability.sourceAsOf,'2026-10-12');
 assert.match(result.availability.reason,/seed/i);
});
test('live source cannot alter frozen finals or inject current/future lines or future results into evidence', async () => {
 const { prepareSeason } = await cloudModule();
 const { rows } = T.parseCsvRows(seasonCsv);
 const future = rows.map(r => Number(r.week) >= 6 ? { ...r, home_score: '99', away_score: '98', spread_line: '123456', total_line: '123457', temp: '123458', referee: 'SECRET' } : { ...r, spread_line: '8888' });
 const now = Date.parse('2026-10-12T08:00:00Z');
 const clean = prepareSeason({ sourceCsv: seasonCsv, seedCsv: seasonCsv, season: 2026, week: 6, now });
 const injected = prepareSeason({ sourceCsv: T.writeCompactCsv(future), seedCsv: seasonCsv, season: 2026, week: 6, now });
 assert.equal(clean, injected);
 const generated = T.generateWeek({ ...input, seasonCsv: injected, includeWindows: true });
 assert.ok(!JSON.stringify(generated).includes('123456'));
});
test('public reader bounds streams and passes no service headers to the permitted source', async () => {
 const { createSeasonReader, MAX_SOURCE_BYTES } = await cloudModule();
 let options;
 const reader = createSeasonReader({ fetchImpl: async (url, opts) => { assert.equal(url,T.TRENDS_SOURCE.url); options = opts; return new Response('x'.repeat(32), { headers: { 'content-length': String(MAX_SOURCE_BYTES + 1) } }); } });
 await assert.rejects(reader(), /size/i);
 assert.equal(options.headers, undefined);
 assert.equal(options.redirect, 'manual');
});


test('weekly route joins handler map and maps membership denial without leaking provider details', async () => {
 const { createCloudHandler, createSupabaseAdapter, ROUTE_METHODS } = await import('../cloud/handler.mjs');
 assert.deepEqual(ROUTE_METHODS['/trends/week'],['POST']);
 const user = { ...viewer, is_anonymous: false, emailConfirmed: true };
 const handler = createCloudHandler({ authenticate: async () => user, trends: { rpc: async () => { throw Object.assign(new Error('no membership'), { status: 403 }); }, week: async () => assert.fail('not authorized') } });
 const response = await handler(new Request('https://fixture.invalid/functions/v1/gtl-api/trends/week', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify({ season: 2026, week: 6 }) }));
 assert.equal(response.status,403);
 const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'anon', serviceRoleKey: 'private', fetchImpl: async () => Response.json({ message: 'GTL_COMMUNITY_MEMBER' }, { status: 400 }) });
 await assert.rejects(adapter.trends.rpc('gtl_read_lines',{}), { status: 403 });
});
async function loadersModule() {
 const { readFileSync } = await import('node:fs');
 const code = readFileSync(new URL('../web/src/trendsLoaders.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm,'');
 return import('data:text/javascript;base64,' + Buffer.from("const cloudEnabled=false,supabase=null,TREND_WEEKS={},WIND_TICK_MS=60000; const officialsApi=()=>{},windApi=()=>{},trendsApi=()=>{},weekKey=(s,w)=>s+'-'+w;\n" + code).toString('base64'));
}
test('hosted loader TTL, unavailable fallback and auth refusals keep the documented boundary', async () => {
 const { createTrendWeekLoader } = await loadersModule();
 let calls=0, loads=0, now=1000, status=0;
 const weekData={ season:2026,week:6,asOf:'2026-10-11',games:[] };
 const loader=createTrendWeekLoader({ cloud:true,now:()=>now, staticWeeks:{ '2026-6':async()=>{loads++;return {default:weekData};} },
  readHosted:async()=>{calls++; if(status)throw Object.assign(new Error('refused'),{status});return weekData;} });
 await Promise.all([loader.load(2026,6),loader.load(2026,6)]); assert.equal(calls,1);assert.equal(loads,0);
 // A week not loaded yet falls back to its dated static file; a loaded week keeps its last good result (tested below).
 loader.clear();now+=300001;status=503;const fallback=await loader.load(2026,6);assert.equal(fallback.availability.stale,true);assert.equal(fallback.availability.sourceAsOf,'2026-10-11');assert.equal(loads,1);
 for(const denial of [400,401,403]){ loader.clear();status=denial;await assert.rejects(loader.load(2026,6),{status:denial});assert.equal(loads,1); }
 loader.clear();status=0;await loader.load(2026,6);assert.equal(calls,6);
});



test('published other seasons fail explicitly and overdue source finals remain pending and stale', async () => {
 const { createTrendsService } = await cloudModule();
 let fetches=0;
 const service=createTrendsService({ clock:()=>Date.parse('2026-10-15T08:00:00Z'),readSeason:async()=>{fetches++;return seasonCsv;},seed:{...input,sourceAsOf:'2026-10-12'} });
 await assert.rejects(service.week({...slate(),season:2027}),{status:503});assert.equal(fetches,0);
 const result=await service.week(slate());
 assert.equal(result.availability.stale,true);assert.match(result.availability.reason,/pending|overdue/i);
 assert.ok(result.availability.sourceAgeMs>=0);
});
test('published kickoff drives target game facts and stale refresh retains dated public output', async () => {
 const { createTrendsService } = await cloudModule();let now=Date.parse('2026-10-12T08:00:00Z'),fail=false;
 const service=createTrendsService({clock:()=>now,readSeason:async()=>{if(fail)throw new Error('outage');return seasonCsv;},seed:{...input,sourceAsOf:'2026-10-12'}});
 const published=slate();published.games[0].kickoff='2026-10-19T00:20:00Z';
 const first=await service.week(published);assert.equal(first.games[0].flags.day,'SNF');
 now+=300001;fail=true;const stale=await service.week(published);
 assert.equal(stale.availability.stale,true);assert.equal(stale.availability.generatedAt,first.availability.generatedAt);
 assert.equal(stale.availability.sourceAsOf,first.availability.sourceAsOf);
 assert.ok(stale.availability.sourceAgeMs>first.availability.sourceAgeMs);
});

test('auth epoch clears an in-flight week before a new account reads it', async () => {
 const { createTrendWeekLoader } = await loadersModule();
 let calls = 0, staticLoads = 0, oldResolve, newResolve;
 const loader = createTrendWeekLoader({ cloud: true, now: () => 1000,
  staticWeeks: { '2026-6': async () => { staticLoads++; return { default: {} }; } },
  readHosted: () => new Promise(resolve => { if (++calls === 1) oldResolve = resolve; else newResolve = resolve; }) });
 const oldRead = loader.load(2026, 6);
 await Promise.resolve();
 loader.clear();
 const newRead = loader.load(2026, 6);
 await Promise.resolve();
 const currentWeek = { season: 2026, week: 6, marker: 'current account' };
 newResolve(currentWeek);
 assert.equal(await newRead, currentWeek);
 const refused = assert.rejects(oldRead, { status: 401 });
 oldResolve({ season: 2026, week: 6, marker: 'previous account' });
 await refused;
 assert.equal(await loader.load(2026, 6), currentWeek);
 assert.equal(calls, 2);
 assert.equal(staticLoads, 0);
});

test('same-account auth events keep an in-flight read; another account or signing out still refuses it', async () => {
 const { createTrendWeekLoader, watchTrendAccount } = await loadersModule();
 const reads = [], hosted = { season: 2026, week: 8, games: [] }, same = { user: { id: 'a' } };
 const loader = createTrendWeekLoader({ cloud: true, now: () => 1000, staticWeeks: {}, readHosted: () => new Promise(resolve => reads.push(resolve)) });
 const auth = watchTrendAccount(loader.clear);
 // A phone reopened after an hour: the visible tab starts a fresh read while auth-js restores and refreshes the session.
 const read = loader.load(2026, 8, { fresh: true });
 await Promise.resolve();
 auth('INITIAL_SESSION', same); auth('TOKEN_REFRESHED', same); auth('SIGNED_IN', same);
 reads[0](hosted);
 assert.equal(await read, hosted);
 for (const [event, session] of [['SIGNED_IN', { user: { id: 'b' } }], ['SIGNED_OUT', null]]) {
  const next = loader.load(2026, 8, { retry: true });
  await Promise.resolve();
  auth(event, session);
  const refused = assert.rejects(next, { status: 401 });
  reads.at(-1)({ ...hosted, marker: 'previous account' });
  await refused;
 }
 assert.equal(reads.length, 3);
});

test('a failed hosted refresh keeps the last loaded week, dated and stale, and retries within a minute', async () => {
 const { createTrendWeekLoader } = await loadersModule();
 let calls = 0, now = 1000, failure = null;
 const hosted = { season: 2026, week: 8, games: [{ id: 'g' }], availability: { generatedAt: '2026-10-20T08:00:00Z', sourceAsOf: '2026-10-19', stale: false, sourceAgeMs: 1000, evidencePolicy: 'Hosted fixture' } };
 const loader = createTrendWeekLoader({ cloud: true, now: () => now, staticWeeks: {}, readHosted: async () => { calls++; if (failure) throw failure; return hosted; } });
 assert.equal(await loader.load(2026, 8), hosted);
 // Week 8 has no static file: before the fix this refresh resolved null and showed "available when the week opens".
 now += 300001; failure = new TypeError('Failed to fetch');
 const kept = await loader.load(2026, 8);
 assert.deepEqual(kept.games, hosted.games);
 assert.equal(kept.availability.stale, true);
 assert.match(kept.availability.reason, /last loaded evidence/);
 assert.equal(kept.availability.generatedAt, hosted.availability.generatedAt);
 assert.equal(kept.availability.sourceAsOf, '2026-10-19');
 assert.equal(kept.availability.sourceAgeMs, 1000 + 300001);
 assert.equal(hosted.availability.stale, false);
 now += 60001; failure = Object.assign(new Error('gateway'), { status: 546 });
 const still = await loader.load(2026, 8, { fresh: true });
 assert.equal(still.availability.stale, true);
 assert.equal(still.availability.sourceAgeMs, 1000 + 300001 + 60001);
 assert.equal(calls, 3);
 // Back online: the stale copy is reused for under a minute, then the next read replaces it.
 failure = null; now += 1000;
 assert.equal(await loader.load(2026, 8), still);
 assert.equal(calls, 3);
 now += 60001;
 assert.equal(await loader.load(2026, 8), hosted);
 assert.equal(calls, 4);
 // An account or membership refusal never serves the last loaded week.
 now += 300001; failure = Object.assign(new Error('not a member'), { status: 403 });
 await assert.rejects(loader.load(2026, 8), { status: 403 });
 // A week never loaded, with no static file, resolves null for at most a minute.
 failure = new TypeError('Failed to fetch');
 assert.equal(await loader.load(2026, 9), null);
 failure = null; now += 1000;
 assert.equal(await loader.load(2026, 9), null);
 now += 60001;
 assert.equal(await loader.load(2026, 9), hosted);
 assert.equal(calls, 7);
});

async function weekHookModule() {
 const { readFileSync } = await import('node:fs');
 const code = readFileSync(new URL('../web/src/trendsWeekHook.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm,'');
 const stubs = "const S=()=>globalThis.__trendHookStubs; const useCallback=f=>f,useEffect=f=>S().useEffect(f),useState=v=>S().useState(v),firstTrendWeek=()=>null,loadTrendWeek=(...a)=>S().loadTrendWeek(...a),weekKey=(s,w)=>s+'-'+w,setInterval=f=>S().setInterval(f),clearInterval=()=>{}; const document={ get visibilityState(){ return 'visible'; }, addEventListener:(type,f)=>S().listen(type,f), removeEventListener:()=>{} };\n";
 return import('data:text/javascript;base64,' + Buffer.from(stubs + code).toString('base64'));
}
test('the week hook keeps a ready week through a background refresh that finds nothing or fails', async () => {
 const { useTrendWeek, settleTrendWeek } = await weekHookModule();
 const week = { season: 2026, week: 8, games: [] }, results = [];
 let state = null, slot = 0, effect, show, tick;
 globalThis.__trendHookStubs = {
  useEffect: f => { effect = f; },
  useState: () => slot++ % 2 ? [0, () => {}] : [state, next => { state = typeof next === 'function' ? next(state) : next; }],
  loadTrendWeek: () => results.shift(),
  setInterval: f => { tick = f; return 1; },
  listen: (type, f) => { if (type === 'visibilitychange') show = f; },
 };
 const settled = () => new Promise(resolve => setImmediate(resolve));
 try {
  results.push(Promise.resolve(week));
  useTrendWeek(2026, 8, true, 'a');
  const stop = effect();
  await settled();
  assert.deepEqual(state, { key: '2026-8:a', status: 'ready', week });
  results.push(Promise.resolve(null)); show(); await settled();
  assert.deepEqual(state, { key: '2026-8:a', status: 'ready', week });
  results.push(Promise.reject(new TypeError('Failed to fetch'))); tick(); await settled();
  assert.deepEqual(state, { key: '2026-8:a', status: 'ready', week });
  results.push(Promise.reject(Object.assign(new Error('Account changed. Reload trends.'), { status: 401 }))); show(); await settled();
  assert.deepEqual(state, { key: '2026-8:a', status: 'error', week: null });
  stop();
 } finally { delete globalThis.__trendHookStubs; }
 // A first read or retry, and a different week or scope, still report what they find.
 const ready = { key: '2026-8:a', status: 'ready', week };
 assert.equal(settleTrendWeek(ready, '2026-8:a', { ok: true, data: null }).status, 'missing');
 assert.equal(settleTrendWeek(ready, '2026-8:a', { ok: false, error: { status: 503 } }).status, 'error');
 assert.equal(settleTrendWeek(ready, '2026-8:b', { ok: true, data: null }, true).status, 'missing');
 for (const status of [400, 403]) assert.equal(settleTrendWeek(ready, '2026-8:a', { ok: false, error: { status } }, true).status, 'error');
});

test('public reader follows only bounded HTTPS GitHub asset redirects without credentials', async () => {
 const { createSeasonReader } = await cloudModule();
 const calls = [];
 const asset = 'https://release-assets.githubusercontent.com/github-production-release-asset/fixture/games.csv';
 const reader = createSeasonReader({ fetchImpl: async (url, options) => {
  calls.push({ url, options });
  return calls.length === 1 ? new Response(null, { status: 302, headers: { location: asset } }) : new Response('public csv');
 } });
 assert.equal(await reader(), 'public csv');
 assert.deepEqual(calls.map(c => c.url), [T.TRENDS_SOURCE.url, asset]);
 for (const { options } of calls) {
  assert.equal(options.redirect, 'manual');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers, undefined);
  assert.equal(options.signal, calls[0].options.signal);
 }
});
test('public reader refuses unapproved redirect destinations and redirect loops', async () => {
 const { createSeasonReader } = await cloudModule();
 for (const location of ['https://example.invalid/games.csv', 'http://release-assets.githubusercontent.com/x', 'https://user:pass@release-assets.githubusercontent.com/x', 'https://release-assets.githubusercontent.com:444/x']) {
  let calls = 0;
  const reader = createSeasonReader({ fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location } }); } });
  await assert.rejects(reader(), /redirect/i);
  assert.equal(calls, 1);
 }
 let calls = 0;
 const reader = createSeasonReader({ fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: T.TRENDS_SOURCE.url } }); } });
 await assert.rejects(reader(), /redirect/i);
 assert.equal(calls, 4, 'initial request plus at most three followed redirects');
});
test('public reader keeps the streaming byte cap after an allowed redirect', async () => {
 const { createSeasonReader, MAX_SOURCE_BYTES } = await cloudModule();
 let calls = 0, canceled = false;
 const reader = createSeasonReader({ fetchImpl: async () => ++calls === 1
  ? new Response(null, { status: 307, headers: { location: 'https://release-assets.githubusercontent.com/fixture' } })
  : new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(MAX_SOURCE_BYTES)); }, cancel() { canceled = true; } }))
 });
 await assert.rejects(reader(), /size/i);
 assert.equal(canceled, true);
});
