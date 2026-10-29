# Guess The Line redesign: build plan

## Release timing policy - October 19, 2026

Sean explicitly instructed: "permanently remove the gated window". Deployments
and migration applies no longer wait for weekdays, quiet windows, kickoff
buffers, Sunday/Monday/Thursday freezes or daylight-saving date exclusions.
This supersedes older timing restrictions throughout the release documentation
and migration ledger. Migration dependencies and individual apply order remain
mandatory. Exact source/CI, fresh hosted evidence, data-preservation hashes,
permissions/privacy checks, compatibility, rollback readiness and verification
remain required. Player pick deadlines and locks are unchanged.


Owner: Sean Balsiger
Date: October 14, 2026
Status: staged plan, updated for D-39 and D-50. Stage descriptions are requirements, not proof of completion; some stages have separate implementation and release evidence in the [completion register](COMPLETION_REGISTER.md). Every merge, hosted apply and deploy retains this plan's existing authorization gates.

---

## 1. What this plan implements

| Decision | What the build must do |
|---|---|
| D-35 | Two games (Guess the Line and Bets), five tabs, the Sleeper-style look, Virtual Units bets, one-game friend challenges, streaks, badges and weekly awards, two boards, a league feed with reactions and comments, one app with a league switcher. |
| D-36 | Real slips inside Bets "as today"; Spread and Total ranked apart with shared ranks (T-2); the line lock until you send a market or skip the week; picks open until each game's kickoff (the 15-minute window is withdrawn); other players' bets visible any time; "See picks now" forfeits the week; challenges count toward the weekly minimum; Edge board inside Play; notes stay; More sports in Me; a sit-out breaks the Pick streak. |
| D-37 | Drafts change freely. Once a market is sent, its picks are final and its lines open for that player. Bets and challenges keep D-18 edits until kickoff. Stored submission times and revisions stay (D-16, D-23). |
| D-38 | The approved prototype (canvas version 2) is the target. The new app is built beside the old one, behind "Try the new app" for Sean. It becomes the default when all five tabs are done and checked on real data. The Mac mini sync session deploys after green merges Sean approves. |

Also binding: D-16, D-18, D-21, D-23 (nothing a player entered is deleted, moved or hidden), D-24, D-26, D-27, D-28, D-30 (Late marker everywhere a pick appears), D-31 as amended, D-34, `docs/RULES.md`, `AGENTS.md`, AIOS (agents build and test; only Sean authorizes merges, applies and deploys).

Inputs: the approved prototype and its spec, the design system, the feature inventory of the current app (191 items, data-display problems DP-1 to DP-27), the game-features notes, six area maps of the current code, and three critiques of the draft plan (completeness, risk, size).

---

## D-50 changes to this plan (October 15, 2026; read before older timing)

Sean reaffirmed permanent per-game lock-in and requested immediate weekly scoring,
score filters and player trends. The [scoring and player trends backlog](../planning/scoring-and-player-trends.md)
preserves nine open tasks from the local planning record at `e5a45f6`, including
its Q-02 follow-up captured at 16:19 UTC on October 15, with evidence,
dependencies and acceptance criteria. Its original D-47 label is reconciled to
D-50 to avoid existing decision reservations. It supplements these stages and
does not modify the frozen v62 tracker.

- Available personal points count immediately when that game/market locks in, even
  before kickoff and while other games remain drafts. Remove blanket kickoff-only
  guards from personal scores and permitted per-game details in stages 16, 24, 26
  and 32 and related readers/screens. Stage 57's shared standings retain Q-02's
  kickoff basis below; do not remove their aggregate guards. A pending
  D-27 reference stays visibly pending until permitted resolution; never invent zero.
- Stages 18, 24–25 and 28–31 must deliver server-enforced immutability, independent
  per-game scoring and a scoring receipt that refreshes the player's week at once.
- Extend stages 57–58, 67 and 72–73 with a clear weekly score destination,
  season/week/team/matchup filters and a dedicated player Trends page. Q-01 confirms
  accuracy and bias first: improvement over time, teams consistently misjudged and
  guesses too high/low, with links to the actual games. Metric definitions,
  comparisons and audience remain in discovery; existing NFL situation cards remain
  a separate feature.
- Q-02 is confirmed: personal weekly points update immediately; shared weekly and
  season standings count each game from kickoff, for every row including your own.
  Label these totals separately and show which own points await kickoff. Other-player
  per-game scores follow the existing reveal gate. D-39 visibility still protects
  derived scores; no hidden contribution may leak through aggregates or rank changes.
- These are requirements only. Existing applies are not undone and no new merge,
  migration, deploy or external-board update is performed by this amendment.

## D-39 changes to this plan (read first)

Sean answered the open questions on October 14 (D-39). Where this section and a later one disagree, this section wins, subject to the newer D-50 amendment above.

| Topic | Change |
|---|---|
| Lock-in (stages 15, 16, 17, 18, 19, 24, 25, 26, 28–31) | Per game, not per market. Each game's Spread or Total guess is final once locked in, and locking it in opens that game's line for that market and everyone's guesses for that game and market. There is no market-level "send". M-02 enforces "a locked-in guess cannot change" per game and market; the reveal and the line lock key on the player's locked-in guess for that game and market (plus kickoff, skip and "See picks now"). Unlocked guesses stay drafts until kickoff. |
| Skip and "See picks now" (stage 19) | Allowed until the last kickoff; locked-in guesses keep counting. |
| Scoring a partly locked-in week (stages 18, 19, 24; D-41) | Each locked-in guess scores on its own; a game never locked in scores nothing. Built with M-07 (stage 24); until then M-02 counts a market once its last game is locked in. The old D-23 sit-out after a lock-in covers only the rest of the week, and the locked-in guesses keep counting (M-03). |
| Old sit-out window and History (stages 19, 21, 24, 25; D-43) | The old "Sit out this week" stays open until the last kickoff, like Skip and "See picks now" (M-07 moves `gtl_sit_out_week`; stage 25 the button). History lists locked-in guesses per game: a sat-out market's to its owner and, gated per game, every market's to other players, with M-07's per-game scoring; the old History too (stage 25). M-07 lets D-27 pending-line resolution through for a sat-out market's locked-in guesses. A locked slip leg also holds back the slip's note and change reasons (M-04). |
| Rule timing (stages 24, 25) | Live in both apps once built, the same day. |
| Monday-night lines (stage 22) | Yes. |
| Testers (stages 9, 49) | Whole league, opt-in. "Try the new app" shows to every signed-in member from the first look. Stage 49 and M-14 (tester list) are dropped. |
| Real slips (stage 46) | Dollar stakes on new slips; no undo for a tail. |
| Challenges (stages 50, 51) | Up to 3 points either way in half points; void keeps credit; hedging allowed with a note. |
| Journal (stage 74) | Read-only in History. |
| Push wording (stage 25) | "Due", not "lock". |
| Calendar (section 8.2) | ASAP. Section 8.2 dates are no longer targets: every stage ships when it passes its gates, and each risky apply still gets its own quiet window and Sean's approval. |

---

## 2. The short version

- **81 stages (plus stage 27a, D-40), 29 migrations, 5 lanes, build waves 0 to 12, then the flip.** Each stage is one reviewable PR (stage 78 is a short series of identical pages).
- **The new app lives in `web/src/next/`** as one lazy chunk. Players never download it. A per-device switch, opt-in for every league member (D-39).
- **Stage 2 (push guard) goes out with the next deploy of `main`.** Otherwise players get a "Remind me" button that fails.
- **Rules land on the server first.** The database reports which rule is live (`gtl_live_rules`), and both apps follow it. So a deploy can never put a screen ahead of its rule, and a rollback switches the screens back.
- **First look:** after wave 5, Sean opens the new frame with read-only Home and Lines on live data.
- **Risky migrations stand alone** in a quiet window: the D-37 lock, the late window, the collector change, the Bets write path, feed kinds, challenges, settlement and kickoff posts.
- **Nothing is rewritten or deleted.** Migrations add functions and tables. New tables are append-only or versioned. A rollback is the previous function bodies, or an off switch for new tables. Never a drop.
- **Target calendar:** the last apply on Wed Dec 2; one full live week of checks (Week 14); the default flips Tue Dec 15. Latest Tue Dec 29 (Q10).
- **The flip is one small PR.** Retiring the old app is a later PR, at least two weeks after. (Superseded by D-52: stage 80 is a verified new-only cutover and stage 81 is source cleanup only.)

---

## 3. Architecture

### 3.1 Where the new app lives

| Area | Path | Notes |
|---|---|---|
| Root | `web/src/next/NextApp.jsx` | Loaded lazily from `web/src/main.jsx`. Adds its own font link when it mounts. |
| Shell | `web/src/next/shell/` | Top bar, tab bar, layer hosts (overlay › popover › dialog › sheet › page), toasts, dock, offline banner, `state.js` reducer, `router.js`, per-tab error boundaries. |
| Tabs | `web/src/next/{home,play,bets,lines,league,me}/` | Each tab has an `index.js` slot file: `homeTiles`, `counter`, `sheetActions`. Home, the tab bar and the game sheet read only these slots, so a lane edits only its own tab. |
| Shared Guess pieces | `web/src/next/guess/` | One owner each: `WhosIn`, `ForfeitDialog`, `EveryonePicks`, How to play. |
| Data | `web/src/next/data/` | `AppData.jsx` loads `/lobby` and `/community/read` once and shares them. |
| UI kit | `web/src/next/ui/`, `web/src/next/styles/` | One React component per prototype class. All classes start with `gx-` under a `.gx` root. |
| Pure logic | `web/src/next/{format,copy,rules}.js`; `shared/{best-offer,guess-board,lines-view,bets-qual}.mjs`; `shared/game-features/{streaks,badges,awards,h2h}.mjs` | Node-tested. Shared with the server where both need it. |
| Server | `cloud/{lines,bets,league,me}.mjs` | Wired into `cloud/handler.mjs` once (stage 4). Rules live in SQL. |
| Jobs | `supabase/functions/gtl-virtual-settle`, `gtl-league-features` | Copy the `gtl-week-open` pattern. Off by default. Cron only in `supabase/admin/`. |
| Tokens | `design/tokens-next.json` and a D-38 section in `docs/BRAND_GUIDE.md` | `design/tokens.json` stays for the old app. |

### 3.2 The switch

- `main.jsx` keeps `ThemeProvider › AuthGate`. Inside AuthGate: `gtl.app = next` renders the lazy `NextApp`, anything else renders `GameHub`. The two never mount together. Every switch reloads the page.
- `DEFAULT_APP = 'classic'` until stage 80. If storage fails, the default is used.
- An outer error boundary around the lazy chunk clears `gtl.app` and renders the old app. `?app=classic` always forces the old app.
- Old app: "Try the new app" in the Community footer, shown to every signed-in member (D-39). New app: "Use the old app" in the menu, Settings and every error card.
- The switch is a convenience, not a security gate. Both apps call the same routes under the same server rules.

### 3.3 Data and API

- Both apps use `web/src/api.js` (`cloudApi`, `ApiError`, `SaveUncertainError`). New route groups get thin wrappers there: `linesApi`, `betsApi`, `leagueApi`, `meApi`.
- Reads may retry. Writes never retry by themselves. A `SaveUncertainError` keeps the typed values and says so. Group writes carry `revision`; new writes carry a request id.
- `cloud/optional-rpc.mjs` treats PostgREST `PGRST202` (function not found) as "feature off". An existing route never gets a hard dependency on a new RPC. New fields on old routes come through this wrapper.

### 3.4 The server is the authority

