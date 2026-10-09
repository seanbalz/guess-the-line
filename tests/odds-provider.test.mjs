import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { seed } from '../server/store.mjs';
import { createOddsProvider, DEFAULT_ODDS_BOOKS } from '../cloud/odds-provider.mjs';
const NOW=Date.parse('2026-10-08T20:00:00Z'), STAMP='2026-10-08T19:59:00Z';
const KEY='private-fixture-key-never-log';
const slate=seed().games;
// Synthetic fixture lines/prices only. These are not current sportsbook evidence.
function events(games=slate) {
  return games.map((g,i)=>({id:`event_${i}`,sport_key:'americanfootball_nfl',home_team:g.home,away_team:g.away,commence_time:g.kickoff}));
}
function prices(es=events()) {
  return es.map(event=>({...event,bookmakers:DEFAULT_ODDS_BOOKS.map(key=>({key,title:'Untrusted title must not propagate',last_update:'2026-10-08T19:58:00Z',markets:[
    {key:'spreads',last_update:STAMP,outcomes:[{name:event.away_team,point:3.5,price:-105},{name:event.home_team,point:-3.5,price:-115}]},
    {key:'totals',last_update:STAMP,outcomes:[{name:'Under',point:45,price:-110},{name:'Over',point:45,price:-110}]},
    {key:'h2h',last_update:STAMP,outcomes:[{name:event.home_team,price:-180},{name:event.away_team,price:150}]},
  ]}))}));
}
const response=(data,last=2,remaining=498)=>Response.json(data,{headers:{'x-requests-remaining':String(remaining),'x-requests-used':String(500-remaining),'x-requests-last':String(last)}});
function mock({preflight=events(),odds=prices(),clock=()=>NOW,fetchOverride,books,timeoutMs}={}) {
  const requests=[];
  const provider=createOddsProvider({apiKey:KEY,clock,bookmakers:books,timeoutMs,fetchImpl:async(url,options)=>{
    requests.push({url:new URL(url),options});
    if(fetchOverride)return fetchOverride(url,options,requests.length);
    return url.pathname.endsWith('/events')?response(preflight,0,500):response(odds);
  }});
  return {provider,requests,collect:(options={})=>provider.collect({games:slate,remainingCredits:500,...options})};
}

test('one free preflight then one bounded NFL spreads+totals US request for all exact event IDs',async()=>{
  const app=mock(),result=await app.collect();
  assert.equal(app.requests.length,2);
  const [preflight,odds]=app.requests;
  assert.equal(preflight.url.pathname,'/v4/sports/americanfootball_nfl/events');
  assert.equal(odds.url.pathname,'/v4/sports/americanfootball_nfl/odds');
  assert.equal(odds.url.searchParams.get('regions'),'us');
  assert.equal(odds.url.searchParams.get('markets'),'spreads,totals');
  assert.equal(odds.url.searchParams.get('bookmakers'),'draftkings,fanduel,betmgm');
  assert.equal(odds.url.searchParams.get('oddsFormat'),'american');
  assert.equal(odds.url.searchParams.get('dateFormat'),'iso');
  assert.equal(odds.url.searchParams.get('eventIds').split(',').length,15);
  assert(app.requests.every(r=>r.options.redirect==='error'&&r.options.credentials==='omit'&&r.options.signal instanceof AbortSignal));
  assert.equal(result.status,'available');assert.equal(result.games.length,15);
  assert.deepEqual(result.quota,{remaining:498,used:2,last:2,estimatedMaxCost:2,conservativeRemaining:498});
  assert.equal(result.officialVerified,false);assert.equal(result.verification.status,'not_verified');
  assert.equal(result.model,null);assert.equal(result.expectedValue,null);
  assert.equal(JSON.stringify(result).includes(KEY),false);assert.equal(JSON.stringify(result).includes('h2h'),false);
  assert.equal(JSON.stringify(result).includes('Untrusted title'),false);
});

test('normalizes signed home spread and paired prices, total and separate provider observation/collection timestamps',async()=>{
  const result=await mock().collect(), game=result.games[0];
  const spread=game.markets.spread.quotes[0],total=game.markets.total.quotes[0];
  assert.equal(spread.value,-3.5);
  assert.deepEqual(spread.outcomes,{home:{line:-3.5,odds:-115},away:{line:3.5,odds:-105}});
  assert.equal(total.value,45);assert.deepEqual(total.outcomes,{over:{line:45,odds:-110},under:{line:45,odds:-110}});
  assert.equal(spread.providerObservedAt,'2026-10-08T19:59:00.000Z');
  assert.equal(spread.collectedAt,'2026-10-08T20:00:00.000Z');
  assert.equal(spread.bookmakerUpdatedAt,'2026-10-08T19:58:00.000Z');
  assert.equal(spread.timeBasis,'provider_market_last_update');assert.equal(spread.tradability,'not_confirmed');
});

