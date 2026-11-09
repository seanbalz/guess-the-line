// Still playing from last week (November 9, 2026). The current NFL week the app reads by default is the newest
// published slate (gtl_read_personal and gtl_read_lines with no week). Week N+1 opens Monday 12:00 AM PT (D-24), while
// Week N's Monday night game (or a late or postponed game) has not been played yet, so the default read alone hides that
// game everywhere. Entry stays on the newest week; these pure functions decide whether the week before it still has a
// game to show beside it, from the server's own `now`, kickoffs and recorded finals. No dates are hardcoded.
//
// A prior-week game stays shown while it is not done: not yet final, or final but not yet graded for a guess the viewer
// locked in. A done game stays a short while (FINAL_GRACE_MS from its recorded final) so the final and the points can
// be seen, then the section goes and normal behavior resumes. A game still not final long after its kickoff
// (STALE_MS) is no longer held on screen, so a missing result never pins last week forever; it stays in History.

export const FINAL_GRACE_MS = 12 * 60 * 60 * 1000;
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ms = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : null;
};
const validWeek = value => record(value) && Number.isInteger(value.season) && Number.isInteger(value.week);
const order = (a, b) => b.season - a.season || b.week - a.week;
const score = value => Number.isSafeInteger(value) && value >= 0;

/**
 * The published week just before the one the viewer's `/personal` read is for: `{ season, week }`, or null when the
 * read names no week or no earlier slate is published. Only the published slates the server listed are used.
 */
export function priorWeekOf(personal) {
  if (!validWeek(personal)) return null;
  const slates = (Array.isArray(personal.slates) ? personal.slates : []).filter(validWeek).sort(order);
  const earlier = slates.find(slate => order({ season: personal.season, week: personal.week }, slate) < 0);
  return earlier ? { season: earlier.season, week: earlier.week } : null;
}

/** A recorded final with both scores, as `/lines/read` carries it; else null. */
function finalOf(row) {
  const final = row?.final;
  return record(final) && final.status === 'final' && score(final.away) && score(final.home) ? final : null;
}

/** The viewer's own row for one market: the guess, whether it is locked in, and its points once graded. */
function mineOf(row, market) {
  const mine = row?.mine?.[market];
  const guess = Number.isFinite(mine?.guess) ? mine.guess : null;
  return { guess, lockedIn: mine?.lockedIn === true, points: Number.isFinite(mine?.points) ? mine.points : null };
}

/**
 * One prior-week game's state at `now`: 'upcoming' (kickoff still ahead, a postponed game too), 'live' (kicked off, no
 * final recorded), 'grading' (final, a locked-in guess still without points), 'final' (final and graded).
 */
export function priorGameState(row, now) {
  const kickoff = ms(row?.kickoff);
  if (!finalOf(row)) return row?.started === true || (kickoff !== null && now >= kickoff) ? 'live' : 'upcoming';
  const waiting = ['spread', 'total'].some(market => { const mine = mineOf(row, market); return mine.lockedIn && mine.guess !== null && mine.points === null; });
  return waiting ? 'grading' : 'final';
}

/** Whether a prior-week game still belongs on screen at `now` (see the header). */
function stillShown(row, now) {
  const kickoff = ms(row?.kickoff), state = priorGameState(row, now);
  if (state === 'upcoming') return true;
  if (state === 'live' || state === 'grading') return kickoff === null || now - kickoff < STALE_MS;
  // Final and graded: kept FINAL_GRACE_MS from the recorded final (or from kickoff when its time is missing).
  const done = ms(finalOf(row).observedAt) ?? kickoff;
  return done !== null && now - done < FINAL_GRACE_MS;
}

/**
 * The "still playing from Week N" view, or null for normal behavior. `current` is the week entry is for (`/personal`),
 * `lines` the `/lines/read` reply for the week before it, `now` the server clock in ms. Shown only when that reply is
 * older than the current week and the week is not over: a game is upcoming, live or ungraded, or the week's last game
 * (latest kickoff) went final and graded within its grace period. The games listed are those still shown.
 */
export function priorWeekStillPlaying({ current = null, lines = null, now = null } = {}) {
  if (!validWeek(current) || !validWeek(lines) || !Array.isArray(lines.games) || !Number.isFinite(now)) return null;
  if (order(current, lines) >= 0) return null;
  const rows = lines.games.filter(row => record(row) && typeof row.id === 'string' && ms(row.kickoff) !== null);
  const shown = rows.filter(row => stillShown(row, now));
  const last = Math.max(...rows.map(row => ms(row.kickoff)));
  const open = shown.some(row => priorGameState(row, now) !== 'final' || ms(row.kickoff) === last);
  if (!open) return null;
  const games = shown.map(row => {
    const [away, home] = row.id.split('-');
    const final = finalOf(row);
    return {
      id: row.id, away: row.awayCode || away, home: row.homeCode || home, kickoff: row.kickoff,
      state: priorGameState(row, now),
      final: final ? { away: final.away, home: final.home } : null,
      spread: mineOf(row, 'spread'), total: mineOf(row, 'total'),
      // The line at the guess, only when the server opened it to the viewer (`/lines/read` gates it per market).
      lineAtGuess: {
        spread: Number.isFinite(row.mine?.spread?.lineAtGuess?.value) ? row.mine.spread.lineAtGuess.value : null,
        total: Number.isFinite(row.mine?.total?.lineAtGuess?.value) ? row.mine.total.lineAtGuess.value : null,
      },
    };
  }).sort((a, b) => ms(a.kickoff) - ms(b.kickoff) || (a.id < b.id ? -1 : 1));
  const playing = games.filter(game => game.state === 'upcoming' || game.state === 'live').length;
  return { season: lines.season, week: lines.week, games, playing };
}
