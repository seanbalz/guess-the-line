import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {SUPABASE,communityWorld,pgliteAvailable,signIn} from './community-world.mjs';

test.use({viewport:{width:390,height:844}});test.setTimeout(60000);
test.beforeEach(()=>test.skip(!pgliteAvailable,'PGlite required; no hosted data.'));
const tab=(page,name)=>page.getByRole('navigation',{name:'Main'}).getByRole('button',{name,exact:true});
async function login(page){await page.addInitScript(()=>localStorage.setItem('gtl.app','next'));await page.goto('/#bets');await signIn(page,'luke',{navigate:false});}
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

test('approved Bets landing uses real owner-only performance and keeps every live destination',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const game=world.state.games[0];
  await seed(world,'winner',{},'win');await seed(world,'parlay',{kind:'parlay',legs:[{gameId:game.id,market:'spread',side:'home',line:-3.5,selection:`${game.home} -3.5`},{gameId:game.id,market:'total',side:'over',line:44.5,selection:'Over 44.5'}],stakeUnits:.25,odds:400},'loss');
  await seed(world,'open',{stakeUnits:.5,odds:null,source:null});await seed(world,'excluded',{},'win');await seed(world,'FOREIGN SENTINEL',{stakeUnits:100},'win','troy');
  const calls=[];page.on('request',request=>{if(request.url().includes('/gtl-api/social/'))calls.push({path:request.url().split('/gtl-api/')[1],body:request.postDataJSON()});});
  await login(page);const landing=page.locator('[data-landing="bets"]');await expect(landing.locator('.gx-bets-summary-net')).toHaveText('+0.75U');
  expect(await landing.locator(':scope > section').evaluateAll(els=>els.map(el=>el.querySelector('h2')?.textContent))).toEqual(['Your tracked bets','Tickets','Recommended']);
  await expect(landing.getByRole('slider',{name:'Move along the line · Your tracked bets',exact:true})).toBeVisible();
  await expect(landing).not.toContainText('FOREIGN SENTINEL');await expect(landing.locator('.gx-bets-landing-tickets')).toContainText('4 tracked');await expect(landing.locator('.gx-bets-summary-counts')).toHaveText('Settled2Open1');
  for(const theme of ['light','dark'])for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const scan=await new AxeBuilder({page}).include('[data-landing="bets"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});await capture(page,'landing');
  const before=(await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows;
  await landing.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByRole('region',{name:'Tracked bets overview'}).locator('.gx-tc-big')).toHaveText('+0.75U');await capture(page,'full-overview',page.getByRole('region',{name:'Tracked bets overview'}));
  await tab(page,'Bets').click();await page.getByRole('button',{name:'Active tickets',exact:true}).click();await expect(page.locator('.gx-tracked-row')).toHaveCount(1);await page.locator('.gx-tracked-preview').click();await capture(page,'open-ticket',page.locator('.gx-tracked-row'));
  await tab(page,'Bets').click();await page.getByRole('button',{name:'Settled tickets',exact:true}).click();const parlay=page.getByRole('article',{name:'2-leg parlay · Lost',exact:true});await parlay.getByRole('button',{name:'Expand 2-leg parlay',exact:true}).click();await capture(page,'parlay-receipt',parlay);
  await tab(page,'Bets').click();await page.getByRole('button',{name:'Add a bet',exact:true}).click();const editor=page.getByRole('dialog',{name:'Add a tracked bet'});await expect(editor).toBeVisible();await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:game.id.replace('-',' @ '),exact:true}).click();await capture(page,'entry-selection');page.once('dialog',dialog=>dialog.accept());await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  for(const [name,heading] of [['Your guess vs. market','Your guess vs. market'],['Virtual Units','Virtual Units'],['Everyone’s picks','Everyone’s picks']]){await tab(page,'Bets').click();await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name:heading,level:1,exact:true})).toBeVisible();}
  await tab(page,'Bets').click();await page.getByRole('button',{name:'Explore recommendations ↗',exact:true}).click();await expect(page.getByRole('heading',{name:'Research recommendations',level:1,exact:true})).toBeVisible();
  expect(calls.filter(c=>!c.path.startsWith('social/read'))).toEqual([]);expect((await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows).toEqual(before);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('landing distinguishes loading, retry, empty and unknown returns and refreshes immediately after saving',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);let release;
 try{
  let pending=false;await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/social/read'),async route=>{pending=true;await new Promise(resolve=>release=resolve);await route.fulfill({status:503,json:{error:'Fixture landing unavailable'}});},{times:1});
  await login(page);await expect.poll(()=>pending).toBe(true);await expect(page.locator('[data-league-state=loading]')).toContainText('Loading your tracked bets');expect(await page.locator('[data-landing="bets"] input[type="range"]').count()).toBe(0);
  release();await expect(page.getByRole('alert')).toContainText('Fixture landing unavailable');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.gx-bets-summary-net')).toHaveText('—');await expect(page.locator('.gx-bets-summary-counts')).toHaveText('Settled0Open0');
  await page.getByRole('button',{name:'Add a bet',exact:true}).click();const editor=page.getByRole('dialog',{name:'Add a tracked bet'});const game=world.state.games[0];
  await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:game.id.replace('-',' @ '),exact:true}).click();await editor.getByRole('group',{name:'Team',exact:true}).getByRole('button',{name:game.id.split('-')[1],exact:true}).click();await editor.getByRole('button',{name:'Favorite (−)',exact:true}).click();await editor.getByRole('group',{name:'Exact signed spread',exact:true}).getByRole('button',{name:'−3.5',exact:true}).click();await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();await expect(editor).toHaveCount(0);
  await tab(page,'Bets').click();await expect(page.locator('.gx-bets-summary-counts')).toHaveText('Settled0Open1');await expect(page.locator('.gx-bets-summary-net')).toHaveText('—');await expect(page.locator('.gx-bets-landing-tickets')).toContainText('1 tracked');expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});

