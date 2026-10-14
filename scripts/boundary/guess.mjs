// Boundary probes for Guess the Line: weekly ballots and Challenge selections, submission-time scoring
// and the line at the guess, reference imports, scoring benchmarks, reviewed results, sit-outs, the weekly
// open and Community history. scripts/check-cloud-boundary.mjs joins the area files in the order guess,
// lines, bets, league, me (redesign build plan, stage 4). A new table, RPC, route or worker joins its
// area's file; while it is not hosted yet, it is also listed in that file's awaitingDeploy.
import { missingId, missingLeague } from './fixtures.mjs';

/** Tables, without the `gtl_` prefix: each is read anonymously and must be denied. */
export const tables = Object.freeze([
  'prediction_archives', 'weekly_slates', 'weekly_versions', 'weekly_ballots', 'weekly_selections', 'weekly_eligibility_rulings',
  'submission_odds_intents', 'reference_line_imports', 'reference_lines', 'reference_line_voids', 'benchmark_policies', 'frozen_benchmarks',
  'result_review_lock', 'reviewed_result_events', 'weekly_optouts', 'week_open_schedule', 'week_open_runs', 'ruled_ballot_imports',
]);

/** [rpc, inert body]: each is called anonymously and must be denied. */
export const rpcChecks = Object.freeze([
  ['gtl_weekly_slate', { p_state: {} }],
  ['gtl_submission_reference', { p_payload: {}, p_game: {}, p_market: 'spread', p_saved: null }],
  ['gtl_submission_intent_context', { p_user: missingId, p_intent: {} }],
  ['gtl_preflight_submission', { p_user: missingId, p_intent: {} }],
  ['gtl_begin_submission_odds_collection', { p_user: missingId, p_request: missingId, p_intent: {}, p_operation: 'preflight' }],
  ['gtl_finish_submission_odds_collection', { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null }],
  // D-27 (20261012230000) line-at-guess helpers and the pending-reference resolver: service-only.
  ['gtl_line_from_snapshot', { p_payload: {}, p_game: {}, p_market: 'spread' }],
  ['gtl_pending_reference', { p_saved: null }],
  ['gtl_reference_at_save', { p_season: 2026, p_week: 5, p_signature: {}, p_game: {}, p_market: 'spread', p_saved: null }],
  ['gtl_resolve_pending_reference', { p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game_id: 'AAA-BBB', p_pending: {} }],
  ['gtl_resolve_pending_references', { p_season: 2026, p_week: 5 }],
  // Line at the guess for ballots saved without a line and D-08 eligibility in the community (20261013010000): service-only.
  // They report `unexpected 404` until that migration is applied to the hosted project.
  ['gtl_slate_game', { p_season: 2026, p_week: 5, p_signature: {}, p_game_id: 'AAA-BBB' }],
  ['gtl_ballot_eligible', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_origin_practice: false }],
  ['gtl_submission_time_unknown', { p_ballot: {} }],
  ['gtl_guess_instant', { p_ballot: {}, p_audit: [], p_game_id: 'AAA-BBB' }],
  ['gtl_line_at_guess', { p_season: 2026, p_week: 5, p_signature: {}, p_game: null, p_market: 'spread', p_guessed: null }],
  ['gtl_ballot_pick_scores', { p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_ballot: {}, p_audit: [] }],
  ['gtl_import_reference_lines', { p_actor: missingId, p_season: 2026, p_week: 5, p_file: 'data/snapshots/boundary-check.json', p_file_sha256: '0'.repeat(64), p_ruling: 'boundary check only', p_reference: {} }],
  ['gtl_void_reference_line_import', { p_actor: missingId, p_import: missingId, p_decision: 'D-0', p_reason: 'boundary check only' }],
  // gtl_guard_fresh_submission returns trigger, so its invoker/grant boundary
  // is checked in fresh-submission-sql.test.mjs, not as a callable REST RPC.
  ['gtl_weekly_context', { p_user: missingId, p_league: missingLeague }],
  ['gtl_read_weekly_state', { p_user: missingId, p_league: missingLeague }],
  ['gtl_save_weekly_ballot', { p_user: missingId, p_league: missingLeague, p_mode: 'guess_spread', p_revision: 0, p_picks: {}, p_submit: false }],
  ['gtl_save_weekly_selection', { p_user: missingId, p_league: missingLeague, p_revision: 0, p_selection: {} }],
  ['gtl_benchmark_candidate', { p_payload: {}, p_games: [], p_actual: null }],
  ['gtl_read_scoring_benchmark', { p_user: missingId, p_league: missingLeague }],
  ['gtl_freeze_benchmark', { p_user: missingId, p_league: missingLeague, p_request: missingId, p_actual: null, p_source: 'https://example.invalid/boundary-check' }],
  ['gtl_review_final_result', { p_user: missingId, p_body: {} }],
  ['gtl_read_reviewed_results', { p_user: missingId, p_league: missingLeague }],
  // D-25 commissioner-ruled import: service-only, never callable from a browser role.
  ['gtl_import_ruled_ballot', { p_actor: missingId, p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_picks: {}, p_submitted_at: null, p_ruling: 'boundary check only', p_reference: {} }],
  // Community history (October 12, 2026 ruling): three service-only readers from 20261012223000_gtl_community_history.sql.
  // They report `unexpected 404` until that migration is applied to the hosted project.
  ['gtl_read_community_history', { p_user: missingId, p_season: null, p_now: null }],
  ['gtl_history_reference', { p_season: 2026, p_week: 5, p_signature: {}, p_game: {}, p_market: 'spread', p_submitted: null }],
  ['gtl_pick_points', { p_guess: 0, p_reference: 0 }],
  // M-01, the per-game Guess reveal gate (20261014223000_gtl_guess_gate_per_game.sql, redesign stage 16): four service-only
  // helpers and the live rules gtl-api reads through cloud/live-rules.mjs (section 3.4). Awaiting deploy (below) until the
  // migration is applied to the hosted project.
  ['gtl_guess_locked_in', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'AAA-BBB' }],
  ['gtl_guess_revealed', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'AAA-BBB', p_now: null }],
  ['gtl_markets_visible', { p_user: missingId, p_season: 2026, p_week: 5, p_now: null }],
  ['gtl_ballot_late', { p_ballot: {} }],
  ['gtl_live_rules', {}],
  // M-08, everyone's picks (20261015020000_gtl_guess_picks_reader.sql, redesign stage 26): one service-only reader behind
  // POST /community/picks. Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_read_guess_picks', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: null, p_target: null, p_now: null }],
]);

