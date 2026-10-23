# Guess the Points (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Owner: Sean Balsiger · Version 1 · October 23, 2026 · Status: **written; build
authorized on the tasks Track 1 does not block.** D-56 authorizes this plan for
review. On October 23 Sean wrote "Continue pushing forward without my intervention,
do recommended", so the tasks that do not depend on Track 1 (1, 4, 5, 8) may be built
on a branch and draft PR without a further approval. Applying migrations and
deploying still need his own words under Gate M and Gate D (section "Release" at the
end), and Task 9 needs his pick. The pure-module code in Tasks 1–3 was run as
written on October 23: 6, 6 and 7 tests passed (Task 2 ran against Track 1's planned
`fantasy-context.mjs` functions, copied into a temporary local file).

**Goal:** Ship Guess the Points (D-56): a weekly five-player Full PPR guessing game in
Play, with its own board, House row, feed posts and one push reminder, built on
nflverse data and the Track 1 weekly estimate snapshot.

**Architecture:** Spec approach A. The game has its own tables and service-only
`gtl_points_*` functions (P-01) beside the Guess machinery. A new `gtl-api` route
group, `cloud/points.mjs`, serves the screens. A scheduled Edge function,
`gtl-points-jobs`, publishes the Tuesday slate from the Track 1 snapshot, loads
nflverse actuals daily and finalizes on Thursday (P-03). Feed posts and the push
reminder are additive triggers and functions (P-02). Pure modules hold the rules,
the slate draw and the CSV parsing, so every layer shares one formula. Spread and
Total scoring, gates, readers and references are not touched.

**Tech Stack:** Node `node:test`, Vitest, PGlite 0.5.8 (local only), Playwright,
React 19 in `web/src/next/` with the `gx-` kit, Supabase Postgres and Deno Edge
functions. No new dependencies.

