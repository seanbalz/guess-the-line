export const NOW = Date.parse('2026-10-30T20:00:00Z');
export const AT = '2026-10-30T19:55:00.000Z';
export const KICKOFF = '2026-10-31T18:00:00.000Z';
export const S = { market: 'prop', key: 'player_reception_yds', side: 'over', line: 65.5, playerId: 'fixture-player', playerName: 'Synthetic Receiver', unit: 'yards' };
export function fixture() {
  const board = { season: 2026, week: 8, games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: KICKOFF, started: false, spread: { visible: true }, total: { visible: true } }] };
  const evidence = { id: 'fixture-evidence', origin: 'external', family: 'matchup', statement: 'Synthetic coverage matchup supports the receiving over.',
    datasetId: 'fixture-charting', groupKey: 'receiver-zone', sourceId: 'rotobot_ai', sourceUrl: 'https://x.com/rotobot_ai/status/1000001',
    publishedAt: AT, observedAt: AT, asOf: AT, period: { from: '2026-09-01T00:00:00Z', to: '2026-10-29T00:00:00Z' },
    sample: { count: 40, unit: 'routes' }, metric: { name: 'Yards per route', value: 3.2, unit: 'yards', denominator: 'routes run against zone' },
    terms: null, stance: 'support', conditionsKnown: true, rights: 'permitted', primary: true, reproduced: false, assumptions: ['Synthetic starter plays.'] };
  const candidate = { id: 'fixture-over', gameId: 'SEA-DEN', kickoff: KICKOFF, title: 'Synthetic Receiver over 65.5 yards', selection: S,
    dependenciesComplete: true, dependencies: [{ gameId: 'SEA-DEN', market: 'both' }], evidence: [evidence] };
  const quote = { gameId: 'SEA-DEN', kickoff: KICKOFF, selection: S, provider: 'the-odds-api', book: 'draftkings', source: 'DraftKings', odds: -110, observedAt: AT, capturedAt: AT };
  const snapshot = { version: 1, season: 2026, week: 8, generatedAt: AT, sources: [{ id: 'rotobot_ai', status: 'available', checkedAt: AT }], candidates: [candidate], quotes: [quote] };
  return structuredClone({ board, snapshot, candidate, evidence, quote });
}
