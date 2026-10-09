// D-25: prepare and (with --execute) run the commissioner-ruled hosted import of
// Ben's on-time Week 5 spread ballot through the service-only RPC
// public.gtl_import_ruled_ballot (migration 20261009160000). Community leaderboard
// and feed only; no group roster or standings row is written.
//
//   node scripts/import-ruled-ballot.mjs --user <Ben's hosted auth user uuid>            # dry run: counts and hashes, never the picks
//   node scripts/import-ruled-ballot.mjs --user <uuid> --sql                             # also writes .local/ruled-ballot-import.sql (private, 0600)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ruled-ballot.mjs --user <uuid> [--actor <commissioner uuid>] --execute
//
// Sean, or the cloud session acting on his go, runs --execute from a machine that
// holds the service-role key in its environment. Nothing here reads a committed
// credential, hard-codes an account id, or prints a pick value.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seed } from '../server/store.mjs';
import { accuracy, round } from '../server/domain.mjs';
import { UUID_PATTERN } from '../cloud/lobby.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const PICKS_FILE = 'data/picks/2026-week-05-ben.json';
// The committed source stays byte-identical; a changed file is reconciled by hand, never imported.
export const PICKS_SHA256 = '538b007d3251edeb0951fa966b52eda73a91810862e71447e5d0bf4c1165b05b';
export const RPC = 'gtl_import_ruled_ballot';
export const DECISION = 'D-25';
const COMMISSIONER_LEAGUE = 'sean-troy-luke';

