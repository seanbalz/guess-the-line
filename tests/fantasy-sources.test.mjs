// Contract: the Fantasy refresh's nflverse lookups send the workflow token (GH_TOKEN, else GITHUB_TOKEN) only to
// api.github.com, retry a 403, 429, 5xx or network error with backoff for three attempts in all, then give up with the
// same error as before; any other status is never retried; no log line carries the token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SOURCE_RETRY_WAITS_MS, fetchSource, readFantasySources, sourceHeaders } from '../scripts/fantasy-sources.mjs';

const TOKEN = 'ghs_testOnlyNotARealToken0123456789';
const API = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/stats_player';
const DOWNLOAD = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv';

/** A scripted fetch: each call takes the next reply for its URL (a status, an Error to throw, or a body to return with 200). */
function scripted(replies) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, headers: { ...(options?.headers ?? {}) } });
    const queue = replies[url];
    assert.ok(queue?.length, `unexpected request ${url}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response(next === 304 ? null : `status ${next}`, { status: next });
    return new Response(typeof next === 'string' || next instanceof Uint8Array ? next : JSON.stringify(next), { status: 200 });
  };
  return { fetchImpl, calls };
}
const recorder = () => { const waits = []; return { waits, sleep: async ms => { waits.push(ms); } }; };

test('the token goes only to api.github.com: GH_TOKEN first, else GITHUB_TOKEN; downloads and look-alike hosts get none', () => {
  assert.deepEqual(sourceHeaders(API, { GH_TOKEN: TOKEN, GITHUB_TOKEN: 'other' }), { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` });
  assert.deepEqual(sourceHeaders(API, { GITHUB_TOKEN: TOKEN }), { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` });
  assert.deepEqual(sourceHeaders(API, {}), { Accept: 'application/vnd.github+json' }, 'unauthenticated when no token is set (local runs)');
  assert.deepEqual(sourceHeaders(DOWNLOAD, { GH_TOKEN: TOKEN }), {}, 'a download sends no headers, as before');
  for (const url of ['https://api.github.com.example.net/repos/x', 'http://api.github.com/repos/x', 'https://objects.githubusercontent.com/x'])
    assert.equal(sourceHeaders(url, { GH_TOKEN: TOKEN }).Authorization, undefined, url);
});

test('three attempts with exponential backoff', () => {
  assert.deepEqual([...SOURCE_RETRY_WAITS_MS], [5_000, 10_000]);
  assert.ok(Object.isFrozen(SOURCE_RETRY_WAITS_MS));
});

test('a 403 then a 200 succeeds on the second attempt after one wait', async () => {
  const { fetchImpl, calls } = scripted({ [API]: [403, { assets: [] }] }), { waits, sleep } = recorder(), lines = [];
  const response = await fetchSource(API, { headers: sourceHeaders(API, { GH_TOKEN: TOKEN }), timeoutMs: 1000, fetchImpl, sleep, log: line => lines.push(line) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [5_000]);
  assert.deepEqual(lines, ['Source request api.github.com/repos/nflverse/nflverse-data/releases/tags/stats_player failed (HTTP 403); retrying in 5 s.']);
});

test('gives up after three attempts and returns the last response', async () => {
  const { fetchImpl, calls } = scripted({ [API]: [403] }), { waits, sleep } = recorder();
  const response = await fetchSource(API, { headers: {}, timeoutMs: 1000, fetchImpl, sleep });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [5_000, 10_000]);
});

test('429, 5xx and network errors are retried; a network error on the last attempt is thrown', async () => {
  const mixed = scripted({ [API]: [new TypeError('fetch failed'), 429, 502, 200] }), slept = recorder();
  assert.equal((await fetchSource(API, { headers: {}, timeoutMs: 1000, fetchImpl: mixed.fetchImpl, sleep: slept.sleep })).status, 502, 'three attempts, then the last response');
  assert.equal(mixed.calls.length, 3);
  const down = scripted({ [API]: [new TypeError('fetch failed')] });
  await assert.rejects(fetchSource(API, { headers: {}, timeoutMs: 1000, fetchImpl: down.fetchImpl, sleep: recorder().sleep }), /fetch failed/);
  assert.equal(down.calls.length, 3);
  const recovered = scripted({ [API]: [503, 200] });
  assert.equal((await fetchSource(API, { headers: {}, timeoutMs: 1000, fetchImpl: recovered.fetchImpl, sleep: recorder().sleep })).status, 200);
});

test('any other status is returned at once, never retried', async () => {
  for (const status of [200, 304, 401, 404, 422]) {
    const { fetchImpl, calls } = scripted({ [API]: [status, 200] }), { waits, sleep } = recorder();
    assert.equal((await fetchSource(API, { headers: {}, timeoutMs: 1000, fetchImpl, sleep })).status, status);
    assert.equal(calls.length, 1, `HTTP ${status}`);
    assert.deepEqual(waits, []);
  }
});

const SEASON = 2026;
const SPECS = [
  ['stats_player', `stats_player_week_${SEASON}.csv`, 'player_id,position,season,season_type,week,game_id,team,opponent_team'],
  ['weekly_rosters', `roster_weekly_${SEASON}.csv`, 'gsis_id,full_name,position,status,week,game_type'],
  ['injuries', `injuries_${SEASON}.csv`, 'gsis_id,week,report_status,practice_status'],
  ['schedules', 'games.csv', 'game_id,season,game_type,week,home_team,away_team,gameday,gametime'],
];
function nflverse({ firstMetadata = [] } = {}) {
  const replies = {};
  for (const [tag, file, header] of SPECS) {
    const csv = `${header}\n`, url = `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${file}`;
    const sha = createHash('sha256').update(csv).digest('hex');
    const metadata = { assets: [{ name: file, browser_download_url: url, size: Buffer.byteLength(csv), digest: `sha256:${sha}`, updated_at: '2026-11-02T05:33:00Z' }] };
    replies[`https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${tag}`] = tag === 'stats_player' ? [...firstMetadata, metadata] : [metadata];
    replies[url] = [csv];
  }
  return scripted(replies);
}

test('the refresh reads every source with the token on api.github.com only, survives a 403, and never logs the token', async () => {
  const { fetchImpl, calls } = nflverse({ firstMetadata: [403] }), { waits, sleep } = recorder(), lines = [];
  const { rows, sources } = await readFantasySources({ season: SEASON, root: '.', fetchImpl, sleep, env: { GH_TOKEN: TOKEN }, log: line => lines.push(line) });
  assert.deepEqual(Object.keys(rows), ['stats', 'rosters', 'injuries', 'schedule']);
  assert.equal(sources.length, 4);
  assert.deepEqual(waits, [5_000]);
  assert.equal(calls.length, 9, 'four metadata reads, one retried, and four downloads');
  for (const call of calls) {
    const api = call.url.startsWith('https://api.github.com/');
    assert.equal(call.headers.Authorization, api ? `Bearer ${TOKEN}` : undefined, call.url);
  }
  assert.equal(lines.length, 1);
  assert.ok(lines.every(line => !line.includes(TOKEN) && !line.includes('Bearer')), 'no log line carries the token');
});

test('the refresh still fails closed with the same message after three 403s', async () => {
  const { fetchImpl, calls } = nflverse({ firstMetadata: [403, 403, 403] }), { waits, sleep } = recorder(), lines = [];
  await assert.rejects(readFantasySources({ season: SEASON, root: '.', fetchImpl, sleep, env: { GH_TOKEN: TOKEN }, log: line => lines.push(line) }),
    /^Error: Source metadata unavailable \(403\)\.$/);
  assert.equal(calls.length, 3, 'three attempts at the first lookup, nothing after it');
  assert.deepEqual(waits, [5_000, 10_000]);
  assert.ok(lines.every(line => !line.includes(TOKEN)));
});
