import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, ACCOUNTS, SUPABASE, storeBookLines, sendBallot } from './community-world.mjs';
import { setNativeActionTheme } from '../helpers/native-action-theme.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { pointsContextSnapshot } from '../fixtures/points-context-snapshot.mjs';
import { FANTASY_REPOSITORY, snapshotFileName, updateFantasyIndex } from '../../shared/fantasy-index.mjs';

const capturing = process.env.GTL_CAPTURE_EXPANDED_FRAME === '1';
const output = path.resolve('design/prism-expanded-frame-native-2026-11-07');
const root = page => page.locator('.gx').first();
const nav = page => page.getByRole('navigation',{name:'Main',exact:true});
const route = action => `${SUPABASE}/functions/v1/gtl-api/${action}`;
test.use({viewport:{width:390,height:844},reducedMotion:'reduce'});
test.setTimeout(180000);
test.beforeEach(()=>expect(pgliteAvailable,'Disposable local PGlite required').toBe(true));

async function close(page,world) { await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close(); }
async function native(page) {
  await expect(root(page)).not.toHaveClass(/gx-overview-frame|gx-home-design/);
  await expect(page.locator('.gx-league-btn')).toBeVisible();
  await expect(nav(page)).toHaveCSS('left','0px');
}
async function compact(page,context,theme,width) {
  await expect(root(page)).toHaveAttribute('data-frame-context',context);
  await expect(root(page)).not.toHaveClass(/gx-home-design/);
  await expect(page.locator('.gx-topbar')).toHaveCSS('position','relative');
  await expect(page.locator('.gx-sport-controls,.gx-league-btn')).toHaveCount(0);
  await expect(page.locator('.gx-home-sport').first()).toHaveCSS('width','52px');
  const sport=page.getByRole('button',{name:context.startsWith('epl-')?'Premier League':'National Football League',exact:true});
  await expect(sport).toHaveAttribute('aria-pressed','true');
  const proof=await page.evaluate(()=>{
    const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    const shell=document.querySelector('.gx'),css=getComputedStyle(shell);
    const probe=document.createElement('i');probe.style.backgroundImage='var(--gx-home-background)';shell.append(probe);
    const gradient=getComputedStyle(probe).backgroundImage;probe.remove();
    return {header:box('.gx-topbar'),tabs:box('.gx-tabbar'),stored:localStorage.getItem('gtl.theme'),resolved:document.documentElement.dataset.theme,ink:css.color,background:css.backgroundImage,gradient,
      targets:[...document.querySelectorAll('.gx-topbar button,.gx-tabbar button')].map(el=>{const r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label'),width:r.width,height:r.height};}),
      decoded:[...document.querySelectorAll('.gx-home-sport img')].filter(el=>getComputedStyle(el).visibility==='visible').every(el=>el.complete&&el.naturalWidth>0)};
  });
  expect(proof.stored).toBe(theme);expect(proof.resolved).toBe(theme);expect(proof.background).toBe(proof.gradient);expect(proof.decoded).toBe(true);
  expect(proof.targets.filter(t=>t.width<44||t.height<44)).toEqual([]);
  expect(proof.tabs).toEqual({x:(width-Math.min(width-32,488))/2,y:760,width:Math.min(width-32,488),height:72,bottom:832});
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  return proof;
}
async function captureFamily(page,info,name,context,{wide=false,forced=false,bottom=false}={}) {
  const captures=[];
  for(const theme of ['dark','light']) for(const width of [390,320,...wide?[768]:[]]) {
    await page.setViewportSize({width,height:844});await setNativeActionTheme(page,theme);await page.evaluate(()=>scrollTo(0,0));
    if(bottom)await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const proof=await compact(page,context,theme,width);
    const audit=await new AxeBuilder({page}).include('.gx-topbar').include('.gx-tabbar').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(audit.violations.map(v=>v.id)).toEqual([]);
    const file=`${name}-${theme}-${width}.png`,destination=capturing?path.join(output,file):info.outputPath(file);
    if(capturing)fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:destination,fullPage:true});
    captures.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex'),route:new URL(page.url()).hash,context,theme,width,height:844,...proof});
  }
  if(forced) {
    await page.setViewportSize({width:320,height:844});await page.emulateMedia({forcedColors:'active'});
    await expect(nav(page).locator('[aria-current=page]')).toHaveCSS('border-top-width','2px');expect(await page.evaluate(layoutProblems)).toEqual([]);
    await page.emulateMedia({forcedColors:'none'});
  }
  if(capturing)fs.writeFileSync(path.join(output,`${name}.json`),JSON.stringify({name,captures,source:'expanded task source; see manifest',scope:'Actual production controllers, disposable fixture data, outer-frame review only'},null,2)+'\n');
}

