import { test, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { providerCommunityError } from '../../cloud/community.mjs';
import { weekOpenAt } from '../../shared/nfl-schedule.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { openDeadline } from './fixture-deadline.mjs';
import { shiftBrowserClock } from './test-clock.mjs';
import { HOSTED, PRELUDE, migrationSql } from '../migrations.mjs';
let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
// The old app on the schema players actually have (tests/migrations.mjs).
const migrations = HOSTED;
// D-24: a week opens Monday 00:00 PT, so the fixture week must be the current Pacific
// week to be open. Its TNF deadline comes from fixture-deadline.mjs (11:59 PM PT today, or tomorrow late at night); the
// not-open fixture uses a Thursday ~5:15 PM PT deadline in a week whose Monday is still ahead.
const futureDeadline = () => new Date(Date.parse(weekOpenAt(Date.now() + 10 * DAY)) + 3 * DAY + 17.25 * 3_600_000).toISOString();

async function fixture(page, baseURL, deadline) {
  const db = new PGlite(), errors = [];
  await db.exec(PRELUDE);
  await db.exec(migrationSql(migrations[0]));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, 2);
  state.league.deadline = deadline; state.games.forEach((game, i) => { game.kickoff = new Date(Date.parse(deadline) + i * 3_600_000).toISOString(); });
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
  await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
  const troyTotalPicks = { [state.games[0].id]: 44, [state.games[1].id]: 47.5 };
  for (const file of migrations.slice(1)) {
    await db.exec(migrationSql(file));
    // Troy's pre-D-17 submitted Total ballot: its picks stay hidden from Ben until Ben submits or sits out (D-23).
    if (file === '20261008182836_gtl_canonical_weekly_entries.sql') {
      await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3)', [id(2), state.league.season, state.league.week]);
      await db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)',
        [id(2), state.league.season, state.league.week, 'guess_total', { picks: troyTotalPicks, submittedAt: '2026-10-08T18:00:00Z' }]);
    }
  }
  await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Ben Fixture'),($2,'Troy Fixture')", [id(1), id(2)]);
  await db.query("insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,dedupe_key,created_at) values($1,'ballot_submitted',$2,$3,'guess_total',$4,'2026-10-08T18:00:00Z')",
    [id(2), state.league.season, state.league.week, `ballot:${id(2)}:${state.league.season}:${state.league.week}:guess_total`]);
  const rpc = mapper => async (name, args) => {
    try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
    catch (error) { throw mapper(error.message); }
  };
  const user = { id: id(1), aud: 'authenticated', role: 'authenticated', email: 'ben@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
  const handler = createCloudHandler({ authenticate: async value => value === token ? { ...user, emailConfirmed: true } : null,
    social: { rpc: rpc(providerSocialError) }, personal: { rpc: rpc(providerPersonalError) }, lobby: { rpc: rpc(providerLobbyError) }, community: { rpc: rpc(providerCommunityError) }, odds: { rpc: rpc(providerPersonalError) },
    storage: { membership() { throw new Error('Community routes must not require membership.'); } } });
  page.on('pageerror', error => errors.push(error.message));
  await shiftBrowserClock(page);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
    if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
    if (url.pathname === '/auth/v1/token') return reply(200, session);
    if (url.pathname === '/auth/v1/user') return reply(200, user);
    if (url.pathname === '/auth/v1/logout') return reply(200, {});
    const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return { db, state, errors };
}

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('ben@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
}

