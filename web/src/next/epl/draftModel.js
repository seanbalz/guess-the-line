// Pick a Team's board as plain data (plan 2026-10-28-epl-pick-a-team.md, Task 8): one `epl/draft/read` reply
// (cloud/epl.mjs) turned into what the screens draw, plus the pick and queue saves and the read's loading state. Pure
// apart from the `api` passed in: no React, DOM or clock (callers pass `now`). The server decides every turn, club and
// refusal (shared/epl-draft.mjs canPick, then M-30 under a row lock); `now` against the deadline is only a hint that
// locks the buttons once the first kickoff has passed.
import { resolveClubCrest } from '../../teamLogoRegistry.js';
import { fmtWhen } from '../format.js';

export const PICK_COPY = Object.freeze({
  draftLabel: week => `MW${week} draft · order from MW${week - 1} score + bonus`,
  onClock: name => `${name} is on the clock`,
  chooseBelow: 'Choose a club below.',
  pickAClub: 'Pick a club',
  pick: name => `Pick ${name}`,
  change: name => `Change to ${name}`,
  everyonePicked: 'Everyone has picked',
  locked: 'Draft locked',
  locks: when => `Locks ${when} · widest win = margin × 5`,
  lockedAt: when => `Locked ${when}`,
  available: 'Still available',
  notYourTurn: 'You can pick when you’re on the clock.',
  queue: 'Set my backup ranking (queue)',
  bonusTitle: 'Last matchweek’s bonus',
  review: 'Results under review',
  reviewBody: 'The commissioner is checking this matchweek’s results before the bonus is added.',
  noBonus: 'No bonus recorded for last matchweek.',
  picked: name => `You picked ${name}.`,
  changed: name => `You changed to ${name}.`,
  taken: 'Someone just took that club. Pick another.',
  turnGone: 'It’s not your turn to pick. The board is up to date.',
  closed: 'The draft has locked.',
  pickFailed: 'Your pick didn’t save. Try again.',
  queueSaved: 'Backup ranking saved.',
  queueFailed: 'Your backup ranking didn’t save. Try again.',
  loading: 'Loading the Pick a Team draft',
  failed: 'Pick a Team didn’t load.',
  stale: 'Couldn’t refresh the draft. Showing the last board.',
  retry: 'Try again',
  forbidden: 'Pick a Team is for the FEPL managers.',
  soon: 'Pick a Team is coming soon.',
  noWeek: 'No Pick a Team matchweek is open.',
});

const ms = value => { const t = Date.parse(value); return Number.isFinite(t) ? t : null; };

/**
 * The board for one read at `now`, or null without a read. `canPick` is true for the manager on the clock and for the
 * latest picker (who may change until the next manager picks), and only before the deadline; `available` leaves out
 * every club already picked.
 */
export function boardModel(read, now) {
  if (!read || !Array.isArray(read.order)) return null;
  const deadline = ms(read.deadline);
  const locked = read.status !== 'open' || deadline === null || !(now < deadline);
  const picks = new Map((read.picks ?? []).filter(p => p?.ownerId).map(p => [p.ownerId, p]));
  const clubs = Array.isArray(read.clubs) ? read.clubs : [];
  const clubOf = new Map(clubs.map(c => [c.code, c]));
  const nameOfClub = code => clubOf.get(code)?.name ?? resolveClubCrest(code)?.alt?.replace(/ crest$/, '') ?? code;
  const onTheClock = locked ? null : read.onTheClock ?? null;
  const me = typeof read.me === 'string' ? read.me : null;
  const latest = [...read.order].reverse().find(o => picks.get(o.ownerId)?.club)?.ownerId ?? null;
  const canPick = !locked && me !== null && (me === onTheClock || (me === latest && !picks.get(me)?.final));
  const nodes = read.order.map((o, i) => {
    const pick = picks.get(o.ownerId);
    return { ownerId: o.ownerId, name: o.name, slot: i + 1, club: pick?.club ?? null, clubName: pick?.club ? nameOfClub(pick.club) : null,
      onClock: o.ownerId === onTheClock, me: o.ownerId === me };
  });
  const taken = new Set(nodes.map(n => n.club).filter(Boolean));
  const first = [...clubs].filter(c => ms(c.kickoff) !== null).sort((a, b) => ms(a.kickoff) - ms(b.kickoff) || (b.home ? 1 : 0) - (a.home ? 1 : 0))[0];
  const firstHome = first ? (first.home ? first : clubOf.get(first.opponent) ?? null) : null;
  const myNode = nodes.find(n => n.me) ?? null;
  return {
    season: read.season, week: read.week, status: read.status, deadline: read.deadline, locked,
    review: read.status === 'needs_review',
    me, canPick, changing: canPick && me !== onTheClock,
    onClockName: nodes.find(n => n.onClock)?.name ?? null, onClockMe: onTheClock !== null && onTheClock === me,
    nodes, picksIn: taken.size, total: nodes.length,
    available: clubs.filter(c => !taken.has(c.code)),
    clubName: nameOfClub,
    myNode, myClub: myNode?.club ? clubOf.get(myNode.club) ?? { code: myNode.club, name: myNode.clubName } : null,
    firstMatch: firstHome ? { home: firstHome.code, away: firstHome.opponent, kickoff: firstHome.kickoff } : null,
    // Queues are a linked manager's own: an unlinked account (me null, myQueue []) gets no queue button.
    queue: me !== null && Array.isArray(read.myQueue) ? read.myQueue : null,
    // The managers an unlinked account may claim (EPL open access; the claim card).
    claim: me === null && Array.isArray(read.claim?.managers)
      ? read.claim.managers.filter(m => typeof m?.ownerId === 'string' && typeof m?.name === 'string').map(m => ({ ownerId: m.ownerId, name: m.name }))
      : null,
    clubs,
    bonus: Array.isArray(read.bonusLastWeek) ? read.bonusLastWeek : [],
    standingsSource: read.standingsSource?.kind === 'wikimedia-community' && read.standingsSource.official === false
      && /^\d{4}-\d{2}-\d{2}$/.test(read.standingsSource.dataAsOf ?? '')
      && ms(`${read.standingsSource.dataAsOf}T12:00:00Z`) !== null
      && new Date(`${read.standingsSource.dataAsOf}T12:00:00Z`).toISOString().slice(0, 10) === read.standingsSource.dataAsOf
      && /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?title=[^&]+&oldid=\d+$/.test(read.standingsSource.source?.url ?? '')
      && read.standingsSource.license?.url === 'https://creativecommons.org/licenses/by-sa/4.0/' ? read.standingsSource : null,
  };
}

