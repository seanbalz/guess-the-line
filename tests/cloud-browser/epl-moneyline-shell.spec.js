import { captureEpl } from './epl-prism-capture.mjs';
import { setCaptureTheme } from './theme-capture.mjs';
// UI/shell acceptance only. Guess endpoint replies here are explicit fixtures; the separate
// epl-moneyline-flow spec owns real SQL/handler/collector acceptance.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Disposable PGlite required.'));
const game = { eventId: 'ui-shell-fixture', home: 'ARS', away: 'CHE', commenceTime: '2099-10-31T12:30:00Z', status: 'scheduled', kickedOff: false };
async function fixture(page, baseURL) {
  const world = await communityWorld(page, baseURL), calls = [], saved = new Map();
  await page.route('**/functions/v1/gtl-api/lobby', async route => {
    const request = route.request();
    const response = await world.handler(new Request(request.url(), { headers: request.headers() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify({ ...await response.json(), epl: true }) });
  });
  await page.route('**/functions/v1/gtl-api/epl/**', route => {
    const req = route.request(), action = new URL(req.url()).pathname.split('/epl/')[1], body = req.postDataJSON();
    const user = world.users.get(req.headers().authorization?.replace(/^Bearer /i, ''));
    const ownerId = user?.id === ACCOUNTS.luke.id ? 'manager-luke' : 'manager-troy';
    calls.push({ action, body, ownerId });
    let data;
    if (action === 'guess/read') data = { available: true, season: 2026, week: 17, ownerId, fixtures: [game], guesses: saved.has(ownerId) ? [saved.get(ownerId)] : [] };
    else if (action === 'guess/save') {
      data = { ...body, ownerId, status: body.lock ? 'locked' : 'draft', state: body.lock ? 'pending' : 'draft', referencePrice: null, referenceObservedAt: null, referenceSource: null, distance: null };
      saved.set(ownerId, data);
    } else if (action === 'guess/leaderboard') data = { season: 2026, rows: [{ ownerId: 'manager-luke', name: 'Luke', average: 12.5, guessed: 4, unscored: 1 }] };
    else if (action === 'draft/read') data = { season: 2026, week: 17, status: 'open', deadline: game.commenceTime, order: [], picks: [], clubs: [], me: null };
    else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture endpoint unavailable.' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { ...world, calls };
}

test('shared shell wires the EPL week and children, guards drafts once, and clears the dirty key after saving', async ({ page, baseURL }, testInfo) => {
  const world = await fixture(page, baseURL), dialogs = [];
  try {
    await page.goto('/#epl/play/guess');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('heading', { name: 'Matchweek 17', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
    await page.getByLabel('Your moneyline price', { exact: true }).fill('2147383848');
    await expect(page.getByRole('button', { name: 'Lock in', exact: true })).toBeDisabled();
    await expect(page.getByText(/storage limit/)).toBeVisible();
    await page.getByLabel('Your moneyline price', { exact: true }).fill('-135');
    page.once('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveValue('-135');
    expect(dialogs).toHaveLength(1);
    page.once('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'National Football League', exact: true }).click();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveValue('-135');
    expect(dialogs).toHaveLength(2);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    const unexpected = dialog => { dialogs.push(`unexpected:${dialog.message()}`); dialog.dismiss(); };
    page.on('dialog', unexpected);
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: '2026 moneyline leaderboard', exact: true })).toBeVisible();
    await expect(page.getByText('12.5', { exact: true })).toBeVisible();
    await captureEpl(page,'moneyline-leaderboard','epl-moneyline-leaderboard');
    await page.goBack();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveValue('-135');
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Bets', exact: true }).click();
    await expect(page.getByText("Bets aren't available for the Premier League.", { exact: true })).toBeVisible();
    expect(dialogs).toHaveLength(2); page.off('dialog', unexpected);
    await page.goBack();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveValue('-135');
    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.getByRole('button', { name: 'Leaderboard', exact: true }).evaluate(button => { const range = document.createRange(); range.selectNodeContents(button); return range.getClientRects().length; })).toBe(1);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`moneyline-shared-${theme}-320.png`), fullPage: true });
    }
    expect(world.calls.filter(c => c.action === 'guess/save').map(c => c.body)).toEqual([{ eventId: game.eventId, club: 'ARS', price: -135, lock: false }]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('shared profile sign-out/account remount never draws the previous manager’s saved moneyline draft', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/play/guess'); await signIn(page, 'luke', { navigate: false });
    await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
    await page.getByLabel('Your moneyline price', { exact: true }).fill('-777');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await expect(page.getByRole('heading', { name: 'Matchweek 17', exact: true })).toBeVisible();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveValue('+100');
    await expect(page.getByRole('button', { name: 'Arsenal', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('main').innerText()).not.toContain('777');
    expect(world.calls.filter(c => c.action === 'guess/read').at(-1).ownerId).toBe('manager-troy');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Prism native moneyline recovery and leaderboard states keep entry paused and references honest',async({page,baseURL})=>{
 test.setTimeout(180000);
 const world=await fixture(page,baseURL);let mode='ready',release;
 const data={available:true,season:2026,week:17,ownerId:'manager-luke',fixtures:[game],guesses:[]};
 await page.route('**/functions/v1/gtl-api/epl/guess/read',async route=>{
  if(mode==='busy'||mode==='loading'){await new Promise(resolve=>{release=resolve;});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});}
  return route.fulfill({status:mode==='failed'?503:200,contentType:'application/json',body:JSON.stringify(mode==='failed'?{error:'Synthetic read failure'}:{...data,available:mode!=='unavailable',reason:mode==='unavailable'?'prices_not_verified':undefined})});
 });
 try{
  await page.goto('/#epl/play/guess');await signIn(page,'luke',{navigate:false});
  await expect(page.getByLabel('Your moneyline price',{exact:true})).toBeVisible();
  mode='busy';await page.getByRole('button',{name:'Refresh saved guesses',exact:true}).click();
  await expect(page.getByRole('button',{name:'Loading saved guesses…',exact:true})).toBeDisabled();
  await captureEpl(page,'moneyline-busy','epl-moneyline-busy');release();release=null;
  await expect(page.getByRole('button',{name:'Refresh saved guesses',exact:true})).toBeEnabled();
  mode='failed';await page.getByRole('button',{name:'Refresh saved guesses',exact:true}).click();
  await expect(page.getByText('Saved data could not be refreshed. Entry is paused until saved guesses load.',{exact:true})).toBeVisible();
  await captureEpl(page,'moneyline-stale','epl-moneyline-stale');
  for(const scenario of ['unavailable','failed','loading']){
   mode=scenario;await page.reload();
   if(scenario==='unavailable')await expect(page.getByText('Moneyline guessing isn’t available this week.',{exact:true})).toBeVisible();
   else if(scenario==='failed')await expect(page.locator('[data-epl-section="guess"] .gx-empty')).toBeVisible();
   else await expect(page.locator('[data-epl-section="guess"] .gx-skel')).toBeVisible();
   await captureEpl(page,`moneyline-${scenario}`,`epl-moneyline-${scenario}`);release?.();release=null;
  }
  mode='ready';
  let ranking='empty';
  await page.route('**/functions/v1/gtl-api/epl/guess/leaderboard',async route=>{
   if(ranking==='loading'){await new Promise(resolve=>{release=resolve;});return route.fulfill({status:200,contentType:'application/json',body:'{"season":2026,"rows":[]}'}).catch(()=>{});}
   return route.fulfill({status:ranking==='failed'?503:200,contentType:'application/json',body:JSON.stringify(ranking==='failed'?{error:'Synthetic ranking failure'}:{season:2026,rows:[]})});
  });
  for(const scenario of ['empty','failed','loading']){
   ranking=scenario;await page.goto('/#epl/play/leaderboard');await page.reload();
   if(scenario==='empty')await expect(page.getByText('No scored guesses yet.',{exact:true})).toBeVisible();
   else if(scenario==='failed')await expect(page.locator('[data-epl-section="leaderboard"] .gx-empty')).toBeVisible();
   else await expect(page.locator('[data-epl-section="leaderboard"] .gx-skel')).toBeVisible();
   await captureEpl(page,`moneyline-leaderboard-${scenario}`,`epl-moneyline-leaderboard-${scenario}`);release?.();release=null;
  }
  expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});