const fail = message => { throw new Error(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const halfPoint = value => Number.isFinite(value) && Number.isInteger(value * 2) && Math.abs(value) <= 100;
const instant = value => { const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toISOString() : fail(`Invalid timestamp in ${PICKS_FILE}: ${value}`); };

/**
 * Reads the committed picks file, validates it against the committed Week 5 slate
 * (server/store.mjs seed()) and the ruled eDraft snapshot, and returns the RPC
 * payload plus a summary that carries counts and hashes only.
 */
export function buildRuledImport({ user, actor = null } = {}) {
  if (!UUID_PATTERN.test(user || '')) fail('Pass --user <uuid>: the imported player\'s hosted auth user id.');
  if (actor !== null && !UUID_PATTERN.test(actor)) fail('--actor must be the commissioner\'s hosted auth user id (uuid).');
  const bytes = fs.readFileSync(path.join(root, PICKS_FILE));
  const fileSha256 = sha256(bytes);
  if (fileSha256 !== PICKS_SHA256) fail(`${PICKS_FILE} changed (sha256 ${fileSha256}); reconcile the file before importing.`);
  const doc = JSON.parse(bytes.toString('utf8'));
  if (doc.schema !== 'legacy-week5-picks' || doc.mode !== 'guess_the_line' || doc.player !== 'Ben' || doc.status !== 'on_time_commissioner_relayed') fail(`Unexpected document shape in ${PICKS_FILE}.`);
  const state = seed();
  if (doc.season !== state.league.season || doc.week !== state.league.week || doc.game_id !== state.league.id) fail('The picks file and the committed Week 5 slate disagree on season, week or game.');
  const submittedAt = instant(doc.submitted_at), deadline = instant(doc.deadline);
  if (deadline !== instant(state.league.deadline)) fail('The picks file deadline does not match the committed slate deadline.');
  if (Date.parse(submittedAt) >= Date.parse(deadline)) fail('The recorded submission time is not before the deadline; D-25 covers an on-time ballot only.');
  if (!Array.isArray(doc.picks) || doc.picks.length !== state.games.length) fail(`Expected ${state.games.length} picks, found ${Array.isArray(doc.picks) ? doc.picks.length : 'none'}.`);
  const scoring = doc.scoring || {};
  if (scoring.status !== 'provisional_commissioner_ruled' || typeof scoring.ruling !== 'string' || !scoring.ruling.includes(DECISION) || typeof scoring.snapshot !== 'string') fail('The picks file carries no commissioner ruling.');
  const snapshotFile = scoring.snapshot;
  if (!/^data\/snapshots\/[A-Za-z0-9._-]+\.json$/.test(snapshotFile)) fail('Unexpected snapshot path in the ruling.');
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, snapshotFile), 'utf8'));
  if (snapshot.season !== doc.season || snapshot.week !== doc.week || !/^https:\/\//.test(snapshot.source_url || '') || !snapshot.source) fail('The ruled snapshot has incomplete source metadata.');
  const capturedAt = instant(snapshot.snapshot_at), observedAt = instant(snapshot.source_page_updated_at);
  if (Date.parse(observedAt) > Date.parse(capturedAt) || Date.parse(capturedAt) > Date.parse(submittedAt)) fail('The ruled snapshot was not captured before the recorded submission time.');
  const picks = {}, values = {};
  let total = 0;
  for (const pick of doc.picks) {
    const game = state.games.find(g => g.matchup === pick.matchup);
    if (!game || picks[game.id] !== undefined) fail(`Unknown or duplicate matchup in ${PICKS_FILE}.`);
    if (pick.player !== 'Ben' || pick.eligible_for_scoring !== true || pick.schedule_status !== 'verified') fail(`Pick for ${pick.matchup} is not an eligible verified entry.`);
    if (!halfPoint(pick.predicted_home_spread) || !halfPoint(pick.spread) || ![game.home, game.away].includes(pick.favorite)) fail(`Invalid pick value for ${pick.matchup}.`);
    if (pick.predicted_home_spread !== (pick.favorite === game.home ? pick.spread : -pick.spread)) fail(`Home-referenced value disagrees with the favorite for ${pick.matchup}.`);
    const reference = snapshot.games.find(g => g.matchup === pick.matchup);
    if (!reference || !Number.isFinite(reference.consensus_home_spread) || reference.consensus_home_spread !== pick.consensus_home_spread || reference.status !== 'available') fail(`The ruled reference for ${pick.matchup} is missing or differs from the snapshot.`);
    if (Math.abs(reference.consensus_home_spread) > 100) fail(`Out-of-range reference for ${pick.matchup}.`);
    const points = accuracy(pick.predicted_home_spread, pick.consensus_home_spread);
    if (Math.abs(points - pick.points) > 0.001) fail(`Recorded points for ${pick.matchup} do not match the ruled reference.`);
    picks[game.id] = pick.predicted_home_spread; values[game.id] = pick.consensus_home_spread; total += points;
  }
  total = round(total);
  if (Math.abs(total - scoring.total_points) > 0.001 || scoring.max_points !== state.games.length * 10) fail('The recorded total does not match the per-game points.');
  const payload = {
    p_actor: actor, p_user: user, p_season: doc.season, p_week: doc.week, p_mode: 'guess_spread', p_picks: picks, p_submitted_at: submittedAt,
    p_ruling: scoring.ruling,
    p_reference: { decision: DECISION, source: `${snapshot.source} consensus · commissioner-ruled`, sourceUrl: snapshot.source_url, snapshot: snapshotFile, capturedAt, observedAt, values },
  };
  const summary = {
    decision: DECISION, file: PICKS_FILE, fileSha256, snapshot: snapshotFile, season: doc.season, week: doc.week, mode: payload.p_mode,
    games: state.games.length, picks: Object.keys(picks).length, references: Object.keys(values).length,
    submittedAt, deadline, capturedAt, observedAt, expectedPoints: total, maxPoints: scoring.max_points,
    ballotSha256: sha256(canonical({ season: doc.season, week: doc.week, mode: payload.p_mode, picks, submittedAt, values })),
    user: `${user.slice(0, 8)}…`, actor: actor ? `${actor.slice(0, 8)}…` : `resolved from gtl_memberships (${COMMISSIONER_LEAGUE} commissioner) at --execute`,
  };
  return { payload, summary };
}

