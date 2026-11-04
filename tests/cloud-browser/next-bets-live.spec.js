import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

// The new Bets tab on the schema players have today, using the existing social and virtual routes.
// All accounts, tickets, prices and writes are local fixtures. No hosted account or provider is contacted.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const view = (page, name) => page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name, exact: true });
async function selectTracker(page,label,value){
 const control=page.getByLabel(label,{exact:true});
 if(!await control.isVisible())await page.locator('.social-filters > summary').click();
 await control.selectOption(value);
}

async function openBets(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets/tracked');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'My bets', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add bet', exact: true })).toBeEnabled();
}
async function fillTicket(page, gameId) {
  await page.getByRole('button', { name: 'Add bet', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
  await expect(editor.getByRole('button', {name: 'Save tracked bet', exact: true})).toBeDisabled();
  await expect(editor.getByRole('group', {name: 'Units risked', exact: true}).getByRole('button', {name: 'Unknown', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: gameId.replace('-', ' @ '), exact: true }).click();
  await editor.getByRole('group', { name: 'Team', exact: true }).getByRole('button', { name: gameId.split('-')[1], exact: true }).click();
  await editor.getByRole('button', { name: 'Favorite (−)', exact: true }).click();
  await editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true }).click();
  await editor.getByRole('group', { name: 'American odds', exact: true }).getByRole('button', { name: '−110', exact: true }).click();
  await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '1u', exact: true }).click();
  await editor.getByRole('group', { name: 'Sportsbook / quote source', exact: true }).getByRole('button', { name: 'DraftKings', exact: true }).click();
  return editor;
}
function callsFrom(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/')) calls.push({ path: url.pathname.split('/gtl-api/')[1], query: url.search, body: request.method() === 'POST' ? request.postDataJSON() : null });
  });
  return calls;
}

