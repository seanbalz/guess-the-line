// Main's approved Bets landing contracts (#495) on D-69 step 4's landing: its "Your tracked bets", "Tickets" and
// "Recommended" cards now live as the My bets and Recommended tiles (betsModel.js myBetsTile, recommendedTile), and the
// ticket lists, Overview and Add bet are My bets' own controls. Contracts kept: owner-only performance (virtual, foreign
// and excluded returns never count; an unknown return is "—"), every live destination reachable with no write, loading /
// failure / empty / unknown kept apart, the summary fresh right after a save, the saved correction history, the singular
// ticket count, the teaser's permitted research only (never a sample matchup while loading, failed or locked), and one
// account's tickets never shown to the next. Local PGlite only.
import { fixture as assessmentFixture } from '../fixtures/research-assessments.mjs';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { TEAM_NAMES } from '../../shared/nfl-schedule.mjs';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {SUPABASE,communityWorld,pgliteAvailable,signIn,sendBallot,storeBookLines,ACCOUNTS} from './community-world.mjs';

test.use({viewport:{width:390,height:844}});test.setTimeout(60000);
test.beforeEach(()=>test.skip(!pgliteAvailable,'PGlite required; no hosted data.'));
const tab=(page,name)=>page.getByRole('navigation',{name:'Main'}).getByRole('button',{name,exact:true});
const tile=(page,key)=>page.locator(`#gx-b-tile-${key}`);
const heading=(page,name)=>page.getByRole('heading',{name,level:1,exact:true});
// Signed in once the landing draws, so a fresh document (openList) keeps the saved session.
async function login(page){await page.addInitScript(()=>{try{localStorage.setItem('gtl.app','next');}catch{/* about:blank */}});await page.goto('/#bets');await signIn(page,'luke',{navigate:false});await expect(page.locator('[data-landing="bets"] [data-bets="tiles"]')).toBeVisible({timeout:30000});}
/** A list by its own address, a fresh document (the session stays signed in). */
async function openList(page,hash){await page.goto('about:blank');await page.goto(`/${hash}`);}
async function capture(page,name,target=null){await page.mouse.move(0,0);if(target)await target.evaluate(el=>el.scrollIntoView({block:'start'}));else await page.evaluate(()=>scrollTo(0,0));for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`.local/prism-bets-landing/${name}-${theme}-390.png`});if(name==='landing')await page.screenshot({path:`.local/prism-bets-landing/${name}-full-${theme}-390.png`,fullPage:true});}}
async function seed(world,label,extra={},outcome=null,account='luke'){
 const {season,week}=world.state.league,game=world.state.games[0];
 let reply=await world.api(account,'social/read',{season,week});expect(reply.status).toBe(200);
 reply=await world.api(account,'social/create',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),kind:'single',legs:[{gameId:game.id,market:'prop',side:'Fixture Runner',line:30,selection:'Fixture Runner 30+ receiving yards'}],stakeUnits:1,odds:100,source:'Book A',notes:label,...extra});
 expect(reply.status,JSON.stringify(reply.body)).toBe(200);let entry=reply.body.entries.find(e=>e.notes===label);
 if(outcome){reply=await world.api(account,'social/settle',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),entryId:entry.id,revision:entry.revision,outcome,actualReturnUnits:null,reason:'Local fixture reported result'});expect(reply.status,JSON.stringify(reply.body)).toBe(200);entry=reply.body.entries.find(e=>e.id===entry.id);}
 if(label==='excluded'){reply=await world.api(account,'social/include',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),entryId:entry.id,revision:entry.revision,countsForRecord:false,reason:'Local fixture exclusion'});expect(reply.status).toBe(200);}
 return entry;
}

