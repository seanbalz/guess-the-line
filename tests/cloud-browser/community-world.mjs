import { createTrendsService } from '../../cloud/trends.mjs';
import { createFantasyService } from '../../cloud/fantasy.mjs';
import trendsSeed from '../../cloud/trends-seed.mjs';
import { parseCsvRows } from '../../shared/trends.mjs';
import { appCode, easternToUtc } from '../../shared/nfl-schedule.mjs';
// Shared community world for the D-21/D-23/D-24 browser specs: the real cloud handler and
// the real migrations on local PGlite (the community.spec.js pattern) with three fixture
// accounts. Luke views, Troy plays and Sean is the sean-troy-luke commissioner, so the
// community admin. The browser signs in through the mocked password form; the handler is
// also callable directly as any account for cross-user checks (removal, publish, 403s).
// createCommunityWorld builds the same world without a browser (node tests, the leak scan).
import { randomUUID } from 'node:crypto';
import { seed } from '../../server/store.mjs';
import { HOSTED, PRELUDE, migrationSql } from '../migrations.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { providerCommunityError } from '../../cloud/community.mjs';
import { providerOfficialsError } from '../../cloud/officials.mjs';
import { providerWindError } from '../../cloud/wind.mjs';
import { providerWeeklyError } from '../../cloud/weekly.mjs';
import { providerLinesError } from '../../cloud/lines.mjs';
import { providerVirtualError } from '../../cloud/virtual-units.mjs';
import { providerLeagueError } from '../../cloud/league.mjs';
import { providerFeedError } from '../../cloud/feed.mjs';
import { providerMeError } from '../../cloud/me.mjs';
import { providerBetsError } from '../../cloud/bets.mjs';
import { providerPointsError } from '../../cloud/points.mjs';
import { providerFeaturesError } from '../../cloud/features.mjs';
import { createOptionalRpc } from '../../cloud/optional-rpc.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { openDeadline } from './fixture-deadline.mjs';
import { shiftBrowserClock } from './test-clock.mjs';

let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip in each spec. */ }
export const pgliteAvailable = !!PGlite;
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const SUPABASE = 'https://gtl-frontend-check.supabase.co';
// The old-app specs run on the schema players actually have: HOSTED from tests/migrations.mjs. A new spec passes ALL.
export const MIGRATIONS = HOSTED;
// D-24: an open fixture week must be the current Pacific week (fixture-deadline.mjs: 11:59 PM PT today, or tomorrow late at night).
export { openDeadline } from './fixture-deadline.mjs';
export const ACCOUNTS = {
  luke: { id: id(1), email: 'luke@example.test', name: 'Luke Fixture', player: 'luke', role: 'player' },
  troy: { id: id(2), email: 'troy@example.test', name: 'Troy Fixture', player: 'troy', role: 'player' },
  sean: { id: id(3), email: 'sean@example.test', name: 'Sean Fixture', player: 'sean', role: 'commissioner' },
};

/**
 * Builds the database, handler and network mocks for one spec. The three accounts hold the
 * sean-troy-luke roster seats (Sean's commissioner seat is what makes him the community admin).
 * groupScreens: let the group game routes read membership and weekly state; community routes never need either.
 * troyBallots: Troy's pre-D-17 submitted Week 5 Spread and Total ballots (picks hidden from others until they submit or sit out).
 * clock: the handler clock (community reads, picks-due and sit-outs); database triggers keep the real clock.
 * prepare: optional (state) => void that edits the seeded league state (week, games) before it is stored and the slate is derived.
 * wind: optional Open-Meteo provider ({ forecast }) for the D-34 kickoff wind forecast; null reads stored forecasts only and never fetches.
 * migrations: the migration files to apply in order (default MIGRATIONS, the hosted list; a spec that needs a file the hosted
 * project does not have yet passes ALL from tests/migrations.mjs).
 * pushPublicKey: the gtl-api VAPID public key (redesign stage 2 push guard); none by default, so /community/read says pushConfigured: false.
 * virtualUnits: serve /virtual-units and /virtual-pick from the same database (gtl_read_virtual_units, gtl_save_virtual_units_pick,
 * gtl_read_market_snapshot and the stage 20 line gate: the newest published week and gtl_week_revealed). Off by default, so no other
 * spec's /state gains the market snapshot.
 * optionalRpc: answer optional RPCs (cloud/optional-rpc.mjs) from the database, with PostgREST's PGRST202 for a function the applied
 * migrations do not have, as the hosted project does. Off by default: every reply then carries today's rules.
 */