**Spec:** [Guess the Points and Trade verdicts](../specs/2026-10-22-guess-the-points-design.md)
(D-56; section 4.4 as updated in PR #194). Trade verdicts (phase 2) gets its own plan.

**Plan format.** This repository's plans give exact files, interfaces, test
assertions and key code rather than every line (see
`docs/superpowers/plans/2026-10-21-nba-section.md`); this one follows that
convention, with complete code for the pure modules and the scoring SQL, where an
error would change scores.

## Global Constraints

- Slots `QB, RB, WR, TE, FLEX` (FLEX = RB/WR/TE); no two slots share an NFL game; at least two kickoff windows.
- Guess: whole number 0–60. Actual: Full PPR (1 per reception), 4-point passing TD, GTL's disclosed weights, rounded to one decimal.
- Slot points `max(0, 10 − |guess − actual|)`, exact to the tenth; week maximum 50, minus 10 per void slot.
- Each slot locks in on its own, is final once locked, and closes at its game's kickoff. An unlocked slot scores nothing and shows "—".
- Reveal per slot: other members' guesses and the House estimate show after the viewer locks in that slot, or at its kickoff. Who has locked in (faces, no numbers) shows at any time.
- PROVISIONAL as actuals load; corrections re-grade with an audit until the following Thursday 12:00 PM PT; then FINAL and frozen; later corrections are recorded and change nothing.
- Void for everyone: no snap (inactive), a team change, or a game moved out of the week or cancelled. Played one snap and left hurt still counts.
- Separate Points board; ties share the rank (T-2); House is unranked; a member appears from their first lock-in of the season.
- One push per member per week, 2 hours before their next unlocked slot's kickoff, only after their first lock-in of the season, never naming a player, guess or score.
- Week opens Tuesday 12:00 PM PT (scheduler) or on the commissioner's early publish; the commissioner may swap players only before publishing.
- Free nflverse data only (CC BY 4.0, credited behind ⓘ); snap counts (PFR via nflverse) used on the server only, never committed raw.
- No unrevealed guess, draft or House value in public assets, the repository or an unauthenticated route.
- Nothing a member enters is deleted, moved or hidden (D-23): events and loads are append-only; guesses are never deleted.
- Every `gtl_` function is `security invoker set search_path=''`, service-only; tables have RLS on and no browser grants.
- Brand D-38/D-55: one lime action in view, at most 6 numbers per card, "—" for missing, PROVISIONAL and FINAL written out, never color alone, faces first, fine print behind ⓘ, team abbreviations, no player photos, `gx-` classes and tokens only, 44px targets, 320px minimum width, Light/Dark/System, reduced motion.
- Do not edit Track 1's files (`scripts/fantasy.mjs`, `shared/fantasy*`, `web/src/FantasyFootball.jsx`, `web/src/next/fantasy/`, fantasy docs); import them read-only.

## Prerequisites (before Task 1)

1. **Track 1 helpers on `main`.** Tasks 2, 3 and 7 import functions that Track 1's
   implementation adds (D-57, plan `docs/superpowers/plans/2026-10-23-fantasy-track1.md`
   on PR #192, branch `claude/fantasy-track1-impl`):
   - `shared/fantasy-context.mjs`: `gameIdFor(player) → 'AWAY-HOME' | null`, `kickoffWindow(iso) → 'Thu' | 'Thu night' | 'Fri' | 'Sat' | 'International' | 'Sun early' | 'Sun late' | 'Sun night' | 'Mon night' | null` (Eastern-time boundaries; equivalent to spec default 4).
   - `shared/fantasy-refresh.mjs`: `fantasySeason(now) → number`.
   - `cloud/fantasy.mjs`: `createFantasyService({ fetchImpl, clock }) → { week({ season, week }) → { index, snapshot, review | null, source } }` (validated, checksum-verified reads of release `fantasy-data-<season>`).
   - Snapshot schema 2 (`schemaVersion: 2`, `rosterFallbackTeams`, `matchups`); player `{ id, name, team, position, weekly: { status, opponent, kickoff, stats } }` unchanged.

   Confirm with `git log origin/main --oneline` and
   `node -e "import('./shared/fantasy-context.mjs').then(m => console.log(typeof m.gameIdFor, typeof m.kickoffWindow))"` → `function function`.
   If Track 1 is not merged, do Task 1 only and stop.
2. **Local PGlite:** `npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8`. Without it the SQL suites skip; a skip is not a pass for Tasks 4, 5, 7 and 8.
3. **Baseline:** on a fresh branch from `origin/main`, run `npm test` and record pass/skip counts in the PR description.
4. **Design pick (blocks Task 10 styling only):** Task 9 produces five visual alternatives; Sean picks one. Tasks 1–8 do not wait for it.

## File structure

| File | Responsibility |
| --- | --- |
| `shared/points-rules.mjs` (create) | Constants, guess validation, rounding, slot/House points, week maximum, ranking, open/finalize times |
| `shared/points-slate.mjs` (create) | Eligible pools from a snapshot, seeded draw, constraints, swap validation |
| `shared/points-actuals.mjs` (create) | Week filter over nflverse CSVs, actuals rows, snap and roster facts, played flag, load payload, review cross-check |
| `supabase/migrations/20261026120000_gtl_points_core.sql` (create, P-01) | Tables, guards, gate, save/lock, publish, schedule update, rulings, load, results, finalize, read |
| `supabase/migrations/20261026120100_gtl_points_feed_push.sql` (create, P-02) | Feed kinds, feed triggers, push CHECKs, reminder candidates and mark |
| `supabase/migrations/20261026120200_gtl_points_schedule.sql` (create, P-03) | Job schedule and runs, dispatch/claim/complete, jobs state, open status |
| `supabase/admin/points_cron.sql` (create) | Cron registration and schedule row, run by hand after approval |
| `cloud/points.mjs` (create) | `/points/read`, `/points/draft`, `/points/lock`, `/points/slate`, `/points/rule`; error map; read normalizer |
| `cloud/points-jobs.mjs` (create) | Scheduled worker: open, actuals, finalize |
| `supabase/functions/gtl-points-jobs/index.ts` (create) | Deno entry for the worker |
| `cloud/handler.mjs`, `cloud/feature-off.mjs`, `cloud/community.mjs`, `cloud/push-reminders.mjs`, `supabase/config.toml` (modify) | Route group, off switch, feed kinds, Points reminders, function config |
| `scripts/boundary/guess.mjs` (modify) | Probes for the new tables, RPCs, routes and worker |
| `web/src/api.js`, `web/src/next/data/AppData.jsx` (modify) | `pointsApi` allowlist, shared `points` read |
| `web/src/next/play/points/` (create) | `PointsScreen.jsx`, `PointsSlotCard.jsx`, `PointsPicker.jsx`, `PointsAdminSheet.jsx`, `pointsView.js`, `points.css` |
| `web/src/next/shell/router.js`, `shell/state.js`, `play/Play.jsx`, `play/index.js`, `home/Home.jsx`, `league/LeagueScreen.jsx`, `research/Research.jsx`, `info.js`, `copy.js` (modify) | Section routing, landing row, tab counter, Home bar, board tab, Research row, ⓘ topic, copy |
| Tests (create) | `tests/points-rules.test.mjs`, `tests/points-slate.test.mjs`, `tests/points-actuals.test.mjs`, `tests/points-sql.test.mjs`, `tests/points-feed-push-sql.test.mjs`, `tests/points-jobs.test.mjs`, `tests/points-cloud.test.mjs`, `tests/points-view.test.mjs`, `tests/next-points-ui.test.jsx`, `tests/cloud-browser/next-points.spec.js` |
| Tests (modify) | `tests/migrations.mjs` (NOT_HOSTED), `tests/route-modules.test.mjs`, `tests/next-router.test.mjs`, `tests/next-data.test.mjs`, `tests/home-hero.test.mjs` |
| Docs (create/modify) | `docs/GUESS_THE_POINTS.md` (release card), `docs/RULES.md` (one row), `docs/COMPLETION_REGISTER.md` |

Migration filenames are working names. Gate M step 1 restamps each file at merge
so it sorts after the newest file on `main`; keep P-01 < P-02 < P-03.

---

### Task 1: Points rules (pure)

**Files:**
- Create: `shared/points-rules.mjs`
- Test: `tests/points-rules.test.mjs`

**Interfaces:**
- Consumes: `pacificDate(instant) → { date: 'YYYY-MM-DD', weekday: 1..7 (1 = Monday) }`, `pacificToUtc(date, 'HH:MM') → ISO`, `weekOpenAt(deadline) → ISO` from `shared/nfl-schedule.mjs`.
- Produces: `POINTS_SLOTS`, `SLOT_POSITIONS`, `GUESS_MIN = 0`, `GUESS_MAX = 60`, `POINTS_RULES = { format: 'ppr', passingTds: 4, version: 'points-1' }`, `validGuess(n) → boolean`, `roundActual(n) → number | null`, `slotPoints(guess, actual) → number | null`, `housePoints(estimate, actual) → number | null`, `weekMax(voidCount) → number`, `tenths(n) → integer`, `rankPoints(rows) → rows + { rank, tied }`, `rankLabel(row) → 'T-2' | '2' | '—'`, `pointsOpenAt(deadline) → ISO`, `finalizeAt(lastKickoff) → ISO`.

- [ ] **Step 1: Write the failing tests** — `tests/points-rules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { POINTS_SLOTS, POINTS_RULES, validGuess, roundActual, slotPoints, housePoints, weekMax, rankPoints, rankLabel, pointsOpenAt, finalizeAt } from '../shared/points-rules.mjs';

test('contract: five slots, Full PPR with 4-point passing TDs, pinned version', () => {
  assert.deepEqual(POINTS_SLOTS, ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  assert.deepEqual(POINTS_RULES, { format: 'ppr', passingTds: 4, version: 'points-1' });
});

test('contract: guesses are whole numbers 0–60', () => {
  for (const ok of [0, 1, 18, 60]) assert.equal(validGuess(ok), true);
  for (const bad of [-1, 61, 12.5, '12', null, NaN]) assert.equal(validGuess(bad), false);
});

test('contract: actuals round half away from zero to one decimal; missing stays null', () => {
  assert.equal(roundActual(14.64), 14.6);
  assert.equal(roundActual(14.65), 14.7);            // float 146.4999… must not round down
  assert.equal(roundActual(-1.25), -1.3);
  assert.equal(roundActual(0.04), 0);
  assert.equal(Object.is(roundActual(-0.04), -0), false);
  assert.equal(roundActual(null), null);
  assert.equal(roundActual(Number.NaN), null);
});

test('contract: 10 minus fantasy points off, floor 0, exact to the tenth', () => {
  assert.equal(slotPoints(18, 14.6), 6.6);
  assert.equal(slotPoints(15, 15), 10);
  assert.equal(slotPoints(9, 0), 1);
  assert.equal(slotPoints(0, 25.3), 0);
  assert.equal(slotPoints(12, -1.2), 0);
  assert.equal(slotPoints(12.5, 12), null);         // not a valid guess
  assert.equal(slotPoints(12, null), null);          // missing actual is not 0
  assert.equal(housePoints(16.4, 14.6), 8.2);
  assert.equal(weekMax(0), 50);
  assert.equal(weekMax(2), 30);
});

test('contract: ties share the rank on exact tenths; unscored rows are not ranked', () => {
  const ranked = rankPoints([{ id: 'a', name: 'Ann', points: 6.6 + 8.2 }, { id: 'b', name: 'Bo', points: 14.8 }, { id: 'c', name: 'Cy', points: 20 }, { id: 'd', name: 'Di', points: null }]);
  assert.deepEqual(ranked.map(r => [r.id, r.rank, r.tied]), [['c', 1, false], ['a', 2, true], ['b', 2, true]]);
  assert.equal(rankLabel(ranked[1]), 'T-2');
  assert.equal(rankLabel(ranked[0]), '1');
  assert.equal(rankLabel(null), '—');
});

test('contract: week opens Tuesday 12:00 PM PT and finalizes the following Thursday 12:00 PM PT', () => {
  assert.equal(pointsOpenAt('2026-10-30T00:15:00Z'), '2026-10-27T19:00:00.000Z');   // Week 8 TNF Oct 29 PT → Tue Oct 27 noon PDT
  assert.equal(pointsOpenAt('2026-11-06T01:15:00Z'), '2026-11-03T20:00:00.000Z');   // after fall-back → PST
  assert.equal(finalizeAt('2026-10-27T00:15:00Z'), '2026-10-29T19:00:00.000Z');     // Week 7 MNF (Mon Oct 26 PT) → Thu Oct 29
  assert.equal(finalizeAt('2026-11-03T01:15:00Z'), '2026-11-05T20:00:00.000Z');     // Mon Nov 2 PT → Thu Nov 5 PST
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-rules.test.mjs`
Expected: FAIL, `Cannot find module '../shared/points-rules.mjs'`.

- [ ] **Step 3: Implement** — `shared/points-rules.mjs`:

```js
// Guess the Points (D-56): the rules every layer shares. Pure; no I/O.
import { pacificDate, pacificToUtc, weekOpenAt } from './nfl-schedule.mjs';

export const POINTS_SLOTS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX']);
export const SLOT_POSITIONS = Object.freeze({ QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'] });
export const GUESS_MIN = 0;
export const GUESS_MAX = 60;
export const POINTS_RULES = Object.freeze({ format: 'ppr', passingTds: 4, version: 'points-1' });

const finite = value => typeof value === 'number' && Number.isFinite(value);
export const validGuess = value => Number.isInteger(value) && value >= GUESS_MIN && value <= GUESS_MAX;
/** Whole tenths; toFixed strips float noise such as 146.49999999999997 before rounding. */
export const tenths = value => Math.sign(value) * Math.round(Number((Math.abs(value) * 10).toFixed(6)));

/** One decimal, half away from zero (PostgreSQL numeric rounding). Missing never becomes 0. */
export function roundActual(points) {
  if (!finite(points)) return null;
  const value = tenths(points) / 10;
  return value === 0 ? 0 : value;
}
const score = (a, b) => Math.max(0, 100 - Math.abs(tenths(a) - tenths(b))) / 10;
export const slotPoints = (guess, actual) => (validGuess(guess) && finite(actual) ? score(guess, actual) : null);
export const housePoints = (estimate, actual) => (finite(estimate) && finite(actual) ? score(estimate, actual) : null);
export const weekMax = voids => 10 * (POINTS_SLOTS.length - voids);

/** Competition ranking on exact tenths (shared ranks, D-36); rows without points are not ranked. */
export function rankPoints(rows) {
  const scored = rows.filter(row => finite(row?.points)).map(row => ({ ...row, key: tenths(row.points) }))
    .sort((a, b) => b.key - a.key || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
  return scored.map(({ key, ...row }) => ({ ...row, rank: 1 + scored.filter(r => r.key > key).length, tied: scored.filter(r => r.key === key).length > 1 }));
}
export const rankLabel = row => (row?.rank ? (row.tied ? `T-${row.rank}` : String(row.rank)) : '—');

const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Tuesday 12:00 PM America/Los_Angeles of the competition week (D-24 Monday open + 1 day). */
export const pointsOpenAt = deadline => pacificToUtc(addDays(pacificDate(weekOpenAt(deadline)).date, 1), '12:00');
/** The first Thursday after the week's last kickoff (Pacific date), at 12:00 PM PT. */
export function finalizeAt(lastKickoff) {
  const { date, weekday } = pacificDate(lastKickoff);
  return pacificToUtc(addDays(date, ((4 - weekday + 7) % 7) || 7), '12:00');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/points-rules.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/points-rules.mjs tests/points-rules.test.mjs
git commit -m "Add the Guess the Points rules module (D-56)"
```

---

### Task 2: Slate builder (pure)

**Files:**
- Create: `shared/points-slate.mjs`
- Test: `tests/points-slate.test.mjs` (fixture: committed `shared/fantasy/2026-week-06.json`, schema 1, read-only)

**Interfaces:**
- Consumes: `scoreStats` (`shared/fantasy-rankings.mjs`), `gameIdFor`, `kickoffWindow` (`shared/fantasy-context.mjs`), `POINTS_RULES`, `POINTS_SLOTS`, `SLOT_POSITIONS`, `roundActual` (Task 1).
- Produces:
  - `SELECTION_VERSION = 'slate-1'`, `POOL_SIZE = { QB: 12, RB: 24, WR: 24, TE: 12 }`, `FLEX_POOL = { RB: 36, WR: 36, TE: 12 }`.
  - `class SlateError extends Error { code }` with codes `POINTS_STALE_SNAPSHOT`, `POINTS_NO_VALID_SLATE`, `POINTS_SWAP_INVALID`.
  - `rankedPools(snapshot, opensAt) → { QB, RB, WR, TE }`, each a list of `Candidate = { playerId, name, team, position, gameId, kickoff, window, house }` sorted by `house` desc then `playerId`.
  - `buildPointsSlate({ snapshot, season, week, opensAt }) → { season, week, selectionVersion, attempt, slots: Slot[] }` where `Slot = Candidate & { slot }` in `POINTS_SLOTS` order.
  - `swapSlots(slate, pools, swaps: [{ slot, playerId }]) → slate` (throws `POINTS_SWAP_INVALID` when a replacement is not in that slot's pool or breaks a constraint).
  - `checkSlate(slots) → string | null` (first broken constraint, or null).

- [ ] **Step 1: Write the failing tests** — `tests/points-slate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPointsSlate, rankedPools, swapSlots, checkSlate, SlateError, SELECTION_VERSION } from '../shared/points-slate.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const opensAt = '2026-10-13T19:00:00.000Z';   // Tue Oct 13 noon PDT, before every Week 6 kickoff
const build = (patch = {}) => buildPointsSlate({ snapshot, season: 2026, week: 6, opensAt, ...patch });

test('contract: the same inputs always give the same slate', () => {
  assert.deepEqual(build(), build());
  assert.equal(build().selectionVersion, SELECTION_VERSION);
});

test('contract: five slots in order, positions match, one slot per game, two kickoff windows', () => {
  const { slots } = build();
  assert.deepEqual(slots.map(s => s.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  for (const s of slots.slice(0, 4)) assert.equal(s.position, s.slot);
  assert.ok(['RB', 'WR', 'TE'].includes(slots[4].position));
  assert.equal(new Set(slots.map(s => s.gameId)).size, 5);
  assert.ok(new Set(slots.map(s => s.window)).size >= 2);
  assert.equal(checkSlate(slots), null);
  for (const s of slots) assert.match(s.gameId, /^[A-Z]{2,4}-[A-Z]{2,4}$/);
});

test('contract: only scheduled players with an estimate, inside the pools, kicking off after the open', () => {
  const pools = rankedPools(snapshot, opensAt);
  const ids = new Map(snapshot.players.map(p => [p.id, p]));
  for (const s of build().slots) {
    const player = ids.get(s.playerId);
    assert.equal(player.weekly.status, 'scheduled');
    assert.notEqual(player.weekly.stats, null);      // Out/Doubtful players have no estimate
    assert.ok(Date.parse(s.kickoff) > Date.parse(opensAt));
    const pool = s.slot === 'FLEX' ? [...pools.RB.slice(0, 36), ...pools.WR.slice(0, 36), ...pools.TE.slice(0, 12)] : pools[s.slot].slice(0, s.slot === 'QB' || s.slot === 'TE' ? 12 : 24);
    assert.ok(pool.some(c => c.playerId === s.playerId));
    assert.equal(typeof s.house, 'number');
  }
});

test('failure: a snapshot for another week or with stale stats fails closed', () => {
  assert.throws(() => build({ week: 7 }), e => e instanceof SlateError && e.code === 'POINTS_STALE_SNAPSHOT');
  assert.throws(() => buildPointsSlate({ snapshot: { ...snapshot, statsThroughWeek: 4 }, season: 2026, week: 6, opensAt }), e => e.code === 'POINTS_STALE_SNAPSHOT');
});

test('failure: no valid slate when every game has kicked off', () => {
  assert.throws(() => build({ opensAt: '2026-10-21T00:00:00Z' }), e => e.code === 'POINTS_NO_VALID_SLATE');
});

test('contract: commissioner swaps stay inside the pool and keep every constraint', () => {
  const slate = build(), pools = rankedPools(snapshot, opensAt);
  const other = pools.QB.slice(0, 12).find(c => c.playerId !== slate.slots[0].playerId && !slate.slots.slice(1).some(s => s.gameId === c.gameId));
  const swapped = swapSlots(slate, pools, [{ slot: 'QB', playerId: other.playerId }]);
  assert.equal(swapped.slots[0].playerId, other.playerId);
  assert.deepEqual(swapped.slots.slice(1), slate.slots.slice(1));
  const clash = pools.QB.find(c => c.gameId === slate.slots[1].gameId);
  if (clash) assert.throws(() => swapSlots(slate, pools, [{ slot: 'QB', playerId: clash.playerId }]), e => e.code === 'POINTS_SWAP_INVALID');
  assert.throws(() => swapSlots(slate, pools, [{ slot: 'QB', playerId: pools.WR[0].playerId }]), e => e.code === 'POINTS_SWAP_INVALID');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-slate.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — `shared/points-slate.mjs`:

```js
// Guess the Points slate (D-56): five players from the Track 1 weekly estimates, drawn reproducibly.
import { scoreStats } from './fantasy-rankings.mjs';
import { gameIdFor, kickoffWindow } from './fantasy-context.mjs';
import { POINTS_RULES, POINTS_SLOTS, SLOT_POSITIONS, roundActual } from './points-rules.mjs';

export const SELECTION_VERSION = 'slate-1';
export const POOL_SIZE = Object.freeze({ QB: 12, RB: 24, WR: 24, TE: 12 });
export const FLEX_POOL = Object.freeze({ RB: 36, WR: 36, TE: 12 });
export class SlateError extends Error { constructor(code) { super(code); this.name = 'SlateError'; this.code = code; } }

/** FNV-1a 32-bit and mulberry32: deterministic in Node, Deno and browsers. */
export function seedOf(text) { let hash = 0x811c9dc5; for (const ch of text) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function rankedPools(snapshot, opensAt) {
  const opens = Date.parse(opensAt), pools = { QB: [], RB: [], WR: [], TE: [] };
  for (const player of snapshot?.players ?? []) {
    if (!Object.hasOwn(pools, player.position) || player.weekly?.status !== 'scheduled' || !player.weekly.stats) continue;
    const kickoff = Date.parse(player.weekly.kickoff), gameId = gameIdFor(player), window = kickoffWindow(player.weekly.kickoff);
    const house = roundActual(scoreStats(player.weekly.stats, { scoring: POINTS_RULES.format, passingTds: POINTS_RULES.passingTds, position: player.position }));
    if (!(kickoff > opens) || !gameId || !window || house === null) continue;
    pools[player.position].push({ playerId: player.id, name: player.name, team: player.team, position: player.position, gameId, kickoff: new Date(kickoff).toISOString(), window, house });
  }
  for (const list of Object.values(pools)) list.sort((a, b) => b.house - a.house || a.playerId.localeCompare(b.playerId));
  return pools;
}
const slotPool = (pools, slot) => (slot === 'FLEX'
  ? Object.entries(FLEX_POOL).flatMap(([position, size]) => pools[position].slice(0, size))
  : pools[slot].slice(0, POOL_SIZE[slot]));

export function checkSlate(slots) {
  if (!Array.isArray(slots) || slots.length !== POINTS_SLOTS.length) return 'five slots';
  if (slots.some((s, i) => s.slot !== POINTS_SLOTS[i] || !SLOT_POSITIONS[s.slot].includes(s.position))) return 'slot positions';
  if (new Set(slots.map(s => s.gameId)).size !== slots.length) return 'one slot per game';
  if (new Set(slots.map(s => s.playerId)).size !== slots.length) return 'distinct players';
  if (new Set(slots.map(s => s.window)).size < 2) return 'two kickoff windows';
  return null;
}

export function buildPointsSlate({ snapshot, season, week, opensAt, maxAttempts = 200 }) {
  if (snapshot?.season !== season || snapshot?.week !== week || snapshot?.statsThroughWeek !== week - 1) throw new SlateError('POINTS_STALE_SNAPSHOT');
  const pools = rankedPools(snapshot, opensAt), random = mulberry32(seedOf(`gtl-points|${season}|${week}|${SELECTION_VERSION}`));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slots = [];
    for (const slot of POINTS_SLOTS) {
      const pool = slotPool(pools, slot).filter(c => !slots.some(s => s.gameId === c.gameId || s.playerId === c.playerId));
      if (!pool.length) break;
      slots.push({ slot, ...pool[Math.floor(random() * pool.length)] });
    }
    if (checkSlate(slots) === null) return { season, week, selectionVersion: SELECTION_VERSION, attempt, slots };
  }
  throw new SlateError('POINTS_NO_VALID_SLATE');
}

export function swapSlots(slate, pools, swaps) {
  const slots = slate.slots.map(s => ({ ...s }));
  for (const { slot, playerId } of swaps) {
    const index = POINTS_SLOTS.indexOf(slot), pick = slotPool(pools, slot).find(c => c.playerId === playerId);
    if (index < 0 || !pick) throw new SlateError('POINTS_SWAP_INVALID');
    slots[index] = { slot, ...pick };
  }
  if (checkSlate(slots) !== null) throw new SlateError('POINTS_SWAP_INVALID');
  return { ...slate, slots };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/points-slate.test.mjs tests/points-rules.test.mjs`
Expected: PASS. If `POINTS_NO_VALID_SLATE` fires on the Week 6 fixture, print `rankedPools` sizes; do not widen pools without a recorded decision.

- [ ] **Step 5: Commit**

```bash
git add shared/points-slate.mjs tests/points-slate.test.mjs
git commit -m "Add the reproducible Guess the Points slate builder"
```

---

### Task 3: nflverse actuals parsing (pure) with the CPU check

**Files:**
- Create: `shared/points-actuals.mjs`
- Test: `tests/points-actuals.test.mjs`

**Interfaces:**
- Consumes: `parseFantasyCsv(text, required)`, `normalizePlayerStats(row)` (`shared/fantasy-build.mjs`), `scoreStats`, `appCode` (`shared/nfl-schedule.mjs`), `POINTS_RULES`, `roundActual` (Task 1).
- Produces:
  - `NFLVERSE = { stats(season), snaps(season), rosters(season) }` → release URLs, the same base that `scripts/fantasy.mjs` uses: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`, `.../snap_counts/snap_counts_${season}.csv`, `.../weekly_rosters/roster_weekly_${season}.csv`.
  - `linesFor(csvText, needles: string[]) → csvText` (header plus matching lines).
  - `weekActuals(statsCsv, { season, week }) → ActualRow[]`, `ActualRow = { playerId, name, team, position, gameId, stats, points: number | null }` for QB/RB/WR/TE/K REG rows.
  - `weekSnaps(snapCsv, { season, week }) → Map<pfrId, offense+st snaps>`.
  - `rosterFacts(rosterCsv, { season, week, playerIds }) → Map<gsisId, { pfrId: string | null, status: string }>`.
  - `playedFlag({ hasStats, snapCount, rosterStatus }) → true | false | null`.
  - `reviewCheck({ review, statsSource }) → { checked: boolean, agrees: boolean | null }`.
  - `actualsPayload({ season, week, rows, slatePlayers, snaps, roster, sources, review }) → Payload` (shape in Task 5).

- [ ] **Step 1: Write the failing tests** — `tests/points-actuals.test.mjs`. Build small CSVs in the test, with a header that copies the real column order for the columns used, plus a quoted `headshot_url` containing a comma:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { linesFor, weekActuals, weekSnaps, rosterFacts, playedFlag, reviewCheck, actualsPayload } from '../shared/points-actuals.mjs';

const STAT_COLS = ['player_id','player_name','player_display_name','position','headshot_url','season','week','season_type','game_id','team','opponent_team','attempts','passing_yards','passing_tds','passing_interceptions','passing_2pt_conversions','carries','rushing_yards','rushing_tds','rushing_2pt_conversions','receptions','targets','receiving_yards','receiving_tds','receiving_2pt_conversions','special_teams_tds','fumbles_lost_total','fg_made_0_19','fg_made_20_29','fg_made_30_39','fg_made_40_49','fg_made_50_59','fg_made_60_','fg_missed','fg_blocked','pat_made','pat_missed','pat_blocked'];
const statRow = o => STAT_COLS.map(c => c === 'headshot_url' ? '"https://x.test/a,b.png"' : (o[c] ?? '0')).join(',');
const stats = [STAT_COLS.join(','),
  statRow({ player_id: '00-0000001', player_name: 'A.Wr', player_display_name: 'Al Wr', position: 'WR', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'SEA', opponent_team: 'LA', receptions: '5', targets: '8', receiving_yards: '66', receiving_tds: '1' }),
  statRow({ player_id: '00-0000002', player_name: 'B.Rb', player_display_name: 'Bo Rb', position: 'RB', season: '2026', week: '6', season_type: 'REG', game_id: '2026_06_SEA_DEN', team: 'SEA', opponent_team: 'DEN', rushing_yards: '80' }),
].join('\n');

test('contract: only the requested week, Full PPR to one decimal, AWAY-HOME app codes', () => {
  const rows = weekActuals(stats, { season: 2026, week: 7 });
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], stats: undefined }, { playerId: '00-0000001', name: 'Al Wr', team: 'SEA', position: 'WR', gameId: 'SEA-LAR', stats: undefined, points: 17.6 });   // 5 + 6.6 + 6
});

test('contract: a missing stat stays null, never 0', () => {
  const broken = stats.replace(/,66,/, ',NA,');
  assert.equal(weekActuals(broken, { season: 2026, week: 7 })[0].points, null);
});

test('failure: duplicate player rows for a week fail closed', () => {
  assert.throws(() => weekActuals(`${stats}\n${stats.split('\n')[1]}`, { season: 2026, week: 7 }), /Duplicate/);
});

test('contract: played flag — snaps or stats prove play; a zero-snap row or an inactive roster status proves inactive; else unknown', () => {
  assert.equal(playedFlag({ hasStats: true, snapCount: undefined, rosterStatus: 'ACT' }), true);
  assert.equal(playedFlag({ hasStats: false, snapCount: 3, rosterStatus: 'ACT' }), true);
  assert.equal(playedFlag({ hasStats: false, snapCount: 0, rosterStatus: 'ACT' }), false);
  assert.equal(playedFlag({ hasStats: false, snapCount: undefined, rosterStatus: 'INA' }), false);
  assert.equal(playedFlag({ hasStats: false, snapCount: undefined, rosterStatus: 'ACT' }), null);
  assert.equal(playedFlag({ hasStats: false, snapCount: undefined, rosterStatus: undefined }), null);
});

test('contract: snap counts and roster facts for the week only', () => {
  const snaps = 'game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct\n2026_07_SEA_LA,x,2026,REG,7,Al Wr,WrAl00,WR,SEA,LA,40,0.6,0,0,2,0.1\n2026_06_SEA_DEN,y,2026,REG,6,Al Wr,WrAl00,WR,SEA,DEN,50,0.7,0,0,0,0';
  assert.equal(weekSnaps(snaps, { season: 2026, week: 7 }).get('WrAl00'), 42);
  const roster = 'season,team,position,status,full_name,gsis_id,pfr_id,week,game_type\n2026,SEA,WR,ACT,Al Wr,00-0000001,WrAl00,7,REG\n2026,SEA,RB,INA,Bo Rb,00-0000002,RbBo00,7,REG\n2026,SEA,RB,ACT,Bo Rb,00-0000002,RbBo00,6,REG';
  const facts = rosterFacts(roster, { season: 2026, week: 7, playerIds: ['00-0000001', '00-0000002', '00-0000009'] });
  assert.deepEqual(facts.get('00-0000002'), { pfrId: 'RbBo00', status: 'INA' });
  assert.equal(facts.has('00-0000009'), false);
});

test('contract: the review cross-check runs only when both name the same upstream update', () => {
  const statsSource = { sha256: 'a'.repeat(64), updatedAt: '2026-10-27T04:46:00Z' };
  assert.deepEqual(reviewCheck({ review: null, statsSource }), { checked: false, agrees: null });
  assert.deepEqual(reviewCheck({ review: { actuals: { sha256: 'b'.repeat(64), updatedAt: '2026-10-26T04:46:00Z' } }, statsSource }), { checked: false, agrees: null });
  assert.deepEqual(reviewCheck({ review: { actuals: { sha256: 'b'.repeat(64), updatedAt: statsSource.updatedAt } }, statsSource }), { checked: true, agrees: false });
  assert.deepEqual(reviewCheck({ review: { actuals: { ...statsSource } }, statsSource }), { checked: true, agrees: true });
});

test('performance bound: a full-season-size stats file (20,000 rows) is filtered and parsed in under 1,000 ms', () => {
  const filler = Array.from({ length: 120 }, (_, i) => `x${i}`);
  const header = [...STAT_COLS, ...filler].join(',');
  const lines = [header];
  for (let week = 1; week <= 18; week += 1) for (let i = 0; i < 1110; i += 1) {
    lines.push([statRow({ player_id: `00-${String(week * 10000 + i).padStart(7, '0')}`, position: 'WR', season: '2026', week: String(week), season_type: 'REG', game_id: `2026_${String(week).padStart(2, '0')}_SEA_LA`, team: 'SEA', opponent_team: 'LA', receptions: '3' }), ...filler.map(() => '0.123456')].join(','));
  }
  const text = lines.join('\n');
  assert.ok(text.length > 8_000_000, `fixture is ${text.length} bytes`);
  const started = performance.now();
  assert.equal(weekActuals(text, { season: 2026, week: 9 }).length, 1110);
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-actuals.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — `shared/points-actuals.mjs`:

```js
// Guess the Points actuals (D-56 spec 4.4): read the same nflverse files Track 1 reads, for one week.
import { normalizePlayerStats, parseFantasyCsv } from './fantasy-build.mjs';
import { scoreStats } from './fantasy-rankings.mjs';
import { appCode } from './nfl-schedule.mjs';
import { POINTS_RULES, roundActual } from './points-rules.mjs';

const RELEASE = 'https://github.com/nflverse/nflverse-data/releases/download';
export const NFLVERSE = Object.freeze({
  stats: season => `${RELEASE}/stats_player/stats_player_week_${season}.csv`,
  snaps: season => `${RELEASE}/snap_counts/snap_counts_${season}.csv`,
  rosters: season => `${RELEASE}/weekly_rosters/roster_weekly_${season}.csv`,
});
const pad = n => String(n).padStart(2, '0');
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const STATS_REQUIRED = ['player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'game_id', 'team'];
const SNAPS_REQUIRED = ['game_id', 'season', 'game_type', 'week', 'pfr_player_id', 'offense_snaps', 'st_snaps'];
const ROSTER_REQUIRED = ['season', 'week', 'game_type', 'gsis_id', 'pfr_id', 'status'];

/** Header plus lines containing any needle: a cheap scan before the full parse (no nflverse cell holds a newline). */
export function linesFor(csvText, needles) {
  const end = csvText.indexOf('\n');
  if (end < 0) throw new Error('The source file has no rows.');
  const kept = [csvText.slice(0, end)];
  for (let start = end + 1; start < csvText.length;) {
    let stop = csvText.indexOf('\n', start);
    if (stop < 0) stop = csvText.length;
    const line = csvText.slice(start, stop);
    if (needles.some(needle => line.includes(needle))) kept.push(line);
    start = stop + 1;
  }
  return kept.join('\n');
}

export function weekActuals(statsCsv, { season, week }) {
  const rows = parseFantasyCsv(linesFor(statsCsv, [`,${season}_${pad(week)}_`]), STATS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.season_type === 'REG' && POSITIONS.has(row.position));
  const players = new Map();
  for (const row of rows) {
    if (players.has(row.player_id)) throw new Error('Duplicate player row for the week.');
    const [, , away, home] = row.game_id.split('_'), stats = normalizePlayerStats(row);
    players.set(row.player_id, { playerId: row.player_id, name: row.player_display_name || row.player_name, team: appCode(row.team), position: row.position,
      gameId: `${appCode(away)}-${appCode(home)}`, stats,
      points: roundActual(scoreStats(stats, { scoring: POINTS_RULES.format, passingTds: POINTS_RULES.passingTds, position: row.position })) });
  }
  return [...players.values()];
}

export function weekSnaps(snapCsv, { season, week }) {
  const rows = parseFantasyCsv(linesFor(snapCsv, [`${season}_${pad(week)}_`]), SNAPS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG');
  return new Map(rows.map(row => [row.pfr_player_id, (Number(row.offense_snaps) || 0) + (Number(row.st_snaps) || 0)]));
}

export function rosterFacts(rosterCsv, { season, week, playerIds }) {
  const rows = parseFantasyCsv(linesFor(rosterCsv, playerIds), ROSTER_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG' && playerIds.includes(row.gsis_id));
  return new Map(rows.map(row => [row.gsis_id, { pfrId: row.pfr_id || null, status: row.status }]));
}

export function playedFlag({ hasStats, snapCount, rosterStatus }) {
  if (hasStats || snapCount > 0) return true;
  if (snapCount === 0) return false;
  if (rosterStatus && rosterStatus !== 'ACT') return false;
  return null;
}

export function reviewCheck({ review, statsSource }) {
  const recorded = review?.actuals;
  if (!recorded?.updatedAt || recorded.updatedAt !== statsSource?.updatedAt) return { checked: false, agrees: null };
  return { checked: true, agrees: recorded.sha256 === statsSource.sha256 };
}

export function actualsPayload({ season, week, rows, slatePlayers, snaps, roster, sources, review }) {
  const byId = new Map(rows.map(row => [row.playerId, row]));
  const played = Object.fromEntries(slatePlayers.map(id => {
    const facts = roster.get(id);
    return [id, playedFlag({ hasStats: byId.has(id), snapCount: facts?.pfrId ? snaps.get(facts.pfrId) : undefined, rosterStatus: facts?.status })];
  }));
  const check = reviewCheck({ review, statsSource: sources.stats });
  return { season, week, rulesVersion: POINTS_RULES.version, sources, review: check, played, players: rows };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/points-actuals.test.mjs`
Expected: PASS, 7 tests. Record the performance test's measured time in the commit message.

- [ ] **Step 5: Re-verify the inactive signal on real data (read-only download)**

Checked while writing this plan (October 23, 2026, with this task's code run against
the public files): every QB/RB/WR/TE player whose report status was `Out` read `INA` or
`RES` on that week's roster, giving `playedFlag` false (void) and none pending.
Week 4: 22 players (18 INA, 4 RES); Week 5: 28 (19 INA, 9 RES); Week 6: 31 (17 INA,
14 RES). Of 313 Week 6 skill players with a stats row, 312 also had a snap row
through the roster `pfr_id`. Repeat the check at build time, because the data may have changed. Run, outside the repository:
`curl -sL https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv -o "$TMP/inj.csv"` and the same for `roster_weekly_2026.csv` and `snap_counts_2026.csv`. Then, for players whose Week 6 `report_status` is `Out`, check with a scratch Node script that their Week 6 roster `status` is not `ACT` and that they have no Week 6 snap row. Record counts (for example "14 of 14 Out players were INA, 0 had snaps") in `docs/GUESS_THE_POINTS.md` (Task 12). If any Out player reads `ACT` with no snaps, keep `playedFlag` as written: that player stays pending and the commissioner rules it. Commit nothing from the download.

- [ ] **Step 6: Commit**

```bash
git add shared/points-actuals.mjs tests/points-actuals.test.mjs
git commit -m "Parse one week of nflverse actuals, snaps and roster facts for Guess the Points"
```

---

### Task 4: P-01 tables, guards, publish, save/lock and the reveal gate

**Files:**
- Create: `supabase/migrations/20261026120000_gtl_points_core.sql` (first half; Task 5 adds the rest to the same file)
- Modify: `tests/migrations.mjs` (`NOT_HOSTED = [20261026120000]`)
- Test: `tests/points-sql.test.mjs`

**Interfaces:**
- Consumes: `public.gtl_community_member(uuid)`, `public.gtl_community_admin(uuid)`, `public.gtl_memberships(league_id, user_id, active)`, `public.gtl_profiles`.
- Produces (service-only, `security invoker set search_path=''`):
  - `gtl_points_publish_slate(p_actor uuid, p_season integer, p_week integer, p_slate jsonb, p_finalize_at timestamptz, p_now timestamptz) → jsonb { season, week, opensAt }`
  - `gtl_points_save(p_user uuid, p_season integer, p_week integer, p_slot text, p_guess integer, p_lock boolean, p_request uuid, p_now timestamptz) → jsonb { season, week, slot, guess, lockedAt }`
  - `gtl_points_revealed(p_viewer uuid, p_season integer, p_week integer, p_slot text, p_now timestamptz) → boolean`
  - Error codes: `GTL_POINTS_MEMBER`, `GTL_POINTS_FORBIDDEN`, `GTL_POINTS_INVALID`, `GTL_POINTS_PUBLISHED`, `GTL_POINTS_NO_SLATE`, `GTL_POINTS_NOT_OPEN`, `GTL_POINTS_CLOSED`, `GTL_POINTS_LOCKED`, `GTL_POINTS_DELETE`, `GTL_POINTS_RETRY_CONFLICT`.

- [ ] **Step 1: Write the failing tests** — `tests/points-sql.test.mjs`, on `createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false })` from `tests/cloud-browser/community-world.mjs` (luke `id(1)`, troy `id(2)`, sean `id(3)` commissioner) and `serviceSql(db)` from `tests/helpers/guess-week.mjs`. A fixture slate uses real-clock kickoffs (`Date.now() + 2h … + 5d`) so the guard trigger's `clock_timestamp()` agrees with `p_now`:

```js
const slate = now => ({ selectionVersion: 'slate-1', provenance: { file: '2026-week-08.3f9c1a2b.json', sha256: 'f'.repeat(64), generatedAt: new Date(now).toISOString() },
  slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-000000${i + 1}`, pfrId: `Pf${i}`, name: `P${i}`, team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i],
    position: slot === 'FLEX' ? 'WR' : slot, gameId: ['SEA-DEN', 'KC-LV', 'BUF-NYJ', 'DAL-PHI', 'MIA-NE'][i],
    kickoff: new Date(now + (i < 2 ? 2 : 50) * 3_600_000).toISOString(), window: i < 2 ? 'Sun early' : 'Mon night', house: 10 + i })) });
