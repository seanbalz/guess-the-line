// Synthetic fixtures for the D-82 Player Props job suites (tests/player-prop-jobs*.test.mjs). Illustrative values only:
// not bookmaker quotes, nflverse records or account data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROP_JOB_RPCS, PROP_JOB_TABLES } from '../../cloud/player-prop-jobs.mjs';
import { easternToUtc } from '../../shared/nfl-schedule.mjs';

export const SEASON = 2026, WEEK = 10, EVENT = '2026_10_DAL_PHI', GAME = 'DAL-PHI';
export const WR = '00-0036358', RB = '00-0037000', QB = '00-0038000', CUT = '00-0039000';
export const KICK = easternToUtc('2026-11-15', '13:00');
export const NOW = Date.parse(KICK) - 6 * 3_600_000;
export const RUN = '00000000-0000-4000-8000-00000000aaaa';
export const REQ = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
export const at = (minutesAgo, now = NOW) => new Date(now - minutesAgo * 60_000).toISOString();

export const gamesCsv = ({ scored = false, moved = false } = {}) => ['game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score',
  moved ? '2026_11_DAL_PHI,2026,REG,11,2026-11-22,13:00,DAL,PHI,,' : `${EVENT},2026,REG,10,2026-11-15,13:00,DAL,PHI,${scored ? '24,20' : ','}`,
  '2026_10_LA_SF,2026,REG,10,2026-11-15,16:25,LA,SF,,'].join('\n');
export const rosterCsv = (rows = [
  [WR, 'DAL', 'WR', 'ACT', 'Fixture Receiver', 'pfrWR'], [RB, 'PHI', 'RB', 'ACT', 'Fixture Back', 'pfrRB'], [QB, 'DAL', 'QB', 'INA', 'Fixture Passer', 'pfrQB'],
  [CUT, 'DAL', 'K', 'ACT', 'Fixture Kicker', 'pfrK']]) => ['season,week,game_type,gsis_id,team,position,status,full_name,pfr_id',
  ...rows.map(([id, team, pos, status, name, pfr]) => `2026,10,REG,${id},${team},${pos},${status},${name},${pfr}`)].join('\n');
export const statsCsv = (rows = [[WR, EVENT, 87, 6], [RB, EVENT, 0, 2]]) => ['player_id,position,season,week,season_type,game_id,team,receiving_yards,receptions,rushing_yards,carries',
  ...rows.map(([id, game, yds, rec]) => `${id},WR,2026,10,REG,${game},DAL,${yds},${rec},0,0`)].join('\n');
export const snapsCsv = (rows = []) => ['game_id,season,game_type,week,pfr_player_id,offense_snaps,st_snaps', ...rows.map(([pfr, off]) => `${EVENT},2026,REG,10,${pfr},${off},0`)].join('\n');

export const quote = (book, side, line, { player = WR, key = 'player_reception_yds', minutesAgo = 5, now = NOW, kickoff = KICK } = {}) => ({
  gameId: GAME, kickoff, provider: 'the-odds-api', providerEventId: 'evt-1', book, source: book, odds: -110, observedAt: at(minutesAgo, now), capturedAt: at(minutesAgo, now),
  selection: { market: 'prop', key, side, line, playerId: player, playerName: 'Provider Name', unit: 'yards' } });
export const threeBooks = (lines = [66.5, 67.5, 68.5], opts = {}) => ['draftkings', 'fanduel', 'betmgm'].flatMap((book, i) =>
  [quote(book, 'over', lines[i], { ...opts, minutesAgo: 5 + i }), quote(book, 'under', lines[i], { ...opts, minutesAgo: 5 + i })]);
export const fetchRow = (quotes, { requestId = REQ[0], markets = ['player_reception_yds'], minutesAgo = 4, now = NOW, status = 'finished', error = null } = {}) =>
  ({ request_id: requestId, game_id: GAME, markets, status, error, started_at: at(minutesAgo, now), quote_payload: quotes });

export const file = (key, text, { updatedAt = KICK, sha = null } = {}) => ({ key, name: `nflverse ${key}.csv`, url: `https://example.invalid/${key}`, text,
  sha256: sha ?? createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), updatedAt, retrievedAt: new Date(NOW).toISOString() });
export function fakeSources(texts) {
  const reads = [];
  return { reads, read: async key => { reads.push(key); if (!Object.hasOwn(texts, key)) throw new Error(`unexpected ${key}`); return texts[key]; } };
}
export function fakeService({ ready = true, missing = false, rows = [], state = null, refuse = {} } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, body) => {
      calls.push([name, body]);
      assert.ok(PROP_JOB_RPCS.includes(name), name);
      if (missing) throw Object.assign(new Error('missing'), { code: 'SCHEMA_MISSING' });
      if (refuse[name]) throw Object.assign(new Error('refused'), { code: refuse[name] });
      if (name === 'gtl_props_jobs_capability') return { jobs: true, ready };
      if (name === 'gtl_props_jobs_state') return state;
      if (name === 'gtl_props_record_reference') return { id: '00000000-0000-4000-8000-00000000beef', line: body.p_line };
      if (name === 'gtl_props_record_result') return { version: (calls.filter(([n]) => n === name).length) };
      return {};
    },
    rows: async (table, query) => { calls.push(['rows', table, query]); assert.ok(PROP_JOB_TABLES.includes(table)); return rows; },
  };
}
