import { setCaptureTheme } from './theme-capture.mjs';
// D-68 acceptance through the real auth tree, EPL routes and M-30/M-31 on disposable PGlite.
// Every identity, lineup, projection and queue here is synthetic; no hosted account is read or changed.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerEplError } from '../../cloud/epl.mjs';
import { MANAGER_NAMES } from '../../shared/epl-sleeper.mjs';
import { ALL } from '../migrations.mjs';
import { createCommunityWorld, pgliteAvailable, SUPABASE, signIn, ACCOUNTS } from './community-world.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

test.use({ actionTimeout: 10000 });

const SEAN = '473955676301815808', EVAN = '719658248843632640', ADAM = '719745569895018496';
const snapshots = [{ label: 'after-mw08', week: 8, capturedAt: '2026-10-28T12:00:00Z', payload: {
  state: { week: 9, season: '2026' }, league: { scoring_settings: { pos_f_g: 9 } },
  users: [SEAN, EVAN, ADAM].map(user_id => ({ user_id, display_name: MANAGER_NAMES[user_id] })),
  rosters: [SEAN, EVAN, ADAM].map((owner_id, i) => ({ owner_id, roster_id: i + 1,
    starters: [`${i + 1}1`, `${i + 1}2`], players: [`${i + 1}1`, `${i + 1}2`],
    settings: { fpts: 800 - i * 100, fpts_decimal: 0, fpts_against: 700, fpts_against_decimal: 0, wins: 5, losses: 3 } })),
  players: Object.fromEntries([1, 2, 3].flatMap(i => [[`${i}1`, { name: `Fixture forward ${i}`, position: 'F', team_abbr: 'ARS' }],
    [`${i}2`, { name: `Missing projection ${i}`, position: 'M', team_abbr: 'LIV' }]])),
  projections_mw9: [1, 2, 3].map(i => ({ player_id: `${i}1`, stats: { g: i } })),
} }];

async function fixture(page, baseURL) {
  const world = await createCommunityWorld({ migrations: ALL, optionalRpc: true });
  const calls = [], replies = [], controls = { failFantasy: false, noFantasy: false, holdRead: null, held: false };
  const kickoff = new Date(Date.now() + 3 * 86400000).toISOString();
  await world.db.query(`update public.gtl_epl_managers set user_id=$1 where owner_id=$2`, [ACCOUNTS.troy.id, EVAN]);
  await world.db.query(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
    values(2026,9,now()-interval '1 day',now()+interval '7 days',$1,$2,'open')`, [kickoff, [ADAM, EVAN, SEAN]]);
  await world.db.query(`insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time)
    values('fixture-ars-che',2026,9,'ARS','CHE',$1),('fixture-liv-eve',2026,9,'LIV','EVE',$1)`, [kickoff]);
  await world.db.query(`insert into public.gtl_epl_queues(season,week,owner_id,clubs) values(2026,9,$1,'{LIV}')`, [EVAN]);
  const rpc = async (name, args) => {
    try { return await world.db.transaction(async tx => {
      await tx.exec('set local role service_role');
      return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) result`, Object.values(args))).rows[0].result;
    }); } catch (error) { throw providerEplError(error.message); }
  };
  const service = { rpc, latestWeek: async () => ({ season: 2026, week: 9 }),
    readQueue: async (season, week, owner) => (await world.db.query('select clubs from public.gtl_epl_queues where season=$1 and week=$2 and owner_id=$3', [season, week, owner])).rows[0]?.clubs ?? [],
    unclaimedManagers: async user => (await world.db.query(`select owner_id from public.gtl_epl_managers m where user_id is null
      and not exists(select 1 from public.gtl_epl_link_audit a where a.owner_id=m.owner_id and a.user_id=$1 and a.action='unlink')`, [user])).rows.map(r => ({ ownerId: r.owner_id, name: MANAGER_NAMES[r.owner_id] })),
    readSnapshots: async () => controls.noFantasy ? [] : snapshots, readBonus: async () => [],
  };
  const handler = createCloudHandler({ authenticate: async token => world.users.has(token) ? { ...world.users.get(token), emailConfirmed: true } : null, epl: service });
  page.on('pageerror', error => world.errors.push(error.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (isWebfont(url)) return route.abort();
    if (url.origin !== SUPABASE) { world.errors.push(`Unexpected origin ${url.origin}`); return route.abort(); }
    if (url.pathname === '/auth/v1/token') return reply(200, world.sessions[req.postDataJSON().email]);
    if (url.pathname === '/auth/v1/user') return reply(200, world.users.get(req.headers().authorization.replace('Bearer ', '')));
    if (url.pathname === '/auth/v1/logout') return reply(200, {});
    const path = url.pathname.split('/gtl-api/')[1];
    calls.push({ path, body: req.method() === 'POST' ? req.postDataJSON() : null });
    if (path === 'epl/fantasy/read' && controls.failFantasy) return reply(503, { error: 'Fixture unavailable' });
    const response = await (path?.startsWith('epl/') ? handler : world.handler)(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    const body = await response.json();
    // Lobby fixture advertises M-30 availability; EPL route membership/claims are the real SQL above.
    if (path === 'lobby') body.epl = true;
    replies.push({ path, body });
    if (path === controls.holdPath && controls.holdRead) { const held = controls.holdRead; controls.held = true; await held; }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) }).catch(() => {});
  });
  return { ...world, calls, replies, controls, rpc };
}

