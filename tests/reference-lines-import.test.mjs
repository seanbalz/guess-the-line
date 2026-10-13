import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { seed } from '../server/store.mjs';
import {
  buildReferenceLineImport, checkDecisionFormat, executeReferenceLineImport, preflightSql, sqlStatements, sqlTemplate, validateChain, verifyDecision, verifySql,
  DECISIONS_FILE, EXCLUDED, FILES, PAYLOAD_FILE, RPC,
} from '../scripts/import-reference-lines.mjs';

// The reference-line import builder and CLI (no database; the SQL side is tests/line-at-guess-sql.test.mjs).
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SCRIPT = 'scripts/import-reference-lines.mjs';

test('the committed eDraft pages are byte-identical and the payload carries only their consensus spreads, page times and capture times', () => {
  for (const { file, sha256 } of [...FILES, ...EXCLUDED]) assert.equal(sha(file), sha256, file);
  assert.equal(sha('data/picks/2026-week-05.json'), 'a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd', 'Sean\'s Week 5 picks file is untouched');
  const { payloads, summary, document } = buildReferenceLineImport();
  assert.deepEqual(payloads.map(p => p.p_file), FILES.map(f => f.file));
  assert.deepEqual(EXCLUDED.map(e => e.file), ['data/snapshots/2026-week-05-edraft-0333ET.json'], 'the 03:33 ET page has no recorded capture time and is never imported');
  assert.deepEqual([summary.imports, summary.lines, summary.files.map(f => [f.lines, f.markets.spread, f.markets.total])], [2, 30, [[15, 15, 0], [15, 15, 0]]]);
  assert.deepEqual(payloads.map(p => [p.p_reference.observedAt, p.p_reference.capturedAt]), [['2026-10-08T08:33:00.000Z', '2026-10-08T09:01:21.436Z'], ['2026-10-08T14:03:00.000Z', '2026-10-08T15:02:12.589Z']]);
  const slate = seed().games;
  for (const p of payloads) {
    assert.deepEqual([p.p_season, p.p_week, p.p_actor, p.p_ruling, p.p_reference.decision, p.p_reference.source, p.p_reference.sourceUrl], [2026, 5, null, null, null, 'eDraft consensus', 'https://edraft.com/nfl/odds/week-5'], 'no decision until Sean rules');
    assert.deepEqual(Object.keys(p.p_reference.lines).sort(), slate.map(g => g.id).sort());
    const doc = JSON.parse(fs.readFileSync(p.p_file, 'utf8'));
    for (const game of doc.games) {
      const slateGame = slate.find(g => g.matchup === game.matchup);
      assert.deepEqual(p.p_reference.lines[slateGame.id], { spread: game.consensus_home_spread }, 'the consensus home spread, nothing else');
    }
    const text = JSON.stringify(p);
    assert.ok(!/predicted|points|"pick/i.test(text), 'no pick and no points in the payload');
  }
  // The committed payload file is exactly what the builder produces (regenerate with --write-payload).
  assert.deepEqual(JSON.parse(fs.readFileSync(PAYLOAD_FILE, 'utf8')), document);
  assert.ok(!/predicted|"points"|total_points/.test(fs.readFileSync(PAYLOAD_FILE, 'utf8')), 'public market data only');
  assert.equal(document.decision, null);
});

test('a changed page, a broken chain, a bad actor or an unrecorded decision is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-reference-lines-'));
  try {
    for (const { file } of [...FILES, ...EXCLUDED]) { fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true }); fs.copyFileSync(file, path.join(dir, file)); }
    assert.equal(buildReferenceLineImport({ root: dir }).payloads.length, 2, 'an identical copy builds');
    const target = path.join(dir, FILES[1].file);
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('"consensus_home_spread": -8.5', '"consensus_home_spread": -8'));
    assert.throws(() => buildReferenceLineImport({ root: dir }), /changed \(sha256 [0-9a-f]{64}\); reconcile/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const docs = Object.fromEntries(FILES.map(f => [f.file, JSON.parse(fs.readFileSync(f.file, 'utf8'))]));
  assert.doesNotThrow(() => validateChain(docs));
  assert.throws(() => validateChain({ ...docs, [FILES[1].file]: { ...docs[FILES[1].file], previous_snapshot: 'data/snapshots/2026-week-05-edraft-0333ET.json' } }), /previous snapshot/);
  assert.throws(() => buildReferenceLineImport({ actor: 'x' }), /--actor/);
  for (const decision of ['D-27', 'D-8', 'D-0', 'd-28', 'D-1000', '']) assert.throws(() => checkDecisionFormat(decision), /--decision/, decision);
  assert.equal(checkDecisionFormat('D-28'), 'D-28');
  const decisions = fs.readFileSync(DECISIONS_FILE, 'utf8');
  assert.throws(() => verifyDecision('D-27', decisions), /--decision/, 'D-27 alone does not make a page a stored line');
  assert.throws(() => verifyDecision('D-99', decisions), /not recorded/);
  assert.throws(() => verifyDecision('D-99', '## D-99 — Something else\nNo ruling here.\n## D-98 — x\ngtl_import_reference_lines eDraft'), /does not rule/);
  assert.equal(verifyDecision('D-99', `## D-99 — eDraft reference lines\nSean ruled the eDraft pages are reference lines (${RPC}).\n## D-98 — x`), 'D-99');
});

