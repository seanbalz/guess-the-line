# Guess The Line — Dashboard UX optimization handoff

Owner: Sean Balsiger · Version 1 · October 9, 2026 · Audience: the AI **dashboard optimization agent** assigned to make the Guess The Line dashboard the most user-friendly version of itself

This document briefs an agent whose job is usability, not styling: information architecture, task flow, state handling, error recovery, input cost, mobile ergonomics and perceived speed. The companion [DASHBOARD_UI_DESIGN_HANDOFF.md](DASHBOARD_UI_DESIGN_HANDOFF.md) briefs the visual design agent. Both share section 1; both agents must coordinate through breadcrumbs before touching `web/src/VisualDashboard.jsx`, `web/src/App.jsx`, `web/src/CommunityHome.jsx` or `web/src/styles.css` in the same window.

Read first, in this order: this file, `docs/PERSONA_AUDIT_2026_10_09.md`, `docs/PLAY_WORKSPACE_UX.md`, `docs/SIMPLE_DASHBOARD.md`, `docs/SOCIAL_COMMUNITY.md`, `docs/SUBMISSION_TIME_SCORING.md`, `docs/FRESH_SUBMISSION_AND_SOURCES.md`, `AGENTS.md`, `docs/RULES.md`, `docs/DECISIONS.md` (D-16, D-17, D-21, D-22, D-23, D-24), `planning/project-tracker.json` (items UX-02..UX-05, UX-14, UX-15, SCORE-03, NOT-02, OPS-05, BET-06).

---

## 1. Context pack — repository, sync and deployment (shared with the design agent)

### 1.1 Where the code lives and which copy is the truth