test('tracked Overview shows owner charts, shared filters and cash, then drills into unchanged tickets',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const {season,week}=world.state.league,gameId=world.state.games[0].id;
  const leg={gameId,market:'prop',side:'Fixture Runner',line:30,selection:'Fixture Runner 30+ receiving yards'};
  async function seedTicket(label,extra={},outcome=null,account='luke'){
   const read=await world.api(account,'social/read',{season,week});expect(read.status).toBe(200);
   let reply=await world.api(account,'social/create',{season,week,weekRevision:read.body.weekRevision,requestId:crypto.randomUUID(),kind:'single',legs:[leg],stakeUnits:1,odds:100,source:'Book A',notes:label,...extra});
   expect(reply.status,JSON.stringify(reply.body)).toBe(200);
   let entry=reply.body.entries.find(e=>e.notes===label);expect(entry).toBeTruthy();
   if(outcome){reply=await world.api(account,'social/settle',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),entryId:entry.id,revision:entry.revision,outcome,actualReturnUnits:null,reason:'Local fixture reported result'});expect(reply.status,JSON.stringify(reply.body)).toBe(200);entry=reply.body.entries.find(e=>e.id===entry.id);}
   if(label==='excluded'){reply=await world.api(account,'social/include',{season,week,weekRevision:reply.body.weekRevision,requestId:crypto.randomUUID(),entryId:entry.id,revision:entry.revision,countsForRecord:false,reason:'Local fixture exclusion'});expect(reply.status).toBe(200);}
  }
  await seedTicket('winner',{},'win');
  await seedTicket('parlay',{kind:'parlay',legs:[leg,{...leg,side:'Fixture Scorer',line:1,selection:'Fixture Scorer anytime touchdown (1+)'}],stakeUnits:.25,odds:400,source:'Book B'},'loss');
  await seedTicket('open',{stakeUnits:.5,odds:null,source:'Book B'});
  await seedTicket('excluded',{},'win');await seedTicket('foreign',{stakeUnits:100},'win','troy');
  const before=(await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows;
  const calls=callsFrom(page);
  await openBets(page);await tab(page,'Bets').click();await page.getByRole('button',{name:'Overview',exact:true}).click();
  const overview=page.getByRole('region',{name:'Tracked bets overview',exact:true});await expect(overview).toBeVisible();
  await expect(page.getByLabel('Competition week',{exact:true})).toHaveValue('all');
  await expect(overview.locator('.gx-tc-big')).toHaveText('+0.75U');
  await expect(overview.getByRole('slider',{name:'Move along the line · Net units',exact:true})).toBeVisible();
  await expect(overview.getByRole('region',{name:'Bet activity'}).getByText('Tracked bets',{exact:true}).locator('..')).toContainText('3');
  await expect(overview.getByRole('region',{name:'Bet types'}).getByRole('button',{name:'Show Parlays: 1 bet',exact:true})).toBeVisible();
  await expect(overview).toContainText('1 excluded from records');
  await expect(overview.getByRole('button',{name:'Cash',exact:true})).toBeDisabled();
  await page.locator('.social-filters > summary').click();await page.getByText('Set cash value of 1U',{exact:true}).click();
  await page.getByLabel('Display cash value of 1U ($)',{exact:true}).fill('100');
  await page.locator('.social-filters > summary').click();
  await overview.getByRole('button',{name:'Cash',exact:true}).click();await expect(overview.locator('.gx-tc-big')).toHaveText('$75.00');
  await expect(overview.locator('.gx-tc-scale-values')).toHaveText('$0.00 to $100.00');await expect(overview.locator('.gx-tc-zero-label')).toHaveText('$0.00');
  await expect(overview.getByRole('region',{name:'Bet activity'})).toContainText('$50.00');
  const slider=overview.getByRole('slider',{name:'Move along the line · Net profit',exact:true});await slider.focus();await slider.press('Home');await expect(slider).toHaveValue('0');await slider.press('End');await expect(slider).toHaveValue('2');
  for(const theme of ['light','dark'])for(const width of [320,390]){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:844});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const targets=await overview.locator('button').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({name:el.textContent,height:el.getBoundingClientRect().height})));for(const target of targets)expect(target.height,target.name).toBeGreaterThanOrEqual(44);
   const scan=await new AxeBuilder({page}).include('.gx-bets').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
   await page.screenshot({path:`.local/tracked-overview/overview-${theme}-${width}.png`,fullPage:true});
  }
  await page.locator('.social-filters > summary').click();await page.getByRole('combobox',{name:'Sportsbook filter',exact:true}).selectOption('book:Book B');
  await expect(overview.locator('.gx-tc-big')).toHaveText('-$25.00');await expect(overview.getByRole('slider')).toHaveCount(0);
  await page.getByRole('button',{name:'View matching tickets (2)',exact:true}).click();await expect(page.locator('.gx-tracked-row')).toHaveCount(2);
  await page.getByRole('group',{name:'Tracked bets section'}).getByRole('button',{name:'Overview',exact:true}).click();await expect(overview.locator('.gx-tc-big')).toHaveText('-$25.00');
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(overview.locator('.gx-tc-big')).toHaveText('$75.00');
  await overview.getByRole('region',{name:'Bet types'}).getByRole('button',{name:'Show Parlays: 1 bet',exact:true}).click();await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
  await page.getByRole('group',{name:'Tracked bets section'}).getByRole('button',{name:'Overview',exact:true}).click();await expect(overview).toBeVisible();await expect(page.getByRole('combobox',{name:'Bet type',exact:true})).toHaveValue('parlay');
  await tab(page,'Home').click();await tab(page,'Bets').click();await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(overview).toBeVisible();await expect(overview.locator('.gx-tc-big')).toHaveText('-$25.00');
  expect(calls.filter(c=>/^social\/(create|settle|correct|include|tail)$/.test(c.path))).toEqual([]);
  for(const call of calls.filter(c=>c.path==='social/read'))for(const field of ['source','from','to'])expect(call.body.filters).not.toHaveProperty(field);
  expect((await world.db.query('select state from public.gtl_social_weeks order by season,week')).rows).toEqual(before);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('empty tracked Overview keeps charts visible as empty states and never invents returns',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const calls=callsFrom(page);await openBets(page);
  await page.getByRole('group',{name:'Tracked bets section'}).getByRole('button',{name:'Overview',exact:true}).click();
  const overview=page.getByRole('region',{name:'Tracked bets overview'});await expect(overview).toBeVisible();await expect(overview.locator('.gx-tc-big')).toHaveText('—');await expect(overview.getByRole('slider')).toHaveCount(0);
  await expect(overview.getByRole('region',{name:'Bet types'})).toContainText('No included bets match these filters.');
  await page.locator('.social-filters > summary').click();await page.getByLabel('From date',{exact:true}).fill('2026-11-03');await page.getByLabel('Through date',{exact:true}).fill('2026-11-02');await expect(page.getByRole('alert')).toContainText('Start date must be on or before end date.');
  expect(calls.filter(c=>/^social\/(create|settle|correct|include|tail)$/.test(c.path))).toEqual([]);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
async function loseReplyAfterCommit(page, world, action) {
  await page.route(url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${action}`, async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
    expect(response.status, `${action} committed in the fixture`).toBe(200);
    await response.text();
    await route.abort('failed');
  }, { times: 1 });
}

test('Bets roots open creation from fresh all-week lists and remembered Add scope without saving', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    for (const destination of ['Active tickets', 'Settled tickets']) {
      await tab(page, 'Bets').click();
      await page.getByRole('button', { name: destination, exact: true }).click();
      await expect(page.getByLabel('Competition week')).toHaveValue('all');
      await expect(page.getByRole('button', { name: 'Add bet', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Add bet', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
      await expect(editor).toBeVisible();
      await expect(page.getByLabel('Competition week')).toHaveValue(`${world.state.league.season}:${world.state.league.week}`);
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await tab(page, 'Bets').click();
    await page.getByRole('button', { name: 'Add a bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await selectTracker(page,'Competition week','all');
    await tab(page, 'Bets').click();
    await page.getByRole('button', { name: 'Add a bet', exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Community tracked bets work without private membership; create, own week and history retain the same ticket', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    await world.db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,$2,$3,$4,true,$5)', [ACCOUNTS.luke.id, world.state.league.season, world.state.league.week, world.state.games[0].id, 'PRIVATE NOTE SENTINEL']);
    const calls = callsFrom(page);
    await openBets(page);
    await expect(page.locator('body')).not.toContainText('PRIVATE NOTE SENTINEL');
    // D-55: the sharing note is behind the title's ⓘ.
    await expect(page.locator('.gx-bets')).not.toContainText('Tracked bets are shared with all signed-in players');
    await page.getByRole('button', { name: 'About tracked bets', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About tracked bets' })).toContainText('Tracked bets are shared with all signed-in players');
    await page.getByRole('dialog', { name: 'About tracked bets' }).getByRole('button', { name: 'Close', exact: true }).click();
    await view(page, 'Virtual Units').click();
    await expect(page.locator('[data-bets="place"]')).toBeVisible();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    await view(page, 'Tracked bets').click();
    const editor = await fillTicket(page, world.state.games[0].id);
    // Choosing a matchup, side, line, price and book is entirely taps and does not write until Save.
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await selectTracker(page,'Bet tracker view','myweek');
    await expect(page.getByRole('heading', { name: 'Your weekly bet card' })).toBeVisible();
    await expect.poll(() => calls.filter(call => call.path === 'social/read').at(-1)?.body.filters.playerId).toBe(ACCOUNTS.luke.id);
    await selectTracker(page,'Bet tracker view','history');
    await expect(page.getByRole('heading', { name: 'Bet history', exact: true })).toBeVisible();
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ kind: 'single', odds: -110, stakeUnits: 1, source: 'DraftKings',
      legs: [{ gameId: world.state.games[0].id, market: 'spread', side: 'home', line: -3.5 }] });
    // Opening Virtual Units above reads /bets/read (D-67); a tracked ticket never calls another Bets route.
    expect(calls.some(call => call.path === 'state' || (call.path.startsWith('bets/') && call.path !== 'bets/read'))).toBe(false);
    await selectTracker(page,'Bet tracker view','mybets');
    await selectTracker(page,'Competition week',`${world.state.league.season}:${world.state.league.week}`);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(results.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/next-bets-tracked-${theme}-${width}.png`, fullPage: true });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost tracked-ticket reply preserves entered values and explicitly confirms the same request once', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await loseReplyAfterCommit(page, world, 'social/create');
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('could not confirm whether your save completed');
    await expect(editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: 'Retry same save' })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(1);
    await editor.getByRole('button', { name: 'Check saved bets' }).click();
    await expect(editor.getByRole('button', { name: 'Retry same save' })).toBeEnabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(1);
    await editor.getByRole('button', { name: 'Retry same save' }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a total ticket uses only buttons, keeps unknown odds and fits the phone editor in both themes', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page), gameId = world.state.games[0].id;
    await openBets(page);
    await page.getByRole('button', { name: 'Add bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
    await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: gameId.replace('-', ' @ '), exact: true }).click();
    await editor.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await editor.getByRole('group', { name: 'Direction', exact: true }).getByRole('button', { name: 'Over', exact: true }).click();
    await editor.getByRole('group', { name: 'Exact total', exact: true }).getByRole('button', { name: '44.5', exact: true }).click();
    await editor.getByRole('button', { name: 'Increase total by 0.5', exact: true }).click();
    await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '2u', exact: true }).click();
    await editor.getByRole('group', { name: 'American odds', exact: true }).getByRole('button', { name: 'Unknown', exact: true }).click();
    await editor.getByRole('group', { name: 'Sportsbook / quote source', exact: true }).getByRole('button', { name: 'Novig', exact: true }).click();
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px page fits`).toBe(true);
        expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme} ${width}px editor fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.social-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/bet-button-editor-${theme}-${width}.png`, fullPage: true });
      }
    }
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ kind: 'single', odds: null, stakeUnits: 2, source: 'Novig', quotedAt: null, placedAt: null,
      legs: [{ gameId, market: 'total', side: 'over', line: 45 }] });
    await page.locator('.gx-tracked-preview').click();
    await expect(page.locator('.gx-tracked-price')).toHaveText('Odds unknown');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('custom ticket terms stay exact when switching back to buttons and changing matchups', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    const line = editor.getByRole('group', { name: 'Exact signed spread', exact: true });
    await line.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).fill('-8.5');
    const odds = editor.getByRole('group', { name: 'American odds', exact: true });
    await odds.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'American odds', exact: true }).fill('-112.5');
    await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '1.5u', exact: true }).click();
    await editor.getByRole('button', { name: 'Change matchup', exact: true }).click();
    const nextId = world.state.games[1].id;
    await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: nextId.replace('-', ' @ '), exact: true }).click();
    await editor.getByRole('group', { name: 'Team', exact: true }).getByRole('button', { name: nextId.split('-')[0], exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    // A custom price and stake are ticket-level terms, so changing the matchup must not rewrite them.
    await expect(editor.getByRole('spinbutton', { name: 'American odds', exact: true })).toHaveValue('-112.5');
    if (!await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).isVisible()) await line.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).fill('8.5');
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ odds: -112.5, stakeUnits: 1.5,
      legs: [{ gameId: nextId, market: 'spread', side: 'away', line: 8.5 }] });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Stages 43 and 44 (Sean, October 28, 2026): Your picks is the account-level placing screen, writing through M-11.
