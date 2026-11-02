// Contract (i62): supabase/admin/points_jobs_cron_results.sql is admin-only and adds exactly three Points runs, Monday 02:30
// and 06:30 UTC and Tuesday 06:30 UTC, each calling the one dispatcher. The dispatcher queues one run per UTC clock hour, so
// no new job may share a clock hour (or a name, which would replace the job) with an installed Points job; the installed set
// is read from the admin files that registered it. Rollback lines stay commented out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../supabase/admin/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const live = sql => sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const DISPATCH = '$$select public.gtl_dispatch_points_jobs()$$';
const scheduled = sql => [...live(sql).matchAll(/select cron\.schedule\('([^']+)','([^']+)',([^)]*\)\$\$)\);/g)].map(([, name, cron, command]) => ({ name, cron, command }));

/** Every (UTC weekday, UTC hour) a five-field cron schedule fires in. Day of month and month must be '*'. */
function clockHours(cron) {
  const [minute, hour, dom, month, dow] = cron.split(' ');
  assert.equal(cron.split(' ').length, 5, cron);
  assert.ok(dom === '*' && month === '*', `${cron}: day-of-month and month are not used by any Points job`);
  assert.match(minute, /^\d+$/, `${cron}: one minute per hour`);
  const expand = (field, max) => field === '*' ? [...Array(max + 1).keys()] : field.split(',').flatMap(part => {
    const [from, to = from] = part.split('-').map(Number);
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from <= to && to <= max, `${cron}: ${part}`);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });
  return expand(dow, 6).flatMap(day => expand(hour, 23).map(h => `${day}:${h}`));
}

const results = read('points_jobs_cron_results.sql');
const added = scheduled(results);
// The installed jobs, as the hosted project holds them: the P-03 file, with the Tuesday jobs as the D-61 file re-registered them.
const installed = new Map([...scheduled(read('points_jobs_cron.sql')), ...scheduled(read('points_jobs_cron_d61.sql'))].map(job => [job.name, job]));

test('the installed Points jobs are the six registered on the hosted project (November 2, 2026)', () => {
  assert.deepEqual([...installed.values()].map(({ name, cron }) => `${name} ${cron}`).sort(), [
    'gtl-points-daily 30 11 * * *',
    'gtl-points-thursday-pdt 0 19 * * 4',
    'gtl-points-thursday-pst 0 20 * * 4',
    'gtl-points-tuesday-catchup 30 9-10,12-23 * * 2',
    'gtl-points-tuesday-open-pdt 0 7 * * 2',
    'gtl-points-tuesday-open-pst 0 8 * * 2',
  ]);
});

test('admin only; exactly the three result runs, each calling the dispatcher; nothing else is live', () => {
  assert.match(results, /^-- ADMIN ONLY/);
  assert.deepEqual(added.map(({ name, cron }) => `${name} ${cron}`), [
    'gtl-points-sunday-results 30 2 * * 1',
    'gtl-points-sunday-night-results 30 6 * * 1',
    'gtl-points-monday-night-results 30 6 * * 2',
  ]);
  for (const job of added) assert.equal(job.command, DISPATCH, job.name);
  const statements = live(results).split(';').map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, 4, 'three cron.schedule calls and one read-back');
  assert.match(statements[3], /^select jobname,schedule,active from cron\.job where jobname like 'gtl-points-%' order by jobname$/);
  assert.doesNotMatch(live(results), /cron\.unschedule|insert |update |delete |enabled\s*=\s*true/i, 'no live unschedule, write or enable');
});

test('no new job shares a name or a UTC clock hour with an installed job or with another new job', () => {
  const taken = new Map();
  for (const job of installed.values()) for (const slot of clockHours(job.cron)) taken.set(slot, job.name);
  for (const job of added) {
    assert.ok(!installed.has(job.name), `${job.name} would replace an installed job`);
    for (const slot of clockHours(job.cron)) {
      assert.ok(!taken.has(slot), `${job.name} shares clock hour ${slot} (weekday:hour UTC) with ${taken.get(slot)}`);
      taken.set(slot, job.name);
    }
  }
  assert.equal(new Set(added.map(job => job.name)).size, added.length);
});

test('the runs fall after Sunday\'s and Monday night\'s games, and Tuesday\'s before the 07:00 UTC open', () => {
  assert.deepEqual(added.map(job => clockHours(job.cron)), [['1:2'], ['1:6'], ['2:6']]);
  const tuesday = added.find(job => job.cron.endsWith(' * * 2')).cron.split(' ').map(Number);
  const at = tuesday[1] * 60 + tuesday[0];
  assert.ok(at > 5 * 60 + 33 && at < 7 * 60, 'after nflverse\'s Monday-night stats run (about 05:33 UTC), before the PDT open');
});

test('rollback: a commented unschedule line for each new job', () => {
  for (const job of added) assert.match(results, new RegExp(`^-- select cron\\.unschedule\\('${job.name}'\\);$`, 'm'), job.name);
});
