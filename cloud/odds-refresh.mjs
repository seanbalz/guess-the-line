import { handleOddsCollection } from './odds-collection.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const reasons = {
  GTL_ODDS_BUDGET: 'budget_guard', GTL_ODDS_PREFLIGHT_REQUIRED: 'budget_guard', GTL_ODDS_COOLDOWN: 'cooldown',
  GTL_ODDS_DAILY_LIMIT: 'daily_limit', GTL_ODDS_BUSY: 'collection_busy', GTL_SLATE_CONFLICT: 'slate_changed', GTL_ODDS_FORBIDDEN: 'commissioner_unavailable',
};
class RefreshError extends Error { constructor(code) { super('Scheduled refresh request failed.'); this.code = code; } }
const safe = result => ({ runId: result.runId, status: result.status, reason: result.reason ?? null });

export function createScheduledRefreshAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid refresh configuration.');
  return { async rpc(name, body) {
    if (!['gtl_claim_odds_refresh', 'gtl_complete_odds_refresh', 'gtl_begin_odds_collection', 'gtl_finish_odds_collection'].includes(name)) throw new Error('Invalid refresh operation.');
    const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      let code;
      try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
      throw new RefreshError(Object.hasOwn(reasons, code) || ['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED'].includes(code) ? code : 'UNAVAILABLE');
    }
    return response.json();
  } };
}

/** Reads a machine request body of exactly `{ runId }`; any other shape, size or delay fails with code INPUT. */
export async function readRunBody(request, timeoutMs) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new RefreshError('INPUT');
  const reader = request.body?.getReader(); if (!reader) throw new RefreshError('INPUT');
  const chunks = []; let length = 0; let timeout;
  const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => reject(new RefreshError('INPUT')), timeoutMs); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timedOut]); if (done) break;
      length += value.byteLength;
      if (length > 1024) { void reader.cancel().catch(() => {}); throw new RefreshError('INPUT'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); void reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed; try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new RefreshError('INPUT'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).length !== 1 || !UUID.test(parsed.runId || '')) throw new RefreshError('INPUT');
  return parsed;
}

// A machine-only endpoint: the platform JWT check is replaced ONLY here with a
// expiring one-run capability validated in SQL before any provider object is used.
export function createScheduledRefreshHandler({ service, provider, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid refresh request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const job = await service.rpc('gtl_claim_odds_refresh', { p_token: match[1], p_run: runId });
      if (job.replay) return json(safe(job));
      let reason = null;
      try {
        if (job.needsPreflight) {
          const checked = await handleOddsCollection({ route: '/odds/preflight', body: { requestId: job.preflightRequestId }, user: { id: job.actorId }, service, provider });
          if (checked.status !== 'succeeded') reason = 'preflight_failed';
        }
        if (!reason) {
          const collected = await handleOddsCollection({ route: '/odds/collect', body: { requestId: job.collectionRequestId }, user: { id: job.actorId }, service, provider });
          if (collected.status !== 'succeeded') reason = 'provider_failed';
        }
      } catch (error) { reason = reasons[error?.code] || 'provider_failed'; }
      const result = await service.rpc('gtl_complete_odds_refresh', { p_run: runId, p_claim: job.claim, p_reason: reason });
      return json(safe(result));
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid refresh request.' }, 400);
      return json({ error: 'The scheduled refresh service is temporarily unavailable.' }, 503);
    }
  };
}
