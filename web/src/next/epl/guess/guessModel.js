import { fromLine, toLine, validPrice, validGuessPrice, validOutcome, outcomeClub, clubOutcome } from '../../../../../shared/epl-moneyline.mjs';

export const priceText = price => validPrice(price) ? price === 100 || price === -100 ? '+100 / −100 (even)' : `${price > 0 ? '+' : '−'}${Math.abs(price)}` : '—';
export const parsePrice = value => /^[-+−]?\d+$/.test(String(value).trim()) ? Number(String(value).trim().replace('−', '-')) : NaN;
export const stepPrice = (value, direction) => fromLine(toLine(validPrice(parsePrice(value)) ? parsePrice(value) : 100) + direction * 5);
export const isClosed = (fixture, now = Date.now()) => fixture.kickedOff === true || Date.parse(fixture.commenceTime) <= now || fixture.status !== 'scheduled';
export function guessProblem(error) {
  if (['GTL_EPL_OFF', 'GTL_EPL_GUESS_OFF'].includes(error?.code) || error?.status === 404) return 'Moneyline guessing is not available in this app version yet.';
  if (error?.status === 401) return 'Sign in again to read your guesses.';
  return 'Could not load saved guesses. Try again.';
}
/** The markets this server offers for entry. A reply without `markets` comes from a legacy two-way server. */
export const boardMarkets = data => Array.isArray(data?.markets) ? data.markets.filter(m => m === 'draw_no_bet' || m === 'three_way') : ['draw_no_bet'];
/** Whether the server is market-aware (it then takes { market, outcome } bodies, even when three-way entry is off). */
export const marketAware = data => Array.isArray(data?.markets);
export const guessMarket = g => g?.market === 'three_way' ? 'three_way' : 'draw_no_bet';
export const MARKET_LABELS = Object.freeze({ draw_no_bet: 'Draw no bet', three_way: '3-way' });
/** A draft's market, outcome and club for a fixture: draw_no_bet names a club, three_way an outcome (draw has no club). */
export function draftPick(draft, fixture) {
  const market = draft?.market === 'three_way' ? 'three_way' : 'draw_no_bet';
  if (market === 'draw_no_bet') return { market, club: draft?.club || null, outcome: clubOutcome(fixture, draft?.club) };
  const outcome = validOutcome('three_way', draft?.outcome) ? draft.outcome : null;
  return { market, outcome, club: outcomeClub(fixture, outcome) };
}
/** A draft the server could accept: an offered market, an outcome of this match, and a storable whole price. */
export function validDraft(draft, fixture, data) {
  const pick = draftPick(draft, fixture);
  return boardMarkets(data).includes(pick.market) && validOutcome(pick.market, pick.outcome) && (pick.market === 'three_way' || [fixture?.home, fixture?.away].includes(pick.club))
    && validGuessPrice(parsePrice(draft?.price));
}
const validGuessRow = g => g && typeof g.eventId === 'string' && typeof g.ownerId === 'string' && validPrice(g.price) && ['draft', 'locked'].includes(g.status)
  && ['draft', 'pending', 'scored', 'unscored'].includes(g.state)
  && (guessMarket(g) === 'three_way' ? validOutcome('three_way', g.outcome) && (g.outcome === 'draw' ? g.club === null : typeof g.club === 'string') : typeof g.club === 'string');
export function validBoard(data) {
  return data && typeof data.available === 'boolean' && Number.isInteger(data.season) && Number.isInteger(data.week)
    && (data.ownerId === null || typeof data.ownerId === 'string')
    && Array.isArray(data.fixtures) && Array.isArray(data.guesses)
    && data.fixtures.every(f => f && typeof f.eventId === 'string' && typeof f.home === 'string' && typeof f.away === 'string' && Number.isFinite(Date.parse(f.commenceTime)))
    && (data.markets === undefined || Array.isArray(data.markets)) && data.guesses.every(validGuessRow);
}
export function ownGuess(data, eventId) { return data?.ownerId ? data.guesses.find(g => g.eventId === eventId && g.ownerId === data.ownerId) : null; }
export function visibleGuesses(data, fixture, now) {
  const own = ownGuess(data, fixture.eventId);
  // The server is authoritative; this also fails closed if an incompatible server sends extra draft rows.
  const kickedOff = fixture.kickedOff === true || Date.parse(fixture.commenceTime) <= now;
  return data.guesses.filter(g => g.eventId === fixture.eventId && (g.ownerId === data.ownerId || g.status === 'locked' && (own?.status === 'locked' || kickedOff)));
}
const validSaved = (g, data, fixture, draft, lock) => {
  const pick = draftPick(draft, fixture);
  return g?.eventId === fixture.eventId && g.ownerId === data.ownerId && g.club === pick.club && g.price === parsePrice(draft.price) && g.status === (lock ? 'locked' : 'draft')
    && ['draft', 'pending', 'scored', 'unscored'].includes(g.state) && (!marketAware(data) || (g.market === pick.market && g.outcome === pick.outcome));
};
/** A legacy server takes { club }; a market-aware one { market, outcome } (never both). */
const saveBody = (data, fixture, draft, lock) => {
  const pick = draftPick(draft, fixture), price = parsePrice(draft.price);
  return marketAware(data) ? { eventId: fixture.eventId, market: pick.market, outcome: pick.outcome, price, lock } : { eventId: fixture.eventId, club: pick.club, price, lock };
};

