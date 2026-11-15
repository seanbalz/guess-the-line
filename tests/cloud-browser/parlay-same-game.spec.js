import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Synthetic UI-only quotes, never collected from or sent to a sportsbook.
test('same-game ideas filter, shortlist and disclose correlation on phone and desktop', async ({page, baseURL}, info) => {
  expect(pgliteAvailable, 'Disposable local PGlite required').toBe(true);
  test.setTimeout(180000);
  const world=await communityWorld(page,baseURL,{games:2,migrations:ALL,optionalRpc:true});
  try {
    await page.route('**/lines/assessments',async route=>{
      if(route.request().method()!=='POST') return route.fallback();
      const now=Date.now();
      const rows=[0,1,2].map(i=>({id:`test-${i}`,routeId:`test-${i}`,gameId:i<2?'SEA-DEN':'DAL-PHI',color:'yellow',reasons:[],label:'Research lean',evidenceGroups:1,kickoff:new Date(now+86400000).toISOString(),title:`Fixture player ${i} over 20.5 rushing yards`,selection:{market:'prop',playerId:`fixture-${i}`,playerName:`Fixture player ${i}`,key:'player_rush_yds',line:20.5,side:'over'},quote:{book:'test-book',source:'Fixture sportsbook',odds:-110,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()},evidence:[{id:'fixture-evidence',label:'Synthetic research',reasons:[],eligible:true,stance:'support',sourceUrl:'https://example.test/research',statement:'Synthetic historical sample supports this side.',datasetId:'fixture-history'}]}));
      await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({now:new Date(now).toISOString(),assessments:rows,coverage:{games:[],history:{status:'unavailable'},currentQuotes:true},statistics:[],playStatistics:[]})});
    });
    await page.addInitScript(()=>localStorage.setItem('gtl.app','next'));
    await page.goto('/#research/parlay'); await signIn(page,'luke',{navigate:false});
    const lab=page.locator('section[aria-labelledby="gx-parlay-title"]');
    await expect(lab.getByRole('heading',{name:'Suggested parlays',exact:true})).toBeVisible();
    for(const theme of ['dark','light']) {
      await page.evaluate(value=>localStorage.setItem('gtl.theme',value),theme);
      await page.reload(); await expect(lab).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      for(const width of [390,1440]) {
        await page.setViewportSize({width,height:900});
        await lab.getByLabel('Game mix',{exact:true}).selectOption('same-game');
        const tickets=lab.locator('.gx-lab-ticket');
        await expect(tickets).toHaveCount(1);
        await expect(tickets).toContainText('Same game');
        await expect(tickets).toContainText('Correlated legs. The sportsbook must confirm');
        await expect(tickets).toContainText('Not quoted');
        await tickets.getByRole('button',{name:'Shortlist this idea',exact:true}).click();
        const shortlist=lab.getByRole('complementary',{name:'Session shortlist'});
        await expect(shortlist).toContainText('not a placed bet');
        await shortlist.getByRole('button',{name:'Remove idea',exact:true}).click();
        await expect(shortlist).toHaveCount(0);
        await tickets.getByText('Price & correlation caveats',{exact:true}).click();
        await expect(tickets.getByText(/multiplying leg odds is not a valid quote/)).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const axe=await new AxeBuilder({page}).include('section[aria-labelledby="gx-parlay-title"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        expect(axe.violations.map(v=>v.id)).toEqual([]);
        await page.screenshot({path:info.outputPath(`same-game-${theme}-${width}.png`),fullPage:true});
        await lab.getByLabel('Game mix',{exact:true}).selectOption('cross-game');
        await expect(tickets).toHaveCount(2);
        await lab.getByLabel('Legs',{exact:true}).selectOption('3');
        await expect(lab.getByText('No ready-to-review ticket yet',{exact:true})).toBeVisible();
        await lab.getByLabel('Game mix',{exact:true}).selectOption('all');
        await expect(tickets).toHaveCount(1); await expect(tickets).toContainText('Mixed games');
        await lab.getByLabel('Legs',{exact:true}).selectOption('2');
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
