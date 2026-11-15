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
export function buildParlayIdeas(assessments, { now, size = 2, limit = 6 } = {}) {
  if (!Number.isFinite(now) || ![2, 3].includes(size)) return [];
  // Bound combinatorics without suggesting that schedule order is a value ranking.
  const seen = new Set();
  const eligible = (assessments ?? []).filter(a => {
    const identity = JSON.stringify([a.gameId, a.selection]);
    if (!a.quote?.book || parlayLegStatus(a, now) || seen.has(identity)) return false;
    seen.add(identity); return true;
  }).slice(0, 60);
  const ideas = [], max = Math.max(0, Math.min(12, limit));
  function choose(start, legs) {
    if (ideas.length >= max) return;
    if (legs.length === size) {
      const data = legs.flatMap(a => a.evidence.filter(e => e.eligible).map(e => e.datasetId).filter(Boolean));
      ideas.push({ id: legs.map(a => a.id).join('::'), legs, book: legs[0].quote.book, source: legs[0].quote.source,
        expiresAt: new Date(Math.min(...legs.map(a => Date.parse(a.quote.expiresAt)))).toISOString(),
        sharedEvidence: new Set(data).size < data.length,
        combinedOdds: null, probability: null });
      return;
    }
    for (let i = start; i < eligible.length && ideas.length < max; i++) {
      const a = eligible[i];
      if (legs.some(b => b.quote.book !== a.quote.book || b.gameId === a.gameId ||
        a.selection?.playerId && b.selection?.playerId === a.selection.playerId)) continue;
      choose(i + 1, [...legs, a]);
    }
  }
  choose(0, []); return ideas;
}
export function propCategory(a) {
  const key = a.selection?.key ?? '';
  if (/td|touchdown/.test(key)) return 'Touchdowns';
  if (/pass/.test(key)) return 'Passing';
  if (/rush/.test(key)) return 'Rushing';
  if (/receiv|reception/.test(key)) return 'Receiving';
  return 'Other props';
}
