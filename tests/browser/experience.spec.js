import { test, expect } from '@playwright/test';
import { picker, pickSpread, expectPick, expectNoPick, MINUS } from '../chip-entry.mjs';
const HOME_SPREADS=['TB at DAL','PHI at JAX','CIN at MIA','LV at NE','MIN at NO','CLE at NYJ','IND at PIT','HOU at TEN','NYG at WAS','CHI at GB','DEN at LAC','SF at SEA','BAL at ATL','DET at ARI','BUF at LAR'].map(m=>`${m} home spread`);
async function openBallot(page, player='luke') { await page.goto('/'); await page.getByLabel('Local player view').selectOption(player); if(await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Open navigation',exact:true}).click(); await page.getByRole('button',{name:'My picks',exact:true}).click(); }
test('320px full-slate chip entry has touch targets, readable chips and no form scrolling',async({page})=>{
 await page.setViewportSize({width:320,height:844});await openBallot(page);
 const first=picker(page,'TB at DAL home spread');await expectNoPick(page,'TB at DAL home spread');await first.getByRole('button',{name:'TB',exact:true}).click();await expect(first.locator('.number-chip')).toHaveCount(19);await expect(first.getByRole('button',{pressed:true})).toHaveText(['TB']);
 await first.getByRole('button',{name:`${MINUS}3.5`,exact:true}).click();await expectPick(page,'TB at DAL home spread','TB −3.5');await first.getByRole('button',{name:'DAL',exact:true}).click();await expectPick(page,'TB at DAL home spread','DAL −3.5');await first.getByRole('button',{name:`${MINUS}7.5`,exact:true}).click();await expectPick(page,'TB at DAL home spread','DAL −7.5');await expect(page.locator('.team-facts').first()).toContainText('Records as of Week');await page.locator('.picks-table tbody tr').first().screenshot({path:'.local/previews/entry-card-320.png'});
 await page.getByRole('button',{name:'Next game',exact:true}).first().click();await expect(picker(page,'PHI at JAX home spread').getByRole('button').first()).toBeFocused();
 for(const label of HOME_SPREADS)await pickSpread(page,label,'-3.5');
 await expect(page.locator('.ballot-count')).toContainText('15');await expect(page.getByRole('button',{name:'Review & submit',exact:true})).toBeEnabled();
 const metrics=await page.locator('.prediction-entry').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,inputs:[...node.querySelectorAll('.prediction-entry-controls input,.prediction-entry-controls select')].length,chips:[...node.querySelectorAll('.chip')].map(el=>({font:parseFloat(getComputedStyle(el).fontSize),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}));
 expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);expect(metrics.inputs).toBe(0);expect(metrics.chips.length).toBeGreaterThan(0);expect(metrics.chips.every(item=>item.font>=16&&item.width>=44&&item.height>=44)).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-results/experience-entry-320.png',fullPage:true});
 await page.getByLabel('Filter predictions').selectOption('missing');await expect(page.getByRole('group',{name:/home spread$/})).toHaveCount(0);
});
test('manual draft survives reload only as an explicit tab recovery and reports offline',async({page,context})=>{
 await openBallot(page);await pickSpread(page,'TB at DAL home spread','-4.5');await expectPick(page,'TB at DAL home spread','DAL −4.5');await expect(page.getByText('You have unsaved changes',{exact:true})).toBeVisible();
 await page.reload();await page.getByLabel('Local player view').selectOption('luke');await page.getByRole('button',{name:'My picks',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Unsaved predictions found in this tab'})).toBeVisible();await expectNoPick(page,'TB at DAL home spread');await page.getByRole('button',{name:'Restore tab draft'}).click();await expectPick(page,'TB at DAL home spread','DAL −4.5');
 await context.setOffline(true);await expect(page.getByText('Offline · changes are not saved',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled();await context.setOffline(false);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');await expect(page.getByText('Saved',{exact:true})).toBeVisible();expect(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('gtl.tab-draft.v1.')))).toBeFalsy();
});
test('a conflicting saved guess requires explicit per-game resolution before retry',async({page})=>{
 await openBallot(page,'troy');await pickSpread(page,'TB at DAL home spread','-4');
 await page.route('**/api/ballot?**',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Saved data changed on another device.'})}));
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Conflict · review saved changes',{exact:true})).toBeVisible();
 await page.route('**/api/state?**',async route=>{const response=await route.fetch();const body=await response.json();body.games[0].prediction=-7;await route.fulfill({json:body});});
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(page.getByText('Changed on another device',{exact:true})).toBeVisible();await expectPick(page,'TB at DAL home spread','DAL −4');await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Use saved',exact:true}).click();await expectPick(page,'TB at DAL home spread','DAL −7');await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeEnabled();
});
test('Challenge quote review preserves edits, blocks bad odds and submits only on confirmation',async({page})=>{
 let saves=0;await page.route('**/api/bet?**',route=>{saves++;return route.continue();});await openBallot(page,'sean');await page.getByRole('button',{name:'Betting Challenge',exact:true}).click();await page.getByRole('button',{name:'Record selection',exact:true}).first().click();
 await page.getByLabel('Selected team’s spread').fill('-3.5');await page.getByLabel('American odds').fill('0');await page.getByLabel('Quote source').fill('Review fixture source');const local=await page.evaluate(()=>{const d=new Date('2026-10-08T15:59:00Z');return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)});await page.getByLabel('Quote timestamp',{exact:false}).fill(local);
 await page.getByRole('button',{name:'Review selection',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('American odds');expect(saves).toBe(0);
 await page.getByLabel('American odds').fill('-110');await page.getByRole('button',{name:'Review selection',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Not recorded until confirmation');expect(saves).toBe(0);await page.getByRole('button',{name:'Edit quote',exact:true}).click();await expect(page.getByLabel('Selected team’s spread')).toHaveValue('-3.5');
 await page.getByRole('button',{name:'Review selection',exact:true}).click();await page.screenshot({path:'test-results/experience-quote-review.png',fullPage:true});await page.getByRole('button',{name:'Confirm immutable selection',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(saves).toBe(1);
});
test('mobile navigation traps focus, closes on Escape and dialog restores focus',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');const menu=page.locator('[aria-label="Open navigation"]');await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement.closest('#game-navigation')!==null)).toBeTruthy();await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
 const help=page.getByRole('button',{name:'Rules & scoring'});await help.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(help).toBeFocused();
});
for(const width of [320,768,1024,1280,1366,1440])test(`group ballot at ${width}px keeps every team name on two lines with no page scroll`,async({page})=>{
 await page.setViewportSize({width,height:1000});await openBallot(page);await expect(page.locator('.picks-table tbody tr')).toHaveCount(15);
 const layout=await page.evaluate(()=>({pageScroll:document.documentElement.scrollWidth<=innerWidth,names:[...document.querySelectorAll('.prediction-matchup .team-matchup__name strong')].map(el=>el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight)),chips:[...document.querySelectorAll('.picks-table .chip')].map(el=>el.getBoundingClientRect()).filter(box=>box.width).map(box=>Math.min(box.width,box.height))}));
 expect(layout.pageScroll).toBe(true);expect(await page.locator('.table-scroll').first().evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(layout.names).toHaveLength(30);expect(Math.max(...layout.names)).toBeLessThanOrEqual(2.05);expect(Math.min(...layout.chips)).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:`.local/previews/group-ballot-${width}.png`,fullPage:true});
});
