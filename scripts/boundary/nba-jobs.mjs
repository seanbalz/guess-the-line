// NBA build-out N2 (M-49, 20261112040000_gtl_nba_slate_lines.sql, not applied): the gtl-nba-jobs slate and lines storage.
// Eight service-only tables and the service-only RPCs; joined by scripts/boundary/bets.mjs with the other NBA probes. Inert
// probes: every run and claim is the reserved missing id, every token is all zeros and every payload is empty, so even a
// regressed grant could neither queue, claim, reserve nor write anything. The gtl-nba-jobs worker joins bets.mjs workerChecks
// with its deploy record: a worker probe has no not-deployed answer, so listing it before the deploy would fail check:cloud.
import { missingId } from './fixtures.mjs';

export const MIGRATION = '20261112040000 gtl_nba_slate_lines (M-49, NBA N2): not applied; it waits for Sean\'s "apply M-49"';
export const tables = Object.freeze(['nba_jobs_schedule', 'nba_job_runs', 'nba_budget', 'nba_games', 'nba_game_observations', 'nba_slate_reads',
  'nba_line_attempts', 'nba_lines']);
export const rpcChecks = Object.freeze([
  ['gtl_dispatch_nba_jobs', { p_job: 'none' }],
  ['gtl_nba_claim_job', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_nba_finish_job', { p_run: missingId, p_claim: missingId, p_reason: null, p_detail: null }],
  ['gtl_nba_publish_slate', { p_run: missingId, p_claim: missingId, p_date: null, p_observed_at: null, p_games: [], p_summary: {} }],
  ['gtl_nba_lines_due', { p_run: missingId, p_claim: missingId }],
  ['gtl_nba_begin_lines_read', { p_run: missingId, p_claim: missingId, p_game_date: null }],
  ['gtl_nba_finish_lines_read', { p_attempt: missingId, p_lease: missingId, p_quota: null, p_error: null, p_lines: [] }],
  ['gtl_nba_shadow_gate', {}],
  ['gtl_nba_lines_plan', { p_stamp: null }],
  ['gtl_nba_month_spent', { p_month_start: null }],
]);
// Until M-49 is applied, each of these answers the exact "does not exist" reply and is reported as awaiting deploy. The apply
// record removes every entry; from then on a missing piece is an unexpected 404 and every probe must deny.
export const awaitingDeploy = Object.freeze(Object.fromEntries([
  ...tables.map(table => [`table/${table}`, MIGRATION]),
  ...rpcChecks.map(([rpc]) => [`rpc/${rpc}`, MIGRATION]),
]));
