import { test, expect } from '@playwright/test';
import { NFLVERSE_SCHEDULE_URL } from '../../shared/nfl-schedule.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn, switchAccount } from './community-world.mjs';

// D-21/D-24 commissioner publish path: Community → Preview / publish early (fallback) →
// Review schedule → Publish Week 6, on the real handler, migrations and PGlite. The public
// schedule is a fixture with the 2026 Week 6 slate (nflverse games.csv columns; LA is the
// Rams): 14 games, byes CIN/DET/MIA/MIN, TNF Thu 2026-10-15 8:15 PM ET SEA @ DEN.
// Deterministic clock: Fri Oct 9 11:00 AM PT, so Week 5 (TNF Oct 8) is closed and Week 6
// opens Monday Oct 12 12:00 AM PT. Database triggers keep the real clock; nothing here saves a ballot.
const CLOCK = Date.parse('2026-10-09T18:00:00Z');
const WEEK6 = [
  ['2026-10-15', '20:15', 'SEA', 'DEN'], ['2026-10-18', '09:30', 'HOU', 'JAX', 'Neutral'],
  ['2026-10-18', '13:00', 'CHI', 'ATL'], ['2026-10-18', '13:00', 'BAL', 'CLE'], ['2026-10-18', '13:00', 'TEN', 'IND'], ['2026-10-18', '13:00', 'NO', 'NYG'],
  ['2026-10-18', '13:00', 'NYJ', 'NE'], ['2026-10-18', '13:00', 'CAR', 'PHI'], ['2026-10-18', '13:00', 'PIT', 'TB'],
  ['2026-10-18', '16:05', 'ARI', 'LA'], ['2026-10-18', '16:25', 'BUF', 'LV'], ['2026-10-18', '16:25', 'LAC', 'KC'],
  ['2026-10-18', '20:20', 'DAL', 'GB'], ['2026-10-19', '20:15', 'WAS', 'SF'],
];
const scheduleCsv = (rows = WEEK6) => ['game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location',
  ...rows.map(([day, time, away, home, location = 'Home']) => `2026_06_${away}_${home},2026,REG,6,${day},,${time},${away},,${home},,${location}`),
  '2026_07_DEN_NYJ,2026,REG,7,2026-10-25,,13:00,DEN,,NYJ,,Home', '2026_05_TB_DAL,2026,REG,5,2026-10-08,,20:15,TB,,DAL,,Home'].join('\n');
// Kickoff order, then game id: TNF, the London game, the seven 10:00 AM PT games, 1:05, 1:25 ×2, SNF, MNF.
const PREVIEW = ['Seattle Seahawks @ Denver Broncos', 'Houston Texans @ Jacksonville Jaguars (neutral)', 'Baltimore Ravens @ Cleveland Browns', 'Carolina Panthers @ Philadelphia Eagles',
  'Chicago Bears @ Atlanta Falcons', 'New Orleans Saints @ New York Giants', 'New York Jets @ New England Patriots', 'Pittsburgh Steelers @ Tampa Bay Buccaneers',
  'Tennessee Titans @ Indianapolis Colts', 'Arizona Cardinals @ Los Angeles Rams', 'Buffalo Bills @ Las Vegas Raiders', 'Los Angeles Chargers @ Kansas City Chiefs',
  'Dallas Cowboys @ Green Bay Packers', 'Washington Commanders @ San Francisco 49ers'];
const BYES = ['CIN', 'DET', 'MIA', 'MIN'];