async function enter(page, account = 'luke', hash = '#epl/play/pick') {
  await page.goto(`/${hash}`); await signIn(page, account, { navigate: false });
  await expect(page.locator('.gx-epl')).toBeVisible();
}

test('saved backup becomes the confirmed team as the previous manager picks, with no browser auto-pick write or repeat popup',async({page,baseURL})=>{
 test.skip(!pgliteAvailable,'Disposable PGlite required.');test.setTimeout(90000);
 const world=await fixture(page,baseURL);
 try{
  await world.db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2',[ACCOUNTS.luke.id,ADAM]);
  await enter(page,'troy');
  await expect(page.getByRole('region',{name:'Backup pick confirmed'})).toHaveCount(0);
  await captureEpl(page,'draft-waiting','epl-waiting');
  await page.getByRole('button',{name:'Set my backup ranking (queue)',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Backup ranking'})).toContainText('When your turn starts');
  await expect(page.getByRole('dialog',{name:'Backup ranking'})).toContainText('your turn stays open for a manual pick');
  await page.getByRole('dialog',{name:'Backup ranking'}).getByRole('button',{name:'Close',exact:true}).click();
  // Another manager's server-side pick advances the queue even though the queued player sends no pick request.
  await world.rpc('gtl_epl_save_pick',{p_user:ACCOUNTS.luke.id,p_season:2026,p_week:9,p_club:'ARS'});
  expect((await world.db.query('select club,source from public.gtl_epl_picks where owner_id=$1',[EVAN])).rows).toEqual([{club:'LIV',source:'queue'}]);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const confirmation=page.getByRole('region',{name:'Backup pick confirmed'});await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Liverpool was assigned from your backup ranking.');
  const toast=page.locator('.gx-epl-toast');await expect(toast).toContainText('Liverpool was assigned from your backup ranking.');
  await toast.getByRole('button',{name:'Dismiss',exact:true}).click();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(toast).toHaveCount(0);
  await page.reload();await expect(confirmation).toBeVisible();await expect(toast).toHaveCount(0);
  for(const theme of ['light','dark'])for(const width of [320,390]){
   await setCaptureTheme(page,theme);await page.setViewportSize({width,height:844});await layout(page);
   const scan=await new AxeBuilder({page}).include('.gx-epl').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);
   await page.screenshot({path:`.local/queue-confirmation/${theme}-${width}.png`,fullPage:true});
  }
  await captureEpl(page,'draft-backup-confirmed','epl-backup-confirmation');
  await page.getByRole('button',{name:/^Chelsea, at Arsenal/}).click();
  await expect(page.getByRole('button',{name:'Change to Chelsea',exact:true})).toBeVisible();
  await captureEpl(page,'draft-latest-change','epl-draft-board');
  expect(world.calls.filter(c=>c.path==='epl/draft/pick'||c.path==='epl/queue/save')).toEqual([]);
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const brokenLabels = await page.locator('.gx-epl-fx > .gx-seg button').evaluateAll(buttons => buttons.filter(button => {
    const range = document.createRange(); range.selectNodeContents(button);
    return range.getClientRects().length !== 1;
  }).map(button => button.textContent));
  expect(brokenLabels).toEqual([]);
  const small = await page.locator('.gx-epl').evaluate(root => [...root.querySelectorAll('button,summary')].filter(el => el.getClientRects().length && !el.closest('details:not([open]) :not(summary)')).flatMap(el => {
    const r = el.getBoundingClientRect(), css = getComputedStyle(el);
    return r.width < 43.9 || r.height < 43.9 || Number.parseFloat(css.fontSize) < 16 ? [{ text: el.textContent.slice(0, 40), w: r.width, h: r.height, font: css.fontSize }] : [];
  }));
  expect(small).toEqual([]);
}

test('open board stays read-only, a claim enables only its owner queue, and Fantasy has honest missing-data states', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(120000);
  const world = await fixture(page, baseURL);
  try {
    await enter(page);
    await expect(page.getByRole('heading', { name: 'Which FEPL manager are you?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set my backup ranking (queue)' })).toHaveCount(0);
    expect(await page.locator('.gx-epl-crest-grid button').count()).toBe(0);
    expect(world.replies.find(r => r.path === 'epl/draft/read').body).toMatchObject({ me: null, myQueue: [] });
    await page.getByRole('button', { name: 'Adam', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Set my backup ranking (queue)' })).toBeVisible();
    expect(world.calls.filter(r => r.path === 'epl/claim')).toHaveLength(1);
    expect((await world.db.query('select user_id from public.gtl_epl_managers where owner_id=$1', [ADAM])).rows[0].user_id).toBe(ACCOUNTS.luke.id);
    await page.getByRole('button', { name: 'Set my backup ranking (queue)' }).click();
    await expect(page.getByText('No clubs ranked yet. Add clubs below.')).toBeVisible();
    await page.getByRole('button', { name: 'Add Arsenal', exact: true }).click();
    await page.getByRole('button', { name: 'Save ranking', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Backup pick confirmed' })).toContainText('Arsenal was assigned from your backup ranking.');
    expect((await world.db.query('select owner_id,clubs from public.gtl_epl_queues order by owner_id')).rows).toEqual([
      { owner_id: EVAN, clubs: ['LIV'] }, { owner_id: ADAM, clubs: ['ARS'] },
    ].sort((a, b) => a.owner_id.localeCompare(b.owner_id)));
    await expect.poll(() => world.replies.filter(r => r.path === 'epl/draft/read').at(-1).body.myQueue).toEqual(['ARS']);
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText('Matchup unavailable this week', { exact: true })).toBeVisible();
    await expect(page.getByText("Sleeper doesn't list this league's matchups.", { exact: false })).toBeVisible();
    await expect(page.getByText('Your projection · Adam', { exact: true })).toBeVisible();
    await expect(page.getByText('No projection', { exact: true })).toBeVisible();
    fs.mkdirSync('.local/previews/epl-access', { recursive: true });
    for (const width of [320, 390, 768, 1440]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await setCaptureTheme(page, theme);
      for (const section of ['Matchup', 'Standings', 'Rosters', 'Insights']) {
        await page.getByRole('button', { name: section, exact: true }).click();
        await layout(page);
        expect((await new AxeBuilder({ page }).include('.gx-epl').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `.local/previews/epl-access/${section.toLowerCase()}-${width}-${theme}.png`, fullPage: true });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a competing claim refreshes the read-only board; unlinked Fantasy and Just watching stay usable', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(120000);
  const world = await fixture(page, baseURL);
  try {
    await enter(page);
    await expect(page.getByRole('button', { name: 'Adam', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText("You don't have a team in this league, so there's no matchup to show.", { exact: true })).toBeVisible();
    expect(world.replies.find(r => r.path === 'epl/fantasy/read').body.viewer).toBe(null);
    await expect(page.getByText('Your projection', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Standings', exact: true }).click();
    await expect(page.locator('.gx-epl-fx-standings li')).toHaveCount(3);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Adam', exact: true })).toBeVisible();
    // The board is now stale: a second fixture account wins the claim before this button is pressed.
    await world.rpc('gtl_epl_claim_manager', { p_user: ACCOUNTS.sean.id, p_owner_id: ADAM });
    await page.getByRole('button', { name: 'Adam', exact: true }).click();
    await expect(page.getByText('Someone already claimed that manager.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adam', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Set my backup ranking (queue)' })).toHaveCount(0);
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_link_audit where owner_id=$1 and action='claim'", [ADAM])).rows[0].n).toBe(1);
    for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width: 320, height: 900 });
      await setCaptureTheme(page, theme);
      await layout(page);
      expect((await new AxeBuilder({ page }).include('.gx-epl').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    }
    await page.getByRole('button', { name: 'Just watching', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Which FEPL manager are you?' })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.gx-epl-pick-hero, .gx-epl-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Which FEPL manager are you?' })).toHaveCount(0);
    expect(world.calls.filter(r => ['epl/draft/pick', 'epl/queue/save'].includes(r.path))).toHaveLength(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('automatic alias linking survives reload without duplicate audit; Fantasy retries and account switching drop a held owner reply', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(120000);
  const world = await fixture(page, baseURL); let release;
  try {
    // Remove the fixture commissioner's competing first-name match: ambiguity deliberately prevents auto-linking.
    await world.db.query('update public.gtl_profiles set display_name=$1 where user_id=$2', ['Observer fixture', ACCOUNTS.sean.id]);
    await world.db.query('update public.gtl_profiles set display_name=$1 where user_id=$2', ['Fistathon', ACCOUNTS.luke.id]);
    await enter(page);
    await expect(page.getByRole('button', { name: 'Set my backup ranking (queue)' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('button', { name: 'Set my backup ranking (queue)' })).toBeVisible();
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_link_audit where user_id=$1 and action='auto_link'", [ACCOUNTS.luke.id])).rows[0].n).toBe(1);
    world.controls.failFantasy = true;
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText("Fantasy didn't load. Check your connection and try again.")).toBeVisible();
    world.controls.failFantasy = false; world.controls.holdPath = 'epl/fantasy/read';
    world.controls.holdRead = new Promise(resolve => { release = resolve; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => world.controls.held).toBe(true);
    world.controls.holdRead = null;
    // A saved NBA address remains supported even when NBA is hidden from the sport navigation.
    // Since N1 (D-85) the old #nba/games address lands on NBA Research › Games in the Prism shell, whose menu signs out.
    await page.evaluate(() => { window.location.hash = '#nba/games'; });
    await expect(page.getByRole('heading', { name: 'NBA games', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await page.getByRole('button', { name: /^(EPL|Premier League)$/ }).click();
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText('Your projection · Evan', { exact: true })).toBeVisible();
    release();
    await expect(page.getByText('Your projection · Sean', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your projection · Evan', { exact: true })).toBeVisible();
    world.controls.noFantasy = true;
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText('No Sleeper data is saved yet.', { exact: true })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { release?.(); await world.db.close(); }
});
import { captureEpl } from './epl-prism-capture.mjs';
import { fantasyExample, FANTASY_SCENARIOS } from '../fixtures/epl-prism-fantasy.mjs';

test('Prism native EPL claim, Home, draft, queue and existing shell states', async ({page,baseURL})=>{
 test.skip(!pgliteAvailable,'Disposable PGlite required.');test.setTimeout(240000);
 const world=await fixture(page,baseURL);
 try{
  await enter(page,'luke','#epl/home');
  await expect(page.getByRole('heading',{name:'Which FEPL manager are you?'})).toBeVisible();
  await captureEpl(page,'claim-home-unlinked','epl-manager-choose / epl-home-unlinked',{forced:true});
  let finishClaim;
  world.controls.holdPath='epl/claim';world.controls.holdRead=new Promise(resolve=>{finishClaim=resolve;});
  await page.getByRole('button',{name:'Adam',exact:true}).click();
  await expect.poll(()=>world.controls.held).toBe(true);
  await captureEpl(page,'claim-busy','epl-manager-busy');
  world.controls.holdRead=null;finishClaim();
  await expect(page.getByText('You pick next · 0 of 3 in',{exact:true})).toBeVisible();
  await captureEpl(page,'claim-linked','epl-manager-linked');
  await page.locator('.gx-epl-toast').getByRole('button',{name:'Dismiss',exact:true}).click();
  await captureEpl(page,'home-turn','epl-home-turn',{representative:true});
  await page.getByRole('button',{name:'Make your pick',exact:true}).click();
  await page.getByRole('button',{name:/^Arsenal, vs Chelsea/}).click();
  await captureEpl(page,'draft-can-pick','epl-draft',{forced:true});
  await page.getByRole('button',{name:'Pick Arsenal',exact:true}).click();
  await expect(page.getByRole('region',{name:'Your pick',exact:true})).toBeVisible();
  await captureEpl(page,'team-confirmed','epl-confirmation');
  await page.getByRole('button',{name:'Set my backup ranking (queue)',exact:true}).click();
  await page.getByRole('button',{name:'Add Arsenal',exact:true}).click();
  await page.getByRole('button',{name:'Add Liverpool',exact:true}).click();
  await page.getByRole('button',{name:'Move Liverpool up',exact:true}).click();
  await expect(page.locator('.gx-epl-queue-row').first()).toContainText('Liverpool');
  await captureEpl(page,'ranked-backups','epl-draft queue',{forced:true});
  await page.getByRole('dialog',{name:'Backup ranking'}).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Backup ranking'})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.locator('.gx-epl-tile-club')).toContainText('Arsenal');
  await captureEpl(page,'home-picked','epl-home-picked');
  // EPL Home is compact; the actual FEPL Research destination retains league access.
  await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('button',{name:'Research',exact:true}).click();
  await expect(page.getByRole('heading',{name:'FEPL Fantasy',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Main',exact:true}).getByRole('button',{name:'Research',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('button',{name:'Premier League',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.gx-league-btn')).toContainText('FEPL');
  await page.locator('.gx-league-btn').click();
  await expect(page.getByRole('dialog',{name:'Your leagues',exact:true}).getByRole('button',{name:/FEPL/})).toHaveAttribute('aria-current','true');
  await captureEpl(page,'shell-leagues','epl-shell-leagues',{forced:true});
  await page.keyboard.press('Escape');
  await expect(page.locator('.gx-league-btn')).toBeFocused();
  await page.getByRole('button',{name:'Your menu',exact:true}).click();
  await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByText('Premier League history is not available here yet. Your saved picks and records are kept.',{exact:true})).toBeVisible();
  await captureEpl(page,'shell-history','epl-shell-history');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('button',{name:'Bets',exact:true}).click();
  await captureEpl(page,'shell-bets','epl-shell-bets',{forced:true});
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});

test('Prism native FEPL Fantasy maps every reviewed observation, gap and refusal input', async({page,baseURL})=>{
 test.skip(!pgliteAvailable,'Disposable PGlite required.');test.setTimeout(300000);
 const world=await fixture(page,baseURL);let example=fantasyExample('matchup'),hold;
 await page.route('**/functions/v1/gtl-api/epl/fantasy/read',async route=>{
  if(example.state.status==='loading'){await new Promise(resolve=>{hold=resolve;});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic delayed read"}'}).catch(()=>{});}
  const err=example.state.error;
  return route.fulfill({status:err?.status??(err?503:200),contentType:'application/json',body:JSON.stringify(err?{code:err.code,error:'Synthetic reviewed refusal'}:example.state.data)});
 });
 try{
  await enter(page,'luke','#epl/research');
  for(const scenario of FANTASY_SCENARIOS){
   example=fantasyExample(scenario);
   await page.reload();
   await expect(page.getByRole('heading',{name:'FEPL Fantasy',exact:true})).toBeVisible();
   if(example.section!=='matchup')await page.getByRole('button',{name:example.section[0].toUpperCase()+example.section.slice(1),exact:true}).click();
   if(example.state.status==='loaded')await expect(page.locator('.gx-epl-fx-footer')).toBeVisible();
   else if(example.state.status==='failed')await expect(page.locator('.gx-epl-fx .gx-empty')).toBeVisible();
   else await expect(page.locator('.gx-epl-fx .gx-skel')).toBeVisible();
   await captureEpl(page,`fantasy-${scenario}`,`epl-fantasy-${scenario}`,{representative:['matchup','insights'].includes(scenario),forced:['matchup','standings','insights-gaps','forbidden'].includes(scenario)});
   if(scenario==='standings'){await page.locator('.gx-epl-fx-stand-head').first().click();await captureEpl(page,'fantasy-standing-expanded','epl-fantasy-standings expanded');}
   if(scenario==='matchup'){await page.getByRole('button',{name:'About win chance'}).click();await captureEpl(page,'fantasy-estimate-info','epl-fantasy-matchup estimate Info');await page.getByRole('button',{name:'Close',exact:true}).click();}
   hold?.();hold=null;
  }
  expect(world.errors).toEqual([]);
 }finally{hold?.();await world.db.close();}
});

test('Prism native draft recovery labels retained data, clears refusals and opens stored-source guidance',async({page,baseURL})=>{
 test.skip(!pgliteAvailable,'Disposable PGlite required.');test.setTimeout(180000);
 const world=await fixture(page,baseURL);let mode='ready',read,release;
 try{
  await enter(page,'troy','#epl/home');
  read=structuredClone(world.replies.filter(r=>r.path==='epl/draft/read').at(-1).body);
  await page.route('**/functions/v1/gtl-api/epl/draft/read',async route=>{
   if(mode==='loading'){await new Promise(resolve=>{release=resolve;});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Delayed synthetic read"}'}).catch(()=>{});}
   const errors={failed:{status:503},forbidden:{status:403},off:{status:503,code:'GTL_EPL_OFF'},'no-week':{status:503,code:'GTL_EPL_NO_WEEK'}};
   const err=errors[mode];return route.fulfill({status:err?.status??200,contentType:'application/json',body:JSON.stringify(err?{error:'Synthetic review failure',code:err.code}:read)});
  });
  mode='failed';await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Couldn’t refresh the draft. Showing the last board.',{exact:true})).toBeVisible();
  await captureEpl(page,'home-stale','epl-home-stale');
  mode='ready';read.status='needs_review';read.standingsSource={kind:'wikimedia-community',official:false,dataAsOf:'2026-10-25',source:{url:'https://en.wikipedia.org/w/index.php?title=2026%E2%80%9327%20Premier%20League&oldid=1382589055'},license:{url:'https://creativecommons.org/licenses/by-sa/4.0/'}};
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Results under review',{exact:true})).toBeVisible();
  await captureEpl(page,'home-review','epl-home-review');
  await page.getByRole('button',{name:'About table fallback',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'About table fallback',exact:true})).toBeVisible();
  await captureEpl(page,'draft-source-info','epl-home-review source Info');
  await page.getByRole('dialog',{name:'About table fallback',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  read.status='open';read.onTheClock=null;read.picks=read.order.map((manager,i)=>({ownerId:manager.ownerId,club:read.clubs[i].code,final:true}));delete read.standingsSource;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('All 3 picks in',{exact:true})).toBeVisible();
  await captureEpl(page,'home-all-in','epl-home-all-in');
  read.status='closed';await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Draft locked · 3 of 3 in',{exact:true})).toBeVisible();
  await captureEpl(page,'home-locked','epl-home-locked');
  await page.goto('/#epl/play/pick');await page.reload();
  await expect(page.getByRole('button',{name:'Draft locked',exact:true})).toBeDisabled();
  await captureEpl(page,'draft-closed','epl-closed');
  for(const scenario of ['failed','forbidden','off','no-week','loading']){
   mode=scenario;await page.goto('/#epl/play/pick');await page.reload();
   if(scenario==='loading')await expect(page.locator('.gx-epl-read-state .gx-skel')).toBeVisible();
   else await expect(page.locator('.gx-epl-read-state.gx-empty')).toBeVisible();
   await expect(page.locator('.gx-epl-nodes')).toHaveCount(0);
   await captureEpl(page,`draft-recovery-${scenario}`,`epl-home-${scenario}`,{forced:scenario==='forbidden'});
   release?.();release=null;
  }
  expect(world.errors).toEqual([]);
 }finally{release?.();await world.db.close();}
});

test('Prism native manager outcomes preserve first-claim refusals, uncertain replies and session watching',async({page,baseURL})=>{
 test.skip(!pgliteAvailable,'Disposable PGlite required.');test.setTimeout(120000);
 const world=await fixture(page,baseURL);let outcome='taken';
 await page.route('**/functions/v1/gtl-api/epl/claim',route=>{
  const failures={taken:{status:409,code:'GTL_EPL_CLAIMED'},'already-linked':{status:409,code:'GTL_EPL_ALREADY_LINKED'},failed:{status:400,code:'SYNTHETIC_DEFINITE_REFUSAL'},uncertain:{status:503}};
  const f=failures[outcome];return route.fulfill({status:f.status,contentType:'application/json',body:JSON.stringify({code:f.code,error:'Synthetic claim response for native recovery'})});
 });
 try{
  await enter(page,'luke','#epl/home');
  const original=structuredClone(world.replies.filter(r=>r.path==='epl/draft/read').at(-1).body);
  for(const scenario of ['taken','already-linked','failed','uncertain']){
   outcome=scenario;await page.reload();await page.getByRole('button',{name:'Adam',exact:true}).click();
   await expect(page.locator('.gx-epl-toast')).toBeVisible();
   await captureEpl(page,`claim-${scenario}`,`epl-manager-${scenario}`);
   await expect(page.getByRole('button',{name:'Set my backup ranking (queue)',exact:true})).toHaveCount(0);
  }
  await page.locator('.gx-epl-toast').getByRole('button',{name:'Dismiss',exact:true}).click();
  await page.getByRole('button',{name:'Just watching',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which FEPL manager are you?',exact:true})).toHaveCount(0);
  await captureEpl(page,'claim-watching','epl-manager-watching');
  await page.evaluate(()=>sessionStorage.removeItem('gtl-epl-just-watching'));
  await page.route('**/functions/v1/gtl-api/epl/draft/read',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...original,me:null,claim:{managers:[]}})}));
  await page.reload();await expect(page.locator('.gx-epl-home .gx-epl-hero')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Which FEPL manager are you?',exact:true})).toHaveCount(0);
  await captureEpl(page,'claim-no-managers','epl-manager-no-managers');
  expect(world.errors).toEqual([]);
 }finally{await world.db.close();}
});
