// Research-first assessments. These are independent of guesses and scoring.
// No model is qualified in stage one: this module deliberately cannot emit green.
import { researchMarketUnit } from './research-markets.mjs';
import { RESEARCH_SOURCES } from './trends-research-sources.mjs';

export const ASSESSMENT_SOURCES = Object.freeze([
  ...RESEARCH_SOURCES.filter(s => s.id !== 'bookitwithtrent'),
  { id: '4thdownvip', name: '4thDown VIP', accountUrl: 'https://x.com/4thDownVIP' },
  { id: 'actionnetworkhq', name: 'Action Network', accountUrl: 'https://x.com/ActionNetworkHQ' },
  RESEARCH_SOURCES.find(s => s.id === 'bookitwithtrent'),
]);
export const ASSESSMENT_LABELS = Object.freeze({ green: 'Estimated value', yellow: 'Research lean', red: 'Evidence against', gray: 'Insufficient evidence' });
export const RESEARCH_MARKETS = Object.freeze(['spread', 'total', 'moneyline', 'prop']);
export const QUOTE_LIFETIME = Object.freeze({ spread: 21600000, total: 21600000, moneyline: 21600000, prop: 3600000 });
export const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 240) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const token = v => text(v, 100) && /^[a-zA-Z0-9_.:-]+$/.test(v);
const stamp = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)
  && Number(v.slice(11, 13)) < 24 && Number.isFinite(Date.parse(v))
  && new Date(`${v.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === v.slice(0, 10);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fail = () => { throw new TypeError('Invalid research snapshot.'); };
export function submittedResearchLink(value) {
  if (typeof value !== 'string' || value.length > 600) throw new TypeError('Use a post from a selected research source.');
  const url = new URL(value);
  const match = url.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/([0-9]{1,25})\/?$/);
  const sourceId = match?.[1]?.toLowerCase();
  if (url.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname) || url.username || url.password || url.port
    || !ASSESSMENT_SOURCES.some(s => s.id === sourceId)) throw new TypeError('Use a post from a selected research source.');
  return { sourceId, url: `https://x.com/${sourceId}/status/${match[2]}` };
}
export function validResearchSelection(s) {
  if (!object(s) || !RESEARCH_MARKETS.includes(s.market) || !text(s.key, 100) || !/^[a-z0-9_]+$/.test(s.key) || !text(s.unit, 60)) return false;
  if (s.market === 'spread') return s.unit === 'points' && ['spreads', 'alternate_spreads'].includes(s.key) && ['home', 'away'].includes(s.side) && finite(s.line) && Math.abs(s.line) <= 100 && Number.isInteger(s.line * 2);
  if (s.market === 'total') return s.unit === 'points' && ['totals', 'alternate_totals'].includes(s.key) && ['over', 'under'].includes(s.side) && finite(s.line) && s.line >= 0 && s.line <= 200 && Number.isInteger(s.line * 2);
  if (s.market === 'moneyline') return s.key === 'h2h' && s.unit === 'win' && ['home', 'away'].includes(s.side) && s.line === null;
  return researchMarketUnit(s.key) === s.unit && token(s.playerId) && text(s.playerName, 100)
    && ['over', 'under', 'yes', 'no'].includes(s.side) && (s.line === null ? ['yes', 'no'].includes(s.side) : finite(s.line) && s.line >= 0 && s.line <= 10000 && Number.isInteger(s.line * 2));
}
export const selectionKey = s => JSON.stringify([s.market, s.key, s.side, s.line, s.playerId ?? null, s.unit]);
const selection = s => ({ market: s.market, key: s.key, side: s.side, line: s.line, unit: s.unit, ...(s.market === 'prop' ? { playerId: s.playerId, playerName: s.playerName } : {}) });
export function validateAssessmentSnapshot(raw) {
  if (!object(raw) || raw.version !== 1 || !Number.isInteger(raw.season) || raw.season < 2000 || raw.season > 2100 || !Number.isInteger(raw.week) || raw.week < 1 || raw.week > 25
    || !stamp(raw.generatedAt) || !Array.isArray(raw.candidates) || raw.candidates.length > 500 || !Array.isArray(raw.quotes) || raw.quotes.length > 5000
    || !Array.isArray(raw.sources) || raw.sources.length > 8 || JSON.stringify(raw).length > 2000000) fail();
  const ids = new Set();
  for (const c of raw.candidates) {
    if (!object(c) || !token(c.id) || ids.has(c.id) || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(c.gameId) || !stamp(c.kickoff) || !text(c.title, 160) || !validResearchSelection(c.selection)
      || !Array.isArray(c.dependencies) || !c.dependencies.length || c.dependencies.length > 32
      || c.dependencies.some(d => !object(d) || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(d.gameId) || !['spread', 'total', 'both'].includes(d.market))
      || !Array.isArray(c.evidence) || c.evidence.length > 40) fail();
    ids.add(c.id);
    if (new Set(c.evidence.map(e => e?.id)).size !== c.evidence.length) fail();
    for (const e of c.evidence) if (!object(e) || !token(e.id) || !['external', 'computed'].includes(e.origin) || !['support', 'oppose', 'context'].includes(e.stance)
      || !text(e.statement, 1200) || !token(e.datasetId) || !token(e.groupKey) || !Array.isArray(e.assumptions) || e.assumptions.length > 20 || e.assumptions.some(s => !text(s, 240))) fail();
  }
  return structuredClone(raw);
}

