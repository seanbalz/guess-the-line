// Reference lines for the 2026 Week 5 ballots that were saved without a line (the ballots migrated from the group
// leagues; D-27 rulings 2 and 3). Builds the payloads for the service-only RPC public.gtl_import_reference_lines
// (migration 20261013010000_gtl_line_at_guess_reads.sql) from the committed eDraft consensus pages and, with --execute,
// runs them with the service role. The community readers then compare each guess with the newest line stored at or before
// it, hosted 3-book snapshots and these imported lines alike, else the first line stored after it (read time only; no
// ballot row is written).
//
// D-27 alone does not make a non-hosted page a stored line: an import needs Sean's explicit ruling recorded in
// docs/DECISIONS.md under its own number after D-27 (the D-25 pattern). Sean approved it on October 13, 2026, recorded as
// D-33 (the two timed pages below; never the 03:33 ET page). Without --decision only the dry run and --write-payload work.
//
//   node scripts/import-reference-lines.mjs                                   # dry run: counts, hashes and instants, never a line value or pick
//   node scripts/import-reference-lines.mjs --write-payload                   # regenerate the committed payload file (public market data only)
//   node scripts/import-reference-lines.mjs --decision D-nn --actor <commissioner uuid> --sql   # also writes .local/reference-lines-import.sql (0600)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-reference-lines.mjs --decision D-nn [--actor <uuid>] --execute
//
// Sean, or the session acting on his recorded go (D-33), runs --sql or --execute right after the migration is applied,
// which happens after this branch merges. Nothing here reads a committed credential, hard-codes an account id, reads a
// pick or Sean's provisional points, or prints a value.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seed } from '../server/store.mjs';
import { UUID_PATTERN } from '../cloud/lobby.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
export const RPC = 'gtl_import_reference_lines';
export const VOID_RPC = 'gtl_void_reference_line_import';
export const MIGRATION = '20261013010000_gtl_line_at_guess_reads.sql';
export const PAYLOAD_FILE = 'data/reference-lines/2026-week-05-edraft.json';
export const DECISIONS_FILE = 'docs/DECISIONS.md';
export const SEASON = 2026;
export const WEEK = 5;
const COMMISSIONER_LEAGUE = 'sean-troy-luke';
const SOURCE = 'eDraft consensus';
// The committed pages stay byte-identical; a changed file is reconciled by hand, never imported.
export const FILES = [
  { file: 'data/snapshots/2026-week-05-20261008T090121436Z.json', sha256: '309e2c9d9270799f9bb94c7651da0074fc0daea654b0b7864932579f3b807820', previous: 'data/snapshots/2026-week-05-edraft-0333ET.json' },
  { file: 'data/snapshots/2026-week-05-20261008T150212589Z.json', sha256: 'e9ebad5d805cccc732848886d843014dd3dcdb782e6656dadeb0b965c5876b69', previous: 'data/snapshots/2026-week-05-20261008T090121436Z.json' },
];
// Pinned too, as the head of the chain, but never imported: no capture time is recorded for it (D-16).
export const EXCLUDED = [
  { file: 'data/snapshots/2026-week-05-edraft-0333ET.json', sha256: 'c4647306f172d78c89fd9a560ded8e4a2624a5c09615691f6c283e906fc55f1b',
    reason: 'The page records only its publication time (03:33 ET) and a retrieval date, not when it was captured, so it cannot be shown to have been stored before any guess (D-16). Its spreads equal the 04:33 ET page captured at 09:01:21Z, which is imported.' },
];

