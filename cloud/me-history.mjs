// Me › History (redesign build plan stage 72, M-27): the owner's own Guess changes (/me/changes) and the older records
// (/me/records). Both readers are service-only SQL (supabase/migrations/20261026230000_gtl_me_history.sql) that decide what
// each viewer may see; this module rebuilds their replies field by field, so nothing the SQL did not mean to send (and
// nothing malformed) reaches the browser. The retired Betting Challenge is graded here by the old engine (D-35:
// server/domain.mjs gradeBet, the function the old Betting Challenge screen used), from each week's newest recorded final.
import { gradeBet, winRate } from '../server/domain.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const time = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);
const text = (value, max = 2000) => (typeof value === 'string' ? value.slice(0, max) : null);
const integer = value => Number.isSafeInteger(value) ? value : null;
const list = value => (Array.isArray(value) ? value : []);
const MODES = ['guess_spread', 'guess_total'];
const GAME_ID = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
const CHANGE_TYPES = ['ballot_saved', 'ballot_submitted', 'ballot_edited', 'guess_locked_in', 'reference_resolved'];
const CHANGE_KINDS = ['draft', 'locked', 'edited', 'resolved'];
const invalid = () => { throw new Error('Invalid history reply.'); };

const late = value => (record(value) && finite(value.minutes) && value.minutes >= 0 ? { deadline: time(value.deadline), minutes: Math.floor(value.minutes) } : null);
function games(value) {
  return list(value).filter(game => GAME_ID.test(game?.id || '')).map(game => ({ id: game.id, awayCode: text(game.awayCode, 4), homeCode: text(game.homeCode, 4), kickoff: time(game.kickoff) }));
}
const reference = value => (record(value) ? { status: text(value.status, 40), basis: text(value.basis, 60), value: finite(value.value) ? value.value : null, observedAt: time(value.observedAt), source: text(value.source, 200) } : null);

/** gtl_read_ballot_changes' reply for `ownerId`: { ownerId, now, markets: [{ season, week, mode, deadline, satOut, games, changes, pendingChanges }] }. */
export function projectChanges(raw, ownerId) {
  if (!record(raw) || raw.ownerId !== ownerId || !Array.isArray(raw.markets)) invalid();
  return {
    ownerId, now: time(raw.now),
    markets: raw.markets.filter(market => integer(market?.season) && integer(market?.week) && MODES.includes(market?.mode)).map(market => {
      const ids = new Set(games(market.games).map(game => game.id));
      return {
        season: market.season, week: market.week, mode: market.mode, deadline: time(market.deadline), satOut: market.satOut === true, games: games(market.games),
        pendingChanges: integer(market.pendingChanges) && market.pendingChanges > 0 ? market.pendingChanges : 0,
        changes: list(market.changes).filter(change => CHANGE_TYPES.includes(change?.type)).map(change => ({
          type: change.type, at: time(change.at), late: late(change.late),
          ruled: record(change.ruled) ? { decision: text(change.ruled.decision, 40) } : null,
          games: list(change.games).filter(game => ids.has(game?.gameId) && CHANGE_KINDS.includes(game?.kind)).map(game => ({
            gameId: game.gameId, kind: game.kind, before: finite(game.before) ? game.before : null, after: finite(game.after) ? game.after : null,
            reference: reference(game.reference),
            beforeReference: record(game.beforeReference) ? { status: text(game.beforeReference.status, 40), basis: text(game.beforeReference.basis, 60) } : null,
          })),
        })).filter(change => change.games.length),
      };
    }),
  };
}

const SIDES = { spread: ['home', 'away'], total: ['over', 'under'] };
const FORFEIT_REASONS = ['skip', 'reveal'];
function result(value) {
  if (!record(value) || !['final', 'postponed', 'cancelled'].includes(value.status)) return null;
  return { status: value.status, home: Number.isInteger(value.home) ? value.home : null, away: Number.isInteger(value.away) ? value.away : null, origin: text(value.origin, 40) };
}
function slate(value) {
  const ids = games(value.games).map(game => game.id);
  const results = record(value.results) ? Object.fromEntries(Object.entries(value.results).filter(([id]) => ids.includes(id)).map(([id, r]) => [id, result(r)]).filter(([, r]) => r)) : {};
  return { season: value.season, week: value.week, deadline: time(value.deadline), games: games(value.games), results };
}
const personalChange = value => (record(value) ? { at: time(value.at), action: text(value.action, 40), before: record(value.before) || finite(value.before) ? value.before : null, after: record(value.after) || finite(value.after) ? value.after : null, reason: text(value.reason, 300) } : null);