test('event order is irrelevant and exact matching never remaps a team, kickoff or changed provider ID',async()=>{
  const preflight=events().reverse(),odds=prices().reverse();
  const shifted=structuredClone(preflight);shifted.find(e=>e.id==='event_0').commence_time='2026-10-09T00:20:00Z';
  const a=mock({preflight:shifted,odds}),result=await a.collect();
  assert.equal(result.games[0].matchStatus,'schedule_mismatch');assert.equal(result.games[0].markets.spread.quotes.length,0);
  assert.equal(result.games[1].providerEventId,'event_1');
  assert(!a.requests[1].url.searchParams.get('eventIds').split(',').includes('event_0'));
  const reversed=events();[reversed[0].home_team,reversed[0].away_team]=[reversed[0].away_team,reversed[0].home_team];
  assert.equal((await mock({preflight:reversed}).collect()).games[0].matchStatus,'schedule_mismatch');
  const changed=prices();changed[0].id='changed_event';
  assert.equal((await mock({odds:changed}).collect()).games[0].matchStatus,'event_id_changed');
});

test('unavailable slate uses no odds credits; duplicate IDs or repeated matchup events fail closed',async()=>{
  const missing=mock({preflight:[]}),out=await missing.collect();
  assert.equal(missing.requests.length,1);assert.equal(out.quota.estimatedMaxCost,0);assert.equal(out.status,'unavailable');
  assert(out.games.every(g=>g.matchStatus==='event_missing'));
  const duplicate=events();duplicate.push({...duplicate[0],id:'other_id'});
  assert.equal((await mock({preflight:duplicate}).collect()).games[0].matchStatus,'ambiguous_event');
  const duplicateId=events();duplicateId[1].id=duplicateId[0].id;
  const result=await mock({preflight:duplicateId}).collect();
  assert.equal(result.games[0].matchStatus,'ambiguous_event');assert.equal(result.games[1].matchStatus,'ambiguous_event');
});

test('kickoff is exclusive: at or after kickoff neither preflight nor returned odds can be accepted',async()=>{
  const kickoff=Date.parse(slate[0].kickoff);
  const app=mock({clock:()=>kickoff}),result=await app.collect();
  assert.equal(result.games[0].matchStatus,'kickoff_passed');assert.equal(result.games[0].markets.spread.quotes.length,0);
  assert(!app.requests[1].url.searchParams.get('eventIds').split(',').includes('event_0'));
  let current=NOW;
  const race=mock({clock:()=>current,fetchOverride:(_url,_options,count)=>{
    if(count===2)current=kickoff;
    return count===1?response(events(),0,500):response(prices());
  }});
  assert.equal((await race.collect()).games[0].matchStatus,'kickoff_passed');
});

test('requires current market timestamp, never substitutes deprecated book timestamp, independently by market',async()=>{
  for(const [timestamp,reason] of [[undefined,'market_timestamp_missing'],['broken','market_timestamp_missing'],['2026-10-08T20:01:00Z','invalid_market_timestamp'],['2026-10-08T19:54:59Z','stale_market']]) {
    const odds=prices();odds[0].bookmakers[0].markets[0].last_update=timestamp;
    const game=(await mock({odds}).collect()).games[0];
    assert.equal(game.markets.spread.quotes.length,2);assert.equal(game.markets.spread.unavailable[0].reason,reason);
    assert.equal(game.markets.total.quotes.length,3);
  }
  const old=prices();for(const b of old[0].bookmakers)b.markets[0].last_update='2026-10-08T18:00:00Z';
  assert.equal((await mock({odds:old}).collect()).games[0].markets.spread.status,'stale');
});

