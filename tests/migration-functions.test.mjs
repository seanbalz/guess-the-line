import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HEADERS_FROM, catalog, checkHeaders, forMigration, md5, parseFunctions, parseHeaders, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { ALL } from './migrations.mjs';

// Stage 3 of docs/REDESIGN_BUILD_PLAN.md: every function each migration defines, with the md5 of the body it
// replaces in a header, so a second PR that copied an older body fails here (one function, one open PR).

const body = n => `\nbegin\n  return ${n};\nend\n`;
const fn = (name, n, { replace = true, tag = '$$' } = {}) =>
  `create ${replace ? 'or replace ' : ''}function public.${name}(p_user uuid, p_at timestamptz default now()) returns integer\nlanguage plpgsql stable security invoker set search_path='' as ${tag}${body(n)}${tag};\n`;

test('the parser reads each top-level definition and its body exactly as pg_proc.prosrc stores it', () => {
  const sql = [
    '-- create or replace function public.gtl_commented() returns int as $$ select 1 $$;',
    '/* create function public.gtl_block() /* nested */ returns int as $$ select 1 $$; */',
    "insert into public.notes values('create function public.gtl_string() returns int as $$ select 1 $$;');",
    'do $do$ begin execute \'create function public.gtl_dynamic() returns int as $x$ select 1 $x$\'; end $do$;',
    fn('gtl_first', 1, { replace: false }),
    fn('gtl_tagged', 2, { tag: '$fn$' }),
    'create or replace function "public"."gtl_quoted"(p numeric(5,1) default round(1.25, 1)) returns numeric language sql as $$ select $1 $$;',
    fn('gtl_first', 3),
  ].join('\n');
  const found = parseFunctions(sql, 'fixture.sql');
  assert.deepEqual(found.map(f => [f.name, f.replace]), [['gtl_first', false], ['gtl_tagged', true], ['gtl_quoted', true], ['gtl_first', true]]);
  assert.equal(found[0].body, body(1));
  assert.equal(found[1].body, body(2));
  assert.equal(found[0].md5, md5(body(1)));
  assert.equal(found[2].args, 'p numeric(5,1) default round(1.25, 1)');
  assert.equal(found[2].body, ' select $1 ');
  assert.ok(found[0].statement.startsWith('create function public.gtl_first(') && found[0].statement.endsWith('$$;'));
  assert.equal(found[0].line, 5);
  // A file that redefines a function keeps its last body, as Postgres does.
  assert.equal(catalog([{ file: '20990101000000_gtl_a.sql', sql }]).latest.get('public.gtl_first').md5, md5(body(3)));
  assert.throws(() => parseFunctions('create function public.gtl_bad() returns int language sql as \'select 1\';', 'bad.sql'), /no dollar-quoted body/);
  assert.equal(topLevel("select 'drop table x'; -- drop\ndrop table y;").includes('drop table x'), false);
  assert.ok(topLevel("select 'x';\ndrop table y;").includes('drop table y'));
});