test('named NFL Research sections, Play Score/League and Bets tools use their actual confirmed hosts',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await page.goto('/#research/games');await signIn(page,'luke',{navigate:false});
    for(const [hash,context,ready] of [
      ['research/games','research-games','.gx-game-card'],['research/teams','research-teams','h1'],
      ['research/trends','research-trends','h1'],['research/fantasy','research-fantasy','h1'],
      ['play/score','play-score','[data-play=score]'],['play/league','play-league','h1'],
      ['bets','bets-overview','.gx-tracked-overview'],
      ['bets/recommended','bets-recommended','h1'],
    ]) {
      await page.goto(`/#${hash}`);
      if(context==='bets-overview')await page.getByRole('button',{name:'Overview',exact:true}).click();
      await expect(page.locator('main').locator(ready).first()).toBeVisible();
      await captureFamily(page,info,context,context,{wide:context==='play-league',forced:context==='research-games'});
    }
    // Both League feed and board keep the actual Your leagues opener.
    await page.goto('/#play/league?view=feed');await expect(root(page)).toHaveAttribute('data-frame-context','play-league');
    await page.getByRole('button',{name:'Your leagues',exact:true}).click();await expect(page.getByRole('dialog',{name:'Your leagues',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Your leagues',exact:true})).toBeFocused();
    for(const hash of ['research','play/compare','bets/active','bets/research']) {await page.goto(`/#${hash}`);await native(page);}
    expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('opened draft signal switches and cleans up on week, market, lock, read failure and account remount',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    const personal=structuredClone((await world.api('luke','personal')).body);personal.ballots={};personal.scoring={};personal.optOuts=[];
    let failed=false;
    for(const action of ['personal','personal/read']) await page.route(route(action),r=>failed?r.fulfill({status:503,json:{error:'Fixture unavailable'}}):r.fulfill({json:personal}));
    const game=personal.games[0],hash=market=>`/#play/picks?market=${market}&season=${personal.season}&week=${personal.week}&pickGame=${game.id}`;
    await page.goto(hash('spread'));await signIn(page,'luke',{navigate:false});
    await expect(page.locator('.gx-play-entry-card')).toBeVisible();
    await captureFamily(page,info,'play-spread-draft','play-draft',{forced:true});
    await page.locator('[data-side=home]').click();await page.locator('.gx-guess-num[data-value="3"]').click();
    const url=page.url();page.once('dialog',d=>d.dismiss());await nav(page).getByRole('button',{name:'Research',exact:true}).click();expect(page.url()).toBe(url);
    await expect(root(page)).toHaveAttribute('data-frame-context','play-draft');
    await page.getByRole('button',{name:`Back to Week ${personal.week} · Spread`,exact:true}).click();await native(page);
    await page.goBack();await expect(root(page)).toHaveAttribute('data-frame-context','play-draft');await expect(page.locator('.gx-guess-num[data-value="3"]')).toHaveAttribute('aria-checked','true');
    // Explicit navigation reloads preserve the account-keyed draft; no write occurs.
    page.once('dialog',d=>d.accept());await page.goto(hash('total'));await expect(page).toHaveURL(/market=total/);await expect(page.getByRole('radiogroup',{name:'Combined points'})).toBeVisible();await captureFamily(page,info,'play-total-draft','play-draft');
    personal.ballots.guess_total={picks:{[game.id]:44},lockedAt:{[game.id]:personal.now}};
    await page.reload();await expect(page.locator('.gx-per-game [data-game]')).toBeVisible();await native(page);
    failed=true;await page.reload();await expect(page.getByText('Your picks could not be loaded.',{exact:false})).toBeVisible();await native(page);
    failed=false;await page.goto(hash('spread'));await page.reload();await expect(root(page)).toHaveAttribute('data-frame-context','play-draft');
    await page.getByRole('button',{name:'Your menu',exact:true}).click();
    page.once('dialog',d=>d.accept());await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'Sign out',exact:true}).click();
    await signIn(page,'troy',{navigate:false});await expect(page.locator('.gx-play-entry-card')).toBeVisible();
    await expect(page.locator('[data-side=home]')).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('.gx-guess-call')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('Points week, editable slot and profile use supplied contexts; locking and Back remove only the presentation signal',async({page,baseURL},info)=>{
  const snapshot=pointsContextSnapshot(),bytes=Buffer.from(JSON.stringify(snapshot)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const index=updateFantasyIndex(null,{season:snapshot.season,updatedAt:snapshot.generatedAt,review:null,snapshot:{week:snapshot.week,file:snapshotFileName(snapshot.season,snapshot.week,sha256),sha256,bytes:bytes.byteLength,generatedAt:snapshot.generatedAt,statsThroughWeek:snapshot.statsThroughWeek,publishedAfterFreeze:false,rosterFallbackTeams:0}});
  const base=`https://github.com/${FANTASY_REPOSITORY}/releases/download/fantasy-data-${snapshot.season}/`,served=new Map([['index.json',Buffer.from(JSON.stringify(index))],[index.snapshots[0].file,bytes]]);
  const fantasyFetch=async url=>{const name=String(url).startsWith(base)?String(url).slice(base.length):null;return served.has(name)?new Response(served.get(name),{status:200}):new Response(null,{status:404});};
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true,fantasyFetch});
  try {
    const day=86400000,now=Date.now(),games=['PIT_CLE','KC_LV','SEA_DEN','NYJ_BUF','MIA_NE'];
    const slots=['QB','RB','WR','TE','FLEX'].map((slot,i)=>({slot,playerId:`00-fixture-${i}`,name:`Fixture ${slot} Player`,team:games[i].split('_')[0],position:slot==='FLEX'?'WR':slot,gameKey:`2026_07_${games[i]}`,kickoff:new Date(now+(i+2)*day).toISOString()}));
    await world.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at)
      values(2026,7,'published',$1,$2,$3,$4,$5,$6,$1)`,[new Date(now-day).toISOString(),new Date(now+8*day).toISOString(),{format:'ppr',passingTds:4,version:'ppr4-v1'},JSON.stringify(slots),{QB:19.4,RB:13.2,WR:15.8,TE:9.1,FLEX:12.6},{snapshotSeason:2026,snapshotWeek:7,checksum:'f'.repeat(64),selectionVersion:'points-slate-v1',seed:'fixture'}]);
    await page.goto('/#play/points');await signIn(page,'luke',{navigate:false});await expect(page.locator('[data-points-summary]')).toBeVisible();
    await captureFamily(page,info,'points-week','play-points');
    await page.locator('[data-slot=QB]').click();await expect(page.getByRole('spinbutton',{name:'Your guess'})).toBeVisible();
    await captureFamily(page,info,'points-slot-draft','play-points');
    // Direct real profile route, using the same owned slot. No fabricated body or new route.
    await page.goto('/#play/points?layer=profile&item=QB');await expect(page.getByRole('group',{name:'Player profile'})).toBeVisible();
    await captureFamily(page,info,'points-profile','play-points');
    await page.goto('/#play/points?layer=profile&item=FLEX');await expect(page.getByText('Not in this week’s player data.',{exact:true})).toBeVisible();await native(page);
    await page.goto('/#play/points?item=QB');const spin=page.getByRole('spinbutton',{name:'Your guess'});await spin.focus();await page.keyboard.press('ArrowUp');
    await page.getByRole('button',{name:/^Lock in \d+$/,exact:false}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-frame-context','play-points');
    await page.getByRole('button',{name:'Confirm lock-in',exact:true}).click();await expect(page.getByText(/^Locked in \d+\./)).toBeVisible();await native(page);
    await page.goBack();await expect(root(page)).toHaveAttribute('data-frame-context','play-points');
    expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('actual EPL Home/Play compact sport identity, recovery, native FEPL Research/Bets/History and allowed sport return',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await page.route(route('lobby'),async r=>{const req=r.request(),response=await world.handler(new Request(req.url(),{headers:req.headers()}));await r.fulfill({status:response.status,json:{...await response.json(),epl:true}});});
    let recovery=false;
    await page.route('**/functions/v1/gtl-api/epl/**',r=>{
      const action=new URL(r.request().url()).pathname.split('/epl/')[1],kickoff='2099-10-31T12:30:00Z';
      if(action==='draft/read')return recovery?r.fulfill({status:503,json:{error:'Fixture recovery state'}}):r.fulfill({json:{season:2026,week:17,status:'open',deadline:kickoff,order:[{ownerId:'manager-luke',name:'Luke Fixture'},{ownerId:'manager-troy',name:'Troy Fixture'}],picks:[],clubs:[{code:'ARS',name:'Arsenal',opponent:'CHE',home:true,kickoff},{code:'CHE',name:'Chelsea',opponent:'ARS',home:false,kickoff}],me:'manager-luke',onTheClock:'manager-luke',myQueue:[]}});
      if(action==='guess/read')return r.fulfill({json:{available:true,season:2026,week:17,ownerId:'manager-luke',fixtures:[{eventId:'frame-ars-che',home:'ARS',away:'CHE',commenceTime:kickoff,status:'scheduled',kickedOff:false}],guesses:[]}});
      if(action==='guess/leaderboard')return r.fulfill({json:{season:2026,rows:[{ownerId:'manager-luke',name:'Luke Fixture',average:12.5,guessed:4,unscored:1}]}});
      return r.fulfill({status:404,json:{error:'Fixture unavailable'}});
    });
    await page.goto('/#epl/home');await signIn(page,'luke',{navigate:false});await expect(page.locator('.gx-epl-home .gx-epl-hero')).toBeVisible();
    await captureFamily(page,info,'epl-home','epl-home',{wide:true});
    recovery=true;await page.reload();await expect(page.getByText('Pick a Team didn’t load.',{exact:true})).toBeVisible();await captureFamily(page,info,'epl-home-recovery','epl-home');recovery=false;
    for(const section of ['pick','guess','leaderboard']) {
      await page.goto(`/#epl/play/${section}`);await expect(page.locator(`[data-epl-section=${section}]`)).toBeVisible();
      await captureFamily(page,info,`epl-play-${section}`,'epl-play',{forced:section==='guess'});
    }
    for(const hash of ['epl/research','epl/research/fantasy','epl/bets']) {await page.goto(`/#${hash}`);await native(page);}
    await page.getByRole('button',{name:'Your menu',exact:true}).click();await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'History',exact:true}).click();await native(page);
    await expect(page.getByText('Premier League history is not available here yet. Your saved picks and records are kept.',{exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'National Football League',exact:true}).click();await expect(page.getByRole('button',{name:'National Football League',exact:true})).toHaveAttribute('aria-pressed','true');
    expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('actual History Page replaces a native Research root and returns with Back',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await page.goto('/#research');await signIn(page,'luke',{navigate:false});await native(page);
    await page.getByRole('button',{name:'Your menu',exact:true}).click();await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'History',exact:true}).click();
    await expect(page.locator('.gx-page [data-page=history]')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
    for(const view of ['Guess','Bets','Older']) {
      await page.getByRole('group',{name:'History view',exact:true}).getByRole('button',{name:view,exact:true}).click();
      await captureFamily(page,info,`history-${view.toLowerCase()}`,'history',{wide:view==='Older'});
    }
    await page.locator('.gx-history').getByRole('button',{name:'Back',exact:true}).click();await native(page);
    await expect(page.locator('[data-landing=research]')).toBeVisible();expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('actual Virtual PlaceBets dock, native slip, saved toast and keyboard resize clear the floating tabs',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    const games=world.state.games;
    await storeBookLines(world,{spread:Object.fromEntries(games.map(g=>[g.id,-3.5])),total:Object.fromEntries(games.map(g=>[g.id,44.5]))});
    await sendBallot(world,'luke','guess_spread',Object.fromEntries(games.map(g=>[g.id,-3])));
    await sendBallot(world,'luke','guess_total',Object.fromEntries(games.map(g=>[g.id,44])));
    await page.goto('/#bets/virtual');await signIn(page,'luke',{navigate:false});
    const place=page.locator('[data-bets=place]');await expect(place).toBeVisible();
    await place.locator('[data-market=spread] .gx-chip').first().click();await expect(page.locator('.gx-place-dock')).toBeVisible();
    await captureFamily(page,info,'virtual-production-dock','bets-virtual',{forced:true,bottom:true});
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});await place.getByRole('button',{name:'Refresh prices',exact:true}).focus();
      const clearance=await page.evaluate(()=>({padding:parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),height:document.querySelector('.gx-dock').getBoundingClientRect().height}));
      expect(clearance.padding).toBe(100+clearance.height);
      const last=await place.getByRole('button',{name:'Refresh prices',exact:true}).boundingBox(),dock=await page.locator('.gx-dock').boundingBox();expect(last.y+last.height).toBeLessThanOrEqual(dock.y-8);
    }
    await page.getByRole('button',{name:'Review slip',exact:true}).click();const slip=page.getByRole('dialog',{name:'Your slip',exact:true});await expect(slip).toBeVisible();
    await page.keyboard.press('Tab');expect(await slip.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Review slip',exact:true})).toBeFocused();
    for(const height of [504,844]) {await page.setViewportSize({width:390,height});await expect.poll(()=>nav(page).evaluate(el=>Math.round(el.getBoundingClientRect().bottom))).toBe(height-12);}
    await page.getByRole('button',{name:'Review slip',exact:true}).click();await slip.getByRole('button',{name:/^Place 1 bet/}).click();
    await expect(page.locator('.gx-toast')).toContainText('1 bet saved');
    const toast=await page.locator('.gx-toast').boundingBox(),bar=await nav(page).boundingBox();expect(toast.y+toast.height).toBeLessThanOrEqual(bar.y-8);
    expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('named pending and removed LeagueCover variants keep their recovery actions and compact frame',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true,groupScreens:true});
  try {
    const other=await world.api('troy','leagues',{name:'A private league with a long name requiring an invitation',format:'group',practice:false,requestId:crypto.randomUUID()});expect(other.status).toBe(200);
    await page.goto('/#home');await signIn(page,'luke',{navigate:false});await expect(page.getByRole('button',{name:'Your menu',exact:true})).toBeVisible();
    await page.evaluate(([account,id])=>localStorage.setItem(`gtl.next.league.v1.${account}`,JSON.stringify({id,name:'A long private league name requiring an invitation and preserving its original identity'})),[ACCOUNTS.luke.id,other.body.leagueId]);await page.reload();
    await expect(page.getByRole('heading',{name:'Your spot is pending',exact:true})).toBeVisible();await captureFamily(page,info,'league-pending','league-cover',{wide:true});
    await page.getByRole('button',{name:'Your leagues',exact:true}).click();await expect(page.getByRole('dialog',{name:'Your leagues',exact:true})).toBeVisible();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Switch to Community',exact:true}).click();
    await world.api('sean','community/member',{userId:ACCOUNTS.luke.id,member:false});await page.reload();
    await expect(page.getByRole('heading',{name:'Not in the Community',exact:true})).toBeVisible();await captureFamily(page,info,'league-removed','league-cover');
    await expect(page.getByRole('button',{name:'Reload the app',exact:true})).toBeVisible();expect(world.errors).toEqual([]);
  } finally {await close(page,world);}
});

