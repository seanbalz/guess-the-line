import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
// Reserved fixtures cannot identify a real account, recipient, game or invite.
const missingId = '00000000-0000-0000-0000-000000000000';
const missingLeague = `g_${'0'.repeat(32)}`;
const actor = { p_user_id: missingId };
const fixtureEmail = 'boundary-check@example.invalid';
const rpcChecks = [
  ['gtl_read_social', { p_user: missingId, p_season: null, p_week: null, p_all: false }],
  ['gtl_commit_social', { p_user: missingId, p_season: 2026, p_week: 5, p_expected_revision: 0, p_request_id: missingId, p_action: 'create', p_body: {}, p_state: {} }],
  ['gtl_follow_social', { p_user: missingId, p_request_id: missingId, p_target: missingId, p_following: false }],
  ['gtl_save_profile', { ...actor, p_display_name: 'Boundary check' }],
  ['gtl_lobby', { ...actor, p_email: fixtureEmail }],
  ['gtl_create_league', { ...actor, p_name: 'Boundary check', p_format: 'duel', p_practice: true, p_request_id: missingId }],
  ['gtl_create_invite', { ...actor, p_actor_email: fixtureEmail, p_league_id: missingLeague, p_email: fixtureEmail, p_token_hash: '0'.repeat(64), p_request_id: missingId }],
  ['gtl_list_invites', { ...actor, p_league_id: missingLeague }],
  ['gtl_accept_invite', { ...actor, p_email: fixtureEmail, p_token_hash: null, p_invite_id: missingId }],
  ['gtl_revoke_invite', { ...actor, p_league_id: missingLeague, p_invite_id: missingId }],
  ['gtl_weekly_slate', { p_state: {} }],
  ['gtl_submission_reference', { p_payload: {}, p_game: {}, p_market: 'spread', p_saved: null }],
  ['gtl_submission_intent_context', { p_user: missingId, p_intent: {} }],
  ['gtl_preflight_submission', { p_user: missingId, p_intent: {} }],
  ['gtl_begin_submission_odds_collection', { p_user: missingId, p_request: missingId, p_intent: {}, p_operation: 'preflight' }],
  ['gtl_finish_submission_odds_collection', { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null }],
  // gtl_guard_fresh_submission returns trigger, so its invoker/grant boundary
  // is checked in fresh-submission-sql.test.mjs, not as a callable REST RPC.
  ['gtl_weekly_context', { p_user: missingId, p_league: missingLeague }],
  ['gtl_read_weekly_state', { p_user: missingId, p_league: missingLeague }],
  ['gtl_save_weekly_ballot', { p_user: missingId, p_league: missingLeague, p_mode: 'guess_spread', p_revision: 0, p_picks: {}, p_submit: false }],
  ['gtl_save_weekly_selection', { p_user: missingId, p_league: missingLeague, p_revision: 0, p_selection: {} }],
  ['gtl_odds_commissioner', { p_user: missingId }],
  ['gtl_begin_odds_collection', { p_user: missingId, p_request: missingId, p_operation: 'preflight' }],
  ['gtl_finish_odds_collection', { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null }],
  ['gtl_read_market_snapshot', { p_user: missingId, p_league: missingLeague }],
  ['gtl_benchmark_candidate', { p_payload: {}, p_games: [], p_actual: null }],
  ['gtl_read_scoring_benchmark', { p_user: missingId, p_league: missingLeague }],
  ['gtl_freeze_benchmark', { p_user: missingId, p_league: missingLeague, p_request: missingId, p_actual: null, p_source: 'https://example.invalid/boundary-check' }],
  ['gtl_dispatch_odds_refresh', {}],
  ['gtl_claim_odds_refresh', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_odds_refresh', { p_run: missingId, p_claim: missingId, p_reason: 'provider_failed' }],
  ['gtl_read_odds_schedule', { p_user: missingId, p_league: missingLeague }],
  ['gtl_personal_context', { p_user: missingId, p_season: 2026, p_week: 5 }],
  ['gtl_read_personal', { p_user: missingId }],
  ['gtl_personal_history', { p_user: missingId, p_entry: missingId }],
  ['gtl_mutate_personal', { p_user: missingId, p_action: 'favorite/set', p_body: {} }],
  ['gtl_review_final_result', { p_user: missingId, p_body: {} }],
  ['gtl_read_reviewed_results', { p_user: missingId, p_league: missingLeague }],
  ['gtl_read_virtual_units', { p_user: missingId, p_league: missingLeague }],
  ['gtl_save_virtual_units_pick', { p_user: missingId, p_league: missingLeague, p_revision: 0, p_body: {} }],
  ['gtl_settle_virtual_units', { p_season: 2026, p_week: 5, p_results: { source: 'Boundary check', games: [] } }],
];
const apiChecks = [
  ...['read','create','tail','settle','include','correct','follow'].map(action => [`social/${action}`, {}]),
  ['state?mode=guess_spread', undefined],
  ['lobby', undefined],
  ['profile', { displayName: 'Boundary check' }],
  ['leagues', { name: 'Boundary check', format: 'duel', practice: true, requestId: missingId }],
  [`invites?league=${missingLeague}`, undefined],
  [`invites?league=${missingLeague}`, { email: fixtureEmail, requestId: missingId }],
  ['invite/accept', { inviteId: missingId }],
  [`invite/revoke?league=${missingLeague}`, { inviteId: missingId }],
  ['odds/preflight', { requestId: missingId }],
  ['odds/collect', { requestId: missingId }],
  [`benchmark/freeze?league=${missingLeague}`, { requestId: missingId, actualKickoff: null, sourceURL: 'https://example.invalid/boundary-check' }],
  ['personal', undefined],
  ['personal/read', {}],
  ['personal/ballot', {}],
  ['personal/forecast', {}],
  ['favorite/set', {}],
  ['journal/create', {}],
  ['journal/correct', {}],
  ['journal/archive', {}],
  ['journal/history', { entryId: missingId }],
  ['results/review', {}],
  ['virtual-units', undefined],
  ['virtual-pick', {}],
  ['virtual-units/settle', {}],
];

export async function checkCloudBoundary({ url, key, fetchImpl = fetch, log = console.log }) {
  assert.ok(/^https:\/\/onmrgvcehkflfaizvedl\.supabase\.co$/.test(url || ''), 'Unexpected cloud project URL.');
  assert.ok(/^sb_publishable_/.test(key || ''), 'A publishable key is required.');
  const requests = [
    ...['social_weeks', 'social_commits', 'social_follows', 'social_follow_receipts', 'leagues', 'memberships', 'profiles', 'schedule_templates', 'invites', 'access_audit', 'prediction_archives', 'weekly_slates', 'weekly_versions', 'weekly_ballots', 'weekly_selections', 'weekly_eligibility_rulings', 'odds_budget', 'odds_collections', 'submission_odds_intents', 'market_snapshots', 'benchmark_policies', 'frozen_benchmarks', 'odds_schedule', 'odds_refresh_runs', 'personal_versions', 'favorites', 'journal_entries', 'personal_forecasts', 'personal_events', 'personal_receipts', 'result_review_lock', 'reviewed_result_events', 'feed_posts', 'feed_likes', 'feed_comments', 'community_removals', 'league_interest', 'weekly_optouts', 'week_open_schedule', 'week_open_runs', 'virtual_units_picks', 'virtual_units_settlements'].map(table => ({
      name: `anonymous ${table} table`, route: `/rest/v1/gtl_${table}?select=*&limit=1`, statuses: [401, 403], database: true,
    })),
    ...rpcChecks.map(([rpc, body]) => ({
      name: `anonymous ${rpc} RPC`, route: `/rest/v1/rpc/${rpc}`, body, statuses: [401, 403], database: true,
    })),
    ...apiChecks.flatMap(([route, body]) => [false, true].map(invalidSession => ({
      name: `${body ? 'POST' : 'GET'} ${route.split('?')[0]} ${invalidSession ? 'with invalid session' : 'without session'}`,
      route: `/functions/v1/gtl-api/${route}`, body, statuses: [401], invalidSession,
    }))),
    ...[false, true].map(invalidMachineToken => ({
      name: `POST scheduled refresh ${invalidMachineToken ? 'with invalid machine token' : 'without machine token'}`,
      route: '/functions/v1/gtl-odds-refresh', body: { runId: missingId }, statuses: [401], invalidMachineToken,
    })),
    ...[['net', 'http_request_queue'], ['cron', 'job'], ['vault', 'decrypted_secrets']].map(([schema, table]) => ({
      name: `anonymous ${schema} schema`, route: `/rest/v1/${table}?select=id&limit=0`, statuses: [406], schema,
    })),
  ];
  for (const { name, route, body, statuses, database, invalidSession, invalidMachineToken, schema } of requests) {
    const headers = { apikey: key, ...(invalidSession ? { Authorization: 'Bearer invalid-test-token' } : {}), ...(invalidMachineToken ? { Authorization: `Bearer ${'0'.repeat(64)}` } : {}), ...(schema ? { 'Accept-Profile': schema } : {}) };
    const response = await fetchImpl(url + route, {
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const text = await response.text();
    assert.ok(statuses.includes(response.status), `${name}: unexpected ${response.status}`);
    assert.ok(!/TB-DAL|"(?:ballots|originalPick|token_hash|vault_secret_id|decrypted_secret|claim_token|accepted_by|providerEventId|conservative_remaining|lease_token|approved_by|favorites|journal|forecasts|stakeMinor|returnedMinor|previous_result|reviewed_at|reviewedAt|resultReview|intent|picks|scoringReferences|quotes|changedGameIds)"\s*:/.test(text), `${name}: private material in denied response`);
    let result;
    try { result = JSON.parse(text); } catch { assert.fail(`${name}: non-JSON denial response`); }
    // Missing tables/functions and unrelated gateway failures do not prove grants.
    if (database) assert.ok(result.code === '42501', `${name}: expected database permission denial`);
    if (schema) assert.equal(result.code, 'PGRST106', `${name}: expected unexposed schema denial`);
    log(`${name}: denied (${response.status})`);
  }
  return requests.length;
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
  assert.ok(process.argv.slice(2).every(arg => arg === '--bundle-only'), 'Only --bundle-only is supported.');
  scanFrontend(path.join(root, '.local/cloud-dist'));
  console.log('Cloud frontend: no private state, contacts, source files or server credentials found.');
  if (!process.argv.includes('--bundle-only')) {
    process.loadEnvFile(path.join(root, '.env.cloud'));
    await checkCloudBoundary({ url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY });
  }
  console.log('Signed-out API denials verify authentication protection, not route existence behind the gateway.');
  console.log('These checks do not verify a real player login, authenticated access denial, concurrent database transactions, email delivery or a cross-device save.');
}
