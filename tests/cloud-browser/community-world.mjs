// Shared community world for the D-21/D-23/D-24 browser specs: the real cloud handler and
// the real migrations on local PGlite (the community.spec.js pattern) with three fixture
// accounts. Luke views, Troy plays and Sean is the sean-troy-luke commissioner, so the
// community admin. The browser signs in through the mocked password form; the handler is
// also callable directly as any account for cross-user checks (removal, publish, 403s).
import fs from 'node:fs';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { providerCommunityError } from '../../cloud/community.mjs';
import { providerOfficialsError } from '../../cloud/officials.mjs';
import { providerWeeklyError } from '../../cloud/weekly.mjs';
import { pacificDate, pacificToUtc } from '../../shared/nfl-schedule.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip in each spec. */ }
export const pgliteAvailable = !!PGlite;
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const SUPABASE = 'https://gtl-frontend-check.supabase.co';
export const MIGRATIONS = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008225401_gtl_submission_time_scoring.sql',
  '20261008232055_gtl_fresh_submission_odds.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql',
  '20261012234500_gtl_game_officials.sql'];
/** D-24: an open fixture week must be the current Pacific week; its TNF deadline is 11:59 PM PT today. */
export const openDeadline = () => pacificToUtc(pacificDate(Date.now()).date, '23:59');
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
 * migrations: the migration files to apply in order (default MIGRATIONS; a spec that needs a newer file passes the full sorted list).
 */
export async function communityWorld(page, baseURL, { deadline = openDeadline(), games = 2, groupScreens = false, troyBallots = true, clock = Date.now, prepare = null, migrations = MIGRATIONS } = {}) {
  const db = new PGlite(), errors = [], accounts = Object.values(ACCOUNTS), troy = ACCOUNTS.troy;
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${migrations[0]}`, 'utf8'));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, games);
  state.league.deadline = deadline; state.games.forEach((game, i) => { game.kickoff = new Date(Date.parse(deadline) + i * 3_600_000).toISOString(); });
  prepare?.(state);
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
  await db.query(`insert into auth.users values ${accounts.map((_, i) => `($${i + 1})`).join(',')}`, accounts.map(a => a.id));
  for (const a of accounts) await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke',$2,$3)", [a.id, a.player, a.role]);
  const { season, week } = state.league;
  const troyPicks = { guess_spread: Object.fromEntries(state.games.map((g, i) => [g.id, [-3, 2.5][i % 2]])), guess_total: Object.fromEntries(state.games.map((g, i) => [g.id, [44, 47.5][i % 2]])) };
  for (const file of migrations.slice(1)) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
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
  const sessions = {}, users = new Map();
  for (const a of accounts) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: a.id, aud: 'authenticated', exp: expires })).toString('base64url')}.${a.player}`;
    const user = { id: a.id, aud: 'authenticated', role: 'authenticated', email: a.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    sessions[a.email] = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    users.set(token, user);
  }
  const world = { db, state, errors, troyPicks, schedule: null };
  const handler = createCloudHandler({
    authenticate: async value => (users.has(value) ? { ...users.get(value), emailConfirmed: true } : null), clock,
    social: { rpc: rpc(providerSocialError) }, personal: { rpc: personalRpc }, lobby: { rpc: rpc(providerLobbyError) },
    // The public schedule is a spec-owned fixture; the real adapter fetches nflverse. Never a live download here.
    community: { rpc: rpc(providerCommunityError), schedule: async () => { if (typeof world.schedule !== 'function') throw new Error('No schedule fixture.'); return world.schedule(); } },
    // Game referees for situational trends (the commissioner check and both RPCs run on the same PGlite database).
    officials: { rpc: rpc(providerOfficialsError) },
    // D-17: this fixture has no odds provider; the preflight reports eligible cached references (no spec here submits).
    odds: { rpc: (fn, args) => (fn === 'gtl_preflight_submission' ? Promise.resolve({ requiresReferences: false, ready: true }) : personalRpc(fn, args)) },
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
  page.on('pageerror', error => errors.push(error.message));
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
  /** Calls the handler directly as one account, as that person would from another device. Returns status and JSON, never throws on 4xx. */
  world.api = async (account, route, body) => {
    const headers = { authorization: `Bearer ${sessions[ACCOUNTS[account].email].access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) };
    const response = await handler(new Request(`${SUPABASE}/functions/v1/gtl-api/${route}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  };
  return world;
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
