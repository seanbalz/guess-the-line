// The NBA browser world (milestone N1): the actual SQL ticket store in disposable PGlite behind the real cloud handler,
// and a synthetic BALLDONTLIE board. Every game, score, ticket and time is synthetic; no provider or hosted call is made.
import { randomUUID } from 'node:crypto';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerNbaError } from '../../cloud/nba.mjs';
import { normalizeNbaTicket } from '../../shared/nba-bets.mjs';
import { NBA_TEAMS } from '../../shared/nba-teams.mjs';
import { ALL } from '../migrations.mjs';
import { createCommunityWorld, SUPABASE, ACCOUNTS } from './community-world.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

/** Tuesday, November 10, 2026, 6:44 PM PT: the moment every N1 board shows (mockups 01 to 09). */
export const NBA_NOW = new Date('2026-11-11T02:44:00Z');
export const NBA_TODAY = '2026-11-10';
const OBSERVED = '2026-11-11T02:42:00Z';
const TEAM = Object.fromEntries(NBA_TEAMS.map((team, index) => [team.code, { id: index + 1, name: team.name, abbreviation: team.code }]));
const game = (id, away, home, status, statusText, startTime, awayScore = null, homeScore = null, sourceDate = NBA_TODAY) => ({
  id: `NBA:balldontlie:${id}`, sourceDate, startTime, away: TEAM[away], home: TEAM[home], status, statusText, awayScore, homeScore, observedAt: OBSERVED });
// Today: two finals (one in overtime), one in progress and three to come, as in the reviewed mockups.
const TONIGHT = [
  game(1001, 'PHI', 'MIA', 'final', 'Final', '2026-11-11T00:00:00Z', 112, 108),
  game(1002, 'OKC', 'SAC', 'final', 'Final/OT', '2026-11-11T00:00:00Z', 121, 117),
  game(1003, 'DEN', 'MIN', 'in_progress', '2nd Qtr', '2026-11-11T01:30:00Z', 54, 51),
  game(1004, 'BOS', 'NYK', 'scheduled', '2026-11-11T03:00:00Z', '2026-11-11T03:00:00Z'),
  game(1005, 'DAL', 'PHX', 'scheduled', '2026-11-11T03:00:00Z', '2026-11-11T03:00:00Z'),
  game(1006, 'LAL', 'GSW', 'scheduled', '2026-11-11T03:30:00Z', '2026-11-11T03:30:00Z'),
];
// Tomorrow: fifteen games, so all 30 teams' logos show on one real board (mockup 02's badge sheet).
const PAIRS = [['ATL', 'BOS'], ['BKN', 'CHA'], ['CHI', 'CLE'], ['DAL', 'DEN'], ['DET', 'GSW'], ['HOU', 'IND'], ['LAC', 'LAL'], ['MEM', 'MIA'], ['MIL', 'MIN'], ['NOP', 'NYK'], ['OKC', 'ORL'], ['PHI', 'PHX'], ['POR', 'SAC'], ['SAS', 'TOR'], ['UTA', 'WAS']];
const TOMORROW = PAIRS.map(([away, home], index) => {
  const start = new Date(Date.parse('2026-11-12T00:00:00Z') + Math.floor(index / 3) * 30 * 60000).toISOString().replace('.000', '');
  return game(2001 + index, away, home, 'scheduled', start, start, null, null, '2026-11-11');
});
const YESTERDAY = [game(1010, 'SAS', 'HOU', 'final', 'Final', '2026-11-10T00:30:00Z', 118, 122, '2026-11-09'), game(1011, 'ORL', 'NYK', 'final', 'Final', '2026-11-10T00:30:00Z', 104, 112, '2026-11-09')];
export const nbaSlate = date => date === NBA_TODAY ? TONIGHT : date === '2026-11-11' ? TOMORROW : date === '2026-11-09' ? YESTERDAY : [];

const leg = (gameId, matchup, market, extra) => ({ gameId, matchup, market, ...extra });
const ticket = (label, eventDate, legs, priceInput, stakeUnits, outcome = 'pending', kind = legs.length > 1 ? 'parlay' : 'single') =>
  ({ id: randomUUID(), season: '2026-27', eventDate, kind, label, legs, priceInput, stakeUnits, outcome });
