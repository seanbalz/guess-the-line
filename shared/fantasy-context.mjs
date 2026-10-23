// Public Fantasy game context (D-57): what defenses allowed, kickoff windows, and implied team totals from the viewer's own
// gated lines reply. Pure functions only; nothing here fetches, and no line is ever stored in a Fantasy file.
import { scoreStats, formatFantasyNumber } from './fantasy-rankings.mjs';

export const MATCHUP_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
const tenth = value => Math.round((value + Number.EPSILON) * 10) / 10;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const enough = values => values.length >= 2 && values.every(value => value !== null);

export const ordinal = n => {
  const suffixes = ['th', 'st', 'nd', 'rd'], rest = n % 100;
  return `${n}${suffixes[(rest - 20) % 10] || suffixes[rest] || suffixes[0]}`;
};

/** Points allowed per game to one position under the selected scoring; rank 1 = most allowed; ties on the shown tenth share. */
export function matchupTable(snapshot, position, settings = {}, recentGames = 4) {
  if (!snapshot?.matchups || !MATCHUP_POSITIONS.includes(position)) return null;
  const rows = Object.entries(snapshot.matchups).map(([team, games]) => {
    const points = games.map(game => scoreStats(game.allowed?.[position], { ...settings, position }));
    const recent = points.slice(-recentGames);
    return { team, season: enough(points) ? mean(points) : null, seasonGames: points.length,
      recent: enough(recent) ? mean(recent) : null, recentGames: recent.length };
  });
  const rank = key => {
    const out = new Map(); let previous = null, current = 0;
    rows.filter(row => row[key] !== null).sort((a, b) => b[key] - a[key] || a.team.localeCompare(b.team)).forEach((row, index) => {
      const shown = tenth(row[key]); if (shown !== previous) current = index + 1;
      out.set(row.team, current); previous = shown;
    });
    return out;
  };
  const seasonRanks = rank('season'), recentRanks = rank('recent');
  return { position, teams: rows.length, recentGames, rows: new Map(rows.map(row => [row.team, {
    ...row, seasonRank: seasonRanks.get(row.team) ?? null, recentRank: recentRanks.get(row.team) ?? null,
  }])) };
}

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
const plural = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' };
const most = rank => (rank === 1 ? 'most' : `${ordinal(rank)}-most`);

export function opponentOf(player) {
  const match = /^(vs|@) ([A-Z]{2,3})$/.exec(player?.weekly?.opponent ?? '');
  return match ? { opponent: match[2], home: match[1] === 'vs' } : null;
}
export function gameIdFor(player) {
  const opponent = opponentOf(player);
  return opponent ? (opponent.home ? `${opponent.opponent}-${player.team}` : `${player.team}-${opponent.opponent}`) : null;
}
export function kickoffWindow(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = Object.fromEntries(ET.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  switch (parts.weekday) {
    case 'Thu': return hour < 19 ? 'Thu' : 'Thu night';
    case 'Fri': return 'Fri';
    case 'Sat': return 'Sat';
    case 'Mon': return 'Mon night';
    case 'Sun': return hour < 12 ? 'International' : hour < 16 ? 'Sun early' : hour < 19 ? 'Sun late' : 'Sun night';
    default: return parts.weekday;
  }
}
/** D-57: totals only from the viewer's own reply, only when both markets are open to that viewer. */
export function impliedTotals(game) {
  const spread = game?.spread, total = game?.total;
  const locked = [spread?.visible === true ? null : 'spread', total?.visible === true ? null : 'total'].filter(Boolean);
  if (locked.length) return { locked };
  if (!Number.isFinite(spread.value) || !Number.isFinite(total.value)) return { missing: true };
  return { home: total.value / 2 - spread.value / 2, away: total.value / 2 + spread.value / 2,
    capturedAt: [spread.capturedAt, total.capturedAt].filter(Boolean).sort()[0] ?? null, bookCount: Math.min(spread.bookCount ?? 0, total.bookCount ?? 0) };
}
export function lockSentence(gameId, locked) {
  const markets = locked.length === 2 ? 'spread and total guesses' : `${locked[0]} guess`;
  return `Lock your ${gameId.replace('-', '–')} ${markets} to see the implied team total.`;
}

export function describePlayerContext(player, { matchups = null, lines = null, wind = null, scoringLabel = '' } = {}) {
  const opponent = opponentOf(player);
  if (player?.weekly?.status !== 'scheduled' || !opponent) return null;
  const id = gameIdFor(player), window = kickoffWindow(player.weekly.kickoff);
  const game = lines?.games?.get(id) ?? null, implied = game ? impliedTotals(game) : null;
  const team = implied && 'home' in implied ? (opponent.home ? implied.home : implied.away) : null;
  const row = matchups?.[player.position]?.rows?.get(opponent.opponent) ?? null;
  const forecast = wind?.games?.[id] ?? null, w = forecast?.wind;
  const weather = !forecast ? null : forecast.status === 'indoor' ? 'Indoors'
    : forecast.status === 'forecast' && w ? `Wind ${Math.round(w.windMph)} mph${w.gustMph != null ? `, gusts ${Math.round(w.gustMph)}` : ''}${w.precipitationProbability != null ? ` · Rain ${Math.round(w.precipitationProbability)}%` : ''}`
    : 'Forecast not available yet';
  return {
    pill: [player.weekly.opponent, window, team !== null ? formatFantasyNumber(team) : null].filter(Boolean).join(' · '),
    matchup: row?.recentRank ? `${opponent.opponent} allows the ${most(row.recentRank)} ${scoringLabel} points to ${plural[player.position]} · last ${row.recentGames} games (${formatFantasyNumber(row.recent)} per game)`
      : matchups?.[player.position] ? `${opponent.opponent}: fewer than two games of matchup data` : null,
    seasonMatchup: row?.seasonRank ? `Season: ${most(row.seasonRank)} (${formatFantasyNumber(row.season)} per game, ${row.seasonGames} games)` : null,
    kickoff: window, weather, weatherCredit: forecast?.status === 'forecast' ? wind.attribution ?? null : null,
    implied: team !== null ? { value: team, capturedAt: implied.capturedAt, bookCount: implied.bookCount } : null,
    lock: implied?.locked ? lockSentence(id, implied.locked) : null,
    linesNote: lines?.status === 'unavailable' ? 'Lines are not available right now.' : implied?.missing ? 'Implied team total —' : null,
  };
}
