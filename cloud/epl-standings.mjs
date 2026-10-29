// Guarded public source adapter. Only the separate M-34 standings job calls it after an enabled private schedule check.
// No route or deadline resolution fetches a table; collection is absent/disabled until separately authorized.
// Wikimedia community content; it is not an independently verified official Premier League feed.
import { EPL_CLUB_CODES, clubFromOddsName } from '../shared/epl-clubs.mjs';
import { EPL_STANDINGS_LICENSE, eplStandingsPositions } from '../shared/epl-standings.mjs';

export const EPL_STANDINGS_RESPONSE_LIMIT = 256 * 1024;
export const EPL_STANDINGS_USER_AGENT = 'GTL-Standings-Readiness/1.0 (https://github.com/seanbalz/guess-the-line)';
const ORIGIN = 'https://en.wikipedia.org';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
class StandingsError extends Error { constructor(reason) { super('EPL community standings are unavailable.'); this.reason = reason; } }
const stop = reason => { throw new StandingsError(reason); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const titleFor = season => `${season}–${String(season + 1).slice(-2)} Premier League`;
const text = value => value.replace(/<!--[^]*?-->/g, '').trim();
const caption = value => {
  const match = /^\[\[[^\[\]\n|]+\|([^\[\]\n|]+)\]\]$/.exec(value);
  return match ? match[1].trim() : value;
};

/** Normalize the supported Sports table format, rather than executing wiki templates or retaining article prose.
 * Requires the full directed 20-club fixture matrix and the explicitly requested completed round. */
export function normalizeWikimediaEplStandings(payload, { season, completedRound, capturedAt, now, responseSha256 } = {}) {
  if (!Number.isInteger(season) || season < 2000 || season > 2200) stop('context_required');
  const pages = payload?.query?.pages;
  if (payload?.error || !Array.isArray(pages) || pages.length !== 1) stop('source_format');
  const page = pages[0], revision = page.revisions?.[0], slot = revision?.slots?.main;
  if (page.title !== titleFor(season) || page.missing || page.revisions?.length !== 1 || slot?.contentmodel !== 'wikitext'
    || typeof slot.content !== 'string' || slot.content.length > EPL_STANDINGS_RESPONSE_LIMIT
    || new TextEncoder().encode(slot.content).length > EPL_STANDINGS_RESPONSE_LIMIT) stop('source_format');
  const sections = slot.content.split(/^==League table==\s*$/m);
  if (sections.length !== 2) stop('source_format');
  const section = text(sections[1].split(/^==[^=]/m)[0]);
  if (/\|(?:adjust_points_|startpoints_|win_points|draw_points|loss_points|points_|order\s*=)/.test(section)) stop('source_format');
  const dataKeys = [...section.matchAll(/\|((?:name_|match_)[A-Za-z0-9_]+)\s*=/g)].map(m => m[1]);
  if (dataKeys.length !== 400 || new Set(dataKeys).size !== 400) stop('incomplete');
  const params = new Map();
  for (const line of section.split('\n')) {
    const match = /^\|([a-zA-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (!match) continue;
    if (params.has(match[1])) stop('source_format');
    params.set(match[1], text(match[2]));
  }
  if (params.get('auto_generate_standings') !== 'y' || params.get('ranking_criteria')?.replaceAll(' ', '') !== 'pts,gd,gf'
    || !section.includes('{{#invoke:Sports table|main|style=WDL')) stop('source_format');
  const order = params.get('default_order')?.split(',').map(s => s.trim());
  if (!order || order.length !== 20 || new Set(order).size !== 20 || !order.every(s => /^[A-Z]{3}$/.test(s))) stop('incomplete');
  const clubs = new Map();
  for (const id of order) {
    const name = params.get(`name_${id}`), club = name && clubFromOddsName(caption(name));
    if (!club || [...clubs.values()].includes(club)) stop('unmapped');
    clubs.set(id, club);
  }
  if (new Set(clubs.values()).size !== EPL_CLUB_CODES.length || [...params.keys()].filter(k => k.startsWith('name_')).length !== 20) stop('unmapped');
  const date = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(params.get('update') ?? '');
  if (!date || !MONTHS.includes(date[2])) stop('invalid_time');
  const dataAsOf = `${date[3]}-${String(MONTHS.indexOf(date[2]) + 1).padStart(2, '0')}-${date[1].padStart(2, '0')}`;
  const rows = new Map([...clubs].map(([id, club]) => [id, { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
  const matches = [...params].filter(([key]) => key.startsWith('match_'));
  if (matches.length !== 380) stop('incomplete');
  let played = 0;
  for (const [key, value] of matches) {
    const pair = /^match_([A-Z]{3})_([A-Z]{3})$/.exec(key), a = pair && rows.get(pair[1]), b = pair && rows.get(pair[2]);
    if (!a || !b || a === b) stop('unmapped');
    const val = caption(value);
    if (val === '' || val === 'a') continue;
    const score = /^(\d{1,2})[–-](\d{1,2})$/.exec(val);
    if (!score) stop('source_format');
    const home = Number(score[1]), away = Number(score[2]); played++;
    a.played++; b.played++; a.goalsFor += home; a.goalsAgainst += away; b.goalsFor += away; b.goalsAgainst += home;
    if (home === away) { a.drawn++; b.drawn++; } else if (home > away) { a.won++; b.lost++; } else { a.lost++; b.won++; }
  }
  // This v1 supports ordinary points only. Adjustments and unresolved ties need a reviewed source adapter.
  const ranked = [...rows.values()].map(r => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst, points: 3 * r.won + r.drawn }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  const sourceUrl = `${ORIGIN}/w/index.php?title=${encodeURIComponent(titleFor(season))}&oldid=${revision.revid}`;
  const table = { season, completedRound, capturedAt, dataAsOf, matches: played,
    source: { kind: 'wikimedia-community', official: false, title: page.title, revision: revision.revid, revisionAt: revision.timestamp,
      url: sourceUrl, responseSha256, normalizer: 'gtl-epl-wikimedia-v1' },
    license: { id: 'CC-BY-SA-4.0', url: EPL_STANDINGS_LICENSE,
      attribution: `Wikipedia contributors, ${page.title}; article revision and history: ${sourceUrl}`,
      changes: 'Extracted match results; calculated points, goal differences and positions; mapped club names to GTL codes. Community data, not official verification. Data record only; repository code is separate.' },
    rows: ranked.map((r, i) => ({ position: i + 1, ...r })) };
  const checked = eplStandingsPositions(table, { season, completedRound, now });
  if (checked.status !== 'ready') stop(checked.reason);
  return table;
}

async function bounded(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > EPL_STANDINGS_RESPONSE_LIMIT) { void response.body?.cancel().catch(() => {}); stop('source_format'); }
  const reader = response.body?.getReader(); if (!reader) stop('source_format');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > EPL_STANDINGS_RESPONSE_LIMIT) { await reader.cancel(); stop('source_format'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Exactly one optional, read-only public request. No retry, alternate source, cache write or provider credit use.
 * A caller must request a season/round explicitly. The worker gates this behind the separate optional collection job. */
export async function fetchWikimediaEplStandings({ season, completedRound, fetchImpl = fetch, clock = Date.now } = {}) {
  try {
    if (!Number.isInteger(season) || season < 2000 || season > 2200 || !Number.isInteger(completedRound) || completedRound < 1 || completedRound > 38) stop('context_required');
    const url = new URL('/w/api.php', ORIGIN);
    url.search = new URLSearchParams({ action: 'query', prop: 'revisions', titles: titleFor(season), rvprop: 'ids|timestamp|content', rvslots: 'main', formatversion: '2', format: 'json', maxlag: '5' });
    const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': EPL_STANDINGS_USER_AGENT },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { void response.body?.cancel().catch(() => {}); stop('source_unavailable'); }
    const bytes = await bounded(response), now = clock();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    const data = normalizeWikimediaEplStandings(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      { season, completedRound, now, capturedAt: new Date(now).toISOString(), responseSha256: hash });
    return { status: 'ready', data };
  } catch (error) { return { status: 'unavailable', reason: error instanceof StandingsError ? error.reason : 'source_unavailable' }; }
}