test('the My bets tile carries real owner-only performance and every live destination opens from a tile',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const game=world.state.games[0];
  await seed(world,'winner',{},'win');await seed(world,'parlay',{kind:'parlay',legs:[{gameId:game.id,market:'spread',side:'home',line:-3.5,selection:`${game.home} -3.5`},{gameId:game.id,market:'total',side:'over',line:44.5,selection:'Over 44.5'}],stakeUnits:.25,odds:400},'loss');
  await seed(world,'open',{stakeUnits:.5,odds:null,source:null});await seed(world,'excluded',{},'win');await seed(world,'FOREIGN SENTINEL',{stakeUnits:100},'win','troy');
  const calls=[];page.on('request',request=>{if(request.url().includes('/gtl-api/social/'))calls.push({path:request.url().split('/gtl-api/')[1],body:request.postDataJSON()});});
  await login(page);const landing=page.locator('[data-landing="bets"]'),mine=tile(page,'mybets');
  await expect(mine.locator('.gx-nest-num')).toHaveText('+0.75U');await expect(mine).toContainText('1 open · 2 settled');
  await expect(mine).toHaveAttribute('aria-label','My bets, +0.75U net, 1 open, 2 settled, 4 tracked tickets');
  await expect(landing).not.toContainText('FOREIGN SENTINEL');await expect(landing).not.toContainText('100U');
  for(const theme of ['light','dark'])for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await mine.locator('.gx-nest-num').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${theme} ${width}px net units fit their tile`).toBe(true);
   const scan=await new AxeBuilder({page}).include('[data-landing="bets"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});await capture(page,'landing');
  const before=(await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows;
  await mine.click();await expect(heading(page,'My bets')).toBeVisible();
  await page.getByRole('group',{name:'Tracked bets section',exact:true}).getByRole('button',{name:'Overview',exact:true}).click();
  await expect(page.getByRole('region',{name:'Tracked bets overview'}).locator('.gx-tc-big')).toHaveText('+0.75U');await capture(page,'full-overview',page.getByRole('region',{name:'Tracked bets overview'}));
  await openList(page,'#bets/active');await expect(page.locator('.gx-tracked-row')).toHaveCount(1);await page.locator('.gx-tracked-preview').click();await capture(page,'open-ticket',page.locator('.gx-tracked-row'));
  await openList(page,'#bets/settled');const parlay=page.getByRole('article',{name:'2-leg parlay · Lost',exact:true});await parlay.getByRole('button',{name:'Expand 2-leg parlay',exact:true}).click();await capture(page,'parlay-receipt',parlay);
  await page.getByRole('button',{name:'Add bet',exact:true}).click();const editor=page.getByRole('dialog',{name:'Add a tracked bet'});await expect(editor).toBeVisible();await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:game.id.replace('-',' @ '),exact:true}).click();await capture(page,'entry-selection');page.once('dialog',dialog=>dialog.accept());await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  for(const [key,name] of [['picks','Your picks'],['everyone','Everyone'],['gap','Your gap'],['recommended','Recommended']]){await tab(page,'Bets').click();await tile(page,key).click();await expect(heading(page,name)).toBeVisible();}
  expect(calls.filter(c=>!c.path.startsWith('social/read'))).toEqual([]);expect((await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows).toEqual(before);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('the My bets tile keeps loading, failure, empty and unknown returns apart and is fresh right after a save',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);let release;
 try{
  let pending=false;await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/social/read'),async route=>{pending=true;await new Promise(resolve=>release=resolve);await route.fulfill({status:503,json:{error:'Fixture landing unavailable'}});},{times:1});
  await login(page);const mine=tile(page,'mybets');await expect.poll(()=>pending).toBe(true);await expect(mine).toHaveAttribute('aria-label','My bets, loading');await expect(mine.locator('.gx-nest-num')).toHaveText('—');
  release();await expect(mine).toHaveAttribute('aria-label','My bets, could not load, open to retry');await expect(mine).toContainText('Open to retry');
  // Opening My bets reads again; back on the landing, an empty record is "—" (no settled return), never 0U.
  await mine.click();await expect(heading(page,'My bets')).toBeVisible();await tab(page,'Bets').click();
  await expect(mine.locator('.gx-nest-num')).toHaveText('—');await expect(mine).toContainText('0 open · 0 settled');
  await mine.click();await page.getByRole('button',{name:'Add bet',exact:true}).click();const editor=page.getByRole('dialog',{name:'Add a tracked bet'});const game=world.state.games[0];
  await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:game.id.replace('-',' @ '),exact:true}).click();await editor.getByRole('group',{name:'Team',exact:true}).getByRole('button',{name:TEAM_NAMES[game.id.split('-')[1]],exact:true}).click();await editor.getByRole('button',{name:'Favorite (−)',exact:true}).click();await editor.getByRole('group',{name:'Exact signed spread',exact:true}).getByRole('button',{name:'−3.5',exact:true}).click();await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();await expect(editor).toHaveCount(0);
  await tab(page,'Bets').click();await expect(mine).toContainText('1 open · 0 settled');await expect(mine.locator('.gx-nest-num')).toHaveText('—');await expect(mine).toHaveAttribute('aria-label',/1 tracked ticket$/);expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});

test('native correction keeps full before and after history with the approved numbered composition',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  await seed(world,'Original fixture note',{stakeUnits:.5,odds:null,source:null});
  await login(page);await openList(page,'#bets/active');const row=page.locator('.gx-tracked-row');await row.locator('.gx-tracked-preview').click();await expect(row.getByRole('region',{name:'Ticket change history'})).toBeVisible();await row.getByRole('button',{name:'Correct ticket',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Correct saved bet'});await editor.getByRole('group',{name:'American odds',exact:true}).getByRole('button',{name:'−110',exact:true}).click();await editor.getByRole('group',{name:'Sportsbook / quote source',exact:true}).getByRole('button',{name:'DraftKings',exact:true}).click();await editor.getByLabel('Ticket notes (optional)',{exact:true}).fill('Corrected fixture note');await editor.getByLabel('Quote observed (your local time)').fill('2026-11-04T10:00');await editor.getByLabel('Bet placed (your local time)').fill('2026-11-04T10:05');await editor.getByLabel('Reason for correction',{exact:true}).fill('Actual fixture ticket correction');
  await editor.getByRole('group',{name:'American odds',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await capture(page,'correction-terms');
  await editor.getByRole('button',{name:'Save correction',exact:true}).click();await expect(editor).toHaveCount(0);
  const history=page.getByRole('region',{name:'Ticket change history'});await expect(history).toContainText('Ticket correction');await expect(history).toContainText('Actual fixture ticket correction');await history.getByText('Review saved change',{exact:true}).click();
  for(const text of ['Source','Quote observed','Bet placed','Before: Not entered','After: DraftKings','Before: Original fixture note','After: Corrected fixture note'])await expect(history).toContainText(text);
  await capture(page,'saved-history',history);
  await history.getByText('Review saved change',{exact:true}).click();await capture(page,'receipt-actions-history',row.locator('.gx-tracked-money'));
  for(const theme of ['light','dark'])for(const width of [320,390]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const scan=await new AxeBuilder({page}).include('.gx-bets').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);}
  await page.emulateMedia({forcedColors:'active'});await expect(row.getByRole('button',{name:'Report result',exact:true})).toBeVisible();await expect(history).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.local/prism-bets-closeout/history-forced-320.png'});await page.emulateMedia({forcedColors:'none'});
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('active ticket header uses the singular only for one matching ticket',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  await login(page);
  const active=()=>openList(page,'#bets/active');
  const count=page.locator('.gx-ticket-tracker > .social-heading .social-help');
  await active();await expect(count).toHaveText('0 bets');await expect(page.locator('.gx-tracked-row')).toHaveCount(0);
  await seed(world,'First open fixture');await active();await expect(page.locator('.gx-tracked-row')).toHaveCount(1);await expect(count).toHaveText('1 bet');
  await seed(world,'Second open fixture');await active();await expect(page.locator('.gx-tracked-row')).toHaveCount(2);await expect(count).toHaveText('2 bets');
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('the Recommended tile names permitted retained research and opens its real controller',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL,{games:2,migrations:[...new Set([...HOSTED,'20261030204548_gtl_research_assessments.sql'])]});
 try{
  const lines=Object.fromEntries(world.state.games.map(g=>[g.id,-3])),totals=Object.fromEntries(world.state.games.map(g=>[g.id,45]));
  await storeBookLines(world,{spread:lines,total:totals});await sendBallot(world,'luke','guess_spread',lines);await sendBallot(world,'luke','guess_total',totals);
  const {snapshot}=assessmentFixture(),g=world.state.games[0],stamp=new Date(Date.now()-5000).toISOString();
  snapshot.season=world.state.league.season;snapshot.week=world.state.league.week;snapshot.generatedAt=stamp;
  snapshot.candidates[0].gameId=g.id;snapshot.candidates[0].kickoff=g.kickoff;snapshot.candidates[0].dependencies[0].gameId=g.id;
  for(const key of ['publishedAt','observedAt','asOf'])snapshot.candidates[0].evidence[0][key]=stamp;
  Object.assign(snapshot.quotes[0],{gameId:g.id,kickoff:g.kickoff,observedAt:stamp,capturedAt:stamp});
  await world.db.query("insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload) values($1,$2,$3,$4,$5,$6,1,'finished',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '80 seconds',$7)",[randomUUID(),randomUUID(),snapshot.season,snapshot.week,g.id,['player_reception_yds'],snapshot.quotes]);
  await world.db.query('insert into public.gtl_research_snapshots(id,season,week,payload) values($1,$2,$3,$4)',[randomUUID(),snapshot.season,snapshot.week,snapshot]);
  const calls=[];page.on('request',r=>{if(r.url().includes('/gtl-api/'))calls.push(r.url().split('/gtl-api/')[1]);});
  await login(page);const rec=tile(page,'recommended');
  await expect(rec.locator('.gx-team')).toHaveCount(2);await expect(rec).toContainText('Research lean');
  await expect(rec).toHaveAttribute('aria-label',/^Recommended, \d+ assessments? open to you, first .+ @ .+, Research lean$/);
  for(const theme of ['dark','light'])for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const scan=await new AxeBuilder({page}).include('[data-landing="bets"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
   await page.locator('[data-bets="tiles"]').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:`.local/prism-bets-closeout/tiles-recommendation-${theme}-${width}.png`});
  }
  await page.emulateMedia({forcedColors:'active'});await expect(rec.locator('.gx-team')).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.local/prism-bets-closeout/landing-forced-320.png'});await page.emulateMedia({forcedColors:'none'});
  // Main's Explore recommendations: the tile opens Recommended, where the teased matchup is a row (its real controller).
  await rec.click();await expect(heading(page,'Recommended')).toBeVisible();await expect(page.locator('[data-assessment="yellow"]').first()).toContainText('Research lean');
  expect(calls.filter(path=>/refresh|collect|fetch-quotes/.test(path))).toEqual([]);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('the Recommended tile never draws a sample matchup while loading, failed or locked',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);let release,fail=true;const gate=new Promise(resolve=>release=()=>{fail=false;resolve();});
 try{
  await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/lines/assessments'),async route=>{if(!fail)return route.fallback();await gate;await route.fulfill({status:503,json:{error:'Local unavailable research'}}).catch(()=>{});});
  await login(page);const rec=tile(page,'recommended');await expect(rec).toHaveAttribute('aria-label','Recommended, loading research assessments');await expect(rec.locator('.gx-team')).toHaveCount(0);
  release();await expect(rec).toHaveAttribute('aria-label','Recommended, research assessments not loaded');await expect(rec).toContainText('Not loaded');await expect(rec.locator('.gx-team')).toHaveCount(0);
  // Recommended reads again on its own screen; back on the landing the tile reads again: nothing locked in, so it says so.
  await rec.click();await expect(heading(page,'Recommended')).toBeVisible();await tab(page,'Bets').click();
  await expect(rec).toContainText('Lock in to see research');await expect(rec.locator('.gx-team')).toHaveCount(0);
  await rec.click();await expect(heading(page,'Recommended')).toBeVisible();expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});

test('the My bets tile stays isolated through an account change and a pending read',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);let release,held=false;
 try{
  const g=world.state.games[0],legs=selection=>[{gameId:g.id,market:'prop',side:'Fixture Runner',line:30,selection}];
  await seed(world,'Luke only',{legs:legs('LUKE ONLY TICKET')},'win');await seed(world,'Troy only',{stakeUnits:100,legs:legs('TROY ONLY TICKET')},'win','troy');
  await login(page);const mine=tile(page,'mybets');await expect(mine.locator('.gx-nest-num')).toHaveText('+1U');
  await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/social/read'),async route=>{
   if(route.request().postDataJSON()?.filters?.playerId===ACCOUNTS.troy.id&&!held){held=true;await new Promise(resolve=>release=resolve);}await route.fallback();
  });
  await page.getByRole('button',{name:'Your menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await signIn(page,'troy',{navigate:false});await tab(page,'Bets').click();
  await expect.poll(()=>held).toBe(true);await expect(mine).toHaveAttribute('aria-label','My bets, loading');await expect(mine).not.toContainText('+1U');release();
  await expect(mine.locator('.gx-nest-num')).toHaveText('+100U');await expect(page.locator('[data-landing="bets"]')).not.toContainText('LUKE ONLY TICKET');expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});