test('native correction keeps full before and after history with the approved numbered composition',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  await seed(world,'Original fixture note',{stakeUnits:.5,odds:null,source:null});
  await login(page);await page.getByRole('button',{name:'Active tickets',exact:true}).click();const row=page.locator('.gx-tracked-row');await row.locator('.gx-tracked-preview').click();await row.getByRole('button',{name:'Ticket details',exact:true}).click();await row.getByText('Details & history',{exact:true}).click();await row.getByRole('button',{name:'Correct ticket',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Correct saved bet'});await editor.getByRole('group',{name:'American odds',exact:true}).getByRole('button',{name:'−110',exact:true}).click();await editor.getByRole('group',{name:'Sportsbook / quote source',exact:true}).getByRole('button',{name:'DraftKings',exact:true}).click();await editor.getByLabel('Ticket notes (optional)',{exact:true}).fill('Corrected fixture note');await editor.getByLabel('Quote observed (your local time)').fill('2026-11-04T10:00');await editor.getByLabel('Bet placed (your local time)').fill('2026-11-04T10:05');await editor.getByLabel('Reason for correction',{exact:true}).fill('Actual fixture ticket correction');
  await editor.getByRole('group',{name:'American odds',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await capture(page,'correction-terms');
  await editor.getByRole('button',{name:'Save correction',exact:true}).click();await expect(editor).toHaveCount(0);
  const history=page.getByRole('region',{name:'Ticket change history'});await expect(history).toContainText('Ticket correction');await expect(history).toContainText('Actual fixture ticket correction');await history.getByText('Review saved change',{exact:true}).click();
  for(const text of ['Source','Quote observed','Bet placed','Before: Not entered','After: DraftKings','Before: Original fixture note','After: Corrected fixture note'])await expect(history).toContainText(text);
  await capture(page,'saved-history',history);
  for(const theme of ['light','dark'])for(const width of [320,390]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const scan=await new AxeBuilder({page}).include('.gx-bets').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);}
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
