#!/usr/bin/env node
// Every SQL function each migration defines (`create function` / `create or replace function`), with the md5 of its
// body as Postgres stores it (md5(pg_proc.prosrc)), so Gate M can compare repo and hosted bodies byte for byte.
//
// Stage 3 of docs/REDESIGN_BUILD_PLAN.md: a migration newer than HEADERS_FROM that replaces a function an earlier
// file defines carries one header line per replaced function, naming the md5 of the body it replaces:
//
//   -- replaces public.gtl_read_community md5 0123456789abcdef0123456789abcdef
//
// When two open PRs replace the same function, the second one's header goes stale as soon as the first merges, and
// tests/migration-functions.test.mjs fails until it copies the newest body and updates the md5 (one function, one PR).
//
// Usage:
//   node scripts/migration-functions.mjs                    every file and the functions it defines
//   node scripts/migration-functions.mjs --function NAME    one function's history, file by file
//   node scripts/migration-functions.mjs --latest           each function's newest body md5 (Gate M steps 4 and 7)
//   node scripts/migration-functions.mjs --headers FILE     the header lines FILE needs (FILE may be a draft path)
//   node scripts/migration-functions.mjs --rollback FILE    a supabase/rollback/ draft: the bodies FILE replaces
//   node scripts/migration-functions.mjs --check            exit 1 on a missing, stale or stray header
//   add --json for machine-readable output
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
/** The newest migration on main when the header rule started. Files at or before it are grandfathered. */
export const HEADERS_FROM = 20261013060000;
export const md5 = text => createHash('md5').update(text).digest('hex');
export const version = file => Number(path.basename(file).slice(0, 14));

const WORD = /[A-Za-z0-9_]/;
const CREATE = /create\s+(or\s+replace\s+)?function\s+(?:("?)([A-Za-z_][A-Za-z0-9_]*)\2\s*\.\s*)?("?)([A-Za-z_][A-Za-z0-9_]*)\4\s*\(/iy;
const DOLLAR = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
const HEADER = /^--\s*replaces\s+(?:([A-Za-z_][A-Za-z0-9_]*)\.)?([A-Za-z_][A-Za-z0-9_]*)\s+md5\s+([0-9a-f]{32})\b/gim;

/** Index just past a comment, quoted identifier, string or dollar-quoted string starting at i, or -1 if none starts there. */
function skip(sql, i) {
  const c = sql[i], next = sql[i + 1];
  if (c === '-' && next === '-') { const end = sql.indexOf('\n', i); return end < 0 ? sql.length : end + 1; }
  if (c === '/' && next === '*') {
    let depth = 1, j = i + 2;
    while (j < sql.length && depth) {
      if (sql.startsWith('/*', j)) { depth++; j += 2; } else if (sql.startsWith('*/', j)) { depth--; j += 2; } else j++;
    }
    return j;
  }
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < sql.length) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } return j + 1; } j++; }
    return sql.length;
  }
  if (c === '$' && !(i > 0 && WORD.test(sql[i - 1]))) {
    DOLLAR.lastIndex = i;
    const tag = DOLLAR.exec(sql);
    if (tag) { const end = sql.indexOf(tag[0], i + tag[0].length); return end < 0 ? sql.length : end + tag[0].length; }
  }
  return -1;
}

/** The SQL with every comment, string and dollar-quoted body blanked (same length), for statement-level checks. */
export function topLevel(sql) {
  let out = '', i = 0;
  while (i < sql.length) {
    const end = skip(sql, i);
    if (end < 0) { out += sql[i++]; continue; }
    out += sql.slice(i, end).replace(/[^\n]/g, ' ');
    i = end;
  }
  return out;
}

/**
 * Every top-level function definition in one migration's SQL: name, schema, raw argument text, whether it says
 * `or replace`, the body exactly as pg_proc.prosrc stores it (the text between the dollar quotes), its md5, the
 * whole statement and its line. Throws on a definition it cannot read, so a new syntax fails loudly, never silently.
 */
