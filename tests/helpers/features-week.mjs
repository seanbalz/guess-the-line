// A finished fixture Week 4 for the badges, awards and streaks suites (redesign stages 69 and 71): the SQL suite
// (tests/game-features-sql.test.mjs) and the browser spec (tests/cloud-browser/next-features.spec.js) share it. Every account,
// game, line, guess and bet is made up; local PGlite only.
//
// It is written straight into the tables (session_replication_role = replica bypasses the ballot guards, which keep the real
// clock and refuse a lock-in after kickoff), with kickoffs relative to now: SEA @ DEN 26 hours ago, KC @ LV 2 hours ago. The
// finals go through the real settlement (DEN 20 SEA 24, LV 24 KC 20). What it earns once the features job runs:
// - Luke: Bullseye x3 (both spreads, the SEA @ DEN total), Double Bullseye (SEA @ DEN), Dialed In (Spread 20 of 20, Total 16 of
//   20) and Dog Day (SEA +8.5, 3U, won outright); Spread, Total, Bets and Best guess awards; a 1-week Pick streak.
// - Troy: Called the Move (KC @ LV), Sharp x2 (DEN -8.5 and Over 44); Sharpest bet, Saw it coming, Worst beat (lost by 12.5).
// - Sean: sat out Spread (the Pick streak breaks) and posted week_published, so the recap is posted as him.
import { randomUUID } from 'node:crypto';
import { ACCOUNTS } from '../cloud-browser/community-world.mjs';
import { serviceSql } from './guess-week.mjs';

const LUKE = ACCOUNTS.luke.id, TROY = ACCOUNTS.troy.id, SEAN = ACCOUNTS.sean.id, HOUR = 3_600_000;
const iso = ms => new Date(ms).toISOString();
const sec = ms => Math.floor(ms / 1000) * 1000;

/** M-13 (stage 48, the feed lane): the feed kinds M-25's posts need. A suite that checks the order mistake leaves it out. */
export const M13 = '20261026130000_gtl_feed_kinds.sql';

/** Seeds the finished Week 4 into a community world (ALL migrations). Returns `{ now, k1, k2, settle(denHome, seaAway) }`. */
export async function seedFinishedWeek(world, { now = Date.now() } = {}) {
  const { db } = world, call = serviceSql(db);
  const k1 = sec(now - 26 * HOUR), k2 = sec(now - 2 * HOUR);
  const games = [
    { id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos', kickoff: iso(k1) },
    { id: 'KC-LV', away: 'Kansas City Chiefs', home: 'Las Vegas Raiders', awayCode: 'KC', homeCode: 'LV', matchup: 'Kansas City Chiefs @ Las Vegas Raiders', kickoff: iso(k2) },
  ];
  const signature = { season: 2026, week: 4, deadline: k1 / 1000, games: games.map(g => ({ id: g.id, away: g.awayCode, home: g.homeCode, kickoff: Date.parse(g.kickoff) / 1000 })) };
  await db.query("insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values('nfl-2026-week-04',2026,4,$1,$2,'fixture')", [JSON.stringify(games), iso(k1)]);
  await db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,4,$1)', [signature]);
  await db.query("insert into public.gtl_feed_posts(actor_id,kind,season,week,dedupe_key,created_at) values($1,'week_published',2026,4,'week_published:fixture:4',$2)", [SEAN, iso(k1 - 72 * HOUR)]);
  // Kickoff lines (home spread, total): SEA @ DEN −9.5 / 41.5, KC @ LV −3 / 45.5, from three books captured an hour before each kickoff.
  const snapshot = async (at, lines) => {
    const key = randomUUID(), payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(at), games: games.map((g, i) => ({
      gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
      markets: Object.fromEntries(['spread', 'total'].map(market => { const line = lines[g.id][market]; return [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
        provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: iso(at), providerObservedAt: iso(at - 1000),
        outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } } })) }]; })) })) };
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,$4,$4,2,2026,4,$5)", [key, SEAN, randomUUID(), iso(at), signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,4,$2,$3,$4)', [key, signature, payload, iso(at)]);
  };
  const closing = { 'SEA-DEN': { spread: -9.5, total: 41.5 }, 'KC-LV': { spread: -3, total: 45.5 } };
  await snapshot(k1 - HOUR, closing);
  await snapshot(k2 - HOUR, closing);
  // Locked-in Week 4 guesses with their saved lines (the line at the guess), as M-07 stores them.
  await db.exec('set session_replication_role = replica');
  const ballot = async (user, mode, rows) => {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,4) on conflict do nothing', [user]);
    const locked = iso(k1 - 30 * HOUR);
    await db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,4,$2,$3)', [user, mode, {
      picks: Object.fromEntries(rows.map(([g, guess]) => [g, guess])), submittedAt: locked, guessRule: 'per-game-v1', closedAtKickoff: [],
      lockedAt: Object.fromEntries(rows.map(([g]) => [g, locked])), lockedLate: {}, scoringPolicy: 'submission-time',
      scoringReferences: Object.fromEntries(rows.map(([g, , ref]) => [g, { status: 'available', value: ref, basis: 'line-at-save', savedAt: locked }])) }]);
  };
  await ballot(LUKE, 'guess_spread', [['SEA-DEN', -8.5, -8.5], ['KC-LV', -1.5, -1.5]]); // two exact guesses: 20 of 20
  await ballot(LUKE, 'guess_total', [['SEA-DEN', 44.5, 44.5], ['KC-LV', 47.5, 45.5]]); // 10 + 6 = 16 of 20
  await ballot(TROY, 'guess_spread', [['SEA-DEN', -6.5, -8.5], ['KC-LV', -3.5, -1.5]]); // 6 + 6; KC @ LV moved −1.5 → −3, toward −3.5
  await db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode) values($1,2026,4,'guess_spread')", [SEAN]);
  await db.exec('set session_replication_role = origin');
  // Virtual Units bets, then the finals through the real settlement.
  const pick = (user, game, market, side, line, units) => db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,2026,4,$2,$3,$4)',
    [user, game, market, { gameId: game, market, side, line, odds: -110, units, source: 'DraftKings', quotedAt: iso(k1 - 40 * HOUR), selectedAt: iso(k1 - 40 * HOUR), riskDollars: units * 100 }]);
  for (const user of [LUKE, TROY]) await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,4) on conflict do nothing', [user]);
  await pick(LUKE, 'SEA-DEN', 'spread', 'away', 8.5, 3); // SEA +8.5 wins and SEA won outright: Dog Day
  await pick(TROY, 'SEA-DEN', 'spread', 'home', -8.5, 1); // loses by 12.5, and 1 better than the −9.5 kickoff line: Sharp
  await pick(TROY, 'KC-LV', 'total', 'over', 44, 1); // a push, and 1.5 better than the 45.5 kickoff total: Sharp
  const settle = (denHome, seaAway) => call('gtl_settle_virtual_units', { p_season: 2026, p_week: 4, p_results: { source: 'Fixture finals', games: [
    { gameId: 'SEA-DEN', status: 'final', home: denHome, away: seaAway }, { gameId: 'KC-LV', status: 'final', home: 24, away: 20 }] } });
  await settle(20, 24);
  return { now, k1, k2, settle };
}
