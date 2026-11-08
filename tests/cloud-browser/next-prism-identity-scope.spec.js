import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { assertNativeActionTheme, setNativeActionTheme } from '../helpers/native-action-theme.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required.'));
const output = path.resolve('design/prism-identity-scope-native-2026-11-07');
async function capture(page, name) {
  fs.mkdirSync(output, { recursive: true });
  for (const state of [{theme:'dark',width:390},{theme:'light',width:390},{theme:'dark',width:320},{theme:'light',width:320},{theme:'light',width:320,forced:true}]) {
    await setNativeActionTheme(page,state.theme);
    await page.setViewportSize({width:state.width,height:844});
    await page.emulateMedia({forcedColors:state.forced?'active':'none'});
    const scope=await page.locator('dialog[open]').count()?page.locator('dialog[open]').last():page.locator('.gx-sheet:visible').last();
    const body=await scope.locator('.gx-sheet-body').count()?scope.locator('.gx-sheet-body'):scope;
    await body.evaluate(el=>{el.scrollTop=0;});
    expect(await page.evaluate(layoutProblems)).toEqual([]);
    const targets=await scope.evaluate(root=>[...root.querySelectorAll('button,a[href],input,summary')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]')).filter(el=>{const r=el.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(el=>el.textContent));
    expect(targets).toEqual([]);
    for(const row of await scope.locator('.gx-link-row:visible,.gx-menu-signout:visible,.gx-t-body:visible,.gx-dialog-text:visible').all()) await expect(row).toHaveCSS('font-size','16px');
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
    await assertNativeActionTheme(page,state.theme);
    const suffix=state.forced?'forced-320':`${state.theme}-${state.width}`;
    await page.screenshot({path:path.join(output,`${name}-${suffix}.png`)});
    const last=scope.locator('button:not(:disabled)').last();
    if(await last.count()) {
      await last.focus();await expect(last).toBeFocused();
      if(!(await scope.evaluate(el=>el.matches('dialog')))) {
        await page.keyboard.press('Tab');
        expect(await scope.evaluate(el=>el.contains(document.activeElement))).toBe(true);
      }
    }
    await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    expect(await page.evaluate(layoutProblems)).toEqual([]);
    await assertNativeActionTheme(page,state.theme);
    await page.screenshot({path:path.join(output,`${name}-${suffix}-scrolled.png`)});
  }
  await page.emulateMedia({forcedColors:'none'});
}
async function open(page,account='luke') {
  await page.goto('/#research/games');await signIn(page,account,{navigate:false});
  await expect(page.locator('.gx-game-card').first()).toBeVisible();
}
async function externalSignOut(page) {
  await page.evaluate(()=>{
    const key=Object.keys(localStorage).find(k=>/^sb-.*-auth-token$/.test(k));
    if(!key)throw new Error('Missing fixture session');
    localStorage.removeItem(key);const channel=new BroadcastChannel(key);
    channel.postMessage({event:'SIGNED_OUT',session:null});channel.close();
  });
  await expect(page.locator('form.auth-form').getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
}
for(const scenario of [{name:'menu',account:'luke',push:true},{name:'menu-admin',account:'sean',push:true},{name:'menu-no-reminders',account:'luke',push:false}]) {
  test(`native ${scenario.name} preserves actual menu gates and scroll reachability`,async({page,baseURL})=>{
    const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true,...(scenario.push?{pushPublicKey:'B'+'A'.repeat(86)}:{})});
    let release;
    try {
      await open(page,scenario.account);await page.getByRole('button',{name:'Your menu',exact:true}).click();
      const menu=page.getByRole('dialog',{name:'Menu',exact:true});
      await expect(menu.getByRole('button',{name:'Commissioner tools',exact:true})).toHaveCount(scenario.account==='sean'?1:0);
      await expect(menu.getByRole('button',{name:'Pick reminders',exact:true})).toHaveCount(scenario.push?1:0);
      await capture(page,scenario.name);
      if(scenario.name==='menu') {
        let logouts=0;
        await page.route(url=>url.origin===SUPABASE&&url.pathname==='/auth/v1/logout',async route=>{logouts++;await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{}});});
        await menu.getByRole('button',{name:'Sign out',exact:true}).click();
        const busy=menu.getByRole('button',{name:'Signing out…',exact:true});await expect(busy).toHaveAttribute('aria-disabled','true');
        await capture(page,'menu-busy');
        // aria-disabled remains focusable; the controller blocks duplicate activation.
        await busy.evaluate(el=>el.click());expect(logouts).toBe(1);release();
        await expect(page.locator('form.auth-form')).toBeVisible();await expect(menu).toHaveCount(0);
      } else {
        await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Your menu',exact:true})).toBeFocused();
      }
      expect(world.errors).toEqual([]);
    } finally {release?.();await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
  });
}
test('saved scope refuses a changed authenticated week through the real refresh controller',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await open(page);await page.locator('.gx-game-card').first().locator('.gx-game-actions button').last().click();
    await page.getByRole('button',{name:/^Open your Spread pick\./}).click();
    const pick=page.getByRole('dialog',{name:'Your Spread pick',exact:true});await expect(pick.getByRole('button',{name:'Refresh saved pick',exact:true})).toBeVisible();
    await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/gtl-api/personal'),async route=>{
      const req=route.request(),response=await world.handler(new Request(req.url(),{method:req.method(),headers:req.headers()}));
      const data=await response.json();data.week+=1;
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),json:data});
    });
    await pick.getByRole('button',{name:'Refresh saved pick',exact:true}).click();
    await expect(pick).toContainText('This saved pick is not in the current account and week.');
    await expect(pick.getByRole('list',{name:'Community Spread guesses'})).toHaveCount(0);
    await expect(pick.getByRole('button',{name:'Open Spread in Play',exact:true})).toHaveCount(0);
    await capture(page,'saved-scope');
    await pick.getByRole('button',{name:'Back to game',exact:true}).click();await expect(pick).not.toBeVisible();
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('external account transition purges an open forfeit and saved sheet without a write',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    let writes=0;page.on('request',req=>{if(req.url().endsWith('/community/forfeit')&&req.method()==='POST')writes++;});
    await open(page);await page.getByRole('button',{name:'See picks now',exact:true}).click();
    await expect(page.getByRole('alertdialog').getByRole('button',{name:'Confirm sit-out and reveal',exact:true})).toBeVisible();
    await externalSignOut(page);await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await signIn(page,'troy',{navigate:false});await expect(page.locator('.gx-game-card').first()).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);expect(writes).toBe(0);
    await page.locator('.gx-game-card').first().locator('.gx-game-actions button').last().click();
    await page.getByRole('button',{name:/^Open your Spread pick\./}).click();
    await expect(page.getByRole('dialog',{name:'Your Spread pick',exact:true})).toBeVisible();
    await externalSignOut(page);await expect(page.getByRole('dialog',{name:'Your Spread pick',exact:true})).toHaveCount(0);
    await signIn(page,'luke',{navigate:false});await expect(page.getByRole('navigation',{name:'Main'})).toBeVisible();
    await expect(page.getByRole('dialog',{name:'Your Spread pick',exact:true})).toHaveCount(0);expect(writes).toBe(0);
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('approved Games labels, native circles and full team action names keep their actual layout',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  try {
    await open(page);
    const card=page.locator('.gx-game-card').first();
    const names=await card.locator('.gx-game-team > strong').allTextContents();
    expect(await card.locator('.gx-game-bar > span:first-child').allTextContents()).toEqual(names);
    for(const theme of ['dark','light']) for(const width of [390,320]) {
      await setNativeActionTheme(page,theme);await page.setViewportSize({width,height:844});
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      const logos=card.locator('.gx-team');
      for(const mark of await logos.all()) {
        await expect(mark).toHaveClass(/gx-team--loaded/);
        await expect(mark).toHaveCSS('border-radius','50%');
        await expect(mark.locator('img')).toHaveCSS('object-fit','contain');
      }
      const brand=page.locator('.gx-prism-brand');await expect(brand).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(brand.locator('img:visible')).toHaveCount(1);
      await assertNativeActionTheme(page,theme);
      await page.screenshot({path:path.join(output,`identity-games-${theme}-${width}.png`),fullPage:true});
    }
    await card.locator('.gx-game-actions button').last().click();
    for(const market of ['Spread','Total','League bets']) await expect(page.getByRole('navigation',{name:'Actions for this game'}).getByRole('button',{name:`Open ${market} for ${names[0]} at ${names[1]}`,exact:true})).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
test('sit-out operational prose stays 16px through real loading ready busy uncertain close and done controllers',async({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:ALL,optionalRpc:true});
  let releaseRead,releaseWrite;
  try {
    await open(page);
    const readGate=new Promise(resolve=>{releaseRead=resolve;});
    await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/community/read'),async route=>{await readGate;await route.fallback();});
    await page.getByRole('button',{name:'See picks now',exact:true}).click();
    const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('Checking this week’s status');
    await capture(page,'forfeit-loading');releaseRead();
    await expect(dialog.getByRole('button',{name:'Confirm sit-out and reveal',exact:true})).toBeVisible();
    await capture(page,'forfeit-ready');
    let writes=0;
    await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/community/forfeit'),async route=>{
      writes++;if(writes===1){await new Promise(resolve=>{releaseWrite=resolve;});return route.fulfill({status:503,json:{error:'Fictional lost reply'}});}return route.fallback();
    });
    await dialog.getByRole('button',{name:'Confirm sit-out and reveal',exact:true}).click();
    await expect(dialog).toContainText('Confirming saved sit-out');
    await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
    await capture(page,'forfeit-busy');expect(writes).toBe(1);releaseWrite();
    await expect(dialog).toContainText('Your sit-out is unconfirmed');await capture(page,'forfeit-unconfirmed');
    await page.keyboard.press('Escape');await expect(dialog).toHaveAccessibleName('Close unconfirmed sit-out?');
    await capture(page,'forfeit-close-warning');
    await page.keyboard.press('Escape');await expect(dialog.getByRole('button',{name:'Keep playing',exact:true})).toBeFocused();
    await dialog.getByRole('button',{name:'Check sit-out status',exact:true}).click();
    await expect(dialog).toContainText('No saved forfeit was found');
    await dialog.getByRole('button',{name:'Confirm sit-out and reveal',exact:true}).click();
    await expect(dialog).toHaveAccessibleName(`Week ${world.state.league.week} reveal confirmed`);expect(writes).toBe(2);
    await capture(page,'forfeit-done');
    await dialog.getByRole('button',{name:'Back to Research',exact:true}).click();await expect(dialog).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally {releaseRead?.();releaseWrite?.();await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
