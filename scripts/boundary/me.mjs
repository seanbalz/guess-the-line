// Boundary probes for Me: the personal workspace (favorites, journal, forecasts and the Community ballot
// path through /personal), D-28 web push reminders and the coming-soon league interest (D-36 puts
// "More sports" in Me). Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { missingId } from './fixtures.mjs';

export const tables = Object.freeze([
  // account_preferences joins table probes only after its apply record; local SQL tests deny both browser roles now.
  'personal_versions', 'favorites', 'journal_entries', 'personal_forecasts', 'personal_events', 'personal_receipts', 'league_interest',
  'push_subscriptions', 'push_reminders_sent', 'push_reminder_schedule', 'push_reminder_runs',
]);

export const rpcChecks = Object.freeze([
  ['gtl_read_account_preferences', { p_user: missingId }],
  ['gtl_save_account_preferences', { p_user: missingId, p_revision: 0, p_value: { sportsbooks: [], guidanceCollapsed: false } }],
  ['gtl_personal_context', { p_user: missingId, p_season: 2026, p_week: 5 }],
  ['gtl_read_personal', { p_user: missingId }],
  ['gtl_personal_history', { p_user: missingId, p_entry: missingId }],
  ['gtl_mutate_personal', { p_user: missingId, p_action: 'favorite/set', p_body: {} }],
  // M-09 private game notes (20261014224500_gtl_game_notes.sql, redesign stage 27): two service-only RPCs.
  // Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_read_game_notes', { p_user: missingId, p_season: 2026, p_week: 5 }],
  ['gtl_set_game_note', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 5, p_game: 'AAA-BBB', p_note: '', p_revision: 0 }],
  // D-28 web push reminders (20261013030000): device subscriptions and the reminder scheduler are service-only.
  ['gtl_push_subscribe', { p_user: missingId, p_endpoint: 'https://fcm.googleapis.com/fcm/send/boundary-check', p_p256dh: `B${'A'.repeat(86)}`, p_auth: 'A'.repeat(22) }],
  ['gtl_push_unsubscribe', { p_user: missingId, p_endpoint: 'https://fcm.googleapis.com/fcm/send/boundary-check' }],
  ['gtl_push_status', { p_user: missingId, p_endpoint: null }],
  ['gtl_dispatch_push_reminders', {}],
  ['gtl_claim_push_reminders', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_mark_push_reminder', { p_run: missingId, p_claim: missingId, p_user: missingId, p_season: 2026, p_week: 6, p_modes: ['guess_spread'] }],
  ['gtl_record_push_delivery', { p_run: missingId, p_claim: missingId, p_endpoint: 'https://fcm.googleapis.com/fcm/send/boundary-check', p_outcome: 'failed' }],
  ['gtl_complete_push_reminders', { p_run: missingId, p_claim: missingId, p_reason: 'nothing_due', p_sent: 0, p_failed: 0 }],
]);

export const apiChecks = Object.freeze([
  ['me/preferences', {}],
  ['me/preferences/save', {}],
  ['personal', undefined],
  ['personal/read', {}],
  ['personal/ballot', {}],
  ['personal/forecast', {}],
  ['favorite/set', {}],
  ['journal/create', {}],
  ['journal/correct', {}],
  ['journal/archive', {}],
  ['journal/history', { entryId: missingId }],
  // M-09 private notes routes: signed-out probes prove only authentication protection.
  ['personal/notes', {}],
  ['personal/note', {}],
  ['push/status', {}],
  ['push/subscribe', {}],
  ['push/unsubscribe', {}],
]);

// D-28: the reminder worker accepts only a one-run capability (expects gtl-push-reminders to be deployed).
export const workerChecks = Object.freeze([
  ['scheduled reminders', 'gtl-push-reminders', { runId: missingId }],
]);

export const awaitingDeploy = Object.freeze({
  'rpc/gtl_read_account_preferences': 'migration 20261016011000_gtl_account_preferences.sql',
  'rpc/gtl_save_account_preferences': 'migration 20261016011000_gtl_account_preferences.sql',
  'gtl-api/me/preferences': 'the gtl-api deploy with /me/preferences',
  'gtl-api/me/preferences/save': 'the gtl-api deploy with /me/preferences/save',
});