test('duplicates, missing books and malformed paired outcomes cannot count as independent usable quotes',async()=>{
  const cases=[
    [b=>b.markets[0].outcomes.pop(),'invalid_outcomes'],
    [b=>b.markets[0].outcomes[0].point=4,'unpaired_outcomes'],
    [b=>b.markets[0].outcomes[0].price='-110','invalid_outcomes'],
    [b=>b.markets[0].outcomes[0].price=-99,'invalid_outcomes'],
    [b=>b.markets[0].outcomes[0].point=3.25,'invalid_outcomes'],
    [b=>b.markets[0].outcomes[0].name='Bucs','unpaired_outcomes'],
    [b=>b.markets.push(structuredClone(b.markets[0])),'ambiguous_market'],
  ];
  for(const [change,reason] of cases) {
    const odds=prices();change(odds[0].bookmakers[0]);
    assert.equal((await mock({odds}).collect()).games[0].markets.spread.unavailable[0].reason,reason);
  }
  const odds=prices();odds[0].bookmakers.push(structuredClone(odds[0].bookmakers[0]));odds[0].bookmakers=odds[0].bookmakers.filter(b=>b.key!=='fanduel');
  const result=(await mock({odds}).collect()).games[0].markets.spread;
  assert.equal(result.quotes.length,1);assert.deepEqual(result.unavailable.map(b=>b.reason),['ambiguous_book','book_missing']);
  const totals=prices();totals[0].bookmakers[0].markets[1].outcomes[0].point=46;
  assert.equal((await mock({odds:totals}).collect()).games[0].markets.total.unavailable[0].reason,'unpaired_outcomes');
});

test('quota reserve, response headers and conservative instance accounting block excess collection without retries',async()=>{
  const app=mock();
  await assert.rejects(()=>app.collect({remainingCredits:null}),e=>e.code==='ODDS_BUDGET');
  await assert.rejects(()=>app.collect({remainingCredits:51}),e=>e.code==='ODDS_BUDGET');
  assert.equal(app.requests.length,0);
  const low=mock({fetchOverride:()=>response(events(),0,51)});
  await assert.rejects(()=>low.collect(),e=>e.code==='ODDS_BUDGET');assert.equal(low.requests.length,1);
  const exact=mock({fetchOverride:(_url,_o,n)=>n===1?response(events(),0,52):response(prices(),2,50)});
  await exact.collect({remainingCredits:52});
  await assert.rejects(()=>exact.collect({remainingCredits:500}),e=>e.code==='ODDS_BUDGET');assert.equal(exact.requests.length,2);
  const cost=mock({fetchOverride:(_url,_o,n)=>n===1?response(events(),0,500):response(prices(),4,496)});
  await assert.rejects(()=>cost.collect(),e=>e.code==='ODDS_QUOTA_COST'&&e.quota.last===4);
  await assert.rejects(()=>cost.collect(),e=>e.code==='ODDS_BUDGET');assert.equal(cost.requests.length,2);
});

test('one provider instance rejects overlap; quota is never treated as a cross-instance lock',async()=>{
  let release;const blocked=new Promise(resolve=>release=resolve);
  const app=mock({fetchOverride:async(_u,_o,n)=>{if(n===1)await blocked;return n===1?response(events(),0,500):response(prices());}});
  const first=app.collect();
  await assert.rejects(()=>app.collect(),e=>e.code==='ODDS_BUSY');release();await first;
  assert.equal(app.requests.length,2);
});

test('authentication, rate limits, redirects and network errors cannot leak key, URL or provider body',async()=>{
  for(const status of [401,403,429,500,302]) {
    const app=mock({fetchOverride:()=>Response.json({error:`${KEY} https://secret.invalid/?apiKey=${KEY}`},{status})});
    await assert.rejects(()=>app.collect(),e=>!`${e.message}${JSON.stringify(e)}`.includes(KEY)&&!e.message.includes('https://'));
    assert.equal(app.requests.length,1);
  }
  const thrown=mock({fetchOverride:()=>{throw new Error(`https://api.the-odds-api.com?apiKey=${KEY}`);}});
  await assert.rejects(()=>thrown.collect(),e=>e.code==='ODDS_UNAVAILABLE'&&!e.message.includes(KEY)&&e.cause===undefined);
});

test('bounded transport rejects oversized actual/declaration bodies, malformed JSON, bad encoding and stalled network',async()=>{
  for(const make of [
    ()=>new Response('[]',{headers:{'content-type':'application/json','content-length':'1048577'}}),
    ()=>new Response(' '.repeat(1048577),{headers:{'content-type':'application/json'}}),
    ()=>new Response('{broken',{headers:{'content-type':'application/json'}}),
    ()=>new Response(new Uint8Array([0xff,0xfe]),{headers:{'content-type':'application/json'}}),
    ()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),
    ()=>response(Array.from({length:65},()=>({})),0,500),
  ]) await assert.rejects(()=>mock({fetchOverride:make}).collect(),e=>['ODDS_PAYLOAD','ODDS_BODY_LIMIT'].includes(e.code));
  const stalled=mock({timeoutMs:10,fetchOverride:()=>new Promise(()=>{})});
  await assert.rejects(()=>stalled.collect(),e=>e.code==='ODDS_TIMEOUT');
});

