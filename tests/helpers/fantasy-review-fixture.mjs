// A deterministic weekly review (D-57's shape, as shared/fantasy-review.mjs validateFantasyReview checks it) built from a
// committed snapshot: the first two scheduled players at QB, RB, WR and TE, each with a recorded result above or below
// its estimate and a season-average baseline. Fixture numbers only; no real player's result.
const scale = (stats, k) => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * k * 100) / 100 : value]));

export function reviewFixture(snapshot, { week = snapshot.week - 1, status = 'PROVISIONAL' } = {}) {
  const players = [];
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    snapshot.players.filter(p => p.position === position && p.weekly?.status === 'scheduled' && p.weekly.stats).slice(0, 2).forEach((p, i) => {
      players.push({ id: p.id, name: p.name, team: p.team, position, estimate: p.weekly.stats, actual: scale(p.weekly.stats, i ? 0.6 : 1.3), baseline: scale(p.weekly.stats, 1.1) });
    });
  }
  return { schemaVersion: 1, season: snapshot.season, week, generatedAt: snapshot.generatedAt, status,
    estimate: { file: `fixture-${snapshot.season}-week-${String(week).padStart(2, '0')}.json`, sha256: 'a'.repeat(64), generatedAt: snapshot.generatedAt, publishedBeforeFreeze: true },
    actuals: { url: 'https://example.invalid/fixture-stats.csv' }, players: players.sort((a, b) => a.id.localeCompare(b.id)), playedWithoutEstimate: 3 };
}