test('actual scoped lazy failure hosts retain context without selecting chrome from the error',async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    const blocked=[];
    await page.route(/\/(FantasyScreen|History)-[^/]+\.js$/,r=>{blocked.push(new URL(r.request().url()).pathname);return r.abort('failed');});
    await page.goto('/#research/fantasy');await signIn(page,'luke',{navigate:false});
    await expect(page.getByText('Fantasy couldn’t load. Check your connection and try again.',{exact:true})).toBeVisible();
    await captureFamily(page,info,'continuity-research-fantasy-failed','research-fantasy');
    await page.getByRole('button',{name:'Your menu',exact:true}).click();await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'History',exact:true}).click();
    await expect(page.locator('.gx-page .gx-fail')).toBeVisible();await captureFamily(page,info,'continuity-history-from-research-failed','history');
    await page.keyboard.press('Escape');await expect(root(page)).toHaveAttribute('data-frame-context','research-fantasy');
    await nav(page).getByRole('button',{name:'Research',exact:true}).click();await native(page);
    expect(blocked.some(p=>/FantasyScreen-/.test(p))).toBe(true);expect(blocked.some(p=>/History-/.test(p))).toBe(true);
    expect(world.errors.filter(e=>!/Failed to fetch dynamically imported module|Importing a module script failed/.test(e))).toEqual([]);
  } finally {await close(page,world);}
});