test('headers: grandfathered files pass, a new replacing file needs one, and a stale copy fails', () => {
  const old = v => `${v}_gtl_old.sql`, A = `${HEADERS_FROM + 10}_gtl_a.sql`, B = `${HEADERS_FROM + 20}_gtl_b.sql`;
  const base = { file: old(HEADERS_FROM - 1), sql: fn('gtl_shared', 0, { replace: false }) + fn('gtl_other', 9, { replace: false }) };
  const grandfathered = { file: old(HEADERS_FROM), sql: fn('gtl_shared', 1) };
  assert.deepEqual(checkHeaders(catalog([base, grandfathered])), [], 'files at or before the cut-off need no header');
  const prior = md5(body(1));
  const missing = checkHeaders(catalog([base, grandfathered, { file: A, sql: fn('gtl_shared', 2) }]));
  assert.equal(missing.length, 1);
  assert.match(missing[0], new RegExp(`replaces public\\.gtl_shared .*"-- replaces public\\.gtl_shared md5 ${prior}"`));
  const a = { file: A, sql: `-- replaces public.gtl_shared md5 ${prior}\n${fn('gtl_shared', 2)}` };
  assert.deepEqual(checkHeaders(catalog([base, grandfathered, a])), []);
  assert.deepEqual(parseHeaders(a.sql), [{ schema: 'public', name: 'gtl_shared', md5: prior }]);
  // Two PRs copied the same body. Once A merges, B's header names a body that is no longer the newest: stale.
  const b = { file: B, sql: `-- replaces public.gtl_shared md5 ${prior}\n${fn('gtl_shared', 3)}` };
  assert.deepEqual(checkHeaders(catalog([base, grandfathered, b])), [], 'alone, B is current');
  const stale = checkHeaders(catalog([base, grandfathered, a, b]));
  assert.equal(stale.length, 1);
  assert.match(stale[0], new RegExp(`${B}: stale copy of public\\.gtl_shared: the header names md5 ${prior}, but the newest earlier body \\(${A}\\) has md5 ${md5(body(2))}`));
  // A stray header (nothing replaced) and a duplicate header are refused, also in grandfathered files.
  const stray = checkHeaders(catalog([base, { file: old(HEADERS_FROM), sql: `-- replaces public.gtl_absent md5 ${prior}\n${fn('gtl_new', 4, { replace: false })}` }]));
  assert.match(stray[0], /names public\.gtl_absent, but this file does not replace/);
  const twice = checkHeaders(catalog([base, { file: A, sql: `-- replaces public.gtl_other md5 ${md5(body(9))}\n-- replaces public.gtl_other md5 ${md5(body(9))}\n${fn('gtl_other', 5)}` }]));
  assert.deepEqual(twice, [`${A}: two "-- replaces" headers name public.gtl_other`]);
});

test('every repo migration passes the header check (a stale copy fails here)', () => {
  const cat = catalog(readMigrations());
  assert.deepEqual(checkHeaders(cat), []);
  assert.ok(cat.files.every(f => f.version <= HEADERS_FROM || f.functions.length === 0 || f.headers.length >= f.functions.filter(x => x.previous).length));
  assert.ok(cat.latest.size >= 90, 'the parser finds every function the migrations define');
  assert.ok(cat.files.some(f => f.version === HEADERS_FROM), 'the cut-off is the newest migration on main at stage 3');
});

test('the CLI drafts the headers and the rollback for a new migration, and --check passes on the repo', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-migration-functions-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { latest } = catalog(readMigrations(ALL));
  const prev = latest.get('public.gtl_pick_points');
  const draft = path.join(dir, '29990101000000_gtl_draft.sql');
  fs.writeFileSync(draft, `${prev.statement.replace(prev.body, '\n  select 0::numeric\n').replace(/^create\s+function/i, 'create or replace function')}\n${fn('gtl_brand_new', 1, { replace: false })}`);
  const result = forMigration(draft);
  assert.deepEqual(result.headers, [`-- replaces public.gtl_pick_points md5 ${prev.md5}`]);
  const restored = parseFunctions(result.rollback, 'rollback.sql');
  assert.deepEqual(restored.map(f => [f.name, f.md5, f.replace]), [['gtl_pick_points', prev.md5, true]]);
  const cli = args => spawnSync(process.execPath, ['scripts/migration-functions.mjs', ...args], { encoding: 'utf8' });
  const headers = cli(['--headers', draft]);
  assert.equal(headers.status, 0, headers.stderr);
  assert.equal(headers.stdout.trim(), result.headers[0]);
  const check = cli(['--check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /^Headers OK across \d+ migrations\./);
  const history = JSON.parse(cli(['--function', 'gtl_read_community', '--json']).stdout);
  assert.ok(history.length >= 2 && history.every(row => row.functions.every(f => f.function === 'public.gtl_read_community')));
  assert.equal(history.at(-1).functions[0].md5, latest.get('public.gtl_read_community').md5);
});