/** "Sat 5:30 AM PT · widest win = margin × 5" before the deadline, "Locked Sat 5:30 AM PT" after it. */
export const deadlineLine = model => (model.locked ? PICK_COPY.lockedAt(fmtWhen(model.deadline)) : PICK_COPY.locks(fmtWhen(model.deadline)));

const REFUSED = new Set([401, 403]);
/** The read's state: `start`, `loaded`, `failed`. A 401/403 or the feature being off drops any board it had. */
export function draftReducer(state = { status: 'loading', data: null, error: null, stale: false }, action) {
  switch (action?.type) {
    case 'start': return state.data ? state : { status: 'loading', data: null, error: null, stale: false };
    case 'loaded': return { status: 'ready', data: action.data, error: null, stale: false };
    case 'failed': {
      const error = action.error;
      if (REFUSED.has(error?.status) || error?.code === 'GTL_EPL_OFF' || error?.code === 'GTL_EPL_NO_WEEK' || !state.data) return { status: 'error', data: null, error, stale: false };
      return { status: 'ready', data: state.data, error, stale: true };
    }
    default: return state;
  }
}

/** The sentence a failed read shows. */
export function readProblem(error) {
  if (error?.code === 'GTL_EPL_OFF') return PICK_COPY.soon;
  if (error?.code === 'GTL_EPL_NO_WEEK') return PICK_COPY.noWeek;
  if (error?.status === 401 || error?.status === 403) return PICK_COPY.forbidden;
  return PICK_COPY.failed;
}

const week = model => ({ season: model.season, week: model.week });

/**
 * One `draft/pick`: `{ notice, refresh, clear }`, where `refresh` asks for a new read (the board moved on, or the
 * server refused) and `clear` drops the selection. Never throws.
 */
export async function runPick({ api, club, model }) {
  const name = model.clubName(club);
  try {
    await api('draft/pick', { club, ...week(model) });
    return { refresh: true, clear: true, notice: { text: model.changing ? PICK_COPY.changed(name) : PICK_COPY.picked(name), tone: 'done' } };
  } catch (error) {
    if (error?.code === 'GTL_EPL_CLUB_TAKEN' || error?.code === 'GTL_EPL_CLUB_NOT_PLAYING') return { refresh: true, clear: true, notice: { text: PICK_COPY.taken, tone: 'warning' } };
    if (error?.code === 'GTL_EPL_NOT_YOUR_TURN') return { refresh: true, clear: true, notice: { text: PICK_COPY.turnGone, tone: 'warning' } };
    if (error?.code === 'GTL_EPL_DRAFT_CLOSED') return { refresh: true, clear: true, notice: { text: PICK_COPY.closed, tone: 'warning' } };
    // A save whose outcome is unknown says so in its own words (SaveUncertainError); re-read to show what was kept.
    if (error?.name === 'SaveUncertainError') return { refresh: true, clear: false, notice: { text: error.message, tone: 'error' } };
    return { refresh: false, clear: false, notice: { text: PICK_COPY.pickFailed, tone: 'error' } };
  }
}

/** One `queue/save` with the clubs in ranked order: `{ ok, clubs?, notice }`. Never throws. */
export async function saveQueue({ api, clubs, model }) {
  try {
    const saved = await api('queue/save', { clubs: [...clubs], ...week(model) });
    return { ok: true, clubs: Array.isArray(saved?.clubs) ? saved.clubs : [...clubs], notice: { text: PICK_COPY.queueSaved, tone: 'done' } };
  } catch (error) {
    if (error?.code === 'GTL_EPL_DRAFT_CLOSED') return { ok: false, notice: { text: PICK_COPY.closed, tone: 'warning' } };
    return { ok: false, notice: { text: error?.name === 'SaveUncertainError' ? error.message : PICK_COPY.queueFailed, tone: 'error' } };
  }
}

/** `list` with the club at `index` moved one place (`step` −1 up, +1 down); unchanged at either end. */
export function moveClub(list, index, step) {
  const to = index + step;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