```

Contracts to assert (one `test()` each):
1. **Privilege:** `anon` and `authenticated` get `permission denied` on `select/insert/update/delete` for every `gtl_points_*` table; `has_function_privilege` is false for both roles on every new function; every new function has `prosecdef = false`.
2. **Publish:** only the commissioner (`id(3)`) publishes (`GTL_POINTS_FORBIDDEN` for luke); a second publish for the same week fails `GTL_POINTS_PUBLISHED`; a slate with a repeated game, a wrong position, one kickoff window, a kickoff before `p_now`, or `p_finalize_at` before the last kickoff fails `GTL_POINTS_INVALID`; `opensAt` equals `p_now`.
3. **Save and lock:** a draft save returns `lockedAt: null` and can change; a lock saves `lockedAt = p_now`; any later save or lock of that slot fails `GTL_POINTS_LOCKED`; a direct `update public.gtl_points_guesses set guess=1` as `service_role` on a locked row fails `GTL_POINTS_LOCKED`; any `delete` fails `GTL_POINTS_DELETE`; every save appends one `gtl_points_guess_events` row.
4. **Windows:** before a slate exists → `GTL_POINTS_NO_SLATE`; with `p_now` at or after the slot's kickoff → `GTL_POINTS_CLOSED` (and the real-clock trigger refuses a direct insert for a slot whose fixture kickoff is set in the past); guess `61`, `-1` or a `null` request → `GTL_POINTS_INVALID`; a non-member → `GTL_POINTS_MEMBER`. (Saves on a void slot are tested in Task 5, which adds the function that voids a slot.)
5. **Idempotent retries:** the same `requestId` and payload returns the stored result and writes no second event; the same `requestId` with another guess fails `GTL_POINTS_RETRY_CONFLICT`.
6. **Gate:** `gtl_points_revealed` is false for troy on luke's locked slot until troy locks that slot, and true for everyone at `p_now >= kickoff`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-sql.test.mjs`
Expected: FAIL, `function public.gtl_points_publish_slate(...) does not exist` (and not "skipped": PGlite must be installed).