| Copy | Location | Role | State on 2026-10-09, 09:53 PDT |
|---|---|---|---|
| GitHub `main` | `seanbalz/guess-the-lines-repo` | **Code truth.** Every change lands through a pull request into `main`. | `ebcdae6` at 10:15 PDT (PR #30 reconciliation merged on top of PR #31's tracker commit) |
| Cloud Claude sessions | claude.ai/code, branches `claude/*` | Produced PRs #10–#35 on October 8–9. They have GitHub and the Supabase MCP, no Cloudflare credential, no Supabase CLI login. | Open drafts: #32 (Ben's Week 5 import), #33 (Virtual Units settlement, D-26), #34 (persona quick wins 2–11, see 7.0), #35 (these handoff documents) |
| Local Mac mini checkout | `/Users/seanbalsiger/betting-repo` | Sean's machine. The **only** place Cloudflare Pages can be deployed from. Codex sessions work here on `codex/*` branches. Several agent sessions share this working tree at the same time. | Was on PR #30's branch at `8c2d75d` at 09:53 PDT, clean, in sync; local `main` at `f1ade03` behind origin. Re-check with `git status -sb` before relying on it |
| Codex worktrees | `~/.codex/worktrees/virtual-units-*` | Separate checkouts for the D-18 virtual units branches | `codex/virtual-units-implementation`, `codex/virtual-units-rules` |

Rules that follow: branch from `origin/main` (`git fetch origin && git switch -c claude/<slug> origin/main`), PR into `main`, let CI run; never commit to `main` directly; never switch branches inside the shared Mac mini checkout (use `git worktree add`); `main` is ahead of production, so target `main`.

### 1.2 What is deployed versus what is on `main`

| Component | Live (production) | On `main` | Who can ship it |
|---|---|---|---|
| Frontend (Cloudflare Pages `guess-the-line.pages.dev`) | `2106725d`, built October 8 from `30d331e` | D-21 Community home and chip entry, D-22 coming-soon leagues and 32 marks, D-23 sit-out, D-24 auto-open, PR #22 Edge board phone layout, PR #26 ballot widths, PR #25 persona harness | Sean, from the Mac mini: `npm run build:cloud && npm run check:cloud && npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true` |
| `gtl-api` Edge Function | v14 | v15 source (community routes, sit-out, week-open status) | Supabase MCP or `npx supabase functions deploy gtl-api` |
| Hosted database (`onmrgvcehkflfaizvedl`) | **Ahead of the app:** all 20 migrations, `gtl-week-open` v1, Monday cron jobs, `nfl-weekly` enabled; Week 6 opens automatically Monday October 12, 12:00 AM PT | same | Done through the MCP on October 9. Never run `npx supabase db push` as-is |
| CI | No deploy path (no Actions secrets) | `test.yml`, `dashboard-checks.yml`, `brand-qa.yml` on every PR | n/a |

The optimization agent never deploys. Release steps 5–9 in `docs/SOCIAL_COMMUNITY.md#release-checklist--october-9-2026` are Sean's.

### 1.3 What never syncs

| Thing | Where | Note |
|---|---|---|
| `.local/` | Mac mini only | production build, screenshots (`previews/`, `previews/personas/`), `personas/findings.json` and `axe-scans.json`, local owner `state.json`, release manifest |
| `.env.cloud` | Mac mini only | Supabase URL + publishable key; `.env.example` is the template |
| Preferences | per browser/device `localStorage` | `gtl.theme`, `gtl.dashboard.preferences.v1`, `gtl.dashboard.matchups.v1.<season>.<week>`; never account-synced by design (a future account-synced Favorites is a separate item, BET-04) |
| Unsaved drafts | tab `sessionStorage` recovery (group ballots, Solo); **Community Picks tab has none** (persona #3) | 24-hour recovery; explicit Restore |
| Picks, snapshots | `data/` in git | Private; never served from the root, never placed in static assets, never edited |

### 1.4 Three ways to run it locally

| Mode | Command | URL | Data | Use for |
|---|---|---|---|---|
| Local owner workspace | `npm ci && npm run dev` | `http://127.0.0.1:5173` + service on 8787 | `.local/state.json`; player select is **not** auth | Flow work on the league shell |
| Isolated synthetic server | `npm run build && GTL_TEST_PORT=8795 node scripts/test-server.mjs` | `http://127.0.0.1:8795` | Temporary store, synthetic quotes, clock pinned to 2026-10-08 16:00 UTC | Screenshots and timing runs without real data |
| Persona harness | `npm run test:personas` | port 5499, `--mode cloud-test` build | PGlite seed (Ben, Troy, Luke), real Edge handler, mocked Auth; switches for latency, offline, 409, 503, expired session, no fresh quotes | **The measurement rig for this brief** |
| Cloud preview | `npm run build:cloud && npm run preview:cloud` | `http://127.0.0.1:4173` | Production assets against hosted data; needs sign-in | Final parity |

Gotcha: a stale Vite dev server after a large git move returns `504 (Outdated Optimize Dep)` and a blank page; restart it. Install the disposable database once for cloud-style suites: `npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8`.

---

## 2. Users, jobs and the weekly cycle

### 2.1 Who uses it

| Person | Role | What they do each week |
|---|---|---|
| Sean Balsiger | Commissioner of Triple Threat and of the community; owner | Picks both markets, reviews others, records Challenge selections, publishes/ overrides weeks, collects odds manually when needed, runs releases |
| Troy Jun, Luke Jun | Triple Threat players (Troy also in Baustin Files) | Pick Spread and Total before Thursday kickoff, compare, follow the leaderboard, use Bet Tracker |
| Steven (Sthomas) | Sean & Steven duel | Same |
| Ben | Signed up October 9; Week 5 picks pending import (D-25) | New-player onboarding path |
| Future sign-ups | Join the one community automatically (D-21) | Must understand the game cold |

Seven simulated personas exist with reusable specs: first-time player, casual phone user (+400 ms latency, tab switches), power user (keyboard, 14 games), low-vision (200% zoom, forced colors), motor-impaired (keyboard, 44px), impatient (offline, 409, expired session, 503), confused (closed week, unpublished week, not-yet-open week, sat out, no groups, coming-soon league).

### 2.2 Jobs to be done, ranked

1. **Make my picks before the deadline** without seeing the market (Spread and Total are separate ballots; a full ballot is required to submit; drafts are allowed; edits allowed until the deadline; each save captures a scoring reference; fresh quotes are required at save or the save is refused and the draft kept — D-16/D-17).
2. **Know where I stand**: my points for each market against my saved references; closest-pick W–L–T; the group standings; the community season leaderboard.
3. **Compare with rivals**: side-by-side guesses after I submit; errors per game; who is closer.
4. **See what the market did** without it changing my score (recorded line movement, current consensus vs saved reference).
5. **Record a Challenge selection** (one spread or total per matchup, immutable, with a quote receipt) and later see W–L–P.
6. **Track bets** socially (Bet Tracker, Unit Betting) and privately (Solo journal, Favorites, forecasts).
7. **Sit out a week** (final, per market; reveals others' picks; "Sat out", never 0).
8. **Commissioner duties**: preview/publish early, manual odds collection, result review, membership.

### 2.3 The weekly clock (America/Los_Angeles)

| Moment | What changes |
|---|---|
| Monday 12:00 AM PT (D-24) | Week opens automatically; picks-due state becomes `due`; before this it is `not_open` and the database refuses writes (`GTL_PREDICTION_NOT_OPEN`) |
| Twelve-hourly (1:15 AM / 1:15 PM PT) | Hosted odds collection refreshes current consensus for upcoming games; the dashboard reads refreshed data on focus/visibility and once after the scheduled run |
| Two hours before the deadline | picks-due state `urgent` |
| TNF kickoff (deadline) | Ballots close; drafts remain read-only; opponents' picks reveal to everyone; closest-pick records wait for all eligible full ballots |
| During the week | Challenge grades pend until reviewed results load; "Reviewed results temporarily unavailable" callout |
| Monday night final | Team records refresh (`scripts/team-records.mjs`) |

---

## 3. Information architecture as built

```
AuthGate (cloud)                       main.jsx (local: straight to App)
└─ GameHub
   ├─ CommunityHome  ← default landing after display name (D-21)
   │   tabs: Feed | Picks (chips, due counts) | Groups & games →
   │   league switcher: NFL live + 5 "Coming soon"
   │   picks-due card · season leaderboard · publish panel (commissioner) · feed · coming-soon cards
   ├─ "My games" hub: Solo · Bet Tracker · invitations · game cards · New game
   ├─ PersonalWorkspace (Solo): Favorites | Guesses | Journal
   ├─ SocialBetTracker (feed | units)
   └─ App (league shell, per game)
       sidebar: Dashboard · My picks · Virtual Units · Bet Tracker · Unit Betting · Compare picks · Leaderboard · Edge board · History & audit · (Design lab) · Settings & setup
       topbar: league name · season · help · signed-in player / local player select
       Dashboard = Overview → market tabs (Spread | Over/Under) → VisualDashboard
       My picks = ModeTabs (Spread | Total | Challenge) → PredictionEntry (ChipPicker) | Betting
```

Three facts an optimizer must internalize:

- **Two dashboards exist.** The Community home (season leaderboard, everyone, picks-due card) and the league Dashboard (week standings for one group, accuracy charts, gaps). They use different leaderboard shapes and different "Picks" entry points (Community Picks tab saves the league-free weekly ballot; the league My picks screen saves the same ballot through the group route). Players will see both and must not be confused about which is "home".
- **Mode is a global of the league shell.** `mode` (guess_spread / guess_total / betting_challenge) drives Dashboard, My picks, Compare, Leaderboard, Edge board and History at once; the Overview forces Challenge back to Spread. Tiles on the dashboard navigate to a ballot while the market tabs above them switch the dashboard's data — two similar controls that do different things (PLAY_WORKSPACE_UX friction table).
- **Everything is gated per market.** Until the viewer submits a market, that market's references, opponents and history are hidden; the other market has its own gate. Any new summary, notification or deep link must enforce the same gate.

### 3.1 State machine of the League Dashboard

| State | Condition | Current rendering | Risk |
|---|---|---|---|
| Not submitted | `!data.revealed` | locked scoreboard "Your ballot comes first" + Open ballot | fine, but the betting-week card still sits above it |
| Submitted, references saved | D-16 timestamped | insights tabs, gaps, drilldowns, current consensus | dense; empty variants repeat text |
| Submitted, no references | historical ballots | "Unscored · 0 of 15 references available"; fifteen "Reference unavailable" lines | reads as broken |
| Opponents not submitted | standings `submitted:false` | "Ballot not submitted" rows, "Awaiting all ballots" | no hint when they usually submit or that nothing is wrong |
| Week not open / closed / sat out | D-24 / deadline / D-23 | handled on Picks; dashboard shows statuses only | persona #13, #41, #43, #44 |
| Refresh overdue / failed / paused | `refreshWarning` | amber line under history | hidden when history section is off |
| New snapshot | `updatedCapture` | in-page notice | fine |
| Error / 403 / loading | banner, membership panel, spinner | fine; buttons exist | errors elsewhere lack actions (persona #8, #26) |

---

## 4. Evidence base (what is already known to be wrong)

### 4.1 Persona audit, October 9 (version 2, de-duplicated, severity 1–4)

79 findings; 0 severity 1 (the stale-chip bug was fixed by PR #19), 25 severity 2, 35 severity 3, 19 severity 4. Zero axe violations on 24 screens. The problems are explanation, state handling and input cost. Reproduce with `npm run test:personas`; findings land in `.local/personas/findings.json`.

| Theme | Findings | Cost today |
|---|---|---|
| Silent data loss | #3 unsaved Community picks vanish on tab switch, reload, Back; #8 every save failure ends with picks only in memory | Five picks gone from one stray tap |
| Nobody explains the game | #4 no "favorite", "win by", "combined points" on the Community Picks tab; #22 summary line is the only confirmation; #30 "Spread 0/14 · Total 0/14" with no noun; #37 team facts in code-like mono | Wrong sign or wrong team, never noticed |
| Dead or unexplained controls | #5 Total button disabled with an unsaved Spread draft; #6 Submit disabled until 14/14 with no explanation; #7 silent fallback to My games on a 503; #13–#16 closed / unpublished / half-done / groups states contradict each other | Abandonment, retries, reloads |
| Input cost | #9 382 key presses for a 14-game ballot (every chip a tab stop); #23 Total chips centered on 44 for every game; #28 one column, 5510 px tall, 29 taps minimum at 1280 | Keyboard users cannot finish |
| Where am I, what next | #17 theme card first, six-chip switcher, 12 Tabs to "Make picks"; #18 skip link lands on body; #24 deadline not in the sticky bar; #25 nothing happens after Submit; #27 dead end at the bottom of 14 cards; #29 name prompt inside a finished-looking page; #33 sign-in has no pitch | The moment of commitment feels like nothing happened |
| Sit-out and not-open | #40 final action beside routine action; #41 sat-out screen shows disabled chips, not the promised revealed picks; #42 no feed post; #43/#44 not-open state identical to closed | Mis-taps on a final action |
| Targets and type | #12 8px leaderboard headers; #19 33px like button; #20 root 14px and 39 rules under 12px; #21 truncated team chips; #31 16 dashboard targets under 44px; #32 20px radios; #38 16 interactive rules under 44px in `styles.css` | Low-vision and motor users |
| Feedback placement | #26 errors render up to 431 px above the control; no busy state on buttons; #35 chrome paints before content, feed re-fetches the week | "The tap did nothing" |

### 4.2 Navigation friction already documented (`docs/PLAY_WORKSPACE_UX.md`)

| Current | Why confusing | Proposed |
|---|---|---|
| My games is the entry; creation offers Duel/Group | Solo users face a social setup first | Personal Home first; friends contests under Play |
| "My picks" changes meaning with mode | A hidden-line guess and a side/price selection both look like a "pick" | Guesses vs Journal/Challenge named explicitly |
| Compare picks and Leaderboard are top-level entries | Organized by screen, not activity | Contextual views inside Guesses / Play |
| "Edge board" implies an advantage | A gap can be read as advice | "Research / Largest gaps" with both inputs visible |
| History & audit mixes movement, score history, revisions | Three different histories | Movement in Research, performance in Guesses, audit on detail/export |
| Dashboard tiles go to a ballot; market tabs select data | Similar controls, different effects | Market selectors local to the activity; explicit "Open ballot" |
| Group switching around globally reused picks | Users expect a new ballot per group | Visible ownership label; change roster context only |

Tracker item UX-14 ("Clear Guesses, Research, Journal and Play navigation", P1, open) owns this; D-21 has since made Community the landing, which partially answers "Home first" but not the rest.

### 4.3 Open tracker items in scope

| Item | Title | Exit condition (abridged) |
|---|---|---|
| UX-02 | Make phone prediction entry faster and clearer | Full slate on an actual phone without sign mistakes or horizontal scrolling |
| UX-03 | Mobile legibility and accessibility targets | 44px, 16px mobile interactive, contrast, keyboard, screen reader, zoom, safe areas verified at 320 and on an iPhone |
| UX-04 | Resume drafts reliably with explicit save state | Saving/Saved/Offline/Conflict states, last-saved time, retry and recovery across refresh, interruption and device switch |
| UX-05 | Review before irreversible reveal or quote confirmation | Review shows everything, back preserves draft, duplicate clicks cannot duplicate |
| UX-14 | Clear navigation | Simplified destinations, preserved deep links and ownership |
| UX-15 | Richer player comparison charts | Readable distributions with explicit sample sizes; missing stays distinct from zero |
| SCORE-03 | Standings and history for every player/week | Season totals, tie-break order, multiple real participants |
| BET-06 | Decision-quality and postgame review | Original guess, context, result and rationale without rewriting history |
| NOT-02 | Installable web app and verified push | Install guidance exists; push backend does not |
| OPS-05 | Phone performance and state consistency | Measured on a real phone (blocked: no device) |

### 4.4 Remaining simplification work from `docs/SIMPLE_DASHBOARD.md`

UX-14/UX-15 (reduce repeated navigation, make the next pick action clear); UX-02/UX-04 (receipts behind a compact four-value comparison: Your guess / Line when saved / Current line / Points); BET-01/05/06 (compact journal outcomes once settled records exist); SCORE-09/DATA-13 (never turn unavailable historical evidence into a score).

### 4.5 Additional observations from the October 9 build (synthetic server, 1440 / 390 / 320)

| # | Observation | UX consequence |
|---|---|---|
| O1 | Order on the League Dashboard: Customize dashboard → Your betting week (often all zeros) → Accuracy matchup → Compare accuracy → Spread/Total/Challenge tiles → gaps → data connections. | The next action (Total 0/15 entered) is the sixth block; on a phone it is roughly 2.5 screens down |
| O2 | The three action tiles look identical regardless of state; "Challenge · Your card" gives no record. | No scent for what is due |
| O3 | Six collapsed disclosures per view, all with the same chevron. | Users cannot predict which chevron hides settings, help or data |
| O4 | Empty gaps panel prints the same three lines for five games; empty score rows print "— / 150" three times. | Looks broken rather than "waiting for Troy and Luke" |
| O5 | Insights tabs wrap to two rows at 390 and 320. | Third tab reads as a separate control |
| O6 | Sidebar has eleven entries with duplicate icons; "Design lab · Draft" is player-visible. | Choice overload; internal tool exposed |
| O7 | The dashboard's market tabs (Spread / Over/Under) and the My picks mode tabs (Spread / Total / Challenge) use different labels for the same market. | Vocabulary drift (also persona #30) |
| O8 | "Dashboard notices" are in-page only; the copy says push/email/SMS are not connected, which is true (NOT-02 blocked). | Deadline reminders depend on the player opening the app |
| O9 | Local Node service serves `.png` as `application/octet-stream` (no MIME entry) under `nosniff`, so the Bills and Rams marks are blank in the local workspace; production is unaffected. | Local reviewers see a missing-logo bug that is not in production |
| O10 | The refresh model (focus, visibility, one scheduled wake, 1 s throttle) is invisible; "12-hour refresh enabled" sits in the history footer only when that section is on. | Players cannot tell how current "current consensus" is |

Baseline numbers from the audit to beat: 382 key presses per 14-game Spread ballot; 29 taps minimum at 1280; 12 Tab presses from load to "Make picks"; 5510 px Picks page height at 1280; 2.0 s to the picks-due card at +400 ms per request; 16 dashboard targets under 44px; 0 axe violations (keep).

---

## 5. Non-negotiable constraints for UX work

1. **Rules are not yours to change.** Scoring (10 − 2 × absolute half-point error, floor 0), closest-pick W–L–T, one full ballot to submit, edits until the deadline, submission-time references (D-16), fresh-quote refusal that preserves the draft (D-17), one Challenge selection per matchup, D-23 never delete/move/hide, D-24 open and close times, independent Spread/Total reveal gates, commissioner-only controls. Design flows around them; propose changes as questions.
2. **Never manufacture certainty.** No countdown without a real deadline; no "live" wording for twelve-hourly data; no implied recommendation from a gap; missing is an em dash with a reason; "Sat out" is not 0; provisional is labelled.
3. **Honest save state.** Saving / Saved at <time> / Offline / Conflict / Uncertain (acknowledged but unread) are distinct; retries reuse the same request id; a refused save (no fresh quotes, 409, expired session) keeps the draft on screen with a button that does the next thing.
4. **No new persistence of picks outside the account** beyond tab/session recovery (device-local, explicit Restore). Drafts in `sessionStorage` are acceptable (the group screens do it); account-synced Favorites is a separate future item.
5. **Accessibility floor** as in the design handoff: 44px, 16px mobile interactive, keyboard reach for everything with sane tab cost, focus management after navigation and submit, `aria-live` for status, zero axe violations, reduced motion, forced colors.
6. **Privacy and reveal gates** on every new summary, notice, deep link or prefetch.
7. **Free only; no new runtime dependency** without a one-line reason.
8. **Do not restyle.** Token, type scale and chart styling belong to the design agent. If a UX fix needs a style change, make the minimum change and note it in the breadcrumb so the design agent sees it.

---

## 6. Target outcomes and how to measure them

| Outcome | Metric | Baseline | Target | Measured by |
|---|---|---|---|---|
| A returning player knows what to do within one screen | Blocks above the first due-market action on the Dashboard and Community home | 6 / 4 | ≤ 2 | screenshot + DOM order assertion |
| No silent loss of picks | Scenarios (tab switch, reload, Back, offline save, 409, expired session, no fresh quotes) that lose unsaved picks | 7 of 7 on Community Picks | 0 | `impatient.spec.js`, `phone.spec.js` |
| Every failure has a next step | Error banners without an action button | most | 0 | persona specs |
| Keyboard cost of a ballot | Key presses for 14 games | 382 | ≤ 100 | `power.spec.js` |
| Touch cost of a ballot | Taps for 14 Spread games | 29 | ≤ 29 and ≥ 960px two-column | `power.spec.js` |
| Reach the ballot | Tab presses from load to "Make picks" | 12 | ≤ 4 (skip link lands on the due card) | `first-timer.spec.js` |
| Understand the chips cold | Helper line present on every pick surface; chip row labelled for screen readers | Community: none | present | `first-timer`, `low-vision` |
| State clarity | Closed, not-open, unpublished, half-done, sat-out states distinct and actionable | contradictory | each has one headline and one action | `confused.spec.js` |
| Targets and type | Interactive rules under 44px / under 16px mobile | 16 + 16 / 39 | 0 / 0 | `scripts/persona-static-checks.mjs` |
| Perceived speed | Time to picks-due card at +400 ms per request; duplicate week fetches | 2.0 s; 2 | skeleton within 200 ms; 1 | `phone.spec.js`, network log |
| Accessibility | axe violations | 0 | 0 | `tests/accessibility`, personas |
| Phone-size reflow | Horizontal scroll at 320/390 | none | none | existing fit tests |

Add a metric only when a spec can assert it; the persona harness exists so that findings are reproducible, not anecdotal.

---

## 7. Prioritized backlog with acceptance criteria

P0 = silent data loss or wrong-pick risk; P1 = comprehension and reach; P2 = cost and polish. Each item names its rule boundary.

### 7.0 Already in flight — check these PRs before starting any item

| PR | State at 10:15 PDT | Covers | Leaves open |
|---|---|---|---|
| [#34 Persona audit quick wins 2–11](https://github.com/seanbalz/guess-the-lines-repo/pull/34) | draft, from a cloud session | Community Picks tab and shared `ChipPicker`: helper line per market, "Cowboys win by…" row label, "Your call" line, "Even (pick'em)", Total enabled with auto-saved draft on switch, enabled Submit with explanation, 503/offline/409/401 banners with Retry / Load latest / Sign in again, inline like/comment errors, "Saving…" labels, check icon on selected chips and `forced-colors` rules, chip row `group` labels, closed / unpublished / not-open states, "Make picks" opens the first due market, Appearance moved to the foot, `main` `tabIndex={-1}`, skip link to the picks-due card | Draft persistence and history (#3), keyboard model (#9, #23), type scale and density (#20, #28, #12), submission receipt (#25), sit-out placement and reveal (#40–#42), onboarding (#29, #33, #16), group-ballot targets (#31), league switcher collapse and coming-soon inline (#17 remainder, #36), spelled-out records (#11 remainder) |
| [#33 Virtual Units settlement (D-26)](https://github.com/seanbalz/guess-the-lines-repo/pull/33) | draft, same cloud session | Settlement rules, ledger, commissioner "Settle finals" on the Virtual Units screen | Notes a hosted bug in `gtl_save_virtual_units_pick` (`isfinite(numeric)`) that needs its own migration before D-18 saves work |
| [#32 Ben's Week 5 import](https://github.com/seanbalz/guess-the-lines-repo/pull/32) | draft | Data import pending a commissioner ruling | — |

Backlog rows below are annotated **[#34]** where that PR already delivers them; verify against `origin/main` after it merges and do not reimplement.

### P0

| ID | Change | Acceptance | Boundary |
|---|---|---|---|
| UX-P0-1 | **Draft persistence on the Community Picks tab**: keep unsaved picks per account/season/week/mode in `sessionStorage`, restore on return, put the tab in the URL hash (`#feed`, `#picks`, `#groups`), push history per screen, handle `popstate`. | `phone.spec.js`: five picks survive tab switch, reload and Back; `impatient.spec.js`: offline save keeps picks and shows Retry | Device-local only; explicit Restore like the group screens; never auto-submit |
| UX-P0-2 | **Every error banner carries the next action** **[#34 delivers the buttons, inline placement and busy labels]**: remaining piece is auto-saving the draft before the D-17 fresh-quote check so a refused submit never holds picks only in memory. | `impatient.spec.js` asserts a button per failure and the banner within the viewport of the control | D-17 wording: the save was refused, the draft is kept |
| UX-P0-3 | **Stop the silent fallback** on `/community/read` failure **[#34 delivers this]**: verify after merge; nothing to build. | `impatient-feed-503` scenario shows the shell + Retry | — |
| UX-P0-4 | **Sit out placement**: move "Sit out this week" below the ballot as a text link with its confirm dialog; keyboard order reaches Save draft and Submit first. | `motor.spec.js` tab order; `confused.spec.js` dialog unchanged | D-23 dialog copy stays ("final… recorded as sat out, not zero") |

### P1

| ID | Change | Acceptance | Boundary |
|---|---|---|---|
| UX-P1-1 | **Next action first** on both dashboards: a "This week" card at the top with the due market, real deadline ("Due Thu Oct 8, 5:15 PM PT"), progress ("Spread ✓ submitted · Total 0/15"), and one primary button that opens the first market still due. Betting week moves below the game content. | DOM order assertion; `confused-picks-half-done` opens Total, not Spread | No countdown unless the deadline is known; practice games say so |
| UX-P1-2 | **Explain the chips everywhere** **[#34 delivers the helper line, row label, call line and "Even (pick'em)" on the Community tab and through the shared `ChipPicker`]**: remaining is spelled-out team records for screen readers (#11) and a check that the group ballot shows the same helper. | `first-timer.spec.js`, `low-vision.spec.js` | Signed home-spread contract unchanged in the saved value (PR #34 keeps signed chips) |
| UX-P1-3 | **Enable, then explain** **[#34 delivers this]**: verify after merge. | `first-timer.spec.js` | Full ballot still required to submit |
| UX-P1-4 | **One vocabulary**: Spread / Total everywhere (rename "Over/Under" tab to Total or vice versa, one choice), "2 ballots due: Spread (0 of 14 games), Total (0 of 14)", expand PK, same matchup naming in feed posts and Picks. | string audit in a spec | Ask Sean which word (recommend "Total" to match scoring docs) |
| UX-P1-5 | **State screens** **[#34 delivers closed, unpublished and not-open states and opens the first due market]**: remaining is the sat-out market showing the revealed picks or a link to the feed posts (#41). | `confused.spec.js` scenarios each assert one headline and one action | D-24 strings; D-23 reveal rules |
| UX-P1-6 | **Submission receipt**: after Submit, focus moves to a receipt panel (count, time, "Total still due", buttons to Total and to the feed). | `power.spec.js` focus assertion | Reveal only the submitted market |
| UX-P1-7 | **Consolidated empty states** on the League Dashboard: one message per panel naming the reason ("Troy and Luke have not submitted", "No reference was saved with this historical ballot") and, where allowed, the action. | `dashboard-charts.spec.js` unscored case | Never a zero |
| UX-P1-8 | **Home order on Community** **[#34 delivers Appearance to the foot, `main` `tabIndex={-1}` and the skip link to the picks-due card]**: remaining is the league switcher collapsed to "NFL · Live · More leagues" and coming-soon as an inline expansion rather than a screen replacement. | `first-timer.spec.js` Tab count ≤ 4; `confused-league-coming-soon` keeps the picks reminder | D-22 cards and Notify me remain |
| UX-P1-9 | **Disclosure taxonomy and sidebar grouping** (with the design agent): settings go to the bottom/Settings, one explanation per screen, data drilldowns inside tables; sidebar grouped Play / Review / Social / Account, Design lab commissioner-only. | navigation spec; existing button names preserved or specs updated | — |
| UX-P1-10 | **Refresh transparency**: a single status line under the scoreboard ("Market data collected 1:15 PM PT · next 1:15 AM PT") that survives section toggles; `refreshWarning` surfaces there. | `onboarding.spec.js` notices tests | Twelve-hourly, not live |

### P2

| ID | Change | Acceptance | Boundary |
|---|---|---|---|
| UX-P2-1 | **Keyboard model for chips**: radiogroup with roving tabindex, arrow keys within a row, numeric type-ahead ("3" selects −3), one tab stop per row, typed-value escape hatch on the focused row. | `power.spec.js` ≤ 100 key presses | `ChipPicker.jsx` only |
| UX-P2-2 | **Total chips centered on the matchup's typical total** (team records / last collected consensus is **not** allowed before submission; use a neutral per-matchup prior or allow typing). | `first-timer-picks-total` | Reveal gate: never show the market total before submission |
| UX-P2-3 | **Density at ≥ 960px**: two-column pick cards; optional dense row layout for power users. | `power.spec.js` height ≤ 3000 px | Design agent owns the styling |
| UX-P2-4 | **Skeletons and reuse**: skeleton rows for feed and Picks; reuse the feed payload for the week; prefetch `/personal` after the feed. | `phone.spec.js` timing | No provider requests from the browser |
| UX-P2-5 | **Sticky bar and dead ends**: deadline in the sticky save bar, bottom padding equal to the bar, back link to the feed in the bar. | `phone-picks-5-of-14` | — |
| UX-P2-6 | **Onboarding**: name step alone with the confirmation carried into Community; one-line pitch on sign-in with email autofocused; one sentence on the groups screen about what groups are for, Solo/Bet Tracker demoted to secondary. | `first-timer`, `confused-groups-empty` | — |
| UX-P2-7 | **Feed post for sit-out** ("Ben sat out Week 5 Total") so other members understand reveal access. | `d23.spec.js` | Needs an API/trigger change; coordinate with the rules owner |
| UX-P2-8 | **Install and reminders**: surface the Home Screen install offer on the dashboard once per device; keep "not connected" honesty for push until NOT-02 unblocks. | `install` spec | No subscriptions, no caches |

Items that need Sean's decision before implementation are marked in section 9; everything else can proceed.

---

## 8. Method, tooling and verification

1. **Measure first.** Run `npm run test:personas` on `origin/main`; read `.local/personas/findings.json` and the screenshots in `.local/previews/personas/`; record the baseline numbers in your first breadcrumb.
2. **Write the spec before the change.** Each backlog item lists the persona spec that proves it; extend the spec (new scenario or assertion) first, watch it fail, then implement. The harness seeds a fresh PGlite database per test, mocks only Auth, and exposes `persona.net` switches for latency, offline, status injection and session expiry.
3. **Keep the existing suites green**: `npm run check`, `npm run test:browser`, `npm run test:cloud-browser`, `npm run test:accessibility`, `npm run test:performance`, `node scripts/persona-static-checks.mjs`, `python3 scripts/check-brand-docs.py`, `git diff --check`. The hooks that specs rely on (headings, button names, `.heading-actions`, `.score-number`, `.game-option`, `aria-pressed`, `data-layout`, `localStorage` keys) are listed in the design handoff section 7; change them only together with the spec.
4. **Evidence per PR**: before/after screenshots at 320/390/1440, the metric table from section 6 with new values, suite counts, and what was not verified (physical phone, real second device, real email).
5. **Physical acceptance stays open** (UX-02, UX-03, OPS-05): browser emulation is not an iPhone. Say so in every report.

---

## 9. Delivery protocol and decisions for Sean

1. Branch `claude/<slug>` from `origin/main`; one backlog item (or one tightly related group) per PR; PR description with the evidence in section 8.
2. A row per commit in `docs/breadcrumbs/YYYY-MM-DD-<slug>.md` (session id, device, timestamp with zone, commit, changes, validation, status, next, sync).
3. Never: deploy; `npx supabase db push`; edit `data/`; commit `.local/` or `.env*`; change scoring, deadline, reveal or D-23 behavior; add paid services; invent odds or countdowns.
4. Coordinate with the design agent through breadcrumbs before touching `VisualDashboard.jsx`, `App.jsx`, `CommunityHome.jsx` or `styles.css`; smallest possible style change when a UX fix requires one.
5. One question to Sean at a time, recommended default and impact stated, in this order:

| # | Question | Recommendation | Impact |
|---|---|---|---|
| 1 | Auto-save Community Picks drafts to the account on market switch and on leaving the tab (manual Submit unchanged), or keep manual "Save draft" plus device-local recovery only? | Auto-save drafts; they are not submissions and D-17 applies only at submit/edit of a submitted ballot | Fewer lost picks; more writes; must respect the D-24 window (no writes before Monday open) |
| 2 | One word for the second market everywhere: "Total" or "Over/Under"? | "Total" (matches scoring docs, tracker and API) | Renames the dashboard tab |
| 3 | Is the Community home the player's home, with the league Dashboard one step inside each group? | Yes; add a "This week" card to both and a persistent way back | Settles UX-14's first step without a full route migration |
| 4 | Adopt the Home / Guesses / Research / Play / Journal navigation from PLAY_WORKSPACE_UX now, or defer until D-18 Virtual Units and Best Bets settle? | Defer the full migration; group the current sidebar and rename "Edge board" to "Gaps" now | Smaller, reversible |
| 5 | Keyboard model for chips (roving tabindex + type-ahead) — approve the interaction change? | Yes | `ChipPicker` only; group ballot and Community share it |
| 6 | Hide "Design lab" from players? | Yes, commissioner-only | — |

---

## Appendix A — Routes and payloads the dashboard reads

| Route | Caller | Carries |
|---|---|---|
| `state` (`/api/state?player&mode` locally; group route in cloud) | `App.jsx` | league, roster, games with prediction/opponents/scoringReference/currentConsensus/sportsbookSources, standings, statuses per mode, revealed, locked, deadline, now, oddsSchedule, marketFeed, provisionalAnalysis, scoringBenchmark, history, audit |
| `ballot`, `bet`, `export` | `App.jsx` `save`, `download` | weekly revision guard (409 on stale) |
| `/community/read`, `like`, `comment`, `interest`, `sit-out`, `publish-preview`, `publish`, `week-open`, `member` | `CommunityHome.jsx` | members, week, optOuts, picksDue (state, modes, deadline, opensAt), standings, posts |
| `personal`, `personal/ballot`, `personal/read`, `favorite/set`, `personal/forecast`, `journal/*` | `CommunityHome` WeekPicks, `PersonalWorkspace` | league-free weekly ballot, Solo data |
| `social` read | `SocialDashboardCard`, `SocialBetTracker` | shared bet entries |
| `lobby`, `profile`, `leagues`, `invites`, `invite/accept`, `invite/revoke` | `GameHub` | profile and games |

Error codes the UI must map: `GTL_PREDICTION_NOT_OPEN` (D-24), `GTL_COMMUNITY_SAT_OUT`, `GTL_COMMUNITY_CLOSED`, `GTL_COMMUNITY_MEMBER`, `GTL_SUBMISSION_REFRESH_UNAVAILABLE`, `GTL_SUBMISSION_QUOTES_REQUIRED`, `GTL_SUBMISSION_REFRESH_LIMIT`, `GTL_SUBMISSION_REFRESH_COOLDOWN`, `GTL_SUBMISSION_REFRESH_DAILY_LIMIT`, `GTL_SUBMISSION_REFRESH_BUDGET` (D-17), HTTP 409 (stale revision), 403 (membership), 401 (session).

## Appendix B — Where the existing evidence lives on the Mac mini

`.local/personas/findings.json`, `.local/personas/static.json`, `.local/personas/axe-scans.json`, `.local/previews/personas/<persona>-<screen>.png`, `.local/previews/` (all October 8–9 dashboard screenshots), `planning/audits/`, `planning/releases/`, `planning/project-tracker.json` (v62, now committed). Cloud sessions regenerate the persona artifacts by running the suite; they cannot read `.local/`.
