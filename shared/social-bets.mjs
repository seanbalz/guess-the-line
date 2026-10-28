// Shared public bet records. This module never reads private journals or guesses,
// contacts a sportsbook, or infers a parlay price from its correlated legs.
export const SOCIAL_OUTCOMES = ['pending', 'win', 'loss', 'push', 'void'];
export const SOCIAL_MARKETS = ['spread', 'total', 'prop'];
export class SocialError extends Error {
  constructor(status, message) { super(message); this.name = 'SocialError'; this.status = status; }
}
const fail = (message, status = 400) => { throw new SocialError(status, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, max, min = 0) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const round = value => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
const time = value => typeof value === 'number' ? value : Date.parse(value);
const gameList = games => Array.isArray(games) ? games : Object.entries(games || {}).map(([id, game]) => ({ id, ...game }));
const scopedGames = (games, entry) => games.filter(game => (game.season == null || game.season === entry.season) && (game.week == null || game.week === entry.week));
const keys = (body, allowed) => { if (!object(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Check the bet fields and try again.'); };
const identity = value => cleanText(value, 128, 1);
const revision = value => Number.isSafeInteger(value) && value >= 1;
const stake = value => value === null || (Number.isFinite(value) && value > 0 && value <= 1_000_000 && Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-7);
const returns = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 1_000_000_000);
const american = value => value === null || (Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7 && Math.abs(value) >= 100 && Math.abs(value) <= 1_000_000);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function emptySocialState() { return { version: 1, entries: [], audit: [], receipts: [] }; }

function checkedState(state) {
  if (!object(state) || state.version !== 1 || !Array.isArray(state.entries) || !Array.isArray(state.audit) || !Array.isArray(state.receipts)) fail('The bet tracker needs to be refreshed.', 409);
  return state;
}
function scope(body) {
  if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) fail('Choose a valid season and week.');
}
function matchingScope(body, entry) {
  if ((body.season !== undefined && body.season !== entry.season) || (body.week !== undefined && body.week !== entry.week)) fail('This bet belongs to a different week.', 409);
}
function timestamp(value, now, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now) fail(`Use a valid ${label} time that is not in the future.`);
  return new Date(value).toISOString();
}
function validateLeg(leg, games) {
  keys(leg, ['gameId', 'market', 'side', 'line', 'selection']);
  const game = games.find(game => game.id === leg.gameId);
  if (!game || !SOCIAL_MARKETS.includes(leg.market)) fail('Choose a scheduled matchup and supported market.');
  const line = leg.line ?? null;
  if (leg.market === 'prop') {
    if (!cleanText(leg.side, 120, 1) || !cleanText(leg.selection, 240, 2) || (line !== null && (!Number.isFinite(line) || Math.abs(line) > 10000 || !Number.isInteger(line * 2)))) fail('Describe the player prop and its exact selection.');
  } else {
    if (!(leg.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(leg.side) || !Number.isFinite(line) || !Number.isInteger(line * 2) || (leg.market === 'spread' ? Math.abs(line) > 100 : line < 0 || line > 200)) fail('Check the side and half-point spread or total.');
  }
  const signed = value => value > 0 ? `+${value}` : String(value);
  const selection = leg.market === 'prop' ? leg.selection.trim() : leg.market === 'spread' ? `${game[leg.side]} ${signed(line)}` : `${leg.side === 'over' ? 'Over' : 'Under'} ${line}`;
  return { gameId: leg.gameId, market: leg.market, side: leg.side.trim(), line, selection };
}
const createFields = ['season', 'week', 'kind', 'origin', 'legs', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord', 'notes'];
function terms(body, games, now) {
  scope(body);
  games = scopedGames(games, body);
  const origin = body.origin ?? 'tracked';
  if (!['single', 'parlay'].includes(body.kind) || !['tracked', 'virtual'].includes(origin) || !Array.isArray(body.legs) || (body.kind === 'single' ? body.legs.length !== 1 : body.legs.length < 2 || body.legs.length > 20)) fail('Choose one single or a parlay with 2–20 legs.');
  const legs = body.legs.map(leg => validateLeg(leg, games));
  const fingerprints = legs.map(leg => JSON.stringify(leg));
  if (new Set(fingerprints).size !== legs.length) fail('A parlay cannot repeat the same leg.');
  const odds = body.odds ?? null, stakeUnits = body.stakeUnits ?? null, source = body.source ?? '', notes = body.notes ?? '';
  if (!american(odds) || !stake(stakeUnits) || !cleanText(source, 120) || !cleanText(notes, 500) || (body.countsForRecord !== undefined && typeof body.countsForRecord !== 'boolean')) fail('Check the saved American odds, units, public note and source.');
  const quotedAt = timestamp(body.quotedAt, now, 'quote'), placedAt = timestamp(body.placedAt, now, 'placement');
  if (origin === 'virtual') {
    if (body.kind !== 'single' || legs.some(leg => leg.market === 'prop') || odds === null || stakeUnits === null || !Number.isInteger(stakeUnits * 2) || source.trim().length < 2 || !quotedAt) fail('Virtual picks require a quoted spread or total, saved odds and half-unit stake.');
    beforeKickoff(legs, games, now);
  }
  return { season: body.season, week: body.week, kind: body.kind, origin, legs, odds, stakeUnits, source: source.trim(), notes: notes.trim(), quotedAt, placedAt, countsForRecord: body.countsForRecord ?? true };
}
function beforeKickoff(legs, games, now) {
  if (legs.some(leg => {
    const game = games.find(game => game.id === leg.gameId), kickoff = Date.parse(game?.kickoff ?? game?.kickoffAt);
    return !Number.isFinite(kickoff) || now >= kickoff;
  })) fail('One or more legs have started or do not have a verified kickoff.', 409);
}
function virtualUniqueness(state, entry, except = null) {
  if (entry.origin !== 'virtual') return;
  if (state.entries.some(other => other.id !== except && other.ownerId === entry.ownerId && other.origin === 'virtual' && other.season === entry.season && other.week === entry.week && other.legs.some(leg => entry.legs.some(next => next.gameId === leg.gameId && next.market === leg.market)))) fail('You already have a virtual pick for this matchup and market.', 409);
}
function signature(action, body) {
  const { requestId, ...payload } = body;
  return JSON.stringify(canonical({ action, payload }));
}
export function findSocialReceipt(state, { actorId, action, body }) {
  checkedState(state);
  if (!identity(actorId) || !object(body) || !UUID.test(body.requestId || '')) fail('A signed-in player and unique request ID are required.');
  const existing = state.receipts.find(receipt => receipt.actorId === actorId && receipt.requestId === body.requestId);
  if (existing && (existing.action !== action || existing.signature !== signature(action, body))) fail('This request ID was already used for different content. Refresh before saving.', 409);
  return existing ? structuredClone(existing) : null;
}

/** Pure mutation: the input state is never modified, including on validation errors. */
export function applySocialMutation(state, { actorId, action, body, games = [], now = Date.now(), uuid = () => globalThis.crypto.randomUUID() }) {
  checkedState(state);
  const nowMs = time(now), catalog = gameList(games);
  if (!Number.isFinite(nowMs)) fail('A valid server time is required.');
  if (!['create', 'tail', 'correct', 'settle', 'include'].includes(action)) fail('This bet action is not supported.');
  if (findSocialReceipt(state, { actorId, action, body })) return structuredClone(state);
  if (state.audit.length >= 20000 || state.receipts.length >= 20000 || (['create', 'tail'].includes(action) && state.entries.length >= 2000)) fail('The tracker has reached its record limit.', 409);
  const at = new Date(nowMs).toISOString(), common = ['requestId', 'season', 'week'];
  let before = null, after;
  if (action === 'create') {
    keys(body, ['requestId', ...createFields]);
    after = { id: uuid(), ownerId: actorId, ...terms(body, catalog, nowMs), recordedAt: at, updatedAt: at, settledAt: null, outcome: 'pending', actualReturnUnits: null, settlementSource: null, sourceEntryId: null, rootEntryId: null, revision: 1 };
    virtualUniqueness(state, after);
  } else if (action === 'tail') {
    keys(body, [...common, 'sourceEntryId', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord', 'origin', 'notes']);
    const source = state.entries.find(entry => entry.id === body.sourceEntryId);
    if (!source) fail('The bet you want to tail is unavailable.', 404);
    matchingScope(body, source);
    if (source.ownerId === actorId || source.outcome !== 'pending' || state.entries.some(entry => entry.ownerId === actorId && entry.sourceEntryId === source.id)) fail('This bet cannot be tailed again by this player.', 409);
    beforeKickoff(source.legs, scopedGames(catalog, source), nowMs);
    if (body.odds == null || body.stakeUnits == null || !cleanText(body.source, 120, 2) || !body.quotedAt) fail('Review your own odds, stake, source and quote time before tailing.');
    const entryTerms = terms({ ...body, season: source.season, week: source.week, kind: source.kind, legs: source.legs, origin: body.origin ?? 'tracked' }, catalog, nowMs);
    after = { id: uuid(), ownerId: actorId, ...entryTerms, recordedAt: at, updatedAt: at, settledAt: null, outcome: 'pending', actualReturnUnits: null, settlementSource: null, sourceEntryId: source.id, rootEntryId: source.rootEntryId ?? source.id, revision: 1 };
    virtualUniqueness(state, after);
  } else {
    keys(body, action === 'correct' ? ['requestId', 'entryId', 'revision', 'reason', ...createFields] : [...common, 'entryId', 'revision', 'reason', ...(action === 'settle' ? ['outcome', 'actualReturnUnits'] : ['countsForRecord'])]);
    before = state.entries.find(entry => entry.id === body.entryId);
    if (!before || before.ownerId !== actorId) fail('This bet is unavailable for changes.', 404);
    matchingScope(body, before);
    if (!revision(body.revision) || body.revision !== before.revision) fail('This bet changed on another device. Refresh before saving.', 409);
    if (!cleanText(body.reason, 300, 3)) fail('Add a short reason for this change.');
    after = { ...structuredClone(before), revision: before.revision + 1, updatedAt: at };
    if (action === 'correct') {
      if (before.outcome !== 'pending') fail('Settled terms cannot be rewritten. Correct the reported result separately.', 409);
      if (before.origin === 'virtual') beforeKickoff(before.legs, scopedGames(catalog, before), nowMs);
      const corrected = terms(body, catalog, nowMs);
      if (corrected.origin !== before.origin || corrected.season !== before.season || corrected.week !== before.week) fail('A correction cannot change a bet’s week or origin.');
      if (before.sourceEntryId && JSON.stringify(corrected.legs) !== JSON.stringify(before.legs)) fail('A tailed bet keeps its copied selections. Create a separate bet for different legs.');
      Object.assign(after, corrected);
      virtualUniqueness(state, after, after.id);
    } else if (action === 'include') {
      if (typeof body.countsForRecord !== 'boolean') fail('Choose whether this bet counts in records.');
      after.countsForRecord = body.countsForRecord;
    } else {
      if (before.origin !== 'tracked') fail('Virtual picks require a verified automatic final-score feed; manual settlement is unavailable.', 409);
      const actualReturnUnits = body.actualReturnUnits ?? null;
      if (!SOCIAL_OUTCOMES.includes(body.outcome) || !returns(actualReturnUnits) || (actualReturnUnits !== null && before.stakeUnits === null) || (body.outcome === 'pending' && actualReturnUnits !== null)) fail('Check the reported outcome and actual return in units.');
      if (actualReturnUnits !== null && ((body.outcome === 'win' && actualReturnUnits <= before.stakeUnits) || (body.outcome === 'loss' && actualReturnUnits !== 0) || (['push', 'void'].includes(body.outcome) && actualReturnUnits !== before.stakeUnits))) fail('The actual returned units do not match this outcome.');
      Object.assign(after, { outcome: body.outcome, actualReturnUnits, settledAt: body.outcome === 'pending' ? null : at, settlementSource: body.outcome === 'pending' ? null : 'user_reported' });
    }
  }
  if (!identity(after.id) || state.entries.some(entry => entry.id === after.id && (!before || entry.id !== before.id))) fail('A unique bet ID is required.', 409);
  const next = structuredClone(state);
  if (before) next.entries[next.entries.findIndex(entry => entry.id === before.id)] = after;
  else next.entries.push(after);
  next.audit.push({ id: uuid(), actorId, action, entryId: after.id, at, reason: body.reason?.trim() ?? null, before: before ? structuredClone(before) : null, after: structuredClone(after) });
  next.receipts.push({ actorId, requestId: body.requestId, action, signature: signature(action, body), entryId: after.id });
  return next;
}

export function socialPotentialProfit(entry) {
  if (!stake(entry.stakeUnits) || entry.stakeUnits === null || !american(entry.odds) || entry.odds === null) return null;
  return round(entry.stakeUnits * (entry.odds > 0 ? entry.odds / 100 : 100 / -entry.odds));
}
function accounting(entry) {
  if (!['win', 'loss', 'push'].includes(entry.outcome) || !stake(entry.stakeUnits) || entry.stakeUnits === null) return null;
  if (returns(entry.actualReturnUnits) && entry.actualReturnUnits !== null) return { stake: entry.stakeUnits, net: round(entry.actualReturnUnits - entry.stakeUnits), basis: 'reported_return' };
  if (entry.outcome === 'loss') return { stake: entry.stakeUnits, net: -entry.stakeUnits, basis: 'saved_stake' };
  if (entry.outcome === 'push') return { stake: entry.stakeUnits, net: 0, basis: 'saved_stake' };
  const profit = socialPotentialProfit(entry);
  return profit === null ? null : { stake: entry.stakeUnits, net: profit, basis: 'saved_odds' };
}
export function summarizeSocialBets(entries) {
  const included = entries.filter(entry => entry.countsForRecord !== false), settled = included.map(accounting).filter(Boolean);
  const count = outcome => included.filter(entry => entry.outcome === outcome).length;
  const wins = count('win'), losses = count('loss'), pushes = count('push');
  const settledStakeUnits = round(settled.reduce((sum, row) => sum + row.stake, 0));
  const netUnits = settled.length ? round(settled.reduce((sum, row) => sum + row.net, 0)) : null;
  const qualificationUnits = round(included.reduce((sum, entry) => sum + (entry.stakeUnits ?? 0), 0));
  const weekly = new Map();
  for (const entry of included) {
    const key = `${entry.ownerId}-${entry.season}-${entry.week}`, row = weekly.get(key) ?? { ownerId: entry.ownerId, season: entry.season, week: entry.week, bets: 0, units: 0 };
    row.bets += 1; row.units = round(row.units + (entry.stakeUnits ?? 0)); weekly.set(key, row);
  }
  const weeklyQualifications = [...weekly.values()].sort((a, b) => a.season - b.season || a.week - b.week).map(row => ({ ...row, qualified: row.bets >= 3 || row.units >= 3 }));
  return { bets: included.length, wins, losses, pushes, voids: count('void'), pending: count('pending'), record: `${wins}-${losses}-${pushes}`, winRatePercent: wins + losses ? round(wins / (wins + losses) * 100) : null,
    stakeUnits: qualificationUnits, settledStakeUnits, netUnits, roiPercent: settledStakeUnits ? round(netUnits / settledStakeUnits * 100) : null, roiSampleCount: settled.length,
    incompleteCount: included.filter(entry => entry.stakeUnits === null || entry.odds === null).length, excludedCount: entries.length - included.length,
    roiExcludedCount: included.length - settled.length, qualificationBets: included.length, qualificationUnits, qualified: weeklyQualifications.length === 1 ? weeklyQualifications[0].qualified : null, weeklyQualifications };
}

const PUBLIC_FIELDS = ['id', 'ownerId', 'season', 'week', 'kind', 'origin', 'legs', 'odds', 'stakeUnits', 'source', 'notes', 'quotedAt', 'placedAt', 'recordedAt', 'updatedAt', 'settledAt', 'outcome', 'actualReturnUnits', 'settlementSource', 'sourceEntryId', 'rootEntryId', 'countsForRecord', 'revision'];
const publicEntry = entry => entry ? Object.fromEntries(PUBLIC_FIELDS.map(field => [field, structuredClone(entry[field] ?? null)])) : null;
const labelFor = (profiles, id) => {
  const profile = Array.isArray(profiles) ? profiles.find(profile => (profile.id ?? profile.userId) === id) : profiles?.[id];
  return typeof profile === 'string' ? profile : profile?.displayName ?? profile?.display_name ?? profile?.name ?? 'Player';
};
function matches(entry, filters, following, games) {
  games = scopedGames(games, entry);
  if (filters.playerId && filters.playerId !== 'all' && entry.ownerId !== filters.playerId) return false;
  for (const key of ['kind', 'origin']) if (filters[key] && filters[key] !== 'all' && (key === 'origin' && filters.origin === 'tailed' ? !entry.sourceEntryId : entry[key] !== filters[key])) return false;
  if (filters.outcome && filters.outcome !== 'all' && (filters.outcome === 'settled' ? !['win', 'loss', 'push', 'void'].includes(entry.outcome) : entry.outcome !== filters.outcome)) return false;
  if (filters.market && filters.market !== 'all' && !entry.legs.some(leg => leg.market === filters.market)) return false;
  if (filters.following && !following.includes(entry.ownerId)) return false;
  if (filters.includeParlays === false && entry.kind === 'parlay') return false;
  if (filters.includeTailed === false && entry.sourceEntryId) return false;
  if (filters.includeTracked === false && entry.origin === 'tracked') return false;
  if (filters.counts === 'included' && entry.countsForRecord === false || filters.counts === 'excluded' && entry.countsForRecord !== false) return false;
  if (filters.team && filters.team !== 'all' && !entry.legs.some(leg => {
    const game = games.find(game => game.id === leg.gameId);
    return [game?.away, game?.home].some(team => String(team ?? '').toLowerCase() === String(filters.team).toLowerCase());
  })) return false;
  return true;
}

/** One filtered public projection feeds the tracker and weekly Unit Betting view. */
export function socialView(state, { actorId, profiles = [], games = [], season = null, week = null, filters = {}, following = [], now = Date.now() } = {}) {
  checkedState(state);
  const catalog = gameList(games), nowMs = time(now), followed = Array.isArray(following) ? following : [];
  const scoped = state.entries.filter(entry => (season == null || entry.season === season) && (week == null || entry.week === week));
  const filtered = scoped.filter(entry => matches(entry, filters, followed, catalog));
  const entries = filtered.map(entry => {
    const result = publicEntry(entry), entryGames = scopedGames(catalog, entry);
    const account = accounting(entry), potentialProfitUnits = socialPotentialProfit(entry);
    let preKickoff = true; try { beforeKickoff(entry.legs, entryGames, nowMs); } catch { preKickoff = false; }
    return { ...result, ownerName: labelFor(profiles, entry.ownerId), sourceOwnerName: entry.sourceEntryId ? labelFor(profiles, state.entries.find(source => source.id === entry.sourceEntryId)?.ownerId) : null,
      audit: state.audit.filter(event => event.entryId === entry.id).map(event => ({ action: event.action, at: event.at, reason: event.reason, before: publicEntry(event.before), after: publicEntry(event.after) })),
      tailCount: state.entries.filter(tail => tail.sourceEntryId === entry.id).length, canTail: Boolean(actorId && actorId !== entry.ownerId && entry.outcome === 'pending' && preKickoff && !state.entries.some(tail => tail.ownerId === actorId && tail.sourceEntryId === entry.id)),
      netUnits: account?.net ?? null, accountingBasis: account?.basis ?? null, potentialProfitUnits, potentialReturnUnits: potentialProfitUnits === null ? null : round(entry.stakeUnits + potentialProfitUnits),
      provenance: entry.origin === 'virtual' ? (entry.settlementSource === 'automatic_final' ? 'Virtual units; settled from the verified final score' : 'Virtual units; awaiting verified automatic results') : 'User-reported external bet', lateEntry: entry.legs.some(leg => {
        const game = entryGames.find(game => game.id === leg.gameId), kickoff = Date.parse(game?.kickoff ?? game?.kickoffAt);
        return Number.isFinite(kickoff) && Date.parse(entry.recordedAt) >= kickoff;
      }) };
  }).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
  const ownerIds = [...new Set(filtered.map(entry => entry.ownerId))];
  const leaderboard = ownerIds.map(ownerId => ({ ownerId, displayName: labelFor(profiles, ownerId), ...summarizeSocialBets(filtered.filter(entry => entry.ownerId === ownerId)) }))
    .sort((a, b) => (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity) || (b.netUnits ?? -Infinity) - (a.netUnits ?? -Infinity) || a.displayName.localeCompare(b.displayName));
  const running = new Map(), chart = [];
  for (const entry of [...filtered].sort((a, b) => (a.settledAt ?? a.recordedAt).localeCompare(b.settledAt ?? b.recordedAt) || a.id.localeCompare(b.id))) {
    const account = entry.countsForRecord === false ? null : accounting(entry);
    if (!account) continue;
    const cumulativeNetUnits = round((running.get(entry.ownerId) ?? 0) + account.net); running.set(entry.ownerId, cumulativeNetUnits);
    chart.push({ entryId: entry.id, ownerId: entry.ownerId, ownerName: labelFor(profiles, entry.ownerId), at: entry.settledAt ?? entry.recordedAt, netUnits: account.net, cumulativeNetUnits });
  }
  const selections = new Map();
  for (const entry of filtered.filter(entry => entry.countsForRecord !== false)) for (const leg of entry.legs) {
    const key = `${entry.season}:${entry.week}:${leg.gameId}:${leg.market}:${leg.side}:${leg.line}:${leg.selection}`;
    const row = selections.get(key) ?? { label: `${leg.gameId} · ${leg.selection}`, gameId: leg.gameId, market: leg.market, count: 0, units: 0, parlayLegs: 0 };
    row.count += 1;
    // Allocate a parlay's one stake over its legs for visualization only.
    row.units = round(row.units + (entry.stakeUnits ?? 0) / entry.legs.length); row.parlayLegs += entry.kind === 'parlay' ? 1 : 0; selections.set(key, row);
  }
  const profileIds = Array.isArray(profiles) ? profiles.map(profile => profile.id ?? profile.userId).filter(Boolean) : Object.keys(profiles);
  return { season, week, entries, profiles: [...new Set([...profileIds, ...scoped.map(entry => entry.ownerId)])].map(id => ({ id, displayName: labelFor(profiles, id) })), leaderboard,
    summary: summarizeSocialBets(filtered), chart, selectionBreakdown: [...selections.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), following: [...followed], filters: structuredClone(filters),
    scope: 'The same filters apply to bets, records, ROI, comparisons and charts. Excluded bets stay visible when requested and never count in metrics.',
    roiFormula: 'Settled net units / settled units risked. Pending, void and incomplete returns are excluded. Saved combined odds price each parlay once; actual reported return overrides estimated odds returns.',
    selectionBreakdownNote: 'Counts show selected legs. Stake allocation divides each parlay stake equally among its legs for this chart only; it is not independent leg exposure.' };
}
