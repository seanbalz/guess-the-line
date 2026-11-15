import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Synthetic quotes and evidence only; no provider or hosted account writes.
const HOUR=3600000;
function weeklyFixture({now,season,week,observedAt=now,expiresAt=now+HOUR,kickoff=now+86400000,count=25}) {
  const markets=[
    {key:'player_sacks',unit:'sacks',side:'over',line:0.5},
    {key:'player_1st_td',unit:'touchdowns',side:'yes',line:null},
    {key:'player_rush_yds_alternate',unit:'yards',side:'over',line:30.5},
    {key:'player_last_td',unit:'touchdowns',side:'yes',line:null},
    {key:'player_anytime_td',unit:'touchdowns',side:'yes',line:null},
  ];
  const assessments=Array.from({length:count},(_,i)=>({
    id:`prop-${String(i).padStart(2,'0')}`,routeId:`prop-${i}`,gameId:'SEA-DEN',kickoff:new Date(kickoff).toISOString(),color:'yellow',label:'Research lean',reasons:[],evidenceGroups:1,hasConflicts:false,
    title:i===0?'Fixture player 0 over 0.5 sacks':`Fixture player ${i} research`,
    selection:{market:'prop',playerId:`player-${i}`,playerName:`Fixture player ${i}`,...(markets[i]||{key:i%2?'player_reception_yds':'player_rush_yds',line:30.5,unit:'yards',side:'over'})},
    quote:{book:'test-book',source:'Fixture sportsbook',odds:-110,observedAt:new Date(observedAt).toISOString(),expiresAt:new Date(expiresAt).toISOString()},
    evidence:[{id:`evidence-${i}`,eligible:true,stance:'support',sourceUrl:'https://example.test/research',label:'Fixture history',reasons:[],statement:'Synthetic historical sample supports this side.',datasetId:'history',sample:{count:8,unit:'appearances'}}]
  }));
  return {season,week,now:new Date(now).toISOString(),assessments,sources:[],coverage:{games:[],history:{status:'unavailable'},currentQuotes:true},statistics:[],playStatistics:[]};
}

test('weekly top twenty is readable, individually priced, filtered and sourced on phone and desktop',async({page,baseURL},info)=>{
  expect(pgliteAvailable,'Disposable local PGlite required').toBe(true);
  test.setTimeout(180000);
  const world=await communityWorld(page,baseURL,{games:2,migrations:ALL,optionalRpc:true});
  try {
    await page.route('**/lines/assessments',async route=>{
      if(route.request().method()!=='POST')return route.fallback();
      const payload=weeklyFixture({now:Date.now(),...world.state.league});
      await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(payload)});
    });
    await page.addInitScript(()=>localStorage.setItem('gtl.app','next'));
    await page.goto('/#research/parlay');await signIn(page,'luke',{navigate:false});
    const lab=page.locator('section[aria-labelledby="gx-parlay-title"]');
    for(const theme of ['dark','light']) {
      await page.evaluate(v=>localStorage.setItem('gtl.theme',v),theme);await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      for(const width of [320,390,1440]) {
        await page.setViewportSize({width,height:900});
        const rows=lab.locator('.gx-weekly-prop');
        await expect(rows).toHaveCount(20);
        await expect(rows.nth(19)).toContainText('Fixture player 19');
        await expect(rows.first()).toContainText('Fixture sportsbook');
        await expect(rows.first()).toContainText('−110');await expect(rows.first()).toContainText('Recorded');
        await expect(rows.nth(0).locator('.gx-weekly-selection')).toHaveText('over 0.5 Sacks');
        await expect(rows.nth(1).locator('.gx-weekly-selection')).toHaveText('yes First touchdown scorer');
        await expect(rows.nth(2).locator('.gx-weekly-selection')).toHaveText('over 30.5 Rushing yards (alternate)');
        await expect(rows.nth(3).locator('.gx-weekly-selection')).toHaveText('yes Last touchdown scorer');
        await expect(rows.nth(4).locator('.gx-weekly-selection')).toHaveText('yes Anytime touchdown scorer');
        await expect(rows.first()).toContainText('Why this prop');await expect(rows.first()).toContainText('Risk to watch');
        await rows.first().getByText('Sources & book comparison',{exact:true}).click();
        await expect(rows.first().getByRole('link',{name:'Fixture history'})).toHaveAttribute('href','https://example.test/research');
        await rows.first().getByText('Sources & book comparison',{exact:true}).click();
        await lab.getByText('How these are ranked',{exact:true}).click();
        await expect(lab.getByText(/Research priority, not win probability/)).toBeVisible();
        await lab.getByText('How these are ranked',{exact:true}).click();
        await lab.getByLabel('Research board',{exact:true}).selectOption('Receiving');
        await expect(rows).toHaveCount(8);
        await lab.getByLabel('Research board',{exact:true}).selectOption('Passing');
        await expect(lab.getByRole('heading',{name:'No top props in this category'})).toBeVisible();
        await lab.getByLabel('Research board',{exact:true}).selectOption('All props');
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const axe=await new AxeBuilder({page}).include('section[aria-labelledby="gx-parlay-title"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        expect(axe.violations.map(v=>v.id)).toEqual([]);
        await page.screenshot({path:info.outputPath(`weekly-props-${theme}-${width}.png`),fullPage:true});
        await rows.first().screenshot({path:info.outputPath(`weekly-prop-row-${theme}-${width}.png`)});
      }
    }
    await page.setViewportSize({width:390,height:900});
    await lab.locator('.gx-weekly-prop').first().getByRole('button',{name:'Full research',exact:true}).click();
    const detail=page.getByRole('heading',{name:'Fixture player 0 over 0.5 sacks',exact:true});
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(/assessment=prop-0/);
    await page.goBack();await expect(lab.locator('.gx-weekly-prop')).toHaveCount(20);
    await page.goForward();await expect(detail).toBeVisible();
    await page.getByRole('button',{name:'Back to Weekly props',exact:true}).click();
    await expect(lab.locator('.gx-weekly-prop')).toHaveCount(20);
    await expect(page).not.toHaveURL(/assessment=/);
    expect(world.errors).toEqual([]);
  } finally {await world.db.close();}
});

