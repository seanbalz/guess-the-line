import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerEplError } from '../../cloud/epl.mjs';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { assertCaptureTheme, setCaptureTheme } from './theme-capture.mjs';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Disposable local PGlite required.'));
// The earlier sixteen #research/games captures are frozen historical source1ba
// evidence. The expanded authority maps that named section compact; these native
// counterchecks now exercise the actual distinct ResearchLanding. Never relabel
// or overwrite the old pictures as this newer source.
const output = path.resolve('design/prism-research-root-navigation-native-2026-11-07');
const capturing = process.env.GTL_NAVIGATION_CAPTURE === '1';
const nav = page => page.getByRole('navigation', { name: 'Main', exact: true });
const sport = (page, name) => page.getByRole('navigation', { name: 'Sports', exact: true }).getByRole('button', { name, exact: true });
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function fixture(page, baseURL, access) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  // Same capability adapter as existing EPL browser fixtures. Account, NFL reads,
  // permissions and EPL manager reads still use the real handler and local SQL.
  await page.route('**/functions/v1/gtl-api/lobby', async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { headers: req.headers() }));
    await route.fulfill({ status: response.status, json: { ...await response.json(), epl: access } });
  });
  const rpc = async (name, args) => {
    if (!/^gtl_[a-z0-9_]+$/.test(name) || !Object.keys(args).every(key => /^p_[a-z0-9_]+$/.test(key))) throw new Error('Invalid fixture identifier');
    try {
      return await world.db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
      });
    } catch (error) { throw providerEplError(error.message); }
  };
  const handler = createCloudHandler({
    authenticate: async token => world.users.has(token) ? { ...world.users.get(token), emailConfirmed: true } : null,
    epl: { rpc, readSnapshots: async () => [], readBonus: async () => [] },
  });
  await page.route('**/functions/v1/gtl-api/epl/**', async route => {
    const req = route.request();
    const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return world;
}

async function frameProof(page, { access, epl, failed }) {
  await expect(nav(page).locator('[data-tab="research"]')).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('button')).toHaveCount(4);
  await expect(sport(page, 'National Football League')).toHaveAttribute('aria-pressed', String(!epl));
  await expect(sport(page, 'Premier League')).toHaveCount(access ? 1 : 0);
  if (access) await expect(sport(page, 'Premier League')).toHaveAttribute('aria-pressed', String(epl));
  await expect(page.getByRole('button', { name: /^(NBA|National Basketball Association)$/ })).toHaveCount(0);
  await expect(page.locator('.gx-league-btn')).toHaveAccessibleName(`League: ${epl ? 'FEPL' : 'Community'}. Switch league`);
  await expect(page.locator('.gx-app')).not.toHaveAttribute('inert', '');
  const proof = await page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
    const selectors = ['.gx-topbar', '.gx-sport-controls', '.gx-tabbar', ...document.querySelector('.gx-toast') ? ['.gx-toast'] : []];
    const targets = selectors.flatMap(selector => [...document.querySelectorAll(`${selector} button`)].filter(el => el.getClientRects().length).map(el => {
      const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim(), width:r.width, height:r.height };
    }));
    return { header:box('.gx-topbar'), sports:box('.gx-sport-controls'), tabs:box('.gx-tabbar'), toast:document.querySelector('.gx-toast') ? box('.gx-toast') : null,
      targets, circles:[...document.querySelectorAll('.gx-sport-mark')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius,images:[...el.querySelectorAll('img')].filter(img=>img.getClientRects().length).map(img=>({contain:getComputedStyle(img).objectFit,decoded:img.complete&&img.naturalWidth>0}))})),
      computedTheme:{stored:localStorage.getItem('gtl.theme'),preference:document.documentElement.dataset.themePreference,resolved:document.documentElement.dataset.theme,canvas:getComputedStyle(document.querySelector('.gx')).backgroundImage,ink:getComputedStyle(document.querySelector('.gx')).color},
      overflow:document.documentElement.scrollWidth>innerWidth };
  });
  expect(proof.overflow).toBe(false);
  expect(proof.sports.y).toBeGreaterThanOrEqual(proof.header.bottom);
  const barWidth=Math.min(page.viewportSize().width-32,488);
  expect(proof.tabs.x).toBe((page.viewportSize().width-barWidth)/2); expect(proof.tabs.width).toBe(barWidth);
  expect(proof.tabs.height).toBe(72);expect(proof.tabs.bottom).toBe(page.viewportSize().height-12);
  expect(proof.targets.filter(t=>t.width<43.9||t.height<43.9)).toEqual([]);
  for (const circle of proof.circles) {
    expect(circle.width).toBe(52); expect(circle.height).toBe(52);
    expect(circle.radius === '50%' || parseFloat(circle.radius) >= circle.width / 2).toBe(true);
    expect(circle.images).toEqual([{contain:'contain',decoded:true}]);
  }
  for (const label of await nav(page).locator('.gx-tab-label').all()) await expect(label).toHaveCSS('font-size', page.viewportSize().width<359?'13px':'14px');
  if (failed) {
    await expect(page.locator('.gx-toast')).toContainText('That couldn’t open.');
    await expect(page.locator('.gx-toast').getByRole('button', { name:'Reload the app',exact:true })).toBeVisible();
    await expect(page.locator('[role="status"][aria-live="assertive"]')).toContainText('That couldn’t open.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(proof.toast.bottom).toBeLessThanOrEqual(proof.tabs.y - 7.5);
    await expect(page.locator('.gx-toast-text')).toHaveCSS('font-size', '16px');
  } else expect(await page.evaluate(layoutProblems)).toEqual([]);
  const scan = await new AxeBuilder({ page }).include('.gx-topbar').include('.gx-sport-controls').include('.gx-tabbar').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(scan.violations.map(v=>v.id)).toEqual([]);
  return proof;
}

