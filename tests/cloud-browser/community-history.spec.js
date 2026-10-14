import { test, expect } from '@playwright/test';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { HOSTED } from '../migrations.mjs';

// The Community History tab (Sean's October 12, 2026 rulings) on the real handler, the hosted migrations and PGlite. Luke views; Troy
// has pre-D-17 Week 5 Spread and Total ballots with no saved line. Luke sees Troy's ballots as hidden until he sits out a
// market (D-23). With no line stored anywhere, the revealed Total shows each guess with "No line stored" and stays unscored;
// with a hosted collection and an imported reference line stored before Troy's guesses, each guess is scored against the line
// at the guess, and Sean's practice ballot is listed and never scored (D-08). A ballot whose original submission time was not
// recorded is compared at the submission time it stores, labelled. Below 720px the game rows are cards, not a table, and the
// page never scrolls sideways.
// The old app on the schema players actually have (tests/migrations.mjs).
const MIGRATIONS = HOSTED;

for (const width of [390, 1280]) test(`community history: player buttons, newest week first, hidden until revealed, no line invented at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: MIGRATIONS });
  const { db, errors, state } = world;
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/#history$/);
    const players = page.getByRole('group', { name: 'Player' });
    await expect(players.getByRole('button')).toHaveText(['Luke Fixture · You', 'Sean Fixture', 'Troy Fixture']);
    await expect(players.getByRole('button', { name: 'Luke Fixture · You' })).toHaveAttribute('aria-pressed', 'true');
    const week = page.locator('.history-week').first();
    await expect(week).toContainText('Week 5 · 2026');
    await expect(week.locator('.history-market').nth(0)).toContainText('No spreads ballot yet.');
    await expect(week.locator('.history-market').nth(1)).toContainText('No totals ballot yet.');

    await players.getByRole('button', { name: 'Troy Fixture' }).click();
    await expect(players.getByRole('button', { name: 'Troy Fixture' })).toHaveAttribute('aria-pressed', 'true');
    for (const market of ['Spread', 'Total']) await expect(week).toContainText(`Hidden until you submit your Week 5 ${market} picks or sit out.`);
    await expect(week).toContainText('Submitted Oct 8, 11:00 AM PT');
    await expect(week).not.toContainText('47.5');
    await expect(week).not.toContainText('2.5');

    // Luke sits out Total from another device (D-23); Refresh reveals Troy's Total guesses. A pre-D-17 ballot has no saved line and no
    // snapshot exists for the week, so each guess reads "No line stored" and the ballot stays unscored. Spread stays hidden.
    const satOut = await world.api('luke', 'community/sit-out', { season: state.league.season, week: state.league.week, mode: 'guess_total' });
    expect(satOut.status).toBe(200);
    await page.locator('.history-toolbar').getByRole('button', { name: 'Refresh' }).click();
    const total = week.locator('.history-market').nth(1);
    await expect(total).toContainText('Total · Troy Fixture');
    await expect(total).toContainText('Unscoredno line stored for these guesses');
    await expect(total).toContainText('No line was saved with these guesses');
    const cells = total.locator(width < 720 ? '.history-cards dd.mono' : '.history-table tbody td:nth-child(2) strong');
    await expect(cells).toHaveText(['44', '47.5']);
    await expect(total).toContainText('No line stored');
    await expect(total).not.toContainText('Hidden until');
    await expect(week.locator('.history-market').nth(0)).toContainText('Hidden until you submit your Week 5 Spread picks or sit out.');
    await expect(week.locator('.history-market').nth(0)).not.toContainText('2.5');
    // Below 720px the game rows are cards; above it a table with 13px headers.
    await expect(total.locator('.history-table')).toBeVisible({ visible: width >= 720 });
    await expect(total.locator('.history-cards')).toBeVisible({ visible: width < 720 });
    if (width >= 720) expect(await total.locator('.history-table th[scope=col]').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/community-history-${width}.png`, fullPage: true });

    // Luke's own row records the opt-out as sat out, not zero.
    await players.getByRole('button', { name: 'Luke Fixture · You' }).click();
    await expect(week.locator('.history-market').nth(1)).toContainText('Sat out');
    await expect(week.locator('.history-market').nth(1)).toContainText('Recorded as sat out, not zero.');

    // Persona audit #3: Back returns to the feed.
    await page.goBack();
    await expect(page.locator('.picks-due')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Feed', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});

for (const width of [390, 1280]) test(`community history: the line at each guess with its source and gap, and a practice ballot listed but never scored at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: MIGRATIONS });
  const { db, errors, state } = world;
  try {
    const { season, week } = state.league;
    const [first, second] = state.games;
    const sig = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
    const template = (await db.query('select games from public.gtl_schedule_templates where season=$1 and week=$2 order by created_at desc limit 1', [season, week])).rows[0].games;
    // One hosted 3-book collection captured at 5:00 AM PT on October 8 (books updated a minute earlier), before Troy's 11:00 AM PT guesses.
    const snapshotId = '0ddddddd-0000-4000-8000-000000000001', fetchedAt = '2026-10-08T12:00:00.000Z', observedAt = '2026-10-08T11:59:00.000Z';
    const lines = { spread: [-3.5, 1.5], total: [44.5, 47.5] };
    const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt, games: template.map((g, i) => ({
      gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `ev${i}`, matchStatus: 'matched',
      markets: Object.fromEntries(['spread', 'total'].map(market => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({ provider: 'the-odds-api', providerEventId: `ev${i}`, book, market,
        value: lines[market][i], timeBasis: 'provider_market_last_update', collectedAt: fetchedAt, providerObservedAt: observedAt,
        outcomes: market === 'spread' ? { home: { line: lines[market][i], odds: -110 }, away: { line: -lines[market][i], odds: -110 } } : { over: { line: lines[market][i], odds: -110 }, under: { line: lines[market][i], odds: -110 } } })) }])) })) };
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$1,$3,$3::timestamptz+interval '90 seconds',2,$4,$5,$6)", [snapshotId, ACCOUNTS.sean.id, fetchedAt, season, week, sig]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [snapshotId, season, week, sig, payload, '2026-10-08T12:00:01Z']);
    // One imported eDraft reference line for the first game, page time 6:20 AM PT and captured 6:30 AM PT: observed after the hosted line, so it is the line at Troy's guess there.
    const file = 'data/snapshots/2026-week-05-fixture.json', sha = 'a'.repeat(64);
    const importId = (await db.query("insert into public.gtl_reference_line_imports(season,week,source_file,file_sha256,decision,ruling,approved_by,context_league_id,evidence,payload_sha256,line_count) values($1,$2,$3,$4,'D-99','Fixture ruling for the browser test',$5,'sean-troy-luke','{}',$4,1) returning id",
      [season, week, file, sha, ACCOUNTS.sean.id])).rows[0].id;
    await db.query("insert into public.gtl_reference_lines(import_id,season,week,game_id,market,value,source,source_url,source_file,file_sha256,observed_at,captured_at) values($1,$2,$3,$4,'spread',-2.5,'eDraft consensus','https://edraft.com/nfl/odds/week-5',$5,$6,'2026-10-08T13:20:00Z','2026-10-08T13:30:00Z')",
      [importId, season, week, first.id, file, sha]);
    // Sean's practice Spread ballot, written the way the group-league migration wrote practice rows (before the save guards existed); no eligibility ruling.
    await db.transaction(async tx => {
      await tx.exec('set local session_replication_role = replica');
      await tx.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.sean.id, season, week]);
      await tx.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,origin_practice,provenance) values($1,$2,$3,$4,$5,true,$6)',
        [ACCOUNTS.sean.id, season, week, 'guess_spread', { picks: { [first.id]: -3, [second.id]: 1 }, submittedAt: '2026-10-08T19:00:00Z' }, JSON.stringify([{ leagueId: 'practice-fixture', playerId: 'sean', migration: true }])]);
    });
    for (const mode of ['guess_spread', 'guess_total']) expect((await world.api('luke', 'community/sit-out', { season, week, mode })).status).toBe(200);

    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const players = page.getByRole('group', { name: 'Player' });
    await players.getByRole('button', { name: 'Troy Fixture' }).click();
    const week5 = page.locator('.history-week').first();
    const spread = week5.locator('.history-market').nth(0), total = week5.locator('.history-market').nth(1);
    await expect(spread).toContainText('No line was saved with these guesses; each is scored against the line at the guess');
    // Troy guessed −3 and 2.5 at 11:00 AM PT: the first game against the imported −2.5 (observed 4h 40m before; 9 points), the second against
    // the hosted 1.5 (8 points). His Total guesses 44 and 47.5 meet the hosted 44.5 and 47.5 (9 + 10).
    await expect(spread).toContainText('Line at guess');
    await expect(spread).toContainText('eDraft consensus · 2026-week-05-fixture.json');
    await expect(spread).toContainText('Observed Oct 8, 6:20 AM PT · 4h 40m before the guess');
    await expect(spread).toContainText('The Odds API · 3-book median');
    await expect(spread).toContainText('Observed Oct 8, 4:59 AM PT · 6h 1m before the guess');
    await expect(spread).toContainText('17 / 20 pts');
    await expect(total).toContainText('19 / 20 pts');
    const points = spread.locator(width < 720 ? '.history-cards dd' : '.history-table tbody td:nth-child(5)');
    await expect(points.filter({ hasText: 'of 10' })).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await players.getByRole('button', { name: 'Sean Fixture' }).click();
    const practice = week5.locator('.history-market').nth(0);
    await expect(practice).toContainText('Practice ballot · listed, never scored');
    await expect(practice).toContainText('each is shown with the line at the guess');
    await expect(practice).toContainText('Practicelisted, not scored');
    await expect(practice).toContainText('Not scored · practice');
    await expect(practice).toContainText('Line at guess');
    await expect(practice).not.toContainText('of 10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/community-history-line-at-guess-${width}.png`, fullPage: true });

    // A ballot whose origin records that its original submission time is unavailable (Sean's seeded Week 5 spread on the hosted
    // project): compared at the submission time it stores, labelled as such, and scored on the same lines (17 / 20).
    await db.transaction(async tx => {
      await tx.exec('set local session_replication_role = replica');
      await tx.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('origin','Imported complete ballot; original submission time unavailable') where user_id=$1 and season=$2 and week=$3 and mode='guess_spread'",
        [ACCOUNTS.troy.id, season, week]);
    });
    await page.locator('.history-toolbar').getByRole('button', { name: 'Refresh' }).click();
    await players.getByRole('button', { name: 'Troy Fixture' }).click();
    const stored = week5.locator('.history-market').nth(0);
    await expect(stored).toContainText('Submitted · original time not recorded (stored as Oct 8, 11:00 AM PT)');
    await expect(stored).toContainText('the original submission time was not recorded; each is scored against the line at the stored submission time');
    await expect(stored).toContainText('Original guess time not recorded · compared at the stored submission time');
    await expect(stored).toContainText('Observed Oct 8, 6:20 AM PT · 4h 40m before the stored submission time');
    await expect(stored).toContainText('17 / 20 pts');
    await expect(week5.locator('.history-market').nth(1)).not.toContainText('Original guess time not recorded');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