export function parseFunctions(sql, file = 'sql') {
  const found = [];
  let i = 0;
  while (i < sql.length) {
    const end = skip(sql, i);
    if (end >= 0) { i = end; continue; }
    CREATE.lastIndex = i;
    const match = (sql[i] === 'c' || sql[i] === 'C') && !(i > 0 && WORD.test(sql[i - 1])) ? CREATE.exec(sql) : null;
    if (!match) { i++; continue; }
    const start = i, line = sql.slice(0, start).split('\n').length;
    // The argument list: up to the matching parenthesis (defaults may call functions or cast with parentheses).
    let j = CREATE.lastIndex, depth = 1;
    while (j < sql.length && depth) {
      const skipped = skip(sql, j);
      if (skipped >= 0) { j = skipped; continue; }
      if (sql[j] === '(') depth++; else if (sql[j] === ')') depth--;
      j++;
    }
    const args = sql.slice(CREATE.lastIndex, j - 1).replace(/\s+/g, ' ').trim();
    // The body: the first dollar-quoted string after a top-level AS; the statement ends at the next top-level semicolon.
    let body = null;
    while (j < sql.length && sql[j] !== ';') {
      if (body === null && /^as\s+\$/i.test(sql.slice(j, j + 40)) && !WORD.test(sql[j - 1])) {
        const open = j + sql.slice(j).search(/\$/);
        DOLLAR.lastIndex = open;
        const tag = DOLLAR.exec(sql);
        if (!tag) throw new Error(`${file}:${line}: unreadable body for ${match[5]}`);
        const close = sql.indexOf(tag[0], open + tag[0].length);
        if (close < 0) throw new Error(`${file}:${line}: unterminated body for ${match[5]}`);
        body = sql.slice(open + tag[0].length, close);
        j = close + tag[0].length;
        continue;
      }
      const skipped = skip(sql, j);
      j = skipped >= 0 ? skipped : j + 1;
    }
    if (body === null) throw new Error(`${file}:${line}: ${match[5]} has no dollar-quoted body; write it as $$ ... $$`);
    found.push({ name: match[5].toLowerCase(), schema: (match[3] || 'public').toLowerCase(), args, replace: !!match[1], body, md5: md5(body),
      statement: sql.slice(start, j + 1), line });
    i = j + 1;
  }
  return found;
}

/** The `-- replaces <schema>.<name> md5 <hash>` header lines of one migration. */
export function parseHeaders(sql) {
  return [...sql.matchAll(HEADER)].map(m => ({ schema: (m[1] || 'public').toLowerCase(), name: m[2].toLowerCase(), md5: m[3] }));
}

/**
 * The catalog of a list of migrations in apply order: [{ file, version, functions, headers }] where `functions` holds
 * each function's last definition in that file (a later definition in the same file replaces an earlier one, as in
 * Postgres) and `previous` names the newest earlier file's definition it replaces, if any.
 */
export function catalog(entries) {
  const latest = new Map(), files = [];
  for (const { file, sql } of entries) {
    const own = new Map();
    for (const fn of parseFunctions(sql, file)) own.set(`${fn.schema}.${fn.name}`, fn);
    const functions = [...own.entries()].map(([key, fn]) => ({ ...fn, key, previous: latest.get(key) || null }));
    for (const fn of functions) latest.set(fn.key, { file, md5: fn.md5, args: fn.args, statement: fn.statement, body: fn.body });
    files.push({ file, version: version(file), functions, headers: parseHeaders(sql) });
  }
  return { files, latest };
}

