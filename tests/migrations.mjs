// The migration lists every PGlite test and spec applies (stage 3 of docs/REDESIGN_BUILD_PLAN.md), so no stage
// hand-edits a long list and CI tests the order the hosted project has.
//
//   ALL     every repo migration in filename (apply) order. New specs and suites use ALL.
//   HOSTED  ALL minus NOT_HOSTED: the schema players actually have. community-world.mjs, the old-app specs,
//           personas/harness.mjs and the old-app SQL suites use HOSTED (until stage 81).
//
// A migration PR adds its version to NOT_HOSTED; the apply record (Gate M step 8) removes it. A merged file that
// Sean chose not to apply stays listed. The two files that install pg_cron and pg_net (hosted-only extensions,
// no gtl_ object) are in neither list: PGlite cannot load them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
export const ROLLBACK_DIR = fileURLToPath(new URL('../supabase/rollback/', import.meta.url));
/** The PGlite stand-in for the Supabase roles and auth schema that every migration expects. */
export const PRELUDE = 'create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;';

/** Repo migrations that are not applied to the hosted project, by version (the filename's 14-digit timestamp). */
export const NOT_HOSTED = [
  20261013030000, // D-28 web push: Sean's separate call (stage 2); two MCP applies timed out and nothing was applied.
  20261014190000, // M-09 game_notes (redesign stage 27): private game notes, awaiting "apply M-09".
];
/**
 * Migrations after the stage 3 cut-off that replace a function but ship without a supabase/rollback/ file because
 * they are fix-forward only (Gate M step 9: M-13, M-21 and M-23 add themselves here). By version.
 */
export const FIX_FORWARD = [];

export const version = file => Number(path.basename(file).slice(0, 14));
export const FILES = fs.readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
/** Install pg_cron and pg_net on the hosted project only. */
export const EXTENSION_ONLY = FILES.filter(file => /scheduler_extension/.test(file));

// Rollback check (tests/rollback.test.mjs): GTL_ROLLBACK_CHECK={"migration":path,"rollback":path?} reruns a suite on
// HOSTED plus that migration, with its rollback applied straight after it. Never set it by hand for a normal run.
const check = process.env.GTL_ROLLBACK_CHECK ? JSON.parse(process.env.GTL_ROLLBACK_CHECK) : null;
const extra = check ? path.basename(check.migration) : null;

export const ALL = [...new Set([...FILES.filter(file => !EXTENSION_ONLY.includes(file)), ...(extra ? [extra] : [])])].sort();
export const HOSTED = ALL.filter(file => file === extra || !NOT_HOSTED.includes(version(file)));

/** The SQL to apply for a file in ALL or HOSTED (in a rollback check, the checked migration followed by its rollback). */
export function migrationSql(file) {
  if (check && file === extra) {
    return [check.migration, ...(check.rollback ? [check.rollback] : [])].map(source => fs.readFileSync(source, 'utf8')).join('\n');
  }
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}