for(const boundary of ['quote expiry','kickoff']) {
  test(`weekly props disappear at ${boundary} and cannot return through a research reread`,async({page,baseURL})=>{
    expect(pgliteAvailable,'Disposable local PGlite required').toBe(true);test.setTimeout(120000);
    const world=await communityWorld(page,baseURL,{games:2,migrations:ALL,optionalRpc:true});
    let reads=0;const base=Date.now();let serverNow=base;
    const observedAt=boundary==='quote expiry'?base-HOUR+300000:base;
    const expiresAt=boundary==='quote expiry'?base+300000:base+HOUR;
    const kickoff=boundary==='kickoff'?base+300000:base+86400000;
    try {
      await page.route('**/lines/assessments',async route=>{
        if(route.request().method()!=='POST')return route.fallback();reads++;
        const payload=weeklyFixture({...world.state.league,now:serverNow,observedAt,expiresAt,kickoff,count:1});
        await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(payload)});
      });
      await page.addInitScript(()=>localStorage.setItem('gtl.app','next'));
      // Install before navigation so the app's expiry timers use the fake clock.
      await page.clock.install();
      await page.goto('/#research/parlay');await signIn(page,'luke',{navigate:false});
      const lab=page.locator('section[aria-labelledby="gx-parlay-title"]');
      await expect(lab.locator('.gx-weekly-prop')).toHaveCount(1);
      serverNow=base+360000;
      await page.clock.fastForward(360000);
      await expect(lab.getByRole('heading',{name:'No eligible props right now',exact:true})).toBeVisible();
      await expect(lab.locator('.gx-weekly-prop')).toHaveCount(0);
      await expect.poll(()=>reads).toBeGreaterThan(1);
      const before=reads;await lab.getByRole('button',{name:'Check published research',exact:true}).click();
      await expect.poll(()=>reads).toBeGreaterThan(before);
      await expect(lab.getByRole('heading',{name:'No eligible props right now',exact:true})).toBeVisible();
      await expect(lab.locator('.gx-weekly-prop')).toHaveCount(0);
      expect(world.errors).toEqual([]);
    } finally {await world.db.close();}
  });
}
