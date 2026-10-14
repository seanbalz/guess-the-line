// Shared fixture steps for the per-game gate suites (redesign build plan stage 16): a stored three-book collection for the
// open week, a service-role SQL caller and a full-market send through the real /personal/ballot route. Fixture values only
// (never live odds or real player data); local PGlite only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS } from '../cloud-browser/community-world.mjs';

/** Stores one qualifying three-book collection for the world's open week: `lines` is { spread: { gameId: v }, total: { gameId: v } }. */
export async function storeLines(db, state, lines) {
  const iso = ms => new Date(ms).toISOString(), captured = Date.now() - 1000, { season, week } = state.league;
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), games: state.games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries(['spread', 'total'].map(market => { const line = lines[market][g.id]; return [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 1000),
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }]; })) })) };
  const key = randomUUID();
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)", [key, ACCOUNTS.sean.id, randomUUID(), season, week, signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, signature, payload, payload.fetchedAt]);
  return key;
}

/** Calls a public function as service_role (as gtl-api does), with named arguments; returns its value. */
export const serviceSql = db => (name, args) => db.transaction(async tx => {
  await tx.exec('set local role service_role');
  return (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
});

/** Saves a market through the real /personal/ballot route as the old app does: sent with submit true, a draft with false. */
export async function sendBallot(world, account, mode, picks, submit = true) {
  const { season, week } = world.state.league;
  const workspace = await world.api(account, 'personal');
  assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
  const { revision, weeklyRevision } = workspace.body;
  const sent = await world.api(account, 'personal/ballot', { season, week, mode, picks, submit, revision, weeklyRevision, requestId: randomUUID() });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
}