/** Reads every migration in supabase/migrations (or the given file names) in filename order. */
export function readMigrations(names = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort(), dir = MIGRATIONS_DIR) {
  return names.map(file => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

/** Missing, stale or stray `-- replaces` headers. Files at or before `from` are checked only for stray or stale headers. */
export function checkHeaders({ files }, { from = HEADERS_FROM } = {}) {
  const problems = [];
  for (const { file, version: v, functions, headers } of files) {
    const replaced = new Map(functions.filter(fn => fn.previous).map(fn => [fn.key, fn]));
    const named = new Map();
    for (const header of headers) {
      const key = `${header.schema}.${header.name}`, fn = replaced.get(key);
      if (named.has(key)) { problems.push(`${file}: two "-- replaces" headers name ${key}`); continue; }
      named.set(key, header);
      if (!fn) {
        problems.push(`${file}: a "-- replaces" header names ${key}, but this file does not replace a function an earlier migration defines`);
      } else if (fn.previous.md5 !== header.md5) {
        problems.push(`${file}: stale copy of ${key}: the header names md5 ${header.md5}, but the newest earlier body (${fn.previous.file}) has md5 ${fn.previous.md5}. Copy that body, reapply this change to it, then update the header.`);
      }
    }
    if (v <= from) continue;
    for (const [key, fn] of replaced) {
      if (!named.has(key)) problems.push(`${file}: replaces ${key} (newest earlier body in ${fn.previous.file}) without the header line "-- replaces ${key} md5 ${fn.previous.md5}"`);
    }
  }
  return problems;
}

/** The header lines a migration needs, and a rollback draft restoring the bodies it replaces (as of the files before it). */
export function forMigration(target, entries = readMigrations()) {
  const name = path.basename(target), sql = fs.readFileSync(target, 'utf8');
  const before = entries.filter(entry => entry.file < name);
  const { latest } = catalog(before);
  const own = new Map(parseFunctions(sql, name).map(fn => [`${fn.schema}.${fn.name}`, fn]));
  const replaced = [...own.keys()].filter(key => latest.has(key)).map(key => ({ key, ...latest.get(key) }));
  const headers = replaced.map(fn => `-- replaces ${fn.key} md5 ${fn.md5}`);
  const rollback = [
    `-- Rollback for ${name} (supabase/rollback/README.md): the bodies it replaces, as of the files before it.`,
    '-- Generated by node scripts/migration-functions.mjs --rollback. Review before use; never a drop.',
    ...replaced.flatMap(fn => ['', `-- ${fn.key} from ${fn.file} (md5 ${fn.md5})`,
      fn.statement.replace(/^create\s+function/i, 'create or replace function')]),
  ].join('\n') + '\n';
  return { name, replaced, headers, rollback };
}

function main(argv) {
  const json = argv.includes('--json'), value = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const print = (data, text) => console.log(json ? JSON.stringify(data, null, 2) : text());
  if (argv.includes('--headers') || argv.includes('--rollback')) {
    const target = value('--headers') ?? value('--rollback');
    if (!target) throw new Error('Name the migration file.');
    const result = forMigration(target);
    if (argv.includes('--rollback')) return print({ name: result.name, rollback: result.rollback }, () => result.rollback.trimEnd());
    return print({ name: result.name, headers: result.headers }, () => result.headers.join('\n') || `${result.name} replaces no earlier function.`);
  }
  const cat = catalog(readMigrations());
  if (argv.includes('--check')) {
    const problems = checkHeaders(cat);
    print({ problems }, () => problems.join('\n') || `Headers OK across ${cat.files.length} migrations.`);
    return problems.length ? 1 : 0;
  }
  if (argv.includes('--latest')) {
    const rows = [...cat.latest.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, fn]) => ({ function: key, md5: fn.md5, file: fn.file }));
    return print(rows, () => rows.map(r => `${r.md5}  ${r.function}  (${r.file})`).join('\n'));
  }
  const only = value('--function')?.replace(/^public\./, '').toLowerCase();
  const rows = cat.files.map(({ file, functions, headers }) => ({ file, headers, functions: functions
    .filter(fn => !only || fn.name === only)
    .map(fn => ({ function: fn.key, args: fn.args, md5: fn.md5, line: fn.line, replaces: fn.previous ? { file: fn.previous.file, md5: fn.previous.md5 } : null })) }))
    .filter(row => row.functions.length || !only);
  return print(rows, () => rows.map(({ file, functions }) => [file, ...functions.map(fn =>
    `  ${fn.md5}  ${fn.function}(${fn.args})${fn.replaces ? `  replaces ${fn.replaces.md5} from ${fn.replaces.file}` : '  new'}`)].join('\n')).join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)) || 0; } catch (error) { console.error(error.message); process.exitCode = 2; }
}
