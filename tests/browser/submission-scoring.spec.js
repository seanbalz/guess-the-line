import { test, expect } from '@playwright/test';
import { pickSpread, expectPick, expectPickEnabled } from '../chip-entry.mjs';

async function fixture(page) {
  const state = await (await page.request.get('/api/state?player=sean&mode=guess_spread')).json();
  state.scoringPolicy = 'submission-time'; state.revealed = true; state.locked = false;
  state.submittedAt = '2026-10-08T15:00:00Z'; state.now = '2026-10-08T16:00:00Z'; state.league.deadline = '2026-10-09T00:15:00Z';
  state.score = 120; state.provisionalAnalysis = null; state.scoringBenchmark = null;
  const reference = value => ({ status:'available', value, source:'Browser fixture three-book median', capturedAt:'2026-10-08T14:59:00Z', observedAt:'2026-10-08T14:58:30Z', savedAt:state.submittedAt });
  state.games = state.games.map(game => ({ ...game, prediction:-3, points:8, market:-7, scoringReference:reference(-4), currentConsensus:{...reference(-7),status:'stale'}, opponents:[{id:'troy',name:'Troy Jun',value:-2,scoringReference:reference(-2.5)}] }));
  state.standings = state.league.roster.map(player => ({...player, submitted:player.id!=='luke',points:player.id==='sean'?120:player.id==='troy'?135:null,record:null,error:player.id==='sean'?15:7.5,exact:0}));
  let lastBody;
  await page.route('**/api/state?**',route => route.fulfill({json:state}));
  await page.route('**/api/ballot?**',route => {
    lastBody = route.request().postDataJSON();
    for(const game of state.games){if(lastBody.picks[game.id]!==game.prediction){game.prediction=lastBody.picks[game.id];game.scoringReference={...reference(-5),savedAt:state.now};game.points=10-Math.abs(game.prediction+5)*2;}}
    state.score=state.games.reduce((sum,game)=>sum+game.points,0);state.standings[0].points=state.score;
    return route.fulfill({json:state});
  });
  await page.goto('/');
  return {state,body:()=>lastBody};
}

test('saved references remain distinct from current consensus; submitted edit review sends full ballot',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const context=await fixture(page);
  await expect(page.locator('.score-number').first()).toContainText('120');
  await expect(page.getByRole('heading',{name:'Errors against saved references'})).toBeVisible();
  await page.getByRole('button',{name:'Compare picks',exact:true}).last().click();
  const table=page.getByRole('region',{name:'Spread pick comparison'});
  await expect(table).toContainText('Scoring reference');await expect(table).toContainText('Saved with guess');await expect(table).toContainText('Stale saved consensus');
  await expect(table.locator('tbody tr').first()).toContainText('−4');await expect(table.locator('tbody tr').first()).toContainText('−2.5');await expect(table.locator('tbody tr').first()).toContainText('−7');
  context.state.games.forEach(game=>game.currentConsensus.value=-9);
  await page.getByRole('button',{name:'Refresh picks',exact:true}).click();
  await expect(page.locator('.comparison-players').first()).toContainText('120');
  await expect(table.locator('tbody tr').first()).toContainText('−9');
  await page.getByRole('button',{name:'My picks',exact:true}).click();
  await expectPickEnabled(page,'TB at DAL home spread');await pickSpread(page,'TB at DAL home spread','-5');await expectPick(page,'TB at DAL home spread','DAL −5');
  await page.getByRole('button',{name:'Review & save changes',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('changed guesses only');
  await page.getByRole('button',{name:'Save changed guesses',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your spread analysis',exact:true})).toBeVisible();
  expect(context.body().submit).toBe(true);expect(context.body().picks['TB-DAL']).toBe(-5);expect(Object.keys(context.body().picks)).toHaveLength(15);
  await page.getByRole('button',{name:'My picks',exact:true}).click();
  await expectPick(page,'TB at DAL home spread','DAL −5');await expectPickEnabled(page,'TB at DAL home spread');
  await expect(page.getByRole('button',{name:'Review & save changes',exact:true})).toBeDisabled();expect(errors).toEqual([]);
});

for (const width of [1440,390,320])test(`submission reference layout ${width}px with unavailable scores and deadline closure`,async({page})=>{
  await page.setViewportSize({width,height:1000});const {state}=await fixture(page);
  state.games[0].scoringReference={status:'unavailable',value:null,reason:'Historical submission has no captured reference'};state.games[0].points=null;state.score=null;state.standings[0].points=null;
  await page.reload();
  await page.getByRole('button',{name:'Compare picks',exact:true}).last().click();
  const visible=width<=720?page.locator('.comparison-mobile'):page.locator('.comparison-table');
  await expect(visible).toContainText('Historical submission has no captured reference');
  await expect(visible).toContainText('Current consensus');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/submission-reference-${width}.png`,fullPage:true});
  await page.screenshot({path:`test-results/submission-reference-${width}-viewport.png`});
  if(width<=720) await page.locator('.comparison-mobile article').first().screenshot({path:`test-results/submission-reference-${width}-matchup.png`});
  if(width<=720)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Settings & setup',exact:true}).click();
  await page.getByLabel('Color theme').selectOption('light');
  if(width<=720)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Compare picks',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:`test-results/submission-reference-${width}-light.png`});
  if(width<=720) await page.locator('.comparison-mobile article').first().screenshot({path:`test-results/submission-reference-${width}-light-matchup.png`});
  state.locked=true;await page.reload();
  if(width<=720)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'My picks',exact:true}).click();
  await expectPickEnabled(page,'TB at DAL home spread',false);await expect(page.getByText('BALLOT CLOSED',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
