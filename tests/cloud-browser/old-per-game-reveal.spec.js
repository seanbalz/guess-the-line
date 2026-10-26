import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, without } from '../migrations.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Redesign build plan stage 17 (D-39 per-game lock-in, D-31 kickoff, D-23, D-36, DP-1, DP-2): the old app on the per-game gate,
// with the real handler and the pre-M-07 migrations (including M-01) on local PGlite, and live rules read from the database
// (`revealAt: 'kickoff'`). At 390 x 844. Fixture accounts and values only; never contacts hosted data.
//
// The week: 2026 Week 6 (the committed trends file's week), two games. Its deadline was half an hour ago, so the first game has
// kicked off and the second kicks off in half an hour. Troy sent Spread and Total (the world's fixture ballots); Luke, the viewer,
// sent nothing and Sean has no Week 6 ballot. A finished Week 5 gives the board season points: Troy leads Spread, Sean leads
// Total, and Sean has the larger Spread + Total sum, which the old board sorted by.
test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Stage 17 verifies M-01 reveal and the original classic trends editor. M-07's replacement entry/scoring
// surface is exercised separately in next-per-game-scoring.spec.js; keep this historical regression intact.
// Without M-07, and without the later files that rebuild on its bodies (M-21's gtl_read_community): tests/migrations.mjs without().
const BEFORE_M07 = without(ALL, '20261015190710_gtl_guess_write_window.sql');
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};
// Week 5, finished: one game, a stored line per ballot; points = 10 − 2·|guess − line|.
const WEEK5 = { game: 'NYJ-BUF', kickoff: Math.floor(Date.parse('2026-10-05T00:20:00Z') / 1000) };
const WEEK5_BALLOTS = [
  ['troy', 'guess_spread', -3, -3.5], // 9
  ['troy', 'guess_total', 44, 40], // 2
  ['sean', 'guess_spread', 3, -1], // 2
  ['sean', 'guess_total', 41, 41], // 10
];

async function seedWeek5(db) {
  await db.transaction(async tx => {
    // Written the way the group-league migration wrote rows, before the save guards (no trigger runs, so no feed post).
    await tx.exec('set local session_replication_role = replica');
    await tx.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,5,$1)',
      [{ season: 2026, week: 5, deadline: WEEK5.kickoff, games: [{ id: WEEK5.game, away: 'NYJ', home: 'BUF', kickoff: WEEK5.kickoff }] }]);
    for (const who of ['troy', 'sean']) await tx.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5)', [ACCOUNTS[who].id]);
    for (const [who, mode, guess, line] of WEEK5_BALLOTS) {
      await tx.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,$2,$3)', [ACCOUNTS[who].id, mode,
        { picks: { [WEEK5.game]: guess }, submittedAt: new Date((WEEK5.kickoff - 3600) * 1000).toISOString(), scoringReferences: { [WEEK5.game]: { status: 'available', value: line } } }]);
    }
  });
}

