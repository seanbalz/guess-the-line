// Shared synthetic fixtures for the D-82 Player Props pilot builder and its GitHub Actions collection
// (tests/player-prop-quote-requests.test.mjs, tests/player-props-collect.test.mjs). Not bookmaker quotes, nflverse records
// or account data; every fetch is a fake and the odds provider host is refused unless a test fakes it on purpose.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { easternToUtc } from '../../shared/nfl-schedule.mjs';

// Week 2 dates lie in the past, so research intake's own clock never sees the built input as future-dated.
export const SEASON = 2026, WEEK = 2;
export const KICK = easternToUtc('2026-09-20', '13:00'), LATE = easternToUtc('2026-09-20', '16:25'), NIGHT = easternToUtc('2026-09-20', '20:20');
export const NOW = Date.parse(KICK) - 6 * 3_600_000;
export const iso = ms => new Date(ms).toISOString();
export const SCHEDULE = ['game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score',
  '2026_02_NYJ_NE,2026,REG,2,2026-09-17,20:15,NYJ,NE,,',
  '2026_02_DAL_PHI,2026,REG,2,2026-09-20,13:00,DAL,PHI,,',
  '2026_02_GB_CHI,2026,REG,2,2026-09-20,13:00,GB,CHI,,',
  '2026_02_SEA_ARI,2026,REG,2,2026-09-20,16:05,SEA,ARI,,',
  '2026_02_LA_SF,2026,REG,2,2026-09-20,16:25,LA,SF,,',
  '2026_02_KC_BUF,2026,REG,2,2026-09-20,20:20,KC,BUF,,'].join('\n');
export const P = n => `00-${String(n).padStart(7, '0')}`;
export const ROSTER_ROWS = [
  [2, P(1), 'DAL', 'QB', 'ACT', 'Dak Fixture'], [2, P(2), 'DAL', 'WR', 'ACT', 'Cee Fixture'], [2, P(3), 'DAL', 'RB', 'INA', 'Tony Fixture'],
  [2, P(4), 'DAL', 'K', 'ACT', 'Kick Fixture'], [2, P(5), 'DAL', 'WR', 'ACT', 'Same Name'], [2, P(7), 'DAL', 'WR', 'ACT', 'José Fixturé'],
  [1, P(6), 'DAL', 'WR', 'ACT', 'Last Week Only'],
  [2, P(11), 'PHI', 'QB', 'ACT', 'Jalen Fixture'], [2, P(12), 'PHI', 'RB', 'ACT', 'Saquon Fixture'], [2, P(13), 'PHI', 'CB', 'ACT', 'Same Name'],
  [2, P(14), 'PHI', 'WR', 'ACT', 'A.J. Fixture'], [2, P(14), 'PHI', 'WR', 'ACT', 'A.J. Fixture'], [2, 'NA', 'PHI', 'TE', 'ACT', 'No Id Fixture'],
  [2, P(15), 'PHI', 'TE', 'ACT', 'Changed Fixture'], [2, P(15), 'PHI', 'TE', 'RES', 'Changed Fixture'],
  [2, P(21), 'LA', 'QB', 'ACT', 'Matthew Fixture'], [2, P(31), 'SF', 'RB', 'ACT', 'Christian Fixture'],
  [2, P(41), 'KC', 'QB', 'ACT', 'Patrick Fixture'], [2, P(51), 'GB', 'QB', 'ACT', 'Jordan Fixture'], [2, P(52), 'CHI', 'QB', 'ACT', 'Caleb Fixture'],
];
export const rosterCsv = (rows = ROSTER_ROWS) => ['season,week,game_type,gsis_id,team,position,status,full_name,pfr_id',
  ...rows.map(([week, id, team, pos, status, name]) => `2026,${week},REG,${id},${team},${pos},${status},${name},pfr${id}`)].join('\n');
export const file = (key, name, text, updatedAt = iso(NOW - 2 * 3_600_000)) => ({ key, name: `nflverse ${name}`, url: `https://example.invalid/${name}`, text,
  sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), updatedAt, retrievedAt: iso(NOW), license: 'CC BY 4.0' });
