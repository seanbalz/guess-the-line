// Static checks on M-30 (EPL Pick a Team tables and RPCs). The file is written, never applied; PGlite is optional here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NOT_HOSTED } from './migrations.mjs';

const FILE = new URL('../supabase/migrations/20261028180000_gtl_epl_pick_a_team.sql', import.meta.url);
const exists = fs.existsSync(FILE);
const sql = exists ? fs.readFileSync(FILE, 'utf8') : '';
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

test('M-30 file exists and is listed in NOT_HOSTED', () => {
  assert.ok(exists, 'migration file missing');
  assert.ok(NOT_HOSTED.includes(20261028180000));
});

test('one pick per club per week is enforced by a unique constraint', () => {
  assert.match(code, /unique\s*\(\s*season\s*,\s*week\s*,\s*club\s*\)/i);
});

test('every table is created if not exists, has row level security and service-only grants', () => {
  const tables = [...code.matchAll(/create\s+table\s+(if\s+not\s+exists\s+)?(public\.\w+)/gi)];
  assert.ok(tables.length >= 12, `expected the 12 EPL tables, found ${tables.length}`);
  for (const [, ine, name] of tables) {
    assert.ok(ine, `${name} must be create table if not exists`);
    assert.match(code, new RegExp(`alter\\s+table\\s+${name.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${name} needs RLS`);
    assert.ok(new RegExp(`revoke\\s+all\\s+on[^;]*${name.replace('.', '\\.')}[^;]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`, 'i').test(code), `${name} needs revoke all`);
    assert.ok(new RegExp(`grant\\s+[^;]*on[^;]*${name.replace('.', '\\.')}[^;]*to\\s+service_role`, 'i').test(code), `${name} needs a service_role grant`);
  }
  assert.doesNotMatch(code, /create\s+policy/i);
  assert.doesNotMatch(code, /to\s+(anon|authenticated)\b/i);
});

test('no security definer; every function is create or replace, invoker, empty search_path', () => {
  assert.doesNotMatch(code, /security\s+definer/i);
  const fns = [...code.matchAll(/create\s+(or\s+replace\s+)?function\s+(public\.\w+)\s*\(([^)]*)\)/gi)];
  assert.equal(fns.length, 22);
  for (const [, orr, name] of fns) assert.ok(orr, `${name} must be create or replace`);
  assert.equal([...code.matchAll(/security\s+invoker\s+set\s+search_path\s*=\s*''/gi)].length, fns.length);
});

test('every function is revoked from the browser roles and granted to service_role (the cron-only dispatcher to nobody)', () => {
  const names = [...code.matchAll(/create\s+or\s+replace\s+function\s+(public\.\w+)\s*\(([^)]*)\)/gi)].map(m => m[1]);
  const granted = n => new RegExp(`grant\\s+execute\\s+on\\s+function[^;]*${n.replace('.', '\\.')}\\([^;]*to\\s+service_role`, 'i').test(code);
  for (const n of names) {
    assert.ok(new RegExp(`revoke\\s+all\\s+on\\s+function[^;]*${n.replace('.', '\\.')}\\(`, 'i').test(code), `${n} revoke`);
    if (n === 'public.gtl_epl_dispatch_jobs') assert.ok(!granted(n) && /revoke\s+all\s+on\s+function\s+public\.gtl_epl_dispatch_jobs\(text\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i.test(code), 'dispatcher is cron only');
    else assert.ok(granted(n), `${n} grant`);
  }
  for (const n of ['gtl_epl_member', 'gtl_epl_save_pick', 'gtl_epl_save_queue', 'gtl_epl_week_state', 'gtl_epl_upsert_fixtures', 'gtl_epl_upsert_prices',
    'gtl_epl_resolve_week', 'gtl_epl_settle_week', 'gtl_epl_save_snapshot', 'gtl_epl_link_manager', 'gtl_epl_seed_week', 'gtl_epl_set_week_window',
    'gtl_epl_dispatch_jobs', 'gtl_epl_claim_job', 'gtl_epl_complete_job', 'gtl_epl_jobs_state', 'gtl_epl_read_snapshots', 'gtl_epl_reserve_credits',
    'gtl_epl_record_quota', 'gtl_epl_mark_nudge', 'gtl_epl_flag_week_review', 'gtl_epl_set_fixture_status']) assert.ok(names.includes(`public.${n}`), n);
});

test('every create is idempotent and nothing is dropped or deleted', () => {
  assert.doesNotMatch(code, /create\s+(table|index|unique\s+index)\s+(?!if\s+not\s+exists)/i);
  assert.doesNotMatch(code, /create\s+function/i);
  assert.doesNotMatch(code, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(code, /\bdelete\s+from\b/i);
});

test('save_pick locks the week row and raises the coded errors', () => {
  const body = code.slice(code.indexOf('function public.gtl_epl_save_pick'), code.indexOf('function public.gtl_epl_save_queue'));
  assert.match(body, /from\s+public\.gtl_epl_weeks[^;]*for\s+update/i);
  for (const c of ['GTL_EPL_DRAFT_CLOSED', 'GTL_EPL_NOT_YOUR_TURN', 'GTL_EPL_CLUB_NOT_PLAYING', 'GTL_EPL_CLUB_TAKEN']) assert.match(body, new RegExp(`'${c}'\\s+using\\s+errcode\\s*=\\s*'P0001'`));
  assert.match(body, /unique_violation/);
  assert.match(body, /gtl_epl_pick_history/);
  assert.match(body, /final\s*=\s*true/i);
});

test('the week status allows needs_review and the header names the M-ledger apply order and the service-only p_now', () => {
  assert.match(code, /check\(status in \('open','resolved','needs_review','settled'\)\)/);
  assert.match(sql, /Apply order is the M-ledger in docs\/REDESIGN_BUILD_PLAN\.md section 6/);
  assert.match(sql, /p_now[^\n]*must never come from a client/);
});

test('the eight managers are seeded idempotently and the schedule defaults off', () => {
  for (const id of ['719658248843632640', '473955676301815808', '702644837370929152', '1259267898757611520', '1395236217460633600', '1257180071064510465', '865667912365666304', '719745569895018496'])
    assert.ok(code.includes(id), id);
  assert.match(code, /on\s+conflict\s*\(owner_id\)\s+do\s+nothing/i);
  assert.match(code, /enabled\s+boolean\s+not\s+null\s+default\s+false/i);
});
