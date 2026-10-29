// Research -> Fantasy (EPL): the FEPL league view built from stored Sleeper snapshots (gtl_epl_snapshots), never from a
// live Sleeper call (plan 2026-10-28-epl-fantasy.md, Task 2; spec section 5). Pure: no I/O.
//
// Snapshot labels: after-mw<N> (season totals once matchweek N is final; stats N, projections N+1), before-mw<N>-kickoff
// (the lineup saved before N's first kickoff; projections N) and daily-<YYYY-MM-DD> (the latest totals, lineups and
// projections, once a day). Zero-padded imports (after-mw08) are the same matchweek.
//   * Weekly score N = weeklyScores(baseline, after-mw<N>), where the baseline is after-mw<N-1>, else before-mw<N>-kickoff
//     (no match has been played between the two, so their season totals agree). A week without both is null, never 0.
//   * Per-player detail (top scorers, projected vs actual) exists only for weeks with a before-mw<N>-kickoff lineup: the
//     players scored are that saved lineup's starters ("from saved lineup"), each at the position stored in that snapshot.
//   * Sleeper gives this league no schedule, so this week's opponent is read from the last scored round of the round-robin
//     (8 managers: every 7 matchweeks), and only while every scored repeat so far agrees; otherwise "Matchup unavailable".
//   * Standings = Sleeper season points + the season's Pick a Team bonus (gtl_epl_bonus), the raw Sleeper total kept.
// Managers are keyed by Sleeper owner_id; display names are presentation only (a rename changes nothing).
import { MANAGER_NAMES, managersFromSnapshot, pairMatchups, playersFromSnapshot, statsById, weeklyScores } from '../shared/epl-sleeper.mjs';
import { beatProjection, playerPoints, positionOf, seasonHigh, teamProjection, topScorers, winChance } from '../shared/epl-fantasy.mjs';
import { clubFromSleeperAbbr } from '../shared/epl-clubs.mjs';

/** How many recent matchweeks keep per-player detail (their full snapshots are read); totals cover the whole season. */
export const FANTASY_DETAIL_WEEKS = 6;
/** The projected-vs-actual chart's length. */
export const FANTASY_RECENT_WEEKS = 4;

const AFTER = /^after-mw0?(\d{1,2})$/;
const BEFORE = /^before-mw0?(\d{1,2})-kickoff$/;
const round2 = x => Math.round(x * 100) / 100;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const weekOf = (re, label) => { const m = re.exec(label); const n = m ? Number(m[1]) : NaN; return n >= 1 && n <= 38 ? n : null; };
const POS_LABEL = Object.freeze({ gk: 'GK', d: 'D', m: 'M', f: 'F' });