for (const width of [390, 1280]) test(`community home: feed, picks due, likes, comments and chip entry at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const { db, state, errors } = await fixture(page, baseURL, openDeadline());
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await expect(page.locator('.picks-due')).toContainText('Week 5 picks due');
    await expect(page.locator('.picks-due')).toContainText('Spread 0/2 · Total 0/2');
    // Redesign stage 17 (D-36, DP-2): Spread and Total are two boards, each ranked on its own.
    await expect(page.getByRole('table', { name: 'Spread', exact: true })).toContainText('Troy Fixture');
    await expect(page.getByRole('table', { name: 'Total', exact: true })).toContainText('Troy Fixture');
    await expect(page.locator('.feed-post').filter({ hasText: 'Troy Fixture joined Guess The Line.' })).toBeVisible();
    const troyTotal = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 5 Total picks.' });
    await expect(troyTotal).toContainText('Submit your Week 5 Total picks to see these.');
    await expect(troyTotal).not.toContainText('47.5');
    await expect(page.getByText('Preview / publish early (fallback)')).toHaveCount(0);

    const troyPost = page.locator('.feed-post').filter({ hasText: 'Troy Fixture joined' });
    await troyPost.getByRole('button', { name: /likes/ }).click();
    await expect(troyPost.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'true');
    await troyPost.getByLabel('Comment', { exact: true }).fill('Welcome to the board');
    await troyPost.getByRole('button', { name: 'Post comment' }).click();
    await expect(troyPost.locator('.feed-comments')).toContainText('Ben Fixture Welcome to the board');

    await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
    const first = page.locator('.week-pick').first();
    await expect(first.locator('.team-facts')).toContainText('as of Week');
    await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
    await first.getByRole('radio', { name: '−9.5', exact: true }).click();
    await expect(first.locator('.chip-summary')).toHaveText('Cowboys −9.5');
    await first.getByRole('button', { name: 'Lower by half a point' }).click();
    await expect(first.locator('.chip-summary')).toHaveText('Cowboys −9');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    const saved = (await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id(1)])).rows[0].ballot;
    expect(saved.picks[state.games[0].id]).toBe(-9);
    expect(saved.submittedAt).toBeNull();
    // Switching markets must build the Total chips from the Total ballot (empty, centered on 44), never from the saved Spread value.
    await page.getByRole('button', { name: 'Total', exact: true }).click();
    await expect(first.locator('.number-chip')).toHaveText(['39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49']);
    await expect(first.locator('.chip-summary')).toHaveText('No pick yet');
    await page.getByRole('button', { name: 'Spread', exact: true }).click();
    await expect(first.locator('.chip-summary')).toHaveText('Cowboys −9');

    await page.getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(page.locator('.picks-due')).toContainText('Spread 1/2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/community-${width}.png`, fullPage: true });

    // D-23: sit out Total. Final for the week; Total chips close and others' Total picks appear.
    await page.getByRole('button', { name: /^Picks/ }).click();
    await page.getByRole('button', { name: 'Total', exact: true }).click();
    await page.getByRole('button', { name: 'Sit out this week' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sit out Week 5 Total?' });
    await expect(dialog).toContainText('This is final for Week 5 Total');
    await dialog.getByRole('button', { name: 'Sit out Total' }).click();
    await expect(page.locator('.week-picks')).toContainText("Sat out · others' picks visible");
    await expect(page.getByRole('button', { name: 'Total · Sat out', exact: true })).toBeVisible();
    // Persona audit #41: the sat-out market shows the other members' revealed Total picks as read-only chips where the chip rows were.
    const firstCard = page.locator('.week-pick').first();
    await expect(firstCard.locator('.chip-picker')).toHaveCount(0);
    await expect(firstCard.locator('.revealed-picks li')).toHaveText(['Troy Fixture44']);
    await expect(page.locator('.week-pick').nth(1).locator('.revealed-chip')).toHaveText(['47.5']);
    await expect(page.getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
    expect((await db.query('select user_id,mode from public.gtl_weekly_optouts')).rows).toEqual([{ user_id: id(1), mode: 'guess_total' }]);
    await page.getByRole('button', { name: 'Spread', exact: true }).click();
    await expect(page.locator('.revealed-picks')).toHaveCount(0);
    await expect(page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' })).toBeVisible();
    for (const chip of await page.locator('.week-pick').first().locator('.chip-teams .chip').all()) await expect(chip).toBeEnabled();
    await page.getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(page.locator('.picks-due')).toContainText('Spread 1/2');
    await expect(page.locator('.picks-due')).not.toContainText('Total');
    await expect(page.getByRole('button', { name: 'Picks (1 due)' })).toBeVisible();
    await expect(troyTotal.locator('.post-picks')).toContainText('47.5');
    await expect(troyTotal).not.toContainText('Submit your Week 5 Total picks to see these.');
    await expect(page.getByRole('table', { name: 'Total', exact: true }).locator('tr.me')).toContainText('Sat out');
    await expect(page.getByRole('table', { name: 'Spread', exact: true })).not.toContainText('Sat out');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/sit-out-${width}.png`, fullPage: true });

    // D-22: NFL is live; five leagues are "Coming soon" with a Notify me toggle and nothing playable.
    const switcher = page.getByRole('group', { name: 'League' });
    await expect(switcher.getByRole('button')).toHaveCount(6);
    await expect(switcher.getByRole('button', { name: /^NFL\s*Live$/ })).toHaveAttribute('aria-pressed', 'true');
    for (const league of ['NBA', 'MLB', 'NHL', 'College Football', 'College Basketball']) {
      await expect(switcher.getByRole('button', { name: new RegExp(`^${league}\\s*Coming soon$`) })).toHaveAttribute('aria-pressed', 'false');
    }
    const soon = page.locator('.coming-soon');
    await expect(soon.getByRole('heading', { name: 'Coming soon', exact: true })).toBeVisible();
    await expect(soon.locator('.coming-soon-card')).toHaveCount(5);
    await expect(soon.locator('[data-league="nhl"]')).toContainText('Typical season window: Regular season typically runs early October to mid-April.');
    await expect(soon.locator('img')).toHaveCount(0);
    const nba = soon.locator('[data-league="nba"]');
    await expect(nba.getByRole('button', { name: /Notify me/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(nba).toContainText('0 members waiting');
    await nba.getByRole('button', { name: /Notify me/ }).click();
    await expect(nba.getByRole('button', { name: /Notify me/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(nba).toContainText('1 member waiting');
    expect((await db.query('select league,notify from public.gtl_league_interest where user_id=$1', [id(1)])).rows).toEqual([{ league: 'nba', notify: true }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/coming-soon-${width}.png`, fullPage: true });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('.coming-soon [data-league="nba"]').getByRole('button', { name: /Notify me/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.coming-soon [data-league="mlb"]').getByRole('button', { name: /Notify me/ })).toHaveAttribute('aria-pressed', 'false');

    // Selecting a coming-soon league shows only its card: no feed, picks, games or odds.
    const url = page.url();
    await page.getByRole('group', { name: 'League' }).getByRole('button', { name: /^College Football/ }).click();
    expect(page.url()).toBe(url);
    await expect(page.locator('.coming-soon-card')).toHaveCount(1);
    await expect(page.locator('[data-league="cfb"]')).toContainText('Typical season window: Season typically runs late August to early January.');
    await expect(page.locator('.feed-post')).toHaveCount(0);
    await expect(page.locator('.picks-due')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Community sections' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Back to NFL' }).click();
    await expect(page.getByRole('group', { name: 'League' }).getByRole('button', { name: /^NFL/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.feed-post').first()).toBeVisible();

    await page.getByRole('button', { name: /Groups & games/ }).click();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '← Community' }).click();
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});

test('community home: a week that has not opened shows its Monday 12:00 AM PT open and disables entry at 390px', async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const deadline = futureDeadline();
  const { db, errors } = await fixture(page, baseURL, deadline);
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page);
    const opens = new Date(weekOpenAt(deadline)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    expect(opens).toMatch(/^Mon, .* 12:00 AM$/);
    await expect(page.locator('.picks-due')).toContainText(`Week 5 opens ${opens} PT`);
    // Persona audit quick win 9 (#43, #44): no counts before the open, a relative hint plus the due time; the Picks tab is a read-only schedule.
    const dueOn = new Date(deadline).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const days = Math.ceil((Date.parse(weekOpenAt(deadline)) - Date.now()) / DAY);
    await expect(page.locator('.picks-due')).toContainText(`${days > 1 ? `In ${days} days` : 'Tomorrow'} · Picks due ${dueOn} PT`);
    await expect(page.locator('.picks-due')).not.toContainText('0/2');
    await expect(page.locator('.picks-due').getByRole('button', { name: 'Make picks' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Picks', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Picks', exact: true }).click();
    await expect(page.locator('.week-not-open h3')).toHaveText(`Week 5 opens ${opens} PT`);
    await expect(page.locator('.week-not-open')).toContainText('Nobody can pick before then.');
    const first = page.locator('.week-pick').first();
    await expect(page.locator('.week-pick')).toHaveCount(2);
    await expect(first).toContainText('Tampa Bay Buccaneers @ Dallas Cowboys');
    await expect(first.locator('.team-facts')).toContainText('as of Week');
    await expect(page.locator('.week-pick button.chip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Submit/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/previews/week-not-open-390.png', fullPage: true });
    // The database refuses the save regardless of the screen.
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [id(1)]);
    await expect(db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread','{\"picks\":{}}')", [id(1)])).rejects.toThrow(/GTL_PREDICTION_NOT_OPEN/);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
