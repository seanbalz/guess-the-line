// EPL stage 3 (docs/EPL_FEATURES_2026_11_09.md, "Screenshot layout inspected"): candidate extraction from the words a local
// OCR engine read off a Sleeper FEPL matchups screenshot, the merge of several screenshots, and the reviewed next-week
// order. Pure: no I/O, no clock, no imports. Nothing here decides a score: every value is a candidate the commissioner
// reviews, and a value that cannot be read is missing (never zero).
//
// Layout (inspected, not assumed from elsewhere): a visible WEEK number and four stacked matchup cards with two managers
// each. On each side the large upper number is the weekly score and the smaller number underneath is the projection. The
// username under each team name identifies the side; team titles, avatars, records, win percentages, trophies, ranks,
// balances, chat and navigation are ignored. A username is resolved against the known manager mapping (immutable owner id);
// an unknown, duplicate or ambiguous match is left for the review table, never guessed from the card position.

/** A weekly score as Sleeper shows it: a decimal with one or two places. Integers are records, ranks or counts here. */
const DECIMAL = /^[(]?(-?\d{1,4})[.,](\d{1,2})[)]?$/;
const WEEK_WORD = /^(?:match)?week$/i;
const WEEK_JOINED = /^(?:match)?week[\s:#-]*(\d{1,2})$/i;

/** The numeric value of an OCR token that looks like a weekly score, or null (percentages, records, integers, text). */
export function scoreToken(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/[‐-―−]/g, '-');
  if (/%/.test(t)) return null;
  const m = DECIMAL.exec(t);
  if (!m) return null;
  const value = Number(`${m[1]}.${m[2]}`);
  return Number.isFinite(value) && value >= -1000 && value <= 10000 ? value : null;
}

/** A reviewer's typed score: a number with at most two decimals, or null. Blank is null, never zero. */
export function parseScoreInput(text) {
  if (typeof text === 'number') return Number.isFinite(text) && Math.round(text * 100) / 100 === text ? text : null;
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(',', '.');
  if (!/^-?\d{1,5}(?:\.\d{1,2})?$/.test(t)) return null;
  const value = Number(t);
  return Number.isFinite(value) && value >= -1000 && value <= 100000 ? value : null;
}

/** Usernames compare case-insensitively without a leading @ and surrounding punctuation. */
export function normalizeHandle(text) {
  return typeof text === 'string' ? text.trim().replace(/^@+/, '').replace(/^[^a-z0-9]+|[^a-z0-9_]+$/gi, '').toLowerCase() : '';
}

function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Characters OCR commonly confuses (l/1/i, o/0, s/5, z/2, b/8), folded the same way on both sides of a near match. */
const fold = h => h.replace(/[il|!1]/g, '1').replace(/[o0]/g, '0').replace(/[s5]/g, '5').replace(/[z2]/g, '2').replace(/[b8]/g, '8');

/**
 * The managers a word names: an exact username, else near matches (common OCR confusions plus at most one other slip),
 * flagged as fuzzy for review. Two or more managers is ambiguous: the caller never picks one.
 */
export function matchHandle(text, managers) {
  const h = normalizeHandle(text);
  if (h.length < 3) return { owners: [], fuzzy: false };
  const exact = managers.filter(m => normalizeHandle(m.sleeperName) === h).map(m => m.ownerId);
  if (exact.length) return { owners: exact, fuzzy: false };
  if (h.length < 6) return { owners: [], fuzzy: false };
  const near = managers.filter(m => { const n = normalizeHandle(m.sleeperName); return n.length >= 6 && editDistanceAtMostOne(fold(n), fold(h)); }).map(m => m.ownerId);
  return { owners: near, fuzzy: near.length > 0 };
}

