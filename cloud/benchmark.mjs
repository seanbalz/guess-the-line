export const BENCHMARK_LEAGUE = 'g_a697831088e94d5eba8ca0fd51054076';
export const BENCHMARK_METHODS = { '/benchmark/freeze': ['POST'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class BenchmarkError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const ERRORS = {
  GTL_ODDS_FORBIDDEN: [403, 'Only the original league commissioner can freeze this benchmark.'],
  GTL_FORBIDDEN: [403, 'Your account has not been added to this league.'],
  GTL_BENCHMARK_SCOPE: [403, 'This game does not have the approved Week 5 spread benchmark policy.'],
  GTL_BENCHMARK_INPUT: [400, 'Provide the confirmed actual kickoff and its HTTPS evidence source. Kickoff must be within the expected window: no earlier than 30 minutes before the scheduled start, on the same Pacific date, and not in the future.'],
  GTL_BENCHMARK_FROZEN: [409, 'The benchmark is permanently frozen. Its kickoff, source, and lines cannot be changed.'],
  GTL_BENCHMARK_MISSING: [409, 'No complete eligible snapshot is available within five minutes before the confirmed actual kickoff.'],
  GTL_SLATE_CONFLICT: [409, 'The saved weekly schedule changed. Review it before freezing a benchmark.'],
};
export const providerBenchmarkError = message => ERRORS[message]
  ? new BenchmarkError(...ERRORS[message]) : new Error('Benchmark storage unavailable.');

export async function handleBenchmarkFreeze({ body, user, leagueId, service }) {
  if (leagueId !== BENCHMARK_LEAGUE) throw providerBenchmarkError('GTL_BENCHMARK_SCOPE');
  if (!body || Object.keys(body).some(k => !['requestId', 'actualKickoff', 'sourceURL'].includes(k)) || !UUID.test(body.requestId || '')
    || typeof body.actualKickoff !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(body.actualKickoff)
    || !Number.isFinite(Date.parse(body.actualKickoff)) || typeof body.sourceURL !== 'string' || body.sourceURL.length > 2048) throw providerBenchmarkError('GTL_BENCHMARK_INPUT');
  let source;
  try { source = new URL(body.sourceURL); } catch { throw providerBenchmarkError('GTL_BENCHMARK_INPUT'); }
  if (source.protocol !== 'https:' || source.username || source.password || source.hash || /\s/.test(body.sourceURL)) throw providerBenchmarkError('GTL_BENCHMARK_INPUT');
  if (!service?.freezeBenchmark) throw new BenchmarkError(503, 'The benchmark service is not available yet.');
  const result = await service.freezeBenchmark(user.id, leagueId, body.requestId, body.actualKickoff, body.sourceURL);
  // Never return private quote evidence or another mode through the write route.
  return { status: 'frozen', policyId: result.policyId, requestId: result.requestId,
    actualKickoff: result.actualKickoff, sourceURL: result.sourceURL, gameCount: result.gameCount, replayed: result.replayed === true };
}