- [ ] **Step 3: Write the tables and guards** — top of `20261026120000_gtl_points_core.sql`:

```sql
-- P-01 Guess the Points core (D-56; spec docs/superpowers/specs/2026-10-22-guess-the-points-design.md).
-- Local implementation only: applying it to the hosted project is Sean's "apply P-01" (Gate M).
--
-- Additive. New tables and service-only, security-invoker functions; no existing table, column, trigger, grant or
-- function changes, so there is no "-- replaces" header and no supabase/rollback/ file. The off switch is the gtl-api
-- secret GTL_FEATURE_OFF=points (cloud/feature-off.mjs): writers refuse; every stored row stays (D-23).

create table public.gtl_points_slates (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  opens_at timestamptz not null,
  finalize_at timestamptz not null,
  rules jsonb not null check (rules = '{"format":"ppr","passingTds":4,"version":"points-1"}'::jsonb),
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 5),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default clock_timestamp(),
  audit jsonb not null default '[]' check (jsonb_typeof(audit) = 'array'),
  primary key (season, week),
  check (finalize_at > opens_at)
);
create table public.gtl_points_guesses (
  user_id uuid not null references auth.users(id),
  season integer not null, week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  guess integer not null check (guess between 0 and 60),
  locked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, season, week, slot),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
create table public.gtl_points_guess_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id),
  season integer not null, week integer not null, slot text not null,
  kind text not null check (kind in ('draft','lock')),
  guess integer not null, request_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_receipts (
  user_id uuid not null references auth.users(id), request_id uuid not null,
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_id)
);

create function public.gtl_points_guess_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kickoff timestamptz;
begin
  if tg_op = 'DELETE' then raise exception 'GTL_POINTS_DELETE'; end if;
  if tg_op = 'UPDATE' and old.locked_at is not null then raise exception 'GTL_POINTS_LOCKED'; end if;
  select (s->>'kickoff')::timestamptz into kickoff
    from public.gtl_points_slates p, jsonb_array_elements(p.slots) s
    where p.season = new.season and p.week = new.week and s->>'slot' = new.slot;
  if kickoff is null or clock_timestamp() >= kickoff then raise exception 'GTL_POINTS_CLOSED'; end if;
  return new;
end $$;
create trigger gtl_points_guess_guard before insert or update or delete on public.gtl_points_guesses
  for each row execute function public.gtl_points_guess_guard();
```

Grants for this half: RLS on all four tables; `revoke all ... from public, anon, authenticated, service_role`; `grant select, insert, update(slots, audit) on gtl_points_slates`, `grant select, insert, update(guess, locked_at, updated_at) on gtl_points_guesses`, `grant select, insert on gtl_points_guess_events, gtl_points_receipts`, `grant usage on sequence gtl_points_guess_events_id_seq` — all to `service_role` only. Revoke `execute` on the trigger function from `public, anon, authenticated`.

- [ ] **Step 4: Write `gtl_points_publish_slate`, `gtl_points_save` and `gtl_points_revealed`**

`gtl_points_publish_slate`, in order:
1. `if not public.gtl_community_admin(p_actor) then raise exception 'GTL_POINTS_FORBIDDEN'`.
2. `if exists(select 1 from public.gtl_points_slates where season=p_season and week=p_week) then raise exception 'GTL_POINTS_PUBLISHED'`.
3. Validate `p_slate` and raise `GTL_POINTS_INVALID` on any failure:
   - `slots` is an array of exactly 5, with `slot` in the order `QB, RB, WR, TE, FLEX`.
   - `position` matches the slot; FLEX is RB, WR or TE.
   - `playerId ~ '^00-[0-9]{7}$'`, `gameId ~ '^[A-Z]{2,4}-[A-Z]{2,4}$'`, `pfrId` is text or null, `house` is a number or null.
   - Every `kickoff > p_now`.
   - 5 distinct `gameId`, 5 distinct `playerId`, at least 2 distinct `window`.
   - `p_finalize_at > max(kickoff)`.
   - `provenance` holds `file`, a 64-hex `sha256` and `selectionVersion`.
4. Insert with `opens_at = p_now` and `rules = '{"format":"ppr","passingTds":4,"version":"points-1"}'`. Store each slot as `{ slot, playerId, pfrId, name, team, position, gameId, kickoff, window, house, void: null }`. Set the audit to `[{ at: p_now, by: p_actor, action: 'published' }]`.

`gtl_points_save`, in order:
1. `if not public.gtl_community_member(p_user) then raise 'GTL_POINTS_MEMBER'`.
2. Validate `p_slot`, `0 <= p_guess <= 60`, `p_request is not null`, `p_lock is not null`, and `p_now is not null` (`GTL_POINTS_INVALID`).
3. `perform pg_advisory_xact_lock(hashtextextended('gtl_points:' || p_user::text, 0))`.
4. Receipt replay: `payload := jsonb_build_object('season',…,'week',…,'slot',…,'guess',…,'lock',p_lock)`. A found receipt with action `'points/save'` and an equal payload returns its result; any other found receipt raises `GTL_POINTS_RETRY_CONFLICT`.
5. Read the slate: none, raise `GTL_POINTS_NO_SLATE`; `opens_at > p_now`, raise `GTL_POINTS_NOT_OPEN`; slot `void` is not null or `p_now >= kickoff`, raise `GTL_POINTS_CLOSED`.
6. `insert … on conflict (user_id,season,week,slot) do update set guess=excluded.guess, locked_at=excluded.locked_at, updated_at=excluded.updated_at where public.gtl_points_guesses.locked_at is null returning *`. If no row comes back, raise `GTL_POINTS_LOCKED`.
7. Insert the event (`kind = case when p_lock then 'lock' else 'draft' end`) and the receipt, then return the result.

`gtl_points_revealed`: `p_now >= slot kickoff` or `exists (locked row for p_viewer, season, week, slot)`. Language `sql stable`.

End of this half: `revoke all on function …(signatures) from public, anon, authenticated; grant execute … to service_role;`.

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/points-sql.test.mjs tests/migrations.test.mjs`
Expected: PASS, 6 Points tests; the migration registry passes with the new version in `NOT_HOSTED`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261026120000_gtl_points_core.sql tests/migrations.mjs tests/points-sql.test.mjs
git commit -m "P-01 part 1: Guess the Points tables, guards, publish, lock-in and reveal gate"
```

---

### Task 5: P-01 actuals, results, rulings, FINAL and the read

**Files:**
- Modify: `supabase/migrations/20261026120000_gtl_points_core.sql` (second half)
- Test: `tests/points-sql.test.mjs` (add)

**Interfaces:**
- Consumes: Task 4 tables and functions; payload from `actualsPayload` (Task 3).
- Produces:
  - `gtl_points_update_schedule(p_season integer, p_week integer, p_games jsonb, p_now timestamptz) → jsonb { changed: [slot] }`. `p_games` is `{ "<gameId>": { "week": int, "kickoff": iso } }`. Every slate game must be present (fail closed, decided during the build): a missing one refuses the update with `GTL_POINTS_INVALID`; a cancellation is the commissioner's `void` ruling.
  - `gtl_points_load_actuals(p_season integer, p_week integer, p_payload jsonb, p_now timestamptz) → jsonb { status: 'saved' | 'flagged' | 'after_final' | 'replay', loadId, regraded: [slot] }`.
  - `gtl_points_rule_slot(p_actor uuid, p_season integer, p_week integer, p_slot text, p_ruling text, p_reason text, p_now timestamptz) → jsonb`, where `p_ruling` is `'void'` or `'played'`.
  - `gtl_points_slot_results(p_season integer, p_week integer) → table(slot text, player_id text, kickoff timestamptz, status text, actual numeric, void_reason text, house numeric)`, where `status` is `pending`, `scored` or `void`.
  - `gtl_points_member_points(p_season integer, p_week integer) → table(user_id uuid, slot text, guess integer, points numeric)`, for locked guesses only.
  - `gtl_points_finalize(p_season integer, p_week integer, p_now timestamptz) → jsonb { status: 'final' | 'replay' | 'not_due' | 'waiting_on_stats' | 'no_slate' }`.
  - `gtl_points_read(p_user uuid, p_season integer, p_week integer, p_league text, p_now timestamptz) → jsonb` (shape below).
  - `gtl_points_jobs_state(p_season integer, p_now timestamptz) → jsonb { published: [week], unfinal: [{ week, finalizeAt, firstKickoff }] }`, used by Task 7.
  - `gtl_points_is_admin(p_user uuid) → boolean`: a one-line `sql stable` wrapper over `gtl_community_admin`, so the slate route can check the commissioner before any fetch.

**Read reply (`gtl_points_read`)** — exact keys:

```json
{ "status": "none | open | closed | final",
  "season": 2026, "week": 8, "opensAt": "…", "finalizeAt": "…", "rules": { "format": "ppr", "passingTds": 4, "version": "points-1" },
  "viewer": "<uuid>", "admin": false, "leagueId": null, "optedIn": true,
  "members": [{ "id": "<uuid>", "displayName": "Troy" }],
  "slots": [{ "slot": "QB", "playerId": "00-…", "name": "…", "team": "SEA", "position": "QB", "gameId": "SEA-DEN", "kickoff": "…", "window": "Sun late",
      "void": null, "result": { "status": "pending | scored | void", "actual": 14.6 },
      "mine": { "guess": 18, "lockedAt": "…", "points": 6.6 },
      "lockedBy": ["<uuid>"],
      "revealed": true, "others": [{ "userId": "<uuid>", "guess": 21, "points": 3.6 }],
      "house": { "visible": true, "value": 16.4, "points": 8.2 } }],
  "weekBoard": { "max": 50, "mine": 24.6, "house": 31.2, "standings": [{ "userId": "<uuid>", "points": 24.6, "slotsScored": 3 }] },
  "seasonBoard": { "standings": [{ "userId": "<uuid>", "points": 88.1, "weeksPlayed": 3, "beatHouse": 2 }], "house": 80.4 } }
```

`admin` is `gtl_community_admin(p_user)`. A hidden slot has `"revealed": false`, `"others": null` and `"house": { "visible": false }`. `mine` is null when the viewer has no row, and `mine.points` is null until the slot is scored. When `p_league` is set, the viewer must be an active member (`GTL_POINTS_MEMBER`), and `members` and both standings are limited to that league's active roster. Standings count only members with at least one locked row in the season (opt-in). `optedIn` reports the viewer.