export const game = (gameId, kickoff, extra = {}) => {
  const names = { DAL: 'Dallas Cowboys', PHI: 'Philadelphia Eagles', LAR: 'Los Angeles Rams', SF: 'San Francisco 49ers', KC: 'Kansas City Chiefs', BUF: 'Buffalo Bills',
    NYJ: 'New York Jets', NE: 'New England Patriots', GB: 'Green Bay Packers', CHI: 'Chicago Bears', SEA: 'Seattle Seahawks', ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', NO: 'New Orleans Saints' };
  const [away, home] = gameId.split('-');
  return { gameId, home: names[home], away: names[away], kickoff, providerEventId: `evt-${gameId.toLowerCase()}`, matchStatus: 'matched', markets: {}, ...extra };
};
export const SNAPSHOT_GAMES = [
  game('NYJ-NE', easternToUtc('2026-09-17', '20:15')),
  game('KC-BUF', NIGHT), game('LAR-SF', LATE), game('DAL-PHI', KICK),
  game('GB-CHI', iso(Date.parse(KICK) + 5 * 60_000)),
  game('ATL-NO', KICK, { providerEventId: null, matchStatus: 'event_missing' }),
  game('SEA-ARI', easternToUtc('2026-09-20', '16:05'), { home: 'Arizona Cards' }),
];
export const snapshot = (games = SNAPSHOT_GAMES) => ({ createdAt: iso(NOW - 30 * 60_000), games });

/** A provider event reply for one built request: three books quoting the receiving-yards market only. */
export const PROVIDER_BOOKS = ['draftkings', 'fanduel', 'betmgm'];
export const providerEvent = request => {
  const outcomes = (name, line) => [{ name: 'Over', description: name, point: line, price: -110 }, { name: 'Under', description: name, point: line, price: -110 }];
  return { id: request.eventId, sport_key: 'americanfootball_nfl', home_team: request.game.home, away_team: request.game.away, commence_time: request.game.kickoff,
    bookmakers: PROVIDER_BOOKS.map((key, i) => ({ key, markets: [{ key: 'player_reception_yds', last_update: iso(NOW - (i + 1) * 60_000),
      outcomes: [...outcomes('Cee Fixture', 66.5 + i), ...outcomes('Jose Fixture', 40.5), ...outcomes('Same Name', 20.5), ...outcomes('Unknown Fixture', 30.5)] }] })) };
};

const releaseAsset = (tag, name, text) => {
  const bytes = Buffer.from(text), url = `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`;
  return { tag, url, bytes, metadata: { assets: [{ name, browser_download_url: url, size: bytes.byteLength, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    updated_at: iso(NOW - 2 * 3_600_000) }] } };
};
/** The builder's network: one read-only snapshot GET on abc.supabase.co and the two verified nflverse files. */
export function fakeNetwork({ snapshotRows = [{ created_at: iso(NOW - 30 * 60_000), games: SNAPSHOT_GAMES }] } = {}) {
  const assets = [releaseAsset('schedules', 'games.csv', SCHEDULE), releaseAsset('weekly_rosters', 'roster_weekly_2026.csv', rosterCsv())];
  const calls = [];
  const fetchImpl = async (target, options = {}) => {
    const url = new URL(String(target));
    calls.push({ url: url.href, method: options.method ?? 'GET', headers: { ...(options.headers ?? {}) } });
    assert.notEqual(url.hostname, 'api.the-odds-api.com', 'never the odds provider');
    if (url.hostname === 'abc.supabase.co') {
      assert.equal(url.pathname, '/rest/v1/gtl_market_snapshots'); assert.equal(options.method, 'GET');
      assert.equal(url.searchParams.get('select'), 'created_at,games:payload->games'); assert.equal(url.searchParams.get('limit'), '1');
      assert.equal(url.searchParams.get('season'), 'eq.2026'); assert.equal(url.searchParams.get('week'), 'eq.2');
      return new Response(JSON.stringify(snapshotRows), { status: 200 });
    }
    for (const asset of assets) {
      if (url.href === `https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${asset.tag}`) return new Response(JSON.stringify(asset.metadata), { status: 200 });
      if (url.href === asset.url) return new Response(asset.bytes, { status: 200 });
    }
    assert.fail(`unexpected request ${url.host}${url.pathname}`);
  };
  return { fetchImpl, calls };
}
export const ENV = { GTL_RESEARCH_SUPABASE_URL: 'https://abc.supabase.co', GTL_RESEARCH_SERVICE_ROLE_KEY: 'service-key-fixture' };
