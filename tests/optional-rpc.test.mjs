import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_OFF, FUNCTION_NOT_FOUND, createOptionalRpc, readOptional } from '../cloud/optional-rpc.mjs';
import { createSupabaseAdapter } from '../cloud/handler.mjs';

// Redesign build plan, section 3.3 and stage 4: PostgREST's PGRST202 (function not found) reads as "feature off",
// so an existing route never gains a hard dependency on a new RPC. Any other failure is an error the caller sees
// (createOptionalRpc) or a fallback (readOptional); neither carries a provider payload.
const fallback = Object.freeze({ fallback: true });
const parse = value => { if (value?.ok !== true) throw new Error('bad'); return { parsed: true }; };

test('PGRST202 is "feature off"; a success is parsed JSON; anything else rejects without the provider payload', async () => {
  assert.equal(FUNCTION_NOT_FOUND, 'PGRST202');
  const answer = response => createOptionalRpc(async () => response)('gtl_new_feature', {});
  assert.equal(await answer(Response.json({ code: 'PGRST202', message: 'Could not find the function' }, { status: 404 })), FEATURE_OFF);
  assert.deepEqual(await answer(Response.json({ ok: true })), { ok: true });
  for (const response of [
    Response.json({ code: 'PGRST202', message: 'secret detail' }, { status: 400 }),
    Response.json({ code: '42883', message: 'secret detail' }, { status: 404 }),
    Response.json({ code: '42501', message: 'secret detail' }, { status: 403 }),
    Response.json({ message: 'GTL_SOMETHING secret detail' }, { status: 400 }),
    new Response('<html>secret detail</html>', { status: 502 }),
    new Response('', { status: 404 }),
  ]) {
    await assert.rejects(answer(response), error => error.message === 'Optional feature unavailable.' && !/secret/.test(String(error.stack)));
  }
});

test('only a gtl_ function name is ever sent', async () => {
  let posts = 0;
  const call = createOptionalRpc(async () => { posts++; return Response.json({ ok: true }); });
  for (const name of ['', 'gtl_', 'gtl_live_rules?select=*', '../auth/v1/user', 'pg_sleep', 'GTL_LIVE_RULES', `gtl_${'a'.repeat(61)}`, null]) {
    await assert.rejects(call(name, {}), /Invalid optional feature/, String(name));
  }
  assert.equal(posts, 0);
  await call('gtl_live_rules');
  assert.equal(posts, 1);
});

test('readOptional falls back when unconfigured, off, failing or malformed, and never rejects', async () => {
  assert.equal(await readOptional(undefined, 'gtl_x', {}, { parse, fallback }), fallback);
  assert.equal(await readOptional(async () => FEATURE_OFF, 'gtl_x', {}, { parse, fallback }), fallback);
  assert.equal(await readOptional(async () => { throw new Error('down'); }, 'gtl_x', {}, { parse, fallback }), fallback);
  assert.equal(await readOptional(async () => ({ ok: false }), 'gtl_x', {}, { parse, fallback }), fallback);
  assert.equal(await readOptional(() => { throw new Error('sync throw'); }, 'gtl_x', {}, { parse, fallback }), fallback);
  const asked = [];
  assert.deepEqual(await readOptional(async (name, body) => { asked.push([name, body]); return { ok: true }; }, 'gtl_x', { p: 1 }, { parse, fallback }), { parsed: true });
  assert.deepEqual(asked, [['gtl_x', { p: 1 }]]);
});

test('the adapter\'s optional reader posts to the service-only RPC endpoint with server headers', async () => {
  const requests = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    return requests.length === 1 ? Response.json({ code: 'PGRST202', message: 'Could not find the function' }, { status: 404 }) : Response.json({ value: 1 });
  } });
  assert.equal(await adapter.optionalRpc('gtl_live_rules', {}), FEATURE_OFF);
  assert.deepEqual(await adapter.optionalRpc('gtl_live_rules', {}), { value: 1 });
  const [{ url, options }] = requests;
  assert.equal(url.href, 'https://project.supabase.co/rest/v1/rpc/gtl_live_rules');
  assert.equal(options.method, 'POST'); assert.equal(options.body, '{}'); assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.headers, { apikey: 'server-test-secret', Authorization: 'Bearer server-test-secret', 'Content-Type': 'application/json' });
});
