// Synthetic fixtures and the explicitly licensed historical readiness snapshot only. No network or hosted state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EPL_CLUBS } from '../shared/epl-clubs.mjs';
import { EPL_STANDINGS_CAPTURE_MAX_AGE_MS, EPL_STANDINGS_DATA_MAX_AGE_MS, eplStandingsPositions } from '../shared/epl-standings.mjs';
import { EPL_STANDINGS_RESPONSE_LIMIT, fetchWikimediaEplStandings, normalizeWikimediaEplStandings } from '../cloud/epl-standings.mjs';

const CAPTURE = '2026-10-29T15:38:59.000Z', NOW = Date.parse(CAPTURE);
const context = { season: 2026, completedRound: 1, capturedAt: CAPTURE, now: NOW, responseSha256: 'a'.repeat(64) };
const ids = EPL_CLUBS.map(c => c.code === 'MNC' ? 'MCI' : c.code);
function synthetic() {
  const lines = ['==League table==', '<onlyinclude>{{#invoke:Sports table|main|style=WDL', '|auto_generate_standings=y', '|ranking_criteria=pts, gd, gf',
    `|default_order=${ids.join(', ')}`, '|update=25 October 2026',
    ...EPL_CLUBS.map((c, i) => `|name_${ids[i]}=[[Example F.C.|${c.name}]]`)];
  for (const a of ids) for (const b of ids) if (a !== b) {
    const i = ids.indexOf(a), j = ids.indexOf(b);
    // A single synthetic completed round: ten distinct winning goal differences, ten distinct losses. Not real scores.
    lines.push(`|match_${a}_${b}=${i < 10 && j === i + 10 ? `${i + 1}–0` : ''}`);
  }
  lines.push('}}</onlyinclude>', '==Results==');
  return { query: { pages: [{ title: '2026–27 Premier League', revisions: [{ revid: 123, timestamp: '2026-10-29T10:59:04Z',
    slots: { main: { contentmodel: 'wikitext', content: lines.join('\n') } } }] }] } };
}
const change = (payload, edit) => { const d = structuredClone(payload); const slot = d.query.pages[0].revisions[0].slots.main; slot.content = edit(slot.content); return d; };
const normalize = (payload = synthetic(), options = {}) => normalizeWikimediaEplStandings(payload, { ...context, ...options });
const unavailable = (record, options = {}) => eplStandingsPositions(record, { ...context, ...options });
const response = (body, options = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...options });

