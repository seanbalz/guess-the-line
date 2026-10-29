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
  'result_review_lock', 'reviewed_result_events', 'weekly_optouts', 'week_open_schedule', 'week_open_runs', 'ruled_ballot_imports', 'week_forfeits',
  // P-03 (hosted since October 26, 2026, RELEASE_2026_10_26_POINTS_JOBS.md): the Points job schedule and its run queue.
  'points_job_schedule', 'points_job_runs',
  // M-32 (hosted October 29, 2026): private EPL moneyline guesses and append-only history.
  'epl_guesses', 'epl_guess_history',
  // M-33 is pending; absence is reported separately from a verified permission denial.
  'epl_stat_rechecks',
]);

/** [rpc, inert body]: each is called anonymously and must be denied. */
export const rpcChecks = Object.freeze([
  // M-32: service-only. No real actor/event, valid guess, or clock is supplied to a writer.
  ['gtl_epl_moneyline_distance', { p_guess: -100, p_real: 100 }],
  ['gtl_epl_guess_json', { p_g: null, p_kickoff: null, p_at: null }],
  ['gtl_epl_save_guess', { p_user: missingId, p_event_id: 'boundary-missing-event', p_club: 'invalid', p_price: 0, p_lock: false, p_now: null }],
  ['gtl_epl_resolve_pending_references', { p_event_id: 'boundary-missing-event' }],
  ['gtl_epl_guess_board', { p_user: missingId, p_season: 2026, p_week: 0 }],
  ['gtl_epl_guess_leaderboard', { p_season: 0 }],
  // M-33: no real job capability, actor, valid week or snapshot is supplied.
  ['gtl_epl_recheck_due_at', { p_last_kickoff: null, p_original_at: null }],
  ['gtl_epl_recheck_state', { p_run: missingId, p_claim: missingId, p_now: null }],
  ['gtl_epl_record_recheck', { p_run: missingId, p_claim: missingId, p_season: 0, p_week: 0, p_captured_at: null, p_sha256: {}, p_payload: null }],
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
  // helpers and the live rules gtl-api reads through cloud/live-rules.mjs (section 3.4). Since stage 20, /virtual-units and
  // /virtual-pick also read gtl_markets_visible through the optional-RPC caller (cloud/line-lock.mjs), which falls back to
  // today's gate while it is missing. Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_guess_locked_in', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'AAA-BBB' }],
  ['gtl_guess_revealed', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'AAA-BBB', p_now: null }],
  ['gtl_markets_visible', { p_user: missingId, p_season: 2026, p_week: 5, p_now: null }],
  ['gtl_ballot_late', { p_ballot: {} }],
  ['gtl_live_rules', {}],
  // M-08, everyone's picks (20261015020000_gtl_guess_picks_reader.sql, redesign stage 26): one service-only reader behind
  // POST /community/picks. Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_read_guess_picks', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: null, p_target: null, p_now: null }],
  // M-02, sent picks final (20261015030000_gtl_sent_picks_final.sql, redesign stage 18): the service-only lock-in reading the
  // writers, the guard and gtl_guess_locked_in share. Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_ballot_locked_in', { p_ballot: {}, p_game: 'AAA-BBB' }],
  // M-07 helpers are service-only, including the own-score reader; never browser callable.
  ['gtl_ballot_has_locked', { p_ballot: {} }],
  ['gtl_guess_game_open', { p_season: 2026, p_week: 5, p_game: 'AAA-BBB', p_now: null }],
  ['gtl_guess_late', { p_ballot: {}, p_game: 'AAA-BBB' }],
  ['gtl_prepare_guess_ballot', { p_season: 2026, p_week: 5, p_mode: 'invalid', p_prior: {}, p_picks: {}, p_submit: false, p_lock_in: [], p_stamp: null }],
  ['gtl_resolution_before_kickoff', { p_season: 2026, p_week: 5, p_game: 'AAA-BBB', p_ref: {} }],
  ['gtl_valid_pending_resolution', { p_season: 2026, p_week: 5, p_mode: 'invalid', p_before: {}, p_after: {} }],
  ['gtl_guess_score_receipt', { p_user: missingId, p_season: 2026, p_week: 5, p_mode: 'invalid', p_now: null }],
  // M-03, skip and "See picks now" (20261015040000_gtl_guess_week_forfeit.sql, redesign stage 19): the writer behind
  // POST /community/forfeit, the reader /community/read carries as `forfeit`, and their market helper, all service-only.
  // Awaiting deploy (below) until the migration is applied to the hosted project. The probes name no real member and the
  // writer's reason is invalid, so even a wrongly granted call would refuse before writing.
  ['gtl_forfeit_markets', { p_user: missingId, p_season: 2026, p_week: 5 }],
  ['gtl_forfeit_guess_week', { p_user: missingId, p_season: 2026, p_week: 5, p_reason: 'boundary-check', p_now: null }],
  ['gtl_read_forfeit', { p_user: missingId, p_season: 2026, p_week: 5, p_now: null }],
  // P-01, Guess the Points core (20261023180000_gtl_points_core.sql, D-56): every callable service-only function. The
  // routes call four of them (cloud/points.mjs POINTS_RPCS). Hosted since October 23, 2026 (hosted as 20261024000059). The probes
  // name no real member, slate or player; the writers' request id is unused and every body would refuse before writing.
  ['gtl_points_slot_points', { p_guess: 0, p_actual: 0 }],
  ['gtl_points_kickoff_window', { p_kickoff: '2026-10-25T17:00:00Z' }],
  ['gtl_points_finalize_at', { p_opens_at: '2026-10-20T19:00:00Z' }],
  ['gtl_points_slate_problem', { p_slots: [] }],
  ['gtl_points_slot_outcomes', { p_season: 2026, p_week: 5, p_now: null }],
  ['gtl_points_week_scores', { p_season: 2026, p_week: 5, p_now: null }],
  ['gtl_points_revealed', { p_viewer: missingId, p_season: 2026, p_week: 5, p_slot: 'QB', p_now: null }],
  ['gtl_points_write', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 5, p_slot: 'QB', p_guess: -1, p_lock: false }],
  ['gtl_points_save_draft', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 5, p_slot: 'QB', p_guess: -1 }],
  ['gtl_points_lock_in', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 5, p_slot: 'QB', p_guess: -1 }],
  ['gtl_points_read', { p_viewer: missingId, p_season: 2026, p_week: 5, p_group: null, p_now: null }],
  ['gtl_points_load_actuals', { p_payload: {} }],
  ['gtl_points_finalize', { p_season: 2026, p_week: 5 }],
  ['gtl_points_publish_slate', { p_actor: missingId, p_action: 'preview', p_season: 2026, p_week: 5, p_slate: null }],
  // P-03, Guess the Points scheduled jobs (20261026120000_gtl_points_jobs.sql, D-56): the cron-only dispatcher, the
  // gtl-points-jobs worker's claim and complete, and its service-only jobs-state read. The capability is all zeros, the run
  // and claim name no run and the season is out of range, so a wrongly granted claim, complete or read refuses before it
  // reads or writes anything. Hosted as 20261026213106 since October 26, 2026 (RELEASE_2026_10_26_POINTS_JOBS.md); its two
  // tables are in the table probes above and the gtl-points-jobs worker (deployed the same day) in workerChecks below.
  ['gtl_dispatch_points_jobs', {}],
  ['gtl_claim_points_jobs', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_points_jobs', { p_run: missingId, p_claim: missingId, p_reason: null, p_summary: null }],
  ['gtl_points_jobs_state', { p_season: 1999 }],
]);

