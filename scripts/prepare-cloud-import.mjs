import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seed } from '../server/store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const local = path.join(root, '.local/state.json');
const original = seed();
const state = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local, 'utf8')) : original;
if (state.version !== 1 || state.league?.id !== original.league.id) throw new Error('Unsupported state. Preserve and reconcile before importing.');
state.history = original.history;
const payload = JSON.stringify(state);
// Parameter escaping is SQL-specific; no shell interpolation of private state.
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const sql = `insert into public.gtl_leagues (id, state) values (${literal(state.league.id)}, ${literal(payload)}::jsonb) on conflict (id) do nothing;\n`;
fs.mkdirSync(path.join(root, '.local'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(root, '.local/cloud-seed.sql'), sql, { mode: 0o600 });
fs.writeFileSync(path.join(root, '.local/cloud-seed.json'), payload, { mode: 0o600 });
console.log(JSON.stringify({ output: '.local/cloud-seed.sql', source: fs.existsSync(local) ? 'saved local state' : 'original repository picks', games: state.games.length, snapshots: state.history.length, sha256: createHash('sha256').update(payload).digest('hex'), overwriteExisting: false }));
