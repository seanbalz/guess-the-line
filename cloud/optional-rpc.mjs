// Optional RPCs (redesign build plan, section 3.3; stage 4). A migration can reach the hosted project after
// the gtl-api deploy that reads it, and its rollback can take a function away again, so an existing route
// must never gain a hard dependency on a new RPC. PostgREST answers a call to a function it cannot find with
// 404 and code PGRST202; this module reads exactly that answer as "feature off". New fields on old routes
// are read through readOptional, which falls back instead of failing the route.

/** PostgREST's code for "function not found" (not applied yet, rolled back, or a changed argument list). */
export const FUNCTION_NOT_FOUND = 'PGRST202';
/** What an optional RPC call resolves to when the function is not on the database. */
export const FEATURE_OFF = Object.freeze({ featureOff: true });
const NAME = /^gtl_[a-z0-9_]{1,60}$/;

/**
 * Adapter side. `post(name, body)` sends one service-role POST to /rest/v1/rpc/<name> and resolves to its
 * fetch Response. The returned caller resolves to the parsed JSON, or to FEATURE_OFF for PGRST202; any other
 * failure rejects with a generic error that carries no provider payload.
 */
export function createOptionalRpc(post) {
  return async function optionalRpc(name, body = {}) {
    if (typeof name !== 'string' || !NAME.test(name)) throw new Error('Invalid optional feature.');
    const response = await post(name, body);
    if (response.ok) return response.json();
    let code;
    try { code = (await response.json())?.code; } catch { /* No provider payload leaks. */ }
    if (response.status === 404 && code === FUNCTION_NOT_FOUND) return FEATURE_OFF;
    throw new Error('Optional feature unavailable.');
  };
}

/**
 * Handler side. Resolves to parse(result), or to `fallback` when no caller is configured, the function is
 * missing (feature off), the call fails, or parse throws on what came back. Never rejects, so an old route
 * answers exactly as it would without the new field's RPC.
 */
export async function readOptional(optionalRpc, name, body, { parse, fallback }) {
  if (typeof optionalRpc !== 'function') return fallback;
  try {
    const result = await optionalRpc(name, body);
    return result === FEATURE_OFF ? fallback : parse(result);
  } catch {
    return fallback;
  }
}
