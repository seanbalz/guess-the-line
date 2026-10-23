# Fantasy Track 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep GTL's Fantasy rankings current automatically, publish an honest weekly accuracy record, and add matchup, kickoff, weather and D-39-gated implied-total context to each player.

**Architecture:** A manual-then-scheduled GitHub workflow builds the snapshot (and the previous week's review) from nflverse with pure shared modules and publishes content-addressed files plus `index.json` as release assets on this repository. A signed-in gtl-api route `/fantasy/week` reads, verifies and caches those files. The app loads hosted data first and falls back to committed snapshots. Implied totals are computed only in the viewer's app from the viewer's own `/lines/read` reply.

**Tech Stack:** Node 22 ESM (`node --test`), React 19 + Vite (vitest render tests), Supabase Edge (Deno) via `cloud/handler.mjs`, GitHub Actions + `gh` CLI, Playwright browser tests with PGlite.

**Spec:** [`docs/superpowers/specs/2026-10-23-fantasy-track1-design.md`](../specs/2026-10-23-fantasy-track1-design.md) (D-57).

## Global Constraints

- Data: only nflverse CC BY 4.0 sources already used (`stats_player_week`, `roster_weekly`, `injuries`, `games.csv`). No PFR snap counts, FTN/CC BY-SA data, expert rankings, odds or GTL account data in any snapshot, review, static asset or the `/fantasy/week` route.
- Implied team totals: only when the viewer's `spread.visible === true` **and** `total.visible === true` for that game in the viewer's own `/lines/read` reply; home = total/2 − spread/2, away = total/2 + spread/2 (spread is the signed home spread). Otherwise the lock line names the hidden market(s). Never read `mine.lineAtGuess`.
- Missing values display "—", never 0. PROVISIONAL and FINAL are written out. Every number style is tabular; spreads use the real minus sign.
- New app (`theme="next"`): only `gx-` classes and `--gx-` tokens (no hex/rgb), at most six numbers per card, touch targets ≥ 44 px, reading text 16 px.
- Pace formula and scoring weights unchanged; `method.version` becomes `1.1`.
- Workflow: runs only on `main`, `permissions: contents: write`, no other secrets, ships with `workflow_dispatch` only (schedule added later in Task 14).
- Route: `POST /fantasy/week`, body `{}` or `{ season, week }` only; signed-in; 503 text "Fantasy data is not available right now."
- Release: tag `fantasy-data-<season>`, prerelease, data only. Files `YYYY-week-NN.<sha8>.json`, `YYYY-review-week-NN.<sha8>.json`; `index.json` uploaded last; caps: index 64 KB, files 3 MB.
- Tests encode contracts; run `node --test tests/<file>` for node tests and `npx vitest run tests/<file>` for `.jsx` tests. SQL suites need PGlite: `npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8` once.
- Work on a branch from fresh `origin/main` in `C:\Users\sbals\betting-repo-worktrees\<name>` (never loose in `C:\Users\sbals`). Commit each task; push; never deploy without Sean's approval.

## File map

| File | Responsibility |
| --- | --- |
| `shared/fantasy-build.mjs` (modify) | Snapshot builder: partial current week ignored, one-week roster fallback, `completedWeeks`, `buildMatchups`, schema 2 |
| `shared/fantasy-rankings.mjs` (modify) | Validator accepts schema 1 and 2 |
| `shared/fantasy-context.mjs` (create) | Pure context: matchup tables, kickoff window, opponent/game id, implied totals, lock sentence, player context text |
| `shared/fantasy-review.mjs` (create) | Build, validate and summarize a week's accuracy review |
| `shared/fantasy-refresh.mjs` (create) | Pure planner: completed week, target week, freeze times, what to build |
| `shared/fantasy-index.mjs` (create) | Index shape, file names, validation, asset pruning, publish order |
| `scripts/fantasy-sources.mjs` (create) | Verified nflverse download/cache reading (moved out of `scripts/fantasy.mjs`) |
| `scripts/fantasy.mjs` (modify) | Uses `fantasy-sources.mjs`; behavior unchanged |
| `scripts/fantasy-refresh.mjs` (create) | Plans and writes files + `index.json` + `manifest.json` to an output folder |
| `scripts/fantasy-publish.mjs` (create) | Uploads with `gh` in the safe order, prunes, reads back |
| `.github/workflows/fantasy-refresh.yml` (create) | Runs refresh and publish on `main` |
| `cloud/fantasy.mjs` (create) | `/fantasy/week` route, bounded GitHub asset reader, verified cache |
| `cloud/handler.mjs` (modify) | Registers the `fantasy` route group and service |
| `scripts/boundary/lines.mjs` (modify) | Anonymous probe for `fantasy/week`, awaiting deploy |
| `web/src/fantasyLoader.js` (create) | Pure hosted-first loader with committed fallback |
| `web/src/fantasyData.js` (modify) | Wires the loader; `useFantasySnapshot(key \| null)` |
| `web/src/api.js` (modify) | `fantasyApi` |
| `web/src/fantasyContext.js` (create) | Lines + wind loading hook for Fantasy |
| `web/src/FantasyAccuracy.jsx` (create) | Accuracy card |
| `web/src/FantasyFootball.jsx` (modify) | Status line, context pill/details, accuracy card, latest-week default |
| `web/src/next/fantasy/FantasyScreen.jsx`, `FantasyHomeTile.jsx` (modify) | Latest week by default; copy |
| `web/src/fantasyFootball.css`, `web/src/next/fantasy/fantasy.css` (modify) | Styles for the new pieces |
| Tests | `tests/fantasy-build.test.mjs` (modify), `tests/fantasy-context.test.mjs`, `tests/fantasy-review.test.mjs`, `tests/fantasy-refresh.test.mjs`, `tests/fantasy-index.test.mjs`, `tests/fantasy-workflow.test.mjs`, `tests/fantasy-api.test.mjs`, `tests/fantasy-loader.test.mjs` (create), `tests/fantasy-ui.test.jsx`, `tests/cloud-boundary.test.mjs`, `tests/cloud-browser/fantasy.spec.js`, `tests/cloud-browser/community-world.mjs` (modify) |

---

### Task 1: Builder ignores partial current-week stats and allows a one-week roster fallback

**Files:**
- Modify: `shared/fantasy-build.mjs` (FANTASY_METHOD, new `completedWeeks`, body of `buildFantasySnapshot` lines 64–140)
- Test: `tests/fantasy-build.test.mjs` (replace the tests at lines 118–123 and 125–144)

**Interfaces:**
- Produces: `completedWeeks({ season, schedule, stats }) → Set<number>`; snapshot gains `rosterFallbackTeams: string[]`; `FANTASY_METHOD.version === '1.1'`.

- [ ] **Step 1: Write the failing tests** — in `tests/fantasy-build.test.mjs` replace the test `'selected/future-week statistics reject retrospective forecasts instead of contaminating the pace'` with:

```js
test('partial selected-week statistics are ignored; later weeks and a completed selected week still fail closed', () => {
  const clean = buildFantasySnapshot(fixture());
  const partial = fixture(); partial.stats.push(rawStats('SEA', 6, { rushing_yards: '99999' }));
  assert.deepEqual(buildFantasySnapshot(partial).players, clean.players, 'a Thursday game never changes any estimate');
  const later = fixture(); later.stats.push(rawStats('SEA', 7, { rushing_yards: '99999' }));
  assert.throws(() => buildFantasySnapshot(later), /after the selected week; retrospective forecasts are not supported/);
  const complete = fixture();
  for (const team of TEAMS.slice(2)) complete.stats.push(rawStats(team, 6));
  assert.throws(() => buildFantasySnapshot(complete), /already complete; retrospective forecasts are not supported/);
});

test('completedWeeks counts a week only when every scheduled game has both teams', () => {
  const input = fixture();
  assert.deepEqual([...completedWeeks(input)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  input.stats = input.stats.filter(row => !(row.week === '5' && row.team === 'SEA'));
  assert.deepEqual([...completedWeeks(input)].sort((a, b) => a - b), [1, 2, 3, 4]);
});
```

and replace the last four lines of `'bye teams retain their most recent roster for ROS while playing teams require the selected week'` (from `const missing = fixture();` to the closing `});`) with:

```js
  assert.deepEqual(snapshot.rosterFallbackTeams, []);
  const lastWeek = fixture();
  lastWeek.rosters.find(row => row.team === 'SEA').week = '5';
  const fallback = buildFantasySnapshot(lastWeek);
  assert.deepEqual(fallback.rosterFallbackTeams, ['SEA'], 'a playing team may use last week\'s roster and is counted');
  assert.match(find(fallback, 'SEA').status, /active roster as of Week 5/);
  const older = fixture();
  older.rosters.find(row => row.team === 'SEA').week = '4';
  assert.throws(() => buildFantasySnapshot(older), /roster coverage/i, 'a roster two weeks old is not treated as current');
});
```

Rename that test to `'bye teams retain their most recent roster; playing teams may use last week\'s roster, counted, never older'`. Add `completedWeeks` to the import from `../shared/fantasy-build.mjs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fantasy-build.test.mjs`
Expected: FAIL — `completedWeeks` is not exported; the partial-week build throws "Source must end immediately before the selected week".

- [ ] **Step 3: Implement** — in `shared/fantasy-build.mjs` change `version: '1.0'` to `version: '1.1'` in `FANTASY_METHOD`, add above `buildFantasySnapshot`:

```js
/** Regular-season weeks whose every scheduled game has statistics rows for both teams. */
export function completedWeeks({ season, schedule, stats }) {
  const sides = new Map();
  for (const row of stats) {
    if (Number(row.season) !== season || row.season_type !== 'REG') continue;
    if (!sides.has(row.game_id)) sides.set(row.game_id, new Set());
    sides.get(row.game_id).add(appCode(row.team));
  }
  const weeks = new Map();
  for (const game of schedule) {
    if (Number(game.season) !== season || game.game_type !== 'REG') continue;
    const week = Number(game.week);
    if (!weeks.has(week)) weeks.set(week, true);
    if (sides.get(game.game_id)?.size !== 2) weeks.set(week, false);
  }
  return new Set([...weeks].filter(([, complete]) => complete).map(([week]) => week));
}
```

then replace the block from `const seasonStats = …` through the roster coverage check (current lines 74–92) with:

```js
  const seasonStats = stats.filter(row => Number(row.season) === season && row.season_type === 'REG');
  // Partial selected-week rows (Thursday, Saturday, early Sunday) are identity-checked, then ignored. Later weeks, or a
  // selected week whose games are all played, would turn current data into a historical pseudo-forecast.
  if (Math.max(0, ...seasonStats.map(row => Number(row.week))) > week) throw new Error('Source contains statistics after the selected week; retrospective forecasts are not supported.');
  if (completedWeeks({ season, schedule, stats }).has(week)) throw new Error('The selected week is already complete; retrospective forecasts are not supported.');
  const knownGames = new Map(games.filter(row => Number(row.week) <= week).map(row => [row.game_id, row]));
  const priorGames = new Map([...knownGames].filter(([, row]) => Number(row.week) < week));
  const seenTeams = new Map();
  for (const row of seasonStats) {
    const game = knownGames.get(row.game_id), team = appCode(row.team);
    if (!game || Number(row.week) !== Number(game.week) || ![appCode(game.home_team), appCode(game.away_team)].includes(team)
      || appCode(row.opponent_team) !== (team === appCode(game.home_team) ? appCode(game.away_team) : appCode(game.home_team))) throw new Error('Stats and schedule game identity do not match.');
    if (!priorGames.has(row.game_id)) continue;
    if (!seenTeams.has(row.game_id)) seenTeams.set(row.game_id, new Set());
    seenTeams.get(row.game_id).add(team);
  }
  if ([...priorGames.keys()].some(id => seenTeams.get(id)?.size !== 2)) throw new Error('Prior-game statistics coverage is incomplete.');
  const priorRosters = rosters.filter(row => Number(row.season) === season && Number(row.week) <= week && row.game_type === 'REG');
  const plays = team => teamGames.get(team).some(row => Number(row.week) === week);
  // Byes keep their most recent roster. A playing team may use last week's roster until nflverse publishes this week's;
  // it is counted in rosterFallbackTeams and each player's status names the roster week. Anything older fails closed.
  const rosterWeek = new Map([...teamGames.keys()].map(team => [team,
    Math.max(0, ...priorRosters.filter(row => appCode(row.team) === team).map(row => Number(row.week))),
  ]));
  if ([...rosterWeek].some(([team, latest]) => latest < 1 || (plays(team) && latest < week - 1))) throw new Error('Selected week roster coverage is incomplete.');
  const rosterFallbackTeams = [...rosterWeek].filter(([team, latest]) => plays(team) && latest === week - 1).map(([team]) => team).sort();
  const selectedRosters = priorRosters.filter(row => Number(row.week) === rosterWeek.get(appCode(row.team)));
  if (new Set(selectedRosters.map(row => appCode(row.team))).size !== 32) throw new Error('Selected week roster coverage is incomplete.');
```

change the `priorStats` line to:

```js
  const priorStats = seasonStats.filter(row => Number(row.week) >= 1 && Number(row.week) < week && POSITIONS.has(row.position));
```

and add `rosterFallbackTeams,` to the snapshot object after `statsThroughWeek,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fantasy-build.test.mjs tests/fantasy-rankings.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-build.mjs tests/fantasy-build.test.mjs
git commit -m "Let Fantasy builds ignore partial current-week stats and use last week's roster, counted"
```

---

### Task 2: Matchup block, schema 2 and matchup tables

**Files:**
- Modify: `shared/fantasy-build.mjs` (add `buildMatchups`, schema 2), `shared/fantasy-rankings.mjs:96` (validator)
- Create: `shared/fantasy-context.mjs`
- Test: `tests/fantasy-build.test.mjs` (add), `tests/fantasy-context.test.mjs` (create)

**Interfaces:**
- Consumes: `normalizePlayerStats`, `appCode`, `scoreStats`.
- Produces: `buildMatchups(priorStats) → { [team]: [{ week, opponent, allowed: { QB, RB, WR, TE } }] }`; snapshot `schemaVersion: 2`, `matchups`; `MATCHUP_POSITIONS`; `matchupTable(snapshot, position, settings, recentGames = 4) → { position, teams, recentGames, rows: Map<team, { team, season, seasonGames, recent, recentGames, seasonRank, recentRank }> } | null`; `ordinal(n) → string`.

- [ ] **Step 1: Write the failing tests** — add to `tests/fantasy-build.test.mjs`:

```js
test('matchups sum what each defense allowed by offensive position per prior game, as raw stats', () => {
  const input = fixture();
  input.stats.push(rawStats('SEA', 3, { player_id: 'fixture-SEA-wr', position: 'WR', receptions: '6', receiving_yards: '75', rushing_yards: '0', carries: '0' }));
  const snapshot = buildFantasySnapshot(input);
  assert.equal(snapshot.schemaVersion, 2);
  const opponent = TEAMS[TEAMS.indexOf('SEA') ^ 1];
  const game = snapshot.matchups[opponent].find(row => row.week === 3);
  assert.equal(game.opponent, 'SEA');
  assert.equal(game.allowed.WR.receptions, 6);
  assert.equal(game.allowed.WR.receivingYards, 75);
  assert.equal(game.allowed.RB.rushingYards, 30, 'the SEA fixture RB rushed 3 × 10 yards in Week 3');
  assert.equal(game.allowed.TE.receptions, 0);
  assert.ok(snapshot.matchups[opponent].every(row => row.week < 6));
  assert.ok(!('CB' in game.allowed), 'only QB, RB, WR and TE are aggregated');
  assert.equal(validateFantasySnapshot(snapshot, { now: GENERATED }).valid, true);
});

test('schema 1 snapshots stay valid and a schema 2 snapshot needs well-formed matchups', () => {
  const snapshot = buildFantasySnapshot(fixture());
  assert.equal(validateFantasySnapshot({ ...snapshot, schemaVersion: 1, matchups: undefined, rosterFallbackTeams: undefined }, { now: GENERATED }).valid, true);
  assert.equal(validateFantasySnapshot({ ...snapshot, matchups: null }, { now: GENERATED }).valid, false);
  const team = Object.keys(snapshot.matchups)[0];
  const broken = structuredClone(snapshot); broken.matchups[team][0].allowed.WR = null;
  assert.equal(validateFantasySnapshot(broken, { now: GENERATED }).valid, false);
  const future = structuredClone(snapshot); future.matchups[team][0].week = 6;
  assert.equal(validateFantasySnapshot(future, { now: GENERATED }).valid, false);
});
```

Add `validateFantasySnapshot` to the import from `../shared/fantasy-rankings.mjs`.

Create `tests/fantasy-context.test.mjs`:

```js
// Contract: matchup context ranks what defenses allowed under the selected scoring; samples under two games stay unranked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchupTable, ordinal } from '../shared/fantasy-context.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
const allowed = (wr) => ({ QB: zero, RB: zero, WR: { ...zero, ...wr }, TE: zero });
const snapshot = { matchups: {
  AAA: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'X', allowed: allowed({ receptions: 10, receivingYards: 100 }) })),
  BBB: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'Y', allowed: allowed({ receptions: 0, receivingYards: 160 }) })),
  CCC: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'Z', allowed: allowed({ receptions: 10, receivingYards: 100 }) })),
  DDD: [{ week: 5, opponent: 'W', allowed: allowed({ receivingYards: 300 }) }],
} };

test('ranks run from most allowed, ties share a rank, and one game is not ranked', () => {
  const ppr = matchupTable(snapshot, 'WR', { scoring: 'ppr', passingTds: 4 });
  assert.equal(ppr.rows.get('AAA').recent, 20);
  assert.equal(ppr.rows.get('AAA').recentRank, 1);
  assert.equal(ppr.rows.get('CCC').recentRank, 1, 'equal displayed values share a rank');
  assert.equal(ppr.rows.get('BBB').recentRank, 3);
  assert.equal(ppr.rows.get('DDD').recent, null);
  assert.equal(ppr.rows.get('DDD').recentRank, null);
  assert.equal(ppr.rows.get('AAA').recentGames, 4);
  assert.equal(ppr.rows.get('AAA').seasonGames, 5);
});

test('scoring format changes the order (Standard puts the yardage defense first)', () => {
  const standard = matchupTable(snapshot, 'WR', { scoring: 'standard', passingTds: 4 });
  assert.equal(standard.rows.get('BBB').recentRank, 1);
  assert.equal(standard.rows.get('AAA').recentRank, 2);
});

test('kickers and schema 1 snapshots have no matchup table; ordinals read naturally', () => {
  assert.equal(matchupTable(snapshot, 'K', {}), null);
  assert.equal(matchupTable({}, 'WR', {}), null);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 32].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '32nd']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fantasy-build.test.mjs tests/fantasy-context.test.mjs`
Expected: FAIL — `schemaVersion` is 1; `../shared/fantasy-context.mjs` not found.

- [ ] **Step 3: Implement** — in `shared/fantasy-build.mjs` add after `estimatePace`:

```js
const MATCHUP_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const OFFENSE_STATS = ['passingYards', 'passingTds', 'interceptions', 'rushingYards', 'rushingTds', 'receptions', 'receivingYards', 'receivingTds', 'fumblesLost', 'twoPointConversions', 'specialTeamsTds'];
const zeroStats = () => Object.fromEntries(OFFENSE_STATS.map(key => [key, 0]));
const addStats = (total, stats) => Object.fromEntries(OFFENSE_STATS.map(key => [key, total[key] === null || stats[key] === null ? null : round(total[key] + stats[key])]));

/** What each defense allowed to each offensive position, per game before the selected week. Raw stats, scored by the app. */
export function buildMatchups(priorStats) {
  const games = new Map();
  for (const row of priorStats) {
    if (!MATCHUP_POSITIONS.includes(row.position)) continue;
    const defense = appCode(row.opponent_team), key = `${defense}|${row.week}`;
    if (!games.has(key)) games.set(key, { defense, week: Number(row.week), opponent: appCode(row.team), allowed: Object.fromEntries(MATCHUP_POSITIONS.map(position => [position, zeroStats()])) });
    const game = games.get(key);
    game.allowed[row.position] = addStats(game.allowed[row.position], normalizePlayerStats(row));
  }
  const out = {};
  for (const { defense, week, opponent, allowed } of [...games.values()].sort((a, b) => a.week - b.week)) (out[defense] ??= []).push({ week, opponent, allowed });
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
```

In `buildFantasySnapshot` set `schemaVersion: 2` and add `matchups: buildMatchups(priorStats),` after `rosterFallbackTeams,`.

In `shared/fantasy-rankings.mjs` replace `if (snapshot.schemaVersion !== 1) fail('Unsupported snapshot version.');` with:

```js
  if (![1, 2].includes(snapshot.schemaVersion)) fail('Unsupported snapshot version.');
  if (snapshot.schemaVersion === 2) {
    if (!Array.isArray(snapshot.rosterFallbackTeams) || snapshot.rosterFallbackTeams.some(team => !validText(team))) fail('Roster fallback list is invalid.');
    if (!isRecord(snapshot.matchups)) fail('Matchups are missing.');
    else for (const [team, games] of Object.entries(snapshot.matchups)) {
      if (!Array.isArray(games)) { fail(`Matchups for ${team} are invalid.`); continue; }
      for (const game of games) {
        if (!isRecord(game) || !Number.isInteger(game.week) || game.week < 1 || game.week >= snapshot.week || !validText(game.opponent) || !isRecord(game.allowed)) { fail(`Matchups for ${team} are invalid.`); continue; }
        for (const position of ['QB', 'RB', 'WR', 'TE']) {
          if (!isRecord(game.allowed[position])) fail(`Matchups for ${team} Week ${game.week} ${position} are missing.`);
          else stats(game.allowed[position], `Matchups ${team} Week ${game.week} ${position}`);
        }
      }
    }
  }
```

(`stats` is a function declaration later in the same function, so it is hoisted.)

Create `shared/fantasy-context.mjs`:

```js
// Public Fantasy game context (D-57): what defenses allowed, kickoff windows, and implied team totals from the viewer's own
// gated lines reply. Pure functions only; nothing here fetches, and no line is ever stored in a Fantasy file.
import { scoreStats, formatFantasyNumber } from './fantasy-rankings.mjs';

export const MATCHUP_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
const tenth = value => Math.round((value + Number.EPSILON) * 10) / 10;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const enough = values => values.length >= 2 && values.every(value => value !== null);

export const ordinal = n => {
  const suffixes = ['th', 'st', 'nd', 'rd'], rest = n % 100;
  return `${n}${suffixes[(rest - 20) % 10] || suffixes[rest] || suffixes[0]}`;
};

/** Points allowed per game to one position under the selected scoring; rank 1 = most allowed; ties on the shown tenth share. */
export function matchupTable(snapshot, position, settings = {}, recentGames = 4) {
  if (!snapshot?.matchups || !MATCHUP_POSITIONS.includes(position)) return null;
  const rows = Object.entries(snapshot.matchups).map(([team, games]) => {
    const points = games.map(game => scoreStats(game.allowed?.[position], { ...settings, position }));
    const recent = points.slice(-recentGames);
    return { team, season: enough(points) ? mean(points) : null, seasonGames: points.length,
      recent: enough(recent) ? mean(recent) : null, recentGames: recent.length };
  });
  const rank = key => {
    const out = new Map(); let previous = null, current = 0;
    rows.filter(row => row[key] !== null).sort((a, b) => b[key] - a[key] || a.team.localeCompare(b.team)).forEach((row, index) => {
      const shown = tenth(row[key]); if (shown !== previous) current = index + 1;
      out.set(row.team, current); previous = shown;
    });
    return out;
  };
  const seasonRanks = rank('season'), recentRanks = rank('recent');
  return { position, teams: rows.length, recentGames, rows: new Map(rows.map(row => [row.team, {
    ...row, seasonRank: seasonRanks.get(row.team) ?? null, recentRank: recentRanks.get(row.team) ?? null,
  }])) };
}
```

(`formatFantasyNumber` is used by Task 10's additions to this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fantasy-build.test.mjs tests/fantasy-rankings.test.mjs tests/fantasy-context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-build.mjs shared/fantasy-rankings.mjs shared/fantasy-context.mjs tests/fantasy-build.test.mjs tests/fantasy-context.test.mjs
git commit -m "Add Fantasy matchup block (schema 2) and matchup tables by scoring"
```

---

### Task 3: Weekly accuracy review

**Files:**
- Create: `shared/fantasy-review.mjs`
- Test: `tests/fantasy-review.test.mjs`

**Interfaces:**
- Consumes: `completedWeeks`, `normalizePlayerStats` (Task 1), `scoreStats`, `validateFantasySnapshot`.
- Produces: `buildFantasyReview({ published, file: { name, sha256 }, schedule, stats, statsSource, generatedAt, freezeAt, final }) → review`; `validateFantasyReview(review) → { valid, errors }`; `summarizeReview(review, settings) → { graded, mae, baselineMae, within5, beatBaseline: string[], byPosition: [{ position, graded, mae, baselineMae }], overs, unders, noStatsRow, playedWithoutEstimate }` where `overs`/`unders` items are `{ id, name, team, position, estimate, actual, diff }`.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-review.test.mjs`:

```js
// Contract: a review grades exactly the published estimates against completed-week actuals; no-stats players are counted,
// never scored as zero; metrics depend on the selected scoring; the season-average baseline uses the same players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFantasyReview, validateFantasyReview, summarizeReview } from '../shared/fantasy-review.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const s = over => ({ ...zero, ...over });
const player = (id, team, position, estimate, past) => ({
  id, name: `Name ${id}`, team, position, sampleGames: 4, status: 'Fixture',
  weekly: estimate ? { status: 'scheduled', opponent: team === 'AAA' ? '@ BBB' : 'vs AAA', kickoff: '2026-10-11T17:00:00.000Z', stats: estimate } : { status: 'bye', opponent: null, kickoff: null, stats: null },
  restOfSeason: null, history: [1, 2, 3, 4].map(week => ({ week, ...past })),
});
const published = {
  schemaVersion: 1, season: 2026, week: 5, statsThroughWeek: 4, asOf: '2026-10-06T12:00:00Z', generatedAt: '2026-10-07T12:00:00Z',
  method: { name: 'Fixture', version: '1', description: 'Fixture pace.' },
  sources: [{ name: 'Fixture', url: 'https://example.test/s', license: 'CC BY 4.0', licenseUrl: 'https://example.test/l', retrievedAt: '2026-10-07T11:00:00Z', updatedAt: '2026-10-06T12:00:00Z', sha256: 'a'.repeat(64) }],
  players: [
    player('wr1', 'AAA', 'WR', s({ receptions: 5, receivingYards: 70 }), s({ receptions: 4, receivingYards: 50 })),
    player('rb1', 'BBB', 'RB', s({ rushingYards: 60 }), s({ rushingYards: 40 })),
    player('dnp', 'AAA', 'WR', s({ receptions: 3, receivingYards: 30 }), s({ receptions: 3, receivingYards: 30 })),
    player('bye', 'CCC', 'WR', null, s({ receptions: 2 })),
  ],
};
const schedule = [{ game_id: '2026_05_AAA_BBB', season: '2026', game_type: 'REG', week: '5', away_team: 'AAA', home_team: 'BBB', gameday: '2026-10-11', gametime: '13:00' }];
const raw = (id, team, position, over = {}) => ({
  player_id: id, position, team, opponent_team: team === 'AAA' ? 'BBB' : 'AAA', game_id: '2026_05_AAA_BBB', season: '2026', season_type: 'REG', week: '5',
  passing_yards: '0', passing_tds: '0', passing_interceptions: '0', rushing_yards: '0', rushing_tds: '0', receptions: '0', receiving_yards: '0', receiving_tds: '0',
  fumbles_lost_total: '0', passing_2pt_conversions: '0', rushing_2pt_conversions: '0', receiving_2pt_conversions: '0', special_teams_tds: '0', targets: '0', carries: '0', attempts: '0', ...over,
});
const stats = [raw('wr1', 'AAA', 'WR', { receptions: '7', receiving_yards: '100' }), raw('rb1', 'BBB', 'RB', { rushing_yards: '20' }), raw('rookie', 'AAA', 'WR', { receptions: '1' })];
const statsSource = { name: 'nflverse stats_player_week_2026.csv', url: 'https://example.test/s', license: 'CC BY 4.0', licenseUrl: 'https://example.test/l', retrievedAt: '2026-10-14T11:00:00Z', updatedAt: '2026-10-14T05:00:00Z', sha256: 'c'.repeat(64) };
const review = (over = {}) => buildFantasyReview({ published, file: { name: '2026-week-05.abcdef12.json', sha256: 'd'.repeat(64) }, schedule, stats, statsSource,
  generatedAt: '2026-10-14T11:05:00Z', freezeAt: Date.parse('2026-10-11T17:00:00Z'), final: false, ...over });

test('grades published estimates; a bye is not graded; no stats row is counted, not zero', () => {
  const r = review();
  assert.equal(validateFantasyReview(r).valid, true);
  assert.deepEqual(r.players.map(p => p.id), ['dnp', 'rb1', 'wr1']);
  assert.equal(r.players.find(p => p.id === 'dnp').actual, null);
  assert.equal(r.status, 'PROVISIONAL');
  assert.equal(r.estimate.publishedBeforeFreeze, true);
  assert.equal(r.playedWithoutEstimate, 1);
  const ppr = summarizeReview(r, { scoring: 'ppr', passingTds: 4 });
  assert.equal(ppr.graded, 2);
  assert.equal(ppr.noStatsRow, 1);
  assert.equal(ppr.mae, 4.5);
  assert.equal(ppr.baselineMae, 5);
  assert.equal(ppr.within5, 1);
  assert.deepEqual(ppr.beatBaseline, ['WR']);
  assert.deepEqual(ppr.overs.map(o => o.id), ['rb1']);
  assert.deepEqual(ppr.unders.map(u => u.id), ['wr1']);
});

test('scoring format changes the miss sizes from the same pairs', () => {
  assert.equal(summarizeReview(review(), { scoring: 'standard', passingTds: 4 }).mae, 3.5);
});

test('FINAL is written out, an incomplete week refuses to grade, and invalid reviews fail validation', () => {
  assert.equal(review({ final: true }).status, 'FINAL');
  assert.throws(() => review({ stats: stats.filter(row => row.team !== 'BBB') }), /not complete/);
  assert.equal(validateFantasyReview({ ...review(), status: 'DONE' }).valid, false);
  assert.equal(validateFantasyReview({ ...review(), players: [{ id: 'x' }] }).valid, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-review.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `shared/fantasy-review.mjs`:

```js
// Weekly accuracy record (D-57): the estimates that were published for a week, graded against that week's nflverse
// actuals with a season-average baseline. A report card for GTL's pace estimates, not a forecast or betting claim.
import { completedWeeks, normalizePlayerStats } from './fantasy-build.mjs';
import { scoreStats, validateFantasySnapshot } from './fantasy-rankings.mjs';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const round = value => Math.round(value * 1e6) / 1e6;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function averageStats(history) {
  if (history.length < 2) return null;
  const keys = Object.keys(history[0]).filter(key => key !== 'week');
  return Object.fromEntries(keys.map(key => [key, history.some(row => typeof row[key] !== 'number' || !Number.isFinite(row[key])) ? null
    : round(history.reduce((total, row) => total + row[key], 0) / history.length)]));
}

export function buildFantasyReview({ published, file, schedule, stats, statsSource, generatedAt, freezeAt, final }) {
  const { season, week } = published;
  if (!validateFantasySnapshot(published, { now: Date.parse(generatedAt) }).valid) throw new Error('The published snapshot is invalid.');
  if (!completedWeeks({ season, schedule, stats }).has(week)) throw new Error(`Week ${week} statistics are not complete yet.`);
  const actual = new Map();
  for (const row of stats) {
    if (Number(row.season) === season && row.season_type === 'REG' && Number(row.week) === week && POSITIONS.includes(row.position)) actual.set(row.player_id, normalizePlayerStats(row));
  }
  const estimated = new Set(), players = [];
  for (const player of published.players) {
    if (player.weekly?.status !== 'scheduled' || !player.weekly.stats) continue;
    estimated.add(player.id);
    players.push({ id: player.id, name: player.name, team: player.team, position: player.position, estimate: player.weekly.stats,
      actual: actual.get(player.id) ?? null, baseline: averageStats(player.history.filter(row => row.week < week)) });
  }
  return {
    schemaVersion: 1, season, week, generatedAt, status: final ? 'FINAL' : 'PROVISIONAL',
    estimate: { file: file.name, sha256: file.sha256, generatedAt: published.generatedAt, publishedBeforeFreeze: Date.parse(published.generatedAt) < freezeAt },
    actuals: statsSource, players: players.sort((a, b) => a.id.localeCompare(b.id)),
    playedWithoutEstimate: [...actual.keys()].filter(id => !estimated.has(id)).length,
  };
}

export function validateFantasyReview(review) {
  const errors = [], fail = message => errors.push(message);
  if (!isRecord(review)) return { valid: false, errors: ['Review is missing.'] };
  if (review.schemaVersion !== 1) fail('Unsupported review version.');
  if (!Number.isInteger(review.season) || !Number.isInteger(review.week) || review.week < 1 || review.week > 18) fail('Review week is invalid.');
  if (!iso(review.generatedAt)) fail('Review time is invalid.');
  if (!['PROVISIONAL', 'FINAL'].includes(review.status)) fail('Review status is invalid.');
  if (!isRecord(review.estimate) || typeof review.estimate.file !== 'string' || !/^[a-f0-9]{64}$/.test(review.estimate.sha256 ?? '') || typeof review.estimate.publishedBeforeFreeze !== 'boolean') fail('Review estimate source is invalid.');
  if (!isRecord(review.actuals) || typeof review.actuals.url !== 'string') fail('Review actuals source is invalid.');
  if (!Number.isInteger(review.playedWithoutEstimate) || review.playedWithoutEstimate < 0) fail('Review count is invalid.');
  if (!Array.isArray(review.players)) fail('Review players are missing.');
  else for (const player of review.players) {
    if (!isRecord(player) || typeof player.id !== 'string' || typeof player.name !== 'string' || !POSITIONS.includes(player.position) || !isRecord(player.estimate)
      || (player.actual !== null && !isRecord(player.actual)) || (player.baseline !== null && !isRecord(player.baseline))) { fail('Review player is invalid.'); break; }
  }
  return { valid: errors.length === 0, errors };
}

/** Metrics under the selected scoring. Players without a stats row, or without a scoreable stat line, are never scored. */
export function summarizeReview(review, settings = {}) {
  const graded = []; let noStatsRow = 0;
  for (const player of review.players) {
    const options = { ...settings, position: player.position };
    const estimate = scoreStats(player.estimate, options);
    if (estimate === null) continue;
    if (!player.actual) { noStatsRow++; continue; }
    const actual = scoreStats(player.actual, options);
    if (actual === null) continue;
    const baseline = player.baseline ? scoreStats(player.baseline, options) : null;
    graded.push({ id: player.id, name: player.name, team: player.team, position: player.position, estimate, actual, baseline, diff: estimate - actual, miss: Math.abs(estimate - actual) });
  }
  const mae = list => list.length ? mean(list.map(row => row.miss)) : null;
  const baselineMae = list => { const rows = list.filter(row => row.baseline !== null); return rows.length ? mean(rows.map(row => Math.abs(row.baseline - row.actual))) : null; };
  const byPosition = POSITIONS.map(position => { const list = graded.filter(row => row.position === position); return { position, graded: list.length, mae: mae(list), baselineMae: baselineMae(list) }; }).filter(row => row.graded);
  const pick = ({ id, name, team, position, estimate, actual, diff }) => ({ id, name, team, position, estimate, actual, diff });
  return {
    graded: graded.length, mae: mae(graded), baselineMae: baselineMae(graded),
    within5: graded.length ? graded.filter(row => row.miss <= 5).length / graded.length : null,
    beatBaseline: byPosition.filter(row => row.baselineMae !== null && row.mae < row.baselineMae).map(row => row.position),
    byPosition,
    overs: graded.filter(row => row.diff > 0).sort((a, b) => b.diff - a.diff || a.id.localeCompare(b.id)).slice(0, 5).map(pick),
    unders: graded.filter(row => row.diff < 0).sort((a, b) => a.diff - b.diff || a.id.localeCompare(b.id)).slice(0, 5).map(pick),
    noStatsRow, playedWithoutEstimate: review.playedWithoutEstimate,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fantasy-review.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-review.mjs tests/fantasy-review.test.mjs
git commit -m "Add Fantasy weekly accuracy review with season-average baseline"
```

---

### Task 4: Refresh planner

**Files:**
- Create: `shared/fantasy-refresh.mjs`
- Test: `tests/fantasy-refresh.test.mjs`

**Interfaces:**
- Consumes: `completedWeeks` (Task 1), `easternToUtc`, `pacificDate`.
- Produces: `fantasySeason(now) → number`; `freezeTime(schedule, season, week) → number | null` (epoch ms); `planFantasyRefresh({ season, schedule, stats, index, committedWeeks, now }) → { season, completed, snapshot: { week, build, late, freezeAt } | null, review: { week, source: 'release' | 'committed' | null, build, final, freezeAt } | null }`.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-refresh.test.mjs`:

```js
// Contract: build the next week until its weekend slate starts; never rebuild after; one late build only if none exists;
// grade the last completed week until the same freeze, then once more as FINAL; Week 18 freezes four days after it ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasySeason, freezeTime, planFantasyRefresh } from '../shared/fantasy-refresh.mjs';

const day = (week, offset) => new Date(Date.UTC(2026, 8, 10 + (week - 1) * 7 + offset)).toISOString().slice(0, 10);
const wk = week => String(week).padStart(2, '0');
const schedule = Array.from({ length: 18 }, (_, i) => i + 1).flatMap(week => [
  { game_id: `2026_${wk(week)}_CCC_DDD`, season: '2026', game_type: 'REG', week: String(week), away_team: 'CCC', home_team: 'DDD', gameday: day(week, 0), gametime: '20:15' },
  { game_id: `2026_${wk(week)}_AAA_BBB`, season: '2026', game_type: 'REG', week: String(week), away_team: 'AAA', home_team: 'BBB', gameday: day(week, 3), gametime: '13:00' },
  { game_id: `2026_${wk(week)}_EEE_FFF`, season: '2026', game_type: 'REG', week: String(week), away_team: 'EEE', home_team: 'FFF', gameday: day(week, 4), gametime: '20:15' },
]);
const statsFor = (weeks, thursdayOnly = []) => weeks.flatMap(week => schedule
  .filter(game => Number(game.week) === week && (!thursdayOnly.includes(week) || game.away_team === 'CCC'))
  .flatMap(game => [game.away_team, game.home_team].map(team => ({ game_id: game.game_id, season: '2026', season_type: 'REG', week: String(week), team }))));
const weeks = n => Array.from({ length: n }, (_, i) => i + 1);
const at = iso => Date.parse(iso);
const index = (snapshots = [], reviews = []) => ({ snapshots: snapshots.map(week => ({ week })), reviews });

test('freeze is the first weekend kickoff, not Thursday night', () => {
  assert.equal(new Date(freezeTime(schedule, 2026, 6)).toISOString(), '2026-10-18T17:00:00.000Z');
});

test('Tuesday after Week 5: build Week 6, grade Week 5 from the committed file, PROVISIONAL', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(5)), index: null, committedWeeks: [5], now: at('2026-10-13T11:00:00Z') });
  assert.equal(plan.completed, 5);
  assert.deepEqual({ week: plan.snapshot.week, build: plan.snapshot.build, late: plan.snapshot.late }, { week: 6, build: true, late: false });
  assert.deepEqual({ week: plan.review.week, source: plan.review.source, build: plan.review.build, final: plan.review.final }, { week: 5, source: 'committed', build: true, final: false });
});

test('after Thursday night the week still rebuilds until the weekend slate', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(5)).concat(statsFor([6], [6])), index: index([6]), now: at('2026-10-16T11:00:00Z') });
  assert.equal(plan.completed, 5);
  assert.equal(plan.snapshot.build, true);
});

test('after the weekend kickoff: no rebuild; a missing week builds once, late; nothing after the last kickoff', () => {
  const stats = statsFor(weeks(5)), now = at('2026-10-18T18:00:00Z');
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([6]), now }).snapshot.build, false);
  const late = planFantasyRefresh({ season: 2026, schedule, stats, index: index([]), now }).snapshot;
  assert.deepEqual([late.build, late.late], [true, true]);
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([]), now: at('2026-10-20T01:00:00Z') }).snapshot.build, false, 'after Monday night');
});

test('a PROVISIONAL review is rebuilt once as FINAL after the freeze; a FINAL one never again', () => {
  const stats = statsFor(weeks(5)), now = at('2026-10-18T18:00:00Z');
  const provisional = planFantasyRefresh({ season: 2026, schedule, stats, index: index([5, 6], [{ week: 5, status: 'PROVISIONAL' }]), now }).review;
  assert.deepEqual([provisional.source, provisional.build, provisional.final], ['release', true, true]);
  const done = planFantasyRefresh({ season: 2026, schedule, stats, index: index([5, 6], [{ week: 5, status: 'FINAL' }]), now }).review;
  assert.equal(done.build, false);
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([6]), now }).review.source, null, 'no published estimate, nothing to grade');
});

test('Week 18: no next snapshot; review freezes four days after its last kickoff; season boundary', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(18)), index: index([18]), now: at('2027-01-12T11:00:00Z') });
  assert.equal(plan.snapshot, null);
  assert.equal(new Date(plan.review.freezeAt).toISOString(), '2027-01-16T01:15:00.000Z', 'Monday 8:15 PM ET plus four days');
  assert.equal(plan.review.final, false);
  assert.equal(fantasySeason(at('2027-01-15T00:00:00Z')), 2026);
  assert.equal(fantasySeason(at('2026-09-01T00:00:00Z')), 2026);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-refresh.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `shared/fantasy-refresh.mjs`:

```js
// The scheduled Fantasy refresh's pure planner (D-57). A week's snapshot is rebuilt each morning until its weekend slate
// starts, then frozen, so the review grades exactly what players saw. Week 1 has no pace estimate and is never built.
import { completedWeeks } from './fantasy-build.mjs';
import { easternToUtc, pacificDate } from './nfl-schedule.mjs';

const DAY = 86_400_000;
export const fantasySeason = now => { const date = new Date(now); return date.getUTCMonth() >= 2 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; };
const kickoffs = (schedule, season, week) => schedule
  .filter(row => Number(row.season) === season && row.game_type === 'REG' && Number(row.week) === week)
  .map(row => Date.parse(easternToUtc(row.gameday, row.gametime))).filter(Number.isFinite).sort((a, b) => a - b);

/** The first kickoff whose Pacific date is that week's Saturday or Sunday; the last kickoff if there is none. */
export function freezeTime(schedule, season, week) {
  const times = kickoffs(schedule, season, week);
  return times.find(time => [6, 7].includes(pacificDate(time).weekday)) ?? times.at(-1) ?? null;
}

export function planFantasyRefresh({ season, schedule, stats, index, committedWeeks = [], now }) {
  const done = completedWeeks({ season, schedule, stats });
  let completed = 0;
  while (done.has(completed + 1)) completed++;
  const target = completed + 1 <= 18 ? completed + 1 : null;
  const snapshots = new Set((index?.snapshots ?? []).map(entry => entry.week));
  const reviews = new Map((index?.reviews ?? []).map(entry => [entry.week, entry]));
  let snapshot = null;
  if (target && target >= 2) {
    const freezeAt = freezeTime(schedule, season, target), last = kickoffs(schedule, season, target).at(-1);
    const build = now < freezeAt || (!snapshots.has(target) && now < last);
    snapshot = { week: target, build, late: build && now >= freezeAt, freezeAt };
  }
  let review = null;
  if (completed >= 2) {
    const freezeAt = target ? freezeTime(schedule, season, target) : kickoffs(schedule, season, completed).at(-1) + 4 * DAY;
    const source = snapshots.has(completed) ? 'release' : committedWeeks.includes(completed) ? 'committed' : null;
    review = { week: completed, source, final: now >= freezeAt, build: source !== null && reviews.get(completed)?.status !== 'FINAL', freezeAt };
  }
  return { season, completed, snapshot, review };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fantasy-refresh.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-refresh.mjs tests/fantasy-refresh.test.mjs
git commit -m "Add Fantasy refresh planner with weekend freeze and final review"
```

---

### Task 5: Release index, file names, pruning and publish order

**Files:**
- Create: `shared/fantasy-index.mjs`
- Test: `tests/fantasy-index.test.mjs`

**Interfaces:**
- Produces: `FANTASY_REPOSITORY = 'seanbalz/guess-the-lines-repo'`; `MAX_FILE_BYTES = 3_000_000`; `snapshotFileName(season, week, sha256)`; `reviewFileName(season, week, sha256)`; `updateFantasyIndex(index | null, { season, snapshot, review, updatedAt }) → index`; `validateFantasyIndex(index) → { valid, errors }`; `assetsToPrune(assets: [{ name, createdAt }], index, keep = 3) → string[]`; `publishPlan({ files, existing, index, assets }) → [{ action: 'upload' | 'delete', name, clobber? }]`.
- Index entry shapes: snapshot `{ week, file, sha256, bytes, generatedAt, statsThroughWeek, publishedAfterFreeze, rosterFallbackTeams }`; review `{ week, file, sha256, bytes, generatedAt, status }`.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-index.test.mjs`:

```js
// Contract: content-addressed names; the index is replaced last and only names files that exist; superseded copies are
// pruned to the newest three per week; malformed indexes are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFileName, reviewFileName, updateFantasyIndex, validateFantasyIndex, assetsToPrune, publishPlan } from '../shared/fantasy-index.mjs';

const sha = c => c.repeat(64);
const snap = (week, c, over = {}) => ({ week, file: snapshotFileName(2026, week, sha(c)), sha256: sha(c), bytes: 900000, generatedAt: '2026-10-20T11:00:00Z', statsThroughWeek: week - 1, publishedAfterFreeze: false, rosterFallbackTeams: 0, ...over });
const rev = (week, c, status = 'PROVISIONAL') => ({ week, file: reviewFileName(2026, week, sha(c)), sha256: sha(c), bytes: 50000, generatedAt: '2026-10-20T11:00:00Z', status });

test('file names carry season, two-digit week and the first eight checksum characters', () => {
  assert.equal(snapshotFileName(2026, 8, sha('a')), '2026-week-08.aaaaaaaa.json');
  assert.equal(reviewFileName(2026, 7, sha('b')), '2026-review-week-07.bbbbbbbb.json');
});

test('updating replaces one week, keeps the rest, sorts, and validates', () => {
  const first = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  const next = updateFantasyIndex(first, { season: 2026, snapshot: snap(7, 'c'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  assert.deepEqual(next.snapshots.map(e => e.sha256), [sha('c')]);
  assert.equal(next.reviews.length, 1);
  assert.equal(validateFantasyIndex(next).valid, true);
  assert.throws(() => updateFantasyIndex(next, { season: 2027, snapshot: null, review: null, updatedAt: '2027-09-01T00:00:00Z' }), /season/);
});

test('validation refuses wrong names, oversize files, duplicate weeks and unknown statuses', () => {
  const ok = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  for (const broken of [
    { ...ok, snapshots: [{ ...snap(7, 'a'), file: '../index.json' }] },
    { ...ok, snapshots: [{ ...snap(7, 'a'), file: snapshotFileName(2026, 8, sha('a')) }] },
    { ...ok, snapshots: [snap(7, 'a', { bytes: 3_000_001 })] },
    { ...ok, snapshots: [snap(7, 'a'), snap(7, 'c')] },
    { ...ok, reviews: [rev(6, 'b', 'DONE')] },
    { ...ok, schemaVersion: 2 },
  ]) assert.equal(validateFantasyIndex(broken).valid, false);
});

test('pruning keeps indexed files and the three newest superseded copies per week', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'f'), review: null, updatedAt: '2026-10-21T11:00:00Z' });
  const assets = ['a', 'b', 'c', 'd', 'e', 'f'].map((c, i) => ({ name: snapshotFileName(2026, 7, sha(c)), createdAt: `2026-10-1${i}T11:00:00Z` }))
    .concat([{ name: 'index.json', createdAt: '2026-10-21T11:00:00Z' }]);
  assert.deepEqual(assetsToPrune(assets, index), [snapshotFileName(2026, 7, sha('a')), snapshotFileName(2026, 7, sha('b'))]);
});

test('publish order: new data files without clobber, then index.json with clobber, then prunes', () => {
  const index = updateFantasyIndex(null, { season: 2026, snapshot: snap(7, 'a'), review: rev(6, 'b'), updatedAt: '2026-10-20T11:00:00Z' });
  const steps = publishPlan({ files: [index.snapshots[0].file, index.reviews[0].file], existing: [index.reviews[0].file], index, assets: [] });
  assert.deepEqual(steps, [
    { action: 'upload', name: index.snapshots[0].file, clobber: false },
    { action: 'upload', name: 'index.json', clobber: true },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-index.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `shared/fantasy-index.mjs`:

```js
// The Fantasy release index (D-57): public nflverse-derived files on the fantasy-data-<season> release of this repository.
// Data files are content-addressed and never replaced; index.json is the only replaced asset and is uploaded last.
export const FANTASY_REPOSITORY = 'seanbalz/guess-the-lines-repo';
export const MAX_FILE_BYTES = 3_000_000;
const SNAPSHOT_FILE = /^(\d{4})-week-(\d{2})\.[0-9a-f]{8}\.json$/;
const REVIEW_FILE = /^(\d{4})-review-week-(\d{2})\.[0-9a-f]{8}\.json$/;
const pad = week => String(week).padStart(2, '0');
export const snapshotFileName = (season, week, sha256) => `${season}-week-${pad(week)}.${sha256.slice(0, 8)}.json`;
export const reviewFileName = (season, week, sha256) => `${season}-review-week-${pad(week)}.${sha256.slice(0, 8)}.json`;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function updateFantasyIndex(index, { season, snapshot, review, updatedAt }) {
  const base = index ?? { schemaVersion: 1, season, updatedAt, snapshots: [], reviews: [] };
  if (base.season !== season) throw new Error('Index season mismatch.');
  const put = (list, entry) => entry ? [...list.filter(item => item.week !== entry.week), entry].sort((a, b) => a.week - b.week) : list;
  return { schemaVersion: 1, season, updatedAt, snapshots: put(base.snapshots, snapshot), reviews: put(base.reviews, review) };
}

export function validateFantasyIndex(index) {
  const errors = [], fail = message => errors.push(message);
  if (!isRecord(index) || index.schemaVersion !== 1) return { valid: false, errors: ['Unsupported index.'] };
  if (!Number.isInteger(index.season) || index.season < 2020 || index.season > 2100 || !iso(index.updatedAt)) fail('Index header is invalid.');
  const entries = (list, pattern, name, extra) => {
    if (!Array.isArray(list)) { fail(`Index ${name} are missing.`); return; }
    const weeks = new Set();
    for (const entry of list) {
      const match = isRecord(entry) && typeof entry.file === 'string' ? entry.file.match(pattern) : null;
      if (!match || Number(match[1]) !== index.season || Number(match[2]) !== entry.week || !Number.isInteger(entry.week) || entry.week < 1 || entry.week > 18
        || weeks.has(entry.week) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || !entry.file.includes(`.${entry.sha256.slice(0, 8)}.`)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX_FILE_BYTES || !iso(entry.generatedAt) || !extra(entry)) { fail(`Index ${name} entry is invalid.`); continue; }
      weeks.add(entry.week);
    }
  };
  entries(index.snapshots, SNAPSHOT_FILE, 'snapshots', entry => Number.isInteger(entry.statsThroughWeek) && entry.statsThroughWeek === entry.week - 1
    && typeof entry.publishedAfterFreeze === 'boolean' && Number.isInteger(entry.rosterFallbackTeams) && entry.rosterFallbackTeams >= 0);
  entries(index.reviews, REVIEW_FILE, 'reviews', entry => ['PROVISIONAL', 'FINAL'].includes(entry.status));
  return { valid: errors.length === 0, errors };
}

export function assetsToPrune(assets, index, keep = 3) {
  const named = new Set([...index.snapshots, ...index.reviews].map(entry => entry.file)), groups = new Map();
  for (const asset of assets) {
    if (named.has(asset.name) || !(SNAPSHOT_FILE.test(asset.name) || REVIEW_FILE.test(asset.name))) continue;
    const key = asset.name.replace(/\.[0-9a-f]{8}\.json$/, '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return [...groups.values()].flatMap(list => list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(keep).map(asset => asset.name)).sort();
}

export function publishPlan({ files, existing, index, assets }) {
  return [
    ...files.filter(name => !existing.includes(name)).map(name => ({ action: 'upload', name, clobber: false })),
    { action: 'upload', name: 'index.json', clobber: true },
    ...assetsToPrune(assets, index).map(name => ({ action: 'delete', name })),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fantasy-index.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-index.mjs tests/fantasy-index.test.mjs
git commit -m "Add Fantasy release index, content-addressed names and publish order"
```

---

### Task 6: Refresh and publish scripts

**Files:**
- Create: `scripts/fantasy-sources.mjs`, `scripts/fantasy-refresh.mjs`, `scripts/fantasy-publish.mjs`
- Modify: `scripts/fantasy.mjs` (use `readFantasySources`)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `readFantasySources({ season, inputDir, root }) → { rows: { stats, rosters, injuries, schedule }, sources }`; `scripts/fantasy-refresh.mjs [--season N] [--out DIR] [--now ISO] [--input-dir DIR]` writes data files, `index.json` (only when a file was built) and `manifest.json` `{ season, plan, files, index }`; `scripts/fantasy-publish.mjs [--dir DIR]`.

- [ ] **Step 1: Move source reading** — create `scripts/fantasy-sources.mjs` with the source specs and the verified download/cache loop currently at `scripts/fantasy.mjs` lines 18–48:

```js
// Verified nflverse inputs for Fantasy snapshots: release metadata, size and SHA-256 checks, or a cached copy checked
// against its manifest. Shared by the manual builder (scripts/fantasy.mjs) and the scheduled refresh.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';

export async function readFantasySources({ season, inputDir = null, root }) {
  const specs = [
    { key: 'stats', tag: 'stats_player', file: `stats_player_week_${season}.csv`, columns: ['player_id', 'position', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team'] },
    { key: 'rosters', tag: 'weekly_rosters', file: `roster_weekly_${season}.csv`, columns: ['gsis_id', 'full_name', 'position', 'status', 'week', 'game_type'] },
    { key: 'injuries', tag: 'injuries', file: `injuries_${season}.csv`, columns: ['gsis_id', 'week', 'report_status', 'practice_status'] },
    { key: 'schedule', tag: 'schedules', file: 'games.csv', columns: ['game_id', 'season', 'game_type', 'week', 'home_team', 'away_team', 'gameday', 'gametime'] },
  ].map(spec => ({ ...spec, url: `https://github.com/nflverse/nflverse-data/releases/download/${spec.tag}/${spec.file}` }));
  const input = inputDir ? path.resolve(root, inputDir) : null;
  const manifest = input ? JSON.parse(await readFile(path.join(input, 'manifest.json'), 'utf8')) : null;
  const retrievedAt = new Date().toISOString();
  const sources = [], rows = {};
  for (const spec of specs) {
    let csv, metadata;
    if (input) {
      csv = await readFile(path.join(input, spec.file));
      metadata = manifest.find(entry => entry.name === spec.file && entry.browser_download_url === spec.url);
      if (!metadata || createHash('sha256').update(csv).digest('hex') !== metadata.sha256) throw new Error(`Unverified cached source: ${spec.file}`);
    } else {
      const release = await fetch(`https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/vnd.github+json' } });
      if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
      metadata = (await release.json()).assets.find(asset => asset.name === spec.file && asset.browser_download_url === spec.url);
      if (!metadata) throw new Error(`Source asset unavailable: ${spec.file}`);
      const response = await fetch(spec.url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${spec.file}`);
      csv = Buffer.from(await response.arrayBuffer());
      if (metadata.size !== csv.byteLength) throw new Error(`Source changed during download: ${spec.file}`);
    }
    const sha256 = createHash('sha256').update(csv).digest('hex');
    if (metadata.digest?.startsWith('sha256:') && metadata.digest !== `sha256:${sha256}`) throw new Error(`Source checksum mismatch: ${spec.file}`);
    sources.push({ name: `nflverse ${spec.file}`, url: spec.url, license: 'CC BY 4.0', licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md', retrievedAt: metadata.retrievedAt || retrievedAt, updatedAt: metadata.updated_at, sha256 });
    rows[spec.key] = parseFantasyCsv(csv.toString('utf8'), spec.columns);
  }
  return { rows, sources };
}
```

In `scripts/fantasy.mjs` delete lines 18–48 (the `specs` array through the end of the `for` loop), remove the now-unused `readFile`/`createHash`/`parseFantasyCsv` imports, add `import { readFantasySources } from './fantasy-sources.mjs';`, and insert in their place:

```js
const { rows, sources } = await readFantasySources({ season, inputDir: args.includes('--input-dir') ? value('--input-dir') : null, root });
```

- [ ] **Step 2: Verify the manual builder is unchanged**

Run: `node scripts/fantasy.mjs --season 2026 --week 8 --check`
Expected: one JSON line with `"season":2026,"week":8,"statsThroughWeek":7` and `"written":false` once Week 7 is complete (before then the error names the incomplete coverage; that is the correct fail-closed result). Run `node --test tests/fantasy-build.test.mjs` → PASS.

- [ ] **Step 3: Create the refresh script** — `scripts/fantasy-refresh.mjs`:

```js
#!/usr/bin/env node
// Scheduled Fantasy refresh (D-57): plans, builds and writes public, content-addressed files plus index.json and a
// manifest to an output folder. scripts/fantasy-publish.mjs uploads them. Never reads GTL picks, lines or account data.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFantasySources } from './fantasy-sources.mjs';
import { buildFantasySnapshot } from '../shared/fantasy-build.mjs';
import { buildRankings } from '../shared/fantasy-rankings.mjs';
import { buildFantasyReview, validateFantasyReview } from '../shared/fantasy-review.mjs';
import { planFantasyRefresh, fantasySeason, freezeTime } from '../shared/fantasy-refresh.mjs';
import { FANTASY_REPOSITORY, MAX_FILE_BYTES, snapshotFileName, reviewFileName, updateFantasyIndex, validateFantasyIndex } from '../shared/fantasy-index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const now = value('--now') ? Date.parse(value('--now')) : Date.now();
if (!Number.isFinite(now)) throw new Error('Invalid --now.');
const season = Number(value('--season') ?? fantasySeason(now));
const out = path.resolve(root, value('--out') ?? '.local/fantasy-release');
const base = `https://github.com/${FANTASY_REPOSITORY}/releases/download/fantasy-data-${season}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function download(name, { optional = false, expectSha } = {}) {
  const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(30_000) });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`Release file unavailable (${response.status}): ${name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`Release file too large: ${name}`);
  if (expectSha && sha(bytes) !== expectSha) throw new Error(`Release file checksum mismatch: ${name}`);
  return bytes;
}

const indexBytes = await download('index.json', { optional: true });
const index = indexBytes ? JSON.parse(indexBytes.toString('utf8')) : null;
if (index && !validateFantasyIndex(index).valid) throw new Error('The published index is invalid.');
const { rows, sources } = await readFantasySources({ season, inputDir: value('--input-dir') ?? null, root });
const committed = (await readdir(path.join(root, 'shared/fantasy')))
  .map(name => name.match(new RegExp(`^${season}-week-(\\d{2})\\.json$`))).filter(Boolean).map(match => Number(match[1]));
const plan = planFantasyRefresh({ season, schedule: rows.schedule, stats: rows.stats, index, committedWeeks: committed, now });
await mkdir(out, { recursive: true });
const generatedAt = new Date(now).toISOString(), files = [];
let snapshotEntry = null, reviewEntry = null;

if (plan.snapshot?.build) {
  const snapshot = buildFantasySnapshot({ season, week: plan.snapshot.week, ...rows, sources, generatedAt });
  const rankings = buildRankings(snapshot, {}, { now });
  if (rankings.error || !rankings.rows.length) throw new Error('No verified rankings could be generated.');
  const bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`), hash = sha(bytes), file = snapshotFileName(season, snapshot.week, hash);
  await writeFile(path.join(out, file), bytes); files.push(file);
  snapshotEntry = { week: snapshot.week, file, sha256: hash, bytes: bytes.byteLength, generatedAt, statsThroughWeek: snapshot.statsThroughWeek,
    publishedAfterFreeze: plan.snapshot.late, rosterFallbackTeams: snapshot.rosterFallbackTeams.length };
}
if (plan.review?.build) {
  const week = plan.review.week, entry = index?.snapshots.find(item => item.week === week);
  const committedName = `${season}-week-${String(week).padStart(2, '0')}.json`;
  const bytes = entry ? await download(entry.file, { expectSha: entry.sha256 }) : await readFile(path.join(root, 'shared/fantasy', committedName));
  const review = buildFantasyReview({
    published: JSON.parse(bytes.toString('utf8')), file: { name: entry?.file ?? committedName, sha256: entry?.sha256 ?? sha(bytes) },
    schedule: rows.schedule, stats: rows.stats, statsSource: sources.find(source => source.name.includes('stats_player')),
    generatedAt, freezeAt: freezeTime(rows.schedule, season, week), final: plan.review.final,
  });
  if (!validateFantasyReview(review).valid) throw new Error('The review failed validation.');
  const reviewBytes = Buffer.from(`${JSON.stringify(review)}\n`), hash = sha(reviewBytes), file = reviewFileName(season, week, hash);
  await writeFile(path.join(out, file), reviewBytes); files.push(file);
  reviewEntry = { week, file, sha256: hash, bytes: reviewBytes.byteLength, generatedAt, status: review.status };
}
const next = updateFantasyIndex(index, { season, snapshot: snapshotEntry, review: reviewEntry, updatedAt: generatedAt });
if (!validateFantasyIndex(next).valid) throw new Error('The new index failed validation.');
if (files.length) await writeFile(path.join(out, 'index.json'), `${JSON.stringify(next)}\n`);
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify({ season, plan, files, index: next }, null, 2)}\n`);
console.log(JSON.stringify({ season, completed: plan.completed, snapshot: plan.snapshot, review: plan.review, files }));
```

- [ ] **Step 4: Create the publish script** — `scripts/fantasy-publish.mjs`:

```js
#!/usr/bin/env node
// Uploads a refresh's files to the fantasy-data-<season> release (data only, prerelease): new content-addressed files
// first, index.json last, then prunes superseded copies and reads every uploaded file back through its public URL.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FANTASY_REPOSITORY, publishPlan } from '../shared/fantasy-index.mjs';

const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dir = path.resolve(value('--dir') ?? '.local/fantasy-release');
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
if (!manifest.files.length) { console.log(JSON.stringify({ published: 0, reason: 'Nothing to publish.' })); process.exit(0); }
const tag = `fantasy-data-${manifest.season}`, repo = FANTASY_REPOSITORY;
const gh = (...command) => execFileSync('gh', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
let assets = [];
try {
  assets = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'assets')).assets.map(asset => ({ name: asset.name, createdAt: asset.createdAt }));
} catch {
  gh('release', 'create', tag, '--repo', repo, '--prerelease', '--title', `Fantasy data ${manifest.season}`,
    '--notes', 'Data only, not an app release. Public nflverse-derived Fantasy snapshots and weekly reviews (nflverse, CC BY 4.0). index.json lists the current files.');
}
for (const step of publishPlan({ files: manifest.files, existing: assets.map(asset => asset.name), index: manifest.index, assets })) {
  if (step.action === 'upload') gh('release', 'upload', tag, path.join(dir, step.name), '--repo', repo, ...(step.clobber ? ['--clobber'] : []));
  else gh('release', 'delete-asset', tag, step.name, '--repo', repo, '--yes');
}
const base = `https://github.com/${repo}/releases/download/${tag}`;
for (const name of ['index.json', ...manifest.files]) {
  const local = await readFile(path.join(dir, name));
  let matched = false;
  for (let attempt = 0; attempt < 4 && !matched; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 5000));
    const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(30_000) });
    matched = response.ok && Buffer.from(await response.arrayBuffer()).equals(local);
  }
  if (!matched) throw new Error(`Readback mismatch: ${name}`);
}
console.log(JSON.stringify({ tag, published: manifest.files.length, index: 'index.json' }));
```

- [ ] **Step 5: Execute the refresh locally (no upload)**

Run: `node scripts/fantasy-refresh.mjs --out .local/fantasy-release`
Expected: one JSON line. Mid-week (before the weekend slate) it shows `"snapshot":{"week":<next>,"build":true,...}` and a `files` array naming a `2026-week-NN.<sha8>.json` file. If Week 7 is complete it also names `2026-review-week-07.<sha8>.json` only when a Week 7 estimate was published (otherwise `"source":null`). Open `.local/fantasy-release/manifest.json` and confirm `index.snapshots[0].file` matches the written file and `validateFantasyIndex` passed (the script throws otherwise). Delete nothing; `.local/` is ignored.

- [ ] **Step 6: Commit**

```bash
git add scripts/fantasy-sources.mjs scripts/fantasy.mjs scripts/fantasy-refresh.mjs scripts/fantasy-publish.mjs
git commit -m "Add Fantasy refresh and publish scripts sharing verified nflverse source reading"
```

---

### Task 7: Workflow (manual trigger only)

**Files:**
- Create: `.github/workflows/fantasy-refresh.yml`
- Test: `tests/fantasy-workflow.test.mjs`

**Interfaces:**
- Consumes: Task 6 scripts.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-workflow.test.mjs`:

```js
// Contract: the Fantasy refresh runs only on main, can write release assets and nothing else, ships manual-only, and
// uploads only when not a dry run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/fantasy-refresh.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('permissions, branch guard and concurrency', () => {
  assert.match(yaml, /^permissions:\n {2}contents: write\n(?! {2}\S)/m);
  assert.doesNotMatch(yaml, /secrets\./);
  assert.match(yaml, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml, /concurrency:\n {2}group: fantasy-refresh\n {2}cancel-in-progress: false/);
});

test('manual trigger with dry run by default; no schedule until Task 14', () => {
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /dry_run:[\s\S]*?default: true/);
  assert.doesNotMatch(yaml, /^\s*schedule:/m);
});

test('build always; publish only when not a dry run', () => {
  assert.match(yaml, /run: node scripts\/fantasy-refresh\.mjs --out \.local\/fantasy-release/);
  assert.match(yaml, /if: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.dry_run == false \}\}\n\s+run: node scripts\/fantasy-publish\.mjs --dir \.local\/fantasy-release/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-workflow.test.mjs`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Create the workflow** — `.github/workflows/fantasy-refresh.yml`:

```yaml
name: Fantasy refresh
# D-57: builds the Fantasy snapshot and last week's review from nflverse and publishes them as release assets of this
# repository (data only). Manual first; the daily schedule is added after a verified manual run.
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: Build and validate without uploading
        type: boolean
        default: true
permissions:
  contents: write
concurrency:
  group: fantasy-refresh
  cancel-in-progress: false
jobs:
  refresh:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: Build
        run: node scripts/fantasy-refresh.mjs --out .local/fantasy-release
      - name: Publish
        if: ${{ github.event_name == 'schedule' || inputs.dry_run == false }}
        run: node scripts/fantasy-publish.mjs --dir .local/fantasy-release
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fantasy-workflow.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/fantasy-refresh.yml tests/fantasy-workflow.test.mjs
git commit -m "Add manual Fantasy refresh workflow that publishes release assets"
```

---

### Task 8: `/fantasy/week` API route

**Files:**
- Create: `cloud/fantasy.mjs`
- Modify: `cloud/handler.mjs` (import; `ROUTE_GROUPS`; `createCloudHandler` params and `groupServices`; adapter return near line 455), `scripts/boundary/lines.mjs` (`apiChecks`, `awaitingDeploy`), `tests/cloud-boundary.test.mjs:316-327`
- Test: `tests/fantasy-api.test.mjs`

**Interfaces:**
- Consumes: `validateFantasySnapshot`, `validateFantasyReview`, `validateFantasyIndex`, `FANTASY_REPOSITORY`, `fantasySeason`.
- Produces: `FANTASY_METHODS`, `FantasyError`, `createAssetReader({ fetchImpl }) → (url, maxBytes, timeoutMs) → Promise<Uint8Array | null>`, `createFantasyService({ fetchImpl, clock, repository }) → { week({ season, week }) }`, `handleFantasy({ route, body, user, service, clock, featureOff })` → `{ index, snapshot, review, source: { retrievedAt, stale } }`.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-api.test.mjs`:

```js
// Contract: /fantasy/week serves only checksum-verified, validated public files for signed-in users; failures are 503 and
// never cached; foreign redirects are refused; a cached index is served stale when GitHub is unreachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFantasyService, handleFantasy, FantasyError } from '../cloud/fantasy.mjs';
import { snapshotFileName, updateFantasyIndex } from '../shared/fantasy-index.mjs';

const snapshotBytes = readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const file = snapshotFileName(2026, 6, sha(snapshotBytes));
const index = updateFantasyIndex(null, { season: 2026, updatedAt: '2026-10-16T11:00:00Z', review: null,
  snapshot: { week: 6, file, sha256: sha(snapshotBytes), bytes: snapshotBytes.byteLength, generatedAt: '2026-10-15T19:29:56.273Z', statsThroughWeek: 5, publishedAfterFreeze: false, rosterFallbackTeams: 0 } });
const user = { id: '00000000-0000-4000-8000-00000000000b' };
const base = 'https://github.com/seanbalz/guess-the-lines-repo/releases/download/fantasy-data-2026/';
const serve = (files, log = []) => async url => {
  log.push(url);
  if (url.startsWith(base)) return new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/x/${url.slice(base.length)}` } });
  const name = url.split('/').at(-1);
  return name in files ? new Response(files[name]) : new Response('missing', { status: 404 });
};
const files = { 'index.json': JSON.stringify(index), [file]: snapshotBytes };
let now = Date.parse('2026-10-16T12:00:00Z');
const clock = () => now;

test('signed-in only; body is empty or season and week; feature switch', async () => {
  const service = createFantasyService({ fetchImpl: serve(files), clock });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user: null, service, clock }), { status: 401 });
  for (const body of [{ season: 2026 }, { season: 2026, week: 6, user: 'x' }, { season: 2026, week: 19 }]) {
    await assert.rejects(handleFantasy({ route: '/fantasy/week', body, user, service, clock }), { status: 400 });
  }
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock, featureOff: new Set(['fantasy']) }), { status: 503 });
});

test('serves the newest or the requested week, verified', async () => {
  const service = createFantasyService({ fetchImpl: serve(files), clock });
  const latest = await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  assert.equal(latest.snapshot.week, 6);
  assert.equal(latest.review, null);
  assert.equal(latest.source.stale, false);
  assert.equal((await handleFantasy({ route: '/fantasy/week', body: { season: 2026, week: 6 }, user, service, clock })).snapshot.week, 6);
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: { season: 2026, week: 7 }, user, service, clock }), { status: 404 });
});

test('a checksum mismatch is 503 and is not cached', async () => {
  const tampered = { ...files, [file]: Buffer.concat([snapshotBytes, Buffer.from(' ')]) };
  let current = tampered;
  const service = createFantasyService({ fetchImpl: async url => serve(current)(url), clock });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock }), error => error instanceof FantasyError && error.status === 503);
  current = files;
  assert.equal((await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock })).snapshot.week, 6);
});

test('a redirect to another origin is refused', async () => {
  const service = createFantasyService({ clock, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/index.json' } }) });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock }), { status: 503 });
});

test('after the index TTL, an unreachable GitHub serves the cached index marked stale', async () => {
  let online = true;
  const service = createFantasyService({ clock, fetchImpl: async url => { if (!online) throw new TypeError('offline'); return serve(files)(url); } });
  await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  online = false; now += 11 * 60_000;
  const reply = await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  assert.equal(reply.source.stale, true);
  assert.equal(reply.snapshot.week, 6, 'the verified file comes from the checksum cache');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-api.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route module** — create `cloud/fantasy.mjs`:

```js
// Fantasy snapshots for signed-in players (D-57): public nflverse-derived files published by the scheduled build as
// release assets of this repository. Every file is checked against the index's size and SHA-256 and its validator before
// it is served or cached; a failure is never cached. No lines, picks or account data are read or returned here.
import { validateFantasySnapshot } from '../shared/fantasy-rankings.mjs';
import { validateFantasyReview } from '../shared/fantasy-review.mjs';
import { validateFantasyIndex, FANTASY_REPOSITORY, MAX_FILE_BYTES } from '../shared/fantasy-index.mjs';
import { fantasySeason } from '../shared/fantasy-refresh.mjs';
import { UUID_PATTERN } from './lobby.mjs';

export const FANTASY_METHODS = Object.freeze({ '/fantasy/week': ['POST'] });
export class FantasyError extends Error {
  constructor(status, message) { super(message); this.name = 'FantasyError'; this.status = status; }
}
const UNAVAILABLE = 'Fantasy data is not available right now.';
const INDEX_TTL = 10 * 60_000, MAX_INDEX_BYTES = 64 * 1024, MAX_FILES = 6;
const ORIGINS = new Set(['https://github.com', 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com']);

/** Bounded public GET: HTTPS GitHub redirects only, no credentials, size-capped, 404 → null. */
export function createAssetReader({ fetchImpl = fetch } = {}) {
  return async (url, maxBytes, timeoutMs) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    for (let redirects = 0; ; redirects++) {
      response = await fetchImpl(url, { redirect: 'manual', credentials: 'omit', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      if (redirects >= 3) throw new Error('Redirect limit exceeded.');
      let target;
      try { target = new URL(response.headers.get('location') ?? '', url); } catch { /* refused below */ }
      if (!target || !ORIGINS.has(target.origin) || target.username || target.password) throw new Error('Redirect refused.');
      url = target.href;
    }
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Unavailable.'); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body.cancel(); throw new Error('Too large.'); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
}
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

export function createFantasyService({ fetchImpl = fetch, clock = Date.now, repository = FANTASY_REPOSITORY } = {}) {
  const read = createAssetReader({ fetchImpl });
  const indexes = new Map(), files = new Map(), inflight = new Map();
  const base = season => `https://github.com/${repository}/releases/download/fantasy-data-${season}`;
  const once = (key, task) => {
    if (!inflight.has(key)) inflight.set(key, task().finally(() => inflight.delete(key)));
    return inflight.get(key);
  };
  async function index(season) {
    const hit = indexes.get(season), now = clock();
    if (hit && now - hit.at < INDEX_TTL) return { value: hit.value, stale: false };
    try {
      const value = await once(`index:${season}`, async () => {
        const bytes = await read(`${base(season)}/index.json`, MAX_INDEX_BYTES, 10_000);
        if (!bytes) return null;
        const parsed = parse(bytes);
        if (!validateFantasyIndex(parsed).valid || parsed.season !== season) throw new Error('Invalid index.');
        return parsed;
      });
      indexes.set(season, { at: now, value });
      return { value, stale: false };
    } catch {
      if (hit) return { value: hit.value, stale: true };
      throw new FantasyError(503, UNAVAILABLE);
    }
  }
  async function file(season, entry, valid) {
    if (files.has(entry.sha256)) {
      const value = files.get(entry.sha256);
      files.delete(entry.sha256); files.set(entry.sha256, value);
      return value;
    }
    return once(`file:${entry.sha256}`, async () => {
      const bytes = await read(`${base(season)}/${entry.file}`, MAX_FILE_BYTES, 15_000);
      if (!bytes || bytes.byteLength !== entry.bytes || await hex(bytes) !== entry.sha256) throw new Error('Checksum mismatch.');
      const value = parse(bytes);
      if (!valid(value)) throw new Error('Invalid file.');
      files.set(entry.sha256, value);
      while (files.size > MAX_FILES) files.delete(files.keys().next().value);
      return value;
    });
  }
  return {
    async week({ season, week }) {
      const now = clock(), { value: idx, stale } = await index(season);
      if (!idx?.snapshots.length) throw new FantasyError(404, 'No Fantasy data has been published for this season.');
      const entry = week ? idx.snapshots.find(item => item.week === week) : idx.snapshots.at(-1);
      if (!entry) throw new FantasyError(404, 'No Fantasy data has been published for that week.');
      let snapshot;
      try { snapshot = await file(season, entry, value => validateFantasySnapshot(value, { now }).valid && value.season === season && value.week === entry.week); }
      catch { throw new FantasyError(503, UNAVAILABLE); }
      const reviewEntry = idx.reviews.find(item => item.week === entry.week - 1);
      let review = null;
      if (reviewEntry) {
        try { review = await file(season, reviewEntry, value => validateFantasyReview(value).valid && value.season === season && value.week === reviewEntry.week); }
        catch { review = null; }
      }
      return { index: idx, snapshot, review, source: { retrievedAt: new Date(now).toISOString(), stale } };
    },
  };
}

export async function handleFantasy({ route, body = {}, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new FantasyError(401, 'Sign in to continue.');
  if (route !== '/fantasy/week') throw new FantasyError(404, 'Not found.');
  if (featureOff.has('fantasy')) throw new FantasyError(503, UNAVAILABLE);
  const keys = Object.keys(body ?? {});
  if (keys.some(key => !['season', 'week'].includes(key)) || (keys.length && (keys.length !== 2
    || !Number.isSafeInteger(body.season) || body.season < 2020 || body.season > 2100
    || !Number.isSafeInteger(body.week) || body.week < 1 || body.week > 18))) throw new FantasyError(400, 'Check the requested season and week.');
  if (!service?.week) throw new FantasyError(503, UNAVAILABLE);
  return service.week(keys.length ? { season: body.season, week: body.week } : { season: fantasySeason(clock()), week: null });
}
```

- [ ] **Step 4: Wire into the handler** — in `cloud/handler.mjs`:

```js
// with the other imports
import { handleFantasy, FANTASY_METHODS, FantasyError, createFantasyService } from './fantasy.mjs';
```

Add to `ROUTE_GROUPS` after the `trends` entry:

```js
  Object.freeze({ service: 'fantasy', methods: FANTASY_METHODS, handle: handleFantasy, Error: FantasyError }),
```

Add `fantasy` to the `createCloudHandler({ … })` parameter list (after `trends`) and to `groupServices`:

```js
  const groupServices = { lines, bets, league, me, trends, fantasy };
```

In the adapter's returned object, after the `trends:` line, add:

```js
    fantasy: createFantasyService({ fetchImpl, clock }),
```

- [ ] **Step 5: Register the boundary probe** — in `scripts/boundary/lines.mjs` add to `apiChecks` after the `trends/week` entry:

```js
  // Fantasy Track 1 (D-57): public nflverse-derived files, served only to signed-in players.
  ['fantasy/week', {}],
```

and replace `export const awaitingDeploy = Object.freeze({});` with:

```js
export const awaitingDeploy = Object.freeze({ 'gtl-api/fantasy/week': 'the gtl-api deploy with /fantasy/week (D-57)' });
```

In `tests/cloud-boundary.test.mjs`, in the test `'only the registered rollout pieces are awaiting deploy, and every awaitingDeploy entry is a real probe'`, replace

```js
  assert.deepEqual(Object.keys(awaitingDeploy), [], 'nothing is awaiting deploy');
  const result = await checkCloudBoundary({ ...options, fetchImpl: denied });
  assert.equal(result.awaiting.length, 0, 'every probe denies');
```

with

```js
  // Fantasy Track 1 (D-57): /fantasy/week awaits its gtl-api deploy; remove it here and in scripts/boundary/lines.mjs after.
  assert.deepEqual(Object.keys(awaitingDeploy), ['gtl-api/fantasy/week']);
  const result = await checkCloudBoundary({ ...options, fetchImpl: denied });
  assert.equal(result.awaiting.length, 0, 'every probe denies once deployed');
```

and update its first comment line to say one route is awaiting.

- [ ] **Step 6: Run tests**

Run: `node --test tests/fantasy-api.test.mjs tests/route-modules.test.mjs tests/cloud-boundary.test.mjs`
Expected: PASS. `tests/route-modules.test.mjs` needs no edit: its route-ownership and union tests pick up `/fantasy/week` from `ROUTE_MODULES`, and its `GROUPS` table covers only groups with provider error maps.

- [ ] **Step 7: Commit**

```bash
git add cloud/fantasy.mjs cloud/handler.mjs scripts/boundary/lines.mjs tests/fantasy-api.test.mjs tests/cloud-boundary.test.mjs
git commit -m "Add signed-in /fantasy/week route serving verified release files"
```

---

### Task 9: Hosted-first loader in the app

**Files:**
- Create: `web/src/fantasyLoader.js`
- Modify: `web/src/fantasyData.js`, `web/src/api.js`, `web/src/FantasyFootball.jsx` (selection default, entries), `web/src/next/fantasy/FantasyScreen.jsx`, `web/src/next/fantasy/FantasyHomeTile.jsx`
- Test: `tests/fantasy-loader.test.mjs`

**Interfaces:**
- Consumes: `/fantasy/week` reply (Task 8).
- Produces: `fantasyWeekKey(season, week)`; `createFantasyLoader({ cloud, readHosted, staticWeeks, initialKey, now }) → { load(key | null), clear() }` resolving `{ origin: 'hosted' | 'saved', fallback: boolean, snapshot, review, weeks: [{ key, season, week }], retrievedAt, indexStale }` or `null`; `useFantasySnapshot(key | null) → { key, status: 'loading' | 'ready' | 'missing' | 'error', snapshot?, review?, origin?, fallback?, weeks?, selection?, retry }`.

- [ ] **Step 1: Write the failing test** — create `tests/fantasy-loader.test.mjs`:

```js
// Contract: hosted data first; a non-auth failure falls back to the committed snapshot for that week (never another
// week); 400/401/403 never fall back; local mode reads committed files; the week list is the union of both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFantasyLoader } from '../web/src/fantasyLoader.js';

const week6 = JSON.parse(readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const staticWeeks = { '2026-06': async () => ({ default: week6 }) };
const now = () => Date.parse('2026-10-16T12:00:00Z');
const hostedReply = { index: { season: 2026, snapshots: [{ week: 6 }, { week: 7 }] }, snapshot: week6, review: null, source: { retrievedAt: '2026-10-16T12:00:00Z', stale: false } };

test('hosted reply wins and the week list unions hosted and committed weeks', async () => {
  const loader = createFantasyLoader({ cloud: true, readHosted: async () => hostedReply, staticWeeks, initialKey: '2026-06', now });
  const value = await loader.load(null);
  assert.equal(value.origin, 'hosted');
  assert.equal(value.fallback, false);
  assert.deepEqual(value.weeks.map(week => week.key), ['2026-07', '2026-06']);
});

test('a 503 or network failure falls back to the committed file for the same week; none means null', async () => {
  const failing = createFantasyLoader({ cloud: true, readHosted: async () => { throw Object.assign(new Error('down'), { status: 503 }); }, staticWeeks, initialKey: '2026-06', now });
  const saved = await failing.load('2026-06');
  assert.deepEqual([saved.origin, saved.fallback, saved.snapshot.week], ['saved', true, 6]);
  assert.equal(await failing.load('2026-07'), null, 'never another week');
});

test('400, 401 and 403 never fall back; local mode reads committed files without calling the API', async () => {
  for (const status of [400, 401, 403]) {
    const loader = createFantasyLoader({ cloud: true, readHosted: async () => { throw Object.assign(new Error('no'), { status }); }, staticWeeks, initialKey: '2026-06', now });
    await assert.rejects(loader.load('2026-06'), { status });
  }
  let calls = 0;
  const local = createFantasyLoader({ cloud: false, readHosted: async () => { calls++; return hostedReply; }, staticWeeks, initialKey: '2026-06', now });
  assert.equal((await local.load(null)).origin, 'saved');
  assert.equal(calls, 0);
});

test('a reply for another week than requested is refused, then falls back', async () => {
  const loader = createFantasyLoader({ cloud: true, readHosted: async () => ({ ...hostedReply, snapshot: { ...week6, week: 7 } }), staticWeeks, initialKey: '2026-06', now });
  assert.equal((await loader.load('2026-06')).origin, 'saved');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fantasy-loader.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `web/src/fantasyLoader.js`:

```js
// The Fantasy loader with no React and no network of its own (D-57): hosted /fantasy/week first, the committed snapshot
// for the same week when the hosted read fails for any reason other than 400/401/403, and never another week's data.
import { validateFantasySnapshot } from '../../shared/fantasy-rankings.mjs';

export const fantasyWeekKey = (season, week) => `${season}-${String(week).padStart(2, '0')}`;
const entry = key => { const [season, week] = key.split('-').map(Number); return { key, season, week }; };
const byNewest = (a, b) => b.season - a.season || b.week - a.week;
const CACHE_MS = 5 * 60_000;

export function createFantasyLoader({ cloud, readHosted, staticWeeks, initialKey, now = Date.now }) {
  const cache = new Map();
  const staticList = () => Object.keys(staticWeeks).map(entry);
  const saved = async (key, fallback) => {
    const loader = staticWeeks[key];
    if (!loader) return null;
    const module = await loader(), snapshot = module.default ?? module;
    if (!validateFantasySnapshot(snapshot).valid || fantasyWeekKey(snapshot.season, snapshot.week) !== key) throw new Error('Invalid fantasy snapshot');
    return { origin: 'saved', fallback, snapshot, review: null, weeks: staticList().sort(byNewest), retrievedAt: null, indexStale: false };
  };
  const hosted = async key => {
    const [season, week] = key ? key.split('-').map(Number) : [];
    const reply = await readHosted(key ? { season, week } : {});
    const snapshot = reply?.snapshot;
    if (!validateFantasySnapshot(snapshot, { now: now() }).valid || (key && fantasyWeekKey(snapshot.season, snapshot.week) !== key)) {
      throw Object.assign(new Error('Invalid fantasy reply'), { status: 502 });
    }
    const weeks = new Map(staticList().map(item => [item.key, item]));
    for (const item of reply.index?.snapshots ?? []) { const k = fantasyWeekKey(reply.index.season, item.week); weeks.set(k, entry(k)); }
    return { origin: 'hosted', fallback: false, snapshot, review: reply.review ?? null, weeks: [...weeks.values()].sort(byNewest),
      retrievedAt: reply.source?.retrievedAt ?? null, indexStale: reply.source?.stale === true };
  };
  const load = key => {
    const cacheKey = key ?? 'latest', hit = cache.get(cacheKey);
    if (hit && now() - hit.at < CACHE_MS) return hit.promise;
    const promise = (cloud
      ? hosted(key).catch(error => { if ([400, 401, 403].includes(error?.status)) throw error; return saved(key ?? initialKey, true); })
      : saved(key ?? initialKey, false)
    ).catch(error => { cache.delete(cacheKey); throw error; });
    cache.set(cacheKey, { at: now(), promise });
    return promise;
  };
  return { load, clear: () => cache.clear() };
}
```

Replace `web/src/fantasyData.js` with:

```js
import { useEffect, useState } from 'react';
import { FANTASY_DEFAULT, FANTASY_WEEKS } from './fantasyWeeks.generated.js';
import { cloudEnabled } from './auth';
import { fantasyApi } from './api';
import { createFantasyLoader, fantasyWeekKey } from './fantasyLoader.js';

export { fantasyWeekKey };
export const FANTASY_AVAILABLE = Object.keys(FANTASY_WEEKS).map(key => {
  const [season, week] = key.split('-').map(Number);
  return { key, season, week };
}).sort((a, b) => b.season - a.season || b.week - a.week);
export const FANTASY_INITIAL = fantasyWeekKey(FANTASY_DEFAULT.season, FANTASY_DEFAULT.week);

const loader = createFantasyLoader({ cloud: cloudEnabled, readHosted: fantasyApi, staticWeeks: FANTASY_WEEKS, initialKey: FANTASY_INITIAL });
/** `key` is 'YYYY-WW', or null for the newest published week. Public statistics only; no account data. */
export function useFantasySnapshot(key) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key, status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ key, status: 'loading' });
    loader.load(key).then(value => {
      if (!current) return;
      setState(value ? { key, status: 'ready', ...value, selection: fantasyWeekKey(value.snapshot.season, value.snapshot.week) } : { key, status: 'missing' });
    }).catch(() => { if (current) setState({ key, status: 'error' }); });
    return () => { current = false; };
  }, [key, attempt]);
  // A selection change must never momentarily show a different week's rankings.
  return { ...(state.key === key ? state : { key, status: 'loading' }), retry: () => { loader.clear(); setAttempt(value => value + 1); } };
}
```

In `web/src/api.js` add after `trendsApi`:

```js
/** Public Fantasy snapshots published by the scheduled refresh (D-57), for signed-in players. */
export const fantasyApi = (body, signal) => cloudApi('fantasy/week', body, { signal });
```

In `web/src/FantasyFootball.jsx`:
- In `FantasyRankingsView`, change the signature defaults `entries = FANTASY_AVAILABLE, selection = FANTASY_INITIAL` to `entries, selection` and add as the first lines of the body:

```js
  entries = entries ?? (state?.weeks?.length ? state.weeks : FANTASY_AVAILABLE);
  selection = selection ?? state?.selection ?? FANTASY_INITIAL;
```

- In `FantasyFootball`, change `useState(props.navigationState?.selection ?? FANTASY_INITIAL)` to `useState(props.navigationState?.selection ?? null)` and pass `selection={selection ?? undefined}` (so a null selection lets the view use `state.selection`).

In `web/src/next/fantasy/FantasyScreen.jsx` replace `remember` with:

```js
  const remember = patch => {
    if (!patch.selection) { shell.setView('fantasy', patch); return; }
    const [season, week] = patch.selection.split('-').map(Number);
    shell.setView('fantasy', { ...patch, season, week });
  };
```

In `web/src/next/fantasy/FantasyHomeTile.jsx` change `useFantasySnapshot(FANTASY_INITIAL)` to `useFantasySnapshot(null)`, drop `FANTASY_INITIAL` from its import, and replace the copy `Static snapshot; pace estimates, not expert projections. No automatic refresh.` with `{read.fallback ? 'Saved snapshot; live refresh unavailable. ' : ''}Pace estimates, not expert projections. Updated {fmtFull(read.snapshot.generatedAt)}.`

- [ ] **Step 4: Run tests**

Run: `node --test tests/fantasy-loader.test.mjs tests/next-app-view.test.mjs && npx vitest run tests/fantasy-ui.test.jsx`
Expected: PASS. (`tests/fantasy-ui.test.jsx` mocks `fantasyData.js`; keep its mock shape working by leaving `FANTASY_AVAILABLE`, `FANTASY_INITIAL` and `useFantasySnapshot` exported.)

- [ ] **Step 5: Commit**

```bash
git add web/src/fantasyLoader.js web/src/fantasyData.js web/src/api.js web/src/FantasyFootball.jsx web/src/next/fantasy/FantasyScreen.jsx web/src/next/fantasy/FantasyHomeTile.jsx tests/fantasy-loader.test.mjs
git commit -m "Load hosted Fantasy weeks first with committed-snapshot fallback"
```

---

### Task 10: Player game context (pure) and its loading hook

**Files:**
- Modify: `shared/fantasy-context.mjs` (add functions)
- Create: `web/src/fantasyContext.js`
- Test: `tests/fantasy-context.test.mjs` (add)

**Interfaces:**
- Consumes: `matchupTable`, `ordinal` (Task 2); `/lines/read` reply games `{ id, spread: { visible, value, capturedAt, bookCount }, total: {…} }`; `/wind/read` reply `{ attribution, games: { [id]: { status, wind: { windMph, gustMph, precipitationProbability } } } }`.
- Produces: `opponentOf(player) → { opponent, home } | null`; `gameIdFor(player) → 'AWY-HOM' | null`; `kickoffWindow(iso) → string | null`; `impliedTotals(game) → { home, away, capturedAt, bookCount } | { locked: string[] } | { missing: true }`; `lockSentence(gameId, locked) → string`; `describePlayerContext(player, { matchups, lines, wind, scoringLabel }) → { pill, matchup, seasonMatchup, kickoff, weather, weatherCredit, implied, lock, linesNote } | null`; `useFantasyGameContext(season, week) → { lines: { status, games: Map } | null, wind: object | null }`.

- [ ] **Step 1: Write the failing tests** — append to `tests/fantasy-context.test.mjs`:

```js
import { opponentOf, gameIdFor, kickoffWindow, impliedTotals, lockSentence, describePlayerContext } from '../shared/fantasy-context.mjs';

const wr = { id: 'p', name: 'P', team: 'SEA', position: 'WR', weekly: { status: 'scheduled', opponent: '@ DEN', kickoff: '2026-10-25T20:25:00Z', stats: {} } };
const visible = (spread, total) => ({ id: 'SEA-DEN', spread: { visible: true, value: spread, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 }, total: { visible: true, value: total, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 } });

test('opponent and game id follow the lines id format (away-home)', () => {
  assert.deepEqual(opponentOf(wr), { opponent: 'DEN', home: false });
  assert.equal(gameIdFor(wr), 'SEA-DEN');
  assert.equal(gameIdFor({ ...wr, weekly: { ...wr.weekly, opponent: 'vs DEN' } }), 'DEN-SEA');
  assert.equal(opponentOf({ weekly: { opponent: null } }), null);
});

test('kickoff windows in Eastern time', () => {
  assert.deepEqual(['2026-10-23T00:15:00Z', '2026-10-25T13:30:00Z', '2026-10-25T17:00:00Z', '2026-10-25T20:25:00Z', '2026-10-26T00:20:00Z', '2026-10-27T00:15:00Z'].map(kickoffWindow),
    ['Thu night', 'International', 'Sun early', 'Sun late', 'Sun night', 'Mon night']);
  assert.equal(kickoffWindow('not a date'), null);
});

test('implied totals only when both markets are visible; signed home spread', () => {
  assert.deepEqual(impliedTotals(visible(-3, 47)), { home: 25, away: 22, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 });
  assert.deepEqual(impliedTotals({ spread: { visible: false }, total: { visible: true, value: 47 } }), { locked: ['spread'] });
  assert.deepEqual(impliedTotals({ spread: { visible: false }, total: { visible: false } }), { locked: ['spread', 'total'] });
  assert.deepEqual(impliedTotals({ spread: { visible: true, value: null }, total: { visible: true, value: 47 } }), { missing: true });
  assert.equal(lockSentence('SEA-DEN', ['spread', 'total']), 'Lock your SEA–DEN spread and total guesses to see the implied team total.');
  assert.equal(lockSentence('SEA-DEN', ['total']), 'Lock your SEA–DEN total guess to see the implied team total.');
});

test('player context: away team total, lock line, weather and matchup text', () => {
  const lines = { status: 'ready', games: new Map([['SEA-DEN', visible(-3, 47)]]) };
  const wind = { attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    games: { 'SEA-DEN': { status: 'forecast', wind: { windMph: 14.2, gustMph: 22.4, precipitationProbability: 40 } } } };
  const matchups = { WR: { rows: new Map([['DEN', { recent: 24.06, recentRank: 3, recentGames: 4, season: 22, seasonRank: 5, seasonGames: 6 }]]) } };
  const context = describePlayerContext(wr, { matchups, lines, wind, scoringLabel: 'Half PPR' });
  assert.equal(context.pill, '@ DEN · Sun late · 22.0');
  assert.equal(context.implied.value, 22);
  assert.equal(context.matchup, 'DEN allows the 3rd-most Half PPR points to WRs · last 4 games (24.1 per game)');
  assert.equal(context.seasonMatchup, 'Season: 5th-most (22.0 per game, 6 games)');
  assert.equal(context.weather, 'Wind 14 mph, gusts 22 · Rain 40%');
  const locked = describePlayerContext(wr, { matchups, lines: { status: 'ready', games: new Map([['SEA-DEN', { spread: { visible: false }, total: { visible: false } }]]) }, wind: null, scoringLabel: 'PPR' });
  assert.equal(locked.pill, '@ DEN · Sun late');
  assert.equal(locked.lock, 'Lock your SEA–DEN spread and total guesses to see the implied team total.');
  assert.equal(locked.implied, null);
  assert.equal(describePlayerContext({ ...wr, weekly: { status: 'bye', opponent: null } }, {}), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fantasy-context.test.mjs`
Expected: FAIL — named exports not found.

- [ ] **Step 3: Implement** — append to `shared/fantasy-context.mjs`:

```js
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
const plural = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' };
const most = rank => (rank === 1 ? 'most' : `${ordinal(rank)}-most`);

export function opponentOf(player) {
  const match = /^(vs|@) ([A-Z]{2,3})$/.exec(player?.weekly?.opponent ?? '');
  return match ? { opponent: match[2], home: match[1] === 'vs' } : null;
}
export function gameIdFor(player) {
  const opponent = opponentOf(player);
  return opponent ? (opponent.home ? `${opponent.opponent}-${player.team}` : `${player.team}-${opponent.opponent}`) : null;
}
export function kickoffWindow(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = Object.fromEntries(ET.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  switch (parts.weekday) {
    case 'Thu': return hour < 19 ? 'Thu' : 'Thu night';
    case 'Fri': return 'Fri';
    case 'Sat': return 'Sat';
    case 'Mon': return 'Mon night';
    case 'Sun': return hour < 12 ? 'International' : hour < 16 ? 'Sun early' : hour < 19 ? 'Sun late' : 'Sun night';
    default: return parts.weekday;
  }
}
/** D-57: totals only from the viewer's own reply, only when both markets are open to that viewer. */
export function impliedTotals(game) {
  const spread = game?.spread, total = game?.total;
  const locked = [spread?.visible === true ? null : 'spread', total?.visible === true ? null : 'total'].filter(Boolean);
  if (locked.length) return { locked };
  if (!Number.isFinite(spread.value) || !Number.isFinite(total.value)) return { missing: true };
  return { home: total.value / 2 - spread.value / 2, away: total.value / 2 + spread.value / 2,
    capturedAt: [spread.capturedAt, total.capturedAt].filter(Boolean).sort()[0] ?? null, bookCount: Math.min(spread.bookCount ?? 0, total.bookCount ?? 0) };
}
export function lockSentence(gameId, locked) {
  const markets = locked.length === 2 ? 'spread and total guesses' : `${locked[0]} guess`;
  return `Lock your ${gameId.replace('-', '–')} ${markets} to see the implied team total.`;
}

export function describePlayerContext(player, { matchups = null, lines = null, wind = null, scoringLabel = '' } = {}) {
  const opponent = opponentOf(player);
  if (player?.weekly?.status !== 'scheduled' || !opponent) return null;
  const id = gameIdFor(player), window = kickoffWindow(player.weekly.kickoff);
  const game = lines?.games?.get(id) ?? null, implied = game ? impliedTotals(game) : null;
  const team = implied && 'home' in implied ? (opponent.home ? implied.home : implied.away) : null;
  const row = matchups?.[player.position]?.rows?.get(opponent.opponent) ?? null;
  const forecast = wind?.games?.[id] ?? null, w = forecast?.wind;
  const weather = !forecast ? null : forecast.status === 'indoor' ? 'Indoors'
    : forecast.status === 'forecast' && w ? `Wind ${Math.round(w.windMph)} mph${w.gustMph != null ? `, gusts ${Math.round(w.gustMph)}` : ''}${w.precipitationProbability != null ? ` · Rain ${Math.round(w.precipitationProbability)}%` : ''}`
    : 'Forecast not available yet';
  return {
    pill: [player.weekly.opponent, window, team !== null ? formatFantasyNumber(team) : null].filter(Boolean).join(' · '),
    matchup: row?.recentRank ? `${opponent.opponent} allows the ${most(row.recentRank)} ${scoringLabel} points to ${plural[player.position]} · last ${row.recentGames} games (${formatFantasyNumber(row.recent)} per game)`
      : matchups?.[player.position] ? `${opponent.opponent}: fewer than two games of matchup data` : null,
    seasonMatchup: row?.seasonRank ? `Season: ${most(row.seasonRank)} (${formatFantasyNumber(row.season)} per game, ${row.seasonGames} games)` : null,
    kickoff: window, weather, weatherCredit: forecast?.status === 'forecast' ? wind.attribution ?? null : null,
    implied: team !== null ? { value: team, capturedAt: implied.capturedAt, bookCount: implied.bookCount } : null,
    lock: implied?.locked ? lockSentence(id, implied.locked) : null,
    linesNote: lines?.status === 'unavailable' ? 'Lines are not available right now.' : implied?.missing ? 'Implied team total —' : null,
  };
}
```

Create `web/src/fantasyContext.js`:

```js
// Game context for Fantasy (D-57): the viewer's own gated /lines/read reply and the stored kickoff wind forecast. Lines are
// per viewer, so the cache clears when the signed-in account changes; nothing here is shared with other players.
import { useEffect, useState } from 'react';
import { cloudEnabled, supabase } from './auth';
import { linesApi } from './api';
import { loadWind, watchTrendAccount } from './trendsLoaders.js';

const linesCache = new Map(), LINES_MS = 60_000;
supabase?.auth.onAuthStateChange(watchTrendAccount(() => linesCache.clear()));

export function loadFantasyLines(season, week) {
  if (!cloudEnabled) return Promise.resolve({ status: 'off', games: new Map() });
  const key = `${season}-${week}`, hit = linesCache.get(key);
  if (hit && Date.now() - hit.at < LINES_MS) return hit.promise;
  const promise = linesApi('read', { season, week }).then(
    reply => ({ status: 'ready', games: new Map((reply?.games ?? []).map(game => [game.id, game])) }),
    error => ({ status: [401, 403].includes(error?.status) ? 'not-member' : 'unavailable', games: new Map() }));
  linesCache.set(key, { at: Date.now(), promise });
  return promise;
}

export function useFantasyGameContext(season, week) {
  const key = season && week ? `${season}-${week}` : null;
  const [state, setState] = useState({ key: null, lines: null, wind: null });
  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    Promise.all([loadFantasyLines(season, week), loadWind(season, week)])
      .then(([lines, wind]) => { if (current) setState({ key, lines, wind: wind?.data ?? null }); });
    return () => { current = false; };
  }, [key, season, week]);
  return state.key === key ? state : { key, lines: null, wind: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fantasy-context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/fantasy-context.mjs web/src/fantasyContext.js tests/fantasy-context.test.mjs
git commit -m "Add Fantasy game context: kickoff window, matchup, weather and D-39-gated implied totals"
```

---

### Task 11: Fantasy screen — status line, context and accuracy card

**Files:**
- Create: `web/src/FantasyAccuracy.jsx`
- Modify: `web/src/FantasyFootball.jsx`, `web/src/fantasyFootball.css`, `web/src/next/fantasy/fantasy.css`
- Test: `tests/fantasy-ui.test.jsx` (add)

**Interfaces:**
- Consumes: `describePlayerContext`, `matchupTable`, `MATCHUP_POSITIONS` (Tasks 2, 10), `summarizeReview` (Task 3), `useFantasyGameContext` (Task 10), loader state (Task 9).
- Produces: `FantasyRankingsView` props `gameContext` (`{ lines, wind }`); `FantasyAccuracy({ theme, review, filters, scoringLabel, headingLevel })`.

- [ ] **Step 1: Write the failing tests** — append to `tests/fantasy-ui.test.jsx` (inside the `describe`):

```jsx
  it('shows the hosted update line, a context pill with the visible implied total, and detail context', () => {
    const wr = player('ctx');
    wr.weekly = { ...wr.weekly, opponent: '@ SF', kickoff: '2026-10-18T20:25:00Z' };
    const v2 = { ...snapshot, schemaVersion: 2, rosterFallbackTeams: [], matchups: {}, players: [wr] };
    const lines = { status: 'ready', games: new Map([['SEA-SF', { spread: { visible: true, value: -3, capturedAt: '2026-10-18T13:15:00Z', bookCount: 3 }, total: { visible: true, value: 47, capturedAt: '2026-10-18T13:15:00Z', bookCount: 3 } }]]) };
    const out = text(render({ state: { status: 'ready', origin: 'hosted', fallback: false, snapshot: v2 }, gameContext: { lines, wind: null } }));
    expect(out).toContain('Updated');
    expect(out).toContain('@ SF · Sun late · 22.0');
    expect(out).toContain('Implied team total 22.0');
  });
  it('shows the lock line, never a number, when either market is hidden', () => {
    const wr = player('lock');
    wr.weekly = { ...wr.weekly, opponent: '@ SF', kickoff: '2026-10-18T20:25:00Z' };
    const lines = { status: 'ready', games: new Map([['SEA-SF', { spread: { visible: true, value: -3 }, total: { visible: false } }]]) };
    const html = render({ state: { status: 'ready', snapshot: { ...snapshot, players: [wr] } }, gameContext: { lines, wind: null } });
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    expect(out).toContain('Lock your SEA–SF total guess to see the implied team total.');
    expect(out).not.toContain('Implied team total 2');
  });
  it('says when the saved copy is shown', () => {
    expect(text(render({ state: { status: 'ready', origin: 'saved', fallback: true, snapshot } }))).toContain('Showing saved Week 6 · live refresh unavailable');
  });
  it('renders the accuracy card with PROVISIONAL, the baseline and no zero for missing stats', () => {
    const review = { schemaVersion: 1, season: 2026, week: 5, generatedAt: '2026-10-14T11:00:00Z', status: 'PROVISIONAL',
      estimate: { file: 'f', sha256: 'a'.repeat(64), generatedAt: '2026-10-07T12:00:00Z', publishedBeforeFreeze: true },
      actuals: { url: 'https://example.com' }, playedWithoutEstimate: 2,
      players: [
        { id: 'a', name: 'Alpha', team: 'SEA', position: 'WR', estimate: { ...zero, receptions: 5, receivingYards: 70 }, actual: { ...zero, receptions: 7, receivingYards: 100 }, baseline: { ...zero, receptions: 4, receivingYards: 50 } },
        { id: 'b', name: 'Bravo', team: 'SF', position: 'WR', estimate: { ...zero, receptions: 3, receivingYards: 30 }, actual: null, baseline: null },
      ] };
    const html = render({ state: { status: 'ready', origin: 'hosted', snapshot, review } });
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    for (const value of ['Week 5 estimates', 'PROVISIONAL', 'Off by 5.0 points per player', 'Season average: 8.0', 'Within 5 points', '100%', 'Listed available, no stats row: 1', 'Played without an estimate: 2']) expect(out).toContain(value);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/fantasy-ui.test.jsx`
Expected: FAIL — missing texts.

- [ ] **Step 3: Implement the accuracy card** — create `web/src/FantasyAccuracy.jsx`:

```jsx
import { formatFantasyNumber } from '../../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../../shared/fantasy-review.mjs';
import { Card, Pill } from './next/ui/index.js';

const number = formatFantasyNumber;
const percent = value => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** A report card for GTL's pace estimates (D-57): graded against actuals with a season-average baseline. */
export function FantasyAccuracy({ theme = 'classic', review, filters, scoringLabel, headingLevel = 3 }) {
  const c = name => `${theme === 'next' ? 'gx-' : ''}fantasy-${name}`;
  const Heading = `h${headingLevel}`, Sub = `h${Math.min(headingLevel + 1, 6)}`;
  const s = summarizeReview(review, filters);
  const body = <>
    <div className={c('accuracy-head')}>
      <Heading className={theme === 'next' ? 'gx-t-section' : undefined}>Week {review.week} estimates</Heading>
      {theme === 'next' ? <Pill tone={review.status === 'FINAL' ? 'neutral' : 'pending'}>{review.status}</Pill> : <span className={c('status-word')}>{review.status}</span>}
    </div>
    {s.graded ? <>
      <p className={c('accuracy-headline')}>Off by <strong>{number(s.mae)}</strong> points per player · {scoringLabel}</p>
      <p className={c('meta')}>Season average: {number(s.baselineMae)}</p>
      <dl className={c('accuracy-tiles')}>
        <div><dt>Within 5 points</dt><dd>{percent(s.within5)}</dd></div>
        <div><dt>Players graded</dt><dd>{s.graded}</dd></div>
        <div><dt>Beat the baseline</dt><dd>{s.beatBaseline.length ? s.beatBaseline.join(', ') : 'None'}</dd></div>
      </dl>
      <details className={c('accuracy-detail')}>
        <summary>By position and biggest misses</summary>
        <table className={c('accuracy-table')}>
          <thead><tr><th scope="col">Position</th><th scope="col">GTL miss</th><th scope="col">Season average miss</th><th scope="col">Graded</th></tr></thead>
          <tbody>{s.byPosition.map(row => <tr key={row.position}><th scope="row">{row.position}</th><td>{number(row.mae)}</td><td>{number(row.baselineMae)}</td><td>{row.graded}</td></tr>)}</tbody>
        </table>
        <Sub>Estimated too high</Sub>
        {s.overs.length ? <ol>{s.overs.map(row => <li key={row.id}>{row.name} ({row.team} {row.position}): est. {number(row.estimate)}, actual {number(row.actual)}</li>)}</ol> : <p>None.</p>}
        <Sub>Estimated too low</Sub>
        {s.unders.length ? <ol>{s.unders.map(row => <li key={row.id}>{row.name} ({row.team} {row.position}): est. {number(row.estimate)}, actual {number(row.actual)}</li>)}</ol> : <p>None.</p>}
        <p className={c('meta')}>Listed available, no stats row: {s.noStatsRow} · Played without an estimate: {s.playedWithoutEstimate}. Neither is scored as zero.</p>
        <p className={c('meta')}>A report card for GTL's statistical pace estimates, not a forecast or betting claim.</p>
      </details>
    </> : <p>No graded players for Week {review.week} under these settings.</p>}
  </>;
  return theme === 'next'
    ? <Card as="section" variant="hero" className={c('accuracy')} aria-label={`Week ${review.week} accuracy`}>{body}</Card>
    : <section className={`panel ${c('accuracy')}`} aria-label={`Week ${review.week} accuracy`}>{body}</section>;
}
```

- [ ] **Step 4: Wire the view** — in `web/src/FantasyFootball.jsx`:

Imports:

```js
import { MATCHUP_POSITIONS, matchupTable, describePlayerContext } from '../../shared/fantasy-context.mjs';
import { Button, Card, LockLine, Segmented, Switch } from './next/ui/index.js';
import { FantasyAccuracy } from './FantasyAccuracy.jsx';
import { useFantasyGameContext } from './fantasyContext.js';
```

(replace the existing `./next/ui/index.js` import line with the one above).

`PlayerCard` gets a `context` prop. Replace `<span className={c('matchup')}>{matchup}</span>` with `<span className={c('matchup')}>{context?.pill ?? matchup}</span>` and insert at the start of `<div className={c('player-detail')}>`:

```jsx
          {context && <div className={c('context')}>
            <strong>This week</strong>
            {context.matchup && <p>{context.matchup}{context.seasonMatchup && <span className={c('meta')}> · {context.seasonMatchup}</span>}</p>}
            {context.kickoff && <p>Kickoff: {context.kickoff} · {date(player.weekly.kickoff)}</p>}
            {context.weather && <p>{context.weather}{context.weatherCredit && <> · <a href={httpLink(context.weatherCredit.url)} target="_blank" rel="noreferrer">{context.weatherCredit.text}</a> (<a href={httpLink(context.weatherCredit.licenseUrl)} target="_blank" rel="noreferrer">{context.weatherCredit.license}</a>)</>}</p>}
            {context.implied ? <p>Implied team total {number(context.implied.value)} · median of {context.implied.bookCount} sportsbooks · captured {date(context.implied.capturedAt)}</p>
              : context.lock ? (theme === 'next' ? <LockLine>{context.lock}</LockLine> : <p>{context.lock}</p>)
              : context.linesNote ? <p>{context.linesNote}</p> : null}
            <p className={c('meta')}>Matchup and kickoff context are observed nflverse data, not predictions.</p>
          </div>}
```

`FantasyRankingsView`: add `gameContext` to its props. After `const selectedScoring = …` add:

```js
  const matchups = useMemo(() => snapshot?.matchups
    ? Object.fromEntries(MATCHUP_POSITIONS.map(position => [position, matchupTable(snapshot, position, filters)]))
    : null, [snapshot, filters]);
  const contextFor = player => (filters.scope === 'weekly'
    ? describePlayerContext(player, { matchups, lines: gameContext?.lines, wind: gameContext?.wind, scoringLabel: selectedScoring })
    : null);
  const origin = state?.fallback ? `Showing saved Week ${snapshot?.week} · live refresh unavailable`
    : state?.origin === 'hosted' && snapshot ? `Updated ${date(snapshot.generatedAt)}${state.indexStale ? ' · refresh check delayed' : ''}` : null;
```

In the source summary, insert `{origin && <p className={c('meta')} role="status">{origin}</p>}` as the first child after the existing first `<p>`. Pass `context={contextFor(player)}` to each `PlayerCard`. Insert before `<section className={c('results')} …>`:

```jsx
      {filters.scope === 'weekly' && state?.review && <FantasyAccuracy theme={theme} review={state.review} filters={filters} scoringLabel={selectedScoring} headingLevel={headingLevel === 2 ? 3 : 2}/>}
```

`FantasyFootball` container: after `const state = useFantasySnapshot(selection);` add

```js
  const gameContext = useFantasyGameContext(state.snapshot?.season, state.snapshot?.week);
```

and pass `gameContext={gameContext}` to `FantasyRankingsView`.

- [ ] **Step 5: Styles** — append to `web/src/fantasyFootball.css`:

```css
.fantasy-context { display: grid; gap: 4px; margin-bottom: 12px; }
.fantasy-context a, .fantasy-accuracy summary { display: inline-flex; align-items: center; min-height: 44px; }
.fantasy-accuracy { display: grid; gap: 8px; }
.fantasy-accuracy-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fantasy-accuracy-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin: 0; }
.fantasy-accuracy-tiles dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 700; }
.fantasy-accuracy-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.fantasy-accuracy-table th, .fantasy-accuracy-table td { text-align: left; padding: 6px 4px; }
```

and to `web/src/next/fantasy/fantasy.css`:

```css
.gx .gx-fantasy-context { display: grid; gap: var(--gx-space-1); margin-bottom: var(--gx-space-3); }
.gx .gx-fantasy-context a, .gx .gx-fantasy-accuracy summary { display: inline-flex; align-items: center; min-height: var(--gx-size-touch); color: var(--gx-data); }
.gx .gx-fantasy-accuracy { display: grid; gap: var(--gx-space-2); }
.gx .gx-fantasy-accuracy-head { display: flex; align-items: center; justify-content: space-between; gap: var(--gx-space-2); }
.gx .gx-fantasy-accuracy-headline strong { font-family: var(--gx-font-num); font-variant-numeric: tabular-nums; }
.gx .gx-fantasy-accuracy-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--gx-space-2); margin: 0; }
.gx .gx-fantasy-accuracy-tiles dd { margin: 0; font-family: var(--gx-font-num); font-variant-numeric: tabular-nums; color: var(--gx-text-1); }
.gx .gx-fantasy-accuracy-tiles dt { color: var(--gx-text-2); }
.gx .gx-fantasy-accuracy-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.gx .gx-fantasy-accuracy-table th, .gx .gx-fantasy-accuracy-table td { text-align: left; padding: var(--gx-space-1); border-bottom: 1px solid var(--gx-border); }
```

If `tests/next-tokens.test.mjs` flags a selector pattern, match the selector style already used in `web/src/next/fantasy/fantasy.css` (open the file and copy its root selector form) and re-run.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/fantasy-ui.test.jsx && node --test tests/next-tokens.test.mjs tests/next-app-view.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/FantasyAccuracy.jsx web/src/FantasyFootball.jsx web/src/fantasyFootball.css web/src/next/fantasy/fantasy.css tests/fantasy-ui.test.jsx
git commit -m "Show Fantasy update status, game context with gated implied totals, and the accuracy card"
```

---

### Task 12: Browser coverage

**Files:**
- Modify: `tests/cloud-browser/community-world.mjs` (accept `fantasyFetch`), `tests/cloud-browser/fantasy.spec.js` (add a test)

**Interfaces:**
- Consumes: `createFantasyService` (Task 8).

- [ ] **Step 1: Let the test world serve Fantasy files** — in `tests/cloud-browser/community-world.mjs` import `import { createFantasyService } from '../../cloud/fantasy.mjs';`, add `fantasyFetch = null` to `createCommunityWorld`'s options, and add to the `createCloudHandler({ … })` call:

```js
    fantasy: fantasyFetch ? createFantasyService({ fetchImpl: fantasyFetch, clock }) : undefined,
```

(Without `fantasyFetch` the route answers 503 and the app falls back to the committed snapshot, which keeps every existing Fantasy browser test unchanged.)

- [ ] **Step 2: Add the browser test** — in `tests/cloud-browser/fantasy.spec.js` add inside `test.describe('fantasy rankings', …)`:

```js
  test('new app: saved-copy fallback line, no ungated implied total, layout and axe at 390 px', async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'PGlite runtime absent');
    await page.setViewportSize({ width: 390, height: 844 });
    const { screen } = await open(page, baseURL, 'next');
    await expect(screen.getByText('Showing saved Week 6 · live refresh unavailable')).toBeVisible();
    await list(screen).locator('summary').first().click();
    // The signed-in player has locked nothing for this week, so no implied total may appear anywhere.
    await expect(screen.getByText(/Implied team total \d/)).toHaveCount(0);
    await layout(page, screen);
    const results = await new AxeBuilder({ page }).include('.gx-fantasy').analyze();
    expect(results.violations).toEqual([]);
  });
```

The lock line and the visible total are asserted deterministically by the Task 10 unit tests and Task 11 render tests; the browser world's published slate does not have to match the Week 6 snapshot's games.

- [ ] **Step 3: Run the browser test**

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/fantasy.spec.js`
Expected: all Fantasy browser tests PASS (existing ones unchanged).

- [ ] **Step 4: Commit**

```bash
git add tests/cloud-browser/community-world.mjs tests/cloud-browser/fantasy.spec.js
git commit -m "Cover Fantasy fallback line and hidden-line lock in the browser"
```

---

### Task 13: Documentation and full verification

**Files:**
- Modify: `docs/FANTASY_FOOTBALL.md`, `planning/PLATFORM_WORK_QUEUE.md` (Q11, Q14 rows), `docs/COMPLETION_REGISTER.md`
- Create: `docs/FANTASY_TRACK1_RELEASE.md`

- [ ] **Step 1: Update `docs/FANTASY_FOOTBALL.md`** — add a section `## Track 1 — refresh, accuracy and game context (D-57)` stating: the release tag and file naming; the daily schedule (manual until enabled); the weekend freeze; partial-week and one-week roster fallback rules; schema 2 `matchups`; the review and its baseline; the `/fantasy/week` route and fallback; the D-57 gating rule for implied totals; and that matchup/kickoff context is observed data. Replace the sentence "Refreshing data requires rerunning the command and rebuilding; no scheduled job was created." with "Refreshing is automated by `.github/workflows/fantasy-refresh.yml` (D-57); the manual command remains for local checks."
- [ ] **Step 2: Update the queue and register** — `planning/PLATFORM_WORK_QUEUE.md` Q11 and Q14 rows: "Track 1 (D-57) implemented and linked from the implementation pull request; awaiting API and frontend releases and the first scheduled run." Add a dated entry to `docs/COMPLETION_REGISTER.md`'s current work naming that pull request.
- [ ] **Step 3: Create the release card** — `docs/FANTASY_TRACK1_RELEASE.md` with: source SHA (filled at release), no migration (Gate M n/a), API change `/fantasy/week`, frontend change, workflow, rollback (disable workflow; redeploy previous frontend), readback checklist (signed-in 2xx on `/fantasy/week` in hosted logs, phone-width check, lock line for an unlocked game, totals after locking).
- [ ] **Step 4: Full verification**

Run: `npm run check` then `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/fantasy.spec.js tests/cloud-browser/four-tab-redesign.spec.js` then `PYTHONUTF8=1 python scripts/check-brand-docs.py` then `npm run sync:check`
Expected: typecheck, all node and vitest suites, build, the browser suites and brand QA pass; sync shows the branch equal to its remote.

- [ ] **Step 5: Commit and push**

```bash
git add docs/FANTASY_FOOTBALL.md planning/PLATFORM_WORK_QUEUE.md docs/COMPLETION_REGISTER.md docs/FANTASY_TRACK1_RELEASE.md
git commit -m "Document Fantasy Track 1 and its release card"
git push
```

---

### Task 14: Rollout (each step needs Sean's approval)

Not code; record evidence in `docs/FANTASY_TRACK1_RELEASE.md` as each step completes.

- [ ] **Step 1:** After merge to `main`, run the workflow manually with `dry_run: true`; confirm the Build step's JSON line and that no release changed.
- [ ] **Step 2:** Run it with `dry_run: false`; confirm `gh release view fantasy-data-2026 --repo seanbalz/guess-the-lines-repo --json assets` lists `index.json` and the new files, and that the Publish step's readback passed.
- [ ] **Step 3:** API release through `release.yml` (`target: api`, Sean approves the production environment). Read back hosted gtl-api logs for a signed-in 2xx on `/fantasy/week` (not only anonymous 401s). Then remove `'gtl-api/fantasy/week'` from `awaitingDeploy` and restore the "nothing is awaiting" assertion in `tests/cloud-boundary.test.mjs`.
- [ ] **Step 4:** Frontend release (`target: frontend`); signed-in readback at 390 px: update line, lock line on an unlocked game, implied total after locking both markets, accuracy card once a review exists.
- [ ] **Step 5:** Add the schedule in a small PR: under `on:` add

```yaml
  schedule:
    - cron: '0 11 * * *'
```

update `tests/fantasy-workflow.test.mjs` to assert `cron: '0 11 * * *'` instead of "no schedule", merge, and confirm the next morning's scheduled run published or correctly reported "Nothing to publish."
