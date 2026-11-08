import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { setNativeActionTheme } from '../helpers/native-action-theme.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

// Explicit refresh mode only; ordinary checks write ignored Playwright artifacts.
const capture = process.env.GTL_CAPTURE_OVERVIEW_FRAME === '1';
const evidence = path.resolve('design/prism-overview-frame-native-2026-11-07');
const nav = page => page.getByRole('navigation', { name: 'Main', exact: true });
const tab = (page, name) => nav(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
const root = page => page.locator('.gx').first();
const rgb = hex => `rgb(${hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')})`;
const tokens = JSON.parse(fs.readFileSync('design/tokens-next.json','utf8'));
test.use({viewport:{width:390,height:844},reducedMotion:'reduce'});
test.setTimeout(180000);
test.beforeEach(()=>expect(pgliteAvailable,'Disposable PGlite 0.5.8 required; no hosted data').toBe(true));
async function shot(page, info, name, fullPage=false) {
  if(capture) fs.mkdirSync(evidence,{recursive:true});
  await page.screenshot({path:capture?path.join(evidence,`${name}.png`):info.outputPath(`${name}.png`),fullPage});
}
async function enableEpl(page, world) {
  await page.route('**/functions/v1/gtl-api/lobby',async route=>{
    const req=route.request(),response=await world.handler(new Request(req.url(),{headers:req.headers()}));
    await route.fulfill({status:response.status,json:{...await response.json(),epl:true}});
  });
}
async function compact(page, name, theme, width, forced=false) {
  await expect(root(page)).toHaveClass(/gx-overview-frame/);
  expect(await root(page).evaluate(el=>el.classList.contains('gx-home-design'))).toBe(name==='home');
  await expect(page.locator('.gx-topbar .gx-home-sports')).toBeVisible();
  await expect(page.locator('.gx-sport-controls')).toHaveCount(0);
  await expect(page.locator('.gx-league-btn')).toHaveCount(0);
  await expect(page.locator('.gx-topbar')).toHaveCSS('position','relative');
  await expect(page.locator('.gx-topbar-inner')).toHaveCSS('height','64px');
  expect(await page.locator('.gx-home-brand').evaluate(el=>getComputedStyle(el).backgroundColor.endsWith(', 0)'))).toBe(true);
  await expect(page.locator('.gx-home-brand img:visible')).toHaveCount(1);
  for(const mark of await page.locator('.gx-home-sport').all()) {
    await expect(mark).toHaveCSS('border-radius','50%');
    await expect(mark).toHaveCSS('width','52px');await expect(mark).toHaveCSS('height','52px');
    await expect(mark.locator('img:visible')).toHaveCSS('object-fit','contain');
    expect(await mark.locator('img:visible').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  const geometry=await nav(page).boundingBox();
  expect(geometry.height).toBe(72);expect(geometry.width).toBe(Math.min(width-32,488));
  expect(geometry.x).toBe((width-geometry.width)/2);expect(geometry.y+geometry.height).toBe(832);
  const active=nav(page).locator('[aria-current=page]');
  await expect(active).toHaveAttribute('data-tab',name);
  const targets=await page.locator('.gx-topbar button,.gx-tabbar button').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44;}).map(el=>el.getAttribute('aria-label')));
  expect(targets).toEqual([]);
  if(!forced) {
    await expect(active.locator('.gx-tab-label')).toHaveCSS('color',rgb(tokens.themes[theme].color['home-accent']));
    await expect(root(page)).toHaveCSS('color',rgb(tokens.themes[theme].color['home-ink']));
    // Compare the computed gradient with the canonical token using browser serialization.
    expect(await root(page).evaluate(el=>{const s=document.createElement('i');s.style.backgroundImage=getComputedStyle(el).getPropertyValue('--gx-home-background');el.append(s);const expected=getComputedStyle(s).backgroundImage;s.remove();return getComputedStyle(el).backgroundImage===expected;})).toBe(true);
  } else await expect(active).toHaveCSS('border-top-width','2px');
  expect(await page.evaluate(layoutProblems)).toEqual([]);
}
async function native(page) {
  await expect(root(page)).not.toHaveClass(/gx-overview-frame|gx-home-design/);
  await expect(page.locator('.gx-topbar')).toHaveCSS('position','sticky');
  await expect(page.locator('.gx-sport-controls')).toBeVisible();
  await expect(page.locator('.gx-league-btn')).toBeVisible();
  await expect(nav(page)).toHaveCSS('left','0px');await expect(nav(page)).toHaveCSS('border-radius','0px');
}
for(const name of ['home','play','bets']) for(const theme of ['dark','light']) test(`direct ${name} ${theme}: approved frame, full-root scroll and keyboard`,async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await enableEpl(page,world);
    await page.addInitScript(value=>localStorage.setItem('gtl.theme',value),theme);
    await page.goto(`/#${name}`);await signIn(page,'luke',{navigate:false});
    await expect(page.getByRole('heading',{name:name[0].toUpperCase()+name.slice(1),level:1,exact:true})).toBeVisible();
    await expect(page.locator('[data-skeleton=landing]')).toHaveCount(0);
    for(const width of [390,320,768]) {
      await page.setViewportSize({width,height:844});await setNativeActionTheme(page,theme);
      await page.evaluate(()=>scrollTo(0,0));await compact(page,name,theme,width);
      await shot(page,info,`${name}-${theme}-${width}-full`,true);
      expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      const last=page.locator('main button:visible,main summary:visible').last();
      await last.focus();await expect(last).toBeFocused();
      const box=await last.boundingBox(),dock=await nav(page).boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(dock.y-8);
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      await shot(page,info,`${name}-${theme}-${width}-bottom`);
    }
    await page.setViewportSize({width:320,height:844});await page.emulateMedia({forcedColors:'active'});await page.evaluate(()=>scrollTo(0,0));
    await compact(page,name,theme,320,true);await shot(page,info,`${name}-${theme}-forced-320`);await page.emulateMedia({forcedColors:'none'});
    // Same overview under a modal retains its frame, while background is inert and focus stays in the sheet.
    await page.getByRole('button',{name:'Your menu',exact:true}).click();const menu=page.getByRole('dialog',{name:'Menu',exact:true});
    await expect(page.locator('.gx-app')).toHaveAttribute('inert','');await expect(root(page)).toHaveClass(/gx-overview-frame/);
    await page.keyboard.press('Tab');expect(await menu.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Your menu',exact:true})).toBeFocused();
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('overview boundaries, Back, Research league access and Play League access',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await page.goto('/#play');await signIn(page,'luke',{navigate:false});
    await expect(page.locator('[data-play-tile=league] button')).toBeVisible();
    await page.locator('[data-play-tile=league] button').click();await compact(page,'play','dark',390);
    await page.getByRole('button',{name:'Your leagues',exact:true}).click();await expect(page.getByRole('dialog',{name:'Your leagues',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await page.locator('.gx-detail-nav').getByRole('button',{name:'Back',exact:true}).click();await expect(root(page)).toHaveClass(/gx-overview-frame/);
    await tab(page,'Bets').click();await page.getByRole('button',{name:'Overview',exact:true}).click();await compact(page,'bets','dark',390);
    await page.locator('.gx-detail-nav').getByRole('button',{name:'Back',exact:true}).click();await expect(root(page)).toHaveClass(/gx-overview-frame/);
    await tab(page,'Research').click();await native(page);
    await page.getByRole('button',{name:'League: Community. Switch league',exact:true}).click();await expect(page.getByRole('dialog',{name:'Your leagues',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'League: Community. Switch league',exact:true})).toBeFocused();
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('EPL approved Play frame and a pending NFL guess still guard the header sport switch',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await enableEpl(page,world);
    await page.route('**/functions/v1/gtl-api/epl/**',route=>route.fulfill({json:{season:2026,week:9,status:'open',deadline:'2099-10-31T12:30:00Z',order:[],picks:[],clubs:[],me:null,fixtures:[],guesses:[],weeks:[],available:false,reason:'prices_not_verified'}}));
    await page.goto('/#play');await signIn(page,'luke',{navigate:false});
    await expect(page.locator('.gx-topbar .gx-home-sport')).toHaveCount(2);
    await page.getByRole('group',{name:'Guess market',exact:true}).getByRole('button',{name:'Spread',exact:true}).click();
    await page.locator('.gx-per-game [data-tile]').first().click();await compact(page,'play','dark',390);
    await page.getByRole('button',{name:/Pick'em/i}).first().click();
    const before=page.url();let asks=0;
    page.once('dialog',dialog=>{asks++;return dialog.dismiss();});
    await page.getByRole('button',{name:'Premier League',exact:true}).click();
    expect(asks).toBe(1);expect(page.url()).toBe(before);await expect(page.locator('.gx-per-game [data-game]')).toBeVisible();
    page.once('dialog',dialog=>{asks++;return dialog.accept();});
    await page.getByRole('button',{name:'Premier League',exact:true}).click();
    await expect(page.getByRole('button',{name:'Premier League',exact:true})).toHaveAttribute('aria-pressed','true');expect(asks).toBe(2);
    await compact(page,'play','dark',390);await tab(page,'Bets').click();await native(page);await expect(page.getByText("Bets aren't available for the Premier League.",{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'National Football League',exact:true}).click();
    await expect(root(page)).toHaveClass(/gx-overview-frame/);
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('overview floating dock and toast stay clear through full-root keyboard resize and close',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await page.goto('/#bets');await signIn(page,'luke',{navigate:false});await expect(root(page)).toHaveClass(/gx-overview-frame/);
    // Chromium has no mobile keyboard. These DOM probes exercise the unchanged ResizeObserver/viewport pin at the real frame.
    await page.evaluate(()=>{
      const input=document.createElement('input');input.setAttribute('aria-label','Overview keyboard probe');document.querySelector('main').append(input);
      const probe=document.createElement('div');probe.className='gx-dock-bar';probe.style.height='48px';probe.textContent='Dock clearance probe';document.querySelector('.gx-dock').append(probe);
      const toast=document.createElement('div');toast.className='gx-toast';toast.textContent='Toast clearance probe';document.querySelector('.gx').append(toast);
    });
    const pinned=async height=>{
      await expect.poll(()=>page.evaluate(()=>{
        const bar=document.querySelector('.gx-tabbar').getBoundingClientRect(),dock=document.querySelector('.gx-dock').getBoundingClientRect(),toast=document.querySelector('.gx-toast').getBoundingClientRect();
        return {bottom:bar.bottom,visible:visualViewport.height+visualViewport.offsetTop,dockGap:bar.top-dock.bottom,toastGap:dock.top-toast.bottom};
      })).toEqual({bottom:height-12,visible:height,dockGap:8,toastGap:8});
    };
    for(let round=0;round<2;round++) {
      await page.getByRole('textbox',{name:'Overview keyboard probe'}).focus();
      await page.setViewportSize({width:390,height:504});await pinned(504);
      await page.evaluate(()=>document.activeElement.blur());await page.setViewportSize({width:390,height:844});await pinned(844);
    }
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
async function receiptFixture(world, settled) {
  const {season,week}=world.state.league,game=world.state.games[0],name=settled?'Settled receipt fixture':'Open receipt fixture';
  let read=await world.api('luke','social/read',{season,week});expect(read.status).toBe(200);
  let reply=await world.api('luke','social/create',{season,week,weekRevision:read.body.weekRevision,requestId:crypto.randomUUID(),kind:'single',legs:[{gameId:game.id,market:'prop',side:name,line:30,selection:`${name} 30+ receiving yards`}],stakeUnits:1,odds:100,source:'Book A',notes:name});
  expect(reply.status).toBe(200);let entry=reply.body.entries.find(e=>e.notes===name);
  if(settled) {
    reply=await world.api('luke','social/settle',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),entryId:entry.id,revision:entry.revision,outcome:'win',actualReturnUnits:null,reason:'Local fictional result'});
    expect(reply.status).toBe(200);entry=reply.body.entries.find(e=>e.id===entry.id);
  }
  return entry;
}
for(const theme of ['dark','light']) test(`approved receipt-opening routes ${theme}; generic lists and local expansion retain native frame`,async({page,baseURL},info)=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    const entries=[await receiptFixture(world,false),await receiptFixture(world,true)];
    await enableEpl(page,world);
    await page.addInitScript(value=>localStorage.setItem('gtl.theme',value),theme);
    await page.goto('/#bets');await signIn(page,'luke',{navigate:false});
    for(const entry of entries) {
      const kind=entry.outcome==='pending'?'open':'settled',action=entry.outcome==='pending'?'Open':'View';
      await page.getByRole('button',{name:`${action} ${entry.legs[0].selection}`,exact:true}).click();
      await expect(page.locator('.gx-tracked-expanded')).toBeVisible();
      await expect(page.locator('.gx-tracked-expanded')).toContainText(entry.outcome==='pending'?'To return':'Net units');
      for(const width of [390,320]) {
        await page.setViewportSize({width,height:844});await setNativeActionTheme(page,theme);await page.evaluate(()=>scrollTo(0,0));
        await compact(page,'bets',theme,width);await shot(page,info,`${kind}-ticket-${theme}-${width}-full`,true);
        expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
        await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
        const last=page.locator('main button:visible,main summary:visible').last();await last.focus();await expect(last).toBeFocused();
        const box=await last.boundingBox(),dock=await nav(page).boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(dock.y-8);
        expect(await page.evaluate(layoutProblems)).toEqual([]);await shot(page,info,`${kind}-ticket-${theme}-${width}-bottom`);
      }
      await page.locator('.social-filters > summary').click();
      const markets=page.getByRole('group',{name:'Market filter',exact:true});
      await markets.getByRole('button',{name:'Spreads',exact:true}).click();
      await expect(page.locator('.gx-tracked-row')).toHaveCount(0);await expect(page.getByText('No bets match these filters.',{exact:true})).toBeVisible();
      // Opening intent is not a fabricated receipt or live row telemetry when filters hide the ticket.
      await expect(root(page)).toHaveClass(/gx-overview-frame/);
      await markets.getByRole('button',{name:'All markets',exact:true}).click();
      await expect(page.locator('.gx-tracked-expanded:visible')).toContainText(entry.legs[0].selection.replace(' 30+ receiving yards',''));
      await page.locator('.social-filters > summary').click();
      // Local collapse does not change the existing route opening intent or invent live shared row state.
      await page.locator('.gx-tracked-collapse:visible').click();await expect(root(page)).toHaveClass(/gx-overview-frame/);
      await page.locator('.gx-detail-nav').getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('[data-landing=bets]')).toBeVisible();
      await page.getByText('All ticket views',{exact:true}).click();
      await page.getByRole('button',{name:kind==='open'?'Active tickets':'Settled tickets',exact:true}).click();
      await native(page);await page.locator('.gx-tracked-preview').click();await native(page);
      await page.locator('.gx-detail-nav').getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('[data-landing=bets]')).toBeVisible();
    }
    await page.getByRole('button',{name:'Your menu',exact:true}).click();
    await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'Sign out',exact:true}).click();
    await expect(page.locator('form.auth-form')).toBeVisible();await signIn(page,'troy',{navigate:false});
    await expect(page.locator('[data-landing=bets]')).toBeVisible();await expect(page.locator('.gx-ticket-previews')).toHaveCount(0);await expect(page.locator('.gx-tracked-row')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Open receipt fixture');await expect(page.locator('main')).not.toContainText('Settled receipt fixture');
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