const literal = value => `'${String(value).replaceAll("'", "''")}'`;
/** The exact statement the cloud session can run through the Supabase MCP instead of --execute. Contains the picks: private. */
export function sqlStatement(payload, { actor = '<commissioner auth.users id>' } = {}) {
  return `select public.${RPC}(${literal(payload.p_actor || actor)}::uuid, ${literal(payload.p_user)}::uuid, ${payload.p_season}, ${payload.p_week}, ${literal(payload.p_mode)}, `
    + `${literal(JSON.stringify(payload.p_picks))}::jsonb, ${literal(payload.p_submitted_at)}::timestamptz, ${literal(payload.p_ruling)}, ${literal(JSON.stringify(payload.p_reference))}::jsonb) as result;\n`;
}
/** The same statement with the private parts replaced, safe to print. */
export const sqlTemplate = () => `select public.${RPC}('<commissioner uuid>'::uuid, '<player uuid>'::uuid, 2026, 5, 'guess_spread', '<p_picks json from .local/ruled-ballot-import.sql>'::jsonb, '<p_submitted_at>'::timestamptz, '<p_ruling>', '<p_reference json>'::jsonb) as result;`;
/** Verification select for the runbook: counts and the ruling, never pick values. */
export const verifySql = () => `select i.user_id, p.display_name, i.season, i.week, i.mode, i.submitted_at, i.decision, i.payload_sha256,
  (select count(*) from jsonb_object_keys(b.ballot->'picks')) as picks, (select count(*) from jsonb_object_keys(b.ballot->'scoringReferences')) as "references",
  (select id from public.gtl_feed_posts f where f.dedupe_key=format('ballot:%s:%s:%s:%s',i.user_id,i.season,i.week,i.mode)) as post_id,
  (select count(*) from public.gtl_memberships m where m.user_id=i.user_id) as roster_rows
from public.gtl_ruled_ballot_imports i join public.gtl_profiles p on p.user_id=i.user_id
join public.gtl_weekly_ballots b on (b.user_id,b.season,b.week,b.mode)=(i.user_id,i.season,i.week,i.mode) order by i.recorded_at;`;

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
  // Error detail is the database code or message (for example GTL_COMMUNITY_FORBIDDEN), never a credential.
  if (!response.ok) fail(`${route.split('?')[0]} failed (${response.status}): ${body?.message || body?.code || 'no detail'}`);
  return body;
}

/** Runs the RPC against the hosted project with the service role. Resolves the commissioner when --actor is absent. */
export async function executeRuledImport(payload, { fetchImpl = fetch } = {}) {
  const service = serviceEnv();
  let actor = payload.p_actor;
  if (!actor) {
    const rows = await postgrest(service, `/rest/v1/gtl_memberships?${new URLSearchParams({ select: 'user_id', league_id: `eq.${COMMISSIONER_LEAGUE}`, role: 'eq.commissioner', active: 'eq.true', limit: '2' })}`, { method: 'GET' }, fetchImpl);
    if (!Array.isArray(rows) || rows.length !== 1 || !UUID_PATTERN.test(rows[0]?.user_id || '')) fail('Could not resolve exactly one active commissioner; pass --actor.');
    actor = rows[0].user_id;
  }
  const result = await postgrest(service, `/rest/v1/rpc/${RPC}`, { method: 'POST', body: JSON.stringify({ ...payload, p_actor: actor }) }, fetchImpl);
  if (!result || typeof result !== 'object' || typeof result.imported !== 'boolean') fail('Unexpected RPC result.');
  return result;
}

function parseArgs(argv) {
  const options = { user: null, actor: null, execute: false, sql: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user') options.user = argv[++i];
    else if (arg === '--actor') options.actor = argv[++i];
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--sql') options.sql = true;
    else fail(`Unknown argument ${arg}. Usage: --user <uuid> [--actor <uuid>] [--sql] [--execute]`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const { payload, summary } = buildRuledImport({ user: options.user, actor: options.actor });
    if (options.sql) {
      const dir = path.join(root, '.local');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, 'ruled-ballot-import.sql');
      fs.writeFileSync(file, sqlStatement(payload), { mode: 0o600 });
      summary.sqlFile = path.relative(root, file);
    }
    if (!options.execute) {
      console.log(JSON.stringify({ dryRun: true, ...summary, rpc: RPC }, null, 2));
      console.log(`\nMCP alternative (the private statement with the picks is written by --sql to .local/, never committed):\n${sqlTemplate()}\n\nVerify after import:\n${verifySql()}`);
      console.log('\nRun with --execute and SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY in the environment to import.');
    } else {
      const result = await executeRuledImport(payload);
      console.log(JSON.stringify({ dryRun: false, ...summary, result }, null, 2));
      console.log(result.imported ? '\nImported. Verify with the select printed by the dry run.' : '\nAlready imported earlier with identical content; nothing changed.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