/** One journal record as History shows it (read-only, Q8): the fields its writer stores, nothing else. */
function journalEntry(value) {
  const entry = { id: text(value.id, 36), season: value.season, week: value.week, gameId: value.gameId, kind: text(value.kind, 40), market: text(value.market, 10), side: text(value.side, 10),
    line: finite(value.line) ? value.line : null, odds: finite(value.odds) ? value.odds : null, source: text(value.source, 120), quotedAt: time(value.quotedAt), placedAt: time(value.placedAt),
    notes: text(value.notes), outcome: text(value.outcome, 10), currency: text(value.currency, 3), stakeMinor: finite(value.stakeMinor) ? value.stakeMinor : null,
    returnedMinor: finite(value.returnedMinor) ? value.returnedMinor : null, verification: text(value.verification, 200), retrospective: value.retrospective === true,
    revision: integer(value.revision), archived: value.archived === true, createdAt: time(value.createdAt), updatedAt: time(value.updatedAt),
    changes: list(value.changes).map(personalChange).filter(Boolean) };
  return entry;
}

/**
 * gtl_read_me_records' reply for `ownerId`, with each Betting Challenge selection graded by the old engine:
 * { ownerId, now, member, challenge: { players, selections, hidden, records }, saved, forecasts, journal, journalHidden,
 *   forfeits, sitOuts, archives, benchmarks, slates }.
 */
