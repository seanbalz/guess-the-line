import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  FEED_BUCKET, FEED_FEATURES, MAX_FEED_BYTES, USAGE_TABLES, createFantasyFeedAdapter, createFantasyFeedIngestHandler, feedPath, indexPath, nextIndex, ownerOnlyText,
  readFeedBody, validateFeedFile,
} from '../cloud/fantasy-feed-ingest.mjs';

// D-59 fantasy feed ingest: a fake Storage service in memory; no hosted project, bucket or secret is touched.
const SECRET = 'a'.repeat(64);
const NOW = Date.parse('2026-10-26T20:00:00Z');
const sha = text => createHash('sha256').update(text).digest('hex');
function fakeStorage() {
  const objects = new Map(), puts = [];
  return {
    objects, puts,
    async put(path, bytes, { upsert }) {
      puts.push({ path, upsert });
      if (!upsert && objects.has(path)) return 'exists';
      objects.set(path, new TextDecoder().decode(bytes));
      return 'created';
    },
    async get(path) { return objects.has(path) ? new TextEncoder().encode(objects.get(path)) : null; },
  };
}
const file = (overrides = {}) => ({
  schemaVersion: 1, feature: 'usage', season: 2026, week: 8, generatedAt: '2026-10-26T19:00:00Z',
  sources: [{ name: 'nflverse', url: 'https://github.com/nflverse/nflverse-data', license: 'CC BY 4.0' }],
  data: { pw: { cols: ['id', 'season', 'week', 'snaps', 'tgt'], rows: [['00-0000001', 2026, 8, 61, 9]] } }, ...overrides,
});
const table = (cols, rows = []) => ({ pw: { cols, rows } });
const post = (body, { auth = `Bearer ${SECRET}`, type = 'application/json', url = 'https://x.supabase.co/functions/v1/gtl-fantasy-ingest', method = 'POST' } = {}) =>
  new Request(url, { method, headers: { ...(auth ? { authorization: auth } : {}), ...(type ? { 'content-type': type } : {}) }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const setup = (options = {}) => {
  const service = options.service ?? fakeStorage();
  return { service, handle: createFantasyFeedIngestHandler({ service, secret: SECRET, clock: () => NOW, ...options }) };
};
const call = async (handle, request) => { const response = await handle(request); return { status: response.status, body: await response.json(), headers: response.headers }; };
const index = service => JSON.parse(service.objects.get(indexPath(2026)));

test('only an authorized POST without a query string reaches the feed; a missing or malformed secret keeps it closed', async () => {
  const { handle, service } = setup();
  assert.equal((await call(handle, post(null, { method: 'GET' }))).status, 405);
  assert.equal((await call(handle, post(file(), { url: 'https://x.supabase.co/functions/v1/gtl-fantasy-ingest?x=1' }))).status, 400);
  for (const auth of [null, `Bearer ${'b'.repeat(64)}`, `Bearer ${SECRET.toUpperCase()}`, `Bearer ${SECRET}0`, SECRET, `Basic ${SECRET}`]) {
    const reply = await call(handle, post(file(), { auth }));
    assert.deepEqual([reply.status, reply.body], [401, { error: 'Unauthorized.' }], String(auth));
  }
  for (const secret of [undefined, '', 'short', 'A'.repeat(64), 'g'.repeat(64)]) {
    const closed = createFantasyFeedIngestHandler({ service, secret, clock: () => NOW });
    assert.equal((await call(closed, post(file(), { auth: `Bearer ${String(secret)}` }))).status, 503);
    assert.equal((await call(closed, post(file()))).status, 503, 'a request that matches no configured secret is still refused');
  }
  assert.equal(service.puts.length, 0);
});

test('the fantasy-feed off switch refuses uploads and stores nothing', async () => {
  const { handle, service } = setup({ featureOff: new Set(['fantasy-feed']) });
  const reply = await call(handle, post(file()));
  assert.deepEqual([reply.status, reply.body.code], [503, 'GTL_FEATURE_OFF']);
  assert.equal(service.puts.length, 0);
});

test('a file is stored once under its full SHA-256 and listed in the season index with its fixed audience', async () => {
  const { handle, service } = setup();
  const text = JSON.stringify(file());
  const reply = await call(handle, post(text));
  const digest = sha(text);
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.deepEqual(reply.body, { status: 'published', feature: 'usage', season: 2026, week: 8, audience: 'community', sha256: digest, path: `2026/usage/2026-usage-week-08.${digest}.json`, bytes: text.length });
  assert.equal(service.objects.get(reply.body.path), text, 'the stored bytes are the uploaded bytes');
  assert.deepEqual(service.puts, [{ path: reply.body.path, upsert: false }, { path: '2026/index.json', upsert: true }]);
  assert.deepEqual(index(service), { schemaVersion: 1, season: 2026, updatedAt: '2026-10-26T20:00:00.000Z', superseded: [],
    files: [{ feature: 'usage', season: 2026, week: 8, audience: 'community', path: reply.body.path, sha256: digest, bytes: text.length, generatedAt: '2026-10-26T19:00:00.000Z', publishedAt: '2026-10-26T20:00:00.000Z' }] });

  const again = await call(handle, post(text));
  assert.equal(again.body.status, 'unchanged');
  assert.equal(service.puts.length, 3, 'a replay leaves the stored file and does not rewrite the index');
  assert.deepEqual(service.puts[2], { path: reply.body.path, upsert: false });
});

test('a new version becomes current; the three newest superseded copies per feature and week stay listed', async () => {
  const { handle, service } = setup();
  const versions = [1, 2, 3, 4, 5].map(n => JSON.stringify(file({ data: table(['id', 'snaps'], [['p1', n]]) })));
  for (const text of versions) assert.equal((await call(handle, post(text))).body.status, 'published');
  await call(handle, post(file({ feature: 'rankings', week: null, data: { ros: [] } })));
  const listed = index(service);
  assert.deepEqual(listed.files.map(entry => [entry.feature, entry.week, entry.sha256, entry.audience]), [['rankings', null, listed.files[0].sha256, 'owner'], ['usage', 8, sha(versions[4]), 'community']]);
  assert.equal(listed.files[0].path, `2026/rankings/2026-rankings.${listed.files[0].sha256}.json`, 'a season-long file has no week in its name');
  assert.deepEqual(listed.superseded.map(entry => entry.sha256), [versions[3], versions[2], versions[1]].map(sha));
  assert.ok(listed.superseded.every(entry => entry.supersededAt === '2026-10-26T20:00:00.000Z'));
  assert.equal([...service.objects.keys()].filter(path => path.startsWith('2026/usage/')).length, 5, 'superseded files are never deleted');
});

test('the audience is fixed by feature: a file cannot name one, and a community file holds only allowlisted tables and columns', async () => {
  const { handle, service } = setup();
  assert.deepEqual((await call(handle, post({ ...file(), audience: 'community' }))).body, { error: 'Invalid fantasy feed file.', reason: 'envelope' });
  // The shapes of the real usage dashboard's FantasyPros table and league rosters, and the names its scripts use.
  const cases = [
    [{ fp: { cols: ['id', 'season', 'week', 'fmt', 'pr', 'proj', 'grade', 'owned'], rows: [] } }, 'tables'],
    [{ rosters: { cols: ['league', 'id', 'mine', 'owner'], rows: [] } }, 'owner_only'],
    [{ meta: { leagues: [] } }, 'tables'], [{ constructor: { cols: ['id'], rows: [] } }, 'tables'], [{}, 'tables'], [[table(['id'])], 'tables'],
    [table(['id', 'grade']), 'columns'], [table(['id', 'id']), 'columns'], [table([]), 'columns'], [{ pw: { cols: ['id'], rows: [], extra: 1 } }, 'tables'],
    [table(['id', 'snaps'], [['p1']]), 'rows'], [table(['id'], [[{ nested: 1 }]]), 'rows'], [table(['id'], [['x'.repeat(201)]]), 'rows'], [table(['id'], ['p1']), 'rows'],
    [table(['id'], [['sean@example.com']]), 'owner_only'],
    ...['ecr', 'rank_ecr', 'fp_ecr', 'fp_ecr_rank', 'ecr_ppr', 'ecr_half_ppr', 'fpEcr', 'ECRRank', 'r2p_pts', 'owner_name', 'owners_real_names', 'realName',
      'display_name', 'emailAddress', 'e_mail', 'manager', 'user_id'].map(name => [table(['id', name]), 'owner_only']),
  ];
  for (const [data, reason] of cases) {
    const reply = await call(handle, post(file({ data })));
    assert.deepEqual([reply.status, reply.body.reason], [400, reason], JSON.stringify(data));
  }
  assert.equal(service.puts.length, 0);
  const owner = await call(handle, post(file({ feature: 'usage-ecr', data: { fp: { cols: ['id', 'ecr', 'owner'], rows: [['p1', 4, 'sean@example.com']] } } })));
  assert.deepEqual([owner.status, owner.body.audience], [200, 'owner'], 'owner files keep any shape');
  const full = Object.fromEntries(Object.entries(USAGE_TABLES).map(([name, cols]) => [name, { cols, rows: [cols.map(() => null)] }]));
  assert.equal((await call(handle, post(file({ data: full })))).body.audience, 'community', 'every allowlisted column passes, including after the word scan');
  assert.deepEqual(Object.entries(FEED_FEATURES).filter(([, audience]) => audience === 'community').map(([feature]) => feature), ['usage']);
  assert.ok(Object.isFrozen(USAGE_TABLES) && Object.values(USAGE_TABLES).every(Object.isFrozen), 'the allowlist cannot be widened at run time');
});

test('ownerOnlyText splits names into words and leaves public nflverse names alone', () => {
  for (const text of ['ecr', 'ECR', 'pos_ecr', 'r2p', 'R2P', 'owners', 'manager_id', 'username', 'real_names', 'displayName', 'mail', 'a.b@c.io']) assert.equal(ownerOnlyText(text), true, text);
  for (const text of ['player_display_name', 'secret', 'snap_pct', 'Patrick Mahomes', 'KC', 'neutral_pass_rate', '00-0023459', 'vs', '@']) assert.equal(ownerOnlyText(text), false, text);
});

test('what is stored and hashed is the validated value re-serialized, so a dropped duplicate key never reaches Storage', async () => {
  const { handle, service } = setup();
  const raw = JSON.stringify(file({ data: '@DATA@' })).replace('"@DATA@"', '{"pw":{"cols":["id","ecr"],"rows":[["p1",4]]},"pw":{"cols":["id"],"rows":[["p1"]]}}');
  const reply = await call(handle, post(raw));
  assert.equal(reply.status, 200);
  const stored = service.objects.get(reply.body.path);
  assert.equal(stored, JSON.stringify(JSON.parse(raw)));
  assert.ok(!stored.includes('ecr'), 'the shadowed table is gone from the stored bytes');
  assert.deepEqual([reply.body.sha256, reply.body.bytes], [sha(stored), stored.length]);
  const spaced = await call(handle, post(JSON.stringify(file(), null, 2)));
  assert.equal(service.objects.get(spaced.body.path), JSON.stringify(file()), 'whitespace is not stored');
  assert.equal((await call(handle, post(JSON.stringify(file({ feature: 'rankings', data: { x: 1 } })).replace('{"x":1}', '{"x":1e400}')))).body.reason, 'number');
});

test('invalid files are refused with a reason and never stored', async () => {
  const { handle, service } = setup();
  const cases = [
    [file({ schemaVersion: 2 }), 'schema_version'], [file({ feature: 'trades' }), 'feature'], [file({ feature: 'constructor' }), 'feature'],
    [file({ season: 2019 }), 'season'], [file({ season: '2026' }), 'season'], [file({ week: 0 }), 'week'], [file({ week: 23 }), 'week'], [file({ week: 1.5 }), 'week'],
    [file({ generatedAt: 'soon' }), 'generated_at'], [file({ generatedAt: '2026-10-26T20:10:00Z' }), 'generated_at'],
    [file({ generatedAt: '2026-10-26T19:00:00' }), 'generated_at'], [file({ generatedAt: 'Mon, 26 Oct 2026 19:00:00 GMT' }), 'generated_at'],
    [file({ generatedAt: `2026-10-26T19:00:00Z${' '.repeat(100)}` }), 'generated_at'], [file({ generatedAt: Date.parse('2026-10-26T19:00:00Z') }), 'generated_at'],
    [file({ sources: [] }), 'sources'], [file({ sources: [{ name: 'x', url: 'http://example.com' }] }), 'sources'],
    [file({ sources: [{ name: 'x', url: 'https://u:p@example.com' }] }), 'sources'], [file({ sources: [{ name: ' ' }] }), 'sources'],
    [file({ sources: [{ name: 'x', extra: 1 }] }), 'sources'], [file({ data: 'text' }), 'data'], [file({ data: null }), 'data'],
    ['{"schemaVersion":1', 'json'], [[file()], 'envelope'],
  ];
  for (const [body, reason] of cases) {
    const reply = await call(handle, post(body));
    assert.deepEqual([reply.status, reply.body], [400, { error: 'Invalid fantasy feed file.', reason }], reason);
  }
  assert.deepEqual((await call(handle, post(file(), { type: 'text/plain' }))).body.reason, 'content_type');
  let deep = {}; for (let i = 0; i < 70; i++) deep = { next: deep };
  assert.equal((await call(handle, post(file({ data: deep })))).body.reason, 'depth');
  assert.equal(service.puts.length, 0);
});

test('an oversized body is refused by its declared length or while streaming', async () => {
  const declared = new Request('https://x.test/', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(MAX_FEED_BYTES + 1) }, body: '{}' });
  await assert.rejects(readFeedBody(declared, 1000), error => error.code === 'TOO_LARGE');
  await assert.rejects(readFeedBody(new Request('https://x.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(65) }), 1000, 64), error => error.code === 'TOO_LARGE');
  const { handle } = setup();
  const reply = await call(handle, new Request('https://x.test/', { method: 'POST', headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', 'content-length': String(MAX_FEED_BYTES + 1) }, body: '{}' }));
  assert.deepEqual([reply.status, reply.body], [413, { error: 'Fantasy feed file too large.' }]);
});

test('an index this function did not write is never overwritten, and storage errors stay generic', async () => {
  const digest = 'f'.repeat(64);
  const listed = entry => JSON.stringify({ schemaVersion: 1, season: 2026, files: [entry], superseded: [] });
  const good = { feature: 'usage', season: 2026, week: 7, sha256: digest, path: `2026/usage/2026-usage-week-07.${digest}.json` };
  const foreigns = ['not json', '{"schemaVersion":1,"season":2025,"files":[],"superseded":[]}', '{"schemaVersion":1,"season":2026,"files":[{"feature":"other"}],"superseded":[]}',
    listed({ ...good, sha256: 'x' }), listed({ ...good, path: '2026/usage/elsewhere.json' }), listed({ ...good, season: 2025 }), listed({ ...good, week: 23 }),
    listed({ ...good, feature: 'rankings' })];
  for (const foreign of foreigns) {
    const { handle, service } = setup();
    service.objects.set(indexPath(2026), foreign);
    const reply = await call(handle, post(file()));
    assert.deepEqual([reply.status, reply.body], [503, { error: 'The fantasy feed service is temporarily unavailable.' }]);
    assert.equal(service.objects.get(indexPath(2026)), foreign);
  }
  const failing = { async put() { throw new Error('secret provider detail'); }, async get() { return null; } };
  const reply = await call(setup({ service: failing }).handle, post(file()));
  assert.deepEqual([reply.status, JSON.stringify(reply.body).includes('secret provider detail')], [503, false]);
});

test('nextIndex keeps other features and weeks untouched and returns null for the current file', () => {
  const entry = (feature, week, hash) => ({ feature, season: 2026, week, sha256: hash, path: `${feature}/${hash}` });
  const first = nextIndex(null, entry('usage', 7, 'a'), 't1');
  const second = nextIndex(first, entry('usage', 8, 'b'), 't2');
  assert.deepEqual(second.files.map(file => file.sha256), ['a', 'b']);
  assert.equal(nextIndex(second, entry('usage', 8, 'b'), 't3'), null);
  const third = nextIndex(second, entry('usage', 7, 'c'), 't3');
  assert.deepEqual([third.files.map(file => file.sha256), third.superseded.map(file => file.sha256)], [['c', 'b'], ['a']]);
  const stale = { ...first, files: [{ ...entry('rankings', null, 'r'), audience: 'community' }] };
  assert.deepEqual(nextIndex(stale, entry('usage', 8, 'd'), 't4').files.map(file => [file.feature, file.audience]), [['rankings', 'owner'], ['usage', 'community']],
    'an entry carried forward takes its audience from FEED_FEATURES again');
});

test('a well-formed index written by an earlier upload is accepted and kept', async () => {
  const { handle, service } = setup();
  await call(handle, post(file({ week: 7, generatedAt: '2026-10-26T18:00:00.123456+00:00' })));
  assert.equal(index(service).files[0].generatedAt, '2026-10-26T18:00:00.123Z', 'the index stores the time in one ISO form');
  assert.equal((await call(handle, post(file()))).body.status, 'published');
  assert.deepEqual(index(service).files.map(entry => entry.week), [7, 8]);
});

test('validateFeedFile returns the fixed audience and feedPath pads the week', () => {
  assert.equal(validateFeedFile(file({ feature: 'draft', week: null }), NOW), 'owner');
  assert.equal(feedPath(file({ week: 3 }), 'f'.repeat(64)), `2026/usage/2026-usage-week-03.${'f'.repeat(64)}.json`);
});

test('the Storage adapter writes only to the fantasy-feed bucket with the service key, never following redirects', async () => {
  assert.throws(() => createFantasyFeedAdapter({ url: 'http://x.supabase.co', serviceRoleKey: 'k' }));
  assert.throws(() => createFantasyFeedAdapter({ url: 'https://x.supabase.co/path', serviceRoleKey: 'k' }));
  assert.throws(() => createFantasyFeedAdapter({ url: 'https://x.supabase.co', serviceRoleKey: '' }));
  const calls = [], replies = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return replies.shift(); };
  const adapter = createFantasyFeedAdapter({ url: 'https://x.supabase.co', serviceRoleKey: 'service-key', fetchImpl });
  const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  replies.push(reply(200, { Key: 'k' }), reply(409, { error: 'Duplicate' }), reply(400, { statusCode: '409' }), reply(400, { statusCode: '409' }), reply(500, { message: 'x' }));
  const bytes = new TextEncoder().encode('{}');
  assert.equal(await adapter.put('2026/index.json', bytes, { upsert: true }), 'created');
  assert.equal(await adapter.put('2026/usage/a.json', bytes, { upsert: false }), 'exists');
  assert.equal(await adapter.put('2026/usage/a.json', bytes, { upsert: false }), 'exists');
  await assert.rejects(adapter.put('2026/index.json', bytes, { upsert: true }), /unavailable/, 'a duplicate answer to an upsert is a failure');
  await assert.rejects(adapter.put('2026/usage/b.json', bytes, { upsert: false }), /unavailable/);
  assert.equal(calls[0].url, `https://x.supabase.co/storage/v1/object/${FEED_BUCKET}/2026/index.json`);
  assert.deepEqual([calls[0].init.method, calls[0].init.redirect, calls[0].init.headers.apikey, calls[0].init.headers.Authorization, calls[0].init.headers['x-upsert'], calls[1].init.headers['x-upsert']],
    ['POST', 'error', 'service-key', 'Bearer service-key', 'true', 'false']);
  assert.deepEqual([calls[0].init.headers['Cache-Control'], calls[1].init.headers['Cache-Control']], ['no-cache', undefined], 'only the rewritten index is written no-cache');
  replies.push(reply(404, { error: 'not_found' }), reply(400, { statusCode: '404' }), new Response('{"ok":1}', { status: 200 }), new Response('x'.repeat(20), { status: 200 }), reply(500, {}));
  assert.equal(await adapter.get('2026/index.json', 100), null);
  assert.equal(await adapter.get('2026/index.json', 100), null);
  assert.equal(new TextDecoder().decode(await adapter.get('2026/index.json', 100)), '{"ok":1}');
  await assert.rejects(adapter.get('2026/index.json', 10), /too large/);
  await assert.rejects(adapter.get('2026/index.json', 100), /unavailable/);
  assert.deepEqual([calls[5].init.method, calls[5].init.redirect, calls[5].init.headers['Cache-Control']], ['GET', 'error', 'no-cache']);
});

test('the function reads its own upload secret and the shared off switch; the module reads no environment', () => {
  const entry = fs.readFileSync(new URL('../supabase/functions/gtl-fantasy-ingest/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /secret: Deno\.env\.get\('GTL_FANTASY_FEED_UPLOAD_SECRET'\)/);
  assert.match(entry, /featureOff: parseFeatureOff\(Deno\.env\.get\('GTL_FEATURE_OFF'\)\)/);
  assert.doesNotMatch(fs.readFileSync(new URL('../cloud/fantasy-feed-ingest.mjs', import.meta.url), 'utf8'), /Deno\.env|process\.env/);
  const config = fs.readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const section = name => config.split(`[functions.${name}]`)[1]?.split(/^\[/m)[0] || '';
  assert.match(section('gtl-fantasy-ingest'), /^verify_jwt\s*=\s*false\s*$/m);
  assert.match(section('gtl-api'), /^verify_jwt\s*=\s*true\s*$/m, 'gtl-api keeps JWT verification');
});