- SQL and the handler decide: when each pick closes, the D-37 lock, the line lock, who sees whose picks and bets, qualification, ranks and settlement.
- `gtl_live_rules()` (created in M-01 or M-02, whichever is applied first; updated by the other and by M-07) returns `{sentFinal, lateWindow, revealAt}`. `revealAt` says when the clock opens a game's line and everyone's picks: `'deadline'` today (D-23: the deadline opens the whole week for everyone), `'kickoff'` from M-01 (each game at its own kickoff). `/community/read`, `/personal` and `/state` carry it as `rules`. When the function is missing, the wrapper returns today's rules, `{sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline'}`. The old app's buttons, `picksDue()` and the new app's banners all read it.
- The new app's `rules.js` only draws banners. A lock that exists only in the client can be read in the network tab.

### 3.5 Old and new side by side

- Same sign-in, routes and tables. A pick or bet made in one app shows in the other.
- The old app changes only where a rule or a ruled defect forces it: stages 2, 14, 15, 17, 20, 21, 25 and 61.
- Before the flip, entries the old app cannot show (challenges, bet shares, reactions other than the heart) can only be made by testers on both sides (stage 49). At the flip they open to everyone.
- Old-app specs and personas run on the schema players actually have (`HOSTED`, stage 3) until stage 81.

### 3.6 Who does what

| Who | Does | Never |
|---|---|---|
| Lane agents | Build PRs on branches, run tests, list prototype markups | Merge, push to `main`, apply, deploy, touch the database |
| Sean | Approves each merge, each "apply M-xx", each deploy SHA, each cron enable, the flip | — |
| Cloud session holding Sean's message | Applies migrations through the Supabase MCP (or Sean uses the SQL editor) | `db push` |
| Mac mini sync session | Deploys Pages, `gtl-api` and Edge functions, runs live checks, updates the release record (D-38) | Deploy without Sean's OK |

---

## 4. Gates

### 4.1 Done means (every PR)

- **CI green, by job:**
  - Tests: diff check, typecheck, `npm test` with zero skipped, `npm run score -- --week 6`.
  - Dashboard checks: build, browser, cloud-browser, performance, accessibility, `build:cloud` with the boundary scan and release manifest, `snapshots.py check`, the Python and model tests with no skip.
  - Persona suite. Brand QA (`python3 scripts/check-brand-docs.py`; when a doc it asserts on changes, update the assertion in the same PR).
- Sean's `data/picks/2026-week-05.json` hash unchanged. Nothing under `.local/` committed.
- **UI stages:** one new Playwright spec file per stage, at 390 × 844 (`test.use({ viewport })`): no side scroll, 44 px targets, no text under 12 px, nothing clipped with fallback fonts. Axe in dark and light at 390 and 320. 390 px screenshots, dark and light, beside the matching prototype screenshot; Sean ticks them. Before a UI stage starts, read the prototype canvas for new markups and list them in the PR.
- **Server stages:** every new RPC is granted to `service_role` only and added to its area's boundary file with `awaitingDeploy`. New error codes are mapped before the SQL can raise them. An existing route behaves as today when the new RPC is missing (test with the stage's own migration left out). Every new reader joins the leak scan. A player's own entries are never redacted.
- **Rules:** `docs/RULES.md` (and the area doc) change in the same PR. The Late marker shows wherever a pick shows.
- **Never:** sample data in `web/src`; picks, lines, notes or forecasts in static assets; `create or replace` that changes an argument list.

### 4.2 Gate M: applying a migration

1. The migration PR merges only when it is next in the apply queue. Its file is stamped at merge, after the newest file on `main`. Filename order is apply order, except where a file merged earlier sorts before a migration its "Apply after" names (section 6): M-06 (`20261015010000`) sorts before M-02 (`20261015030000`) and is still applied after it.
2. Deploy anything that must exist first (error mapping, a route that reads both shapes).
3. Sean says "apply M-xx".
4. Read-only pre-check: the bodies being replaced match the repo's previous version (md5); new tables don't exist; nothing is half-applied.
5. Read-only score hash: every finished week's points per ballot (`gtl_ballot_pick_scores`) and every settled Virtual Units result. Anchors: Week 5 Sean 95.8, Steven 91.4, Ben 37.6.
6. Apply through the Supabase MCP `apply_migration` or the SQL editor. Every migration is idempotent. After a timeout, rerun step 4 before any retry.
7. Verify: each function byte-identical (md5 of `prosrc`); grants service-only; one `pg_proc` row per RPC; score hash unchanged unless the stage says scores move; for ballot write paths, the next scheduled odds collection succeeded; for slate triggers, the next `gtl_week_open_runs` row.
8. Record the hosted version in the release record and the release checklist lists. Move the file's version from `NOT_HOSTED` to `APPLIED` in `tests/migrations.mjs` (every file is in exactly one of the two). Deploy what follows. Run `check:cloud`, then `--strict`. Remove `awaitingDeploy`.
9. Rollback ready before step 6: `supabase/rollback/<name>.sql` with the previous bodies, tested on PGlite. For new tables or written rows: an off switch (`GTL_FEATURE_OFF`), never a drop. M-13, M-21 and M-23 are fix-forward only.

### 4.3 Gate D: deploys

- Each deploy names an exact SHA. The Mac mini runs `npm run build:cloud`, `check-cloud-boundary.mjs --bundle-only` and `release-manifest.mjs`, deploys, runs the live checks and updates the release record, which lists merged migrations not yet applied.
- When a reply changes shape: Pages that read both shapes, then `gtl-api`, then the SQL apply.
- **Release timing:** no calendar or game-window restrictions (Sean, October 19). Collect fresh published schedule evidence; retain all other Gate M and Gate D checks.

### 4.4 Release cards and approvals

Each stage's PR carries a release card: merge OK, deploy-before SHA, "apply M-xx", deploy-after SHA, checks (steps 5 and 7), rollback or off switch. Sean's words are quoted in the release record. Approvals are batched by window: one message covers that window's merges, applies (in order) and deploy SHAs.

---

## 5. Ordering rules

1. Stage 2 deploys first, alone (wave 0). Finish it by Thu Oct 15 12:00 PM PT, or wait until Fri Oct 16.
2. Stage 1 (rules on `main`) merges before any rule stage opens. Each later answer from Sean is recorded as its own D-entry before the stage that needs it.
3. M-01 is applied before anything that opens more: M-06, M-07, M-08, M-20, M-22, M-27.
4. M-06 (lines reader) only after M-01 and M-02 are applied and stages 20 and 21 are live.
5. M-07 (late window) only after M-01, M-02 and M-05 (or Sean's fallback), with stage 17 live; stage 25 goes live the same day.
6. M-13 (feed kinds) before any migration that writes a new post kind: M-15, M-17, M-22, M-23, M-25.
7. Bets UI only after M-10 and M-11. Challenge UI only after M-15.
8. Old-app edits to `web/src/CommunityHome.jsx` merge in this order: 2 → 15 → 9 → 17 → 25.
9. One function, one open PR. The second PR waits and copies the newest body (checked by the md5 header test from stage 3; the test sees only the header's md5, so the reviewer diffs the body against `node scripts/migration-functions.mjs --function NAME`):

| Function | Replaced by, in order |
|---|---|
| `gtl_read_community` | M-01, M-21 |
| `gtl_read_community_history` | M-01, then M-03 (D-41: a sat-out market's locked-in guesses) |
| `gtl_week_revealed` | M-01 |
| `gtl_mutate_personal` | M-29, then M-02, M-07 |
| `gtl_save_weekly_ballot`, `gtl_guard_fresh_submission` | M-02, M-07 |
| `gtl_live_rules` (new) | M-01, M-02, M-07 |
| `gtl_guess_locked_in` (new in M-01: a pick in a submitted ballot is locked in) | M-02, when it records per-game lock-ins |
| `gtl_ballot_late` (new in M-01: reads `ballot.late` as `{deadline, minutes}`) | M-07, only if the stored Late marker takes another shape |
| `gtl_feed_on_ballot` | M-07 |
| `gtl_read_lines` (M-06: `mine.points` only for a submitted ballot, `mine.late` the ballot's marker) | M-07, for per-game lock-in and Late |
| `gtl_read_guess_picks` (M-08: a removed member listed only with a submitted ballot or an opt-out; scores only submitted ballots; `late` the ballot's marker) | M-07, for per-game lock-in, scoring (D-41) and Late |
| `gtl_read_social` | M-04 |
| `gtl_begin_odds_collection`, `gtl_finish_odds_collection`, `gtl_begin_submission_odds_collection` (as built in stage 22; the two slate resolvers stay unchanged) | M-05 |
| `gtl_read_bets`, `gtl_read_bets_board` | M-10 and M-12, then M-16 |
| `gtl_settle_virtual_units` | M-18 |
| `gtl_like_feed` | M-21 |
| `gtl_comment_feed` | M-22 |

---

## 6. Migration ledger

M-numbers are names. The apply order is the calendar in section 8. Real files are `<timestamp>_gtl_<name>.sql`, stamped at merge.

| M | Stage | Name | What | Risk | Window | Apply after |
|---|---|---|---|---|---|---|
| M-01 | 16 | `guess_gate_per_game` | Per-game reveal, points from kickoff, null for no ballot | Low (hides more; old numbers move) | Tue–Wed | — |
| M-02 | 18 | `sent_picks_final` | D-37 lock in every writer; `gtl_live_rules` | High, alone | Fri–Sat after a Thu deadline | 15 and 4 live |
| M-03 | 19 | `guess_week_forfeit` | Skip and "See picks now" | Medium | any quiet day | M-01, Q2 |
| M-04 | 21 | `social_line_lock` | Per-viewer gate on real slips | Medium | any quiet day | M-01 |
| M-05 | 22 | `odds_open_weeks` | Collector keeps unstarted games of last week | High (budget), alone | Tue–Wed | Q4 |
| M-06 | 23 | `lines_read` | Lines readers, kickoff line | High (opens lines) | Tue–Wed | M-01, M-02, M-04; 20 live |
| M-07 | 24 | `guess_write_window` | Close at each kickoff, Late marker | Highest, alone | Tue–Wed | M-01, M-02, M-05; 17 live; Q3 |
| M-08 | 26 | `guess_picks_reader` | Everyone's picks | Medium | any quiet day | M-01 |
| M-09 | 27 | `game_notes` | Private notes | Low | any | — |
| M-10 | 40 | `bets_read` | Account-level Bets read | Medium (others' bets visible) | any quiet day | M-01, M-04 |
| M-11 | 41 | `bets_place` | Account-level Bets write | High, alone | Tue–Wed | M-10 |
| M-12 | 42 | `bets_boards` | Bets board and season | Low | any | M-10 |
| M-13 | 48 | `feed_kinds` | One kind-check swap, `league_id` | High, alone, fix forward | Tue–Wed | — |
| M-14 | 49 | `app_testers` | Tester list and the new-social gate | Low | any | Q5 |
| M-15 | 50 | `friend_challenges` | Challenges | High (races), alone | Tue–Wed | M-11, M-13, M-14; Q7 |
| M-16 | 51 | `challenge_records` | Challenges count in records | Medium | any quiet day | M-15, M-12 |
| M-17 | 52 | `bet_sharing` | `bet_shared` posts | Medium | any quiet day | M-11, M-13, M-14 |
| M-18 | 55 | `settle_challenges` | Settlement grades challenges | High, alone | Tue–Wed after Monday is settled | M-15 |
| M-19 | 56 | `settlement_schedule` | Scheduled settlement, off | Medium | any | M-18 |
| M-20 | 57 | `league_boards` | Boards, my leagues, members | Low | any | M-01 |
| M-21 | 61 | `feed_reactions` | Append-only reactions | Medium, fix forward | any quiet day | M-01, M-13 (its `league_id`; D-39 dropped M-14) |
| M-22 | 62 | `league_feed` | Feed reader, comments, share result | Medium | any quiet day | M-13, M-21, M-04, M-08 |
| M-23 | 63 | `kickoff_posts` | Kickoff posts and backfill | High (writes rows), alone, fix forward | Tue–Wed | M-13, M-01; M-21 (old reader keeps full pages), M-22 (comments from kickoff) |
| M-24 | 67 | `player_card` | Player card, head-to-head | Low | any | M-20, M-15 |
| M-25 | 69 | `league_features` | Badges, awards, winners | Medium | any | M-13, M-06 |
| M-26 | 70 | `features_schedule` | Features job, off | Medium | any | M-25 |
| M-27 | 72 | `me_history` | Own changes, older records | Low | any | M-01, M-03 |
| M-28 | 75 | `me_export` | Export my data | Low | any | M-27 |
| M-29 | 27a | `favorite_keeps_note` | Old app's "Save to Favorites" keeps a stored note (D-40) | Low (copies the Solo ballot path unchanged) | any quiet day | — |
| M-30 | EPL | `epl_pick_a_team` | EPL Pick a Team tables + RPCs and the gtl-epl-jobs run queue (cron-only dispatcher, one-run capability, shared Odds API reserve of 50) (new objects only; schedule rows off; cron registered by hand from supabase/admin/epl_jobs_cron.sql; no rollback file, nothing replaced) | Low (additive) | any | M-29 |
| M-31 | EPL | `epl_open_access` | EPL open access (D-68 addendum): `gtl_epl_link_audit` (append-only), `gtl_epl_manager_aliases` (seeded: Sean "fistathon", Steven "sthomas"), `gtl_epl_auto_link` (unique display-name match only) and `gtl_epl_claim_manager` (first claim wins), service-only; replaces `gtl_epl_link_manager` with the same arguments plus its audit row (rollback file restores M-30's body) | Low (additive; one body replaced) | any | M-30 |
| M-32 | EPL | `epl_moneyline` | EPL Guess the Line (2-way draw-no-bet moneyline): `gtl_epl_guesses` (one per manager per match; draft or locked, final once locked; reference at lock-in or first price after, distance) and `gtl_epl_guess_history` (append-only); `gtl_epl_save_guess`, `gtl_epl_resolve_pending_references`, `gtl_epl_guess_board` (others' locked guesses once you lock that match or it kicks off) and `gtl_epl_guess_leaderboard`, service-only; widens the existing job constraint to accept `dnb-check` without creating or enabling its schedule (fix-forward; disable the new job, preserve run evidence and guesses) | Low (additive tables; constraint widened) | any | M-31 |
| M-33 | EPL | `epl_stat_rechecks` (`20261029151727`) | D-68 Tuesday Sleeper recheck: service-only append-only audit and immutable corrected snapshot; due-time, claimed-job and complete-owner/score validation; changed totals flag operational review, preserving original snapshots and all picks/orders. No existing function replaced. **Pending Gate M apply; not hosted.** | Low (additive; original records kept) | any | M-31 (M-32 is independent; source/worker integration must include both if released together) |
| M-35 | EPL | `epl_corrected_draft_order` (`20261029162144`) | Empty-next-draft corrected-score recomputation with shared row lock, deadline/pick preservation and append-only outcomes; shared 12h/eight × two-credit weekly result-read envelope; explicit verified schedule-interval admission protects final captures and Tuesday rechecks. **Pending Gate M; not hosted. Applying can intentionally pause automatic finals/next-week opening without verified interval evidence. Review the [operator prerequisite](EPL_FINALIZATION_ORDER_2026_10_29.md) before named apply approval.** | Low (additive; original records kept); operational gating changes after apply | any | M-33 (M-34 standings is independent) |

Not in this ledger: the push migration `20261013030000` is in the repo but not hosted. Its apply is Sean's separate call (stage 2).

---

## 7. Stages

Each phase opens with a table: lane, migration, **Build after** (stages that must be merged first) and **Live after** (applies or deploys Sean must see first). Agents can build and test on PGlite as soon as the Build-after stages merge. The blocks below give goal, scope, tests and what Sean sees. Gate M and Gate D apply to every migration and deploy.

Lanes: **A** shell, Home, Me, History, commissioner · **B** Guess rules, Play, challenge server · **C** Bets and real slips · **D** tooling, Lines, player card, game-features server · **E** League and social.

### Phase 0: groundwork

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 1 | Rules and this plan on `main` | B | — | — | merge |
| 2 | Push guard | A | — | — | deploy first (wave 0) |
| 3 | Test and migration tooling | D | — | — | — |
| 4 | Route modules, boundary files, optional RPCs | D | — | — | gtl-api deploy |
| 5 | Inventory home table | E | — | — | — |

**1. Rules and this plan on `main`**
- Goal: lane agents read the current rules from `main`.
- Scope: merge `claude/d37-sent-picks-final` (D-37, D-38); add this file as `docs/REDESIGN_BUILD_PLAN.md`; a short "current rules" pointer at the top of `AGENTS.md` (D-35 to D-38 replace edit-until-deadline for Spread and Total; the archived text stays as history). RULES.md rows change with their stages.
- Tests: Brand QA.
- Sean sees: nothing in the app.

**2. Push guard**
- Goal: `main` holds the push code (#58) but push is not live. Hide the reminder until it really works.
- Scope: `/community/read` gains `pushConfigured` (true only with a valid VAPID key; the key is never sent). The picks-due prompt and `PushReminders.jsx` hide when it is false. Nothing else.
- Approval: merge, then deploy with or before the pending `main` deploy. Separately, Sean may approve applying `20261013030000` (read-only check first that nothing was half-applied; SQL editor if the MCP times out again).
- Tests: `community-cloud` (true and false; the key never in a reply); `push-reminders.spec.js` (hidden when not configured); phone persona at 390.
- Sean sees: no broken "Remind me" button.

**3. Test and migration tooling**
- Goal: CI tests the order the hosted project has, and no stage hand-edits a long list.
- Scope:
  - `tests/migrations.mjs`: `ALL` (read from the folder, sorted) and `HOSTED` (`ALL` minus a written `NOT_HOSTED` list, today only `20261013030000`). `community-world.mjs`, the old-app specs and `personas/harness.mjs` use `HOSTED`; new specs use `ALL`. Each migration PR adds its file to `NOT_HOSTED`; the apply record moves it to `APPLIED` (since the stage 3 review follow-up every file is in exactly one of the two, so a missing `NOT_HOSTED` line fails).
  - `scripts/migration-functions.mjs`: lists every `create or replace function` by file. A replacing migration carries a header with the md5 of the body it replaces; a node test fails on a stale copy.
  - A test that every `gtl_` RPC has exactly one `pg_proc` row.
  - `supabase/rollback/` convention, and a PGlite test that applies a migration, then its rollback, then reruns the old-app SQL suite.
  - `tests/helpers/leak-scan.mjs`: a deep scan of any reply for a line value or a hidden Guess pick, with the viewer's own entries exempt. It starts with today's readers and grows with each stage.
- Tests: the tools' own tests; every existing suite unchanged.

**4. Route modules, boundary files, optional RPCs**
- Goal: parallel server stages edit only their own files.
- Scope: empty `cloud/{lines,bets,league,me}.mjs` (methods map, handler, error map) wired into `cloud/handler.mjs` once; empty wrappers in `web/src/api.js`; probe lists split into `scripts/boundary/{guess,lines,bets,league,me}.mjs`; `cloud/optional-rpc.mjs`; the `rules` field on `/community/read`, `/personal` and `/state` (today's rules while `gtl_live_rules` is missing).
- Tests: `cloud-api` and `cloud-boundary` unchanged; the merged route map equals today's; the joined probe lists equal today's; `rules` falls back when the RPC is missing.

**5. Inventory home table**
- Goal: every one of the 191 inventory rows has a planned home now, not only at cut-over (D-23).
- Scope: `docs/redesign/INVENTORY_HOMES.md`: each row maps to a stage, a History row, a commissioner page, or "cut, data kept". It includes the rows the draft missed: invite list and Revoke (59), week not open and week closed (36), the one-time Remind me (36), export (75), older group scoring views and the Week 5 freeze (74), access pending and removed account (11), research links and data attribution (38), real slip weeks, editor and report result (47), tracker charts, filters, metrics and Compare (cut, data kept; D-36), journal (74, Q8), referee look-up (34), team marks (8), Design lab (cut at 81, code kept in git).
- Tests: a node test that rows 1 to 191 each have a home and each named stage exists here.

### Phase 1: first look (read-only, real data)

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 6 | Tokens, fonts and styles | A | — | — | — |
| 7 | Formatters, copy, rule view model | E | — | — | — |
| 8 | UI components | A | — | 6 | — |
| 9 | The switch | A | — | 2 | Pages |
| 10 | Shell frame | A | — | 8, 9 | Pages |
| 11 | Data layer, switcher and guards | A | — | 10 | Pages |
| 12 | Read-only Home | A | — | 11, 7 | Pages |
| 13 | Read-only Lines and game sheet | D | — | 11, 7 | Pages |

**First-look deploy:** one Pages deploy after 2 and 6 to 13 merge. Sean taps "Try the new app". Until then a production build leaves the button out (`NEW_APP_OFFERED` in `web/src/TryNewApp.jsx`, on only with `VITE_GTL_OFFER_NEW_APP=1`, which the browser test configs set), so an earlier Pages deploy of main never shows the empty frame. The first-look PR turns it on for every member (D-39). *October 14, 2026:* done, on Sean's "live and ready to test in the next hour", with stages 2, 6 to 11 and 13 merged and stage 12 (Home) still to come: Home shows "Coming next" until stage 12 lands. `VITE_GTL_OFFER_NEW_APP=0` is the build-time off switch.

**6. Tokens, fonts and styles**
- Scope: `design/tokens-next.json`; `web/src/next/styles/{tokens,base,components}.css`, dark by default, light through `data-theme`; the D-38 section in `docs/BRAND_GUIDE.md`. Figtree, Big Shoulders Display and Barlow Condensed load from a link `NextApp` adds; `web/index.html`, its meta description and the manifest wait for stage 80.
- Tests: node `next-tokens`: every `var()` defined in both themes; CSS equals JSON; contrast ≥ 4.5 for text and ≥ 3 for UI; `gx-` prefix; no font under 12 px; tabular numbers; a reduced-motion block. This is the real gate for new styles (`persona-static-checks.mjs` reads only the old CSS).
- Sean sees: the brand guide section to review.

**7. Formatters, copy, rule view model**
- Scope: pure `web/src/next/{format,copy,rules}.js`. Pacific time through `Intl` (never a fixed offset); a real minus; "—" for missing; "U" for units; "Late · 12 min".
- Tests: `next-format` (the prototype contract examples, Nov 1, null to "—", no hyphen-minus); `next-rules` (draft, sent, sat out, after kickoff); a sample-data guard that fails on any import of the prototype's `data.js` or its sample names ("Sunday Crew", "Office Pool", "Marcus", "Priya", "Jules", "Kenny", "Dre") under `web/src/next/`.

**8. UI components**
- Scope: `web/src/next/ui/*`: Text, Button, IconButton, Card, List, Row, Pill, Tag, Chip, ChipRail, Segmented, GateBanner, LockLine, Countdown, Rank, Meter, Badge, Strip, Sheet, Dialog (native `<dialog>`), Toast, Overlay, TeamMark (the D-22 marks, sized to fix DP-27's slow images), the Field monogram from `Brand.jsx`, lucide icons.
- Tests: vitest `next-ui` (classes, accessible names, emoji only inside `data-emoji-ok`, every svg hidden or labelled).

**9. The switch**
- Scope: lazy `NextApp` in `main.jsx` (section 3.2); the outer fallback boundary and `?app=classic`; the footer button for every signed-in member (D-39); a placeholder `NextApp`.
- Tests: node `next-app-view` (default, round trip, storage that throws, unknown value); Playwright 390 `next-switch.spec.js` (a signed-in member sees the button, switches and returns; a blocked chunk falls back to the old app); performance: the old app loads no `NextApp-*`, the new app loads no `GameHub-*`.
- Sean sees: "Try the new app" and an empty frame.

**10. Shell frame**
- Scope: the reducer and router (`#picks*` to Play, `#feed` to League feed, `#groups` to the switcher; `=` fragments, `#main` and `#picks-due` left alone; Back closes the top layer); top bar, tab bar, layer hosts, toasts, dock, offline banner; per-tab error boundaries with "Use the old app"; theme and reduced motion on the old storage keys; the tab slot files; CI sharding for cloud-browser once it passes a 20-minute budget.
- Tests: node `next-router`, `next-shell-state`; Playwright 390 `next-shell.spec.js` (tabs, a sheet, Back, a reload keeps the tab, `/#picks` opens Play, no unexpected origins, no writes while browsing); axe.
- Sean sees: five tabs with "coming next" cards; the avatar menu (Appearance, Use the old app, Sign out).

**11. Data layer, switcher and guards**
- Scope: `AppData.jsx` (shared reads, refresh on focus and every 5 minutes, abort on unmount); the switcher sheet (Community, groups, invites with Join); the name step on an empty `displayName` (through `/profile`); the saved invite; a 401 prompt that keeps typed text; removed-account and access-pending screens; `clearNextDrafts()` in AuthGate's account-change list; the Play counter.
- Tests: node `next-data` (one request for two consumers; focus refetch; no write retry after `SaveUncertainError`); Playwright 390 `next-data.spec.js` (only his leagues, kept across reload; name step; invite card; expired token; a removed fixture account; a second account sees no drafts from the first).
- Sean sees: the league pill, the switcher, his invites and the Play counter.

**12. Read-only Home**
- Scope: `web/src/next/home/*`; pure `shared/guess-board.mjs` (ranks with T-2 ties, the chase line, movement; never a Spread + Total sum); `WhosIn`. Countdown, one status line, "6 of 7 in", the Spread rank tile ("—" with no ballot). The lime action opens the old app's Picks until stage 29.
- Tests: node `guess-board`, `countdown`, `home-hero` (moments M1, M2, M5, M6); Playwright 390 `next-home.spec.js` (one lime button; who's in; T-2; "—", never 0).
- Sean sees: Home with this week's countdown, his status, who's in and his Spread rank.

**13. Read-only Lines and game sheet**
- Scope: `web/src/next/lines/{LinesBoard,GameSheet}.jsx`; pure `shared/lines-view.mjs`; `shared/trends-view.mjs` gains a per-game access function, `shortCard` and `boardTrends` (old callers switch in stage 17). Kickoff groups; "YOU −3" and "YOU 41" tags; a lock on each unsent market; his own line at the guess; at most 3 trend lines per board and 1 chip per card; the sheet header with team records in words (DP-16); You on this game; short trend cards (line trends locked with their market); weather and referee rows that hide cleanly on a 404; a weather row on every game from `shared/weather-view.mjs` `weatherRow` (D-45): the full card in the sheet with the Open-Meteo credit, "Indoors" for a dome or SoFi Stadium, "Roof may close" for a retractable roof with or without a forecast (`roofNote`), "No current forecast" otherwise; on the board at most one word chip per row from `weatherChip` ("Windy", "Rain likely" or "Snow likely"; no digits, no link; none for Indoors or no forecast), and every other forecast value only in the sheet (D-34 as amended by D-45). The chips need `/wind/read` on the board, and every read can refresh due games, so the board makes more reads than the old app, which reads only when a trends panel opens. Members on the board through a Sunday then approach the cap table's worst case ([TRENDS.md](TRENDS.md#kickoff-wind-forecast-d-34)): Weeks 14, 17 and 18 run out of daily calls unless Sean raises the cap or changes the tiers. D-47 (October 15): Sean changed the tiers to a refresh every 24 h, then 12 h and 2 h before kickoff, and the board re-reads at those due points like the sheet; the busiest day of any week now needs at most 28 calls. "Line now arrives in a later update."
- Tests: node `lines-view`, `trends-view` (per-game access, short cards, Week 6 board trends), `trends-week` (the week file holds no current line); vitest `wind-ui` (a closed row has no digits; the chip is one of the three words or none, never on an Indoors row; times in PT); Playwright 390 `next-lines.spec.js` (groups, tags, a lock is an icon and never "—", the sheet opens and closes, a chip and the sheet's full card with its credit); `/wind/read` once when the board shows a week, reused by the sheet through the old app's 5-minute cache, and re-read at TTL crossings only while a sheet is open, as the old panel does (D-47: the board and an open sheet re-read at the 24 h, 12 h and 2 h due points, at kickoff and on visibility).
- Sean sees: the Lines tab and game sheet on live games.

### Phase 2: the rules on the server (both apps follow them)

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 14 | Best price fix | C | — | — | gtl-api |
| 15 | Old app: sent picks are final | B | — | 1, 4 | Pages (shows on M-02) |
| 16 | Per-game gate in SQL | B | M-01 | 3 | Tue–Wed |
| 17 | Old app: per-game reveal and "—" | B | — | 16, 15 | M-01; Pages then gtl-api |
| 18 | Sent picks final in SQL | B | M-02 | 1, 3, 4 | 15 live; Fri–Sat; Q1 |
| 19 | Skip and "See picks now" | B | M-03 | 16 | M-01; Q2 |
| 20 | Old Virtual Units line lock | C | — | 14, 3 | gtl-api and Pages |
| 21 | Real slips line lock | C | M-04 | 20 | M-01 |
| 22 | Monday-night lines | D | M-05 | 3 | Tue–Wed; Q4 |
| 23 | Lines reader | D | M-06 | 16, 4 | M-01, M-02, M-04; 20 live |
| 24 | Picks close at each kickoff | B | M-07 | 18 | M-01, M-02, M-05; 17 live; Q3 |
| 25 | Old app: late picks until kickoff | B | — | 24, 17 | with M-07 |
| 26 | Everyone's picks reader | B | M-08 | 16, 4 | M-01 |
| 27 | Private notes server | D | M-09 | 4 | — |
| 27a | Old app: Save keeps a stored note | D | M-29 | 3 | — |

**14. Best price fix**
- Goal: fix two proven bugs: a tie at one line is broken by "closest to −110" instead of the better price, and a book missing from the newest snapshot falls back to its oldest kept quote.
- Scope: `shared/best-offer.mjs` (D-18 order: best line, better price by decimal payout, newest observation, book A–Z; newest quote per book); `cloud/virtual-units.mjs` uses it. Saved bets keep their terms.
- Tests: node `best-offer` (+100 beats −110; −105 beats −115; equal prices fall to the newest, then A–Z; a missing book uses its newest older quote; nothing observed at or after kickoff counts; Week 6: SEA −3 picks BetMGM −102); update `virtual-units.test.mjs`.
- Everyone sees: the better book on 12 of 56 Week 6 sides in the old Virtual Units screen.

**15. Old app: sent picks are final**
- Scope: `CommunityHome.jsx` (`SubmitReceipt` "Edit picks" and "Save changes", the header), `PredictionEntry.jsx`, `PersonalWorkspace.jsx` and the rules modal in `App.jsx`. When `rules.sentFinal` is true they show "Submitted · final" and no Edit. Until M-02 is applied nothing changes.
- Tests: `onboarding.spec.js` and `personas/power.spec.js` cover both rule states; phone persona at 390.
- Everyone sees (after M-02): "Submitted · final", no Edit.

**16. Per-game gate in SQL (M-01)**
- Goal: one reveal gate per game and market; points count from kickoff; no ballot is never 0.
- Scope: new `gtl_guess_revealed(viewer, season, week, mode, game, now)` and `gtl_markets_visible`; replace `gtl_read_community` (same argument list), `gtl_read_community_history` (per-game gate; his own unsent draft lines hidden) and `gtl_week_revealed` (its deadline clause becomes "that game has kicked off", which closes the deadline reveal before late picks exist). Standings count kicked-off games only; `weekPoints` is null with no ballot (the handler still maps it to 0 until stage 17); posts dated in the future are left out; `late` is read from the ballot (null until written). No paging change. `gtl_live_rules()` reports `revealAt: 'kickoff'` from this apply (section 3.4), so the new app stops opening every game at the deadline; if M-02 has not created the function yet, M-01 creates it with today's other two fields, and whichever of M-01 and M-02 is applied second keeps the other's field.
- Tests: SQL `guess-reveal-per-game-sql` (per game and market; a send or sit-out reveals; one kickoff opens one game; drafts never show; null for no ballot); `history-draft-lines-sql`; the one-overload test; update `community-sql` and `community-history-sql`.
- Sean sees: nothing until stage 17.

**17. Old app: per-game reveal and "—"**
- Scope: `normalize` in `cloud/community.mjs` keeps null; the old `Leaderboard`, `PostPicks` and `RevealedPicks` use per-game `picksHidden` and show "—" (today `show(null)` prints "0.0"); the Community board orders Spread and Total separately, never by the hidden sum (DP-2, D-36); `communityAccess` and `groupAccess` move from "deadline" to per-game kickoff; the old `PicksDue` card treats an unknown state as closed. RULES.md visibility and analysis-access rows.
- Deploy order: Pages first (reads both shapes), then `gtl-api`.
- Tests: `normalize` keeps null (the DP-1 probe as a test); `community-cloud`; `community.spec.js` and `community-history.spec.js` on `HOSTED`; phone persona.
- Everyone sees: "—" for a player with no ballot; separate Spread and Total order; picks open game by game at kickoff. Release note: board numbers now grow during the week.

**18. Sent picks final in SQL (M-02)**
- Goal: once a market is sent, no pick in it can change or be added, through any writer.
- Scope: `gtl_mutate_personal`, `gtl_save_weekly_ballot` and the `gtl_guard_fresh_submission` trigger refuse any change to `picks` after `submittedAt` with `GTL_BALLOT_LOCKED` (409, "Sent picks are final."). Still allowed: D-27 pending-line resolution and the D-25 ruled import. Stored `submittedAt` and old `ballot_edited` events stay. New `gtl_live_rules()` returns `{sentFinal: true, lateWindow: 'deadline', revealAt}`, with `revealAt: 'kickoff'` once M-01 is applied, else `'deadline'`. Mirror in `server/engine.mjs` `saveBallot`; the new copy in `SAFE_VALIDATION_ERRORS` and `cloud/personal.mjs`, deployed before the apply. The PR lists all four ballot triggers (`gtl_fresh_submission_guard`, `gtl_feed_on_ballot`, `gtl_optout_ballot_guard`, `gtl_ballot_window`) as changed or unchanged. RULES.md "Drafts and submission"; AGENTS.md pointer updated.
- Window: after a Thursday deadline and before Monday 00:00 PT, so the next week opens under D-37. First window Fri Oct 16 to Sat Oct 17 if ready; else Fri Oct 23 to Sat Oct 24.
- Tests: SQL `guess-write-rules-sql` (refused through both RPCs and a direct update; adding a pick to a sent market refused per Q1; pending resolution allowed; ruled import unchanged; old edited ballots score the same); a scheduled collection that resolves a pending line on a sent ballot commits; update `fresh-submission-handler`, `submission-scoring-sql`, `submission-scoring-local`, `submission-line-at-guess-sql`, `line-at-guess-sql`, `engine`, `store` and `http`.
- Everyone sees: stage 15's screens switch on; a direct edit call is refused.

**19. Skip and "See picks now" (M-03)**
- Goal: one final way to sit out the rest of a week's Guess the Line, with its reason kept (D-36, D-23).
- Scope: append-only `gtl_week_forfeits` (reason `skip` or `reveal`, modes, time; insert-only grants; RLS on); `gtl_forfeit_guess_week` writes a `gtl_weekly_optouts` row for every unsent market, the forfeit row and an audit row in one transaction, idempotently; `gtl_read_forfeit`. `POST /community/forfeit`. `/community/read` adds `forfeit` through the optional-RPC wrapper. The old `/community/sit-out` keeps its rule. Off switch on the writer.
- Tests: SQL `guess-forfeit-sql` (skip and reveal; both markets at once; a sent market keeps counting; idempotent; `gtl_guard_optout_ballot` refuses later writes; the window per Q2); `push-reminders-forfeit-sql` (always runs: PGlite has the push file); a handler test; `/community/read` unchanged with the RPC missing.
- Sean sees: nothing until stage 30.

**20. Old Virtual Units line lock**
- Goal: close the first old route that gives out lines before a send (D-36 already requires it).
- Scope: `decorate` in `cloud/virtual-units.mjs` drops offers and consensus for a locked market and adds `locked`; `/virtual-pick` refuses a locked market with `GTL_LINE_LOCKED`, mapped in the same deploy. The gate uses the published community week, not the group's week. Own bets always show full terms. `VirtualUnits.jsx`: "Submit your Spread picks to see this.", plus a line that other players' bets become visible any time (live before M-10). RULES.md.
- Tests: the leak scan on `/virtual-units` before a send; numbers appear after a send, sit-out, forfeit or kickoff; a case where the group week and community week differ; own entries never redacted; `virtual-units.spec.js` on `HOSTED`.
- Everyone sees: the lock sentence until the market is sent. No migration: the deploy makes it live.

**21. Real slips line lock (M-04)**
- Scope: `gtl_read_social` returns a per-viewer `gate` (from `gtl_markets_visible`). `project()` in `cloud/social.mjs` redacts locked legs of other players' slips and refuses Tail while locked; without the gate it keeps today's behavior. Own slips never redacted. `SocialBetTracker.jsx` and `SocialDashboardCard.jsx` show a locked leg and disable Tail; the tracker reads the current published week (DP-3). `docs/SOCIAL_BET_TRACKER.md`.
- Tests: `social-line-lock` leak scan; `social-cloud`; `social-sql`; `social-no-league.spec.js`; a before-apply run with M-04 left out.
- Everyone sees: locked legs until the market is sent; the tracker opens on the current week.

**22. Monday-night lines (M-05)**
- Goal: after the next week opens on Monday, the Monday night game keeps a fresh line and gets a kickoff line, so late Monday picks score against a current line (D-27, D-36) and Sharp can grade it.
- Scope (as built): the scheduled and commissioner collections also collect the previous published week's games that have not kicked off. A new `gtl_odds_carryover_slate` lists them; `gtl_begin_odds_collection`, `gtl_finish_odds_collection` and `gtl_begin_submission_odds_collection` are replaced (section 5, rule 9) to hand them to the adapter after the newest week's games and to store them as a snapshot of their own week. The two slate resolvers, `gtl_odds_collection_slate` and `gtl_odds_schedule_slate`, stay unchanged, because `gtl_claim_odds_refresh` compares their game count with the schedule row. Same provider calls and markets, no extra credits. If that is not possible at zero extra credits, stop and ask Sean.
- Deploy before the apply: `gtl-api` and `gtl-odds-refresh` with this stage's adapter. The adapter before it refuses a team that appears twice, so every Monday collection would fail with `ODDS_SLATE`, store no lines and still hold its two-credit reservation. Gate M step 2 checks that both deployed versions were built from a SHA that contains this stage.
- Tests: the same number of provider requests and markets per collection; the Oct 12 `slate_changed` case stays green; 50 draft autosaves start 0 collections; late sends never pass 6 collections a UTC day; a static check that no new module calls the provider or the collect RPCs. After the apply, the next scheduled collection succeeds, and on the first Monday after it a scheduled collection writes the carried game's snapshot (a `collect` row with `reserved_credits` 0 and `diagnostics.carryoverOf`); weekly, copy the remaining-credit count into the release record.
- Sean sees: Monday night lines stay fresh on Monday.

**23. Lines reader (M-06)**
- Goal: the only safe way to read current lines, gated per market and per game.
- Scope: `gtl_read_lines` (per game and market: `visible`, then value, `capturedAt`, `observedAt`; his own rows; finals); `gtl_read_game_lines` (named books with prices, movement, kickoff line); helpers `gtl_book_quotes_from_snapshot` and `gtl_kickoff_line` (the newest qualifying snapshot within 12 h before kickoff, else none; no new collection). Uses only `gtl_line_from_snapshot`; never raw payloads or provider ids. `cloud/lines.mjs` drops every key under a locked market even if SQL sent one. `POST /lines/read`, `POST /lines/game`. RULES.md "Current consensus"; `docs/TRENDS.md`.
- Tests: SQL `lines-sql` (no value key before a send; Spread open while Total stays locked; open after a sit-out or forfeit; one game opens at its kickoff; newest qualifying snapshot; a 2-book snapshot is skipped; the kickoff-line rule; non-members and anon refused; no payload); handler `lines-cloud`; the leak scan adds `/lines/*`.
- Sean sees: nothing until stages 32 and 33.

**24. Picks close at each kickoff (M-07)**
- Goal: each game's pick closes at its own kickoff; a pick sent after the deadline carries a stored Late marker (D-36, D-30, D-37).
- Scope: helper `gtl_guess_game_open`. The writers and the guard refuse only changes to started games. A full ballot means every still-open game has a pick. A draft value for a started game stays where it is; the send records `closedAtKickoff: [gameIds]`, which the scorer skips (never moved, never shown to others; the owner sees it in History). `ballot.late = {deadline, minutes}` is set on a send after the deadline, recomputed and checked by the trigger, and copied to the audit and to the post `gtl_feed_on_ballot` writes. `gtl_live_rules()` returns `lateWindow: 'kickoff'`. Engine mirror. `GTL_GAME_CLOSED` mapped and deployed before the apply. All four triggers listed. RULES.md "Weekly pick window" and "Exceptions" (the 15-minute window and D-31's late-window guard are withdrawn); release steps in `docs/SOCIAL_COMMUNITY.md`.
- Window: Tue–Wed, alone, the same day stage 25 is live. Never Thu–Mon.
- Tests: SQL `guess-write-rules-sql` (drafts after the deadline for open games; a started game refused; a started game the client left out keeps its value; a full open ballot required; late minutes stored; a forged `late` refused; old edits score the same); a late send passes all four triggers; `gtl_guard_optout_ballot` still refuses after a skip; a scheduled collection resolving a pending line commits on a ballot with no `late` key, on a late ballot and on a ballot whose other market was forfeited; Nov 1 fixtures; the odds cap.
- Everyone sees (with stage 25): late picks in both apps.

**25. Old app: late picks until kickoff**
- Scope: `picksDue()` in `cloud/community.mjs` reads `rules.lateWindow` (a `late` state, `openGames`, `nextKickoff`, `closed` only when no game is open). The old Community Picks (`WeekPicks`), `PredictionEntry.jsx` and `PersonalWorkspace.jsx` go per game: "Closed at kickoff", the Late marker, no "extensions need commissioner review" (DP-22). Push text per Q9: stage 2 already says "due" and names the markets still open ("Spread still open."); stage 25 counts the games still open, as D-39's example does ("Week 6 picks are due 5:15 PM PT. 9 games still open."), and rewords the old app's reminder copy that still says "before picks lock" (`REMIND_LABEL`, the Pick reminders panel, and the Settings checklist's Notifications row, which also reads "Opt-in" while `pushConfigured` is false).
- Deploy before or with the M-07 apply; nothing changes until the rules reader says `kickoff`.
- Tests: after-deadline cases in `prediction-*` and `community.spec.js`, built relative to the real now (database triggers keep the real clock): deadline now − 1 h, game A kicked off now − 30 min, game B kicks off now + 2 h, away from midnight UTC; phone persona.
- Everyone sees: after Thursday's deadline, open games can still be picked and show "Late".

**26. Everyone's picks reader (M-08)**
- Scope: `gtl_read_guess_picks(user, season, week, mode, game, target, now)`: per member, their status (in, not yet, sat out, late); their pick only when M-01's gate allows; from kickoff the error, points, shared rank and the closest flag. `POST /community/picks`.
- Tests: SQL `guess-picks-sql` (the leak scan finds no pick for an unrevealed game; one kickoff opens one game; the late flag); a handler test.

**27. Private notes server (M-09)**
- Scope: `gtl_read_game_notes`, `gtl_set_game_note` (up to 2,000 characters; an old note is never cut; the `saved` flag kept; each change audited and bumps the shared revision). `POST /personal/notes`, `/personal/note`.
- Tests: SQL `game-notes-sql`; handler `personal-workspace`; no other user can read a note.

**27a. Old app: Save keeps a stored note (M-29, D-40)**
- Goal: under D-40 a note written in the new app never makes the game a Favorite, and the old app's Favorites tab lists saved games only. Its "Save to Favorites" button sends an empty note, which until now replaced a note already stored for the game (also after a game was removed from Favorites and saved again).
- Scope: replace `gtl_mutate_personal` (same argument list; only the `favorite/set` branch changes): a save that takes a game from not saved, or no row, to saved and sends an empty note keeps the stored note, exactly as stored. Every other save writes the note it sends, so an edit of a saved game's note to empty still clears it. One audit row per save with before and after; receipts, request-id replay and revision conflicts unchanged; no new error code. No gtl-api or Pages change. Works with or without M-09. `supabase/rollback/` restores the previous body.
- Tests: SQL `favorite-keeps-note-sql` (every save compared with the previous body; retries, conflicts, the audit, the route); `personal.spec.js` on `ALL` (a game removed and saved again, and a note on a game never saved).
- Everyone sees (after M-29): a note comes back when its game is saved again.

### Phase 3: Play, Home, Lines and Me come alive

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 28 | Play board and drafts | B | — | 11 | — |
| 29 | Play submit, sent is final | B | — | 28 | M-02 |
| 30 | Play late card, skip, who's in, how to play | B | — | 29, 19 | M-03 (late states with M-07) |
| 31 | Everyone's picks and your pick sheet | B | — | 30, 26 | M-08 |
| 32 | Edge board and results | B | — | 29, 23 | M-06 |
| 33 | Lines: line now and gate banner | D | — | 13, 23, 30 | M-06 |
| 34 | Game sheet in full | D | — | 33, 31 | M-06, M-08 |
| 35 | Notes in the game sheet | D | — | 34, 27 | M-09, M-29 |
| 36 | Home: next action, first run, other weeks | A | — | 12, 29 | — |
| 37 | Me: menu and Settings | A | — | 11 | — |
| 38 | Me: info pages | A | — | 37 | — |
| 39 | Me: reminders and install | A | — | 37, 2 | — |

**28. Play board and drafts**
- Scope: `web/src/next/play/*`: Spread | Total switch; "6 LEFT TO PICK"; the Up next card with chips (the `ChipPicker` logic); drafts that save themselves (debounced, one at a time, never retried blindly); still-to-pick and Picked rows. No submit yet.
- Tests: node `play-market` (market state, auto-advance); Playwright 390 `next-play-drafts.spec.js` (chip entry; a reload keeps drafts).
- Sean sees: he drafts real picks in the new app.

**29. Play submit, sent is final**
- Scope: Review & submit; the save moment; "Sent picks are final."; no "Change pick"; a 409 that keeps the typed values. Home's lime action now opens Play. `clearNextDrafts()` covers Play.
- Tests: vitest review sheet; Playwright 390 `next-play-submit.spec.js`; axe. Personas `phone` and `impatient` gain a `next` project (the `classic` project keeps running until stage 81).
- Sean sees: he sends real picks in the new app.

**30. Play late card, skip, who's in, how to play**
- Scope: the late card when `picksDue.state = late`; Closed rows; one `ForfeitDialog` for skip and "See picks now" (`/community/forfeit`), with its warning; the Who's in sheet; How to play (one owner, linked from Me), worded for D-35 to D-37. Late states show only when `rules.lateWindow = kickoff`.
- Tests: Playwright 390 `next-play-late.spec.js` (late flow on real-now fixtures; the skip warning; How to play).

**31. Everyone's picks and your pick sheet**
- Scope: `EveryonePicks` with the strip and "See picks now" (the game sheet reuses it); `sh.yourPick` with "Line at your guess", "First line after submission" or "Line pending" (D-27), game info and everyone's picks for that game; Late on every pick.
- Tests: Playwright 390 `next-everyone.spec.js` (no pick before the reveal, checked on the network; "See picks now" warns then forfeits; Line pending).
- Sean sees: friends' picks after he sends.

**32. Edge board and results**
- Scope: each pick with "Line now" and the gap; the Biggest gap sort (`/lines/read`); from kickoff, points, "Closest", "Tied closest" and Bullseye. Fixes DP-8, DP-9, DP-10, DP-12.
- Tests: node Biggest gap sort; Playwright 390 `next-edge.spec.js` (no "Line now" before a send, on the network; points only from kickoff); persona `power` gains a `next` project.
- Sean sees: the Edge board after he sends.

**33. Lines: line now and gate banner**
- Scope: the middle line ("SEA −3") with "Updated … PT", or "Latest line" when older than 6 h; one gate banner per screen ("Finish Total picks", skip through `ForfeitDialog`); LIVE NOW and FINAL rows; the Late prefix on tags; the later-update footer goes. `/lines/read` without a week reads only the newest published week, so on a Monday last week's unstarted game is read with its own season and week.
- Tests: Playwright 390 `next-lines-gate.spec.js`: the leak scan at four moments (before a send; after the deadline with no ballot, before a Sunday kickoff; Spread sent, Total not; after "See picks now") across `/lines/*`, `/virtual-units`, `/community/history` and `/community/read`.
- Sean sees: live lines after he sends a market.

**34. Game sheet in full**
- Scope: the line card; Book lines with the Best marker from `shared/best-offer.mjs`; movement (DP-26); `EveryonePicks`; the All trends sheet; the referee look-up; the action bar from tab slots (Bet appears with stage 44, Challenge with 54); League bets from the Bets slot after M-10.
- Tests: vitest `next-lines-ui` (a lock is an icon, a missing value is "—"); Playwright 390 `next-game-sheet.spec.js`.

**35. Notes in the game sheet**
- Scope: the note in `GameSheet.jsx`, labelled "Only you see this." Each note keeps its own `revision` from the `/personal/notes` and `/personal/note` replies (a save that changes nothing answers with the note's revision, not the shared one).
- Tests: Playwright 390 `next-notes.spec.js` (survives a reload; another user never sees it).

**36. Home: next action, first run, other weeks**
- Scope: the hero's one next action (the first true row wins); the first-run card; "Keep your 4-week streak" from pure `shared/game-features/streaks.mjs` (a skip breaks it; a late send counts; a week closes at its last kickoff); the one-time "Remind me" when `pushConfigured`. States beyond the prototype moments: Sunday night ("Week 7 opens Mon 12:00 AM PT"), Monday with two weeks open, no week published, after Week 18.
- Tests: node `home-next-action` (M1 to M8 plus the four states), `streaks`; Playwright 390 `next-home-actions.spec.js` with a fresh account; personas `first-timer` and `confused` gain a `next` project.
- Sean sees: Home tells him the one thing to do next.

**37. Me: menu and Settings**
- Scope: the menu; display name through `/profile` (60 characters; existing names are never cut, D-23); Appearance; Reduce motion; Use the old app; Sign out.
- Tests: node `next-me-menu`, `next-settings-model`; vitest; Playwright 390 `next-me.spec.js`; axe.

**38. Me: info pages**
- Scope: Data sources (only real, free sources, credits from `shared/trends-view.mjs`, research links, the Open-Meteo attribution); About and the legal links once #62 merges; "More sports, coming soon" with Notify me (`/community/interest`). Fixes DP-19, DP-24.
- Tests: node `next-data-sources`; Playwright 390 `next-info.spec.js`.

**39. Me: reminders and install**
- Scope: pick reminders only when `pushConfigured`, with the iOS 16.4 and Home Screen note (D-28); Install app; move `usePushReminders` to a module with no CSS.
- Tests: node `next-push-state` (nothing fetched before the tap); Playwright 390; personas `motor` and `low-vision` gain a `next` project.

### Phase 4: Bets and challenges

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 40 | Bets read | C | M-10 | 16, 20, 4 | M-01, M-04 |
| 41 | Bets place | C | M-11 | 40 | Tue–Wed |
| 42 | Bets boards and season | C | M-12 | 40 | — |
| 43 | Bets: Place board | C | — | 11, 40 | M-10 |
| 44 | Bets: slip and placing | C | — | 43, 41 | M-11 |
| 45 | Bets: My bets | C | — | 44, 42 | M-12 |
| 46 | Real slips: list, tail, follow, post | C | — | 43, 21 | M-04; Q6 |
| 47 | Real slips: full tracker and past weeks | C | — | 46 | — |
| 48 | Feed kinds | E | M-13 | 3 | Tue–Wed |
| 49 | Tester list | E | M-14 | 4 | Q5 |
| 50 | Challenge core | B | M-15 | 41, 48, 49 | Tue–Wed; Q7 |
| 51 | Challenges in records | B | M-16 | 50, 42 | M-15 |
| 52 | Bet sharing | C | M-17 | 41, 48, 49 | — |
| 53 | Challenges: inbox and answers | C | — | 45, 50 | M-15 |
| 54 | Challenges: composer | C | — | 53, 34 | M-15 |
| 55 | Settle challenges | B | M-18 | 50 | Tue–Wed after Monday is settled |
| 56 | Scheduled settlement | B | M-19 | 55 | M-18 |

**40. Bets read (M-10)**
- Goal: Bets reads the published community week for every player in every league.
- Scope: `gtl_bets_context`; `gtl_read_bets` (own bets; league members' bets visible any time with line terms redacted by the viewer's gate, own never; faces per game; qualification from book bets; revision from a new, empty `gtl_bet_versions`); `gtl_read_bets_market` (offers through the same gate). `cloud/bets.mjs`; `POST /bets/read`; membership means community membership. RULES.md Virtual Units rows; `planning/virtual-units-game.md` with its Brand QA assertion in the same PR.
- Tests: SQL `bets-read-sql` (a community-only player gets a week; the same bets show in two leagues; a non-member is off the roster); `bets-line-lock-sql`; handler `bets-cloud`.
- Release note: others' Virtual Units bets are visible any time (D-36).

**41. Bets place (M-11)**
- Goal: place one or more bets at once, with receipts and the line lock, and no 409s from Play's autosave.
- Scope: `gtl_bet_receipts`; `gtl_place_bets` with row locks (membership, kickoff, a saved named-book quote, the line lock, half units); edits until kickoff with a full audit; each edited row's stored terms are checked against what the client read, so an old-app change gives 409 "This bet changed"; request-id replay. The old group path keeps writing the same rows. `POST /bets/place`. Off switch.
- Tests: SQL `bets-place-sql` (place and edit; refused at kickoff and while locked; a Guess autosave between read and place gives no 409; an old `/virtual-pick` edit then a new place on one row gives 409; replay).

**42. Bets boards and season (M-12)**
- Scope: `gtl_read_bets_board` (qualified players by ROI, then net units, then wins; T-2; ROI "—" until something settles; that league's roster; real slips never count); `gtl_read_bets_season` with `p_who`; pure `shared/bets-qual.mjs`. `POST /bets/board`, `/bets/season`.
- Tests: SQL `bets-board-sql` (order, ties, unqualified weeks left off, season list, roster filter); node `bets-qual`; JS and SQL parity on one fixture; handler tests for both routes.

**43. Bets: Place board**
- Scope: `web/src/next/bets/*`: the section switch (Place, Challenges, My bets, Real slips); market rows with the best named-book prices; one gate banner; his tags; friends' faces per game; BET tags on Lines cards through the Bets slot ("BET +3 · 2U"; a locked market shows "BET 1U"). Fixes DP-5, DP-20.
- Tests: Playwright 390 `next-bets-board.spec.js` (empty state at M1; banner at M2; a locked tag has no line; faces).
- Sean sees: the Bets tab.

**44. Bets: slip and placing**
- Scope: unit chips 0.5 to 3U and a stepper above; Place; edit until kickoff; "price moved"; the Bet button through the game-sheet slot; `clearNextDrafts()` covers the slip.
- Tests: Playwright 390 `next-bets-place.spec.js` (two bets; an edit; a started game; a finished game; "This bet changed").
- Sean sees: he places real Virtual Units bets.

**45. Bets: My bets**
- Scope: the week card (OPEN · IN PLAY · TO WIN, then RECORD · UNITS · RETURN); the "3 bets or 3U" meter; open and settled lists; "Results from final scores · last update …"; the Season sheet; the Bets streak; `sh.bet` (terms, history in words, a Post to feed slot); the Home Bets tile through the slot. Fixes DP-21.
- Tests: node meter on `bets-qual.mjs`; Playwright 390 `next-bets-mine.spec.js` ("1 of 3", "2U of 3U", qualified; Season sheet).

**46. Real slips: list, tail, follow, post**
- Scope: `web/src/next/bets/RealSlips.jsx` over `/social/*` as it is: list and detail; Tail with a confirm (book, odds, stake); Follow; Post a slip; the "Real slip" pill; "GTL never moves money"; the current published week; stakes per Q6.
- Tests: Playwright 390 `next-real-slips.spec.js` (locked legs; the tail sheet; follow; post; current week).

**47. Real slips: full tracker and past weeks**
- Scope: what today's tracker does ("as today", D-36): Report result (it makes the feed post); correct a slip (`/social/correct`); parlays of 2 to 20 legs; notes (Sean's Novig slips keep "$50 risked"); who tailed; the late flag; history in plain words (DP-15); the form refuses a line-locked market; a week picker so Week 5 slips stay readable.
- Tests: Playwright 390 `next-real-slips-full.spec.js` (a parlay; report; correct; Week 5 readable).

**48. Feed kinds (M-13)**
- Scope: swap the `gtl_feed_posts` kind check once, to the final list: the old five plus `bet_shared`, `challenge_offered`, `challenge_matched`, `challenge_settled`, `kickoff`, `bets_week_settled`, `badge_earned`, `streak_milestone`, `weekly_recap`, `result_shared`, `season_champion`; a nullable `league_id`. No row changes. Idempotent (`drop constraint if exists`). Expect an MCP confirmation prompt, so Sean is present or uses the SQL editor.
- Tests: SQL (every old row stays valid; each new kind inserts; the old `normalize()` ignores unknown kinds; all migrations apply in order).

**49. Tester list (M-14)**
- Goal: before the flip, nobody creates an entry the old app cannot show (D-23).
- Scope: `gtl_app_testers` (commissioner-managed, add and remove events, nothing deleted); `gtl_app_settings.new_social_open` (false); `gtl_new_social_allowed(user, target)`. Challenge send and accept, bet sharing and reactions other than the heart need both sides on the list until stage 80 opens them. "Everyone" challenges stay off until then. Testers also see "Try the new app".
- Tests: SQL `app-testers-sql`.

**50. Challenge core (M-15)**
- Scope: `gtl_challenges` (one open challenge per sender, game and market; a unique request id; no delete grant); `gtl_send_challenge` (the book line comes from the server; the Q7 line limit and hedging rule); `gtl_answer_challenge` (row lock; the first commit wins); edit or cancel until accepted, nothing after; `gtl_read_challenges` inside `/bets/read` (waiting, open, yours, past; the series against each member; terms redacted per viewer, own never); expiry at kickoff; removing a member cancels their open challenges ("cancelled · member removed") while accepted ones still settle; Giant Slayer facts saved in the audit; post triggers that never block the write (errors go to an audit row). `POST /challenges/send`, `/challenges/answer`.
- Tests: SQL `challenges-sql` (each refusal code; replay; the server's book line; two accepts at once, one wins; cancel after accept refused; accept at kickoff or while locked refused; expiry checked 1 s either side; one post per event; member removal; the tester gate).

**51. Challenges in records (M-16)**
- Scope: `gtl_read_bets` and the Bets board count accepted challenges toward qualification and records (D-36). Void credit per Q7.
- Tests: SQL (2 bets plus 1 accepted challenge qualifies; an open one does not); parity with `bets-qual.mjs`.

**52. Bet sharing (M-17)**
- Scope: `gtl_share_bets` and `bet_shared` posts; `POST /bets/share`; "Post to feed" on the slip toast and `sh.bet`; the tester gate.
- Tests: SQL (one post per share); Playwright 390.

**53. Challenges: inbox and answers**
- Scope: inbox, open to the league, yours; the VS accept dialog ("IT'S ON"), pass, cancel and hide (hide is per device); race and "withdrew" toasts; `sh.pastChallenges` and `sh.openAll`; the Home waiting row and the Bets counter through slots.
- Tests: Playwright 390 `next-challenges-inbox.spec.js` (accept, pass, cancel, the race message, expired).

**54. Challenges: composer**
- Scope: the composer (game, side at the best book line, Change line within the limit, units, a friend or Everyone); the Challenge button through the game-sheet slot; Rematch prefill.
- Tests: Playwright 390 `next-challenges-send.spec.js`.
- Sean sees: he can challenge his tester friend.

**55. Settle challenges (M-18)**
- Scope: `gtl_settle_virtual_units` grades accepted challenges in the same transaction and ledger version as book bets: even money; a push or void returns both stakes; corrections re-grade and keep `previous`. `summarizeSettlement` in `cloud/virtual-settlement.mjs`; the old "Settle finals" notice shows challenge counts.
- Window: after the commissioner settles the week, with no scheduled settlement on. Right after, rerun settlement for the last settled week and expect zero new versions.
- Tests: extend `virtual-units-settlement-sql` (win, loss, push, void; a corrected final flips and keeps `previous`; a rerun changes nothing); Playwright settled challenge.

**56. Scheduled settlement (M-19)**
- Scope: one disabled schedule row, a runs table, a dispatcher that makes no network call unless a run is due, claim and complete, a status reader; `supabase/functions/gtl-virtual-settle` and `cloud/virtual-settle-run.mjs` (the `week-open.mjs` pattern); the cron only in `supabase/admin/virtual_settlement_cron.sql` (every 30 minutes, disabled). The free nflverse file only.
- Approval: Sean registers and enables the cron after a live dry run.
- Tests: SQL `settlement-schedule-sql` (not due, no run; due, one run; the claim token; expiry); node with a fake fetch.

### Phase 5: League and social

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 57 | League boards server | E | M-20 | 16, 4 | M-01 |
| 58 | League: Guess board | E | — | 57, 12 | M-20 |
| 59 | League: members, invites, create, join | E | — | 58 | — |
| 60 | League: Bets board panel | E | — | 58, 42 | M-12 |
| 61 | Reactions, append-only | E | M-21 | 16, 49 | M-01, M-14 |
| 62 | League feed reader and comments | E | M-22 | 48, 61, 21, 26 | M-13, M-21, M-04, M-08 |
| 63 | Kickoff posts | E | M-23 | 48, 16 | Tue–Wed |
| 64 | Feed: posts, digest, comments | E | — | 62 | M-22 (M-23 for kickoff posts) |
| 65 | Feed: reactions | E | — | 64 | M-21 |
| 66 | Feed: embeds and post actions | E | — | 65, 52, 53, 46 | M-15, M-17 |
| 67 | Player sheet and head-to-head | D | M-24 | 57 | M-20 |
| 68 | Badge and award logic | D | — | 7 | — |
| 69 | Game features server | D | M-25 | 68, 48, 23 | M-13, M-06 |
| 70 | Game features schedule | D | M-26 | 69 | M-25 |
| 71 | Game features UI | E (A overlays) | — | 69, 58 | M-25 |

**57. League boards server (M-20)**
- Scope: `gtl_league_roster`, `gtl_league_member`; `gtl_read_guess_board` (Spread and Total apart; Week or Season; points from kickoff; T-2 on the precision the row shows; the Community or group roster; removed members kept, with a flag and their rank); `gtl_read_my_leagues` (member counts, host, three faces, his ranks); `gtl_read_league_members`. `cloud/league.mjs`; `POST /league/list`, `/league/members`, `/league/board`. RULES.md boards and ties rows.
- Tests: SQL `league-board-sql` (boards differ and nothing is summed; ties; points from kickoff; group boards hold members only; a non-member gets 403; a removed member is listed); parity with `shared/guess-board.mjs`; handler `league-cloud`.

**58. League: Guess board**
- Scope: Spread | Total and Week | Season; Who's in before the first kickoff; the About ties sheet (the old tiebreakers as context); the footer. Group boards use the one Community scoring function (D-27), so Week 5 group numbers can differ from the old Duel screen (release note). Fixes DP-1, DP-2, DP-9, DP-11.
- Tests: vitest `leagueModel`; Playwright 390 `next-league-board.spec.js` (boards differ, no sum; T-2; the toggle; a fixture group shows only its members).
- Sean sees: the League tab boards.

**59. League: members, invites, create, join**
- Scope: switcher rows with faces and ranks; members; invite (host only) with the invite list, status, expiry and Revoke (`/invites`, `/invite/revoke`), plus "New link" (old links can't be shown again); create a league; join with a link. The practice switch is hidden (picks are per account).
- Tests: Playwright 390 `next-league-members.spec.js`.

**60. League: Bets board panel**
- Scope: the Bets board from `/bets/board` in the League tab.
- Tests: Playwright 390 `next-league-bets.spec.js`.

**61. Reactions, append-only (M-21)**
- Scope: `gtl_feed_reaction_events` (each person's latest event wins; an old like reads as a thumbs up); `gtl_react_feed` (six fixed keys); a new `gtl_like_feed` body that adds an event instead of deleting; `gtl_read_community` counts current reactions for the old heart (copies M-01's body; any reaction counts as a like). `POST /league/react`; `/community/like` keeps working. Non-heart reactions use the tester gate until the flip.
- Tests: SQL `feed-reactions-sql` (an unlike keeps a record; one current reaction per person; a bad key refused); the heart in the old `community.spec.js`.
- Everyone sees: no change to the old heart.

**62. League feed reader and comments (M-22)**
- Scope: `gtl_read_league_feed` (a league filter; per-viewer gates on every embed: picks, the line lock, real-slip legs; reaction summaries; the newest two comments; keyset paging on `(created_at, id)`); `gtl_read_post_comments`, `gtl_read_post_reactors`; a new `gtl_comment_feed` with league scope that accepts comments only on posts visible now; `gtl_share_result`. Group recap posts show only to that group (RULES.md: group standings stay private); a challenge's record stays visible to every member (D-36). `POST /league/feed`, `/league/comments`, `/league/reactors`, `/league/share-result`.
- Tests: SQL `league-feed-sql` (the leak scan finds no hidden pick or line in any embed; group posts for members only; paging when posts share a timestamp); a handler test.

**63. Kickoff posts (M-23)**
- Scope: a `gtl_feed_on_slate` trigger writes one `kickoff` post per time slot, dated at its kickoff and shown once that time passes. The actor is the week's publisher (as `week_published` does), shown as "Guess The Line" with the monogram. An error never aborts the slate publish; it is logged to an audit row. A one-time backfill for the current week, idempotent by `dedupe_key`.
- Window: Tue–Wed, alone. A read-only dry run lists the exact posts first; counts before and after; check the next Monday `gtl_week_open_runs`.
- Tests: SQL (one post per slot; a rerun inserts nothing; nothing shows before kickoff; a Nov 1 fixture); the real `cloud/week-open.mjs` flow on PGlite.

**64. Feed: posts, digest, comments**
- Scope: `Feed.jsx`, `PostCard.jsx`, `DigestCard.jsx` (a folded card never hides a post with comments or reactions, and has a "show each post" path); every old kind (`joined`, `week_published`, `ballot_submitted`, `bet_posted`, `bet_settled`) and every old comment renders; kickoff posts and the game thread; `CommentsSheet.jsx` (1 to 500 characters, no edit or delete); `sh.picks` (one friend's picks); the new-posts dot (per device); Late on ballot posts. Fixes DP-25.
- Tests: vitest folding; Playwright 390 `next-feed.spec.js` (one post of each old kind in the live shape; a ballot post shows a lock row, then the picks after he sends; 500 characters post, the 501st is blocked).
- Sean sees: the League feed.

**65. Feed: reactions**
- Scope: `ReactionsPopover.jsx` (six emoji inside `data-emoji-ok`); `ReactorsSheet.jsx`; result sharing.
- Tests: Playwright 390 `next-reactions.spec.js` (a reaction changes and survives a reload; share result).

**66. Feed: embeds and post actions**
- Scope: embeds for shared bets, challenges and real slips, with the lock; actions: Rematch, "Bet against {name}", "Take ARI +12.5", and Tail on real slip posts (D-36). Rematch and "Bet against" open the composer prefilled.
- Tests: Playwright 390 `next-embeds.spec.js` (embeds locked before a send; each action opens the right sheet).

**67. Player sheet and head-to-head (M-24)**
- Scope: season stats; the Guess head-to-head (closest, as W-L-T); the challenge series row from M-15's reader; `PlayerSheet.jsx`; the Profile row in Me opens your own sheet. `POST /league/player`.
- Tests: SQL `player-card-sql`; node `h2h`; Playwright 390 `next-player.spec.js`; the leak scan adds `/league/player`.

**68. Badge and award logic**
- Scope: pure `shared/game-features/{badges,awards}.mjs` with fixtures. Sharp and Called the Move use the kickoff-line rule and skip a game without one.
- Tests: node `badges` (one fixture per badge; no kickoff line, skipped); `awards` (each award and tie-break; an award with no entry is hidden; real slips ignored); streak-input parity with stage 36.

**69. Game features server (M-25)**
- Scope: append-only `gtl_badge_events` with `visible_at` (a correction adds a `removed` event); versioned `gtl_weekly_awards`; `gtl_read_feature_inputs`; idempotent `gtl_record_feature_results`; weekly and season winners for Spread, Total and Bets ("Decided after Week 18" until then), which writes `season_champion`; `cloud/league-features.mjs`; a commissioner "run now" (`POST /league/features/run`). Challenge badges wait for stage 55.
- Tests: SQL `game-features-sql` (the writer is idempotent; a corrected final adds `removed` and deletes nothing).

**70. Game features schedule (M-26)**
- Scope: a disabled schedule and a runs table; dispatcher, claim and complete; `supabase/functions/gtl-league-features`; the cron only in `supabase/admin/league_features_cron.sql` (every 15 minutes, disabled).
- Approval: Sean enables it after a live dry run.
- Tests: SQL (off by default; two claims give one run).

**71. Game features UI**
- Scope: the badge shelf and badge detail; the awards sheet; the weekly recap card and the Home recap row (slot); streak rows on boards and the player sheet; celebrations: the Bullseye flash, a bet won, a challenge won, New results, the weekly reveal (`ov.reveal`), and the rank toast ("You passed Kenny · now #2 on the Spread season board") from `shared/guess-board.mjs` movement; weekly and season winners in History.
- Tests: Playwright 390 `next-features.spec.js` (no recap card before the job has run, and no sample text; badge detail; reduced motion skips the animations).
- Sean sees: badges, awards and the weekly recap.

### Phase 6: History, export, sign-in and commissioner tools

| # | Stage | Lane | Migration | Build after | Live after |
|---|---|---|---|---|---|
| 72 | History server | A | M-27 | 16, 4 | M-01, M-03 |
| 73 | History: Guess and Bets weeks | A | — | 72, 42, 37 | M-27 |
| 74 | History: older records | A | — | 73 | M-27; Q8 |
| 75 | Export my data | A | M-28 | 72 | M-27 |
| 76 | Sign-in skin | A | — | 11 | — |
| 77 | Commissioner tools page | A | — | 37 | — |
| 78 | Native commissioner pages | A (any idle lane) | — | 77 | — |

**72. History server (M-27)**
- Scope: `gtl_read_ballot_changes`: your own changes with before and after values in plain words, for markets already sent or past kickoff, never another player's (D-16). `gtl_read_me_records`: Betting Challenge selections graded by the old engine, any player's after kickoff (D-21); saved games and notes; personal forecasts; the private journal; forfeit records; closed-at-kickoff drafts. Private records go only to their owner. `cloud/me.mjs`; `POST /me/changes`, `/me/records`.
- Tests: SQL `me-history-sql`, `me-records-sql`; handler `me-cloud`; the leak scan adds both routes.
- Built October 26 (branch `claude/redesign-history`; not applied, not deployed): `20261026230000_gtl_me_history.sql` adds
  `gtl_read_ballot_changes` and `gtl_read_me_records` with two helpers, all service-only; nothing is replaced, so there is no
  rollback file. Choices the card did not spell out: closed-at-kickoff drafts are not repeated in `/me/records`, because
  `/community/history` (M-07) already gives the owner every draft with its kickoff and lock-in state; the forfeit reason
  (`skip`/`reveal`) stays the owner's own (another member reads "Sat out", as Home's who's in does); and `/me/records` also
  carries the older group scoring views (`gtl_prediction_archives`) and the Week 5 freeze record that stage 74 shows, since
  stage 74 has no migration of its own.

**73. History: Guess and Bets weeks**
- Scope: `web/src/next/me/history/*`: Guess weeks for any member (person chips; removed members listed) with the week detail; the Late pill; "Skipped" or "Saw picks early"; "Closed at kickoff · draft SEA −2.5 not sent" (owner only); "original time not recorded"; Bets weeks from `/bets/season` with `who`.
- Tests: Playwright 390 `next-history.spec.js` (Week 5: Sean 95.8, Steven 91.4, Ben 37.6; Steven's ruled-eligible spread and Ben's ruled lines labelled).
- Built October 26 with stage 72: `page.history` (Menu › History, `#history`, `#history/bets`), code loaded on open. Until
  stage 42's `/bets/season` exists, Bets weeks read `/bets/read` one published week at a time. The spec's Week 5 replay
  (`tests/cloud-browser/history-world.mjs`) uses the committed seed, eDraft pages and Ben's file; Steven's picks are
  fictional values chosen to reproduce the hosted 91.4.

**74. History: older records**
- Scope: Betting Challenge · retired (every player's record); saved games and notes; forecasts; the journal (Q8); the real slips record by week; older group scoring views (`gtl_prediction_archives`) as a read-only page with dates on every axis (DP-17); the Week 5 benchmark freeze record, read-only (DP-4).
- Tests: Playwright 390 `next-history-older.spec.js` (the Betting Challenge record matches the old screen).
- Built October 26 (branch `claude/redesign-history-older`, on stage 73's): History › Older (`#history/older`), read-only,
  from `/me/records` (M-27) and `/social/read`. The old screen's record is checked against `server/engine.mjs`'s Betting
  Challenge standings for the same selections and finals. The archived invalid-matchup predictions are not stored in
  `gtl_prediction_archives` (only their count, `archivedCount`, is), so the page shows the count as the old History page
  did; the predictions themselves stay in the committed `data/picks/2026-week-05.json`.

**75. Export my data (M-28)**
- Scope: `gtl_export_me` and `POST /me/export`: your own rows only, no push endpoints, Late marker included (D-30); a Settings row. It replaces the old group-week download.
- Tests: SQL own rows only; handler; the leak scan.
- Built October 26 (branch `claude/redesign-export`, on stage 74's; not applied, not deployed): `20261026231000_gtl_me_export.sql`
  adds `gtl_export_me`, service-only; nothing is replaced, so there is no rollback file. The row is in the Menu, after History,
  not inside Settings (`AccountPreferences.jsx` is outside this lane). NBA tickets are included through their own definer
  reader. Playwright `next-export.spec.js` downloads the file.

**76. Sign-in skin**
- Scope: AuthGate's logic moves into `useAuthSession()` and `useSignInForm()` with no change in behavior; `NextSignIn` (email, Google, recovery, resend, confirmation) on devices with `gtl.app = next`; the restyled name step (the logic stays in stage 11); legal links.
- Tests: vitest `next-sign-in` (the same Supabase calls as AuthGate); the old `auth`, `google-sign-in` and `onboarding` specs untouched and green; Playwright 390 `next-auth.spec.js`; performance: the chunk loads only with the flag.

**77. Commissioner tools page**
- Scope: `page.commish`, admin only, linking to the old screens: Week opening, Game referees, Settle bets and challenges (with the schedule status), Odds connection, Members (Remove and Restore, with the D-23 warning), Older tools (Final scores: "Never settles bets").
- Tests: Playwright 390 `next-commish.spec.js` (a member sees no row and gets 403 on a direct call; the admin sees each tool).

**78. Native commissioner pages**
- Scope: one PR per page, in this order: Members; Settlement and schedule status; Week opening; Game referees; Odds connection (counts only, never secrets); Final scores. All must be native before stage 81.
- Tests: one Playwright 390 spec per page; the old `publish`, `results` and `d23` specs stay green.

### Phase 7: cut-over

| # | Stage | Lane | Build after | Live after |
|---|---|---|---|---|
| 79 | Final phone-first sweep | all | every tab stage | all applies |
| 80 | New app becomes the default | A | 79 and the checklist | Sean's go |
| 81 | Retire the old app | A | 80 plus two full weeks | Sean's OK |

**79. Final phone-first sweep**
- Scope: every persona (`first-timer`, `phone`, `motor`, `low-vision`, `power`, `impatient`, `confused`) has a `next` project at 390; the `classic` project keeps running until stage 81. Axe on every tab and sheet in dark and light, at 390 and 320; keyboard paths; no side scroll anywhere; 44 px targets. Sean checks on his own phone with the real fonts.

**80. New app becomes the default** and **81. Retire the old app**: see section 10.

---

## 8. Lanes, waves and calendar

### 8.1 Build waves

Stages in one wave are built at the same time by different lanes. A wave ends when its PRs merge; within a wave, tooling merges first. Hosted applies follow the calendar, one at a time. After stage 4, each server stage edits its own route module and boundary file; the few edits left in `cloud/handler.mjs` (error lists) are small, and the later PR rebases.

| Wave | A: shell, Home, Me | B: Guess rules, Play, challenge server | C: Bets | D: tooling, Lines, features server | E: League, social |
|---|---|---|---|---|---|
| 0 | 2 | 1 | | | |
| 1 | 6 | 15, 16 | 14 | 3, 4 | 5, 7 |
| 2 | 8, 9 | 18, 19 | 20 | 22, 27, 27a | 48, 49 |
| 3 | 10 | 17, 26 | 21 | 23 | 57 |
| 4 | 11 | 24 | 40 | 68 | 61 |
| 5 | 12, 37 | 25, 28 | 41, 42 | 13 | 62, 63 |
| 6 | 38, 76 | 29 | 43 | 67 | 58 |
| 7 | 36, 39 | 30 | 44, 46 | 69 | 59, 60 |
| 8 | 72, 77 | 31, 32 | 45, 47 | 33 | 64 |
| 9 | 73 | 50 | 52 | 34, 70 | 65 |
| 10 | 74, 75 | 51, 55 | 53 | 35 | 71 |
| 11 | 78 | 56 | 54 | | 66 |
| 12 | 79 with every lane, and the real-data check | | | | |
| 13 | 80, after the checklist | | | | |

- First look: one Pages deploy after wave 5 (stages 2 and 6 to 13).
- Sean can send real picks in the new app after wave 6, and use Lines with live lines after wave 8.
- A lane that finishes early takes Sean's prototype markups or the next ready stage of another lane.

### 8.2 Target calendar for hosted applies

Superseded by D-39 ("asap"): kept only as a record of the safe windows. Targets only. Bold applies stand alone in their window. A slip moves everything after it.

| Week (deadline) | Applies | Notes |
|---|---|---|
| W6 (Thu Oct 15) | — | Stage 2 with the pending `main` deploy, done by Thu 12:00 PM PT or after Fri Oct 16. Earliest D-37 window: Fri Oct 16–Sat Oct 17, **M-02**, if stages 4, 15 and 18 are live. |
| W7 (Thu Oct 22) | Tue Oct 20 M-01 · Wed Oct 21 M-03, M-04, M-09 · Fri Oct 23–Sat Oct 24 **M-02** (if not done) | First-look Pages deploy. |
| W8 (Thu Oct 29) | Tue Oct 27 **M-05** · Wed Oct 28 M-06, M-08, M-14 | No time-math applies Sat Oct 31–Mon Nov 2. |
| W9 (Thu Nov 5) | Tue Nov 3 **M-07** (stage 25 live the same day) · Wed Nov 4 **M-13** · Fri Nov 6 M-10, M-12, M-20 | Late picks live for everyone (Q3). |
| W10 (Thu Nov 12) | Tue Nov 10 **M-11** · Wed Nov 11 M-21 · Fri Nov 13 M-22, M-27 | |
| W11 (Thu Nov 19) | Tue Nov 17 **M-15** · Wed Nov 18 M-16, M-17 · Fri Nov 20 M-24, M-25 | |
| W12 (Wed Nov 25) | Tue Nov 24 **M-18** (after Mon Nov 23 is settled) · Sat Nov 28 M-26, M-28 | Games Wed Nov 25 to Fri Nov 27. |
| W13 (Thu Dec 3) | Tue Dec 1 **M-23** · Wed Dec 2 M-19 | Last apply. |
| W14 (Thu Dec 10) | — | One full live week with everything on: the real-data check. |
| W15 (Thu Dec 17) | Flip target **Tue Dec 15** | Saturday games Dec 19. |
| W16–W17 | Latest flip Tue Dec 29 | Christmas Friday games. The regular season ends Sun Jan 10, 2027. |

---

## 9. Coverage

### 9.1 DASH work items

| DASH | Work item | Stages |
|---|---|---|
| DASH-1 | App map, one job per screen | 9–13, 28–32, 36, 43, 58, 80 |
| DASH-2 | Game-feel design system | 6, 7, 8, 10, 79 |
| DASH-3 | Gamification | 36, 45, 67–71 |
| DASH-4 | Bets: place bets | 14, 20, 21, 40–47, 56 |
| DASH-5 | Bet against friends | 49, 50, 51, 53, 54, 55, 67 |
| DASH-6 | Lines board | 13, 22, 23, 27, 33, 34, 35 |
| DASH-7 | Trends, simplified | 13, 34 |
| DASH-8 | Data that displays wrong | 7, 12–14, 16, 17, 21, 31, 32, 57, 58, 64, 72 (table below) |
| DASH-9 | Cut and hide information | 5, 12, 13, 37, 38, 72–74, 77, 78, 81 |
| DASH-10 | Social layer | 48, 52, 61–66 |
| DASH-11 | First-run onboarding | 11, 30, 36, 39, 76 |
| DASH-12 | Phone-first layout | 10, the 390 spec in every UI stage, 79 |
| Rules | D-36, D-37 | 15–21, 23–26 |
| Rollout | D-38 | 1, 2, 9, 49, 80, 81 |

### 9.2 Data-display problems (inventory DP-1 to DP-27)

| DP | Stages | DP | Stages | DP | Stages |
|---|---|---|---|---|---|
| 1 Zero for no ballot | 16, 17, 12, 58 | 10 "Reference unavailable" rows | 31, 32 | 19 Sports switcher wraps | 10, 38 |
| 2 Hidden Spread + Total sum | 17, 12, 58 | 11 Group board tiles, side scroll | 58 | 20 Nine sidebar entries | 10, 43 |
| 3 Tracker stuck on Week 5 | 21, 46 | 12 Edge provenance clutter | 32, 33 | 21 Five bet records | 45, 73 |
| 4 Freeze panel says Week 5 | old app until 81; record in 74 | 13 Same data in many places | 80, 81 | 22 Out-of-date rules text | 7, 25, 30 |
| 5 Virtual Units line text | 7, 43 | 14 Rounding and units | 7 | 23 Total vs Over/Under | 7 |
| 6 Four spread notations | 7, every tab | 15 Raw ids and JSON | 7, 34, 47, 72 | 24 Developer status shown | 38, 77 |
| 7 Mixed time zones | 7, 13 | 16 Team records as codes | 13 | 25 Feed picks mix codes and names | 64 |
| 8 "Observed Not available PT" | 7, 32, 34 | 17 Archived chart beside live data | 74 | 26 Line chart labels | 34 |
| 9 "— / 150" rows | 32, 58 | 18 Trend cards with ~15 numbers | 13 | 27 Tabs wrap, slow team images | 8, 10 |

---

## 10. Cut-over checklist (D-38)

### Before the flip (every box ticked)

- [ ] **All five tabs done:** Home (12, 36), Play (28–32), Bets (43–47, 53, 54), Lines (13, 33–35), League (58–60, 64–67, 71). Me, History, export, sign-in and commissioner tools too (37–39, 72–77), because every retired screen needs a home first.
- [ ] **No slot left empty:** every `homeTiles`, `counter` and `sheetActions` entry the prototype shows is on, each with the test that proves it.
- [ ] **Every migration applied and deployed:** M-01 to M-29 byte-identical and recorded; `NOT_HOSTED` holds only what Sean chose not to apply; no `awaitingDeploy` left for shipped routes; live `check:cloud --strict` passes.
- [ ] **Leak gate:** the scan passes at all four moments across every route that can carry a line or a hidden pick: `/lines/*`, `/bets/*`, `/challenges/*`, `/virtual-units`, `/virtual-pick`, `/social/*`, `/league/feed`, `/league/comments`, `/league/player`, `/community/read`, `/community/history`, `/community/picks`, `/personal`, `/personal/notes`, `/personal/ballot`, `/state`, `/ballot`, `/export`, `/me/*`, `/lobby`, and push payloads. A live spot check on Sean's account agrees.
- [ ] **Scores did not move:** the hosted score hash matches the last recorded one.
- [ ] **Real-data check on Sean's account, one full live week:**
  - [ ] Home: countdown, status, who's in; ranks match `gtl_ballot_pick_scores` (not the old board's order, DP-2).
  - [ ] Play: a real ballot sent and final; late picks behave as the rules say.
  - [ ] Lines: locked before a send, open after, opening per game at kickoff; Monday night line fresh on Monday.
  - [ ] Notes round trip; wind and referee rows.
  - [ ] Bets: a real bet placed and settled; a challenge sent to and accepted by the tester, then settled.
  - [ ] League: boards in the right order with no sum; the feed with reactions and comments; old posts render.
  - [ ] History: Week 5 Spread 95.8 with "original time not recorded"; Steven's and Ben's ruled lines labelled; the Betting Challenge record matches the old screen; removed members listed.
- [ ] **D-23 audit:** every row in `docs/redesign/INVENTORY_HOMES.md` is done. Nothing a player entered is hidden.
- [ ] **Stage 79 green;** Sean's own phone check done.
- [ ] **CI fully green;** bundle scan clean; Week 5 picks file hash unchanged; nothing under `.local/` committed.
- [ ] **How to play, Privacy and Terms** cover what the new app stores: challenges, reactions, notes, the forfeit record, bets visible any time.
- [ ] **Push decided:** live, or hidden behind `pushConfigured`.
- [ ] **Jobs:** settlement and features crons enabled by Sean, or the screens say plainly that results arrive when the commissioner settles.
- [ ] **Sean says go.**

### The flip (stage 80)

> **D-60 (October 26, 2026).** Sean asked to remove the old app entirely and chose two
> steps. Step 1 is the flip: every member gets the new app, saved `classic` choices
> no longer count, and the old app opens only at `?app=classic` from Menu › Older
> records and tools and the failure screens. Step 2 deletes it once every item in
> [the D-60 checklist](../planning/new-app-retirement.md#d-60-two-step-retirement-october-26-2026)
> has a native home.

> **D-52 amendment (October 15, carried to main October 21).** Sean asked to sunset
> the previous app so no one can access it, without losing anything. Stage 80 is
> therefore the verified new-only cutover: no classic default, saved preference,
> menu item, query parameter, deep link or error fallback stays player-accessible,
> and stage 81 is source cleanup only, without the two-week window below. The
> bullets below are the original D-38 plan and remain historical where they
> conflict. See [new-app retirement](../planning/new-app-retirement.md) (RETIRE-01–04).

- One PR: `DEFAULT_APP = 'next'`. A device that chose `classic` keeps it. "Use the old app" stays in the menu. The old footer button becomes "Back to the new app". `web/index.html` fonts, meta description and the manifest move to the new app.
- With Sean's OK, set `new_social_open` so everyone can challenge, share and react.
- Merge on a Tuesday or Wednesday PT, after Monday night is settled. The Mac mini deploys Pages and runs the live checks.
- **Rollback:** revert the PR and redeploy, or roll Pages back. If rolled back, show "Try the new app" to every member so entries made in the new app stay reachable. No data changes either way.

### Retiring the old app (stage 81, later, with Sean's OK)

- Wait at least two full weeks on the new default (picks, settlement, feed) with no blocking bug.
- Preconditions: every commissioner page is native (78); the older group scoring views and the Week 5 freeze record have read-only pages (74); export is native (75); real slips past weeks are readable (47).
- Then `main.jsx` renders only `NextApp`; the old screens and their CSS leave the source (git keeps them); `styles.css` leaves the entry; the `classic` persona project and old specs go with their screens. The Design lab goes with them.
- Server routes only the old app called stay until nothing calls them, then go in a later PR. No table or row is dropped (D-23). Betting Challenge selections stay readable in History.
- Update `AGENTS.md`, `docs/DASHBOARD_APP.md` and `docs/BRAND_GUIDE.md`. Keep `design/tokens.json` until nothing uses it.

---

## 11. Open questions for Sean (answered, D-39)

| # | Question | Sean's answer |
|---|---|---|
| Q1 | May a pick be added after sending? | Replaced by per-game lock-in: each game's guess is final once locked in and opens that game's line and friends' guesses for that market. |
| Q2 | Skip or "See picks now" after Thursday's deadline? | Yes, until the last kickoff. |
| Q3 | New pick rules now or at the flip? | Live in both apps once built. |
| Q4 | Keep collecting Monday-night lines? | Yes. |
| Q5 | Testers before the default? | Whole league, opt-in. |
| Q6 | Real slips: dollars and tail undo? | Dollars allowed, no undo. |
| Q7 | Challenges: line limit, void credit, hedging? | 3 points, yes, yes. |
| Q8 | The private journal? | Read-only in History. |
| Q9 | Push text "lock" or "due"? | "Due". |
| Q10 | When does the new app become the default? | "asap". |

Approvals that are not questions: applying the push migration (stage 2), every "apply M-xx", every deploy SHA, each cron enable, the flip.

## 12. Critique points rejected

| Critique point | Why not |
|---|---|
| Let a game added after a send take a pick until its kickoff (completeness 1) | After a send that market's lines are open, so a later pick could copy the line. Kept as Q1, with the opposite recommendation. |
| Ask Sean about trend limits and wind on the board (completeness 7) | The approved prototype sets 3 trend lines per board and 1 chip per card. D-34 keeps forecast claims out of summaries, so wind stays in the sheet. Sean later ruled on the board (D-45, October 14): one word weather chip per row ("Windy", "Rain likely" or "Snow likely"); the values stay in the sheet. |
| Ask about account deletion (completeness 39) | The redesign adds no deletion. It belongs to the Privacy PR (#62). |
| Ask about the practice switch, Week 5 group scores, removed members' rank, the old heart, Notify me wording (completeness 44) | The rules answer them: D-35 cuts the switch, D-27 has one scoring function, D-23 keeps removed members with a flag. The rest are implementation choices. |
| A feed post announcing "bets visible any time" (completeness 38) | No new post kind for notices. D-36 already rules it; a line on the old Virtual Units screen, How to play and the release note tell players before M-10. |
| Edit `AGENTS.md` line 30 (risk 1) | That line is in the archived section marked "not current". Stage 1 adds a current pointer at the top instead. |
| Move keyset paging into the reactions migration (size 14) | It goes into the new feed reader (M-22). The old `gtl_read_community` keeps its paging and exact arguments (risk 7). |
| No migration lists at all (size 3) | One list stays: `NOT_HOSTED`. Old-app specs must run on the schema players actually have (risk 24). |
| Move the challenge server ahead of Play to save about three waves (size 34) | Play is Sean's first real use and the core of D-38's check. The challenge server follows Play in lane B. The apply calendar, not the waves, sets the end date. |
| Draft questions on the old Virtual Units lock, kickoff-post author, closest-streak scope, name length, Betting Challenge writes, old tracker rankings, per-account switch | Each has an answer already: D-36 requires the lock; the author follows `week_published`; the approved prototype sets the streak; D-23 forbids cutting existing names (keep 60); D-35 takes Betting Challenge off the main screens; D-36 keeps real slips off every board; per device is enough for now. |

---

## 13. Constraints this plan keeps

- Free data sources only. No new provider and no extra odds credits. Settlement and awards use the free nflverse file.
- No private picks, lines, notes or forecasts in static assets or unauthenticated routes. Every reveal is gated on the server.
- D-23: nothing a player entered is deleted, moved or hidden. New tables are append-only or versioned, with no delete grants.
- D-16: submission times, revisions and audits are kept, including old `ballot_edited` events.
- `data/picks/2026-week-05.json` is never written. CI's snapshot check guards it.
- Nothing under `.local/` is committed.
- Migrations are applied by hand through the Supabase MCP or the SQL editor after Sean's "apply". Never `db push`. Each file is stamped at merge, after the newest on `main`.
- Deploys go only through the Mac mini sync session, after green merges Sean approves (D-38).