function usable(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .filter(s => record(s) && typeof s.label === 'string' && record(s.payload) && Number.isFinite(Date.parse(s.capturedAt)))
    .map((s, i) => ({ ...s, t: Date.parse(s.capturedAt), i }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
}
const stateSeason = s => (s.payload.state && s.payload.state.season != null ? String(s.payload.state.season) : null);

/** The season (a year) of the newest snapshot, or null. */
export function fantasySeason(snapshots) {
  const newest = usable(snapshots).at(-1);
  const year = newest ? Number(stateSeason(newest)) : NaN;
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
}

/** The labels whose full payload the view needs: the last FANTASY_DETAIL_WEEKS weeks with a saved lineup, before and after. */
export function detailLabels(snapshots) {
  const list = (Array.isArray(snapshots) ? snapshots : []).filter(s => record(s) && typeof s.label === 'string');
  const weeks = [...new Set(list.map(s => weekOf(BEFORE, s.label)).filter(Boolean))].sort((a, b) => a - b).slice(-FANTASY_DETAIL_WEEKS);
  const keep = new Set(weeks);
  return list.filter(s => keep.has(weekOf(BEFORE, s.label)) || keep.has(weekOf(AFTER, s.label))).map(s => s.label);
}

function byWeek(snaps, re) {
  const out = new Map();
  for (const s of snaps) { const n = weekOf(re, s.label); if (n) out.set(n, s); } // sorted oldest first: the newest capture wins
  return out;
}
const rosterOf = (payload, ownerId) => (Array.isArray(payload?.rosters) ? payload.rosters : []).find(r => record(r) && r.owner_id === ownerId) ?? null;
const ids = v => (Array.isArray(v) ? v.map(String) : []);

function playerRow(players, playerId) {
  const p = players[playerId];
  const pos = p ? positionOf(p) : null;
  const abbr = p && typeof p.team_abbr === 'string' ? p.team_abbr : null;
  return { playerId, name: p && typeof p.name === 'string' ? p.name : null, pos: pos ? POS_LABEL[pos] : null, club: clubFromSleeperAbbr(abbr), clubText: abbr };
}

/** Partner of each owner in a week's unambiguous pairs. */
const partners = pairs => new Map(pairs.flatMap(([a, b]) => [[a, b], [b, a]]));

export function buildFantasyView({ snapshots, bonus = [], viewerOwnerId = null } = {}) {
  const all = usable(snapshots);
  if (!all.length) return null;
  const newest = all.at(-1);
  const seasonKey = stateSeason(newest);
  const snaps = all.filter(s => !seasonKey || !stateSeason(s) || stateSeason(s) === seasonKey);
  const stateWeek = Number(newest.payload.state?.week);
  const week = Number.isInteger(stateWeek) && stateWeek >= 1 && stateWeek <= 38 ? stateWeek : (Number.isInteger(newest.week) ? newest.week : null);

  const managers = managersFromSnapshot(newest.payload);
  const nameOf = ownerId => (Object.hasOwn(MANAGER_NAMES, String(ownerId)) ? MANAGER_NAMES[String(ownerId)] : managers.find(m => m.ownerId === ownerId)?.sleeperName ?? null);
  const owners = managers.map(m => m.ownerId);

  // Players: every snapshot's directory, newest last so it wins.
  const players = Object.create(null);
  for (const s of snaps) Object.assign(players, playersFromSnapshot(s.payload));
  const scoring = [...snaps].reverse().map(s => s.payload.league?.scoring_settings).find(record) ?? {};

  const after = byWeek(snaps, AFTER), before = byWeek(snaps, BEFORE);
  const baseline = n => after.get(n - 1) ?? before.get(n) ?? null;
  const starts = [...[...after.keys()].map(n => n + 1), ...before.keys()].filter(n => n <= 38 && baseline(n));
  const detailStartsWeek = starts.length ? Math.min(...starts) : week;
  const lastScored = Math.max(-Infinity, ...[...after.keys()].filter(n => n >= detailStartsWeek));
  const range = Number.isFinite(lastScored) ? Array.from({ length: lastScored - detailStartsWeek + 1 }, (_, i) => detailStartsWeek + i) : [];

  const scores = new Map();
  for (const n of range) if (baseline(n) && after.get(n)) scores.set(n, weeklyScores(baseline(n).payload, after.get(n).payload));
  const weekly = range.flatMap(n => owners.map(ownerId => {
    const p = scores.get(n)?.[ownerId]?.for;
    return { week: n, ownerId, points: finite(p) ? p : null };
  }));
  const actualOf = (n, ownerId) => weekly.find(w => w.week === n && w.ownerId === ownerId)?.points ?? null;

  // Per-player detail: a saved before-kickoff lineup, its projections, and the after snapshot's stats.
  const lineupProj = new Map(); // `${n}:${owner}` -> projected total or null
  const scorerRows = [];
  const detailWeeks = [];
  for (const n of range) {
    const lineup = before.get(n);
    if (!lineup || !Array.isArray(lineup.payload.rosters)) continue;
    const weekPlayers = Object.assign(Object.create(null), players, playersFromSnapshot(lineup.payload));
    const projKey = `projections_mw${n}`, statsKey = `stats_mw${n}`;
    const projections = Object.hasOwn(lineup.payload, projKey) ? statsById(lineup.payload[projKey]) : null;
    const resultPayload = after.get(n)?.payload;
    const stats = resultPayload && Object.hasOwn(resultPayload, statsKey) ? statsById(resultPayload[statsKey]) : null;
    if (stats) detailWeeks.push(n);
    for (const ownerId of owners) {
      const starters = ids(rosterOf(lineup.payload, ownerId)?.starters);
      lineupProj.set(`${n}:${ownerId}`, projections ? teamProjection(starters, projections, weekPlayers, scoring).total : null);
      if (!stats) continue;
      for (const playerId of starters) {
        const pos = positionOf(weekPlayers[playerId]);
        if (!pos || !Object.hasOwn(stats, playerId)) continue;
        scorerRows.push({ ownerId, playerId, points: playerPoints(stats[playerId], pos, scoring) });
      }
    }
  }
  const sums = new Map();
  for (const r of scorerRows) { const key = `${r.ownerId}\u0000${r.playerId}`; sums.set(key, { ...r, points: round2((sums.get(key)?.points ?? 0) + r.points) }); }
  const tops = topScorers([...sums.values()]);
  const topScorerPerTeam = owners.filter(o => o in tops).map(ownerId => ({ ownerId, name: nameOf(ownerId), playerId: tops[ownerId].playerId,
    playerName: playerRow(players, tops[ownerId].playerId).name, points: tops[ownerId].points }));
  const beat = owners.flatMap(ownerId => range.map(n => ({ ownerId, week: n, diff: beatProjection(actualOf(n, ownerId), lineupProj.get(`${n}:${ownerId}`) ?? null) })));
  const high = seasonHigh(weekly);

  // Standings.
  const bonusBy = new Map();
  for (const b of Array.isArray(bonus) ? bonus : []) if (record(b) && finite(b.points)) bonusBy.set(b.ownerId, (bonusBy.get(b.ownerId) ?? 0) + b.points);
  const standings = managers.map(m => ({ ownerId: m.ownerId, name: nameOf(m.ownerId), wins: m.wins, losses: m.losses, sleeperTotal: m.seasonTotal,
    bonus: round2(bonusBy.get(m.ownerId) ?? 0), total: round2(m.seasonTotal + (bonusBy.get(m.ownerId) ?? 0)) }))
    .map((s, i) => ({ s, i })).sort((a, b) => b.s.total - a.s.total || b.s.wins - a.s.wins || a.i - b.i).map(({ s }) => s);

  // Rosters (current lineups).
  const rosters = owners.map(ownerId => {
    const r = rosterOf(newest.payload, ownerId);
    const starters = ids(r?.starters);
    const bench = ids(r?.players).filter(id => !starters.includes(id));
    return { ownerId, name: nameOf(ownerId), starters: starters.map(id => playerRow(players, id)), bench: bench.map(id => playerRow(players, id)) };
  });

  // Matchup.
  const viewer = owners.includes(viewerOwnerId) ? viewerOwnerId : null;
  const recent = viewer ? range.slice(-FANTASY_RECENT_WEEKS).map(n => ({ week: n, projected: lineupProj.get(`${n}:${viewer}`) ?? null, actual: actualOf(n, viewer) })) : [];
  const projSource = week ? [...snaps].reverse().find(s => Object.hasOwn(s.payload, `projections_mw${week}`) && Array.isArray(s.payload.rosters)) : null;
  const projectionFor = ownerId => {
    if (!projSource) return { total: null, rows: [] };
    const sourcePlayers = Object.assign(Object.create(null), players, playersFromSnapshot(projSource.payload));
    const starters = ids(rosterOf(projSource.payload, ownerId)?.starters);
    const p = teamProjection(starters, statsById(projSource.payload[`projections_mw${week}`]), sourcePlayers, scoring);
    return { total: p.total, rows: p.rows.map(r => ({ ...playerRow(sourcePlayers, r.playerId), proj: r.points })) };
  };
  let matchup;
  if (!viewer) matchup = { unavailable: true, week, me: null, myProj: null, starters: [], recent };
  else {
    const mine = projectionFor(viewer);
    const me = { ownerId: viewer, name: nameOf(viewer) };
    const cycle = owners.length % 2 ? owners.length : owners.length - 1;
    const paired = new Map([...scores].map(([n, s]) => [n, partners(pairMatchups(s).pairs)]));
    // Every scored repeat must agree with the round it repeats; any disagreement means the schedule is not a fixed cycle.
    const consistent = cycle >= 1 && [...paired].every(([n, map]) => {
      const later = paired.get(n + cycle);
      return !later || [...map].every(([a, b]) => !later.has(a) || later.get(a) === b);
    });
    let basisWeek = null;
    for (let n = week - cycle; consistent && cycle >= 1 && n >= 1; n -= cycle) if (paired.has(n) && scores.get(n)?.[viewer]) { basisWeek = n; break; }
    const oppId = basisWeek ? paired.get(basisWeek).get(viewer) ?? null : null;
    if (!oppId) matchup = { unavailable: true, week, me, myProj: mine.total, starters: mine.rows, recent };
    else {
      const theirs = projectionFor(oppId);
      matchup = { week, basisWeek, me, opp: { ownerId: oppId, name: nameOf(oppId) }, myProj: mine.total, oppProj: theirs.total,
        winChance: winChance(mine.total, theirs.total), starters: mine.rows, recent };
    }
  }

  return {
    season: seasonKey && Number.isInteger(Number(seasonKey)) ? Number(seasonKey) : null,
    week,
    viewer,
    capturedAt: new Date(newest.t).toISOString(),
    matchup,
    standings,
    rosters,
    insights: {
      weekly,
      seasonHigh: high ? { week: high.week, ownerId: high.ownerId, name: nameOf(high.ownerId), points: high.points } : null,
      myTopScorer: viewer ? topScorerPerTeam.find(t => t.ownerId === viewer) ?? null : null,
      topScorerPerTeam,
      beatProjection: beat,
      detailWeeks,
      detailStartsWeek,
    },
  };
}
