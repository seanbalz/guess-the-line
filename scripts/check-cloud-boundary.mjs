import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as guess from './boundary/guess.mjs';
import * as lines from './boundary/lines.mjs';
import * as bets from './boundary/bets.mjs';
import * as league from './boundary/league.mjs';
import * as me from './boundary/me.mjs';

const root = path.resolve(import.meta.dirname, '..');
// The probe lists live in one file per area (redesign build plan, stage 4), so parallel server stages
// each edit only their own: scripts/boundary/{guess,lines,bets,league,me}.mjs. They are joined here in
// that order; tests/boundary-areas.test.mjs keeps every probe from before the split, exactly once.
export const BOUNDARY_AREAS = Object.freeze({ guess, lines, bets, league, me });
const areas = Object.values(BOUNDARY_AREAS);
const tables = areas.flatMap(area => area.tables);
const rpcChecks = areas.flatMap(area => area.rpcChecks);
const apiChecks = areas.flatMap(area => area.apiChecks);
const workerChecks = areas.flatMap(area => area.workerChecks);
/**
 * Probes for hosted pieces that are written but not yet applied or deployed. Each still has to deny
 * like any other probe once it exists. Until then only the exact "does not exist yet" answer passes
 * (PostgREST's PGRST202 for a missing function, gtl-api's own "Not found." for a missing route), and it
 * is reported as awaiting deploy, never as denied. `--strict` turns that answer into a failure: run it
 * after the deploy, then remove the entries from their area file in the change that records the hosted version.
 *
 * Each area file lists its own pieces; today scripts/boundary/lines.mjs has the situational-trends referee pieces, the
 * D-34 kickoff wind pieces and M-05's carryover helper, and scripts/boundary/guess.mjs has M-01's four per-game gate
 * helpers and gtl_live_rules (redesign stage 16: service-only SQL; no deployed route calls the helpers, and gtl-api reads
 * gtl_live_rules through cloud/optional-rpc.mjs, which answers today's rules while it is missing, so the default check
 * passes until Sean applies M-01).
 * Both the gtl-api build and the Pages build fall back cleanly while the wind pieces are missing (the trends panel keeps its
 * "no current forecast" note), so a Pages-only deploy, or a gtl-api deploy before the migration is
 * applied, must not fail check:cloud on them alone; --strict runs after the migration and the gtl-api deploy.
 * The Community history readers (20261012223000), the D-27 line-at-guess helpers (20261012230000) and the
 * /community/history route are deliberately not listed: any of them that is missing fails the default
 * check with `unexpected 404`, which is the release checklist's gate for applying those migrations hosted
 * before the gtl-api deploy that needs them.
 * scripts/boundary/me.mjs lists M-09's private notes pieces (redesign stage 27): its two RPCs and the /personal/notes and
 * /personal/note routes. Nothing calls them until the new app's note field (stage 35), and a gtl-api deploy before the
 * apply answers those routes 503 "not available right now", so neither order fails check:cloud on them alone.
 * scripts/boundary/lines.mjs also lists M-06's lines readers (redesign stage 23): its four RPCs and the /lines/read and
 * /lines/game routes. The gtl-api deploy comes first (until the apply both routes answer 503 "not available right now"),
 * nothing calls them until stages 32 to 34, and the private-key pattern below includes the lines reply keys.
 * scripts/boundary/guess.mjs also lists M-08's everyone's picks pieces (redesign stage 26): gtl_read_guess_picks and the
 * /community/picks route. Nothing calls them until the new app's Everyone's picks (stage 31), and a gtl-api deploy before
 * the apply answers the route 503 "not available right now", so neither order fails check:cloud on them alone.
 * scripts/boundary/guess.mjs also lists M-03's skip and "See picks now" pieces (redesign stage 19): gtl_forfeit_markets,
 * gtl_forfeit_guess_week, gtl_read_forfeit and the /community/forfeit route. Nothing calls the route until the new app's
 * ForfeitDialog (stage 30); a gtl-api deploy before the apply answers it 503 "not available right now" and leaves
 * /community/read without `forfeit`, so neither order fails check:cloud on them alone. Its table, gtl_week_forfeits, joins
 * the table probes with the apply record, as the D-34 wind tables did.
 */
export const awaitingDeploy = Object.freeze(Object.assign({}, ...areas.map(area => area.awaitingDeploy)));

export const privateResponse = /TB-DAL|"(?:ballots|originalPick|token_hash|vault_secret_id|decrypted_secret|claim_token|accepted_by|providerEventId|conservative_remaining|lease_token|approved_by|favorites|notes|journal|forecasts|stakeMinor|returnedMinor|previous_result|reviewed_at|reviewedAt|resultReview|intent|picks|scoringReferences|quotes|changedGameIds|books|movement|kickoffLine|lineAtGuess)"\s*:/;
const notDeployed = (key, status, result) => Object.hasOwn(awaitingDeploy, key) && status === 404
  && (key.startsWith('rpc/') ? result?.code === 'PGRST202' : result?.error === 'Not found.' && Object.keys(result).length === 1);

