import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, signIn, storeBookLines, sendBallot, ACCOUNTS, pgliteAvailable, SUPABASE } from './community-world.mjs';
test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; no hosted requests.'));
const nav = page => page.getByRole('navigation',{ name: 'Main' });
const group = (page,name) => page.getByRole('group',{ name, exact: true });
const prepare = state => {
 state.league.season = 2026; state.league.week = 6;
 state.games = ['SEA-DEN','CAR-PHI','NO-NYG','WAS-SF'].map((id,i) => { const [awayCode,homeCode] = id.split('-'); return { ...state.games[i], id, away: awayCode, home: homeCode, awayCode, homeCode, matchup: awayCode+' @ '+homeCode }; });
};
async function ready(page,baseURL,{ stale = false, chartValues = false, landing = false }={}) {
 const world = await communityWorld(page,baseURL,{ migrations: ALL, games: 4, prepare, optionalRpc: true, troyBallots: false, groupScreens: true, ...(stale ? { trendsReadSeason: async () => { throw new Error('Fixture source outage'); } } : {}) });
 const lines = { spread: Object.fromEntries(world.state.games.map(g => [g.id,3.5])), total: Object.fromEntries(world.state.games.map(g => [g.id,43.5])) };
 await storeBookLines(world,lines);
 await sendBallot(world,'luke','guess_spread',Object.fromEntries(world.state.games.map(g => [g.id,7])));
 // Historical fixture rows use the existing SQL-suite replica seed pattern. Production reader and gates remain real.
 await world.db.transaction(async tx => {
  await tx.exec('set local session_replication_role = replica');
  for (const [season,week] of [[2025,18],[2026,1],[2026,2],[2026,3],[2026,4],[2026,5]]) {
   const at = Date.parse(season === 2025 ? '2026-01-04T20:00:00Z' : '2026-09-01T20:00:00Z') + week*86400000;
   const signature = { season,week,deadline: at/1000,games: [{ id:'CAR-ATL',away:'CAR',home:'ATL',kickoff:at/1000 }] };
   await tx.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)',[season,week,signature]);
   await tx.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3)',[ACCOUNTS.luke.id,season,week]);
   for (const mode of ['guess_spread','guess_total']) {
    const reference = { status:'available',value: mode === 'guess_spread' ? 3.5 : 43.5,source:'Fixture saved books',observedAt:new Date(at-7200000).toISOString() };
    const chartSpread = chartValues && season === 2026 && mode === 'guess_spread';
    const guess = chartSpread && week === 2 ? 0 : chartSpread && week === 3 ? 3.5 : mode === 'guess_spread' ? 7 : 47;
    const ballot = { picks:{'CAR-ATL':guess},submittedAt:new Date(at-3600000).toISOString(),scoringReferences:{'CAR-ATL':reference} };
    await tx.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)',[ACCOUNTS.luke.id,season,week,mode,ballot]);
   }
   if (!(chartValues && season === 2026 && week === 4)) await tx.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,observed_at) values($1,$2,'CAR-ATL',1,'final',20,25,'Fixture final',$3)",[season,week,new Date(at+14400000).toISOString()]);
  }
  const current = { picks:{'CAR-PHI':99.125},lockedAt:{'CAR-PHI':new Date().toISOString()},scoringReferences:{'CAR-PHI':{status:'available',value:97.625,source:'HIDDEN SENTINEL'}} };
  await tx.query("insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,6) on conflict do nothing",[ACCOUNTS.troy.id]);
  await tx.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,6,'guess_total',$2)",[ACCOUNTS.troy.id,current]);
 });
 const read = await world.api('luke','community/history',{ season:2026 });
 expect(read.status).toBe(200);
 expect(read.body.weeks.find(w => w.week===5).entries.find(e => e.userId === ACCOUNTS.luke.id).picks[0].points).not.toBeNull();
 await signIn(page,'luke');
 await expect(page.getByRole('navigation',{ name:'Main',exact:true })).toBeVisible();
 await page.goto('about:blank'); await page.goto(landing ? '/#research' : '/#trends');
 await expect(page.getByRole('heading',{ name:landing ? 'Research' : 'Trends',level:1 })).toBeVisible();
 if (!landing) await expect(page.locator('[data-trend-availability]')).toBeVisible();
 return world;
}
async function phone(page) {
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 const problems = await page.locator('.gx').evaluate(root => {
  const visible = e => e.getClientRects().length && !e.closest('[hidden],[inert],dialog:not([open])');
  const bad = [...root.querySelectorAll('button,a[href],select,summary')].filter(visible).filter(e => { const r=e.getBoundingClientRect();return r.width<43.5||r.height<43.5; }).map(e=>e.textContent);
  for (const tab of root.querySelectorAll('.gx-tabbar button')) { const r = tab.getBoundingClientRect(); if (r.left < -.5 || r.right > innerWidth + .5) bad.push('Navigation tab clipped'); }
  return bad;
 });
 expect(problems).toEqual([]);
}
async function noSentinel(page) {
 const content=await page.locator('body').evaluate(e => e.innerText+' '+[...e.querySelectorAll('*')].flatMap(n=>[...n.attributes].filter(a=>!['class','style','d','points','viewBox'].includes(a.name)).map(a=>a.value)).join(' '));
 expect(content).not.toContain('99.125'); expect(content).not.toContain('97.625'); expect(content).not.toContain('HIDDEN SENTINEL');
}
test('Trends code waits for a visit, including with saved Home trends, and its loading/error states retain navigation', async ({page,baseURL}, info) => {
 test.setTimeout(120000);
 await page.addInitScript(() => { try {
  localStorage.setItem('gtl.trends.saved', JSON.stringify({v:1,items:[{id:'fixture-saved',spec:{market:'spread',side:'home',filters:[]},savedAt:'2026-10-28T00:00:00Z'}]}));
 } catch {} });
 let release, mode='hold', requests=0;
 let waiting=new Promise(resolve=>{release=resolve;});
 page.on('request',request=>{if(/\/assets\/TrendsScreen-[^/]+\.js$/.test(request.url()))requests++;});
 const world=await ready(page,baseURL,{landing:true});
 await page.route('**/assets/TrendsScreen-*.js',async route=>{
  if(mode==='hold') await waiting;
  return mode==='fail' ? route.abort('failed') : route.continue();
 });
 const themePreference=async theme=>{
  await page.evaluate(theme=>{localStorage.setItem('gtl.theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'gtl.theme',newValue:theme}));},theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference',theme);
 };
 const open=async()=>{
  await nav(page).getByRole('button',{name:/^Research(,|$)/}).click();
  await page.locator('[data-landing="research"]').getByRole('button',{name:/^Trends/}).click();
 };
 try {
  await nav(page).getByRole('button',{name:/^Home(,|$)/}).click();
  await expect(page.locator('[data-home="saved-trends"]')).toBeVisible();
  await expect(page.locator('[data-home="saved-trends"]')).not.toContainText('Checking');
  expect(requests).toBe(0);
  await open();
  await expect(page.getByRole('region',{name:'Trends content'}).getByRole('status')).toHaveText('Loading trends…');
  await expect.poll(()=>requests).toBe(1);
  await nav(page).getByRole('button',{name:/^Home(,|$)/}).click();
  const failed=page.waitForEvent('requestfailed',request=>/\/assets\/TrendsScreen-[^/]+\.js$/.test(request.url()));
  mode='fail';release();await failed;
  await expect(page.getByRole('region',{name:'Trends content'})).toHaveCount(0);
  await open();
  await expect(page.getByRole('alert')).toContainText('Trends couldn’t load.');
  const reads=[];page.on('request',request=>{if(request.url().startsWith(`${SUPABASE}/functions/v1/gtl-api/`))reads.push(request.url());});
  for(const theme of ['light','dark'])for(const forcedColors of ['none','active']){
   await themePreference(theme);await page.emulateMedia({forcedColors,colorScheme:theme,reducedMotion:'reduce'});
   await page.setViewportSize({width:320,height:844});await phone(page);await noSentinel(page);
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
   await page.screenshot({path:info.outputPath(`trends-download-error-${theme}-${forcedColors}.png`)});
  }
  mode='hold';waiting=new Promise(resolve=>{release=resolve;});
  await page.getByRole('button',{name:'Try trends again',exact:true}).click();
  const region=page.getByRole('region',{name:'Trends content'});
  await expect(region).toBeFocused();await expect(region.getByRole('status')).toHaveText('Loading trends…');
  for(const theme of ['light','dark'])for(const forcedColors of ['none','active']){
   await themePreference(theme);await page.emulateMedia({forcedColors,colorScheme:theme,reducedMotion:'reduce'});
   await phone(page);await noSentinel(page);
   await page.screenshot({path:info.outputPath(`trends-download-loading-${theme}-${forcedColors}.png`)});
  }
  expect(reads).toEqual([]);
  mode='ready';release();
  await expect(page.locator('[data-trend-availability]')).toBeVisible();await expect(region).toBeFocused();
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Player',exact:true})).toHaveValue(ACCOUNTS.luke.id);
  await noSentinel(page);
  const loaded=requests;await nav(page).getByRole('button',{name:/^Home(,|$)/}).click();await open();
  await expect(group(page,'Trends section')).toBeVisible();expect(requests).toBe(loaded);
  expect(world.errors).toEqual([]);
 } finally{release();await world.db.close();}
});

test('Trends stylesheet failures stay local until an explicit retry restores its chart styles', async ({page,baseURL}) => {
 const world=await ready(page,baseURL,{landing:true});
 let allowStyle=false, requests=0, releaseStyle;
 const waiting=new Promise(resolve=>{releaseStyle=resolve;});
 try {
  await page.route('**/assets/TrendsScreen-*.css',async route=>{
   requests++;if(allowStyle)await waiting;
   return allowStyle?route.continue():route.abort('failed');
  });
  await page.locator('[data-landing="research"]').getByRole('button',{name:/^Trends/}).click();
  const region=page.getByRole('region',{name:'Trends content'});
  await expect(region.getByRole('alert')).toContainText('Trends couldn’t load.');
  await expect(page.locator('.gx-trends')).toHaveCount(0);
  await region.getByRole('button',{name:'Try trends again'}).click();
  await expect.poll(()=>requests).toBe(2);
  await expect(region.getByRole('alert')).toContainText('Trends couldn’t load.');
  await expect(page.locator('.gx-trends')).toHaveCount(0);
  allowStyle=true;
  await region.getByRole('button',{name:'Try trends again'}).click();
  await expect.poll(()=>requests).toBe(3);
  await expect(region).toBeFocused();
  await expect(region.getByRole('status')).toHaveText('Loading trends…');
  // Reopening while the repair is pending must not bypass its stylesheet promise.
  await nav(page).getByRole('button',{name:/^Home(,|$)/}).click();
  await nav(page).getByRole('button',{name:/^Research(,|$)/}).click();
  await page.locator('[data-landing="research"]').getByRole('button',{name:/^Trends/}).click();
  await expect(region.getByRole('status')).toHaveText('Loading trends…');
  await expect(page.locator('.gx-trends')).toHaveCount(0);
  expect(requests).toBe(3);releaseStyle();
  await expect(group(page,'Trends section')).toBeVisible();
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.locator('.gx-tr-chart').first()).toHaveCSS('display','flex');
  expect(requests).toBe(3);await noSentinel(page);expect(world.errors).toEqual([]);
 } finally {releaseStyle();await world.db.close();}
});

test('player comparison bars label exact observations and distinguish zero from missing samples', async ({page,baseURL}, testInfo) => {
 const world = await ready(page,baseURL,{chartValues:true});
 try {
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await page.getByRole('combobox',{name:'Player team',exact:true}).selectOption('CAR');
  await page.getByRole('combobox',{name:'Player matchup',exact:true}).selectOption('CAR-ATL');
  const chart = page.locator('.gx-tr-chart').first(), rows = chart.locator('.gx-tr-observation');
  await expect(chart.locator('[data-chart-scale]')).toContainText('Scale: −3.5 to +3.5 points');
  await expect(page.locator('.gx-tr-chart').nth(1).locator('[data-chart-scale]')).toContainText('Scale: 0 to 3.5 points');
  await expect(page.locator('.gx-tr-chart').nth(2).locator('[data-chart-scale]')).toContainText('Scale: 0 to 100%');
  await expect(rows).toHaveCount(5);
  const expected = ['+3.5','−3.5','0','+3.5','+3.5'];
  for (let i=0; i<5; i++) {
   await expect(rows.nth(i)).toContainText(`2026 Week ${i+1}`);
   await expect(rows.nth(i).locator('.gx-tr-observation-label > span').last()).toHaveText(expected[i]);
   await expect(chart.getByRole('row').nth(i+1).getByRole('cell').first()).toHaveText(expected[i]);
  }
  await expect(rows.nth(2).locator('rect')).toHaveCount(0);
  await expect(rows.nth(2).locator('.gx-tr-zero-point')).toHaveCount(1);
  const cover = page.locator('.gx-tr-chart').nth(2), missing = cover.locator('.gx-tr-observation').filter({hasText:'2026 Week 4'});
  await expect(missing).toContainText('No sample');
  await expect(missing.locator('rect,circle')).toHaveCount(0);
  await expect(cover.getByRole('row').filter({hasText:'2026 Week 4'}).getByRole('cell').first()).toHaveText('No sample');
  await expect(rows.nth(0).locator('rect')).toHaveAttribute('x','150');
  await expect(rows.nth(1).locator('rect')).toHaveAttribute('x','22');
  expect(await chart.locator('svg').evaluateAll(nodes=>nodes.every(el=>el.getAttribute('aria-hidden')==='true'))).toBe(true);
  for (const theme of ['light','dark']) {
   await page.setViewportSize({width:320,height:844});
   await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme);
   for (const forcedColors of ['none','active']) {
    await page.emulateMedia({forcedColors,colorScheme:theme});
    await chart.locator('.gx-tr-observations').scrollIntoViewIfNeeded();
    await chart.screenshot({path:testInfo.outputPath(`player-bars-${theme}-${forcedColors}.png`)});
    await phone(page); await noSentinel(page);
    const evidence = cover.getByRole('region');
    expect(await evidence.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await cover.getByRole('columnheader', {name:'Decisions',exact:true}).evaluate(el => getComputedStyle(el).overflowWrap)).toBe('normal');
    await evidence.focus();
    await page.keyboard.press('End');
    await chart.locator('.gx-tr-observations').scrollIntoViewIfNeeded();
    expect((await new AxeBuilder({page}).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
    const colors = await rows.nth(2).locator('circle').evaluate(el=>({stroke:getComputedStyle(el).stroke,fill:getComputedStyle(el).fill}));
    expect(colors.stroke).not.toBe(colors.fill);
    await cover.screenshot({path:testInfo.outputPath(`player-percent-${theme}-${forcedColors}.png`)});
   }
  }
  expect(world.errors).toEqual([]);
 } finally { await world.db.close(); }
});
test('published week, market gates, team filters, game sheets/back, player windows and exact evidence',async({page,baseURL},testInfo)=>{
 const world=await ready(page,baseURL);
 try {
  await expect(page.getByText('Published week: 2026 Week 6',{exact:false})).toBeVisible();
  await expect(nav(page).locator('button')).toHaveCount(4);
  await page.setViewportSize({width:320,height:844}); await nav(page).getByRole('button',{name:'Home',exact:true}).focus();
  for (let i=0;i<3;i++) { await page.keyboard.press('Tab'); await phone(page); }
  await expect(nav(page).getByRole('button',{name:'Research',exact:true})).toBeFocused(); await page.setViewportSize({width:390,height:844});
  await group(page,'Trends market').getByRole('button',{name:'Total',exact:true}).click();
  await expect(page.getByText(/Total line-based records are hidden/).first()).toBeVisible();
  await noSentinel(page);
  await group(page,'Trends market').getByRole('button',{name:'Spread',exact:true}).click();
  // D-66 nesting cards: Teams › team › trend, one smaller layer per tap; lips and back return one layer at a time.
  await group(page,'Trends section').getByRole('button',{name:'Teams',exact:true}).click();
  const nest=page.getByRole('region',{name:'Team trends',exact:true});
  await expect(nest.getByRole('heading',{level:2,name:'Teams',exact:true})).toBeVisible();
  await expect(nest.locator('[data-team]')).toHaveCount(8);
  await page.screenshot({path:testInfo.outputPath('nest-teams-390.png'),fullPage:true});
  await expect(nest).not.toContainText('Past results since 2002');
  await nest.locator('[data-team=CAR]').click();
  await expect(nest.getByRole('heading',{level:2,name:'Carolina Panthers',exact:true})).toBeFocused();
  await expect(page).toHaveURL(/teamsTeam=CAR/);
  await expect(nest).toContainText('CAR @ PHI');
  await page.screenshot({path:testInfo.outputPath('nest-team-390.png'),fullPage:true});
  const tile=nest.locator('button.gx-nest-tile').first();
  const trendTitle=(await tile.locator('.gx-nest-tile-label').textContent()).trim();
  await tile.click();
  await expect(nest.getByRole('heading',{level:2,name:trendTitle,exact:true})).toBeFocused();
  await expect(page).toHaveURL(/teamsTrend=t[0-9a-z]+/);
  await expect(nest.getByRole('button',{name:'Back to Carolina Panthers',exact:true})).toBeVisible();
  await expect(nest.locator('.gx-pill').first()).toBeVisible();
  for (const width of [390,320]) {
   await page.setViewportSize({width,height:844});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:testInfo.outputPath(`nest-trend-${width}.png`),fullPage:true});
   expect((await new AxeBuilder({page}).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goBack(); await expect(nest.getByRole('heading',{level:2,name:'Carolina Panthers',exact:true})).toBeVisible();
  await nest.getByRole('button',{name:'Back to Teams',exact:true}).click();
  await expect(nest.getByRole('heading',{level:2,name:'Teams',exact:true})).toBeVisible();
  await nest.locator('[data-team=CAR]').click();
  await noSentinel(page);
  await nest.getByRole('button',{name:'Game details · CAR @ PHI',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'CAR @ PHI',exact:true}); await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-row=weather]')).toBeVisible();
  await expect(sheet.locator('[data-section=trends]')).toBeVisible();
  const order=await sheet.evaluate(e=>{const w=e.querySelector('[data-row=weather]'),t=e.querySelector('[data-section=trends]');return Boolean(w.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING);});expect(order).toBe(true);
  await expect(sheet.locator('[data-trend-availability]')).toBeVisible();
  await sheet.getByRole('button',{name:/^All trends/}).click();
  await expect(page.getByRole('dialog',{name:'All trends',exact:true}).locator('[data-trend-availability]')).toBeVisible();
  await page.goBack(); await expect(sheet).toBeVisible(); await page.goBack(); await expect(sheet).toBeHidden();
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Market accuracy',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Player team',exact:true}).selectOption('CAR');
  await expect(page.getByText(/Recurring pattern · CAR · for/)).toBeVisible();
  await page.getByText('Current-week saved-reference context · same direction',{exact:true}).first().click();
  await expect(page.getByText(/not a current sportsbook line/)).toBeVisible();
  await page.getByRole('combobox',{name:'History window',exact:true}).selectOption('last5');
  await expect(page.getByRole('figure').first()).toBeVisible();
  await page.getByRole('combobox',{name:'Player matchup',exact:true}).selectOption('CAR-ATL');
  await expect(page.getByRole('combobox',{name:'Player matchup',exact:true})).toHaveValue('CAR-ATL');
  const games=page.getByRole('group',{name:'Player trends'}); // region's label remains accessible independently of role.
  await page.locator('.gx-tr-details > summary').filter({hasText:/^Contributing games/}).first().click();
  await expect(page.getByText('Fixture saved books',{exact:false}).first()).toBeVisible();
  await expect(page.getByText('Panthers −7',{exact:true}).first()).toBeVisible();
  await noSentinel(page);
  expect(new URL(page.url()).hash.startsWith('#research/trends?')).toBe(true); expect(new URL(page.url()).hash).not.toMatch(/guess|reference|points|99.125|97.625/); expect(new URL(page.url()).search).toBe('');
  await nav(page).getByRole('button',{name:'Home',exact:true}).click(); await page.goBack();
  await expect(page.getByRole('heading',{name:'Trends',level:1})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'History window',exact:true})).toHaveValue('last5');
  await page.reload(); await expect(group(page,'Trends section').getByRole('button',{name:'Players',exact:true})).toHaveAttribute('aria-pressed','true'); await expect(page.getByRole('combobox',{name:'History window',exact:true})).toHaveValue('last5'); await expect(page.getByRole('combobox',{name:'Player team',exact:true})).toHaveValue('CAR'); await expect(page.getByRole('combobox',{name:'Player matchup',exact:true})).toHaveValue('CAR-ATL'); await expect(nav(page).getByRole('button',{name:'Research',exact:true})).toHaveAttribute('aria-current','page');
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});
test('fixture screenshots and axe at 320/390 in light/dark for This Week and populated Players',async({page,baseURL})=>{
 test.setTimeout(120000); const world=await ready(page,baseURL,{stale:true});
 try{
  for(const theme of ['dark','light'])for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
   await group(page,'Trends section').getByRole('button',{name:'This Week',exact:true}).click();
   await expect(page.locator('[data-trend-availability]')).toContainText('2026-10-12'); await expect(page.locator('[data-trend-availability]')).toContainText('Stale');
   await phone(page);await noSentinel(page);
   expect((await new AxeBuilder({page}).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
   await page.screenshot({path:'.local/trends-week-'+width+'-'+theme+'.png',fullPage:true});
   await page.screenshot({path:'.local/trends-week-'+width+'-'+theme+'-viewport.png'});
   await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Market accuracy',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Player team',exact:true}).selectOption('CAR');
   await phone(page);await noSentinel(page);
   expect((await new AxeBuilder({page}).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
   await page.screenshot({path:'.local/trends-players-'+width+'-'+theme+'.png',fullPage:true});
   await page.screenshot({path:'.local/trends-players-'+width+'-'+theme+'-viewport.png'});
   await page.locator('.gx-tr-chart').first().scrollIntoViewIfNeeded(); await page.screenshot({path:'.local/trends-players-'+width+'-'+theme+'-charts-viewport.png'});
   await page.getByText('Recurring pattern · CAR · for',{exact:true}).first().scrollIntoViewIfNeeded(); await page.screenshot({path:'.local/trends-players-'+width+'-'+theme+'-callout-viewport.png'});
   const context=page.locator('summary').filter({hasText:/^Current-week saved-reference context/}).first(); await context.click(); await page.locator('summary').filter({hasText:/^Current context/}).first().click();
   await page.getByRole('heading',{name:'2026 Week 6 · Carolina Panthers at Philadelphia Eagles',exact:true}).first().evaluate(el => el.scrollIntoView({block:'start'})); await page.evaluate(() => window.scrollBy(0,-80)); await page.screenshot({path:'.local/trends-players-'+width+'-'+theme+'-current-viewport.png'});
   await context.click();
  }
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
test('history error/retry, vanished data and private comparison unavailable fail closed',async({page,baseURL})=>{
 const world=await ready(page,baseURL); let failed=true;const calls=[];
 page.on('request',r=>{if(r.url().includes('/community/history'))calls.push(r.url());});
 await page.route('**/functions/v1/gtl-api/community/history',async route=>failed?route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'Fixture unavailable'})}):route.fallback());
 try{
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Fixture unavailable'})).toBeVisible(); await expect(page.getByRole('heading',{name:'Market accuracy'})).toHaveCount(0);
  failed=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Market accuracy'})).toBeVisible();
  await world.db.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query('delete from public.gtl_weekly_ballots where user_id=$1',[ACCOUNTS.luke.id]);});
  await page.getByRole('button',{name:'Refresh player history',exact:true}).click();
  await expect(page.getByText(/No eligible locked guesses/)).toBeVisible();await expect(page.getByRole('heading',{name:'Market accuracy'})).toHaveCount(0);
  await page.route('**/functions/v1/gtl-api/league/comparison',route=>route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'Private comparison unavailable'})}));
  await page.getByRole('button',{name:/^League: Community/}).click();
  await page.getByRole('dialog',{name:'Your leagues',exact:true}).locator('button').filter({hasText:world.state.league.name}).first().click();
  const prior=calls.length;await expect(page.getByRole('alert').filter({hasText:'Private comparison unavailable'})).toBeVisible();
  await expect(page.getByText(/No eligible locked guesses/)).toHaveCount(0);await expect(page.getByRole('heading',{name:'Market accuracy'})).toHaveCount(0);expect(calls.length).toBe(prior);
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('populated scopes mask synchronously while private read waits; next account resets player filters',async({page,baseURL})=>{
 const world=await ready(page,baseURL); let release; const waiting=new Promise(resolve=>{release=resolve;}); let privateStarted=false;
 try{
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Market accuracy'})).toBeVisible();
  await page.getByRole('combobox',{name:'Player team',exact:true}).selectOption('CAR');
  await page.route('**/functions/v1/gtl-api/league/comparison',async route=>{privateStarted=true;await waiting;await route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({error:'Private scope unavailable'})});});
  await page.getByRole('button',{name:/^League: Community/}).click();
  await page.getByRole('dialog',{name:'Your leagues',exact:true}).locator('button').filter({hasText:world.state.league.name}).first().click();
  await expect.poll(()=>privateStarted).toBe(true);
  await expect(page.getByText('Loading scoped player history…')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Market accuracy'})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'Player',exact:true})).toHaveCount(0);
  release(); await expect(page.getByRole('alert').filter({hasText:'Private scope unavailable'})).toBeVisible();
  await page.getByRole('button',{name:/^League:/}).click();
  await page.getByRole('dialog',{name:'Your leagues',exact:true}).getByRole('button',{name:/Community/}).first().click();
  await expect(page.getByRole('heading',{name:'Market accuracy'})).toBeVisible();
  await page.getByRole('button',{name:'Your menu',exact:true}).click(); await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await signIn(page,'sean',{navigate:false});await expect(page.getByRole('heading',{name:'Trends',level:1})).toBeVisible();
  await nav(page).getByRole('button',{name:'Research',exact:true}).click(); await page.locator('[data-landing=research]').getByRole('button',{name:'Trends',exact:true}).click();
  await group(page,'Trends section').getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Player',exact:true})).toHaveValue(ACCOUNTS.sean.id);
  await expect(page.getByRole('combobox',{name:'Player team',exact:true})).toHaveValue('');
  await expect(page.getByRole('heading',{name:'Market accuracy'})).toHaveCount(0);
  await noSentinel(page);expect(world.errors).toEqual([]);
 }finally{release();await world.db.close();}
});