/** The open tickets of mockup 05 and the settled ones behind History and This month (all synthetic). */
export function capturedTickets() {
  return {
    open: [
      ticket('76ers moneyline', NBA_TODAY, [leg('NBA:balldontlie:1001', 'PHI at MIA', 'moneyline', { team: 'PHI' })], { format: 'probability', value: 49.5 }, 1),
      ticket('Celtics spread', NBA_TODAY, [leg('NBA:balldontlie:1004', 'BOS at NYK', 'spread', { team: 'BOS', line: -4.5 })], { format: 'american', value: -110 }, 1.1),
      ticket('Spurs spread', '2026-11-09', [leg(`NBA:manual:${randomUUID()}`, 'Spurs at Rockets', 'spread', { team: 'Spurs', line: 3.5 })], { format: 'american', value: -105 }, 1),
      ticket('3-leg parlay', NBA_TODAY, [leg('NBA:balldontlie:1004', 'BOS at NYK', 'spread', { team: 'BOS', line: -4.5 }), leg('NBA:balldontlie:1003', 'DEN at MIN', 'spread', { team: 'DEN', line: 4 }), leg('NBA:balldontlie:1005', 'DAL at PHX', 'total', { side: 'over', line: 226.5 })], { format: 'american', value: 596 }, 0.5),
    ],
    settled: [
      ticket('Knicks total', '2026-11-09', [leg('NBA:balldontlie:1011', 'ORL at NYK', 'total', { side: 'under', line: 221.5 })], { format: 'american', value: -110 }, 1.1, 'loss'),
      ticket('Nuggets moneyline', '2026-11-03', [leg('NBA:manual:nuggets', 'DEN at UTA', 'moneyline', { team: 'DEN' })], { format: 'american', value: -150 }, 1.5, 'win'),
      ticket('Heat spread', '2026-11-05', [leg('NBA:manual:heat', 'MIA at CHA', 'spread', { team: 'MIA', line: 2.5 })], { format: 'american', value: -110 }, 1, 'win'),
      ticket('Lakers total', '2026-11-07', [leg('NBA:manual:lakers', 'LAL at POR', 'total', { side: 'over', line: 230 })], { format: 'american', value: -108 }, 1, 'push'),
    ],
  };
}

/** `eplAccess`: the lobby says EPL is open to this account, as it is for every account once M-30 is applied (D-68 addendum). */
export async function nbaFixture(page, baseURL, { eplAccess = true } = {}) {
  const world = await createCommunityWorld({ migrations: ALL, optionalRpc: true });
  const calls = [], controls = { loseSave: false, loseBefore: false, failGames: false, unavailable: false, empty: false, failRead: false, holdRead: null, stale: false };
  const rpc = async (name, args) => {
    try { return await world.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) result`, Object.values(args))).rows[0].result; }); }
    catch (error) { throw providerNbaError(error.message); }
  };
  const games = async body => {
    if (controls.failGames) throw new Error('Fixture refresh failed');
    return { ...body, source: 'BALLDONTLIE', observedAt: controls.stale ? '2026-11-11T02:30:00Z' : OBSERVED, stale: controls.stale, unavailable: controls.unavailable,
      games: controls.empty || controls.unavailable ? [] : nbaSlate(body.date) };
  };
  const handler = createCloudHandler({ authenticate: async token => world.users.has(token) ? { ...world.users.get(token), emailConfirmed: true } : null, nba: { rpc }, nbaGames: { read: games }, storage: { membership() { throw new Error('NBA requested NFL membership'); } } });
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
    if (path === 'nba/read' && controls.failRead) return reply(503, { error: 'Fixture unavailable' });
    if (path === 'nba/save' && controls.loseBefore) { controls.loseBefore = false; return route.abort('failed'); }
    const response = await (path?.startsWith('nba/') ? handler : world.handler)(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    if (path === 'nba/read' && controls.holdRead) { const held = controls.holdRead; controls.readHeld = true; await held; }
    if (path === 'nba/save' && controls.loseSave) { controls.loseSave = false; return route.abort('failed'); }
    let text = await response.text();
    if (path === 'lobby' && response.status === 200 && eplAccess) { const data = JSON.parse(text); if (data && typeof data === 'object' && !Array.isArray(data)) text = JSON.stringify({ ...data, epl: true }); }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text }).catch(() => {});
  });
  const directSave = async (terms, revision = 0, owner = ACCOUNTS.luke.id, reason = revision ? 'Another device correction' : null) =>
    rpc('gtl_nba_save_bet', { p_user_id: owner, p_operation_id: randomUUID(), p_ticket: normalizeNbaTicket(terms), p_expected_revision: revision, p_reason: reason });
  /** Seeds the reviewed tickets; the Knicks total gets a second, corrected revision so History shows its audit. */
  async function seedCaptured() {
    const { open, settled } = capturedTickets();
    for (const row of open) await directSave(row);
    for (const row of settled) {
      if (row.label !== 'Knicks total') { await directSave(row); continue; }
      await directSave({ ...row, outcome: 'pending' });
      await directSave(row, 1, ACCOUNTS.luke.id, 'Confirmed from final score');
    }
    return { open, settled };
  }
  return { ...world, controls, calls, rpc, directSave, seedCaptured };
}
