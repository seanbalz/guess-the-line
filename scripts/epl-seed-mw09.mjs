// D-68 / plan 2026-10-28-epl-pick-a-team.md Task 9: open Premier League matchweek 9 by hand. MW9 began before the app
// did, so its order (Sean's) and the seven picks already made in the FEPL chat are seeded through gtl-api's commissioner
// route /epl/admin/week (gtl_epl_seed_week stamps every pick source 'seeded'; all but the latest are final) and Darin is
// left on the clock. Optionally links FEPL managers to their GTL accounts through /epl/admin/link.
//
//   node scripts/epl-seed-mw09.mjs                                  # dry run (default): prints the seed, sends nothing
//   node scripts/epl-seed-mw09.mjs --link Darin=<account uuid>      # dry run that also lists the link request
//   GTL_SUPABASE_URL=https://<ref>.supabase.co GTL_SUPABASE_PUBLISHABLE_KEY=... GTL_SESSION_TOKEN=<commissioner access token> \
//     node scripts/epl-seed-mw09.mjs --apply [--link Name=<uuid>|none ...]
//
// --apply needs M-30 applied and gtl-api deployed with the EPL routes (until then gtl-api answers 404 GTL_EPL_OFF). The
// session token is the commissioner's own Supabase access token (signed in on the app); it is read from the environment
// only and never printed. The seed is refused (409 GTL_EPL_SEED_REFUSED) once any in-app MW9 pick exists, so a rerun
// after the draft has moved on cannot rewrite it. Never writes to Sleeper.
import { pathToFileURL } from 'node:url';
import { UUID_PATTERN } from '../cloud/lobby.mjs';
import { EPL_CLUB_CODES } from '../shared/epl-clubs.mjs';
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';

const OWNER_BY_NAME = Object.freeze(Object.fromEntries(Object.entries(MANAGER_NAMES).map(([id, name]) => [name.toLowerCase(), id])));
const owner = name => OWNER_BY_NAME[name.toLowerCase()];

/** Plan Global Constraints: MW9 seeded by hand. Window and first kickoff (MUN @ CHE) from the controller's fixture list. */
export const MW09 = Object.freeze({
  season: 2026,
  week: 9,
  windowStart: '2026-10-30T00:00:00.000Z',
  windowEnd: '2026-11-04T00:00:00.000Z',
  firstKickoff: '2026-10-31T12:30:00.000Z',
  order: Object.freeze(['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'].map(owner)),
  picks: Object.freeze([['Nemo', 'MNC'], ['Cullen', 'AVL'], ['Adam', 'LIV'], ['Sean', 'TOT'], ['Evan', 'ARS'], ['Mark', 'BRE'], ['Steven', 'NEW']]
    .map(([name, club]) => Object.freeze({ ownerId: owner(name), club }))),
});

/** The /epl/admin/week body for MW9 (a fresh copy; only keys the route accepts). */
export function buildMw09Seed() {
  const seed = { ...MW09, order: [...MW09.order], picks: MW09.picks.map(p => ({ ...p })) };
  if (seed.order.length !== 8 || new Set(seed.order).size !== 8 || seed.order.some(id => !id)) throw new Error('MW9 order must be the eight FEPL managers.');
  if (new Set(seed.picks.map(p => p.club)).size !== seed.picks.length || !seed.picks.every(p => EPL_CLUB_CODES.includes(p.club))) throw new Error('MW9 picks must be distinct Premier League clubs.');
  return seed;
}

/** A readable view of a seed body: names, clubs, the source the RPC will store, and who is left on the clock. */
export function describeSeed(seed) {
  const picked = new Set(seed.picks.map(p => p.ownerId));
  const onTheClock = seed.order.find(id => !picked.has(id));
  return {
    season: seed.season, week: seed.week, windowStart: seed.windowStart, windowEnd: seed.windowEnd, deadline: seed.firstKickoff,
    order: seed.order.map(id => MANAGER_NAMES[id]),
    picks: seed.picks.map((p, i) => ({ name: MANAGER_NAMES[p.ownerId], club: p.club, source: 'seeded', final: i < seed.picks.length - 1 })),
    onTheClock: onTheClock ? MANAGER_NAMES[onTheClock] : null,
  };
}

/** The gtl-api target from the environment (GTL_* first, then the web build's VITE_* names). Nothing is printed. */
export function targetFromEnv(env = process.env) {
  return {
    url: env.GTL_SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    apikey: env.GTL_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    token: env.GTL_SESSION_TOKEN || '',
  };
}

/** The validated project origin for --apply; refuses a missing or unsafe target before any request. */
export function checkTarget({ url, apikey, token }) {
  if (!url) throw new Error('Set GTL_SUPABASE_URL (the Supabase project URL) to --apply.');
  let base;
  try { base = new URL(url); } catch { throw new Error('GTL_SUPABASE_URL is not a URL.'); }
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !local) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('GTL_SUPABASE_URL must be an https project origin (or http://localhost).');
  }
  if (!apikey) throw new Error('Set GTL_SUPABASE_PUBLISHABLE_KEY to --apply.');
  if (!token) throw new Error('Set GTL_SESSION_TOKEN (the commissioner\'s signed-in access token) to --apply.');
  return base.origin;
}

/** POSTs one gtl-api commissioner route; a refusal throws with the status, the route's sentence and its code. */
export async function postAdmin({ origin, apikey, token, fetchImpl = fetch }, route, body) {
  const response = await fetchImpl(`${origin}/functions/v1/gtl-api/${route}`, {
    method: 'POST', redirect: 'error', body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}`, apikey, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!response.ok) throw new Error(`${route} answered ${response.status}${json?.error ? `: ${json.error}` : ''}${json?.code ? ` (${json.code})` : ''}`);
  return json;
}

/** Dry run (default) returns the requests it would send; --apply sends admin/week, then each admin/link, stopping at a refusal. */
export async function runSeed({ url = '', apikey = '', token = '', apply = false, links = [], fetchImpl = fetch } = {}) {
  const requests = [{ route: 'epl/admin/week', body: buildMw09Seed() }, ...links.map(l => ({ route: 'epl/admin/link', body: { ownerId: l.ownerId, userId: l.userId } }))];
  if (!apply) return { applied: false, requests };
  const target = { origin: checkTarget({ url, apikey, token }), apikey, token, fetchImpl };
  const responses = [];
  for (const request of requests) responses.push(await postAdmin(target, request.route, request.body));
  return { applied: true, requests, responses };
}

export function parseSeedArgs(argv) {
  const out = { apply: false, links: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--link') {
      const [who = '', account = ''] = String(argv[++i] ?? '').split('=');
      const ownerId = Object.hasOwn(MANAGER_NAMES, who) ? who : owner(who);
      if (!ownerId) throw new Error(`--link: ${who || '(empty)'} is not an FEPL manager (name or Sleeper owner id).`);
      if (account !== 'none' && !UUID_PATTERN.test(account)) throw new Error('--link: the account must be a GTL user uuid, or none to unlink.');
      out.links.push({ ownerId, userId: account === 'none' ? null : account.toLowerCase() });
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function main() {
  const args = parseSeedArgs(process.argv.slice(2));
  const result = await runSeed({ ...targetFromEnv(), ...args });
  console.log(JSON.stringify({ applied: result.applied, seed: describeSeed(result.requests[0].body),
    links: args.links.map(l => ({ name: MANAGER_NAMES[l.ownerId], userId: l.userId })), responses: result.responses ?? null }, null, 2));
  if (!result.applied) console.log('Dry run: nothing was sent. Add --apply to write.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