export async function checkCloudBoundary({ url, key, fetchImpl = fetch, log = console.log, strict = false }) {
  assert.ok(/^https:\/\/onmrgvcehkflfaizvedl\.supabase\.co$/.test(url || ''), 'Unexpected cloud project URL.');
  assert.ok(/^sb_publishable_/.test(key || ''), 'A publishable key is required.');
  const requests = [
    ...tables.map(table => ({
      name: `anonymous ${table} table`, route: `/rest/v1/gtl_${table}?select=*&limit=1`, statuses: [401, 403], database: true,
    })),
    ...rpcChecks.map(([rpc, body]) => ({
      name: `anonymous ${rpc} RPC`, route: `/rest/v1/rpc/${rpc}`, body, statuses: [401, 403], database: true, pending: `rpc/${rpc}`,
    })),
    ...apiChecks.flatMap(([route, body]) => [false, true].map(invalidSession => ({
      name: `${body ? 'POST' : 'GET'} ${route.split('?')[0]} ${invalidSession ? 'with invalid session' : 'without session'}`,
      route: `/functions/v1/gtl-api/${route}`, body, statuses: [401], invalidSession, pending: `gtl-api/${route.split('?')[0]}`,
    }))),
    ...workerChecks.flatMap(([label, worker, body]) => [false, true].map(invalidMachineToken => ({
      name: `POST ${label} ${invalidMachineToken ? 'with invalid machine token' : 'without machine token'}`,
      route: `/functions/v1/${worker}`, body, statuses: [401], invalidMachineToken,
    }))),
    ...[['net', 'http_request_queue'], ['cron', 'job'], ['vault', 'decrypted_secrets']].map(([schema, table]) => ({
      name: `anonymous ${schema} schema`, route: `/rest/v1/${table}?select=id&limit=0`, statuses: [406], schema,
    })),
  ];
  const awaiting = [];
  for (const { name, route, body, statuses, database, invalidSession, invalidMachineToken, schema, pending } of requests) {
    const headers = { apikey: key, ...(invalidSession ? { Authorization: 'Bearer invalid-test-token' } : {}), ...(invalidMachineToken ? { Authorization: `Bearer ${'0'.repeat(64)}` } : {}), ...(schema ? { 'Accept-Profile': schema } : {}) };
    const response = await fetchImpl(url + route, {
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const text = await response.text();
    if (!strict && !statuses.includes(response.status) && pending && Object.hasOwn(awaitingDeploy, pending)) {
      let missing = null;
      try { missing = JSON.parse(text); } catch { /* Not the not-deployed answer; the checks below fail it. */ }
      if (notDeployed(pending, response.status, missing)) {
        assert.ok(!privateResponse.test(text), `${name}: private material in not-found response`);
        awaiting.push({ name, until: awaitingDeploy[pending] });
        log(`${name}: awaiting deploy (404, not found) until ${awaitingDeploy[pending]}`);
        continue;
      }
    }
    assert.ok(statuses.includes(response.status), `${name}: unexpected ${response.status}`);
    assert.ok(!privateResponse.test(text), `${name}: private material in denied response`);
    let result;
    try { result = JSON.parse(text); } catch { assert.fail(`${name}: non-JSON denial response`); }
    // Missing tables/functions and unrelated gateway failures do not prove grants.
    if (database) assert.ok(result.code === '42501', `${name}: expected database permission denial`);
    if (schema) assert.equal(result.code, 'PGRST106', `${name}: expected unexposed schema denial`);
    log(`${name}: denied (${response.status})`);
  }
  return { checked: requests.length, denied: requests.length - awaiting.length, awaiting };
}

const privateDirectories = new Set(['data', 'server', 'cloud', 'supabase', 'src', 'scripts', 'tests', 'config', 'planning', '.git', '.github', '.local', 'node_modules']);
const privateFilename = /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|package(?:-lock)?\.json|\d{4}-week-\d{2}.*\.json)$|\.(?:sql|map|mjs|ts|tsx|jsx|md)$/i;
const privateMaterial = /sb_secret_[A-Za-z0-9_-]{12,}|SUPABASE_SERVICE_ROLE_KEY|"originalPick"\s*:|"TB-DAL"\s*:\s*-9\.5|2026-week-05-[A-Za-z0-9_-]+\.json|data\/(?:picks|snapshots)\/|\.local\/state\.json|sourceMappingURL\s*=/;
const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,63}\b/gi;

export function scanFrontend(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Symbolic link in cloud frontend.');
    if (entry.isDirectory()) {
      assert.ok(!privateDirectories.has(entry.name), 'Private or source directory in cloud frontend.');
      scanFrontend(file);
    } else {
      assert.ok(!privateFilename.test(entry.name), 'Private or source file in cloud frontend.');
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!privateMaterial.test(text), 'Private material in cloud frontend.');
      for (const [token] of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        let claims;
        try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { continue; }
        assert.ok(claims?.role !== 'service_role', 'Privileged token in cloud frontend.');
      }
      // Generic contact detection: never embed a real recipient in this checker,
      // and never print matched addresses or file content, even on failure.
      for (const [email] of text.matchAll(emailPattern)) {
        const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
        assert.ok(/(?:^|\.)example\.(?:com|net|org)$|\.(?:invalid|test|localhost)$/.test(domain), 'Non-example email address in cloud frontend.');
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--bundle-only' || arg === '--strict'), 'Only --bundle-only and --strict are supported.');
  scanFrontend(path.join(root, '.local/cloud-dist'));
  console.log('Cloud frontend: no private state, contacts, source files or server credentials found.');
  if (!process.argv.includes('--bundle-only')) {
    process.loadEnvFile(path.join(root, '.env.cloud'));
    const result = await checkCloudBoundary({ url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, strict: process.argv.includes('--strict') });
    console.log(`${result.denied} live denials${result.awaiting.length ? `; ${result.awaiting.length} awaiting deploy, not verified: ${[...new Set(result.awaiting.map(a => a.until))].join('; ')}` : ''}.`);
  }
  console.log('Signed-out API denials verify authentication protection, not route existence behind the gateway.');
  console.log('These checks do not verify a real player login, authenticated access denial, concurrent database transactions, email delivery or a cross-device save.');
}