/** [gtl-api route, body or undefined for GET]: each is called signed out and with an invalid session and must answer 401. */
export const apiChecks = Object.freeze([
  ['community/history', {}],
  // M-08 (hosted since October 19, 2026): signed-out probes prove only authentication protection.
  ['community/picks', { mode: 'guess_spread' }],
  // M-03 (hosted since October 19, 2026): signed-out probes prove only authentication protection.
  ['community/forfeit', { season: 2026, week: 5, reason: 'skip' }],
  ['state?mode=guess_spread', undefined],
  [`benchmark/freeze?league=${missingLeague}`, { requestId: missingId, actualKickoff: null, sourceURL: 'https://example.invalid/boundary-check' }],
  ['results/review', {}],
  // Guess the Points routes (cloud/points.mjs, D-56): signed-out probes prove only authentication protection. A gtl-api
  // build with these routes answers them 404 "coming soon" while P-01 is missing; deployed since gtl-api v36 (October 23, 2026).
  ['points/read', {}],
  ['points/draft', { season: 2026, week: 5, slot: 'QB', guess: 0, requestId: missingId }],
  ['points/lock', { season: 2026, week: 5, slot: 'QB', guess: 0, requestId: missingId }],
  ['points/slate', { action: 'preview', season: 2026, week: 5 }],
  ['epl/admin/corrections/read', {}],
]);

/** [log name, Edge Function, body]: scheduled workers called without and with an invalid machine token; each must answer 401. */
export const workerChecks = Object.freeze([
  // P-03 (D-56): the Guess the Points jobs worker, deployed as gtl-points-jobs v1 on October 26, 2026.
  ['scheduled points jobs', 'gtl-points-jobs', { runId: missingId }],
]);

/** Probes for pieces written here but not hosted yet; see awaitingDeploy in scripts/check-cloud-boundary.mjs. */
// P-03's four functions left this list with its hosted apply (RELEASE_2026_10_26_POINTS_JOBS.md, Gate M step 8).
export const awaitingDeploy = Object.freeze({
  'table/epl_stat_rechecks': '20261029151727 (M-33 stat recheck apply / compatible API deploy)',
  'rpc/gtl_epl_recheck_due_at': '20261029151727 (M-33 stat recheck apply / compatible API deploy)',
  'rpc/gtl_epl_recheck_state': '20261029151727 (M-33 stat recheck apply / compatible API deploy)',
  'rpc/gtl_epl_record_recheck': '20261029151727 (M-33 stat recheck apply / compatible API deploy)',
  'gtl-api/epl/admin/corrections/read': '20261029151727 (M-33 stat recheck apply / compatible API deploy)',
});