const fail = message => { throw new Error(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const instant = (value, label) => { const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toISOString() : fail(`Invalid ${label}: ${value}`); };

/** A decision number this import can run under: its own number after D-27 (D-27 does not make a page a stored line). */
export function checkDecisionFormat(decision) {
  if (!/^D-[0-9]{1,3}$/.test(decision || '') || Number(decision.slice(2)) <= 27) fail('Pass --decision D-nn: the number Sean\'s ruling on these eDraft reference lines is recorded under (after D-27).');
  return decision;
}

/** The ruling must be recorded in docs/DECISIONS.md as its own section that names this import's RPC. */
export function verifyDecision(decision, decisionsText) {
  checkDecisionFormat(decision);
  const lines = String(decisionsText).split('\n');
  const start = lines.findIndex(line => line.startsWith(`## ${decision} `));
  if (start < 0) fail(`${decision} is not recorded in ${DECISIONS_FILE}. Record Sean's ruling on the eDraft reference lines there first.`);
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const section = lines.slice(start, end < 0 ? undefined : end).join('\n');
  if (!section.includes(RPC) || !/eDraft/.test(section)) fail(`${decision} in ${DECISIONS_FILE} does not rule on the eDraft reference lines (${RPC}).`);
  return decision;
}

/** Each file names the one before it: 0333ET -> 09:01:21Z capture -> 15:02:12Z capture. */
export function validateChain(docs) {
  for (const { file, previous } of FILES) {
    if (docs[file]?.previous_snapshot !== previous) fail(`${file} does not name ${previous} as its previous snapshot.`);
  }
}

/**
 * Reads the committed eDraft pages, checks their pinned sha256s, metadata and chain, maps every matchup to the committed
 * Week 5 slate (server/store.mjs seed()) and returns one RPC payload per imported file plus a summary with counts, hashes
 * and instants only. Reads only matchup, consensus_home_spread, status and source_quote_at from each game: never
 * predicted_home_spread or points (Sean's picks and provisional points).
 */
export function buildReferenceLineImport({ actor = null, decision = null, root = repoRoot } = {}) {
  if (actor !== null && !UUID_PATTERN.test(actor)) fail('--actor must be the commissioner\'s hosted auth user id (uuid).');
  if (decision !== null) checkDecisionFormat(decision);
  const state = seed();
  if (state.league.season !== SEASON || state.league.week !== WEEK) fail('The committed slate is not 2026 Week 5.');
  const docs = {};
  for (const { file, sha256: pinned } of [...EXCLUDED, ...FILES]) {
    const bytes = fs.readFileSync(path.join(root, file));
    const actual = sha256(bytes);
    if (actual !== pinned) fail(`${file} changed (sha256 ${actual}); reconcile the file before importing.`);
    docs[file] = JSON.parse(bytes.toString('utf8'));
  }
  validateChain(docs);
  const imports = [], summary = [];
  for (const { file, sha256: fileSha256 } of FILES) {
    const doc = docs[file];
    if (doc.season !== SEASON || doc.week !== WEEK || doc.source !== 'eDraft' || !/^https:\/\//.test(doc.source_url || '') || doc.official !== false) fail(`${file} has unexpected source metadata.`);
    const observedAt = instant(doc.source_page_updated_at, `page time in ${file}`), capturedAt = instant(doc.snapshot_at, `capture time in ${file}`);
    if (Date.parse(observedAt) > Date.parse(capturedAt)) fail(`${file} was captured before its page time.`);
    if (!Array.isArray(doc.games) || doc.games.length !== state.games.length) fail(`${file} does not cover the ${state.games.length} slate games.`);
    const lines = {};
    for (const game of doc.games) {
      const { matchup, consensus_home_spread: value, status, source_quote_at: quoteAt } = game;
      const slate = state.games.find(g => g.matchup === matchup);
      if (!slate || lines[slate.id]) fail(`Unknown or duplicate matchup in ${file}.`);
      if (!Number.isFinite(value) || Math.abs(value) > 100) fail(`Out-of-range consensus spread for ${slate.id} in ${file}.`);
      if (status !== undefined && status !== 'available') fail(`${slate.id} is not available in ${file}.`);
      if (quoteAt !== undefined && instant(quoteAt, `quote time in ${file}`) !== observedAt) fail(`${slate.id} in ${file} carries a quote time other than the page time.`);
      if (Date.parse(capturedAt) >= Date.parse(slate.kickoff)) fail(`${file} was captured at or after ${slate.id} kicked off.`);
      lines[slate.id] = { spread: value };
    }
    const reference = { source: SOURCE, sourceUrl: doc.source_url, kind: doc.kind, method: doc.consensus_method, timeBasis: 'page time as published by the source; capture time recorded by the snapshot', observedAt, capturedAt, lines };
    imports.push({ file, fileSha256, reference });
    summary.push({ file, fileSha256, observedAt, capturedAt, lines: Object.keys(lines).length, markets: { spread: Object.keys(lines).length, total: 0 } });
  }
  const ruling = decision && `${decision}: Sean's ruling, recorded in ${DECISIONS_FILE}, that the committed October 8 eDraft consensus pages are reference lines for the 2026 Week 5 ballots saved without a line, from each page's capture time, under D-27 ruling 2 ("The spread when they guessed is the spread that their points total will be compared against").`;
  const payloads = imports.map(({ file, fileSha256, reference }) => ({
    p_actor: actor, p_season: SEASON, p_week: WEEK, p_file: file, p_file_sha256: fileSha256, p_ruling: ruling, p_reference: { decision, ...reference },
  }));
  return {
    payloads,
    document: { schema: 'gtl-reference-lines-v1', season: SEASON, week: WEEK, rpc: RPC, migration: MIGRATION, decision: null,
      decisionStatus: 'Approved: Sean\'s approval of October 13, 2026 is recorded in docs/DECISIONS.md as D-33 (its own number after D-27); the number is added at import time (--decision D-33), after the migration is applied.',
      note: 'Public market data only: eDraft consensus home spreads with their page and capture times. No pick and no points.',
      excluded: EXCLUDED.map(({ file, sha256: fileSha256, reason }) => ({ file, fileSha256, reason })), imports },
    summary: { rpc: RPC, migration: MIGRATION, season: SEASON, week: WEEK, decision: decision || 'pending (pass --decision D-33, Sean\'s recorded approval, once the migration is applied)',
      files: summary, excluded: EXCLUDED.map(e => e.file), imports: summary.length, lines: summary.reduce((sum, f) => sum + f.lines, 0),
      actor: actor ? `${actor.slice(0, 8)}…` : `resolved from gtl_memberships (${COMMISSIONER_LEAGUE} commissioner) at --execute` },
  };
}

const literal = value => `'${String(value).replaceAll("'", "''")}'`;
/** The exact statements to run through the Supabase MCP instead of --execute, one per file. */
export function sqlStatements(payloads) {
  return payloads.map(p => {
    if (!p.p_actor || !p.p_ruling || !p.p_reference?.decision) fail('A statement needs the commissioner id and the decision.');
    return `select public.${RPC}(${literal(p.p_actor)}::uuid, ${p.p_season}, ${p.p_week}, ${literal(p.p_file)}, ${literal(p.p_file_sha256)}, ${literal(p.p_ruling)}, ${literal(JSON.stringify(p.p_reference))}::jsonb) as result;`;
  }).join('\n') + '\n';
}
/** The statement shape with the parts filled at import time, safe to print. */
export const sqlTemplate = () => `select public.${RPC}('<commissioner uuid>'::uuid, ${SEASON}, ${WEEK}, '<file>', '<file sha256>', '<ruling>', '<reference json from .local/reference-lines-import.sql>'::jsonb) as result;`;
/** Verification select for the runbook: imports, voids and line counts per file and market, never a value. */
export const verifySql = () => `select i.source_file, i.file_sha256, i.decision, i.line_count, i.recorded_at, i.payload_sha256,
  exists(select 1 from public.gtl_reference_line_voids v where v.import_id=i.id) as voided,
  (select count(*) from public.gtl_reference_lines r where r.import_id=i.id and r.market='spread') as spread_lines,
  (select count(*) from public.gtl_reference_lines r where r.import_id=i.id and r.market='total') as total_lines,
  (select count(*) from public.gtl_access_audit a where a.event like 'reference_line_import:%' and a.event like '%'||i.file_sha256) as audit_rows
from public.gtl_reference_line_imports i order by i.recorded_at, i.source_file;`;
/**
 * Read-only checks to run on the hosted project before the release (counts and instants only, never a pick or a line value):
 * which submitted ballots have slate games without a saved reference, pick keys off their slate, eligibility rulings that
 * change the community's lists, post-submission edits on the ballots without saved lines, and ballots whose origin records
 * that the submission time is unavailable.
 */
export const preflightSql = () => `with b as (
  select x.*, s.signature from public.gtl_weekly_ballots x join public.gtl_weekly_slates s on s.season=x.season and s.week=x.week
  where coalesce(x.ballot->>'submittedAt','')<>'')
select 'ballots without a saved reference' as check_name, season, week, mode, count(*) as ballots,
  min((ballot->>'submittedAt')::timestamptz) as first_submitted, max((ballot->>'submittedAt')::timestamptz) as last_submitted
from b where exists(select 1 from jsonb_array_elements(signature->'games') g where jsonb_typeof(ballot#>array['scoringReferences',g->>'id']) is distinct from 'object')
group by season, week, mode
union all
select 'pick keys off the slate', season, week, mode, count(*), null, null from b
where exists(select 1 from jsonb_object_keys(coalesce(ballot->'picks','{}')) k where not exists(select 1 from jsonb_array_elements(signature->'games') g where g->>'id'=k))
group by season, week, mode
union all
select 'ineligible ruling on a non-practice ballot', r.season, r.week, r.mode, count(*), null, null from public.gtl_weekly_eligibility_rulings r
join public.gtl_weekly_ballots x using (user_id, season, week, mode) where not r.eligible and not x.origin_practice group by r.season, r.week, r.mode
union all
select 'eligible ruling on a practice ballot', r.season, r.week, r.mode, count(*), null, null from public.gtl_weekly_eligibility_rulings r
join public.gtl_weekly_ballots x using (user_id, season, week, mode) where r.eligible and x.origin_practice group by r.season, r.week, r.mode
union all
select 'post-submission edits on ballots without a saved reference', season, week, mode, count(*), null, null from b, jsonb_array_elements(case when jsonb_typeof(audit)='array' then audit else '[]' end) e
where e->>'type'='ballot_edited' and exists(select 1 from jsonb_array_elements(signature->'games') g where jsonb_typeof(ballot#>array['scoringReferences',g->>'id']) is distinct from 'object')
group by season, week, mode
union all
select 'submission time unavailable', season, week, mode, count(*), null, null from b where coalesce(ballot->>'origin','') ~* 'submission time unavailable'
group by season, week, mode
order by 1, 2, 3, 4;`;

function serviceEnv() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url || '')) fail('Set SUPABASE_URL to the hosted project URL (https://<ref>.supabase.co) in the environment.');
  if (!key || key.length < 20) fail('Set SUPABASE_SERVICE_ROLE_KEY in the environment (never in a committed file).');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function postgrest(service, route, options, fetchImpl) {
  const response = await fetchImpl(new URL(route, service.url), { redirect: 'error', signal: AbortSignal.timeout(15000), ...options, headers: { ...service.headers, ...options.headers } });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = null; }
  // Error detail is the database code or message (for example GTL_REFERENCE_IMPORT_CONFLICT), never a credential.
  if (!response.ok) fail(`${route.split('?')[0]} failed (${response.status}): ${body?.message || body?.code || 'no detail'}`);
  return body;
}