- [ ] **Step 1: Write the failing tests** — add to `tests/points-sql.test.mjs` (fixture payload helper builds `players` rows for the five slate players):

1. **Scoring:** after a `saved` load with actuals QB 14.6 and RB 0, luke's locked QB guess 18 scores 6.6; luke's locked RB guess 9 scores 1.0; luke's unlocked TE draft scores nothing and its `mine.points` is null; week `mine` = 7.6, `max` = 50.
2. **Played but no stats:** `played["00-0000003"] = true` with no stats row → WR `scored` with actual 0.
3. **Void:** `played[...] = false` → `void_reason 'inactive'`, `max` 40, no one scores it; a stats row whose team differs from the slate → `'team_change'`; `gtl_points_update_schedule` with that game in week 9 or missing → `'postponed'` and later saves refuse `GTL_POINTS_CLOSED`; a kickoff moved later (still future) updates the slot kickoff and audits it.
4. **Pending:** `played = null` and no stats row → `pending`, excluded from standings, `gtl_points_finalize` returns `waiting_on_stats`; `gtl_points_rule_slot(sean, …, 'void', 'Inactive per team report')` resolves it; luke cannot rule (`GTL_POINTS_FORBIDDEN`).
5. **Re-grade audit:** a second load with a corrected actual changes the score and inserts one `gtl_points_regrades` row with before/after; the identical payload again returns `replay` and writes nothing.
6. **Flagged:** `review: { checked: true, agrees: false }` → `status 'flagged'`; results still use the previous `saved` load.
7. **FINAL freeze:** `finalize` before `finalize_at` → `not_due`; after, with all slots resolved → `final`, one `gtl_points_week_final` row; a later load returns `after_final` and changes no result; a re-run returns `replay`; rulings after FINAL fail `GTL_POINTS_FINAL`.
8. **Gate in the read:** before troy locks QB and before kickoff, troy's read has `revealed:false`, `others:null`, `house.visible:false` for QB, while `lockedBy` lists luke; after troy locks QB, both show; at kickoff (`p_now` ≥ kickoff) every slot shows. **Hidden sentinel:** luke locks QB with guess 57; troy's read JSON (stringified) contains no `57` anywhere before troy's own lock or kickoff.
9. **Boards:** standings exclude members who never locked; two members with 14.8 (6.6 + 8.2 and 14.8) are returned with equal points (ranking itself is JS, Task 6); `beatHouse` counts weeks where week points exceed a complete House week; House week is null when any non-void slot has `house: null`.
10. **League scope:** with `p_league = 'sean-troy-luke'`, a viewer outside that league gets `GTL_POINTS_MEMBER`; members and standings list only active roster members.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-sql.test.mjs`
Expected: the new tests FAIL with missing functions; Task 4 tests still pass.

- [ ] **Step 3: Tables for loads, actuals, rulings, re-grades and finals**

```sql
create table public.gtl_points_actual_loads (
  id uuid primary key default gen_random_uuid(),
  season integer not null, week integer not null,
  stats_sha256 text not null check (stats_sha256 ~ '^[0-9a-f]{64}$'),
  snaps_sha256 text check (snaps_sha256 is null or snaps_sha256 ~ '^[0-9a-f]{64}$'),
  roster_sha256 text check (roster_sha256 is null or roster_sha256 ~ '^[0-9a-f]{64}$'),
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  played jsonb not null check (jsonb_typeof(played) = 'object'),
  status text not null check (status in ('saved','flagged','after_final')),
  row_count integer not null check (row_count between 0 and 5000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
create unique index gtl_points_actual_loads_once on public.gtl_points_actual_loads
  (season, week, stats_sha256, coalesce(snaps_sha256, ''), coalesce(roster_sha256, ''));
create table public.gtl_points_actuals (
  load_id uuid not null references public.gtl_points_actual_loads(id),
  player_id text not null check (player_id ~ '^00-[0-9]{7}$'),
  name text not null, team text not null, position text not null check (position in ('QB','RB','WR','TE','K')),
  game_id text not null check (game_id ~ '^[A-Z]{2,4}-[A-Z]{2,4}$'),
  stats jsonb not null check (jsonb_typeof(stats) = 'object'),
  points numeric(6,1),
  primary key (load_id, player_id)
);
create table public.gtl_points_rulings (
  id bigserial primary key, season integer not null, week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  ruling text not null check (ruling in ('void','played')),
  reason text not null check (length(reason) between 1 and 200),
  ruled_by uuid not null references auth.users(id),
  ruled_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_regrades (
  id bigserial primary key, load_id uuid not null references public.gtl_points_actual_loads(id),
  season integer not null, week integer not null, slot text not null,
  before jsonb not null, after jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_week_final (
  season integer not null, week integer not null, load_id uuid references public.gtl_points_actual_loads(id),
  finalized_at timestamptz not null, results jsonb not null check (jsonb_typeof(results) = 'object'),
  primary key (season, week),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
```
All five tables are `select, insert` only for `service_role`, with sequence usage for the two bigserials. RLS is on and every browser role is revoked.

- [ ] **Step 4: The results function (complete; the scoring contract lives here)**

```sql
create function public.gtl_points_slot_results(p_season integer, p_week integer)
returns table(slot text, player_id text, kickoff timestamptz, status text, actual numeric, void_reason text, house numeric)
language plpgsql stable security invoker set search_path='' as $$
declare frozen jsonb; current_load public.gtl_points_actual_loads;
begin
  select f.results into frozen from public.gtl_points_week_final f where f.season = p_season and f.week = p_week;
  if found then
    return query select r->>'slot', r->>'playerId', (r->>'kickoff')::timestamptz, r->>'status', (r->>'actual')::numeric, r->>'voidReason', (r->>'house')::numeric
      from jsonb_array_elements(frozen->'slots') r;
    return;
  end if;
  select * into current_load from public.gtl_points_actual_loads l
    where l.season = p_season and l.week = p_week and l.status = 'saved' order by l.created_at desc, l.id desc limit 1;
  return query
  with slots as (select v from public.gtl_points_slates s, jsonb_array_elements(s.slots) v where s.season = p_season and s.week = p_week),
  ruled as (select distinct on (r.slot) r.slot, r.ruling from public.gtl_points_rulings r
            where r.season = p_season and r.week = p_week order by r.slot, r.ruled_at desc, r.id desc),
  joined as (
    select v, ruled.ruling, a.team a_team, a.game_id a_game, a.points a_points, (a.player_id is not null) has_row,
           case when current_load.id is null then null else (current_load.played->>(v->>'playerId'))::boolean end played
    from slots
    left join ruled on ruled.slot = v->>'slot'
    left join public.gtl_points_actuals a on a.load_id = current_load.id and a.player_id = v->>'playerId'),
  resolved as (
    select v, ruling, has_row, a_points, played,
      coalesce(v->>'void',
        case when ruling = 'void' then 'ruled' end,
        case when has_row and a_team <> v->>'team' then 'team_change' end,
        case when has_row and a_game <> v->>'gameId' then 'postponed' end,
        case when not has_row and played is false and ruling is distinct from 'played' then 'inactive' end) void_reason
    from joined)
  select v->>'slot', v->>'playerId', (v->>'kickoff')::timestamptz,
    case when resolved.void_reason is not null then 'void'
         when has_row and a_points is not null then 'scored'
         when not has_row and (played is true or ruling = 'played') then 'scored'
         else 'pending' end,
    case when resolved.void_reason is not null then null
         when has_row then a_points
         when played is true or ruling = 'played' then 0.0 end,
    resolved.void_reason, (v->>'house')::numeric
  from resolved;
end $$;

create function public.gtl_points_member_points(p_season integer, p_week integer)
returns table(user_id uuid, slot text, guess integer, points numeric)
language sql stable security invoker set search_path='' as $$
  select g.user_id, g.slot, g.guess, case when r.status = 'scored' then greatest(0, 10 - abs(g.guess - r.actual)) end
  from public.gtl_points_guesses g join public.gtl_points_slot_results(p_season, p_week) r on r.slot = g.slot
  where g.season = p_season and g.week = p_week and g.locked_at is not null
$$;
```

A played row with `points` null (a missing stat) is `pending`, never 0.

- [ ] **Step 5: Load, schedule update, rulings, finalize, jobs state and read**

`gtl_points_load_actuals`, in order:
1. Validate the payload and raise `GTL_POINTS_INVALID` on any failure:
   - `rulesVersion = 'points-1'`.
   - `sources.stats.sha256` is 64-hex; snaps and roster are optional.
   - `players` is an array of at most 5000 with the row shape from Task 3.
   - `played` is an object of booleans or nulls.
   - `review` has a boolean `checked` and `agrees` that is a boolean or null.
2. If the index finds the same checksums, return `{status:'replay', loadId}`.
3. `before := (select jsonb_object_agg(slot, to_jsonb(r)) from gtl_points_slot_results(...) r)`.
4. Set the status: `after_final` if a final row exists; else `flagged` if `review.checked and review.agrees is false`; else `saved`.
5. Insert the load and its `gtl_points_actuals` rows.
6. If the status is `saved`, compute `after` the same way and insert one `gtl_points_regrades` row per slot whose result changed.
7. Return.

`gtl_points_update_schedule`: for each slot whose `void` is null:
- Refuse (`GTL_POINTS_INVALID`) an empty map, a map with no game in `p_week`, or a map missing any slate game. If the game's `week <> p_week`, set `void = 'postponed'`.
- Else if the game's kickoff differs from the stored one and both are after `p_now`, update `kickoff`.

Append `{ at, action: 'schedule', slot, before, after }` to `audit` for each change. Never change `playerId`, `team`, `gameId` or `house`.

`gtl_points_rule_slot`:
- The actor must pass `gtl_community_admin`.
- Raise `GTL_POINTS_FINAL` if the week has a final row.
- The slot must exist and its kickoff must be at or before `p_now` (no rulings before the game).
- Insert the ruling and return the new slot result.

`gtl_points_finalize`:
- No slate: return `no_slate`.
- A final row exists: return `replay`.
- `p_now < finalize_at`: return `not_due`.
- Any slot is `pending`: return `waiting_on_stats`.
- Otherwise insert the final row with `results = { slots: [ {slot, playerId, kickoff, status, actual, voidReason, house} ], members: [ {userId, points, slots: {QB: n|null,…}} ], house: number|null, max }` and `load_id` = current saved load. Return `final`.

`gtl_points_jobs_state(p_season, p_now)`:
- `published` lists every week of `p_season` with a slate.
- `unfinal` lists, for weeks with no final row, `{ week, finalizeAt, firstKickoff }` with `firstKickoff = min(slot kickoff)`.

`gtl_points_read`: build the reply above from `gtl_points_slot_results`, `gtl_points_member_points`, `gtl_points_revealed` and the guesses.
- With null `p_season`/`p_week`, use the newest slate with `opens_at <= p_now`. If none exists, return `{ status: 'none', viewer, optedIn, members }`.
- `status` is `final` if a final row exists, `closed` if every slot's kickoff is at or before `p_now`, else `open`.
- House points use the same formula as members, from `house` and `actual`.

Grants: execute on every new function to `service_role` only.

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/points-sql.test.mjs tests/migrations.test.mjs tests/rollback.test.mjs`
Expected: PASS for all Points tests (16); the rollback suite stays green (this file adds no rollback, as an additive migration).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261026120000_gtl_points_core.sql tests/points-sql.test.mjs
git commit -m "P-01 part 2: actuals, results, rulings, FINAL freeze and the gated Points read"
```

---

### Task 6: `gtl-api` Points routes

**Files:**
- Create: `cloud/points.mjs`
- Modify: `cloud/handler.mjs` (route group + adapter), `cloud/feature-off.mjs` (`points`), `scripts/boundary/guess.mjs`, `tests/route-modules.test.mjs`, `tests/cloud-browser/community-world.mjs` (add `points: { rpc: rpc(providerPointsError) }` beside `league`)
- Test: `tests/points-cloud.test.mjs`

**Interfaces:**
- Consumes: Task 4–5 RPCs; `rankPoints` (Task 1); `buildPointsSlate`, `rankedPools`, `swapSlots` (Task 2); `rosterFacts`, `NFLVERSE` (Task 3); `pointsOpenAt`, `finalizeAt` (Task 1); `createFantasyService` (Track 1); `NFLVERSE_SCHEDULE_URL`, `buildSlate`, `nextWeek` (`shared/nfl-schedule.mjs`).
- Produces:
  - `POINTS_METHODS = { '/points/read': ['POST'], '/points/draft': ['POST'], '/points/lock': ['POST'], '/points/slate': ['POST'], '/points/rule': ['POST'] }`
  - `class PointsError`, `providerPointsError(message)`, `handlePoints({ route, body, user, service, clock, featureOff })`
  - `normalizePointsRead(raw) → raw + ranked standings` (`weekBoard.standings` and `seasonBoard.standings` gain `rank`, `tied` from `rankPoints`, with member display names)
  - Request bodies:
    - read `{ season?, week?, leagueId? }`
    - draft and lock `{ season, week, slot, guess, requestId }`
    - slate `{ action: 'preview' | 'publish', season, week, swaps?: [{ slot, playerId }] }`
    - rule `{ season, week, slot, ruling, reason }`
  - Slate preview reply: `{ season, week, opensAt, finalizeAt, slots, alternatives: { QB: Candidate[12], RB: …, WR: …, TE: …, FLEX: Candidate[] } }`

**Error map** (`ERRORS`, status and plain message):

| Code | HTTP | Message |
| --- | --- | --- |
| `GTL_POINTS_INVALID` | 400 | Choose a whole number from 0 to 60. |
| `GTL_POINTS_MEMBER` | 403 | Save your profile to play Guess the Points. |
| `GTL_POINTS_FORBIDDEN` | 403 | Only the commissioner can do that. |
| `GTL_POINTS_NO_SLATE` | 404 | This week's Points slate isn't published yet. |
| `GTL_POINTS_NOT_OPEN` | 409 | This week's Points slate isn't open yet. |
| `GTL_POINTS_CLOSED` | 409 | This player's game has started. Your guess was not saved. |
| `GTL_POINTS_LOCKED` | 409 | Locked-in guesses are final. |
| `GTL_POINTS_DELETE` | 409 | Guesses are never deleted. |
| `GTL_POINTS_PUBLISHED` | 409 | This week's slate is already published. |
| `GTL_POINTS_FINAL` | 409 | This week is FINAL. |
| `GTL_POINTS_RETRY_CONFLICT` | 409 | That request was already used for another guess. Check your saved guesses. |
| `GTL_POINTS_STALE_SNAPSHOT` | 503 | This week's estimates aren't published yet. |
| `GTL_POINTS_NO_VALID_SLATE` | 503 | No valid slate could be built from this week's estimates. |
| `GTL_POINTS_SWAP_INVALID` | 400 | That swap breaks a slate rule. Choose another player. |
| `GTL_FEATURE_OFF` | 503 | Guess the Points isn't available right now. Nothing you saved is lost. |

- [ ] **Step 1: Write the failing tests** — `tests/points-cloud.test.mjs`, two layers:
  - **Unit, against a stub `service.rpc`:**
    - Each route validates its body strictly and rejects unknown keys with 400.
    - Guess `12.5` is a 400 before any RPC call.
    - `featureOff.has('points')` returns 503 for every route.
    - `p_user` always comes from `user.id`, never from the body.
    - Unknown provider messages become a generic `Error` (503 via the handler), never the raw text.
    - `normalizePointsRead` ranks ties T-2.
  - **Handler, on `createCommunityWorld({ migrations: ALL })` with `world.api(account, 'points/…', body)`:**
    - luke drafts, then locks.
    - troy's read hides luke's guess until troy locks.
    - luke's second lock returns 409 `Locked-in guesses are final.`
    - sean's `slate` preview returns 5 slots plus alternatives from a stubbed `createFantasyService` and a stubbed schedule and roster fetch.
    - luke's `slate` returns 403.
    - publish with an invalid swap returns 400.
  - **Route map:** `tests/route-modules.test.mjs` lists the five new routes under module `points`, and each route belongs to exactly one module.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-cloud.test.mjs tests/route-modules.test.mjs`
Expected: FAIL, `cloud/points.mjs` not found and the route map mismatch.

- [ ] **Step 3: Implement `cloud/points.mjs`** — copy `cloud/league.mjs`'s structure (error class, `ERRORS`, `providerPointsError`, strict body checks, `UUID_PATTERN` user check, feature-off check, `service.rpc` call, normalizer). Specifics:
  - **read:** call `gtl_points_read({ p_user, p_season, p_week, p_league, p_now })`, then `normalizePointsRead`. Also call `optionalRpc('gtl_points_open_status', { p_now })` and add its result as `openStatus` when it is not `FEATURE_OFF`; P-03 supplies that function.
  - **draft and lock:** call `gtl_points_save` with `p_lock` false or true and `p_request` = `body.requestId`, which must be a UUID.
  - **slate preview/publish:**
    1. Call `service.rpc('gtl_points_is_admin', { p_user: user.id })` (Task 5) before any fetch; false means `GTL_POINTS_FORBIDDEN`.
    2. `season = fantasySeason(now)`.
    3. Fetch `NFLVERSE_SCHEDULE_URL` with a 15 s timeout and an 8 MB cap, then `const target = nextWeek(csv, season, now)` and `buildSlate(csv, season, target.week)` for the last kickoff.
    4. `fantasy.week({ season, week: target.week })`. A 404 or a stale snapshot is `GTL_POINTS_STALE_SNAPSHOT`.
    5. `opensAt = now`; build with `buildPointsSlate`, then apply `swapSlots`.
    6. For publish only: fetch the roster release file (8 MB cap) and `rosterFacts(…, { week: target.week, playerIds })` to set each slot's `pfrId`.
    7. Call `gtl_points_publish_slate` with `p_finalize_at = finalizeAt(last kickoff)` and `provenance = { file, sha256, generatedAt, selectionVersion, seed: 'gtl-points|<season>|<week>|slate-1' }`.
  - **rule:** call `gtl_points_rule_slot` with `p_actor = user.id`.
  - Map `SlateError.code` to the table above.
- [ ] **Step 4: Wire the group** in `cloud/handler.mjs`:
  - Add `Object.freeze({ service: 'points', methods: POINTS_METHODS, handle: handlePoints, Error: PointsError })` to `ROUTE_GROUPS`.
  - Add `points: groupRpc(providerPointsError)` to the Supabase adapter.
  - Add `points` to `groupServices`.
  - Pass `fantasy` (`createFantasyService()`) and a bounded `fetchText(url, { maxBytes, timeoutMs })` into the points service.
  - In `cloud/feature-off.mjs` add `points: 'POST /points/*: Guess the Points reads and writes (P-01, D-56)'`.
- [ ] **Step 5: Boundary probes** in `scripts/boundary/guess.mjs`:
  - Add the ten `gtl_points_*` tables (`points_slates`, `points_guesses`, `points_guess_events`, `points_receipts`, `points_actual_loads`, `points_actuals`, `points_rulings`, `points_regrades`, `points_week_final`) to `tables`, plus P-03's two in Task 7.
  - Add `rpcChecks` for every new RPC with `missingId` arguments.
  - Add `apiChecks` for the five routes with `{}`.
  - Add each to `awaitingDeploy` with the comment `// P-01: remove with the release record of its hosted apply and the gtl-api deploy (Gate M step 8).`
- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/points-cloud.test.mjs tests/route-modules.test.mjs tests/boundary-areas.test.mjs tests/cloud-boundary.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cloud/points.mjs cloud/handler.mjs cloud/feature-off.mjs scripts/boundary/guess.mjs tests/route-modules.test.mjs tests/cloud-browser/community-world.mjs tests/points-cloud.test.mjs supabase/migrations/20261026120000_gtl_points_core.sql
git commit -m "Add the gtl-api Points routes, off switch and boundary probes"
```

---

### Task 7: P-03 scheduled jobs and the `gtl-points-jobs` worker

**Files:**
- Create: `supabase/migrations/20261026120200_gtl_points_schedule.sql`, `cloud/points-jobs.mjs`, `supabase/functions/gtl-points-jobs/index.ts`, `supabase/admin/points_cron.sql`
- Modify: `supabase/config.toml` (`[functions.gtl-points-jobs] verify_jwt = false`), `tests/migrations.mjs` (`NOT_HOSTED` adds `20261026120200`), `scripts/boundary/guess.mjs` (tables, worker probe `['scheduled Points jobs', 'gtl-points-jobs', { runId: missingId }]`, `awaitingDeploy`)
- Test: `tests/points-jobs.test.mjs`

**Interfaces:**
- Consumes: the D-24 pattern (`20261009150000_gtl_auto_open_week.sql:36-149`, `cloud/week-open.mjs`, `readRunBody` from `cloud/odds-refresh.mjs`); Tasks 1–5.
- Produces:
  - Tables `gtl_points_schedule (id text pk check (id='nfl-points'), enabled boolean default false, endpoint text check (endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-points-jobs$'), authorized_by uuid references auth.users, created_at)` and `gtl_points_runs (id uuid pk, schedule_id, job text check (job in ('open','actuals','finalize')), slot_start timestamptz, capability_hash, status, reason, claim_token, claimed_at, finished_at, created_at, unique(schedule_id, job, slot_start))`.
  - Run reasons `already_published`, `not_local_noon`, `no_fresh_snapshot`, `no_valid_slate`, `nothing_due`, `source_unavailable`, `load_failed`, `worker_timeout`, `dispatch_unavailable`.
  - `gtl_dispatch_points_job(p_job text) → jsonb` (cron only, never granted).
  - `gtl_claim_points_job(p_token text, p_run uuid) → jsonb { replay, runId, claim, job, actorId, now }`.
  - `gtl_complete_points_job(p_run uuid, p_claim uuid, p_reason text) → jsonb`.
  - `gtl_points_open_status(p_now timestamptz) → jsonb { week, reason, at } | null` (newest open run in the last 7 days that was skipped or failed; read by `/points/read`).
  - `createPointsJobsAdapter({ url, serviceRoleKey, fetchImpl })` (RPC allowlist: the three job functions, `gtl_points_jobs_state`, `gtl_points_publish_slate`, `gtl_points_update_schedule`, `gtl_points_load_actuals`, `gtl_points_finalize`).
  - `createPointsJobsHandler({ service, sources, clock })` where `sources = { fantasy, fetchText(url, { maxBytes, timeoutMs }) → { text, sha256, updatedAt, bytes, url } }`.

- [ ] **Step 1: Write the failing tests** — `tests/points-jobs.test.mjs`:
  - **SQL (PGlite with the `net.http_post` stand-in from `tests/week-open.test.mjs:152`):**
    - Dispatch is queued once per job and hour; a second dispatch returns `already_dispatched`.
    - Only the run's token claims it.
    - A five-minute-old run, a wrong token and a replay are refused or replayed.
    - Complete with each reason sets `skipped`/`failed`.
    - Every function is security invoker; `anon`/`authenticated` are denied on both tables and all functions.
  - **Worker (handler with stub `sources`, the real adapter against PGlite through a `fetchImpl` stub):**
    - **`open`:**
      - At Tuesday 12:00 PT with a valid snapshot it publishes the slate built by `buildPointsSlate`, with `pfrId` from the roster stub and `finalize_at` = `finalizeAt(last kickoff)`.
      - At 11:00 PT it skips `not_local_noon`.
      - With the fantasy service 404 it skips `no_fresh_snapshot` and publishes nothing.
      - A second run skips `already_published`.
    - **`actuals`:**
      - For a published week whose first kickoff passed, it calls `update_schedule` and then `load_actuals` with `actualsPayload` built from the stub CSVs.
      - A stats fetch failure completes `source_unavailable` and writes no load.
      - A week with no kickoff yet is `nothing_due`.
    - **`finalize`:** at Thursday 12:00 PT it runs `actuals` first, then `finalize`. `waiting_on_stats` completes as `skipped` with that reason recorded in the reply, not in the CHECK list: map it to `nothing_due`.
    - **Never logs secrets:** the handler's replies contain no token, URL query or service key.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-jobs.test.mjs`
Expected: FAIL, missing functions and module.

- [ ] **Step 3: Implement P-03** — copy `gtl_week_open_*` bodies with these changes:
  - `job` is part of the run's unique key.
  - `p_job` is validated against the three jobs.
  - The claim returns `job`.
  - Header comment: "P-03 … additive; the off switch is `update public.gtl_points_schedule set enabled=false` (a hosted change Sean approves); runs stay (D-23)".
  - Grants: `select` on both tables and `update(status,reason,claim_token,claimed_at,finished_at)` on runs to `service_role`; execute on claim, complete and `gtl_points_open_status` to `service_role`; dispatch revoked from everyone.
- [ ] **Step 4: Implement the worker** — `cloud/points-jobs.mjs`, following `cloud/week-open.mjs`:
  - **Local hour check:** `const { weekday } = pacificDate(now)`, plus the Pacific hour from `Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' })`.
    - `open` requires weekday 2 and hour 12.
    - `finalize` requires weekday 4 and hour 12.
    - `actuals` has no hour check.
  - **`open`:** the same build path as `/points/slate` publish (share one function, `publishWeekSlate({ season, now, actor, sources, rpc })`, exported from `cloud/points.mjs` and imported here). Use the actor from the claim (`authorized_by`).
  - **`actuals` and the first half of `finalize`:**
    1. Call `gtl_points_jobs_state`.
    2. For at most two `unfinal` weeks with `firstKickoff <= now`, and only for the slate players and their games:
       1. Fetch `NFLVERSE_SCHEDULE_URL` (8 MB cap). Build `p_games` from `buildSlate(csv, season, w).games`, plus a scan of every REG game id across weeks so that a game moved to another week reads `{ week: n }`. Then call `update_schedule`.
       2. Fetch stats (16 MB cap, 30 s), snaps (8 MB) and roster (8 MB) with `sha256` computed by `crypto.subtle.digest('SHA-256', …)`.
       3. Fetch `fantasy.week({ season, week: w + 1 })` for the review; any failure means `review = null`.
       4. Call `load_actuals` with `actualsPayload(...)`.
  - **Finalize:** call `gtl_points_finalize` for each `unfinal` week with `finalizeAt <= now`.
  - **`supabase/functions/gtl-points-jobs/index.ts`:**

```ts
import { createPointsJobsAdapter, createPointsJobsHandler, createPointsSources } from '../../../cloud/points-jobs.mjs';

// Guess the Points scheduled jobs (D-56): pg_cron dispatches open (Tue 12:00 PT), actuals (daily) and finalize (Thu 12:00 PT).
// A short-lived per-run capability is verified by SQL, never logged or in Edge env.
const service = createPointsJobsAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createPointsJobsHandler({ service, sources: createPointsSources() }));
```

- [ ] **Step 5: Cron registration file** — `supabase/admin/points_cron.sql`. It is comments plus statements run by hand after Sean approves, and the CLI never runs it:

```sql
-- Guess the Points schedules (D-56). Run in the SQL editor only after Sean's go, after P-03 is applied and gtl-points-jobs is deployed.
insert into public.gtl_points_schedule(id,enabled,endpoint,authorized_by)
  values('nfl-points',false,'https://<project-ref>.supabase.co/functions/v1/gtl-points-jobs','<commissioner auth.users id>');
select cron.schedule('gtl-points-open-pdt','0 19 * * 2',$$select public.gtl_dispatch_points_job('open')$$);
select cron.schedule('gtl-points-open-pst','0 20 * * 2',$$select public.gtl_dispatch_points_job('open')$$);
select cron.schedule('gtl-points-actuals','30 11 * * 1-4',$$select public.gtl_dispatch_points_job('actuals')$$);
select cron.schedule('gtl-points-finalize-pdt','0 19 * * 4',$$select public.gtl_dispatch_points_job('finalize')$$);
select cron.schedule('gtl-points-finalize-pst','0 20 * * 4',$$select public.gtl_dispatch_points_job('finalize')$$);
-- After one verified manual run of each job:
update public.gtl_points_schedule set enabled=true where id='nfl-points';
```

The placeholders `<project-ref>` and `<commissioner auth.users id>` are filled by Sean at run time and are never committed. Existing admin files use the same pattern.

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/points-jobs.test.mjs tests/migrations.test.mjs tests/boundary-areas.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261026120200_gtl_points_schedule.sql cloud/points-jobs.mjs cloud/points.mjs supabase/functions/gtl-points-jobs/index.ts supabase/admin/points_cron.sql supabase/config.toml tests/migrations.mjs scripts/boundary/guess.mjs tests/points-jobs.test.mjs
git commit -m "P-03: Guess the Points open, actuals and finalize jobs"
```

---

### Task 8: P-02 feed posts and the Points push reminder

**Files:**
- Create: `supabase/migrations/20261026120100_gtl_points_feed_push.sql`
- Modify: `cloud/community.mjs` (`KINDS` + normalizer), `cloud/push-reminders.mjs` (Points pass), `web/src/next/league/LeagueScreen.jsx` (`postText`), `tests/migrations.mjs` (`NOT_HOSTED` adds `20261026120100`)
- Test: `tests/points-feed-push-sql.test.mjs`, `tests/push-reminders.test.mjs` (add), `tests/community-cloud.test.mjs` or the existing community normalizer test (add)

**Interfaces:**
- Consumes: `gtl_feed_posts`, `gtl_push_reminders_sent`, `gtl_push_reminder_runs`, `gtl_push_subscriptions` (`20261013030000_gtl_web_push_reminders.sql`), `pacificClock(instant)` (`cloud/push-reminders.mjs:45`).
- Produces:
  - Feed kinds `points_played` (payload `{}`) and `points_final` (payload `{ winners: [{ userId, points }], house: number | null, max }`), mode `null`.
  - `gtl_points_reminder_candidates(p_run uuid, p_claim uuid, p_now timestamptz) → jsonb { players: [{ userId, season, week, open, nextKickoff, subscriptions: [{ endpoint, p256dh, auth }] }] }`.
  - `gtl_mark_points_reminder(p_run uuid, p_claim uuid, p_user uuid, p_season integer, p_week integer) → jsonb { recorded: boolean }`.
  - `pointsReminderPayload({ season, week, open, nextKickoff }) → { title: 'Guess The Line', body: 'Week 8 Points: 3 players still open. Next locks 10:00 AM PT.', tag: 'gtl-points-2026-8' }`.

- [ ] **Step 1: Write the failing tests:**
  1. **Feed:**
     - The first lock-in of a week writes one `points_played` post (actor = player, `mode` null); later lock-ins that week write none.
     - A finalize writes one `points_final` post whose actor is the top scorer (first by display name on a tie), with every tied winner in `payload.winners`.
     - A week where nobody played writes no post.
     - `gtl_read_community` returns both kinds unchanged.
     - The `cloud/community.mjs` normalizer keeps them and drops a malformed `points_final` payload.
  2. **Push SQL:**
     - Candidates include only members who are opted in (any locked slot this season), have an active subscription, have at least one unlocked, non-void slot with `p_now < kickoff <= p_now + interval '2 hours'`, and were not reminded this week (`mode 'guess_points', kind 'points_next_2h'`).
     - Mark is idempotent.
     - A wrong claim or a finished run raises `GTL_SCHEDULE_RUN`.
     - `gtl_mark_push_reminder` still refuses `guess_points` (its own list is unchanged).
  3. **Worker:**
     - After the Spread/Total pass, the worker calls the candidates function and sends `pointsReminderPayload`.
     - When the RPC is missing (404, `PGRST202`), the Points pass is skipped and the Spread/Total pass still completes.
     - The payload text never contains a player name, guess or score: assert against a fixture whose player names and guesses are sentinel strings.
  4. **Copy:**
     - `pointsReminderPayload({ season: 2026, week: 8, open: 3, nextKickoff: '2026-11-01T18:00:00Z' }).body === 'Week 8 Points: 3 players still open. Next locks 10:00 AM PT.'`
     - With `open: 1` the body reads `1 player still open`.
  5. **App:** `postText({ kind: 'points_played', week: 8 }) === 'is playing Week 8 Points.'` and `postText({ kind: 'points_final', week: 8, payload: { winners: [{ points: 38.4 }], house: 31.2 } }) === 'won Week 8 Points with 38.4 · House 31.2 · FINAL.'`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-feed-push-sql.test.mjs tests/push-reminders.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement P-02:**
  - **Widen the CHECKs:** `alter table public.gtl_feed_posts drop constraint gtl_feed_posts_kind_check, add constraint gtl_feed_posts_kind_check check (kind in ('joined','ballot_submitted','bet_posted','bet_settled','week_published','points_played','points_final'));` Do the same for `gtl_push_reminders_sent_mode_check` (add `'guess_points'`) and `gtl_push_reminders_sent_kind_check` (add `'points_next_2h'`).
  - **`points_played` trigger:** an `after insert or update of locked_at` trigger on `gtl_points_guesses` inserts it with `dedupe_key = format('points_played:%s:%s:%s', new.user_id, new.season, new.week)` and `on conflict do nothing`.
  - **`points_final` trigger:** an `after insert` trigger on `gtl_points_week_final` inserts it with `dedupe_key = format('points_final:%s:%s', new.season, new.week)`.
  - **Header:** state that rollback files may not contain `alter` (`supabase/rollback/README.md`), so the widened CHECKs stay on rollback (fix-forward). Run `node --test tests/rollback.test.mjs`; if it asks for a rollback for P-02 because of the altered CHECKs, add P-02's version to `FIX_FORWARD` in `tests/migrations.mjs` with the comment `// P-02: widened CHECKs only; rollback files may not alter tables.` The off switches are `GTL_FEATURE_OFF=points` (no new lock-ins, so no new `points_played` posts) and the P-03 schedule `enabled=false` (no finalize, so no `points_final`).
  - **Candidate and mark functions:** copy the claim check from `gtl_mark_push_reminder` (lines 168-169) and the subscriptions sub-select from `gtl_claim_push_reminders` (lines 145-159).
- [ ] **Step 4: Implement the app and worker parts:**
  - `cloud/community.mjs`: add both kinds to `KINDS`. The normalizer passes `{ winners, house, max }` for `points_final` after checking that `winners` is an array of `{ userId: uuid, points: finite }`, `house` is finite or null, and `max` is an integer between 0 and 50.
  - `cloud/push-reminders.mjs`: export `pointsReminderPayload`. After the existing sends, run the Points pass through the adapter's allowlist, adding both new RPC names.
  - `LeagueScreen.jsx` `postText`: add the two lines from the test. The FINAL post's leading avatar is the actor (faces first).
- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/points-feed-push-sql.test.mjs tests/push-reminders.test.mjs tests/migrations.test.mjs tests/rollback.test.mjs && npx vitest run tests/next-league-ui.test.jsx`
Expected: PASS. If `tests/next-league-ui.test.jsx` does not exist, add the two `postText` assertions to the nearest LeagueScreen render test instead.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261026120100_gtl_points_feed_push.sql cloud/community.mjs cloud/push-reminders.mjs web/src/next/league/LeagueScreen.jsx tests/migrations.mjs tests/points-feed-push-sql.test.mjs tests/push-reminders.test.mjs
git commit -m "P-02: Points feed posts and the one weekly Points reminder"
```

---

### Task 9: Five visual alternatives for the ballot card and results state (Sean picks)

**Files:**
- Create: `docs/design/points-ballot-alternatives.html` (static, fictional players only, `gx-` tokens copied from `web/src/next/styles/tokens.css`)
- Modify: `docs/GUESS_THE_POINTS.md` (Task 12 creates it; record the pick here)

The design-exploration rule (AGENTS.md; `docs/DESIGN_EXPLORATION.md`) requires five visual alternatives and Sean's selection before the screen is finalized. This task does not block Tasks 1–8 or 10's logic; it blocks Task 10's final styling.

- [ ] **Step 1:** Draw five alternatives of one slot card in four states each: To pick (with the 0–60 chip rail), Locked in (hidden others: lock line), Revealed (faces and guesses, House), and Results (actual, your points, PROVISIONAL or FINAL; plus one void card). Each follows D-38/D-55: at most 4 numbers on the card, one lime action, words beside every state. Light and Dark for each. Names and teams are fictional; no real player names or guesses.
- [ ] **Step 2:** Publish the page as a private Artifact for Sean, or send it as a file. Ask one question: "Which ballot card (A–E)?" Record his answer verbatim, with the date, in `docs/GUESS_THE_POINTS.md`.
- [ ] **Step 3: Commit**

```bash
git add docs/design/points-ballot-alternatives.html
git commit -m "Add five Guess the Points ballot card alternatives for Sean's pick"
```

---

### Task 10: Play › Points screen

**Files:**
- Create: `web/src/next/play/points/PointsScreen.jsx`, `PointsSlotCard.jsx`, `PointsPicker.jsx`, `PointsAdminSheet.jsx`, `pointsView.js`, `points.css`
- Modify: `web/src/api.js` (`pointsApi`), `web/src/next/data/AppData.jsx` (`points` source), `web/src/next/shell/router.js:5` (`play` sections add `'points'`), `web/src/next/shell/state.js:32` (`navigationPatch` treats `'points'` like `'picks'`), `web/src/next/play/Play.jsx` (route + landing row), `web/src/next/info.js` (`INFO.points`, `GUIDANCE_ORDER`), `web/src/next/copy.js` (`POINTS_COPY`)
- Test: `tests/points-view.test.mjs`, `tests/next-points-ui.test.jsx`, `tests/next-router.test.mjs` (add)

**Interfaces:**
- Consumes: `/points/*` (Task 6); `rankLabel`, `GUESS_MAX` (Task 1); kit `Card`, `Row`, `List`, `Pill`, `Button`, `IconButton`, `Dialog`, `Sheet`, `Chip`, `Avatar`, `AvatarStack`, `LockLine`, `InfoButton`, `FocusRow`; `useLeagueRead`, `LeagueFailure`.
- Produces:
  - `pointsApi(action, body, signal)` with allowlist `['read','draft','lock','slate','rule']`; `save: true` for the four writes.
  - `pointsView.js`, pure:
    - `slotStatus(slot, now) → 'To pick' | 'Draft' | 'Locked in' | 'Closed' | 'Void · inactive' | 'Void · postponed' | 'Void · team change' | 'Void · ruled' | 'Pending stats'`
    - `cardNumbers(slot) → { guess, actual, points, house }` (each a number or `'—'`; at most 4)
    - `weekLine(read) → 'You 24.6 of 50 · PROVISIONAL'`
    - `pointsStatusLine(read, now) → string`
    - `pointsHomeLine(read) → { text, done, of } | null`
    - `pointsDue(read, now) → { open, nextKickoff } | null`

**Copy (exact):**
- Landing row title `Guess the Points`. Sub, from `pointsStatusLine`:
  - `none`, before Tuesday noon: `Opens Tuesday 12:00 PM PT`.
  - `openStatus.reason === 'no_fresh_snapshot'`: `Waiting on fresh estimates`.
  - Open: `3 of 5 locked · next locks Sun 10:00 AM PT`.
  - All locked and closed: `5 of 5 locked · PROVISIONAL`.
  - Final: `FINAL · You 31.4 of 50`.
- Title `WEEK 8 POINTS`; line `weekLine`.
- Lock button `Lock in 18`; dialog title `Lock in 18 for Al Wr?`, text `This guess is final. Everyone's guesses and House for this player open once it's locked.`, buttons `Keep editing` / `Confirm lock-in`.
- Hidden others: `Everyone's guesses show after you lock in, or at kickoff.` Hidden House: `House shows after you lock in, or at kickoff.`
- Draft after kickoff: `Your draft was not locked in and does not score.`
- ⓘ `INFO.points.title = 'About Guess the Points'`, body (one string each):
  1. `Each week GTL picks five players: a QB, RB, WR, TE and FLEX. Guess each one's Full PPR fantasy points, a whole number from 0 to 60.`
  2. `Each guess locks in on its own and is final. Unlocked guesses are drafts until that player's kickoff; a guess not locked in by then scores nothing.`
  3. `Each player is worth 10: you lose 1 point per fantasy point off, down to 0. Guess 18, actual 14.6: 6.6.`
  4. `Points are PROVISIONAL when stats arrive, change only for stat corrections, and are FINAL the following Thursday at 12:00 PM PT.`
  5. `A player with no snaps, a team change or a game moved out of the week is void for everyone; that week's maximum drops by 10.`
  6. `House is GTL's own pace estimate, scored the same way and never ranked. It also appears in Research › Fantasy; Play hides it until you lock in so it doesn't steer your guess.`
  7. `Scoring: 1 per reception, 0.04 per passing yard, 4 per passing TD, −2 per interception, 0.1 per rushing or receiving yard, 6 per rushing, receiving or return TD, −2 per fumble lost, 2 per two-point conversion.`

  Links: `[{ text: 'Statistics: nflverse (CC BY 4.0)', href: 'https://github.com/nflverse/nflverse-data' }]`.

- [ ] **Step 1: Write the failing tests:**
  - **`tests/points-view.test.mjs`:**
    - Each status word for each slot state, including a void reason for each kind.
    - `cardNumbers` returns `'—'` for missing values, never 0, and never more than 4 numbers.
    - `weekLine` writes PROVISIONAL or FINAL out.
    - `pointsStatusLine` covers every branch above, and the Pacific time reads `10:00 AM` for `2026-11-01T18:00:00Z`.
    - `pointsDue` is null for a member who is not opted in.
  - **`tests/next-points-ui.test.jsx`:** follow the mocks in `tests/four-tab-landings.test.jsx:5-20` and render `PointsScreen` with a fixture read.
    - `markupProblems(html)` is `[]`.
    - Exactly one `gx-btn--primary` in view.
    - A hidden slot shows the two lock sentences and no other member's number. Use a sentinel guess 57 that must not appear.
    - A revealed slot leads each other guess with an avatar.
    - A results slot writes PROVISIONAL.
    - No `<img>` of a player.
    - Team abbreviations appear as text.
    - The admin sheet trigger shows only when `read.admin === true`.
  - **`tests/next-router.test.mjs`:** `#play/points?season=2026&week=8` parses to `{ tab: 'play', view: { section: 'points', season: 2026, week: 8 } }` and round-trips; `#play/pointsx` returns null.
- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/points-view.test.mjs tests/next-router.test.mjs && npx vitest run tests/next-points-ui.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement:**
  - **`PointsPicker`:** a `role="group"` (labelled `"<name> fantasy points guess"`) of kit `Chip`s for `0, 5, 10 … 40` and a `More` chip that switches to `45, 50, 55, 60`. Two `IconButton`s are labelled `Lower by 1` and `Raise by 1`. The readout uses `n-l` and `aria-live="polite"`. The value is clamped 0–60. Do not reuse `web/src/ChipPicker.jsx`: its classes are not `gx-` and its total mode is 0–200 in half points.
  - **`PointsSlotCard`:** a `Card as="article"` whose header carries the slot tag `Pill`, the name, `SEA @ DEN` and `kickoff · status word`. Its body is one of four things:
    - the picker plus a secondary `Lock in N` button (the screen's one primary is the sheet's confirm);
    - `LockLine`s while hidden;
    - an `AvatarStack` with `Row`s per member (avatar first) and a House row;
    - the results numbers.
  - **Lock-in flow:**
    1. Confirm in a `Dialog`.
    2. Call `pointsApi('lock', { season, week, slot, guess, requestId: crypto.randomUUID() })`.
    3. Re-read with `pointsApi('read')`.
    4. Refresh `app.refresh({ only: ['points'] })`.
    5. Mirror `PerGameEditor`'s save/confirm/error handling (`PerGamePlay.jsx:95-119`): 409 shows the server message and re-reads; 401 keeps the draft and asks for sign-in.
  - **Drafts:** keep them in `sessionStorage` under `gtl.points.<accountId>.<season>.<week>`, the same try/catch pattern as `PerGamePlay.jsx:15-24`, and save them server-side with `pointsApi('draft')` on a 1-second debounce.
  - **`PointsAdminSheet`:** open it with `shell.openSheet('sh.points-admin')` and register it in `LAYERS`. Before publishing it shows the preview's 5 slots, each with a `select` of that slot's alternatives, and one primary `Publish Week N now`. After kickoff it lists pending slots, each with `Mark played` and `Mark void`, a reason input and a confirm `Dialog`.
  - **`Play.jsx`:**
    - `if (section === 'points') return <PointsScreen/>;` goes before the picks check.
    - Add a `FocusRow icon="target" title="Guess the Points" sub={pointsStatusLine(points, now)}` to "More in Play", where `points = useSharedRead('points')`. A 503 with code `GTL_FEATURE_OFF` (feature not live or switched off) hides the row; any other read error shows `Points could not be loaded.` in the row sub, never a broken landing. Test both.
  - **`AppData.jsx`:** `points: signal => pointsApi('read', {}, signal)`.
- [ ] **Step 4: Apply Sean's Task 9 pick** to `points.css`, using only `--gx-` tokens. `tests/next-tokens.test.mjs` must pass with no new hex values outside `tokens.css`.
- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/points-view.test.mjs tests/next-router.test.mjs tests/next-tokens.test.mjs tests/next-data.test.mjs && npx vitest run tests/next-points-ui.test.jsx tests/four-tab-landings.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.js web/src/next/data/AppData.jsx web/src/next/shell/router.js web/src/next/shell/state.js web/src/next/play web/src/next/info.js web/src/next/copy.js tests/points-view.test.mjs tests/next-points-ui.test.jsx tests/next-router.test.mjs
git commit -m "Add the Play › Points screen, picker, lock-in and commissioner sheet"
```

---

### Task 11: League board, Home bar, tab counter and Research row

**Files:**
- Modify: `web/src/next/league/LeagueScreen.jsx` (board tab), `web/src/next/home/Home.jsx` (bar and next move), `web/src/next/play/index.js` (counter), `web/src/next/research/Research.jsx` (row)
- Create: `web/src/next/league/PointsBoard.jsx`
- Test: `tests/next-points-ui.test.jsx` (add), `tests/home-hero.test.mjs` or `tests/next-home-ui.test.jsx` (add), `tests/next-data.test.mjs` (counter)

**Interfaces:**
- Consumes: `pointsHomeLine`, `pointsDue`, `pointsStatusLine` (Task 10); `rankLabel`; `/points/read` with `leagueId`.
- Produces: `PointsBoard({ leagueId })`.

- [ ] **Step 1: Write the failing tests:**
  - **Board:**
    - The Standings market switcher offers Spread / Total / Points; `view.market === 'points'` selects it, and line 167's fallback no longer forces Spread for `'points'`.
    - Rows lead with an avatar and show rank (`T-2` for ties), name, `Week: n · Season: n` (`—` for missing).
    - A House row is labelled `House` with no rank and `Not ranked` for screen readers.
    - A member who never played is absent.
    - Inside a private league, `leagueId` is sent.
  - **Home:**
    - An opted-in read appends a `Points: 3 of 5 locked` status line and a bar with `done 3, of 5`.
    - A member who is not opted in gets no Points line.
    - Spread/Total bars are unchanged; `MODES` in `shared/guess-board.mjs` is not modified.
  - **Counter:** `counter({ community: dueFixture, points: openOptedIn })` counts one extra ballot (`2 ballots due`); a Points read that is not opted in or has no open slots adds nothing.
  - **Research:** the landing gains `FocusRow icon="target" title="Guess the Points"` that calls `shell.go('play', { section: 'points' })`. There is still exactly one primary button.
- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/next-data.test.mjs tests/home-hero.test.mjs && npx vitest run tests/next-points-ui.test.jsx tests/next-home-ui.test.jsx tests/four-tab-landings.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **LeagueScreen:**
    - `const BOARD_MARKETS = [...MARKETS, { value: 'points', label: 'Points' }];` Do not add `points` to `MODE` in `web/src/communityFormat.js`, which the old app shares.
    - `mode = view.market === 'points' ? 'points' : …`.
    - Render `<PointsBoard leagueId={app.league.community ? null : app.league.id}/>` when `mode === 'points'`.
  - **Home:** append `pointsHomeLine(points)` to both `hero.statusLines` and `progress` inside `Home.jsx`, keeping them index-aligned. Next move: when Spread and Total have no open games and `pointsDue(points, now)` has `open > 0`, the hero action reads `Lock in Week N Points` and goes to `play/points`.
  - **`play/index.js counter`:** add `+ (pointsDue(data?.points?.data, Date.now())?.open > 0 ? 1 : 0)`. Confirm the `data` shape that `SLOTS.play.counter` receives in `tests/next-data.test.mjs:476` and add `points` to that fixture.
  - **Research:** add the `FocusRow` after Trends.
- [ ] **Step 4: Run to verify pass** (same command as Step 2). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/next/league web/src/next/home/Home.jsx web/src/next/play/index.js web/src/next/research/Research.jsx tests/next-points-ui.test.jsx tests/next-home-ui.test.jsx tests/home-hero.test.mjs tests/next-data.test.mjs
git commit -m "Show Points on the League board, Home, the Play counter and Research"
```

---

### Task 12: Integrated verification, release card and docs

**Files:**
- Create: `tests/cloud-browser/next-points.spec.js`, `docs/GUESS_THE_POINTS.md`
- Modify: `docs/RULES.md` (one row), `docs/COMPLETION_REGISTER.md`

- [ ] **Step 1: Browser spec** — `tests/cloud-browser/next-points.spec.js`, following `next-per-game-scoring.spec.js:1-40`:
  - **Setup:** `communityWorld(page, baseURL, { migrations: ALL })`, with `page.route` replies for `points/read` from fixtures where needed.
  - **Lock-in flow:**
    1. Sign in as luke and open `Play`, then `Guess the Points`.
    2. Choose `15` from the chips, then `+` three times, so the readout shows 18.
    3. Press `Lock in 18`. The `alertdialog` `Lock in 18 for …?` opens with focus on `Keep editing`.
    4. Press `Confirm lock-in`. The written request has `slot: 'QB', guess: 18`, the card reads `Locked in`, and the lock lines become members' guesses at kickoff.
  - **Coverage:**
    - Axe at 390 and 320 px in Dark and Light.
    - 44 px targets.
    - Keyboard-only lock-in.
    - Reduced motion.
    - No request to any non-Supabase origin (`world.errors` empty).
    - Board tab: Points with a House row.
    - Back from `#play/points` returns to the Play landing.
- [ ] **Step 2: Full local checks**

Run: `npm run typecheck && npm test && npm run build && npm run test:cloud-browser -- tests/cloud-browser/next-points.spec.js tests/cloud-browser/next-per-game-scoring.spec.js && npm run build:cloud && node scripts/check-cloud-boundary.mjs --bundle-only`
Expected:
- Every suite passes with no new skips compared with the baseline from Prerequisite 3.
- The bundle scan finds no guess values, Points RPC responses or House values in `.local/cloud-dist`.
- The PR description lists the counts.

- [ ] **Step 3: Release card** — `docs/GUESS_THE_POINTS.md`:
  - What shipped, with D-56 and links to the spec and this plan.
  - The migration ledger: P-01, P-02 and P-03 with filenames, "Apply after", rollback/off switch (`GTL_FEATURE_OFF=points`; `gtl_points_schedule.enabled=false`; P-02 fix-forward), and Gate M step 7 checks: function md5s, grants service-only, one `pg_proc` per RPC, and the Week 5 score-hash anchors unchanged (Sean 95.8, Steven 91.4, Ben 37.6).
  - The Edge function and cron registration steps.
  - The Task 3 inactive-signal check.
  - Sean's Task 9 pick.
  - The hosted CPU check result (filled at release).
  - Acceptance limits: fixture tests are not hosted or phone acceptance.
- [ ] **Step 4: Rules and register:**
  - `docs/RULES.md`: add one row `Guess the Points (D-56)` with the current rule summary from Global Constraints and "Not live until P-01–P-03 are applied and deployed".
  - `docs/COMPLETION_REGISTER.md`: replace the October 23 design note with the build state and PR link.
- [ ] **Step 5: Commit, push, PR, sync**

```bash
git add tests/cloud-browser/next-points.spec.js docs/GUESS_THE_POINTS.md docs/RULES.md docs/COMPLETION_REGISTER.md
git commit -m "Verify Guess the Points end to end and add its release card"
git push -u origin <task-branch>
gh pr create --base main --title "Guess the Points phase 1 (D-56)" --body-file <prepared body>
npm run sync:check
```

---

## Release (after the build PR merges; each step needs Sean's own words)

Gate M (`docs/REDESIGN_BUILD_PLAN.md` section 4.2) and Gate D (4.3) apply in full;
the October 19 policy removed calendar windows only.

1. **Deploy readers first (Gate D).** Deploy `gtl-api` and Pages from the merged SHA via `release.yml`. Before P-01 is applied, `/points/read` returns 503 `GTL_FEATURE_OFF`: a missing RPC maps through `FUNCTION_NOT_FOUND`. The Play, Home and Research rows stay hidden (Task 10). Spread and Total are unaffected.
2. **"apply P-01".**
   - Gate M steps 4–7: confirm with read-only checks that no `gtl_points_*` objects exist.
   - Apply through the Supabase MCP `apply_migration` or the SQL editor (see the migration-route memory: the browser SQL editor uses Sean's login).
   - Verify md5s, grants and the score hash.
   - Move the version to `APPLIED` and remove the P-01 `awaitingDeploy` probes.
3. **"apply P-02"** with the same steps. Deploy the updated `gtl-push-reminders` (the Points pass) only after it.
4. **Deploy `gtl-points-jobs`, then "apply P-03".** Run the first block of `supabase/admin/points_cron.sql` (the schedule row with `enabled=false` and the cron jobs) only on Sean's go.
5. **Manual runs and the hosted CPU check.**
   - The commissioner previews and publishes one slate from Play › Points (or waits for Tuesday).
   - Dispatch `actuals` once by hand: `select public.gtl_dispatch_points_job('actuals')` with the schedule temporarily enabled by Sean.
   - Read the hosted function logs for `gtl-points-jobs` execution time and errors, and the `gtl-api` logs for signed-in 2xx on `/points/read` and `/points/lock`. Unauthenticated denials alone are not evidence.
   - If the worker exceeds the Edge CPU limit, stop. Disable the schedule and take the spec 4.4 fallback (a compact actuals file in Track 1's release), which needs the Track 1 owner's agreement and Sean's approval.
6. **Enable the schedule** (`update … set enabled=true`) on Sean's go. The first live week is the next Tuesday open; no back-filled weeks.
7. **Record everything** in a dated `docs/RELEASE_2026_MM_DD_POINTS.md` and the completion register. Phone and full-week acceptance are separate evidence (queue Q19).

## Self-review (done while writing)

- **Spec coverage:** spec 3.1 → Tasks 1, 7; 3.2 → Tasks 2, 6; 3.3 → Tasks 4, 10; 3.4 → Tasks 5, 10; 3.5 → Tasks 1, 5; 3.6 → Tasks 3, 5; 3.7 → Tasks 1, 5, 11; 4.1/4.2 → Tasks 4–7; 4.3 → Tasks 8, 10, 11; 4.4 → Tasks 2, 3, 7; 5 → Tasks 9–11; 7 → Tasks 3, 5, 7; 8 → Tasks 4, 12; 9 → every task's tests; 10 → Release. Phase 2 (spec 6) is out of this plan.
- **Refinements of the spec, named so a reviewer can reject them:**
  - The scheduled worker calls the load RPC directly, and there is no public `/points/actuals` route. This gives a smaller surface, following the week-open pattern.
  - A stats row also proves a player played: a player with stats but no snap row is not left pending.
  - The review checksum cross-check runs only when the review and Points read the same upstream update. Different days' files always differ.
  - The commissioner swaps by publishing early with swaps, since the scheduler publishes at the open itself.
  - Feed posts carry `mode` null, so the mode CHECK is not widened.
- **Placeholders:** none in code or commands. `<task-branch>`, `<prepared body>`, `<project-ref>` and the commissioner id are run-time values that the repository's own admin files also leave to the operator.
- **Type consistency:** `Candidate`/`Slot` fields (`playerId, name, team, position, gameId, kickoff, window, house, pfrId`) are the same in Tasks 2, 4, 6 and 7. `played` is `{ [playerId]: true | false | null }` in Tasks 3 and 5. Reply keys in Task 5 match `pointsView.js` in Task 10.
