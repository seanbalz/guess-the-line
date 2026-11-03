// Server/job only. Page reads never call an odds provider. Every charged request
// needs a durable reservation against the EXISTING shared free budget first.
import { validResearchSelection, submittedResearchLink, ASSESSMENT_SOURCES } from '../shared/research-assessments.mjs';
const BOOKS = Object.freeze({ draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM' });
import { researchMarketUnit, researchQuoteMarketUnit } from '../shared/research-markets.mjs';
export { researchMarketUnit } from '../shared/research-markets.mjs';
const nameKey = s => typeof s === 'string' ? s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') : '';
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
async function boundedText(response, limit) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel(); throw new Error(); }
  const reader = response.body?.getReader(); if (!reader) throw new Error();
  let bytes = 0, text = ''; const decoder = new TextDecoder();
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error(); } text += decoder.decode(value, { stream: true }); }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
/** Match player identity to ONE eligible current-game roster row; names alone are
 * never stable identities, and an alternate line stays a separate selection. */
export function normalizeResearchEvent(event, { game, roster, now }) {
  if (event?.sport_key !== 'americanfootball_nfl' || event.home_team !== game.home || event.away_team !== game.away
    || Date.parse(event.commence_time) !== Date.parse(game.kickoff) || now >= Date.parse(game.kickoff) || event.completed === true) return [];
  const quotes = [];
  for (const book of event.bookmakers ?? []) {
    if (!Object.hasOwn(BOOKS, book.key)) continue;
    for (const m of book.markets ?? []) {
      const unit = researchQuoteMarketUnit(m.key ?? '');
      if (!unit || !iso(m.last_update) || Date.parse(m.last_update) > now || now - Date.parse(m.last_update) > 300000) continue;
      // NFL h2h here is the two-team market. A draw selection needs its own terms.
      if (m.key === 'h2h' && (m.outcomes?.length !== 2 || new Set(m.outcomes.map(o => o.name)).size !== 2 || m.outcomes.some(o => ![game.home, game.away].includes(o.name)))) continue;
      for (const o of m.outcomes ?? []) {
        if (['h2h', 'spreads', 'totals', 'alternate_spreads', 'alternate_totals'].includes(m.key)) {
          const market = m.key === 'h2h' ? 'moneyline' : m.key.includes('spreads') ? 'spread' : 'total';
          const side = market === 'total' ? ({ Over: 'over', Under: 'under' })[o.name] : o.name === game.home ? 'home' : o.name === game.away ? 'away' : null;
          const selection = { market, key: m.key, side, line: market === 'moneyline' ? null : o.point, unit };
          if (validResearchSelection(selection) && Number.isInteger(o.price) && Math.abs(o.price) >= 100 && Math.abs(o.price) <= 10000)
            quotes.push({ gameId: game.id, kickoff: game.kickoff, selection, provider: 'the-odds-api', providerEventId: event.id,
              book: book.key, source: BOOKS[book.key], odds: o.price, observedAt: new Date(m.last_update).toISOString(), capturedAt: new Date(now).toISOString() });
          continue;
        }
        const playerName = o.description ?? o.name;
        const identities = (roster ?? []).filter(p => p.gameId === game.id && p.current === true && p.availableAt && Date.parse(p.availableAt) <= now
          && Date.parse(p.availableAt) < Date.parse(game.kickoff) && [game.homeCode, game.awayCode].includes(p.team) && nameKey(p.name) === nameKey(playerName));
        if (identities.length !== 1) continue;
        const p = identities[0], side = ['Over', 'Under', 'Yes', 'No'].includes(o.name) ? o.name.toLowerCase() : ['player_1st_td', 'player_anytime_td', 'player_last_td'].includes(m.key) ? 'yes' : null;
        const selection = { market: 'prop', key: m.key, side, line: Number.isFinite(o.point) ? o.point : null, playerId: p.id, playerName: p.name, unit };
        if (!validResearchSelection(selection) || !Number.isInteger(o.price) || Math.abs(o.price) < 100 || Math.abs(o.price) > 10000) continue;
        quotes.push({ gameId: game.id, kickoff: game.kickoff, selection, provider: 'the-odds-api', providerEventId: event.id,
          book: book.key, source: BOOKS[book.key], odds: o.price, observedAt: new Date(m.last_update).toISOString(), capturedAt: new Date(now).toISOString() });
      }
    }
  }
  const keys = quotes.map(q => JSON.stringify([q.book, q.selection]));
  return quotes.filter((q, i) => keys.indexOf(keys[i]) === keys.lastIndexOf(keys[i]));
}
export async function collectResearchQuotes({ rpc, apiKey, requestId, season, week, game, eventId, markets, roster, fetchImpl = fetch, clock = Date.now }) {
  if (!apiKey || !game || !iso(game.kickoff) || clock() >= Date.parse(game.kickoff)
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId ?? '') || !Array.isArray(markets) || !markets.length || markets.length > 8
    || new Set(markets).size !== markets.length || markets.some(m => !researchQuoteMarketUnit(m))
    || markets.some(m => researchMarketUnit(m)) && (!Array.isArray(roster) || !roster.length)) throw new Error('Research quote configuration is invalid.');
  const lease = await rpc('gtl_begin_research_quotes', { p_request: requestId, p_season: season, p_week: week, p_game: game.id, p_markets: markets });
  if (lease.replay) return { status: 'already-attempted', quotes: [] };
  if (Date.parse(lease.expiresAt) <= clock()) throw new Error('Research quote reservation expired.');
  let quotes = [], quota = {}, error = null;
  try {
    const params = new URLSearchParams({ apiKey, regions: 'us', bookmakers: Object.keys(BOOKS).join(','), markets: markets.join(','), oddsFormat: 'american' });
    const response = await fetchImpl(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds?${params}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    quota = Object.fromEntries(['remaining', 'used', 'last'].map(k => { const v = response.headers.get(`x-requests-${k}`); return [k, /^\d{1,9}$/.test(v ?? '') ? Number(v) : null]; }));
    if (!response.ok || quota.last === null || quota.last > markets.length) throw new Error();
    const raw = await boundedText(response, 2000000);
    const event = JSON.parse(raw); if (event.id !== eventId) throw new Error();
    quotes = normalizeResearchEvent(event, { game, roster, now: clock() }).filter(q => markets.includes(q.selection.key));
  } catch { error = 'provider_unavailable'; }
  // Failure and uncertain replies still spend their conservative reservation.
  await rpc('gtl_finish_research_quotes', { p_request: requestId, p_lease: lease.lease, p_quota: quota, p_error: error, p_quotes: quotes });
  return { status: error ? 'unavailable' : 'collected', quotes };
}