test('the statements escape every literal and the dry run prints counts, hashes and instants only', () => {
  const { payloads } = buildReferenceLineImport({ actor: id(30), decision: 'D-99' });
  assert.throws(() => sqlStatements(buildReferenceLineImport().payloads), /commissioner id and the decision/);
  const statements = sqlStatements(payloads.map(p => ({ ...p, p_ruling: `${p.p_ruling} Sean's "ruling"` }))).trim().split('\n');
  assert.equal(statements.length, 2);
  for (const statement of statements) {
    assert.match(statement, new RegExp(`^select public\\.${RPC}\\('${id(30)}'::uuid, 2026, 5, 'data/snapshots/[^']+\\.json', '[0-9a-f]{64}', 'D-99: Sean''s ruling, .*Sean''s "ruling"', '\\{.*\\}'::jsonb\\) as result;$`));
  }
  assert.ok(sqlTemplate().includes('<commissioner uuid>') && !sqlTemplate().includes('TB-DAL'));
  assert.ok(verifySql().includes('gtl_reference_line_imports') && !/\bvalue\b/.test(verifySql()), 'the verification select reads counts, never values');
  assert.ok(!/picks->|#>>?'\{picks/.test(preflightSql()) && preflightSql().includes('submission time unavailable'), 'the pre-flight never reads a pick value');
  const dry = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes('"dryRun": true') && dry.stdout.includes('"lines": 30') && dry.stdout.includes(sqlTemplate()) && dry.stdout.includes('pending'));
  assert.ok(!/TB-DAL|consensus_home_spread|"spread": -/.test(dry.stdout), 'no game id and no line value in the dry run');
  for (const args of [['--sql'], ['--execute'], ['--decision', 'D-99', '--sql'], ['--decision', 'D-27', '--actor', id(30), '--sql'], ['--decision', 'D-99', '--actor', id(30), '--sql'], ['--bogus']]) {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } });
    assert.equal(run.status, 1, args.join(' '));
    assert.ok(!run.stdout.includes('dryRun'), `${args.join(' ')}: nothing written or printed`);
  }
  const unrecorded = spawnSync(process.execPath, [SCRIPT, '--decision', 'D-99', '--actor', id(30), '--sql'], { encoding: 'utf8' });
  assert.match(unrecorded.stderr, /D-99 is not recorded in docs\/DECISIONS\.md/);
  assert.match(spawnSync(process.execPath, [SCRIPT, '--decision', 'D-99', '--sql'], { encoding: 'utf8' }).stderr, /--actor <commissioner uuid>/);
});

test('--execute posts each file to the service-role RPC and resolves the commissioner from memberships', async () => {
  const { payloads } = buildReferenceLineImport({ decision: 'D-99' });
  const calls = [];
  process.env.SUPABASE_URL = 'https://abc123.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture-key-not-real';
  try {
    const fetchImpl = async (url, request) => {
      calls.push({ url: String(url), request });
      if (String(url).includes('/rest/v1/gtl_memberships?')) return new Response(JSON.stringify([{ user_id: id(30) }]), { status: 200 });
      if (String(url).endsWith(`/rest/v1/rpc/${RPC}`)) return new Response(JSON.stringify({ imported: true, replayed: false, lines: 15 }), { status: 200 });
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
    };
    assert.deepEqual(await executeReferenceLineImport(payloads, { fetchImpl }), [{ imported: true, replayed: false, lines: 15 }, { imported: true, replayed: false, lines: 15 }]);
    assert.deepEqual(calls.map(c => [c.request.method, new URL(c.url).pathname]), [['GET', '/rest/v1/gtl_memberships'], ['POST', `/rest/v1/rpc/${RPC}`], ['POST', `/rest/v1/rpc/${RPC}`]]);
    assert.ok(calls.every(c => c.request.headers.Authorization === 'Bearer service-role-fixture-key-not-real' && c.request.headers.apikey === 'service-role-fixture-key-not-real' && c.request.redirect === 'error'));
    assert.deepEqual(calls.slice(1).map(c => JSON.parse(c.request.body)), payloads.map(p => ({ ...p, p_actor: id(30) })));
    await assert.rejects(() => executeReferenceLineImport(buildReferenceLineImport().payloads, { fetchImpl }), /--decision/);
    await assert.rejects(() => executeReferenceLineImport(payloads, { fetchImpl: async () => new Response(JSON.stringify({ message: 'GTL_REFERENCE_IMPORT_CONFLICT' }), { status: 400 }) }), /GTL_REFERENCE_IMPORT_CONFLICT/);
    await assert.rejects(() => executeReferenceLineImport(payloads.map(p => ({ ...p, p_actor: id(30) })), { fetchImpl: async () => new Response('{}', { status: 200 }) }), /Unexpected RPC result/);
    process.env.SUPABASE_URL = 'http://evil.example/';
    await assert.rejects(() => executeReferenceLineImport(payloads, { fetchImpl }), /SUPABASE_URL/);
  } finally { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});
