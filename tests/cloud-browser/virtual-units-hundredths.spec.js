import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ALL, HOSTED, without } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines, SUPABASE } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { setNativeActionTheme } from '../helpers/native-action-theme.mjs';

test.use({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(90_000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required.'));
async function open(page, baseURL, migrations) {
  const world = await communityWorld(page, baseURL, { migrations, optionalRpc: true });
  const spread = Object.fromEntries(world.state.games.map(game => [game.id, -3.5]));
  await storeBookLines(world, { spread, total: Object.fromEntries(world.state.games.map(game => [game.id,44.5])) });
  await sendBallot(world,'luke','guess_spread',spread);
  await page.addInitScript(() => localStorage.setItem('gtl.app','next'));
  await page.goto('/#bets/virtual'); await signIn(page,'luke',{navigate:false});
  await page.locator('[data-bets="place"] [data-market="spread"] .gx-chip').first().click();
  await page.getByRole('button',{name:'Review slip',exact:true}).click();
  return { world, slip:page.getByRole('dialog',{name:'Your slip'}) };
}

// The schema just before M-41. M-41 is hosted since November 10, 2026 (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md), so the
// old-schema case leaves it out; a rolled-back or pre-apply project must still show only half-unit controls.
const BEFORE_M41 = without(HOSTED, '20261108022135_gtl_virtual_units_hundredths.sql');

test('old schema exposes only supported half-unit controls', async ({page,baseURL}) => {
  const {world,slip} = await open(page,baseURL,BEFORE_M41);
  try {
    await expect(slip.getByRole('spinbutton')).toHaveCount(0);
    await slip.getByRole('button',{name:'0.5 units',exact:true}).click();
    await expect(slip.getByRole('button',{name:'Half a unit less',exact:true})).toBeDisabled();
    await expect(slip.getByRole('button',{name:/^Place 1 bet/})).toBeEnabled();
  } finally { await world.db.close(); }
});

test('M-41 Custom preserves hundredths, quick floor, invalid text and exact uncertain retry', async ({page,baseURL}) => {
  const {world,slip} = await open(page,baseURL,ALL);
  let release;
  try {
    const field = slip.getByRole('spinbutton',{name:/Custom units for/});
    const save = slip.getByRole('button',{name:/^Place 1 bet/});
    await expect(field).toBeVisible();
    await slip.getByRole('button',{name:'0.5 units',exact:true}).click();
    await expect(field).toHaveValue('0.5');
    await expect(slip.getByRole('button',{name:'0.1 units less',exact:true})).toBeDisabled();
    await slip.getByRole('button',{name:'0.1 units more',exact:true}).click();
    await expect(field).toHaveValue('0.6');
    await field.fill('0.01');
    await slip.getByRole('button',{name:'0.1 units more',exact:true}).click();
    await expect(field).toHaveValue('0.11');
    await slip.getByRole('button',{name:'0.1 units less',exact:true}).click();
    await expect(field).toHaveValue('0.01');
    for(const value of ['','0.001','100.01','0.010000000001','0.999999999999']) {
      await field.fill(value); await expect(save).toBeDisabled(); await expect(field).toHaveValue(value);
      await expect(slip.getByRole('alert')).toContainText('up to two decimal places');
    }
    await field.fill('0.01');
    fs.mkdirSync('.local/virtual-custom-captures',{recursive:true});
    const checkField = async () => {
      const measured = await field.evaluate(input => {
        const label = input.closest('label'), bounds = input.getBoundingClientRect();
        return { labelSize:parseFloat(getComputedStyle(label).fontSize), inputSize:parseFloat(getComputedStyle(input).fontSize),
          inputWidth:bounds.width, inputHeight:bounds.height };
      });
      expect(measured.labelSize).toBeGreaterThanOrEqual(16);
      expect(measured.inputSize).toBeGreaterThanOrEqual(16);
      expect(measured.inputWidth).toBeGreaterThanOrEqual(44); expect(measured.inputHeight).toBeGreaterThanOrEqual(44);
      return measured;
    };
    const fieldEvidence = [];
    for(const [theme,width] of [['dark',320],['light',390]]) {
      await page.setViewportSize({width,height:844}); await setNativeActionTheme(page,theme);
      fieldEvidence.push({theme,viewportWidth:width,...await checkField()});
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      const audit = await new AxeBuilder({page}).include('.gx-sheet').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(audit.violations.map(row=>row.id)).toEqual([]);
      await page.screenshot({path:`.local/virtual-custom-captures/custom-${theme}-${width}.png`,fullPage:true});
    }
    await page.emulateMedia({forcedColors:'active'});
    await expect(field).toBeVisible();
    fieldEvidence.push({theme:'forced',viewportWidth:390,...await checkField()});
    await page.screenshot({path:'.local/virtual-custom-captures/custom-forced.png',fullPage:true});
    fs.writeFileSync('.local/virtual-custom-captures/typography.json',JSON.stringify(fieldEvidence,null,2));
    await page.emulateMedia({forcedColors:'none'});
    const writes=[];
    await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/gtl-api/bets/place'),async route=>{
      writes.push(route.request().postDataJSON());
      if(writes.length===1) { await new Promise(resolve=>{release=resolve;}); return route.fulfill({status:503,json:{error:'Fixture reply unavailable.'}}); }
      return route.fallback();
    });
    await save.click();
    await expect(slip.getByRole('button',{name:'Saving…'})).toBeDisabled();
    await expect(field).toBeDisabled();
    release(); release=null;
    await expect(slip.getByRole('button',{name:'Retry the same save'})).toBeVisible();
    await expect(field).toBeDisabled();
    await slip.getByRole('button',{name:'Retry the same save'}).click();
    await expect(slip).toBeHidden();
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    expect(writes[0].bets[0].units).toBe(0.01);
    const rows=(await world.db.query('select selection,audit from public.gtl_virtual_units_picks')).rows;
    expect(rows).toHaveLength(1); expect(rows[0].selection.units).toBe(0.01); expect(rows[0].audit).toHaveLength(1);
  } finally { release?.(); await world.db.close(); }
});

for (const failure of ['capability outage', 'SQL rollback']) test(`committed response loss then ${failure} retains exact retry through a refreshed fallback board`, async ({page,baseURL}) => {
  const {world,slip} = await open(page,baseURL,ALL);
  const writes = [], replies = [];
  try {
    await slip.getByRole('spinbutton',{name:/Custom units for/}).fill('0.01');
    await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/gtl-api/bets/place'),async route=>{
      writes.push(route.request().postData());
      const reply = await world.api('luke','bets/place',route.request().postDataJSON());
      replies.push(reply);
      if (writes.length===1) {
        expect(reply.status).toBe(200);
        if (failure==='SQL rollback') await world.db.exec(fs.readFileSync('supabase/rollback/20261108022135_gtl_virtual_units_hundredths.sql','utf8'));
        else await world.db.exec("create or replace function public.gtl_virtual_unit_rules() returns jsonb language plpgsql security invoker set search_path='' as $$ begin raise exception 'fixture capability outage'; end $$");
        return route.fulfill({status:503,json:{error:'Fixture committed response lost.'}});
      }
      return route.fulfill({status:reply.status,json:reply.body});
    });
    await slip.getByRole('button',{name:/^Place 1 bet/}).click();
    await expect(slip.getByRole('button',{name:'Retry the same save'})).toBeVisible();
    const before = (await world.db.query('select selection,audit from public.gtl_virtual_units_picks')).rows;
    expect(before).toHaveLength(1); expect(before[0].selection.units).toBe(0.01);
    await slip.getByRole('button',{name:'Close',exact:true}).click();
    const refreshed = page.waitForResponse(response=>response.url().endsWith('/gtl-api/bets/read'));
    await page.getByRole('button',{name:'Refresh prices',exact:true}).click();
    expect((await (await refreshed).json()).unitRules.hundredths).toBe(false);
    await page.getByRole('button',{name:'Review slip',exact:true}).click();
    await expect(slip.getByRole('button',{name:'Retry the same save'})).toBeEnabled();
    await slip.getByRole('button',{name:'Retry the same save'}).click();
    await expect(slip).toBeHidden();
    expect(writes).toHaveLength(2); expect(writes[1]).toBe(writes[0]);
    expect(replies[1].status).toBe(200); expect(replies[1].body.placed.replayed).toBe(true);
    expect((await world.db.query('select selection,audit from public.gtl_virtual_units_picks')).rows).toEqual(before);
    expect((await world.db.query('select count(*)::int n from public.gtl_bet_receipts')).rows[0].n).toBe(1);
    await page.locator('[data-bets="place"] [data-market="spread"] .gx-chip').first().click();
    await page.getByRole('button',{name:'Review slip',exact:true}).click();
    await expect(slip.getByRole('spinbutton')).toHaveCount(0);
    await expect(slip.getByRole('button',{name:/^Place 1 bet/})).toBeDisabled();
  } finally { await world.db.close(); }
});