export async function communityWorld(page, baseURL, options = {}) {
  const world = await createCommunityWorld(options);
  const { errors, handler, sessions, users } = world;
  page.on('pageerror', error => errors.push(error.message));
  await shiftBrowserClock(page);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
    if (isWebfont(url)) return route.abort(); if (url.origin !== SUPABASE) { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
    if (url.pathname === '/auth/v1/token') { const session = sessions[req.postDataJSON()?.email]; return session ? reply(200, session) : reply(400, { error: 'invalid_grant', error_description: 'Unknown fixture account.' }); }
    if (url.pathname === '/auth/v1/user') { const user = users.get((req.headers().authorization || '').replace(/^Bearer /i, '')); return user ? reply(200, user) : reply(401, { message: 'Invalid token.' }); }
    if (url.pathname === '/auth/v1/logout') return reply(200, {});
    const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return world;
}

/** The same world without a browser: the database, the real handler and world.api (options as communityWorld). */
/**
 * Fixture games kick off "tonight" (openDeadline), but trends are real 2026 history: the weekday and rest-day situations
 * come from each game's kickoff, so the cards drifted with the date the suite ran (they changed after October 24, 2026).
 * The trends service gets each fixture game's real kickoff from the committed season file instead; every other route
 * keeps the fixture kickoff, and the reply carries the fixture kickoff back.
 */
function realKickoffTrends(service) {
  const real = new Map(parseCsvRows(trendsSeed.seasonCsv).rows.map(r => [`${r.week}:${appCode(r.away_team)}-${appCode(r.home_team)}`, easternToUtc(r.gameday, r.gametime)]));
  return { ...service, async week(published) {
    const fixture = new Map(published.games.map(g => [g.id, g.kickoff]));
    const result = await service.week({ ...published, games: published.games.map(g => ({ ...g, kickoff: real.get(`${published.week}:${g.id}`) ?? g.kickoff })) });
    return { ...result, games: result.games.map(g => ({ ...g, kickoff: fixture.get(g.id) ?? g.kickoff })) };
  } };
}

export async function createCommunityWorld({ deadline = openDeadline(), games = 2, groupScreens = false, troyBallots = true, clock = Date.now, prepare = null, wind = null, migrations = MIGRATIONS, pushPublicKey, virtualUnits = false, optionalRpc = false, research, trendsReadSeason = async () => trendsSeed.seasonCsv, fantasyFetch = null } = {}) {
  const db = new PGlite(), errors = [], accounts = Object.values(ACCOUNTS), troy = ACCOUNTS.troy;
  await db.exec(PRELUDE);
  await db.exec(migrationSql(migrations[0]));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, games);
  state.league.deadline = deadline; state.games.forEach((game, i) => { game.kickoff = new Date(Date.parse(deadline) + i * 3_600_000).toISOString(); });
  prepare?.(state);
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
  await db.query(`insert into auth.users values ${accounts.map((_, i) => `($${i + 1})`).join(',')}`, accounts.map(a => a.id));
  for (const a of accounts) await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke',$2,$3)", [a.id, a.player, a.role]);
  const { season, week } = state.league;
  const troyPicks = { guess_spread: Object.fromEntries(state.games.map((g, i) => [g.id, [-3, 2.5][i % 2]])), guess_total: Object.fromEntries(state.games.map((g, i) => [g.id, [44, 47.5][i % 2]])) };
  for (const file of migrations.slice(1)) {
    await db.exec(migrationSql(file));
    if (file === '20261008182836_gtl_canonical_weekly_entries.sql' && troyBallots) {
      await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3)', [troy.id, season, week]);
      for (const mode of ['guess_spread', 'guess_total']) {
        await db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)', [troy.id, season, week, mode, { picks: troyPicks[mode], submittedAt: '2026-10-08T18:00:00Z' }]);
      }
    }
  }
  for (const a of accounts) await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [a.id, a.name]);
  if (troyBallots) for (const mode of ['guess_spread', 'guess_total']) {
    await db.query("insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,dedupe_key,created_at) values($1,'ballot_submitted',$2,$3,$4,$5,'2026-10-08T18:00:00Z')",
      [troy.id, season, week, mode, `ballot:${troy.id}:${season}:${week}:${mode}`]);
  }
  const rpc = mapper => async (name, args) => {
    try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
    catch (error) { throw mapper(error.message); }
  };
  const weeklyRpc = rpc(providerWeeklyError), personalRpc = rpc(providerPersonalError);
  const virtualRpc = rpc(providerVirtualError), rawRpc = rpc(message => new Error(message));
  // PostgREST answers a call to a function it cannot find with 404 and PGRST202; any other refusal carries no payload here.
  const optionalPost = async (name, args) => {
    try { return Response.json(await rawRpc(name, args)); }
    catch (error) { return /^function public\.\w+\(.*\) does not exist$/.test(error.message) ? Response.json({ code: 'PGRST202' }, { status: 404 }) : Response.json({ message: 'failed' }, { status: 400 }); }
  };
  const sessions = {}, users = new Map();
  for (const a of accounts) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: a.id, aud: 'authenticated', exp: expires })).toString('base64url')}.${a.player}`;
    const user = { id: a.id, aud: 'authenticated', role: 'authenticated', email: a.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    sessions[a.email] = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    users.set(token, user);
  }
  const world = { db, state, errors, troyPicks, schedule: null, sessions, users };
  const handler = world.handler = createCloudHandler({
    authenticate: async value => (users.has(value) ? { ...users.get(value), emailConfirmed: true } : null), clock, pushPublicKey,
    social: { rpc: rpc(providerSocialError) }, personal: { rpc: personalRpc }, lobby: { rpc: rpc(providerLobbyError) },
    // The public schedule is a spec-owned fixture; the real adapter fetches nflverse. Never a live download here.
    community: { rpc: rpc(providerCommunityError), schedule: async () => { if (typeof world.schedule !== 'function') throw new Error('No schedule fixture.'); return world.schedule(); } },
    // Game referees for situational trends (the commissioner check and both RPCs run on the same PGlite database).
    officials: { rpc: rpc(providerOfficialsError) },
    // D-34 kickoff wind: the three wind RPCs on the same database; the provider is spec-owned (never a live Open-Meteo request).
    wind: { rpc: rpc(providerWindError), provider: wind },
    // Redesign stage 23 (M-06): the gated lines readers. On a schema without M-06 (HOSTED today) their RPCs are missing,
    // so /lines/* answer the generic 503 and every other route is unchanged.
    lines: { rpc: rpc(providerLinesError), ...(research ? { research } : {}) },
    trends: realKickoffTrends(createTrendsService({ rpc: rpc(providerLinesError), readSeason: trendsReadSeason, clock, seed: trendsSeed })),
    fantasy: fantasyFetch ? createFantasyService({ fetchImpl: fantasyFetch, clock }) : undefined,
    league: { rpc: rpc(providerLeagueError) }, me: { rpc: rpc(providerMeError) },
    // The league feed (redesign stages 61 to 65): on a schema without its migration (HOSTED today) a function is missing and
    // PostgREST's PGRST202 reads as GTL_FEATURE_OFF (503), as the production adapter does.
    feed: { rpc: rpc(message => providerFeedError(/^function public\.\w+\(.*\) does not exist$/.test(message) ? 'GTL_FEATURE_OFF' : message)) },
    // Guess the Points (D-56): on a schema without P-01 (HOSTED today) its functions are missing and PostgREST's PGRST202
    // reads as GTL_FEATURE_OFF, so /points/* answer 404 "coming soon", as the production adapter does.
    points: { rpc: rpc(message => providerPointsError(/^function public\.\w+\(.*\) does not exist$/.test(message) ? 'GTL_FEATURE_OFF' : message)) },
    // Streaks, badges and awards (redesign stage 69, M-25): on a schema without M-25 its functions are missing, and the
    // /league/features routes answer 404 "coming soon", as the production adapter does.
    features: { rpc: rpc(message => providerFeaturesError(/^function public\.\w+\(.*\) does not exist$/.test(message) ? 'GTL_FEATURE_OFF' : message)) },
    // Recommendations use the published account week, even when every private
    // group remains on an older slate. These are the production adapter's exact
    // stored-row filters, executed locally; never an odds provider request.
    bets: { rpc: rpc(providerBetsError), recommendationState: async ({ userId, season, week, signature, now }) => {
      const snapshots = (await db.query('select id,created_at,payload from public.gtl_market_snapshots where season=$1 and week=$2 and slate_signature=$3 and created_at<=$4 order by created_at desc,id desc limit 20', [season, week, signature, new Date(now).toISOString()])).rows;
      const picks = (await db.query('select game_id,market,selection,status,result,created_at,updated_at from public.gtl_virtual_units_picks where user_id=$1 and season=$2 and week=$3 order by game_id,market', [userId, season, week])).rows;
      const settlements = (await db.query('select game_id,status,home,away,version,settled_at,observed_at,source,source_url from public.gtl_virtual_units_settlements where season=$1 and week=$2 order by game_id,version desc', [season, week])).rows;
      const iso = value => value instanceof Date ? value.toISOString() : value;
      const history = snapshots.map(row => ({ id: row.id, createdAt: iso(row.created_at), payload: row.payload }));
      return { snapshot: history.length ? { ...history[0], history } : null,
        picks: picks.map(row => ({ ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) })),
        settlements: settlements.map(row => ({ ...row, settled_at: iso(row.settled_at), observed_at: iso(row.observed_at) })) };
    } },
    // D-17: this fixture has no odds provider; the preflight reports eligible cached references (no spec here submits).
    odds: { rpc: (fn, args) => (fn === 'gtl_preflight_submission' ? Promise.resolve({ requiresReferences: false, ready: true }) : personalRpc(fn, args)),
      ...(virtualUnits ? { marketSnapshot: (userId, leagueId) => rawRpc('gtl_read_market_snapshot', { p_user: userId, p_league: leagueId }) } : {}) },
    ...(virtualUnits ? { virtual: {
      read: (userId, leagueId) => virtualRpc('gtl_read_virtual_units', { p_user: userId, p_league: leagueId }),
      save: (userId, leagueId, revision, body) => virtualRpc('gtl_save_virtual_units_pick', { p_user: userId, p_league: leagueId, p_revision: revision, p_body: body }),
      publishedWeek: async () => (await db.query('select season,week from public.gtl_weekly_slates order by season desc,week desc limit 1')).rows[0] || null,
      weekRevealed: async (userId, season, week, mode, now) => (await rawRpc('gtl_week_revealed', { p_user: userId, p_season: season, p_week: week, p_mode: mode, p_now: now })) === true,
    } } : {}),
    ...(optionalRpc ? { optionalRpc: createOptionalRpc(optionalPost) } : {}),
    storage: { async membership(userId, leagueId) {
      if (!groupScreens) throw new Error('Community routes must not require membership.');
      return (await db.query('select player_id,active,role from public.gtl_memberships where user_id=$1 and league_id=$2 and active limit 1', [userId, leagueId])).rows[0] || null;
    } },
    weekly: {
      load: (userId, leagueId) => weeklyRpc('gtl_read_weekly_state', { p_user: userId, p_league: leagueId }),
      saveBallot: (userId, leagueId, mode, revision, picks, submit) => weeklyRpc('gtl_save_weekly_ballot', { p_user: userId, p_league: leagueId, p_mode: mode, p_revision: revision, p_picks: picks, p_submit: submit }),
      saveSelection: (userId, leagueId, revision, selection) => weeklyRpc('gtl_save_weekly_selection', { p_user: userId, p_league: leagueId, p_revision: revision, p_selection: selection }),
    },
  });
  /** Calls the handler directly as one account, as that person would from another device. Returns status and JSON, never throws on 4xx. */
  world.api = async (account, route, body) => {
    const headers = { authorization: `Bearer ${sessions[ACCOUNTS[account].email].access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) };
    const response = await handler(new Request(`${SUPABASE}/functions/v1/gtl-api/${route}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  };
  return world;
}

/**
 * Stores one succeeded three-book collection for the world's open week (fixture books and lines, never live odds), so
 * /virtual-units has named-book quotes. lines: { spread: { gameId: line }, total: { gameId: line } }, home spread and total.
 * Returns the quotes' observation time, which a /virtual-pick body sends back as quotedAt.
 */
export async function storeBookLines(world, lines, { capturedAt = Date.now() - 60_000 } = {}) {
  const { db, state } = world, { season, week } = state.league;
  const at = new Date(capturedAt).toISOString(), observed = new Date(capturedAt - 1000).toISOString();
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: at, games: state.games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries(['spread', 'total'].map(market => { const line = lines[market][g.id]; return [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: at, providerObservedAt: observed,
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }]; })) })) };
  const key = randomUUID();
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)", [key, ACCOUNTS.sean.id, randomUUID(), season, week, signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, signature, payload, at]);
  return observed;
}

/** Sends a full market for the world's open week through the real /personal/ballot route, as the old app's Picks do. */
export async function sendBallot(world, account, mode, picks) {
  const { season, week } = world.state.league;
  const workspace = await world.api(account, 'personal');
  if (workspace.status !== 200) throw new Error(`personal: ${JSON.stringify(workspace.body)}`);
  const sent = await world.api(account, 'personal/ballot', { season, week, mode, picks, submit: true, revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
  if (sent.status !== 200) throw new Error(`personal/ballot: ${JSON.stringify(sent.body)}`);
  return sent.body;
}

/** Signs in through the mocked password form; the community home needs a saved display name, which every fixture account has. */
export async function signIn(page, account = 'luke', { navigate = true } = {}) {
  if (navigate) await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS[account].email);
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
}


/** Signs out from the community home and signs in as another account in the same tab. */
export async function switchAccount(page, account) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, account, { navigate: false });
}
