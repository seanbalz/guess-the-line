// Team records and game logs (D-62) for every screen that shows a team: one shared read of POST /lines/teams at most
// every ten minutes, whatever number of cards, rows and sheets ask. A module-level store holds the answer and tells each
// subscriber when it changes; the first subscriber starts the read and nothing waits on it. Until it answers, and if it
// fails or the route is not deployed yet (404), the bundled records file stands in (records only, `games: []`,
// `fallback: true`, its own "through week"), so a pick screen always has its records and never blocks on this read.
// Only final scores and records are kept from the reply; any other field (a market included) is dropped here.
import { useSyncExternalStore } from 'react';
import bundled from '../../../../shared/team-records-2026.json';
import { readTeams } from '../../api.js';
import { teamCode } from '../ui/TeamMark.jsx';

export const TEAMS_TTL_MS = 10 * 60_000;

const count = n => Number.isSafeInteger(n) && n >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
const iso = value => (text(value) && Number.isFinite(Date.parse(value)) ? value : null);
const recordFrom = r => (plain(r) && count(r.w) && count(r.l) && count(r.t ?? 0) ? { w: r.w, l: r.l, t: r.t ?? 0 } : null);
const points = n => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);

function gameFrom(g) {
  if (!plain(g) || !count(g.week) || g.week < 1) return null;
  const opponent = teamCode(g.opponent);
  if (opponent === '—') return null;
  const final = g.final === true, pf = final ? points(g.pf) : null, pa = final ? points(g.pa) : null;
  // The result follows the score; a final without both scores keeps no result.
  const result = pf === null || pa === null ? null : pf > pa ? 'W' : pf < pa ? 'L' : 'T';
  return { week: g.week, gameId: text(g.gameId) ?? '', opponent, home: g.home === true, neutral: g.neutral === true,
    kickoff: iso(g.kickoff), final, pf, pa, result };
}

function teamFrom(t) {
  const overall = recordFrom(t?.overall);
  if (!overall) return null;
  return { overall, home: recordFrom(t.home), road: recordFrom(t.road), pointsFor: points(t.pointsFor), pointsAgainst: points(t.pointsAgainst),
    games: Array.isArray(t.games) ? t.games.map(gameFrom).filter(Boolean) : [] };
}

function teamsFrom(teams, build) {
  if (!plain(teams)) return null;
  const out = {};
  for (const [code, value] of Object.entries(teams)) {
    const label = teamCode(code), team = label === '—' ? null : build(value);
    if (team) out[label] = team;
  }
  return Object.keys(out).length ? out : null;
}

/** The season shape every team screen reads, from a /lines/teams reply; null when the reply is not usable. */
export function teamSeasonFrom(reply) {
  if (!plain(reply) || !count(reply.season)) return null;
  const teams = teamsFrom(reply.teams, teamFrom);
  if (!teams) return null;
  const source = plain(reply.source) ? reply.source : {};
  return { season: reply.season, throughWeek: count(reply.throughWeek) ? reply.throughWeek : null, finals: count(reply.finals) ? reply.finals : null,
    updatedAt: iso(reply.updatedAt), stale: reply.stale === true, fallback: false,
    source: { name: text(source.name), url: text(source.url), credit: text(source.credit) }, teams };
}

/** The bundled records file in the same shape: records only, no games and no points. */
export function fallbackTeamSeason(file = bundled) {
  const teams = teamsFrom(file?.teams, t => {
    const overall = recordFrom(t?.overall);
    return overall ? { overall, home: recordFrom(t.home), road: recordFrom(t.road), pointsFor: null, pointsAgainst: null, games: [] } : null;
  }) ?? {};
  return { season: file?.season ?? null, throughWeek: count(file?.through_week) ? file.through_week : null, finals: count(file?.finals) ? file.finals : null,
    updatedAt: iso(file?.retrieved_at), stale: false, fallback: true,
    source: { name: 'nflverse nfldata', url: text(file?.source), credit: text(file?.source_credit) }, teams };
}

/**
 * A store of one season's records: `getSnapshot()` is `{ status, data }`, where `status` is 'loading' (no answer yet),
 * 'ready' (the route's answer) or 'fallback' (it failed or is not deployed), and `data` is always a season to draw
 * (the bundled file until the route answers). `subscribe(listener)` starts a read when the last one is older than
 * `ttl`; one read at a time, shared by every subscriber. A later failure keeps the last good answer.
 */
export function createTeamSeasonStore({ read, now = () => Date.now(), ttl = TEAMS_TTL_MS, fallback = fallbackTeamSeason() } = {}) {
  let state = { status: 'loading', data: fallback };
  let startedAt = null, inflight = null;
  const listeners = new Set();
  const set = next => { state = next; for (const listener of [...listeners]) listener(); };
  function ensure() {
    if (inflight || (startedAt !== null && now() - startedAt < ttl)) return inflight;
    startedAt = now();
    inflight = Promise.resolve().then(() => read({})).then(reply => {
      const data = teamSeasonFrom(reply);
      if (!data) throw new Error('Team records were not readable.');
      return data;
    }).then(
      data => set({ status: 'ready', data }),
      error => { if (state.status !== 'ready') set({ status: 'fallback', data: fallback, error }); },
    ).finally(() => { inflight = null; });
    return inflight;
  }
  // A screen left open refreshes when the page is shown again (still at most one read per `ttl`).
  const onVisible = () => { if (globalThis.document?.visibilityState === 'visible') ensure(); };
  return {
    getSnapshot: () => state,
    ensure,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) globalThis.document?.addEventListener?.('visibilitychange', onVisible);
      ensure();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) globalThis.document?.removeEventListener?.('visibilitychange', onVisible);
      };
    },
  };
}

/** The app's one store (its tests read it too): every team screen subscribes to this. */
export const teamSeasonStore = createTeamSeasonStore({ read: body => readTeams(body) });

/** `const { status, data } = useTeamSeason()`: this season's records for any team screen, shared and cached (above). */
export function useTeamSeason() {
  return useSyncExternalStore(teamSeasonStore.subscribe, teamSeasonStore.getSnapshot, teamSeasonStore.getSnapshot);
}