/** Free discovery adapter. Only operator-verified publisher feeds may run. A
 * missing configuration does not masquerade as a successfully checked account.
 * It discovers canonical post URLs; unstructured text/images remain pending. */
export async function discoverResearchLinks(configs, { fetchImpl = fetch, now = Date.now() } = {}) {
  const results = [];
  for (const source of ASSESSMENT_SOURCES) {
    const config = configs.find(c => c.sourceId === source.id);
    const unavailable = { id: source.id, status: 'unavailable', checkedAt: null, links: [] };
    if (!config || config.free !== true || config.reusePermitted !== true || !iso(config.verifiedAt) || Date.parse(config.verifiedAt) > now || !config.permissionUrl?.startsWith('https://')) { results.push(unavailable); continue; }
    try {
      const url = new URL(config.feedUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !config.allowedOrigins?.includes(url.origin)
        || ['api.x.com', 'api.twitter.com', 'api.the-odds-api.com'].includes(url.hostname) || /^(localhost|\d|\[)/.test(url.hostname)
        || [...url.searchParams.keys()].some(k => /key|token|secret/i.test(k))) throw new Error();
      const response = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const body = await boundedText(response, 500000);
      const links = [...body.replaceAll('&amp;', '&').matchAll(/https:\/\/(?:www\.)?(?:x|twitter)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]{1,25}/g)].flatMap(m => {
        try { const link = submittedResearchLink(m[0]); return link.sourceId === source.id ? [link.url] : []; } catch { return []; }
      });
      results.push({ id: source.id, status: 'available', checkedAt: new Date(now).toISOString(), links: [...new Set(links)].slice(0, 50) });
    } catch { results.push({ ...unavailable, checkedAt: new Date(now).toISOString() }); }
  }
  return results;
}