export function projectRecords(raw, ownerId) {
  if (!record(raw) || raw.ownerId !== ownerId || !record(raw.challenge)) invalid();
  const slates = list(raw.slates).filter(s => integer(s?.season) && integer(s?.week)).map(slate);
  const slateOf = (season, week) => slates.find(s => s.season === season && s.week === week);
  const players = list(raw.challenge.players).filter(p => typeof p?.userId === 'string').map(p => ({ userId: p.userId, displayName: text(p.displayName, 60), removed: p.removed === true }));
  const known = new Set(players.map(p => p.userId));
  const selections = list(raw.challenge.selections).filter(s => known.has(s?.userId) && integer(s.season) && integer(s.week) && GAME_ID.test(s.gameId || '')
    && SIDES[s.market]?.includes(s.side) && finite(s.line)).map(s => {
    const selection = { userId: s.userId, season: s.season, week: s.week, gameId: s.gameId, kickoff: time(s.kickoff), practice: s.practice === true,
      market: s.market, side: s.side, line: s.line, odds: Number.isInteger(s.odds) ? s.odds : null, source: text(s.source, 120), quotedAt: time(s.quotedAt),
      selectedAt: time(s.selectedAt), verification: text(s.verification, 200),
      receipt: record(s.receipt) ? { source: text(s.receipt.source, 60), quotedAt: time(s.receipt.quotedAt), collectedAt: time(s.receipt.collectedAt), tradability: text(s.receipt.tradability, 40) } : null };
    const final = slateOf(s.season, s.week)?.results[s.gameId] ?? null;
    return { ...selection, final, grade: gradeBet({ market: s.market, side: s.side, line: s.line }, final) };
  });
  const records = players.map(p => {
    const mine = selections.filter(s => s.userId === p.userId), tally = { W: 0, L: 0, P: 0 };
    for (const s of mine) if (s.grade) tally[s.grade] += 1;
    return { userId: p.userId, ...tally, winRate: winRate(tally), selections: mine.length, ungraded: mine.filter(s => !s.grade).length };
  });
  const hidden = list(raw.challenge.hidden).filter(h => known.has(h?.userId) && integer(h.season) && integer(h.week) && integer(h.count) > 0)
    .map(h => ({ userId: h.userId, season: h.season, week: h.week, count: h.count }));
  const where = value => integer(value?.season) && integer(value?.week) && GAME_ID.test(value?.gameId || '');
  return {
    ownerId, now: time(raw.now), member: raw.member === true,
    challenge: { players, selections, hidden, records },
    saved: list(raw.saved).filter(where).map(f => ({ season: f.season, week: f.week, gameId: f.gameId, saved: f.saved === true, note: text(f.note) ?? '',
      createdAt: time(f.createdAt), updatedAt: time(f.updatedAt), changes: list(f.changes).map(personalChange).filter(Boolean) })),
    forecasts: list(raw.forecasts).filter(f => where(f) && ['spread', 'total'].includes(f.market) && finite(f.value)).map(f => ({ season: f.season, week: f.week, gameId: f.gameId,
      market: f.market, value: f.value, savedAt: time(f.savedAt), revision: integer(f.revision),
      changes: list(f.changes).filter(record).map(c => ({ at: time(c.at), before: finite(c.before) ? c.before : null, after: finite(c.after) ? c.after : null })) })),
    journal: list(raw.journal).filter(where).map(journalEntry),
    journalHidden: integer(raw.journalHidden) && raw.journalHidden > 0 ? raw.journalHidden : 0,
    forfeits: list(raw.forfeits).filter(f => integer(f?.season) && integer(f?.week) && FORFEIT_REASONS.includes(f.reason))
      .map(f => ({ season: f.season, week: f.week, reason: f.reason, modes: list(f.modes).filter(m => MODES.includes(m)), createdAt: time(f.createdAt) })),
    sitOuts: list(raw.sitOuts).filter(o => integer(o?.season) && integer(o?.week) && MODES.includes(o.mode)).map(o => ({ season: o.season, week: o.week, mode: o.mode, createdAt: time(o.createdAt) })),
    archives: list(raw.archives).filter(a => typeof a?.leagueId === 'string').map(a => ({ leagueId: a.leagueId, name: text(a.name, 80), season: integer(a.season), week: integer(a.week),
      archivedAt: time(a.archivedAt), own: a.own === true, archivedCount: integer(a.archivedCount), games: games(a.games),
      snapshots: list(a.snapshots).filter(record).map(s => ({ id: text(s.id, 120), source: text(s.source, 120), sourceUrl: /^https:\/\//.test(s.sourceUrl || '') ? s.sourceUrl : null,
        quotedAt: time(s.quotedAt), capturedAt: time(s.capturedAt), timeBasis: s.timeBasis === 'publication' ? 'publication' : 'capture', total: a.own === true && finite(s.total) ? s.total : null,
        games: record(s.games) ? Object.fromEntries(Object.entries(s.games).filter(([id, g]) => GAME_ID.test(id) && finite(g?.value)).map(([id, g]) => [id,
          a.own === true ? { value: g.value, originalPick: finite(g.originalPick) ? g.originalPick : null, points: finite(g.points) ? g.points : null } : { value: g.value }])) : {} })) })),
    benchmarks: list(raw.benchmarks).filter(b => typeof b?.policyId === 'string').map(b => ({ policyId: b.policyId, leagueId: text(b.leagueId, 80), season: integer(b.season), week: integer(b.week),
      mode: MODES.includes(b.mode) ? b.mode : null, decision: text(b.decision), status: b.status === 'frozen' ? 'frozen' : 'not_frozen', frozenAt: time(b.frozenAt), actualKickoff: time(b.actualKickoff),
      sourceUrl: /^https:\/\//.test(b.sourceUrl || '') ? b.sourceUrl : null, capturedAt: time(b.capturedAt), quotedAt: time(b.quotedAt),
      games: record(b.games) ? Object.fromEntries(Object.entries(b.games).filter(([id, g]) => GAME_ID.test(id) && finite(g?.value))
        .map(([id, g]) => [id, { value: g.value, oldestObservedAt: time(g.oldestObservedAt), newestObservedAt: time(g.newestObservedAt) }])) : null })),
    slates,
  };
}