test('the complete supported matrix normalizes deterministically to twenty known clubs, unique ranks and a dated community record', () => {
  const payload = synthetic(), first = normalize(payload);
  assert.deepEqual(normalize(payload), first, 'same input and trusted capture clock replay identically');
  assert.equal(first.rows.length, 20); assert.equal(first.matches, 10);
  assert.deepEqual(first.rows.map(r => r.position), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(new Set(first.rows.map(r => r.club)).size, 20);
  assert.ok(first.rows.every(r => r.played === 1));
  assert.equal(first.source.kind, 'wikimedia-community'); assert.equal(first.source.official, false);
  assert.equal(first.source.revision, 123); assert.equal(first.dataAsOf, '2026-10-25');
  assert.equal(first.rows[0].goalsFor, 10); assert.equal(first.rows[0].points, 3);
  assert.equal(unavailable(first).status, 'ready');
  assert.equal(Object.keys(unavailable(first).positions).length, 20);
  assert.match(first.license.attribution, /Wikipedia contributors/);
  assert.match(first.license.url, /by-sa\/4\.0/); assert.match(first.license.changes, /calculated/);
});

test('supported wiki links and fixture placeholders never turn future matches into scores', () => {
  const p = synthetic();
  const linked = change(p, s => s.replace('=1–0', '=[[A rivalry|1–0]]').replace('|match_BOU_ARS=', '|match_BOU_ARS=[[A rivalry|a]]'));
  assert.deepEqual(normalize(linked).rows, normalize(p).rows);
});

test('wrong season/round, missing clubs or pairs, duplicates, unknown clubs and unsupported wiki formats fail closed', () => {
  const cases = [
    [change(synthetic(), s => s.replace('|name_ARS=[[Example F.C.|Arsenal]]', '|name_ARS=[[Example F.C.|Unknown club]]')), /unmapped/],
    [change(synthetic(), s => s.replace('|name_ARS=', '|name_XXX=')), /unmapped/],
    [change(synthetic(), s => s.replace('|match_BOU_ARS=\n', '')), /incomplete/],
    [change(synthetic(), s => s.replace('|match_BOU_ARS=', '|match_BOU_ARS=\n|match_BOU_ARS=')), /incomplete/],
    [change(synthetic(), s => s.replace('|name_ARS=', '|name_ARS=[[Example|Arsenal]]\n|name_ARS=')), /incomplete/],
    [change(synthetic(), s => s.replace('|update=', '|source=display |match_BOU_ARS=2–1\n|update=')), /incomplete/],
    [change(synthetic(), s => s.replace('pts, gd, gf', 'pts, hth')), /source_format/],
    [change(synthetic(), s => s.replace('=1–0', '=1–0<ref>unsupported</ref>')), /source_format/],
    [change(synthetic(), s => s.replace('|update=', '|adjust_points_ARS=-3\n|update=')), /source_format/],
  ];
  for (const [payload, expected] of cases) assert.throws(() => normalize(payload), error => expected.test(error.reason));
  assert.throws(() => normalize(synthetic(), { completedRound: 2 }), e => e.reason === 'inconsistent');
  assert.throws(() => normalize(synthetic(), { season: 2025 }), e => e.reason === 'source_format');
  const ambiguous = change(synthetic(), s => s.replace(/=\d+–0/g, '=1–0'));
  assert.throws(() => normalize(ambiguous), e => e.reason === 'ambiguous_order', 'do not invent an ordering when declared criteria tie');
});

test('a later capture cannot make an old table current; future and malformed timestamps are rejected', () => {
  const d = normalize();
  assert.equal(unavailable(d, { now: NOW + EPL_STANDINGS_CAPTURE_MAX_AGE_MS + 1 }).reason, 'stale');
  const old = { ...d, dataAsOf: new Date(NOW - EPL_STANDINGS_DATA_MAX_AGE_MS - 86400e3).toISOString().slice(0, 10) };
  assert.equal(unavailable(old).reason, 'stale');
  for (const changed of [{ ...d, capturedAt: '2026-10-30T00:00:00Z' }, { ...d, dataAsOf: '2026-10-30' },
    { ...d, dataAsOf: '2026-02-30' }, { ...d, source: { ...d.source, revisionAt: '2026-11-01T00:00:00Z' } }]) {
    assert.equal(unavailable(changed).reason, 'invalid_time');
  }
  assert.equal(unavailable(d, { completedRound: 2 }).reason, 'wrong_round');
  assert.equal(eplStandingsPositions(d).reason, 'context_required');
});

test('persisted input requires all twenty ranks, complete round arithmetic and matching provenance before positions are usable', () => {
  const d = normalize();
  const cases = [
    [r => r.rows.pop(), 'incomplete'],
    [r => r.rows[1].position = r.rows[0].position, 'invalid_clubs_or_ranks'],
    [r => r.rows[1].club = r.rows[0].club, 'invalid_clubs_or_ranks'],
    [r => r.rows[1].club = 'XYZ', 'invalid_clubs_or_ranks'],
    [r => r.rows[0].points++, 'inconsistent'],
    [r => r.rows[0].played++, 'inconsistent'],
    [r => r.rows[0].goalDifference++, 'inconsistent'],
    [r => r.matches++, 'inconsistent'],
    [r => r.source.official = true, 'provenance_required'],
    [r => r.source.url = 'https://example.org/not-wikipedia', 'provenance_required'],
    [r => r.source.responseSha256 = '', 'provenance_required'],
    [r => r.license.changes = '', 'provenance_required'],
    [r => r.license.url = 'https://example.org/no-license', 'provenance_required'],
  ];
  for (const [mutate, reason] of cases) { const r = structuredClone(d); mutate(r); assert.equal(unavailable(r).reason, reason); }
  const badOrder = structuredClone(d); [badOrder.rows[0].position, badOrder.rows[19].position] = [20, 1];
  assert.equal(unavailable(badOrder).reason, 'inconsistent_order');
});

test('the adapter makes one bounded anonymous request with an identified user agent and records only normalized data', async () => {
  const calls = [];
  const out = await fetchWikimediaEplStandings({ season: 2026, completedRound: 1, clock: () => NOW,
    fetchImpl: async (url, options) => { calls.push([url, options]); return response(synthetic()); } });
  assert.equal(out.status, 'ready'); assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url.origin, 'https://en.wikipedia.org'); assert.equal(url.searchParams.get('rvprop'), 'ids|timestamp|content');
  assert.equal(url.searchParams.get('titles'), '2026–27 Premier League'); assert.equal(url.searchParams.get('maxlag'), '5');
  assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  assert.match(options.headers['User-Agent'], /guess-the-line/);
  assert.match(out.data.source.responseSha256, /^[a-f0-9]{64}$/);
  assert.equal(out.data.capturedAt, CAPTURE);
  assert.doesNotMatch(JSON.stringify(out.data), /match_BOU|slots|revisions|teamIcon/);
});

test('a failed/limited/oversized/malformed source returns unavailable without retries, fallback data or raw errors', async () => {
  for (const make of [() => response({}, { status: 429 }), () => response('not json'), () => response({ error: { code: 'maxlag' } }),
    () => response('x'.repeat(EPL_STANDINGS_RESPONSE_LIMIT + 1)), () => response('', { headers: { 'content-length': String(EPL_STANDINGS_RESPONSE_LIMIT + 1) } }),
    () => { throw new Error('private arbitrary provider text'); }]) {
    let calls = 0;
    const out = await fetchWikimediaEplStandings({ season: 2026, completedRound: 1, clock: () => NOW, fetchImpl: async () => { calls++; return make(); } });
    assert.equal(out.status, 'unavailable'); assert.equal(calls, 1); assert.equal(out.data, undefined);
    assert.doesNotMatch(JSON.stringify(out), /private arbitrary/);
  }
  let calls = 0;
  assert.equal((await fetchWikimediaEplStandings({ fetchImpl: async () => { calls++; } })).reason, 'context_required');
  assert.equal(calls, 0);
});

test('the licensed real snapshot is complete at its capture time, has no images and expires instead of staying implicitly current', () => {
  const d = JSON.parse(fs.readFileSync('data/epl/standings/wikimedia-2026-round-08-2026-10-29.json', 'utf8'));
  assert.equal(d.source.revision, 1382589055); assert.equal(d.completedRound, 8); assert.equal(d.matches, 80);
  const result = eplStandingsPositions(d, { season: 2026, completedRound: 8, now: Date.parse(d.capturedAt) });
  assert.equal(result.status, 'ready'); assert.equal(Object.keys(result.positions).length, 20);
  assert.equal(eplStandingsPositions(d, { season: 2026, completedRound: 8, now: Date.parse(d.capturedAt) + EPL_STANDINGS_CAPTURE_MAX_AGE_MS + 1 }).reason, 'stale');
  assert.doesNotMatch(JSON.stringify(d), /teamIcon|data:image|\.svg|\.png/);
});