test('Your picks places two bets, confirms a lost reply without a duplicate, edits, and refuses a bet changed elsewhere', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { optionalRpc: true, migrations: ALL });
  try {
    const games = world.state.games, [g0, g1] = games;
    await storeBookLines(world, { spread: Object.fromEntries(games.map(game => [game.id, -3.5])), total: Object.fromEntries(games.map(game => [game.id, 44.5])) });
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(games.map(game => [game.id, -3])));
    const calls = callsFrom(page);
    const saved = async () => (await world.db.query('select game_id,selection,audit from public.gtl_virtual_units_picks where user_id=$1 order by game_id', [ACCOUNTS.luke.id])).rows;
    await openBets(page);
    await view(page, 'Virtual Units').click();
    const place = page.locator('[data-bets="place"]');
    await expect(place).toBeVisible();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    // Spread is locked in, so its prices show; Total is not, so every game's Total is a lock sentence with no line.
    await expect(place.locator('[data-market="total"]').getByText('Lock in your Total guess', { exact: false })).toHaveCount(games.length);
    expect((await place.locator('[data-market="total"]').allTextContents()).join(' ')).not.toContain('44.5');
    const chip = (game, side) => place.locator(`[data-game="${game.id}"] [data-market="spread"] .gx-chip`).nth(side === 'away' ? 0 : 1);
    await chip(g0, 'home').click();
    await chip(g1, 'home').click();
    await expect(chip(g0, 'home')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Your slip' });
    await sheet.locator(`[data-slip="${g0.id}:spread"]`).getByRole('button', { name: '2 units', exact: true }).click();
    await loseReplyAfterCommit(page, world, 'bets/place');
    await sheet.getByRole('button', { name: /^Place 2 bets/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('could not confirm');
    await sheet.getByRole('button', { name: 'Retry the same save', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    let writes = calls.filter(call => call.path === 'bets/place');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    expect(writes[0].body.bets.map(bet => [bet.gameId, bet.units, bet.expected])).toEqual([[g0.id, 2, null], [g1.id, 1, null]]);
    expect((await saved()).map(row => row.audit.length)).toEqual([1, 1]);
    await expect(place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-tag`)).toContainText('2U');

    // Another device edits the second bet. This screen still holds the old terms, so its edit is refused and nothing is overwritten.
    const other = (await saved()).find(row => row.game_id === g1.id).selection;
    const expected = { side: other.side, line: other.line, odds: other.odds, units: other.units, source: other.source, quotedAt: other.quotedAt };
    const elsewhere = await world.api('luke', 'bets/place', { season: world.state.league.season, week: world.state.league.week, requestId: crypto.randomUUID(),
      bets: [{ gameId: g1.id, market: 'spread', side: other.side, line: other.line, odds: other.odds, units: 3, source: other.source, quotedAt: other.quotedAt, expected }] });
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200);
    await chip(g1, 'away').click();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('A bet changed since you opened it');
    expect((await saved()).find(row => row.game_id === g1.id).selection.units).toBe(3);
    // The refreshed read carries the new terms; placing again edits on top of them with a full audit.
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet).toHaveCount(0);
    const edited = (await saved()).find(row => row.game_id === g1.id);
    expect(edited.selection.side).toBe('away');
    expect(edited.audit.map(event => event.type)).toEqual(['placed', 'edited', 'edited']);
    expect(calls.some(call => call.path === 'virtual-pick')).toBe(false);

    // A slip holds the leave guard; dismissing the confirmation keeps it.
    await chip(g0, 'away').click();
    // The board, the dock and the open slip fit a phone in both themes.
    for (const width of [390, 320]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px board fits`).toBe(true);
      expect(await page.evaluate(layoutProblems), `${theme} ${width}px board layout`).toEqual([]);
      // Design audit A15: a price chip is two lines. The price starts the second line (never left alone after a wrapped
      // "SEA +3.5 ·"), and a selected chip's check shares the first line so the price and book keep the chip's width.
      expect(await place.locator('[data-market="spread"] .gx-chip').evaluateAll(chips => chips.flatMap(chip => {
        const [first, second] = chip.querySelectorAll('.gx-place-chip > span'), price = second.querySelector('.gx-n-xs'), check = chip.querySelector('svg');
        const top = el => el.getBoundingClientRect().top, bottom = el => el.getBoundingClientRect().bottom;
        return [...(top(second) < bottom(first) - 1 ? [`${first.textContent}: second line overlaps the first`] : []),
          ...(price && Math.abs(top(price) - top(second)) > 4 ? [`${price.textContent}: not first on the second line`] : []),
          ...(check && bottom(check) > top(second) + 1 ? [`${first.textContent}: check below the first line`] : [])];
      })), `${theme} ${width}px price chips`).toEqual([]);
      expect(await place.locator('[data-market="spread"] .gx-chip--on svg').count(), 'a selected chip').toBe(1);
      await page.screenshot({ path: `.local/previews/next-bets-place-${theme}-${width}.png` });
      await page.getByRole('button', { name: 'Review slip', exact: true }).click();
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(400); // the sheet's entrance animation, for the screenshot only
      expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme} ${width}px slip fits`).toBe(true);
      await page.screenshot({ path: `.local/previews/next-bets-slip-${theme}-${width}.png` });
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    page.once('dialog', dialog => dialog.dismiss());
    await tab(page, 'Home').click();
    await expect(page.getByRole('heading', { name: 'Virtual Units', level: 1, exact: true })).toBeVisible();
    await expect(chip(g0, 'away')).toHaveAttribute('aria-pressed', 'true');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an expired sign-in opens recovery above the tracked-bet editor and preserves its entered values', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/create'), route => route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) }), { times: 1 });
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    const signInAgain = page.getByRole('alertdialog', { name: 'Sign in again' });
    await expect(signInAgain).toBeVisible();
    await signInAgain.getByLabel('Password', { exact: true }).fill('fixture-password');
    await signInAgain.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signInAgain).not.toBeVisible();
    await expect(editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('My bets keeps ownership across weeks and grouped filters, hides an obsolete read and opens sharing explicitly', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  const { emptySocialState, socialView } = await import('../../shared/social-bets.mjs');
  let release;
  let held = false;
  const state = emptySocialState(), season = 2026, week = world.state.league.week;
  const base = { ownerId: ACCOUNTS.luke.id, season, week, kind: 'single', origin: 'tracked', odds: 100, stakeUnits: 1, source: 'Fixture', recordedAt: '2026-10-08T15:00:00Z', countsForRecord: true, revision: 1 };
  for (const [i, outcome] of ['pending', 'win', 'loss', 'push', 'void'].entries())
    state.entries.push({ ...base, id: 'ticket' + i, outcome, legs: [{ gameId: world.state.games[0].id, market: i === 2 ? 'total' : 'spread', side: i === 2 ? 'over' : 'home', line: i === 2 ? 44.5 : -3.5, selection: 'Owner ' + outcome }] });
  state.entries.push({ ...state.entries[0], id: 'rival', ownerId: ACCOUNTS.troy.id, legs: [{ ...state.entries[0].legs[0], selection: 'RIVAL SENTINEL' }] });
  state.entries.push({ ...state.entries[0], id: 'previous', week: week - 1, legs: [{ ...state.entries[0].legs[0], selection: 'PREVIOUS OWNER' }] });
  state.entries.push({ ...state.entries[0], id: 'legacy-virtual', origin: 'virtual', legs: [{ ...state.entries[0].legs[0], selection: 'LEGACY VIRTUAL' }] });
  const calls = [];
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const result = { ...socialView(state, { actorId: ACCOUNTS.luke.id, games: world.state.games, filters: body.filters, season: body.allHistory ? null : season, week: body.allHistory ? null : body.week || week }), actorId: ACCOUNTS.luke.id, season, week: body.week || week, games: world.state.games, availableWeeks: [{ season, week }, { season, week: week - 1 }], weekRevision: 0 };
    if (body.filters?.outcome === 'pending' && !held) {
      held = true;
      await new Promise(resolve => release = resolve);
    }
    await route.fulfill({ json: result }).catch(() => { });
  });
  try {
    await openBets(page);
    await expect(page.getByLabel('Bet tracker view', { exact: true })).toHaveValue('mybets');
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(5);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator('.social-feed').screenshot({ path: `.local/previews/tracked-list-${theme}-${width}.png` });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.gx-tracked-preview').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gx-tracked-collapse').first()).toBeFocused();
    await page.locator('.gx-tracked-menu').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gx-tracked-menu').first()).toHaveAttribute('aria-expanded', 'true');
    const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(issue => issue.id)).toEqual([]);
    await page.locator('.gx-tracked-row').first().screenshot({ path: '.local/previews/tracked-row-expanded.png' });
    await expect(page.locator('.social-feed')).not.toContainText('RIVAL SENTINEL');
    await expect(page.locator('.social-feed')).not.toContainText('LEGACY VIRTUAL');
    expect(calls.at(-1).filters.origin).toBe('tracked');
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await expect(page.locator('.social-bet-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Settled', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(4);
    release();
    await page.locator('.social-filters > summary').click();
    await page.getByRole('group', { name: 'Market filter', exact: true }).getByRole('button', { name: 'Spreads', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(3);
    await expect(page.getByText('Showing filtered bets',{exact:true})).toBeVisible();
    await page.getByRole('group', { name: 'Market filter', exact: true }).getByRole('button', { name: 'Props', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), route => route.fulfill({ status: 503, json: { error: 'Fixture read unavailable' } }), { times: 1 });
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Fixture read unavailable');
    await expect(page.locator('.social-bet-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'All', exact: true }).click();
    await selectTracker(page,'Competition week','all');
    await expect(page.locator('.social-bet-card')).toHaveCount(6);
    expect(calls.at(-1).filters.playerId).toBe(ACCOUNTS.luke.id);
    await selectTracker(page,'Competition week',season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-feed')).toContainText('PREVIOUS OWNER');
    expect(calls.at(-1).filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.reload();
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-feed')).toContainText('PREVIOUS OWNER');
    await page.evaluate(({ season, week }) => { location.hash = `bets/tracked?season=${season}&week=${week}`; }, { season, week });
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + week);
    await expect(page.locator('.social-bet-card')).toHaveCount(5);
    await page.goBack();
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await selectTracker(page,'Competition week','all');
    await selectTracker(page,'Bet tracker view','feed');
    await expect(page.locator('.social-bet-card')).toHaveCount(8);
    await expect(page.locator('.social-feed')).toContainText('LEGACY VIRTUAL');
    await expect(page.locator('.social-feed')).toContainText('RIVAL SENTINEL');
  }
  finally {
    release?.();
    await world.db.close();
  }
});

test('an inclusion save finishing after a filter change does not invalidate the active read', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  let releaseSave, releaseRead;
  let saveHeld = false, readHeld = false;
  try {
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/include'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      expect(response.status).toBe(200);
      saveHeld = true;
      await new Promise(resolve => releaseSave = resolve);
      await route.fulfill({ status: response.status, contentType: 'application/json', body });
    });
    await page.locator('.gx-tracked-preview').click();
    await page.locator('.gx-tracked-menu').click();
    await page.locator('.social-bet-card').getByText('Details & history', { exact: true }).click();
    await page.getByRole('button', { name: /Exclude from records/ }).click();
    await expect.poll(() => saveHeld).toBe(true);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      if (req.postDataJSON().filters?.outcome === 'pending') {
        readHeld = true;
        await new Promise(resolve => releaseRead = resolve);
      }
      await route.fulfill({ status: response.status, contentType: 'application/json', body });
    });
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect.poll(() => readHeld).toBe(true);
    releaseSave();
    await expect(page.locator('.social-notice')).toBeVisible();
    releaseRead();
    await expect(page.locator('.social-loading')).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await page.getByRole('group',{name:'Tracked bets section'}).getByRole('button',{name:'Overview',exact:true}).click();
    await expect(page.getByRole('region',{name:'Tracked bets overview'})).toContainText('1 excluded from records');
    expect(world.errors).toEqual([]);
  } finally {
    releaseSave?.();
    releaseRead?.();
    await world.db.close();
  }
});

// Contract: on a phone, every tracker toolbar control keeps its whole label and icon inside its own box and inside
// the screen, and no two controls overlap, in every view, both themes, at 320 and 390 (Sean's October 21 screenshot:
// "Following" was squeezed into the 44px refresh column and spilled over the Player select).
test('the tracked-bet toolbar fits a phone in every view: Following, Player and refresh never clip or overlap', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await openBets(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const value of ['mybets', 'feed', 'myweek', 'compare', 'history']) {
          await selectTracker(page,'Bet tracker view',value);
          const toolbar = page.locator('.social-toolbar');
          await expect(toolbar.getByRole('button', { name: 'Refresh bet tracker', exact: true })).toBeVisible();
          if (value !== 'mybets') await expect(toolbar.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
          const problems = await toolbar.evaluate(bar => {
            const out = [], vw = document.documentElement.clientWidth;
            const controls = [...bar.querySelectorAll('button, select')].filter(el => el.getClientRects().length);
            for (const el of controls) {
              const r = el.getBoundingClientRect(), name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30);
              if (el.scrollWidth > el.clientWidth + 1) out.push(`${name}: content wider than its box`);
              if (r.left < 0 || r.right > vw + 0.5) out.push(`${name}: outside the screen`);
              for (const child of el.querySelectorAll('svg')) { const c = child.getBoundingClientRect(); if (c.left < r.left - 0.5 || c.right > r.right + 0.5) out.push(`${name}: icon outside its box`); }
              for (const other of controls) {
                if (other === el) continue;
                const q = other.getBoundingClientRect();
                if (Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1) out.push(`${name}: overlaps ${other.getAttribute('aria-label') || other.textContent.trim().slice(0, 30)}`);
              }
            }
            const refresh = bar.querySelector('.icon-button').getBoundingClientRect();
            if (refresh.width > 48) out.push(`refresh: ${Math.round(refresh.width)}px wide, expected the 44px icon button`);
            return [...new Set(out)];
          });
          expect(problems, `${theme} ${width}px ${value}`).toEqual([]);
        }
      }
    }
  } finally {
    await world.db.close();
  }
});

test('roomy parlay preview expands all six exact saved selections in place and collapses with focus restored',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const calls=callsFrom(page),gameId=world.state.games[0].id;
  await openBets(page);await page.getByRole('button',{name:'Add bet',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Add a tracked bet'});
  await editor.getByRole('group',{name:'Bet type',exact:true}).getByRole('button',{name:'Parlay',exact:true}).click();
  for(let i=0;i<6;i++){
   if(i>=2)await editor.getByRole('button',{name:'Add parlay leg',exact:true}).click();
   const leg=editor.locator('.social-leg-editor').nth(i);
   await leg.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:gameId.replace('-',' @ '),exact:true}).click();
   await leg.getByRole('group',{name:'Market',exact:true}).getByRole('button',{name:'Player prop',exact:true}).click();
   await leg.getByLabel('Prop market',{exact:true}).selectOption('anytime touchdown');
   await leg.getByLabel('Player name',{exact:true}).fill(`Fixture Scorer ${i+1}`);
  }
  await editor.getByRole('group',{name:'Combined American odds',exact:true}).getByRole('button',{name:'+1400',exact:true}).click();
  await editor.getByRole('group',{name:'Stake entry',exact:true}).getByRole('button',{name:'Cash ($)',exact:true}).click();
  await editor.getByLabel('Cash value of 1U ($)',{exact:true}).fill('100');
  await editor.getByLabel('Cash stake ($)',{exact:true}).fill('25');
  await editor.getByText('More sportsbooks',{exact:true}).click();
  await editor.getByRole('button',{name:'Fanatics',exact:true}).click();
  await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();
  await expect(editor).toHaveCount(0);
  const row=page.locator('.gx-tracked-row');await expect(row).toHaveCount(1);
  const preview=row.getByRole('button',{name:'Expand 6-leg parlay',exact:true});
  await expect(preview).toHaveAttribute('aria-expanded','false');
  await expect(row.locator('.gx-tracked-legs > li:visible')).toHaveCount(0);
  await expect(preview).toContainText('$25.00');await expect(preview).toContainText('$375.00');
  const readsBeforeExpand=calls.length;
  await preview.focus();await page.keyboard.press('Enter');
  await expect(row.getByRole('button',{name:'Collapse 6-leg parlay',exact:true})).toBeFocused();
  await expect(row.locator('.gx-tracked-legs > li:visible')).toHaveCount(6);
  expect(calls.length).toBe(readsBeforeExpand);
  for(let i=1;i<=6;i++)await expect(row.getByText(`Fixture Scorer ${i}`,{exact:true})).toBeVisible();
  await expect(row).toContainText('$25.00');await expect(row).toContainText('$375.00');
  const write=calls.find(c=>c.path==='social/create');expect(write.body.stakeUnits).toBe(.25);
  for(const leg of write.body.legs){expect(Object.keys(leg).sort()).toEqual(['gameId','line','market','selection','side']);expect(leg.line).toBe(null);expect(leg.selection).toContain('anytime touchdown (1+)');}
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [320,390]){
   await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await row.screenshot({path:`.local/my-bets-roomy/expanded-${theme}-${width}.png`});
   await row.getByRole('button',{name:'Collapse 6-leg parlay',exact:true}).focus();await page.keyboard.press('Space');
   await expect(preview).toBeFocused();await expect(row.locator('.gx-tracked-legs > li:visible')).toHaveCount(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await row.screenshot({path:`.local/my-bets-roomy/preview-${theme}-${width}.png`});
   await preview.press('Enter');await expect(row.locator('.gx-tracked-legs > li:visible')).toHaveCount(6);
  }}
  const scan=await new AxeBuilder({page}).include('.gx-bets').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
  await row.getByRole('button',{name:'Collapse 6-leg parlay',exact:true}).click();
  const previewScan=await new AxeBuilder({page}).include('.gx-bets').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(previewScan.violations.map(v=>v.id)).toEqual([]);
  await page.reload();await expect(page.locator('.gx-tracked-legs > li:visible')).toHaveCount(0);await expect(page.locator('.gx-tracked-preview')).toContainText('$25.00');
  await page.getByRole('button',{name:'Expand 6-leg parlay',exact:true}).click();await expect(page.locator('.gx-tracked-legs > li:visible')).toHaveCount(6);
  expect(calls.filter(c=>c.path==='social/create')).toHaveLength(1);expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('guided milestone keeps 70+ and four-decimal units after save and correction',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL);
 try{
  const calls=callsFrom(page),gameId=world.state.games[0].id;
  await openBets(page);await page.getByRole('button',{name:'Add bet',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Add a tracked bet'});
  await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:gameId.replace('-',' @ '),exact:true}).click();
  await editor.getByRole('group',{name:'Market',exact:true}).getByRole('button',{name:'Player prop',exact:true}).click();
  await editor.getByLabel('Player name',{exact:true}).fill('Fixture Runner');
  await editor.getByRole('group',{name:'Prop direction',exact:true}).getByRole('button',{name:'At least (+)',exact:true}).click();
  await editor.getByLabel('Prop line',{exact:true}).fill('70');
  await editor.getByRole('group',{name:'Stake entry',exact:true}).getByRole('button',{name:'Cash ($)',exact:true}).click();
  await editor.getByLabel('Cash value of 1U ($)',{exact:true}).fill('100');await editor.getByLabel('Cash stake ($)',{exact:true}).fill('7.47');
  await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();await expect(editor).toHaveCount(0);
  const row=page.locator('.gx-tracked-row');await expect(row.locator('.gx-tracked-preview')).toContainText('70+');await expect(row.locator('.gx-tracked-preview')).toContainText('$7.47');
  await row.getByRole('button',{name:'Expand Fixture Runner',exact:true}).click();await expect(row.locator('.gx-tracked-money')).toContainText('0.0747U');
  expect(calls.find(c=>c.path==='social/create').body.legs[0]).toMatchObject({line:70,selection:'Fixture Runner 70+ rushing yards'});
  await row.getByRole('button',{name:'Ticket details',exact:true}).click();await row.getByText('Details & history',{exact:true}).click();await row.getByRole('button',{name:'Correct ticket',exact:true}).click();
  const correction=page.getByRole('dialog',{name:'Correct saved bet'});await correction.getByLabel('Reason for correction',{exact:true}).fill('Reviewed exact recorded milestone');await correction.getByRole('button',{name:'Save correction',exact:true}).click();await expect(correction).toHaveCount(0);
  const fixed=calls.find(c=>c.path==='social/correct');expect(fixed.body.stakeUnits).toBe(.0747);expect(fixed.body.legs[0].selection).toBe('Fixture Runner 70+ rushing yards');expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('populated tickets keep a measured 32px gap after lazy styles load and inline expansion',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL,{games:3});
 try{
  await openBets(page);
  for(let i=0;i<3;i++){
   const editor=await fillTicket(page,world.state.games[i].id);
   await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();await expect(editor).toHaveCount(0);
  }
  const rows=page.locator('.gx-tracked-row');await expect(rows).toHaveCount(3);
  for(const theme of ['light','dark'])for(const width of [320,390]){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:844});
   for(const expanded of [false,true]){
    if(expanded)await rows.first().locator('.gx-tracked-preview').click();
    const geometry=await rows.evaluateAll(elements=>elements.map((el,i)=>({gap:i?el.getBoundingClientRect().top-elements[i-1].getBoundingClientRect().bottom:null,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
    for(const row of geometry){if(row.gap!==null)expect(row.gap,`${theme} ${width}px expanded=${expanded}`).toBeCloseTo(32,0);expect(row.left).toBeGreaterThanOrEqual(0);expect(row.right).toBeLessThanOrEqual(width);}
    if(expanded)await rows.first().getByRole('button',{name:/^Collapse /}).click();
   }
   await page.screenshot({path:`.local/weekend-bets/spacing-${theme}-${width}.png`,fullPage:true});
  }
  await page.reload();await expect(rows).toHaveCount(3);
  expect(await rows.nth(1).evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom)).toBeCloseTo(32,0);
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('matchup and sportsbook searches plus roster suggestions keep exact manually selected prop terms',async({page,baseURL})=>{
 const world=await communityWorld(page,baseURL,{games:8});
 try{
  const snapshot=JSON.parse(fs.readFileSync('shared/fantasy/2026-week-06.json','utf8'));
  snapshot.week=world.state.league.week;snapshot.statsThroughWeek=snapshot.week-1;
  const game=world.state.games[0],teams=game.id.split('-').map(t=>t==='LAR'?'LA':t);
  const matching=snapshot.players.find(p=>teams.includes(p.team));expect(matching).toBeTruthy();
  await page.route(url=>url.origin===SUPABASE&&url.pathname.endsWith('/gtl-api/fantasy/week'),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({snapshot,review:null,index:{season:2026,snapshots:[{week:snapshot.week}]},source:{stale:false}})}));
  const calls=callsFrom(page);await openBets(page);await page.getByRole('button',{name:'Add bet',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Add a tracked bet'});
  await editor.getByLabel('Find matchup',{exact:true}).fill(teams[0]);
  await editor.getByRole('group',{name:'Matchup',exact:true}).getByRole('button',{name:game.id.replace('-',' @ '),exact:true}).click();
  await editor.getByRole('group',{name:'Market',exact:true}).getByRole('button',{name:'Player prop',exact:true}).click();
  await editor.getByLabel('Player name',{exact:true}).fill(matching.name.slice(0,3));
  await editor.getByRole('group',{name:'Matching players'}).getByRole('button',{name:`${matching.name} · ${matching.team} ${matching.position}`,exact:true}).click();
  await expect(editor.getByLabel('Player name',{exact:true})).toHaveValue(matching.name);
  await editor.getByLabel('Prop market',{exact:true}).selectOption('receiving yards');
  await editor.getByRole('group',{name:'Prop direction',exact:true}).getByRole('button',{name:'At least (+)',exact:true}).click();await editor.getByLabel('Prop line',{exact:true}).fill('40');
  await editor.getByText('More sportsbooks',{exact:true}).click();await editor.getByLabel('Find sportsbook',{exact:true}).fill('Prophet');
  await editor.getByLabel('Find sportsbook',{exact:true}).press('Enter');await expect(editor).toBeVisible();
  expect(calls.filter(c=>c.path==='social/create')).toHaveLength(0);
  await editor.getByRole('button',{name:'ProphetX',exact:true}).click();
  expect(calls.filter(c=>c.path==='social/create')).toHaveLength(0);
  await editor.getByRole('button',{name:'Save tracked bet',exact:true}).click();await expect(editor).toHaveCount(0);
  const write=calls.find(c=>c.path==='social/create');expect(write.body.source).toBe('ProphetX');expect(write.body.legs[0]).toEqual({gameId:game.id,market:'prop',side:matching.name,line:40,selection:`${matching.name} 40+ receiving yards`});
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
