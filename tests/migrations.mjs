// The migration lists every PGlite test and spec applies (stage 3 of docs/REDESIGN_BUILD_PLAN.md), so no stage
// hand-edits a long list. CI applies them in filename order. The hosted project applied two files the other way round
// (20261013010000 as 20261013040845 before 20261012234500 as 20261013050416); they share no function, so the result is
// the same.
//
//   ALL     every repo migration in filename (apply) order. New specs and suites use ALL.
//   HOSTED  ALL minus NOT_HOSTED: the schema players actually have. community-world.mjs, the old-app specs,
//           personas/harness.mjs and the old-app SQL suites use HOSTED (until stage 81).
//
// A migration PR adds its version to NOT_HOSTED; the apply record (Gate M step 8) moves it to APPLIED (at the end of
// this file). Every file in ALL is in exactly one of the two lists (tests/migrations.test.mjs), so a PR that forgets its
// NOT_HOSTED line fails instead of quietly moving the old-app suites onto a schema players do not have. A merged file
// that Sean chose not to apply stays in NOT_HOSTED. The two files that install pg_cron and pg_net (hosted-only
// extensions, no gtl_ object) are in neither list: PGlite cannot load them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
export const ROLLBACK_DIR = fileURLToPath(new URL('../supabase/rollback/', import.meta.url));
/** The PGlite stand-in for the Supabase roles and auth schema that every migration expects. Supabase databases run in
 *  UTC, but PGlite starts in a fixed offset taken from the host (Etc/GMT+8 on a Mac in Pacific time), which changes how a
 *  timestamptz reads in a jsonb reply ("…-08:00" instead of "…+00:00"); the session is set to UTC as on the hosted project and CI. */
export const PRELUDE = "set timezone to 'UTC';create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;";

/** Repo migrations that are not applied to the hosted project, by version (the filename's 14-digit timestamp). */
export const NOT_HOSTED = [
  20261015190710, // M-07 per-game locks and immediate personal scoring; not applied.
  20261014221500, // M-05 (stage 22) Monday-night lines: applied alone on a Tuesday or Wednesday after Sean's "apply M-05".
  20261015010000, // M-06 lines_read (redesign stage 23): the gated lines readers, applied after M-01 and M-02 on "apply M-06".
  20261015020000, // M-08 guess_picks_reader (redesign stage 26): everyone's picks, applied after M-01 on Sean's "apply M-08".
  20261015030000, // M-02 sent_picks_final (redesign stage 18): locked-in picks are final, applied alone (Fri-Sat) on "apply M-02".
  20261015040000, // M-03 guess_week_forfeit (redesign stage 19): skip and "See picks now", applied after M-01 on "apply M-03".
  20261015050000, // M-04 social_line_lock (redesign stage 21): the real-slip line gate, applied after M-01 on Sean's "apply M-04".
  20261015120000, // D-47 wind_refresh_schedule: weather every 24 h, then 12 h and 2 h before kickoff; Gate M apply on Sean's approval.
  20261015190820, // M-10 bets_read (stage 40): account-level Bets reader; apply after M-01 and M-04 on Sean's "apply M-10".
];
/**
 * Migrations after the stage 3 cut-off that replace a function but ship without a supabase/rollback/ file because
 * they are fix-forward only (Gate M step 9: M-13, M-21 and M-23 add themselves here). By version.
 */
export const FIX_FORWARD = [];
/**
 * Repo migrations that a migration must follow and that the hosted project does not have yet, by version: the build plan
 * ledger's "Apply after" (section 6), for a migration whose functions or rollback call another unapplied file's functions.
 * The rollback check (tests/rollback.test.mjs) builds HOSTED plus these before the checked migration, which is the schema the
 * hosted project will have when it is applied. An entry goes with the apply record that takes the required file out of
 * NOT_HOSTED (tests/rollback.test.mjs fails while an entry names a hosted file).
 */