for (const width of [390, 1280]) test(`commissioner publishes Week 6 from the public schedule; it opens Mon 12:00 AM PT, republishing is a no-op, a changed slate fails closed and members get no controls at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { deadline: '2026-10-09T00:15:00Z', troyBallots: false, clock: () => CLOCK });
  const { db, errors } = world;
  world.schedule = () => scheduleCsv();
  const slates = async () => (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=6')).rows.map(r => r.signature);
  const published = async () => (await db.query("select count(*)::int n from public.gtl_feed_posts where kind='week_published'")).rows[0].n;
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'sean');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('.picks-due')).toContainText('Week 5 picks closed');
    await expect(page.locator('.picks-due')).toContainText('Spread 0/2 · Total 0/2 · Deadline passed · Week 6 opens Mon, Oct 12, 12:00 AM PT');
    await expect(page.getByRole('button', { name: 'Picks (closed)', exact: true })).toBeVisible();
    const panel = page.getByRole('region', { name: 'Publish week' });
    await expect(panel.getByRole('heading', { name: 'Preview / publish early (fallback)' })).toBeVisible();
    await expect(panel).toContainText('Commissioner only. Weeks open automatically Monday 12:00 AM PT');
    await expect(panel.locator('.scheduler-status')).toHaveText('Automatic opening: not configured · Mondays 12:00 AM PT · No runs yet');
    await expect(panel.getByLabel('Season')).toHaveValue('2026');
    await expect(panel.getByLabel('Week')).toHaveValue('6');

    // Review schedule: the preview lists the 14 games in kickoff order with the TNF deadline and writes nothing.
    await panel.getByRole('button', { name: 'Review schedule' }).click();
    const rows = panel.locator('.publish-preview li');
    await expect(rows).toHaveCount(14);
    await expect(rows.locator('> span:first-child')).toHaveText(PREVIEW);
    await expect(rows.first()).toContainText('Oct 15, 5:15 PM PT');
    await expect(rows.nth(1)).toContainText('Oct 18, 6:30 AM PT');
    await expect(rows.nth(2)).toContainText('Oct 18, 10:00 AM PT');
    await expect(rows.last()).toContainText('Oct 19, 5:15 PM PT');
    await expect(panel).toContainText('Picks lock Oct 15, 5:15 PM PT · 14 games');
    for (const bye of ['Bengals', 'Lions', 'Dolphins', 'Vikings']) await expect(panel).not.toContainText(bye);
    expect(await slates()).toEqual([]);
    expect(await published()).toBe(0);

    // Publish Week 6: one slate, one template, one feed post, one audit row.
    await panel.getByRole('button', { name: 'Publish Week 6' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Week 6 is open.' })).toBeVisible();
    const post = page.locator('.feed-post').filter({ hasText: 'opened Week 6' });
    await expect(post).toHaveCount(1);
    await expect(post).toContainText('Sean Fixture opened Week 6: 14 games, picks due Oct 15, 5:15 PM PT.');
    // D-24 status strip: not open until Monday 12:00 AM PT, no Make picks button, nothing due on the tab.
    const strip = page.locator('.picks-due');
    await expect(strip).toHaveClass(/not_open/);
    await expect(strip).toContainText('Week 6 opens Mon, Oct 12, 12:00 AM PT');
    await expect(strip).toContainText('In 3 days · Picks due Thu, Oct 15, 5:15 PM PT');
    await expect(strip).not.toContainText('0/14');
    await expect(strip.getByRole('button', { name: 'Make picks' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Picks', exact: true })).toBeVisible();
    await expect(panel.locator('.publish-preview')).toHaveCount(0);
    const [slate] = await slates();
    expect(slate.deadline).toBe(Date.parse('2026-10-16T00:15:00Z') / 1000);
    expect(slate.games).toHaveLength(14);
    const teams = slate.games.flatMap(g => [g.away, g.home]);
    expect(new Set(teams).size).toBe(28);
    for (const bye of BYES) expect(teams).not.toContain(bye);
    expect(slate.games.find(g => g.id === 'SEA-DEN')).toEqual({ id: 'SEA-DEN', away: 'SEA', home: 'DEN', kickoff: slate.deadline });
    const template = (await db.query("select games,deadline,schedule_source from public.gtl_schedule_templates where id='nfl-2026-week-06'")).rows[0];
    expect(template.games.map(g => g.matchup)).toEqual(PREVIEW.map(m => m.replace(' (neutral)', '')));
    expect(template.games[1]).toMatchObject({ id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX', kickoff: '2026-10-18T13:30:00.000Z' });
    expect(new Date(template.deadline).toISOString()).toBe('2026-10-16T00:15:00.000Z');
    expect(template.schedule_source).toBe(NFLVERSE_SCHEDULE_URL);
    expect(await published()).toBe(1);
    expect((await db.query("select event from public.gtl_access_audit where actor_id=$1 and event like 'publish_week:%'", [ACCOUNTS.sean.id])).rows.map(r => r.event)).toEqual(['publish_week:2026:6']);

    // Republishing the identical slate is a no-op (published: false).
    await panel.getByRole('button', { name: 'Review schedule' }).click();
    await expect(rows).toHaveCount(14);
    await panel.getByRole('button', { name: 'Publish Week 6' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Week 6 was already open.' })).toBeVisible();
    expect((await slates()).length).toBe(1);
    expect(await published()).toBe(1);

    // A changed public schedule (TNF moved five minutes) fails closed: error shown, nothing changed.
    world.schedule = () => scheduleCsv(WEEK6.map(row => (row[2] === 'SEA' ? ['2026-10-15', '20:20', 'SEA', 'DEN'] : row)));
    await panel.getByRole('button', { name: 'Review schedule' }).click();
    await expect(rows.first()).toContainText('Oct 15, 5:20 PM PT');
    await panel.getByRole('button', { name: 'Publish Week 6' }).click();
    await expect(panel.getByRole('alert')).toHaveText('A different schedule is already published for that week. Nothing was changed.');
    expect(await slates()).toEqual([slate]);
    expect(await published()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/publish-week-${width}.png`, fullPage: true });

    // A member sees the open week and the post but no publish controls; the routes refuse the member.
    await switchAccount(page, 'troy');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('.picks-due')).toContainText('Week 6 opens Mon, Oct 12, 12:00 AM PT');
    await expect(post).toBeVisible();
    await expect(page.getByText('Preview / publish early (fallback)')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Publish week' })).toHaveCount(0);
    for (const [route, body] of [['community/publish-preview', { season: 2026, week: 6 }], ['community/publish', { season: 2026, week: 6 }], ['community/week-open', {}]]) {
      const refused = await world.api('troy', route, body);
      expect([route, refused.status, refused.body.error]).toEqual([route, 403, 'Only the commissioner can change community membership.']);
    }
    expect((await slates()).length).toBe(1);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
