// Personal scoring only: server points are authoritative. Filters never create a rank or expose another member.
export const SCORE_MARKETS = Object.freeze([{ value: 'guess_spread', label: 'Spread' }, { value: 'guess_total', label: 'Total' }]);
export const perGameReady = rules => rules?.sentFinal === true && rules?.lateWindow === 'kickoff' && rules?.perGameScoring === true;
export const modeOf = value => value === 'total' || value === 'guess_total' ? 'guess_total' : 'guess_spread';
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const lateLabel = late => !late ? '' : number(late.minutes) !== null && late.minutes >= 0 ? `Late · ${late.minutes} min` : 'Late';
export const lockedAt = (ballot, id) => (ballot?.closedAtKickoff || []).includes(id) ? null : ballot?.lockedAt?.[id] || (Object.hasOwn(ballot?.picks ?? {}, id) && !(ballot?.closedAtKickoff || []).includes(id) ? ballot?.submittedAt : null) || null;
export const savedPicks = data => Object.fromEntries((data.games || []).map(game => [game.id, data.ballots?.[data.mode]?.picks?.[game.id] ?? '']));
/** Keep unsaved changes only on games still unlocked. A concurrent lock always wins. */
export function mergeDraft(data, mode, draft) {
  const ballot = data.ballots?.[mode], saved = savedPicks({ ...data, mode });
  return Object.fromEntries(Object.keys(saved).map(id => [id, lockedAt(ballot, id) || !draft || String(draft.picks[id] ?? '') === String(draft.base[id] ?? '') ? saved[id] : draft.picks[id] ?? saved[id]]));
}
export function ownEntry(week, viewer, mode) {
  const entries = (week?.entries || []).filter(entry => entry.userId === viewer && entry.mode === mode);
  return entries.find(entry => entry.status === 'sat_out') ?? entries[0] ?? null;
}
export function scoreRows(week, entry, { team = '', matchup = '' } = {}) {
  return (week?.games || []).filter(game => (!team || [game.awayCode, game.homeCode].includes(team)) && (!matchup || game.id === matchup)).map(game => {
    const pick = entry?.picks?.find(item => item.gameId === game.id);
    // Even an owner's malformed hidden row remains hidden; no arithmetic is inferred from missing fields.
    const hidden = pick?.hidden === true || (entry?.picksHidden && !pick);
    const locked = !hidden && pick?.lockedIn !== false && !pick?.closedAtKickoff && (pick?.lockedIn === true || Boolean(pick?.lockedAt) || (pick?.lockedIn !== false && entry?.status === 'submitted' && number(pick?.guess) !== null));
    const points = !hidden && locked && entry?.eligible !== false ? number(pick?.points) : null;
    const guess = hidden ? null : number(pick?.guess);
    const reference = hidden || !locked ? null : pick?.reference ?? null;
    const status = hidden ? 'Hidden' : !locked ? guess !== null ? 'Draft · not scored' : entry?.status === 'sat_out' ? 'Skipped' : 'No locked guess'
      : entry?.eligible === false ? 'Not eligible' : points !== null ? 'Scored' : reference?.status === 'pending' || number(reference?.value) === null ? 'Waiting for scoring line' : entry?.scoreTiming === 'immediate' ? 'Score unavailable' : 'Scores at kickoff';
    return { game, pick, guess, reference, points, locked, status, hidden };
  });
}
export function scoreSummary(rows) {
  const scored = rows.filter(row => row.points !== null);
  return { points: scored.length ? scored.reduce((sum, row) => sum + row.points, 0) : null, scored: scored.length,
    locked: rows.filter(row => row.locked).length, drafts: rows.filter(row => row.status === 'Draft · not scored').length,
    pending: rows.filter(row => row.status === 'Waiting for scoring line').length, ineligible: rows.filter(row => row.status === 'Not eligible').length,
    remaining: rows.filter(row => !row.locked).length, total: rows.length };
}
/** A fresh read confirms the intended lock, never just a successful HTTP response. */
export function lockConfirmed(data, request) {
  if (data?.season !== request.season || data?.week !== request.week) return false;
  const ballot = data.ballots?.[request.mode];
  return request.lockIn?.length > 0 && request.lockIn.every(id => lockedAt(ballot, id) && number(ballot?.picks?.[id]) === request.picks[id]);
}