export const REQUIRES = Object.freeze({
  20261015190710: [20261014221500,20261015010000,20261015020000,20261015030000,20261015040000],
  20261015190820: [20261015050000],
});

export const version = file => Number(path.basename(file).slice(0, 14));
export const FILES = fs.readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
/** Install pg_cron and pg_net on the hosted project only. */
export const EXTENSION_ONLY = FILES.filter(file => /scheduler_extension/.test(file));

// Rollback check (tests/rollback.test.mjs): GTL_ROLLBACK_CHECK={"migration":path,"rollback":path?} reruns a suite on
// HOSTED plus that migration (and the files it REQUIRES), with its rollback applied straight after it. Never set it by hand
// for a normal run.
const check = process.env.GTL_ROLLBACK_CHECK ? JSON.parse(process.env.GTL_ROLLBACK_CHECK) : null;
const extra = check ? path.basename(check.migration) : null;
const required = extra ? REQUIRES[version(extra)] ?? [] : [];

export const ALL = [...new Set([...FILES.filter(file => !EXTENSION_ONLY.includes(file)), ...(extra ? [extra] : [])])].sort();
export const HOSTED = ALL.filter(file => file === extra || required.includes(version(file)) || !NOT_HOSTED.includes(version(file)));

/** The SQL to apply for a file in ALL or HOSTED (in a rollback check, the checked migration followed by its rollback). */
export function migrationSql(file) {
  if (check && file === extra) {
    return [check.migration, ...(check.rollback ? [check.rollback] : [])].map(source => fs.readFileSync(source, 'utf8')).join('\n');
  }
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

/**
 * Repo migrations applied to the hosted project, by repo version: with NOT_HOSTED, a closed list (tests/migrations.test.mjs
 * fails on a file in neither or both). The hosted versions differ from the filenames; the release records and the release
 * checklist's repair lists (docs/SOCIAL_COMMUNITY.md, step 2) map them.
 */
export const APPLIED = [
  20261008164249, // gtl_private_cloud_state
  20261008174007, // gtl_profiles_private_games_invites
  20261008182836, // gtl_canonical_weekly_entries
  20261008185715, // gtl_weekly_eligibility_rulings
  20261008185738, // gtl_manual_odds_collection
  20261008192528, // gtl_scoped_spread_benchmark
  20261008200926, // gtl_twelve_hour_odds_refresh
  20261008224444, // gtl_personal_workspace
  20261008224735, // gtl_reviewed_quote_selections
  20261008225401, // gtl_submission_time_scoring
  20261008225607, // gtl_reviewed_final_results
  20261008232055, // gtl_fresh_submission_odds
  20261008240000, // gtl_virtual_units
  20261009005145, // gtl_social_bet_tracker
  20261009120000, // gtl_community_feed
  20261009130000, // gtl_league_interest
  20261009140000, // gtl_d23_data_rule
  20261009150000, // gtl_auto_open_week
  20261009160000, // gtl_ruled_ballot_import
  20261009170000, // gtl_virtual_units_settlement
  20261009190000, // gtl_virtual_units_save_isfinite
  20261012213000, // gtl_submission_odds_window
  20261012223000, // gtl_community_history
  20261012230000, // gtl_submit_with_line_at_guess
  20261012234500, // gtl_game_officials
  20261013010000, // gtl_line_at_guess_reads
  20261013030000, // gtl_web_push_reminders (D-28): hosted as 20261013030000 on October 14, 2026
  20261013060000, // gtl_wind_forecasts
  20261014223000, // M-01 gtl_guess_gate_per_game: hosted as 20261014223000 on October 14, 2026
  20261014224500, // M-09 gtl_game_notes: hosted as 20261014224500 on October 14, 2026
  20261014233000, // M-29 gtl_favorite_keeps_note: hosted as 20261014233000 on October 14, 2026
  20261015143006, // D-48 recommended virtual pick: hosted as 20261015143006 on October 15, 2026.
];
