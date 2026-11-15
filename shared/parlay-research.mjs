// Compose only the server's already reveal-gated, source-checked assessments.
// This is a research shortlist, not a joint model or an executable sportsbook ticket.
export function parlayLegStatus(a, now) {
  if (!a?.quote) return 'Current quote unavailable';
  const expiry = Date.parse(a.quote.expiresAt), kickoff = Date.parse(a.kickoff), observed = Date.parse(a.quote.observedAt);
  if (![now, expiry, kickoff, observed].every(Number.isFinite) || observed > now) return 'Quote time unavailable';
  if (now >= kickoff) return 'Pregame closed';
  if (now >= expiry) return 'Quote expired';
  if (a.color !== 'yellow' || !a.evidence?.some(e => e.eligible && e.stance === 'support' && e.sourceUrl)) return 'Supporting research unavailable';
  if (a.hasConflicts || a.evidence.some(e => e.eligible && e.stance === 'oppose')) return 'Opposing evidence present';
  return null;
}
export function buildParlayIdeas(assessments, { now, size = 2, limit = 6, gameMode = 'all' } = {}) {
  if (!Number.isFinite(now) || ![2, 3].includes(size) || !['all', 'same-game', 'cross-game'].includes(gameMode)) return [];
  // Rank research completeness, never estimated win probability or value.
  const seen = new Set();
  const eligible = (assessments ?? []).flatMap(a => (a.offers?.length ? a.offers : [a.quote]).map(quote => ({ ...a, quote }))).filter(a => {
    const identity = JSON.stringify([a.gameId, a.selection, a.quote?.book]);
    if (!a.quote?.book || parlayLegStatus(a, now) || seen.has(identity)) return false;
    seen.add(identity); return true;
  }).sort((a, b) => researchCompleteness(b) - researchCompleteness(a)
    || Date.parse(b.quote.observedAt) - Date.parse(a.quote.observedAt) || a.id.localeCompare(b.id));
  const ideas = [], max = Math.max(0, Math.min(12, limit));
  function compatible(a, b) {
    if (a.quote.book !== b.quote.book) return false;
    // One selection per identified player, including alternate lines/opposite sides.
    if (a.selection?.playerId && a.selection.playerId === b.selection?.playerId) return false;
    if (gameMode === 'cross-game' && a.gameId === b.gameId) return false;
    if (gameMode === 'same-game' && a.gameId !== b.gameId) return false;
    // Same-game composition is scoped to different, identified players only.
    // Do not infer compatibility for team markets or anonymous prop selections.
    if (a.gameId === b.gameId && [a, b].some(x => x.selection?.market !== 'prop' || !x.selection?.playerId)) return false;
    const marketA = a.selection?.key?.replace(/_alternate$/, ''), marketB = b.selection?.key?.replace(/_alternate$/, '');
    // Only one player can be the first (or last) touchdown scorer in a game.
    // Exclude this pairing conservatively regardless of side/format.
    if (a.gameId === b.gameId && marketA === marketB && ['player_1st_td', 'player_last_td'].includes(marketA)) return false;
    return true;
  }
  function choose(pool, start, legs) {
    if (ideas.length >= max) return;
    if (legs.length === size) {
      const gameCount = new Set(legs.map(a => a.gameId)).size;
      const hasSameGame = gameCount < legs.length;
      const data = legs.flatMap(a => a.evidence.filter(e => e.eligible).map(e => e.datasetId).filter(Boolean));
      ideas.push({ id: `${legs[0].quote.book}:${legs.map(a => a.id).join('::')}`, legs, book: legs[0].quote.book, source: legs[0].quote.source,
        expiresAt: new Date(Math.min(...legs.map(a => Date.parse(a.quote.expiresAt)))).toISOString(),
        gameType: gameCount === 1 ? 'same-game' : hasSameGame ? 'mixed-game' : 'cross-game',
        sharedEvidence: new Set(data).size < data.length,
        rankingLabel: 'Research completeness, not win probability',
        why: legs.map(a => a.evidence.find(e => e.eligible && e.stance === 'support')?.statement).filter(Boolean),
        risks: [...new Set(['A single losing leg loses the parlay. Different games do not prove independence.',
          ...(hasSameGame ? ['Same-game legs are correlated: shared game script, pace and player usage can move outcomes together or against one another.', 'Individual quotes do not confirm this sportsbook accepts the combination. Get its actual same-game price; multiplying leg odds is not a valid quote.'] : []),
          'No calibrated joint probability or verified sportsbook parlay price is available.',
          ...legs.flatMap(a => a.evidence.filter(e => e.eligible).flatMap(e => e.assumptions ?? []))])],
        combinedOdds: null, probability: null });
      return;
    }
    const available = pool.slice(start).filter(a => legs.every(b => compatible(a, b)));
    if (available.length < size - legs.length) return;
    const identities = new Set(available.map(a => a.selection?.playerId || `game:${a.gameId}`));
    if (identities.size < size - legs.length) return;
    if (gameMode === 'cross-game' && new Set(available.map(a => a.gameId)).size < size - legs.length) return;
    for (let i = start; i < pool.length && ideas.length < max; i++) {
      const a = pool[i];
      if (!legs.every(b => compatible(a, b))) continue;
      choose(pool, i + 1, [...legs, a]);
    }
  }
  const byBook = new Map();
  for (const a of eligible) {
    const poolKey = JSON.stringify([a.quote.book, gameMode === 'same-game' ? a.gameId : null]);
    if (!byBook.has(poolKey)) byBook.set(poolKey, []);
    byBook.get(poolKey).push(a);
  }
  for (const pool of byBook.values()) {
    choose(pool, 0, []);
    if (ideas.length >= max) break;
  }
  return ideas;
}
export function propCategory(a) {
  const key = a.selection?.key ?? '';
  if (/td|touchdown/.test(key)) return 'Touchdowns';
  if (/pass/.test(key)) return 'Passing';
  if (/rush/.test(key)) return 'Rushing';
  if (/receiv|reception/.test(key)) return 'Receiving';
  return 'Other props';
}

function researchCompleteness(a) {
  const support = (a.evidence ?? []).filter(e => e.eligible && e.stance === 'support');
  return new Set(support.map(e => e.datasetId)).size * 100 + Math.min(40, support.reduce((n, e) => n + Math.min(8, e.sample?.count ?? 0), 0));
}