/** Account-scoped state machine. Never stores private guesses outside this mounted account. */
export function createGuessController(api) {
  let state = { status: 'loading', data: null, drafts: {}, busy: false, uncertain: false, notice: null, error: null };
  let generation = 0, active = true, reading = null;
  const listeners = new Set();
  const set = patch => { if (active) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
  const current = (id, key) => active && id === generation && (!key || key === `${state.data?.season}/${state.data?.week}`);
  async function load({ pinned = false, season, week } = {}) {
    if (state.busy && !state.uncertain && state.status === 'ready') return false;
    reading?.abort(); reading = new AbortController();
    const id = ++generation, previous = state.data, checkingUncertain = state.uncertain;
    set({ status: previous ? 'refreshing' : 'loading', busy: true, error: null });
    try {
      const body = (pinned || state.uncertain) && previous ? { season: previous.season, week: previous.week } : season && week ? { season, week } : {};
      const data = await api('guess/read', body, { signal: reading.signal });
      if (!current(id)) return false;
      if (!validBoard(data) || body.week && (data.season !== body.season || data.week !== body.week)) throw new Error('Invalid board');
      const same = previous?.season === data.season && previous?.week === data.week && previous?.ownerId === data.ownerId;
      const drafts = same ? { ...state.drafts } : {};
      for (const f of data.fixtures) if (ownGuess(data, f.eventId)?.status === 'locked') delete drafts[f.eventId];
      set({ data, drafts, status: 'ready', busy: false, uncertain: false, ...(checkingUncertain ? { notice: 'Saved guesses checked.' } : {}) });
      return true;
    } catch (error) {
      if (current(id)) set({ status: previous ? 'stale' : 'error', error, busy: false });
      return false;
    }
  }
  function edit(eventId, patch) {
    if (state.busy || state.uncertain || state.status !== 'ready') return;
    const f = state.data?.fixtures.find(f => f.eventId === eventId), saved = ownGuess(state.data, eventId);
    if (!f || !state.data.available || !state.data.ownerId || isClosed(f) || saved?.status === 'locked') return;
    if (patch.market === 'three_way' && !boardMarkets(state.data).includes('three_way')) return;
    const base = { market: guessMarket(saved), club: saved?.club ?? '', outcome: saved?.outcome ?? clubOutcome(f, saved?.club) ?? '', price: saved?.price?.toString() ?? '+100' };
    set({ drafts: { ...state.drafts, [eventId]: { ...base, ...state.drafts[eventId], ...patch } }, notice: null });
  }
  async function save(eventId, lock) {
    if (state.busy || state.uncertain || state.status !== 'ready') return;
    const data = state.data, fixture = data?.fixtures.find(f => f.eventId === eventId), saved = ownGuess(data, eventId);
    const draft = state.drafts[eventId] ?? saved;
    if (!data.available || !fixture || !data.ownerId || !draft || saved?.status === 'locked' || isClosed(fixture) || !validDraft(draft, fixture, data)) return;
    if (!marketAware(data) && draftPick(draft, fixture).market !== 'draw_no_bet') return;
    const id = ++generation, key = `${data.season}/${data.week}`;
    set({ busy: true, notice: null });
    try {
      const result = await api('guess/save', saveBody(data, fixture, draft, lock));
      if (!current(id, key)) return;
      if (!validSaved(result, data, fixture, draft, lock)) throw Object.assign(new Error('Unconfirmed save'), { uncertain: true });
      const drafts = { ...state.drafts }; delete drafts[eventId];
      set({ data: { ...data, guesses: [...data.guesses.filter(g => !(g.eventId === eventId && g.ownerId === data.ownerId)), result] }, drafts, busy: false, notice: lock ? 'Guess locked. Final for this match.' : 'Draft saved.' });
      // Refresh permitted opponent guesses and reference state after a final lock.
      if (lock) await load({ pinned: true });
    } catch (error) {
      if (!current(id, key)) return;
      const code = error?.code;
      const definite = !error?.uncertain && code !== 'GTL_EPL_GUESS_UNCERTAIN' && (['GTL_EPL_GUESS_CLOSED', 'GTL_EPL_GUESS_LOCKED', 'GTL_EPL_GUESS_INVALID', 'GTL_EPL_GUESS_NOT_MEMBER', 'GTL_EPL_FORBIDDEN', 'GTL_EPL_GUESS_OFF', 'GTL_EPL_OFF'].includes(code) || [400, 401, 403, 404].includes(error?.status));
      set({ busy: false, uncertain: !definite, notice: code === 'GTL_EPL_GUESS_CLOSED' ? "This match has kicked off. Your draft wasn't locked." : code === 'GTL_EPL_GUESS_LOCKED' ? 'This guess is already locked. Checking saved data.' : definite ? 'Could not save. Your draft is still here.' : 'Save not confirmed. Check saved guesses before trying again. Your draft is still here.' });
      if (!definite || ['GTL_EPL_GUESS_CLOSED', 'GTL_EPL_GUESS_LOCKED', 'GTL_EPL_GUESS_NOT_MEMBER', 'GTL_EPL_GUESS_OFF', 'GTL_EPL_OFF'].includes(code) || [401, 403].includes(error?.status)) await load({ pinned: true });
    }
  }
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, load, edit, save,
    activate: () => { active = true; }, dispose: () => { active = false; generation++; reading?.abort(); } };
}
