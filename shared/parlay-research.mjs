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
  // Rank research completeness, never estimated win probability or value.
  const seen = new Set();
  const eligible = (assessments ?? []).flatMap(a => (a.offers?.length ? a.offers : [a.quote]).map(quote => ({ ...a, quote }))).filter(a => {
    const identity = JSON.stringify([a.gameId, a.selection, a.quote?.book]);
    if (!a.quote?.book || parlayLegStatus(a, now) || seen.has(identity)) return false;
    seen.add(identity); return true;
  }).sort((a, b) => researchCompleteness(b) - researchCompleteness(a)
    || Date.parse(b.quote.observedAt) - Date.parse(a.quote.observedAt) || a.id.localeCompare(b.id));
  const ideas = [], max = Math.max(0, Math.min(12, limit));
  function choose(pool, start, legs) {
    if (ideas.length >= max) return;
    if (legs.length === size) {
      const data = legs.flatMap(a => a.evidence.filter(e => e.eligible).map(e => e.datasetId).filter(Boolean));
      ideas.push({ id: `${legs[0].quote.book}:${legs.map(a => a.id).join('::')}`, legs, book: legs[0].quote.book, source: legs[0].quote.source,
        expiresAt: new Date(Math.min(...legs.map(a => Date.parse(a.quote.expiresAt)))).toISOString(),
        sharedEvidence: new Set(data).size < data.length,
        rankingLabel: 'Research completeness, not win probability',
        why: legs.map(a => a.evidence.find(e => e.eligible && e.stance === 'support')?.statement).filter(Boolean),
        risks: [...new Set(['A single losing leg loses the parlay. Different games do not prove independence.',
          'No calibrated joint probability or verified sportsbook parlay price is available.',
          ...legs.flatMap(a => a.evidence.filter(e => e.eligible).flatMap(e => e.assumptions ?? []))])],
        combinedOdds: null, probability: null });
      return;
    }
    // Bound unsuccessful search by remaining game diversity, not by discarding
    // all lower-ranked games or common-book alternatives before composition.
    const available = pool.slice(start).filter(a => !legs.some(b => b.gameId === a.gameId ||
      a.selection?.playerId && b.selection?.playerId === a.selection.playerId));
    if (new Set(available.map(a => a.gameId)).size < size - legs.length) return;
    for (let i = start; i < pool.length && ideas.length < max; i++) {
      const a = pool[i];
      if (legs.some(b => b.quote.book !== a.quote.book || b.gameId === a.gameId ||
        a.selection?.playerId && b.selection?.playerId === a.selection.playerId)) continue;
      choose(pool, i + 1, [...legs, a]);
    }
  }
  const byBook = new Map();
  for (const a of eligible) {
    if (!byBook.has(a.quote.book)) byBook.set(a.quote.book, []);
    byBook.get(a.quote.book).push(a);
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

// Weekly research priorities, not a probability model. Consume only the API's
// already reveal-gated assessments; never infer support from a price/model gap.
export function buildWeeklyProps(assessments, { now } = {}) {
  if (!Number.isFinite(now)) return [];
  const candidates = (assessments ?? []).flatMap(a => {
    if (a.selection?.market !== 'prop' || !a.selection.playerId || !a.selection.key) return [];
    const offers = (a.offers?.length ? a.offers : [a.quote]).filter(q => q?.book && q.source
      && Number.isFinite(q.odds) && Math.abs(q.odds) >= 100
      && !parlayLegStatus({ ...a, quote:q }, now)
      && now - Date.parse(q.observedAt) < 3600000);
    offers.sort((a,b) => b.odds-a.odds || Date.parse(b.observedAt)-Date.parse(a.observedAt) || a.book.localeCompare(b.book));
    if (!offers.length) return [];
    const coverage = new Map();
    for (const e of a.evidence ?? []) {
      if (!e.eligible || e.stance !== 'support' || !e.sourceUrl || !e.datasetId) continue;
      const sample = Number.isFinite(e.sample?.count) ? Math.max(0,Math.min(8,e.sample.count)) : 0;
      coverage.set(e.datasetId, Math.max(coverage.get(e.datasetId) ?? 0,sample));
    }
    return [{ ...a, quote:offers[0], offers, researchPriority:{ datasets:coverage.size,
      sampleCoverage:Math.min(40,[...coverage.values()].reduce((a,b)=>a+b,0)) } }];
  });
  candidates.sort((a,b) => b.researchPriority.datasets-a.researchPriority.datasets
    || b.researchPriority.sampleCoverage-a.researchPriority.sampleCoverage
    || Date.parse(b.quote.observedAt)-Date.parse(a.quote.observedAt)
    || a.id.localeCompare(b.id));
  const seen = new Set();
  return candidates.filter(a => {
    // Do not fill twenty places with the same player/stat at different lines,
    // books or sides. Keep the first by the disclosed research priority.
    const id = JSON.stringify([a.gameId,a.selection.playerId,a.selection.key.replace(/_alternate$/, ''),a.selection.unit]);
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0,20);
}

function researchCompleteness(a) {
  const support = (a.evidence ?? []).filter(e => e.eligible && e.stance === 'support');
  return new Set(support.map(e => e.datasetId)).size * 100 + Math.min(40, support.reduce((n, e) => n + Math.min(8, e.sample?.count ?? 0), 0));
}