/** Runs the RPC once per file against the hosted project with the service role. Resolves the commissioner when --actor is absent. */
export async function executeReferenceLineImport(payloads, { fetchImpl = fetch } = {}) {
  const service = serviceEnv();
  if (!payloads.length || payloads.some(p => !p.p_ruling || !p.p_reference?.decision)) fail('Build the payloads with --decision first.');
  let actor = payloads[0].p_actor;
  if (!actor) {
    const rows = await postgrest(service, `/rest/v1/gtl_memberships?${new URLSearchParams({ select: 'user_id', league_id: `eq.${COMMISSIONER_LEAGUE}`, role: 'eq.commissioner', active: 'eq.true', limit: '2' })}`, { method: 'GET' }, fetchImpl);
    if (!Array.isArray(rows) || rows.length !== 1 || !UUID_PATTERN.test(rows[0]?.user_id || '')) fail('Could not resolve exactly one active commissioner; pass --actor.');
    actor = rows[0].user_id;
  }
  const results = [];
  for (const payload of payloads) {
    const result = await postgrest(service, `/rest/v1/rpc/${RPC}`, { method: 'POST', body: JSON.stringify({ ...payload, p_actor: actor }) }, fetchImpl);
    if (!result || typeof result !== 'object' || typeof result.imported !== 'boolean') fail('Unexpected RPC result.');
    results.push(result);
  }
  return results;
}