const box = w => {
  const x0 = Number(w?.x0), y0 = Number(w?.y0), x1 = Number(w?.x1), y1 = Number(w?.y1);
  return [x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0 ? { x0, y0, x1, y1, xc: (x0 + x1) / 2, yc: (y0 + y1) / 2, h: y1 - y0 } : null;
};
const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Words grouped into horizontal lines (by vertical centre), top to bottom, each line left to right. */
function lines(items, tolerance) {
  const sorted = [...items].sort((a, b) => a.b.yc - b.b.yc);
  const out = [];
  for (const item of sorted) {
    const line = out.at(-1);
    if (line && Math.abs(item.b.yc - line.yc) <= tolerance) { line.items.push(item); line.yc = line.items.reduce((s, x) => s + x.b.yc, 0) / line.items.length; }
    else out.push({ yc: item.b.yc, items: [item] });
  }
  for (const line of out) line.items.sort((a, b) => a.b.xc - b.b.xc);
  return out;
}

/** The WEEK number shown on one screenshot: { week, issue } where issue is null, 'missing' or 'ambiguous'. */
export function findWeek(words) {
  const list = (Array.isArray(words) ? words : []).map(w => ({ text: String(w?.text ?? '').trim(), b: box(w) })).filter(w => w.b && w.text);
  const found = new Set();
  for (const w of list) {
    const joined = WEEK_JOINED.exec(w.text);
    if (joined) { found.add(Number(joined[1])); continue; }
    if (!WEEK_WORD.test(w.text)) continue;
    const next = list.filter(o => o !== w && o.b.x0 >= w.b.xc && Math.abs(o.b.yc - w.b.yc) <= Math.max(w.b.h, o.b.h) * 0.6)
      .sort((a, b) => a.b.x0 - b.b.x0)[0];
    if (next && /^\d{1,2}$/.test(next.text)) found.add(Number(next.text));
  }
  const weeks = [...found].filter(n => n >= 1 && n <= 38);
  if (weeks.length === 1) return { week: weeks[0], issue: null };
  return { week: null, issue: weeks.length ? 'ambiguous' : 'missing' };
}

/**
 * Candidates from one screenshot's OCR words ({ text, x0, y0, x1, y1 } in pixels) and the known managers
 * ({ ownerId, sleeperName }). Returns { week, weekIssue, sides, unmatched, issues }:
 *   sides     [{ ownerId, score, projection, issues }] for each recognised username (score null when unreadable);
 *   unmatched [{ score, projection }] for a card side whose username is not a known manager;
 *   issues    image-level problems ('no_managers', 'layout_unclear', 'size_unclear').
 * Side issues: 'fuzzy_username', 'duplicate_username', 'ambiguous_username', 'missing_score', 'layout_unclear',
 * 'size_unclear'. An issue never blocks the review; it asks the commissioner to look.
 */
export function extractMatchups({ words, managers }) {
  const known = Array.isArray(managers) ? managers.filter(m => m && typeof m.ownerId === 'string' && typeof m.sleeperName === 'string') : [];
  const list = (Array.isArray(words) ? words : []).map(w => ({ text: String(w?.text ?? '').trim(), b: box(w) })).filter(w => w.b && w.text);
  const { week, issue: weekIssue } = findWeek(list.map(w => ({ text: w.text, ...w.b })));
  const issues = [];
  // Username anchors.
  const anchors = [];
  for (const w of list) {
    const match = matchHandle(w.text, known);
    if (match.owners.length) anchors.push({ ...w, owners: match.owners, fuzzy: match.fuzzy });
  }
  const seen = new Map();
  for (const a of anchors) if (a.owners.length === 1) seen.set(a.owners[0], (seen.get(a.owners[0]) ?? 0) + 1);
  const sides = new Map();
  const side = ownerId => {
    if (!sides.has(ownerId)) sides.set(ownerId, { ownerId, score: null, projection: null, issues: [] });
    return sides.get(ownerId);
  };
  const flag = (s, issue) => { if (!s.issues.includes(issue)) s.issues.push(issue); };
  const usable = [];
  for (const a of anchors) {
    if (a.owners.length > 1) { for (const id of a.owners) flag(side(id), 'ambiguous_username'); continue; }
    const s = side(a.owners[0]);
    if (seen.get(a.owners[0]) > 1) { flag(s, 'duplicate_username'); continue; }
    if (a.fuzzy) flag(s, 'fuzzy_username');
    usable.push({ ...a, ownerId: a.owners[0] });
  }
  if (!anchors.length) issues.push('no_managers');
  // Score-like numbers, their lines, and which lines hold the large (score) values.
  const numbers = list.map(w => ({ ...w, value: scoreToken(w.text) })).filter(w => w.value !== null);
  const unmatched = [];
  const done = () => {
    for (const s of sides.values()) if (s.score === null && !s.issues.includes('duplicate_username') && !s.issues.includes('ambiguous_username')) flag(s, 'missing_score');
    return { week, weekIssue, sides: [...sides.values()], unmatched, issues };
  };
  if (!usable.length || !numbers.length) return done();
  const tol = Math.max(2, median(numbers.map(n => n.b.h)) * 0.5);
  const numberLines = lines(numbers, tol);
  const maxH = Math.max(...numbers.map(n => n.b.h)), minH = Math.min(...numbers.map(n => n.b.h));
  const sizeUnclear = maxH / minH < 1.15;
  const anchorRows = lines(usable, Math.max(2, median(usable.map(a => a.b.h)) * 0.8));
  let scoreLines;
  if (!sizeUnclear) scoreLines = numberLines.filter(l => Math.max(...l.items.map(i => i.b.h)) >= maxH * 0.85);
  else if (numberLines.length === anchorRows.length * 2) scoreLines = numberLines.filter((_, i) => i % 2 === 0);
  else { issues.push('size_unclear'); for (const a of usable) flag(side(a.ownerId), 'size_unclear'); return done(); }
  if (sizeUnclear) { issues.push('size_unclear'); for (const a of usable) flag(side(a.ownerId), 'size_unclear'); }
  // Each username row takes the score line nearest to it, only when that row is also the line's nearest row and the line lies
  // within half the spacing between rows. Otherwise the row's scores are missing: a value is never borrowed from a
  // neighbouring card because one line was unreadable.
  const gaps = anchorRows.slice(1).map((r, i) => r.yc - anchorRows[i].yc);
  const reach = gaps.length ? median(gaps) / 2 : Infinity;
  const nearest = (from, options) => [...options].sort((a, b) => Math.abs(a.yc - from.yc) - Math.abs(b.yc - from.yc))[0];
  if (scoreLines.length !== anchorRows.length) issues.push('layout_unclear');
  anchorRows.forEach(row => {
    const line = nearest(row, scoreLines);
    if (!line || nearest(line, anchorRows) !== row || Math.abs(line.yc - row.yc) > reach) {
      for (const a of row.items) flag(side(a.ownerId), 'layout_unclear');
      return;
    }
    if (row.items.length > 2) { for (const a of row.items) flag(side(a.ownerId), 'layout_unclear'); return; }
    const next = scoreLines[scoreLines.indexOf(line) + 1];
    const projectionLine = numberLines.find(l => l.yc > line.yc && (!next || l.yc < next.yc) && !scoreLines.includes(l));
    const assign = items => {
      // Two values: left to the left username, right to the right one. One value: the nearer username's side.
      const out = new Map();
      if (!items) return out;
      if (row.items.length === 2 && items.length === 2) { out.set(row.items[0], items[0]); out.set(row.items[1], items[1]); return out; }
      if (row.items.length === 1 && items.length === 2) {
        const [a] = row.items;
        const [near, far] = [...items].sort((x, y) => Math.abs(x.b.xc - a.b.xc) - Math.abs(y.b.xc - a.b.xc));
        out.set(a, near); out.set(null, far); return out;
      }
      for (const item of items) {
        const nearest = [...row.items].sort((x, y) => Math.abs(x.b.xc - item.b.xc) - Math.abs(y.b.xc - item.b.xc))[0];
        if (!out.has(nearest)) out.set(nearest, item);
      }
      return out;
    };
    const scoreFor = assign(line?.items);
    const projectionFor = assign(projectionLine?.items);
    for (const [anchor, item] of scoreFor) {
      const projection = projectionFor.get(anchor)?.value ?? null;
      if (anchor === null) { unmatched.push({ score: item.value, projection }); continue; }
      const s = side(anchor.ownerId);
      s.score = item.value; s.projection = projection;
    }
    if (line && line.items.length > 2) for (const a of row.items) flag(side(a.ownerId), 'layout_unclear');
  });
  return done();
}

const IDENTITY_ISSUES = Object.freeze(['fuzzy_username', 'duplicate_username', 'ambiguous_username']);
/**
 * Several screenshots of one matchweek merged per manager. `images` [{ sha256, result }] with `result` from
 * extractMatchups. Returns { week, weekIssue ('mixed' | 'missing' | 'ambiguous' | null), weeks, duplicates (repeated image
 * hashes, read once), rows [{ ownerId, candidates [{ score, projection, image, issues }], score, status }], unmatched }.
 * status: 'read' (one value, no issue), 'check' (one value with an issue), 'conflict' (different values), 'missing'.
 */
export function mergeExtractions(images, ownerIds) {
  const seen = new Set(), duplicates = [], weeks = new Set(), unmatched = [];
  const candidates = new Map(ownerIds.map(id => [id, []]));
  let ambiguousWeek = false;
  (Array.isArray(images) ? images : []).forEach((image, index) => {
    if (seen.has(image.sha256)) { duplicates.push(image.sha256); return; }
    seen.add(image.sha256);
    const r = image.result ?? {};
    if (Number.isInteger(r.week)) weeks.add(r.week); else if (r.weekIssue === 'ambiguous') ambiguousWeek = true;
    for (const s of r.sides ?? []) {
      if (!candidates.has(s.ownerId)) continue;
      candidates.get(s.ownerId).push({ score: s.score, projection: s.projection ?? null, image: index, issues: [...(s.issues ?? [])] });
    }
    for (const u of r.unmatched ?? []) unmatched.push({ ...u, image: index });
  });
  const rows = ownerIds.map(ownerId => {
    const list = candidates.get(ownerId);
    const values = [...new Set(list.filter(c => c.score !== null).map(c => Math.round(c.score * 100)))];
    const flagged = list.some(c => (c.score !== null && c.issues.length > 0) || c.issues.some(i => IDENTITY_ISSUES.includes(i)));
    const status = values.length > 1 ? 'conflict' : values.length === 0 ? 'missing' : flagged ? 'check' : 'read';
    return { ownerId, candidates: list, score: values.length === 1 ? values[0] / 100 : null, status };
  });
  const list = [...weeks];
  const weekIssue = list.length > 1 ? 'mixed' : list.length === 1 ? null : ambiguousWeek ? 'ambiguous' : 'missing';
  return { week: list.length === 1 ? list[0] : null, weekIssue, weeks: list.sort((a, b) => a - b), duplicates, rows, unmatched };
}

const cents = v => Math.round(v * 100);
/**
 * The next week's order from reviewed rows [{ ownerId, score, seasonTotal }]: ascending weekly score, ties by the lower
 * season total, then owner id (shared/epl-draft.mjs pickOrder and the SQL writer). Sleeper totals already include the
 * Pick a Team bonus (November 2 ruling), so nothing is added. Returns { order (null until complete), ties (owner id groups
 * with the same score), needTotals (tied owners without a total), missing (owners without a score) }.
 */
export function reviewOrder(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const missing = list.filter(r => typeof r.score !== 'number' || !Number.isFinite(r.score)).map(r => r.ownerId);
  const groups = new Map();
  for (const r of list) if (!missing.includes(r.ownerId)) groups.set(cents(r.score), [...(groups.get(cents(r.score)) ?? []), r]);
  const ties = [...groups.values()].filter(g => g.length > 1).map(g => g.map(r => r.ownerId));
  const tied = new Set(ties.flat());
  const needTotals = list.filter(r => tied.has(r.ownerId) && !(typeof r.seasonTotal === 'number' && Number.isFinite(r.seasonTotal))).map(r => r.ownerId);
  if (missing.length || needTotals.length) return { order: null, ties, needTotals, missing };
  const total = r => (typeof r.seasonTotal === 'number' && Number.isFinite(r.seasonTotal) ? cents(r.seasonTotal) : Infinity);
  const order = [...list].sort((a, b) => cents(a.score) - cents(b.score) || total(a) - total(b) || (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0)).map(r => r.ownerId);
  return { order, ties, needTotals, missing };
}