for (const scenario of [
  {name:'navigation-nfl',access:true,epl:false},
  {name:'navigation-epl',access:true,epl:true},
  {name:'navigation-nfl-only',access:false,epl:false},
  {name:'navigation-layer-failed',access:true,epl:false,failed:true},
]) test(`Research native ${scenario.name} keeps approved contextual frame and actual controllers`, async ({page,baseURL}) => {
  const world = await fixture(page,baseURL,scenario.access);
  const captures = [], blocked = [];
  try {
    await page.goto(`/${scenario.epl ? '#epl/research' : '#research'}`);
    await signIn(page,'luke',{navigate:false});
    if(scenario.epl) await expect(page.getByRole('heading',{name:'FEPL Fantasy',exact:true})).toBeVisible();
    else await expect(page.locator('[data-landing=research]')).toBeVisible();
    if(scenario.failed) {
      await page.route(/\/ExportSheet-[^/]+\.js$/, async route=>{blocked.push(new URL(route.request().url()).pathname);await route.abort('failed');});
      await page.getByRole('button',{name:'Your menu',exact:true}).click();
      await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'Export my data',exact:true}).click();
      await expect(page.locator('.gx-toast')).toBeVisible();
      expect(blocked).toHaveLength(1);
    }
    for(const theme of ['dark','light']) for(const width of [390,320]) {
      await setCaptureTheme(page,theme);await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));
      await expect.poll(()=>page.locator('.gx-sport-mark img:visible').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
      const proof=await frameProof(page,scenario);await assertCaptureTheme(page,theme);
      expect(proof.computedTheme.stored).toBe(theme);
      if(capturing) {
        fs.mkdirSync(output,{recursive:true});const file=`${scenario.name}-${theme}-${width}.png`;
        await page.screenshot({path:path.join(output,file)});
        captures.push({file,sha256:sha256(path.join(output,file)),theme,width,height:844,route:new URL(page.url()).hash,...proof});
      }
    }
    if(scenario.failed) {
      const navigation=page.waitForNavigation();
      await page.locator('.gx-toast').getByRole('button',{name:'Reload the app',exact:true}).click();await navigation;
      await expect(page.locator('[data-landing=research]')).toBeVisible();await expect(page.locator('.gx-toast')).toHaveCount(0);
      await expect(nav(page).locator('[data-tab="research"]')).toHaveAttribute('aria-current','page');
      expect(world.errors.filter(error=>!/Failed to fetch dynamically imported module/.test(error))).toEqual([]);
    } else {
      await page.locator('.gx-league-btn').click();const leagues=page.getByRole('dialog',{name:'Your leagues',exact:true});await expect(leagues).toBeVisible();
      await expect(leagues).toContainText(scenario.epl?'FEPL':'Community');await page.keyboard.press('Escape');await expect(page.locator('.gx-league-btn')).toBeFocused();
      if(scenario.access) {
        await sport(page,scenario.epl?'National Football League':'Premier League').click();
        await expect(nav(page).locator('[data-tab="research"]')).toHaveAttribute('aria-current','page');
        if(scenario.epl) {
          // The existing cross-sport adapter preserves Fantasy, a positively
          // approved compact NFL section. Its real root still opens the league.
          await expect(page).toHaveURL(/#research\/fantasy$/);
          await expect(page.locator('.gx')).toHaveAttribute('data-frame-context','research-fantasy');
          await expect(sport(page,'National Football League')).toHaveAttribute('aria-pressed','true');
          await nav(page).getByRole('button',{name:'Research',exact:true}).click();
          await expect(page.locator('[data-landing=research]')).toBeVisible();
        }
        await expect(page.locator('.gx-league-btn')).toHaveAccessibleName(`League: ${scenario.epl?'Community':'FEPL'}. Switch league`);
      } else {
        await page.goto('/#epl/research');await expect(page.locator('[data-landing=research]')).toBeVisible();
        await expect(page.locator('.gx-epl')).toHaveCount(0);await expect(sport(page,'Premier League')).toHaveCount(0);
      }
      expect(world.errors).toEqual([]);
    }
    if(capturing)fs.writeFileSync(path.join(output,`${scenario.name}.json`),JSON.stringify({scenario,captures,blocked,expectedPageErrors:world.errors,limits:scenario.epl?'Actual FEPL Research controller with no stored fantasy snapshots; no invented destination body.':undefined},null,2)+'\n');
  } finally {await page.unrouteAll({behavior:'wait'});await page.close();await world.db.close();}
});
