#!/usr/bin/env node
// Print one read-only query for an authenticated administrator to run. No network, credentials or hosted writes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, readMigrations } from './migration-functions.mjs';

export function eplFunctionExpectations(entries = readMigrations()) {
  return [...catalog(entries).latest.entries()]
    .filter(([name]) => name.startsWith('public.gtl_epl_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, fn]) => ({ name: name.slice('public.'.length), md5: fn.md5, file: fn.file }));
}

const quote = value => `'${value.replaceAll("'", "''")}'`;

export function eplOperationsPreflightSql(entries = readMigrations()) {
  const expected = eplFunctionExpectations(entries);
  if (!expected.length) throw new Error('No EPL function definitions found.');
  return `-- EPL operational readback. Generated from this checkout's latest migration bodies.
-- Run on the intended hosted project using an authenticated administrator. SELECT only.
-- No snapshot payloads, picks, queues, user IDs, endpoints, capabilities or cron commands are returned.
with expected(name, md5, migration) as (values
${expected.map(fn => `  (${quote(fn.name)}, ${quote(fn.md5)}, ${quote(fn.file)})`).join(',\n')}
), functions as (
  select e.name, e.md5 as expected_md5, e.migration,
    p.oid::regprocedure::text as signature, md5(p.prosrc) as actual_md5,
    coalesce(md5(p.prosrc)=e.md5,false) as source_matches, p.prosecdef as security_definer, p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
  from expected e left join (pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public') on p.proname=e.name
), runs as (
  select job,status,reason,count(*) as count,max(started_at) as latest_started_at,max(finished_at) as latest_finished_at
  from public.gtl_epl_job_runs where started_at>=clock_timestamp()-interval '7 days' group by job,status,reason
)
select jsonb_build_object(
  'checkedAt',clock_timestamp(),
  'functions',coalesce((select jsonb_agg(to_jsonb(f) order by f.name,f.signature) from functions f),'[]'::jsonb),
  'tables',coalesce((select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
    'anonSelect',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedSelect',has_table_privilege('authenticated',c.oid,'SELECT')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'gtl_epl_%'),'[]'::jsonb),
  'weeks',coalesce((select jsonb_agg(to_jsonb(w) order by w.season,w.week) from (
    select season,week,window_start,window_end,first_kickoff,status,seeded from public.gtl_epl_weeks) w),'[]'::jsonb),
  'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.captured_at,s.label) from (
    select label,captured_at,week,sha256 from public.gtl_epl_snapshots) s),'[]'::jsonb),
  'schedule',coalesce((select jsonb_agg(jsonb_build_object('job',job,'enabled',enabled) order by job) from public.gtl_epl_jobs_schedule),'[]'::jsonb),
  'runsLast7Days',coalesce((select jsonb_agg(to_jsonb(r) order by r.job,r.status,r.reason) from runs r),'[]'::jsonb),
  'cron',coalesce((select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active) order by jobname)
    from cron.job where jobname like 'gtl-epl-%'),'[]'::jsonb),
  'budget',(select jsonb_build_object('remaining',conservative_remaining,'paused',paused)
    from public.gtl_odds_budget where provider='the-odds-api')
) as epl_operations_readback;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) { console.error('Usage: node scripts/epl-operations-preflight.mjs'); process.exitCode = 2; }
  else process.stdout.write(eplOperationsPreflightSql());
}