/** [gtl-api route, body or undefined for GET]: each is called signed out and with an invalid session and must answer 401. */
export const apiChecks = Object.freeze([
  ['community/history', {}],
  // M-08 (awaitingDeploy until the gtl-api deploy that carries it): signed-out probes prove only authentication protection.
  ['community/picks', { mode: 'guess_spread' }],
  ['state?mode=guess_spread', undefined],
  [`benchmark/freeze?league=${missingLeague}`, { requestId: missingId, actualKickoff: null, sourceURL: 'https://example.invalid/boundary-check' }],
  ['results/review', {}],
]);

/** [log name, Edge Function, body]: scheduled workers called without and with an invalid machine token; each must answer 401. */
export const workerChecks = Object.freeze([]);

/** Probes for pieces written here but not hosted yet; see awaitingDeploy in scripts/check-cloud-boundary.mjs. */
export const awaitingDeploy = Object.freeze({
  // M-01: remove these five with the release record of its hosted apply (Gate M step 8).
  'rpc/gtl_guess_locked_in': 'migration 20261014223000_gtl_guess_gate_per_game.sql',
  'rpc/gtl_guess_revealed': 'migration 20261014223000_gtl_guess_gate_per_game.sql',
  'rpc/gtl_markets_visible': 'migration 20261014223000_gtl_guess_gate_per_game.sql',
  'rpc/gtl_ballot_late': 'migration 20261014223000_gtl_guess_gate_per_game.sql',
  'rpc/gtl_live_rules': 'migration 20261014223000_gtl_guess_gate_per_game.sql',
  // M-08: remove these two with the release record of its hosted apply and the gtl-api deploy (Gate M step 8).
  'rpc/gtl_read_guess_picks': 'migration 20261015020000_gtl_guess_picks_reader.sql',
  'gtl-api/community/picks': 'the gtl-api deploy with /community/picks',
});
