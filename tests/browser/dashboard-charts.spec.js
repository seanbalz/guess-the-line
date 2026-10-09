import { test, expect } from '@playwright/test';
import { chartFixture } from '../fixtures/dashboard-charts.mjs';
async function show(page, mutate = () => {}) {
 const state = chartFixture(); mutate(state);
 await page.route('**/api/state?**',route=>{const mode=new URL(route.request().url()).searchParams.get('mode');return route.fulfill({json:mode==='guess_spread'?state:chartFixture(mode)});});
 await page.goto('/');return state;
}
test('one chart at a time, keyboard switching, separate market trend and collapsed detailed comparison',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await show(page);
 const panel=page.getByRole('region',{name:'Spread insights'});
 await expect(panel.locator('.score-number')).toHaveText('111 / 150');
 await expect(page.locator('.player-distributions')).not.toBeVisible();
 const points=panel.getByRole('tab',{name:'Player points'});await points.focus();await points.press('ArrowRight');
 await expect(panel.getByRole('tab',{name:'Accuracy mix'})).toBeFocused();
 await expect(panel.getByRole('img',{name:/Your accuracy mix/})).toHaveAttribute('aria-label',/Exact: 3.*Within 1 point: 6.*More than 1 point: 6.*Unscored: 0/);
 await expect(panel.getByLabel('Player accuracy bars')).toHaveCount(0);
 await panel.getByRole('tab',{name:'Accuracy mix'}).press('ArrowRight');
 await expect(panel.getByRole('heading',{name:'Market line movement'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Market line movement'})).toHaveCount(1);
 await expect(panel).toContainText('Points do not move with this chart');
 await panel.locator('.chart-guide > summary').press('Enter');
 await expect(panel.locator('.chart-guide')).toContainText('Example only');
 await page.locator('.dashboard-detail-comparison > summary').press('Enter');
 await expect(page.locator('.player-distributions')).toBeVisible();expect(errors).toEqual([]);
});
test('missing saved references are unscored, never a misleading zero or complete total',async({page})=>{
 await show(page,state=>{state.games[0].scoringReference={status:'unavailable',value:null,reason:'No historical quote'};state.games[0].points=null;state.standings[0].points=null;state.score=null;});
 const panel=page.getByRole('region',{name:'Spread insights'});
 await expect(panel.locator('.score-number')).toContainText('—');
 await expect(panel).toContainText('14 of 15');
 await panel.getByRole('tab',{name:'Accuracy mix'}).click();
 await expect(panel.getByRole('img')).toHaveAttribute('aria-label',/Unscored: 1/);
});
test('unsubmitted market hides all new charts and guide',async({page})=>{
 await show(page,state=>{state.revealed=false;state.submittedAt=null;state.standings[0].submitted=false;});
 await expect(page.getByRole('region',{name:'Spread insights'})).toHaveCount(0);
 await expect(page.locator('.chart-guide')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Your ballot comes first'})).toBeVisible();
});
test('Over/Under has the same charts with its own saved totals and beginner explanation',async({page})=>{
 await show(page);
 await page.getByRole('button',{name:'Over/Under',exact:true}).click();
 const panel=page.getByRole('region',{name:'Total insights'});
 await expect(page.getByRole('region',{name:'Spread insights'})).toHaveCount(0);
 await expect(panel.locator('.score-number')).toHaveText('111 / 150');
 await panel.getByRole('tab',{name:'Accuracy mix'}).click();
 await panel.locator('.insights-references > summary').click();
 await panel.locator('.insights-references li summary').first().click();
 await expect(panel.locator('.insights-references li').first()).toContainText('44');
 await panel.locator('.chart-guide > summary').click();
 await expect(panel.locator('.chart-guide')).toContainText('combined');
 await panel.getByRole('tab',{name:'Line movement'}).click();
 await expect(panel.getByRole('heading',{name:'Market line movement'})).toBeVisible();
});
test('display filter changes donut and trend games but never full-week points',async({page})=>{
 await show(page);await page.locator('.dashboard-preferences > summary').click();await page.locator('.dashboard-matchup-filter > summary').click();await page.getByRole('radio',{name:'Selected games',exact:true}).check();await page.getByRole('checkbox',{name:'Show TB at DAL',exact:true}).check();
 const panel=page.getByRole('region',{name:'Spread insights'});await expect(panel.locator('.score-number')).toContainText('111');
 await panel.getByRole('tab',{name:'Accuracy mix'}).click();await expect(panel).toContainText('1 selected game');await expect(panel.getByRole('img')).toHaveAttribute('aria-label',/Exact: 1.*Within 1 point: 0/);
 await panel.getByRole('tab',{name:'Line movement'}).click();await expect(panel.getByRole('combobox',{name:'Matchup'}).locator('option')).toHaveCount(1);
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();await expect(panel).toContainText('Choose a dashboard game');
});
for (const width of [320,390]) for(const theme of ['light','dark']) test(`clean charts fit ${width}px ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await show(page);
 // Use the app's actual theme control so the screenshot verifies its rendered state.
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings & setup',exact:true}).click();await page.getByLabel('Color theme').selectOption(theme);await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 const panel=page.getByRole('region',{name:'Spread insights'});await panel.getByRole('tab',{name:'Accuracy mix'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const tab of await panel.getByRole('tab').all())expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await panel.screenshot({path:`.local/previews/clean-charts-${width}-${theme}.png`});
});