function parseArgs(argv) {
  const options = { actor: null, decision: null, execute: false, sql: false, writePayload: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--actor') options.actor = argv[++i];
    else if (arg === '--decision') options.decision = argv[++i];
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--sql') options.sql = true;
    else if (arg === '--write-payload') options.writePayload = true;
    else fail(`Unknown argument ${arg}. Usage: [--decision D-nn] [--actor <uuid>] [--sql] [--execute] [--write-payload]`);
  }
  if ((options.sql || options.execute) && !options.decision) fail('--sql and --execute need --decision D-nn: the number Sean\'s ruling on these reference lines is recorded under in docs/DECISIONS.md.');
  // The written statements must run through execute_sql unchanged, so they never carry a placeholder actor.
  if (options.sql && !options.actor) fail("--sql needs --actor <commissioner uuid>. Look it up first: select user_id from public.gtl_memberships where league_id='sean-troy-luke' and role='commissioner' and active;");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.decision) verifyDecision(options.decision, fs.readFileSync(path.join(repoRoot, DECISIONS_FILE), 'utf8'));
    const { payloads, document, summary } = buildReferenceLineImport({ actor: options.actor, decision: options.decision });
    if (options.writePayload) {
      const file = path.join(repoRoot, PAYLOAD_FILE);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
      summary.payloadFile = PAYLOAD_FILE;
    }
    if (options.sql) {
      const dir = path.join(repoRoot, '.local');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, 'reference-lines-import.sql');
      fs.writeFileSync(file, sqlStatements(payloads), { mode: 0o600 });
      summary.sqlFile = path.relative(repoRoot, file);
    }
    if (!options.execute) {
      console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
      console.log(`\nRead-only pre-flight on the hosted project (counts only):\n${preflightSql()}\n\nMCP alternative (written by --sql to .local/, never committed):\n${sqlTemplate()}\n\nVerify after import:\n${verifySql()}`);
      console.log('\nRun with --decision D-nn and --execute, with SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY in the environment, to import.');
    } else {
      const results = await executeReferenceLineImport(payloads);
      console.log(JSON.stringify({ dryRun: false, ...summary, results }, null, 2));
      console.log(results.every(r => r.imported) ? '\nImported. Verify with the select printed by the dry run.' : '\nAlready imported earlier with identical content where imported is false; nothing changed for those files.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