async function phoneChecks(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
}
async function axe(page, label) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('.community-leaderboard, .community-history').first()).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await phoneChecks(page);
      const result = await new AxeBuilder({ page }).include('main').withTags(AXE_TAGS).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${label} ${theme} ${width}`).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.evaluate(() => localStorage.setItem('gtl.theme', 'dark'));
}

test('stage 17: the old app opens picks game by game at kickoff, shows "—" for no ballot and ranks Spread and Total apart', async ({ page, baseURL }) => {
  const deadline = new Date(Date.now() - 30 * 60_000).toISOString();
  const world = await communityWorld(page, baseURL, { migrations: BEFORE_M07, optionalRpc: true, prepare: WEEK6, deadline, games: 2 });
  const { db, errors } = world;
  try {
    await seedWeek5(db);
    const replies = [];
    page.on('response', async response => { if (/\/community\/(read|history)$/.test(new URL(response.url()).pathname)) replies.push(await response.text()); });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();

    // The board: two tables, each ranked by its own season points; no ballot is "—", never 0 (DP-1, DP-2).
    const spread = page.getByRole('table', { name: 'Spread', exact: true }), total = page.getByRole('table', { name: 'Total', exact: true });
    await expect(spread.locator('tbody th')).toHaveText(['Troy Fixture', 'Sean Fixture', 'Luke Fixture']);
    await expect(total.locator('tbody th')).toHaveText(['Sean Fixture', 'Troy Fixture', 'Luke Fixture']);
    await expect(spread.locator('thead th')).toHaveText(['Player', 'Week 6', 'Season']);
    const cells = table => table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(td => td.textContent)));
    // Troy sent Week 6, but no line was stored before its first kickoff, so 0 of 0; Sean has no Week 6 ballot: "—"; Luke has none at all.
    expect(await cells(spread)).toEqual([['0', '9'], ['—', '2'], ['—', '—']]);
    expect(await cells(total)).toEqual([['—', '10'], ['0', '2'], ['—', '—']]);
    await expect(page.locator('.community-leaderboard')).toContainText('Spread and Total are ranked separately; their points are never added together.');
    await expect(page.locator('.community-leaderboard')).toContainText("Each game's points count from its kickoff, so week totals grow game by game.");
    await expect(page.locator('.community-leaderboard')).not.toContainText('0.0');

    // The feed: Troy's posts show the kicked-off game only; the other is counted, never shown. The week is closed, so no "Submit".
    const troySpread = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 6 Spread picks.' });
    const troyTotal = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 6 Total picks.' });
    await expect(troySpread.locator('.post-picks li')).toHaveCount(1);
    await expect(troySpread.locator('.post-picks li')).toContainText(['SEA @ DEN']);
    await expect(troySpread.locator('.post-picks')).toContainText('Broncos −3');
    await expect(troySpread.locator('.post-picks-hidden')).toHaveText('1 more game is hidden until kickoff.');
    await expect(troySpread).not.toContainText('2.5');
    await expect(troySpread).not.toContainText('Submit your');
    await expect(troyTotal.locator('.post-picks')).toContainText('44');
    await expect(troyTotal).not.toContainText('47.5');
    await phoneChecks(page);
    await page.screenshot({ path: '.local/previews/old-per-game-feed-390.png', fullPage: true });
    // Nothing withheld reached the browser: Troy's HOU-JAX guesses (Spread 2.5, Total 47.5) are in no reply.
    expect(replies.length).toBeGreaterThan(0);
    for (const body of replies) {
      const read = JSON.parse(body);
      for (const post of read.posts || []) if (post.actorId === ACCOUNTS.troy.id && post.week === 6) expect([post.picks?.['HOU-JAX'], post.hiddenGames]).toEqual([undefined, ['HOU-JAX']]);
    }

    // Picks: line-dependent trends open per game. Thursday's game has kicked off; Sunday's waits for its kickoff, though the deadline passed.
    await page.getByRole('button', { name: /^Picks/ }).click();
    await page.getByRole('button', { name: 'Show trends', exact: true }).click();
    await page.getByRole('button', { name: 'Trends for SEA at DEN', exact: true }).click();
    const seaDen = page.locator('.week-pick').filter({ hasText: 'Seattle Seahawks @ Denver Broncos' });
    await expect(seaDen.getByRole('heading', { name: 'Spread-dependent records' })).toBeVisible();
    await expect(seaDen.getByRole('heading', { name: 'Unlocks after your Spread ballot' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Trends for HOU at JAX', exact: true }).click();
    const houJax = page.locator('.week-pick').filter({ hasText: 'Houston Texans @ Jacksonville Jaguars' });
    await expect(houJax.getByRole('heading', { name: 'Unlocks after your Spread ballot' })).toBeVisible();
    await expect(houJax).toContainText('or once this game kicks off. No line is shown before then.');
    await expect(houJax.getByRole('heading', { name: 'Spread-dependent records' })).toHaveCount(0);
    await phoneChecks(page);

    // History: Troy's Week 6 opens row by row; a withheld row is a lock and the word, never a number.
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('group', { name: 'Player' }).getByRole('button', { name: /^Troy Fixture/ }).click();
    const week6 = page.getByRole('region', { name: 'Week 6 history' });
    const spreadHistory = week6.locator('.history-market').filter({ has: page.getByRole('heading', { name: 'Spread · Troy Fixture' }) });
    await expect(spreadHistory).toContainText('Games marked Hidden open at their kickoff.');
    const cards = spreadHistory.locator('.history-cards article');
    await expect(cards.filter({ hasText: 'SEA' })).toContainText('Broncos −3');
    await expect(cards.filter({ hasText: 'HOU' }).locator('.history-hidden')).toHaveText('Hidden');
    await expect(spreadHistory).not.toContainText('2.5');
    const week5 = page.getByRole('region', { name: 'Week 5 history' });
    await expect(week5.locator('.history-market').first()).toContainText('9 / 10 pts');
    await phoneChecks(page);
    await page.screenshot({ path: '.local/previews/old-per-game-history-390.png', fullPage: true });
    await axe(page, 'history');

    await page.getByRole('button', { name: 'Feed', exact: true }).click();
    await axe(page, 'feed');
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
