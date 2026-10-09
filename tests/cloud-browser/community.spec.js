import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { providerCommunityError } from '../../cloud/community.mjs';
let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migrations = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008225401_gtl_submission_time_scoring.sql',
  '20261008232055_gtl_fresh_submission_odds.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql'];

for (const width of [390, 1280]) test(`community home: feed, picks due, likes, comments and chip entry at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const db = new PGlite(), errors = [];
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
    await db.exec(fs.readFileSync(`supabase/migrations/${migrations[0]}`, 'utf8'));
    const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, 2);
    state.league.deadline = '2099-10-09T00:15:00Z'; state.games.forEach(game => { game.kickoff = game.kickoff.replace('2026-', '2099-'); });
    await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
    await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
    const troyTotalPicks = { [state.games[0].id]: 44, [state.games[1].id]: 47.5 };
    for (const file of migrations.slice(1)) {
      await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
      // Troy's pre-D-17 submitted Total ballot: its picks stay hidden from Ben until Ben submits or sits out (D-23).
      if (file === migrations[2]) {
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
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin !== 'https://gtl-frontend-check.supabase.co') { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('ben@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('.picks-due')).toContainText('Week 5 picks due');
    await expect(page.locator('.picks-due')).toContainText('Spread 0/2 · Total 0/2');
    await expect(page.getByRole('table')).toContainText('Troy Fixture');
    await expect(page.locator('.feed-post').filter({ hasText: 'Troy Fixture joined Guess The Line.' })).toBeVisible();
    const troyTotal = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 5 Total picks.' });
    await expect(troyTotal).toContainText('Submit your Week 5 Total picks to see these.');
    await expect(troyTotal).not.toContainText('47.5');
    await expect(page.getByText('Publish a week')).toHaveCount(0);

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
    await first.getByRole('button', { name: '−9.5', exact: true }).click();
    await expect(first.locator('output')).toHaveText('Cowboys −9.5');
    await first.getByRole('button', { name: 'Lower by half a point' }).click();
    await expect(first.locator('output')).toHaveText('Cowboys −9');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    const saved = (await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id(1)])).rows[0].ballot;
    expect(saved.picks[state.games[0].id]).toBe(-9);
    expect(saved.submittedAt).toBeNull();

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
    const totalChips = page.locator('.week-pick').first().locator('.chip');
    expect(await totalChips.count()).toBeGreaterThan(0);
    for (const chip of await totalChips.all()) await expect(chip).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
    expect((await db.query('select user_id,mode from public.gtl_weekly_optouts')).rows).toEqual([{ user_id: id(1), mode: 'guess_total' }]);
    await page.getByRole('button', { name: 'Spread', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sit out this week' })).toBeVisible();
    for (const chip of await page.locator('.week-pick').first().locator('.chip-teams .chip').all()) await expect(chip).toBeEnabled();
    await page.getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(page.locator('.picks-due')).toContainText('Spread 1/2');
    await expect(page.locator('.picks-due')).not.toContainText('Total');
    await expect(page.getByRole('button', { name: 'Picks (1 due)' })).toBeVisible();
    await expect(troyTotal.locator('.post-picks')).toContainText('47.5');
    await expect(troyTotal).not.toContainText('Submit your Week 5 Total picks to see these.');
    await expect(page.getByRole('table')).toContainText('Sat out');
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
