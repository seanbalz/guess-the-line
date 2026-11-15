import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test('weekly top twenty is readable, individually priced, filtered and sourced on phone and desktop',async({page,baseURL},info)=>{
  expect(pgliteAvailable,'Disposable local PGlite required').toBe(true);
  test.setTimeout(180000);
  const world=await communityWorld(page,baseURL,{games:2,migrations:ALL,optionalRpc:true});
  try {
    await page.route('**/lines/assessments',async route=>{
      if(route.request().method()!=='POST')return route.fallback();
      const now=Date.now();
      const assessments=Array.from({length:25},(_,i)=>({id:`prop-${String(i).padStart(2,'0')}`,routeId:`prop-${i}`,gameId:'SEA-DEN',kickoff:new Date(now+86400000).toISOString(),color:'yellow',selection:{market:'prop',playerId:`player-${i}`,playerName:`Fixture player ${i}`,key:i%2?'player_reception_yds':'player_rush_yds',line:30.5,unit:'yards',side:'over'},quote:{book:'test-book',source:'Fixture sportsbook',odds:-110,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()},evidence:[{eligible:true,stance:'support',sourceUrl:'https://example.test/research',label:'Fixture history',statement:'Synthetic historical sample supports this side.',datasetId:'history',sample:{count:8,unit:'appearances'}}]}));
      await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({season:world.state.league.season,week:world.state.league.week,now:new Date(now).toISOString(),assessments,coverage:{games:[],history:{status:'unavailable'},currentQuotes:true},statistics:[],playStatistics:[]})});
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
        await expect(rows.first()).toContainText('Why this prop');await expect(rows.first()).toContainText('Risk to watch');
        await rows.first().getByText('Sources & book comparison',{exact:true}).click();
        await expect(rows.first().getByRole('link',{name:'Fixture history'})).toHaveAttribute('href','https://example.test/research');
        await rows.first().getByText('Sources & book comparison',{exact:true}).click();
        await lab.getByText('How these are ranked',{exact:true}).click();
        await expect(lab.getByText(/Research priority, not win probability/)).toBeVisible();
        await lab.getByText('How these are ranked',{exact:true}).click();
        await lab.getByLabel('Research board',{exact:true}).selectOption('Receiving');
        await expect(rows).toHaveCount(10);
        await lab.getByLabel('Research board',{exact:true}).selectOption('Touchdowns');
        await expect(lab.getByRole('heading',{name:'No top props in this category'})).toBeVisible();
        await lab.getByLabel('Research board',{exact:true}).selectOption('All props');
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const axe=await new AxeBuilder({page}).include('section[aria-labelledby="gx-parlay-title"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        expect(axe.violations.map(v=>v.id)).toEqual([]);
        await page.screenshot({path:info.outputPath(`weekly-props-${theme}-${width}.png`),fullPage:true});
        await rows.first().screenshot({path:info.outputPath(`weekly-prop-row-${theme}-${width}.png`)});
      }
    }
    expect(world.errors).toEqual([]);
  } finally {await world.db.close();}
});