/** A malformed/ambiguous claim stays pending, never a vote or a fabricated zero. */
export function reviewResearchEvidence(e, s, now, kickoff) {
  const reasons = [];
  if (e.rights !== 'permitted') reasons.push('source_reuse_unavailable');
  if (e.conditionsKnown !== true) reasons.push('conditions_unresolved');
  if (![e.publishedAt, e.observedAt, e.asOf, e.period?.from, e.period?.to].every(stamp)
    || Date.parse(e.period?.from) > Date.parse(e.period?.to) || Date.parse(e.period?.to) > Date.parse(e.asOf)
    || Date.parse(e.asOf) > Date.parse(e.publishedAt) || Date.parse(e.publishedAt) > Date.parse(e.observedAt)
    || Date.parse(e.observedAt) > now || Date.parse(e.asOf) >= kickoff || Date.parse(e.publishedAt) >= kickoff) reasons.push('source_time_unresolved');
  if (!Number.isSafeInteger(e.sample?.count) || e.sample.count < 1 || !text(e.sample?.unit, 60)) reasons.push('sample_unresolved');
  if (!text(e.metric?.name, 120) || !finite(e.metric?.value) || !text(e.metric?.unit, 60) || !text(e.metric?.denominator, 120)) reasons.push('metric_definition_unresolved');
  if (e.family === 'simulation' && (!e.terms || !validResearchSelection(e.terms))) reasons.push('simulation_terms_unresolved');
  if (e.terms && (!validResearchSelection(e.terms) || selectionKey(e.terms) !== selectionKey(s))) reasons.push('different_betting_terms');
  if (e.origin === 'external') {
    try { if (submittedResearchLink(e.sourceUrl).sourceId !== e.sourceId || e.sourceId === 'bookitwithtrent') reasons.push('source_identity_unresolved'); }
    catch { reasons.push('source_identity_unresolved'); }
    if (e.primary !== true) reasons.push('primary_source_unresolved');
    if (now - Date.parse(e.asOf) > 7 * 86400000) reasons.push('source_stale');
  } else if (e.reproduced !== true || !text(e.sourceUrl, 300) || !/^https:\/\//.test(e.sourceUrl) || !/^[a-f0-9]{64}$/.test(e.inputHash ?? '')) reasons.push('calculation_unverified');
  return { eligible: reasons.length === 0 && e.stance !== 'context', reasons };
}
export function usableResearchQuote(q, c, now) {
  return object(q) && q.provider === 'the-odds-api' && q.gameId === c.gameId && Date.parse(q.kickoff) === Date.parse(c.kickoff) && validResearchSelection(q.selection)
    && selectionKey(q.selection) === selectionKey(c.selection) && token(q.book) && text(q.source, 100)
    && Number.isInteger(q.odds) && Math.abs(q.odds) >= 100 && Math.abs(q.odds) <= 10000
    && stamp(q.observedAt) && stamp(q.capturedAt) && Date.parse(q.observedAt) <= Date.parse(q.capturedAt) && Date.parse(q.capturedAt) <= now
    && Date.parse(q.observedAt) < Date.parse(c.kickoff) && now < Date.parse(c.kickoff)
    && now - Date.parse(q.observedAt) < QUOTE_LIFETIME[c.selection.market];
}
const payout = price => price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
const accessible = (board, d) => {
  const g = board.games.find(g => g.id === d.gameId);
  return d.market === 'both' ? g?.spread?.visible === true && g?.total?.visible === true : g?.[d.market]?.visible === true;
};
export function accessibleResearchCandidate(board, c, gameId) {
  const g = board.games.find(g => g.id === c.gameId);
  const ownGate = c.selection.market === 'spread' ? 'spread' : c.selection.market === 'total' ? 'total' : 'both';
  return !!g && Date.parse(g.kickoff) === Date.parse(c.kickoff) && c.dependenciesComplete === true && (!gameId || g.id === gameId)
    && c.dependencies.every(d => accessible(board, d)) && accessible(board, { gameId: c.gameId, market: ownGate });
}
function projectEvidence(e, review) {
  if (e.rights !== 'permitted') return { id: e.id, stance: 'context', label: 'Source unavailable', eligible: false, reasons: review.reasons };
  let safeUrl = null;
  try { safeUrl = e.origin === 'external' ? submittedResearchLink(e.sourceUrl).url : new URL(e.sourceUrl).href;
    if (!safeUrl.startsWith('https://')) safeUrl = null; } catch { /* Pending source. */ }
  return { id: e.id, origin: e.origin, sourceId: token(e.sourceId) ? e.sourceId : null, sourceUrl: safeUrl, statement: e.statement, family: text(e.family, 80) ? e.family : 'research',
    label: e.origin === 'computed' ? 'GTL reproduced' : 'Source-reported · not independently reproduced',
    reproduced: e.reproduced === true, stance: e.stance, eligible: review.eligible, reasons: review.reasons,
    publishedAt: stamp(e.publishedAt) ? e.publishedAt : null, observedAt: stamp(e.observedAt) ? e.observedAt : null, asOf: stamp(e.asOf) ? e.asOf : null,
    period: e.period ? { from: stamp(e.period.from) ? e.period.from : null, to: stamp(e.period.to) ? e.period.to : null } : null,
    sample: e.sample ? { count: Number.isSafeInteger(e.sample.count) && e.sample.count >= 0 ? e.sample.count : null, unit: text(e.sample.unit, 60) ? e.sample.unit : null } : null,
    metric: e.metric ? { name: text(e.metric.name, 120) ? e.metric.name : null, value: finite(e.metric.value) ? e.metric.value : null,
      unit: text(e.metric.unit, 60) ? e.metric.unit : null, denominator: text(e.metric.denominator, 120) ? e.metric.denominator : null } : null,
    datasetId: e.datasetId, groupKey: e.groupKey, assumptions: e.assumptions };
}
/** Filters apply AFTER access checks. Closed data cannot affect order, counts, IDs or filters. */
export function buildResearchAssessments({ board, snapshot, now = Date.now(), gameId, market, color } = {}) {
  if (!object(board) || !Array.isArray(board.games) || !finite(now)) throw new TypeError('Invalid research scope.');
  const empty = { version: 1, season: board.season, week: board.week, now: new Date(now).toISOString(), generatedAt: null,
    status: 'unavailable', assessments: [], sources: ASSESSMENT_SOURCES.map(s => ({ ...s, status: 'unavailable', checkedAt: null })), model: { status: 'not-qualified' } };
  if (!snapshot) return empty;
  let data; try { data = validateAssessmentSnapshot(snapshot); } catch { return { ...empty, status: 'invalid-source' }; }
  if (data.season !== board.season || data.week !== board.week || Date.parse(data.generatedAt) > now) return empty;
  const rows = [];
  for (const c of data.candidates) {
    const g = board.games.find(g => g.id === c.gameId);
    if (!accessibleResearchCandidate(board, c, gameId)) continue;
    // Each claim's dependency list includes its own market. Moneyline/props can reveal
    // either Guess market through context, so both must be open until a narrower gate exists.
    const reviews = c.evidence.map(e => reviewResearchEvidence(e, c.selection, now, Date.parse(c.kickoff)));
    const evidence = c.evidence.map((e, i) => projectEvidence(e, reviews[i]));
    const support = evidence.filter(e => e.eligible && e.stance === 'support');
    const against = evidence.filter(e => e.eligible && e.stance === 'oppose');
    // Claims sharing a dataset/group cannot become independent confirmations.
    const groups = new Set([...support, ...against].map(e => e.datasetId));
    // A newer price or line at the same book supersedes that book's old offer.
    const related = data.quotes.filter(q => q?.selection?.market === c.selection.market && q.selection.key === c.selection.key
      && (q.selection.playerId ?? null) === (c.selection.playerId ?? null) && usableResearchQuote(q, { ...c, selection: q.selection }, now));
    const quotes = related.filter(q => usableResearchQuote(q, c, now) && !related.some(newer => newer.book === q.book
      && (Date.parse(newer.capturedAt) > Date.parse(q.capturedAt) || Date.parse(newer.capturedAt) === Date.parse(q.capturedAt) && Date.parse(newer.observedAt) > Date.parse(q.observedAt))));
    quotes.sort((a, b) => payout(b.odds) - payout(a.odds) || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.book.localeCompare(b.book));
    const quote = quotes[0];
    const closed = g.started === true || now >= Date.parse(g.kickoff) || g.final?.status === 'final';
    const tone = !quote || closed || !support.length && !against.length ? 'gray' : support.length ? 'yellow' : 'red';
    const reasons = [...(!quote ? ['current_quote_unavailable'] : []), ...(closed ? ['pregame_closed'] : []), ...(!support.length && !against.length ? ['supporting_evidence_unavailable'] : []),
      ...(support.length && against.length ? ['conflicting_evidence'] : [])];
    if (market && c.selection.market !== market || color && tone !== color) continue;
    rows.push({ id: c.id, gameId: c.gameId, kickoff: c.kickoff, title: c.title, selection: selection(c.selection), color: tone, label: ASSESSMENT_LABELS[tone], reasons,
      quote: quote ? { book: quote.book, source: quote.source, sourceUrl: 'https://the-odds-api.com/', odds: quote.odds, observedAt: quote.observedAt, capturedAt: quote.capturedAt,
        expiresAt: new Date(Math.min(Date.parse(c.kickoff), Date.parse(quote.observedAt) + QUOTE_LIFETIME[c.selection.market])).toISOString() } : null,
      evidence, evidenceGroups: groups.size, hasConflicts: support.length > 0 && against.length > 0 });
  }
  // Qualitative research is unranked: schedule/name order is not a fabricated edge score.
  rows.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.gameId.localeCompare(b.gameId) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return { ...empty, status: 'ready', generatedAt: data.generatedAt, assessments: rows, sources: empty.sources.map(s => {
    const state = data.sources.find(x => x.id === s.id);
    return { ...s, status: state?.status === 'available' && stamp(state.checkedAt) && Date.parse(state.checkedAt) <= now ? 'available' : 'unavailable', checkedAt: stamp(state?.checkedAt) && Date.parse(state.checkedAt) <= now ? state.checkedAt : null };
  }) };
}
