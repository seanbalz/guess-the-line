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
    await expect(page.getByText('Backup ranking saved.', { exact: true })).toBeVisible();
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
    for (const width of [320, 390, 1440]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
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
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
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
    await page.evaluate(() => { window.location.hash = '#nba/games'; });
    await page.getByText('Account and appearance', { exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await page.getByRole('button', { name: 'EPL', exact: true }).click();
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