test('invalid configuration, unsupported books and ambiguous local schedules make no requests or pick mutations',async()=>{
  let calls=0;
  for(const bookmakers of [[],['draftkings','draftkings'],['williamhill_us'],['pinnacle'],Array(11).fill('draftkings')]) {
    assert.throws(()=>createOddsProvider({apiKey:KEY,bookmakers,fetchImpl:()=>{calls++;}}),e=>e.code==='ODDS_CONFIG');
  }
  const file='data/picks/2026-week-05.json',before=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const games=structuredClone(slate),original=structuredClone(games),app=mock();
  await app.collect({games});assert.deepEqual(games,original);
  await assert.rejects(()=>app.collect({games:[...games,games[0]]}),e=>e.code==='ODDS_SLATE');
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before);assert.equal(calls,0);
});

test('free standalone preflight accepts no quota assumption and emits no quote values',async()=>{
  const app=mock();const result=await app.provider.preflight({games:slate});
  assert.equal(app.requests.length,1);assert.equal(result.quota.last,0);assert.equal(result.games[0].matchStatus,'matched');
  assert.equal(result.officialVerified,false);assert.equal(JSON.stringify(result).includes('outcomes'),false);assert.equal(result.games[0].markets,undefined);
});

test('malformed, oversized and stalled bodies retain observed quota without exposing provider details',async()=>{
  const headers={'content-type':'application/json','x-requests-remaining':'42','x-requests-used':'458','x-requests-last':'2'};
  for(const responseFactory of [
    ()=>new Response('{broken',{headers}),
    ()=>new Response('x'.repeat(1048577),{headers}),
    ()=>new Response(new ReadableStream({start(){}}),{headers}),
  ]) {
    const app=mock({timeoutMs:10,fetchOverride:(_u,_o,n)=>n===1?response(events(),0,500):responseFactory()});
    await assert.rejects(()=>app.collect(),e=>e.quota?.remaining===42&&e.quota?.last===2&&!e.message.includes(KEY));
    await assert.rejects(()=>app.collect(),e=>e.code==='ODDS_BUDGET');
  }
  const odd=mock({fetchOverride:(_u,_o,n)=>n===1?response(events(),0,500):new Response('{broken',{headers:{...headers,'x-requests-last':'6','x-requests-remaining':'494'}})});
  await assert.rejects(()=>odd.collect(),e=>e.code==='ODDS_QUOTA_COST'&&e.quota.last===6);
  await assert.rejects(()=>odd.collect(),e=>e.code==='ODDS_BUDGET');
});

test('preflight and collection query filters use documented whole-second UTC without relaxing identity precision',async()=>{
  const app=mock();await app.provider.preflight({games:slate});await app.collect();
  for(const request of app.requests.filter(r=>r.url.pathname.endsWith('/events'))) {
    assert.equal(request.url.searchParams.get('commenceTimeFrom'),'2026-10-08T00:15:00Z');
    assert.equal(request.url.searchParams.get('commenceTimeTo'),'2026-10-14T00:15:00Z');
    assert.match(request.url.searchParams.get('commenceTimeFrom'),/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  const preflight=events();preflight[0].commence_time=slate[0].kickoff.replace('00Z','00.001Z');
  const mismatch=await mock({preflight}).collect();assert.equal(mismatch.games[0].matchStatus,'schedule_mismatch');
});

test('provider HTTP diagnostics allowlist only numeric status and known code; never propagate error message or URL',async()=>{
  for(const [code,expected] of [['INVALID_COMMENCE_TIME_FROM','INVALID_COMMENCE_TIME_FROM'],[`SECRET ${KEY}`,null]]) {
    const app=mock({fetchOverride:()=>Response.json({error_code:code,message:`https://provider.invalid/?apiKey=${KEY}`,details_url:`https://secret.invalid/${KEY}`},{status:400,headers:{'x-requests-remaining':'500','x-requests-used':'0','x-requests-last':'0'}})});
    await assert.rejects(()=>app.provider.preflight({games:slate}),e=>{
      assert.equal(e.code,'ODDS_UNAVAILABLE');assert.deepEqual(e.diagnostic,{httpStatus:400,code:expected});
      assert.deepEqual(e.quota,{remaining:500,used:0,last:0});assert.equal(JSON.stringify(e).includes(KEY),false);assert.equal(JSON.stringify(e).includes('https://'),false);return true;
    });
  }
  const huge=mock({fetchOverride:()=>Response.json({error_code:'INVALID_COMMENCE_TIME_TO',padding:KEY.repeat(500)},{status:400})});
  await assert.rejects(()=>huge.collect(),e=>e.diagnostic.httpStatus===400&&e.diagnostic.code===null&&!JSON.stringify(e).includes(KEY));
});