test('trend builder: conditions, honest result card, this week’s matches, saved on this device and Home indicator',async({page,baseURL},testInfo)=>{
 test.setTimeout(120000); const world=await ready(page,baseURL);
 try{
  await page.evaluate(() => localStorage.removeItem('gtl.trends.saved'));
  await group(page,'Trends section').getByRole('button',{name:'Build',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Build a trend',exact:true})).toBeVisible();
  const result=page.locator('[data-builder=result]');
  await expect(result.locator('[data-builder=label]')).toHaveText('Found by search — not tested');
  await group(page,'Builder side').getByRole('button',{name:'Road team',exact:true}).click();
  const add=page.getByRole('combobox',{name:'Add a condition',exact:true});
  await add.selectOption({label:'Not a divisional game'});
  await expect(result.getByRole('heading',{level:3})).toHaveText('Spread · Road team · Not a divisional game');
  for (const text of ['Record (W-L-P)','Wilson 95% interval','Illustrative units at -110','Built on 2002–2017','Held out 2018 on']) await expect(result).toContainText(text);
  await expect(result).not.toContainText(/\bROI\b/);
  await expect(result.locator('[data-builder=split-label]')).not.toBeEmpty();
  await result.getByText(/^Contributing games · \d+/).click();
  await expect(result.getByRole('region',{name:'Contributing games, newest first'}).getByRole('row')).toHaveCount(26);
  // The fixture week's four games are all non-divisional; the road team is known without any line.
  const week=page.locator('[data-builder=week]');
  await expect(week.locator('[data-builder=match-count]')).toHaveText('4 upcoming games fit this trend.');
  await expect(week.locator('[data-match=fits]').first()).toContainText('Fits · backs');
  // A line condition on a market this player has not opened: each game says how it opens, with no line.
  await add.selectOption({label:'Total'});
  await expect(week.locator('[data-match=locked]')).toHaveCount(4);
  await expect(week.locator('[data-match=fits]')).toHaveCount(0);
  await noSentinel(page);
  await add.selectOption({label:'Primetime kickoff (7 PM ET or later)'});
  await expect(page.getByRole('combobox',{name:'Add a condition',exact:true})).toHaveCount(0);
  await expect(page.getByText('3 conditions is the most a trend can have.')).toBeVisible();
  await page.getByRole('button',{name:'Remove condition: Total 41 or more',exact:true}).click();
  await page.getByRole('button',{name:'Remove condition: Primetime kickoff (7 PM ET or later)',exact:true}).click();
  await page.getByRole('button',{name:'Save trend',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Saved on this device.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeDisabled();
  const saved=page.locator('[data-builder=saved]');
  await expect(saved.locator('[data-builder=saved-matches]')).toHaveText('Matches this week · 4');
  await page.setViewportSize({width:320,height:844}); await phone(page);
  for (const theme of ['light','dark']) {
   await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme); await page.emulateMedia({colorScheme:theme});
   await page.getByRole('heading',{name:'Build a trend',exact:true}).scrollIntoViewIfNeeded(); await page.screenshot({path:testInfo.outputPath(`builder-controls-${theme}.png`)});
   await result.scrollIntoViewIfNeeded(); await page.screenshot({path:testInfo.outputPath(`builder-${theme}.png`)});
   await week.scrollIntoViewIfNeeded(); await page.screenshot({path:testInfo.outputPath(`builder-week-${theme}.png`)});
   expect((await new AxeBuilder({page}).include('[data-builder=root]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});
  await group(page,'Trends section').getByRole('button',{name:'This Week',exact:true}).click();
  await expect(page.getByRole('region',{name:'Saved trends'})).toContainText('1 of 1 saved trend matches this week');
  await nav(page).getByRole('button',{name:'Home',exact:true}).click();
  const row=page.locator('[data-home=saved-trends]');
  await expect(row).toContainText('Saved trends · Matches this week');
  await expect(row).toContainText('1 of 1 saved trend matches this week');
  await page.reload();
  await expect(page.locator('[data-home=saved-trends]')).toContainText('1 of 1 saved trend matches this week');
  await page.locator('[data-home=saved-trends]').click();
  await expect(page.getByRole('heading',{name:'Build a trend',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete saved trend: Spread · Road team · Not a divisional game',exact:true}).click();
  await expect(page.getByText('No saved trends on this device yet.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtl.trends.saved')).items)).toEqual([]);
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
