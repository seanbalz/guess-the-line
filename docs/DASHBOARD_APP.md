# Guess the Line dashboard and games

Local build · October 8, 2026 · Owner: Sean Balsiger

**Latest local change — D-16:** individual submission/edit-time references now
govern the requested Spread/Total scoring revision. Pre-deadline edits re-anchor
changed guesses, while current consensus is displayed separately. The former
permanent-lock and shared-snapshot behavior described in historical release
sections below is superseded for this local implementation. See
[SUBMISSION_TIME_SCORING.md](SUBMISSION_TIME_SCORING.md) for source requirements,
verification and outstanding hosted delivery. Existing historical imports without
a captured submission reference remain unscored under the new policy.

## Open the app

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The dashboard and game entry screens use `web/`;
private data is supplied by the loopback-only Node service on port 8787.

To run the compiled app:

```sh
npm run build
npm start
```

Open http://127.0.0.1:8787. `dist/` contains only the frontend. Never publish the
repository root: tracked JSON contains private league predictions. This build is
a local owner workspace and must not be put behind a public proxy. The player
selector previews roster members; it is deliberately **not authentication**.

The existing Python snapshot viewer, `dashboard/`, snapshot-linking configuration,
and its instructions remain intact. It runs separately on port 8765. This app
reads the same historical source files; it does not overwrite them.

## Available now

- Responsive dashboard, including the saved 96.4/150 spread reference and three
  historical observations (95.8, 95.8, 96.4), source times, and explicit unofficial
  status. No simulated live updates.
- Guess the Spread and Guess the Total: independent half-point drafts,
  draft saving, review before full submission, permanent submission lock, audit
  history and immediate per-mode analysis reveal.
- Guess scoring: `max(0, 10 - 2 * absolute error)`. Closest-pick W-L-T is separate
  and waits for every participating player's completed ballot. Tied leaders get
  ties. Missing picks and unavailable totals are unscored, never fabricated zeros.
- Betting Challenge: one immutable, manually entered spread OR total selection
  per matchup. Saves selected side's line, American odds, source, quote time, and
  selection time. The corresponding prediction ballot must be submitted first.
  Quotes must be pre-kickoff and no older than six hours; manual entries remain
  unverified. No real-money transactions, stakes, or bankroll.
- Separate leaderboards, search and missing-pick filter, spread/total discrepancy
  board, source timeline, player-scoped audit export, rules and account checklist.
- Design lab: five visible proposals in each of seven categories. Selections are
  temporary review preferences, not brand approvals. Font studies use labeled
  system fallbacks; final font files and licensing remain a review step.

Saved app edits live in `.local/state.json` (ignored by Git, created on first
save). Writes replace this file atomically with owner-only file permissions.
Each change includes a before/after audit entry. Back up that file before moving
computers. A saved file survives refresh and server restart. Do not run multiple
service instances against one file; this store is for one local owner process.

Historical source JSON and original predictions stay unchanged, including Sean's
Cowboys -9.5 correction and two invalid-matchup predictions excluded from scoring.
Only Sean's existing spread ballot is imported as complete. Its true submission
time is not known; the import uses the first historical observation for the
reveal state and labels the origin in the export. No totals or other players'
guesses are invented. New validated historical snapshots are read on the next
API refresh; local prediction revisions never rewrite archived score observations.
The first snapshot has publication time only, not a known capture time.

## Current rule interpretation

The latest explicit decisions in `RULES.md`, `DECISIONS.md`, and the handoff take
precedence over the older noon-freeze, one-edit, and bankroll language still
present in historical sections:

| Rule | Applied behavior |
| --- | --- |
| Prediction revisions | Drafts editable before deadline; full submission permanently locks that mode (D-02) |
| Initial submission deadline | October 8, 2026, 5:15 PM Pacific, scheduled TNF kickoff |
| Official benchmark | Must use actual TNF kickoff and last fully verified pre-kickoff snapshot |
| Deadline vs official freeze | Separate; passing the deadline does not manufacture a benchmark |
| Opponent visibility | Submitted opponents' picks only after the viewer's full ballot in that mode |
| Guess the Total | Independent nonnegative half-point prediction and score |
| Betting Challenge | One spread OR total selection per matchup; W-L-P, pushes excluded from win rate |
| Missing ballot or extension | No automatic forfeit; commissioner review needed |
| Leagues | Original fixed Sean/Troy/Luke plus independent online Duels and Groups; D-05/D-06 require one shared set of weekly player picks, with separate rosters and standings |

Inputs currently constrain spreads to -100..100 and totals to 0..200. These are
local validation bounds, not newly approved league scoring rules. A separate
online rules configuration is still needed.

Scheduled matchups and kickoff times were checked against the official NFL Week 5
article on October 8. Schedule URL is shown in Settings. Actual start times have
not been verified. Individual sportsbook timestamps are absent from the saved
eDraft records, so none passes the official verification gate.

## Boundaries and remaining work

| Capability | State / next dependency |
| --- | --- |
| Local ballots and audit storage | Implemented and tested |
| Local privacy-filtered views | Implemented and tested; owner can switch player previews |
| Shared accounts and leagues | Sean signed in; profile/game/invitation writes and reload verified. New-player email/OAuth and second-device verification remain pending |
| Cloud hosting | Supabase protected API and Cloudflare site deployed; live signed-in read and intended account writes verified |
| Free odds integration | Candidate provider only; key, usage rights, exact schema, book and quote evidence required |
| Official freeze | Pure consensus/freeze logic tested; no active collector, scheduler, official lock, or database job |
| Total score history | UI and scoring functions ready; no total quotes exist |
| Challenge settlement | W-L-P grading tested; no results ingestion or settlement job connected |
| Independent models / EV | Unavailable; no invented projections, probabilities, research scores, or EV |
| League creation / season standings | Duel/Group creation and switching deployed; one Week 5 slate; season navigation still unimplemented |
| Native iPhone / notifications | Responsive mobile web only; no native client or delivery integration |
| Theme / brand identity | Light/Dark/System on sign-in, My games and Settings; saved per browser/device. Final visual selections remain open |

The current `freezeBenchmark` function requires at least three uniquely named,
time-aligned books, at least 85% within five points of median, and an Action Network
cross-check within one point; quotes and capture must precede actual kickoff and
meet freshness requirements. It is a tested building block, not a running job or
proof a provider's books are independent. Provider/source identity and reuse rights
must be enforced by the authenticated future ingestion adapter.

## Verification

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use a separate temporary store and deterministic clock, never the
owner's `.local/state.json`. They exercise submitted/hidden modes, draft persistence,
challenge recording, all navigation screens, exports, 320/390px layouts, keyboard
focus, reduced-motion mode, service failure and recovery. Tests use installed
Google Chrome on macOS or Playwright Chromium elsewhere (`npx playwright install
chromium` if needed). Unit/API tests cover scoring, tie handling, timestamps,
submission/deadline constraints, source preservation, immutable quote selection,
HTTP origin/host restrictions, and private file denial.

Visual references remain provisional. Brand QA checks shared color tokens,
original vector marks, no team/sportsbook marks, reduced motion, explicit data
states, keyboard access, responsive layout and source labels. Compact metadata
is part of this provisional design, pending the user's design review.

No deployment, new external account, GitHub push, paid service, or notification
activation is implied by these local checks.

The later shared-access work has separate remote evidence and remaining release
steps in [CLOUD_SETUP.md](CLOUD_SETUP.md). The local preview and its storage remain
independent of that cloud setup.

## Source coverage

The referenced “Build Guess The Line Repo” chat was read through the available
chat reader. It returned five recent turns with no older cursor. Older discussion
and the contents of its screenshot are not represented as a complete transcript.
Repository rules, picks, snapshots, and the nine open GitHub issues were inspected
and used as implementation evidence. The separate snapshot-linking work arriving
in this checkout was preserved rather than replaced.

### Verified local results

On October 8, 2026: 18 Node unit/API tests, 6 real-browser workflow/layout tests,
and the existing 9 Python snapshot tests passed. The frontend production build
passed. Desktop, 390px, and 320px screenshots were reviewed; no horizontal page
overflow or browser page errors were observed in tested flows. The compiled local
service returned 96.4 points, 15 games, and three snapshots. Original prediction
and historical snapshot files have no diff from the cloned repository. The
snapshot viewer's separate latest-pointer repair is preserved.

All app state changed by browser tests used a disposable temporary store. The
owner's current player ballots were not filled with test data. Brand selections
remain open; the user has been asked to choose a primary logo direction.

## D-02 release scope — October 8

The confirmed rule is lock-on-submission for each prediction mode, including
practice games. The interface reviews all entries before final submission, then
opens the relevant analysis board. Backend validation rejects subsequent scored
guess changes even from an outdated frontend. An already-submitted historical
ballot locks at its currently stored values; neither guesses nor audit evidence
are rewritten retroactively. Drafts remain editable until submission or deadline.

The board requests outside models, public ticket share, money/handle share,
betting volume and sharp-action evidence. These sources are not connected.
Available historical guess-to-market discrepancies stay clearly unofficial.
Provider samples are not the entire market, and point gaps or public percentages
do not prove positive expected value or sharp bettor action. Separate personal
forecasts remain future work.

A submitted spread ballot never unlocks an unsubmitted total ballot’s analysis.
D-04 confirms both reported absolute ticket counts and Over/Under ticket percentages, with provider sample coverage and timestamps. No feed, free-provider account, key or model output is created by
these interface changes. See the updated [provider evaluation](ODDS_PROVIDER_EVALUATION.md).


## Shared weekly entries and appearance — current cloud behavior
D-05/D-06 are deployed: each account reuses the same weekly spread ballot, total
ballot and Challenge selections across all groups, including groups joined later.
Group rosters and standings remain separate. Conflicting stale saves are rejected;
submitted predictions and recorded Challenge quotes remain immutable. Practice
provenance follows the entries across groups. Original private league JSON is
preserved; canonical cloud records supply the new views. The local owner preview
still uses its independent local file and is not a cloud synchronization mechanism.

Open **Settings & setup → Appearance** for Light, Dark or System. The same control
is on sign-in and My games. It remembers this browser/device’s choice, with Dark
the default. Final brand approval remains separate. Current deployment and exact
preservation/readback evidence are in [CLOUD_SETUP.md](CLOUD_SETUP.md).

## The new app switch (redesign stage 9, D-38 and D-39)
Every signed-in member sees **Try the new app** in the Community footer (D-39:
the whole league, opt-in; no tester list) from the first-look deploy. Until then
a production build leaves it out (`NEW_APP_OFFERED`, on only with
`VITE_GTL_OFFER_NEW_APP=1`, which the browser test configs set). The choice is kept on this device
(`gtl.app` in localStorage, `web/src/appView.js`) and the page reloads into the
new app, a separate lazy chunk (`web/src/next/NextApp.jsx`, with its own CSS)
that a device on the old app never downloads. **Use the old app** in the new app
switches back. Every switch reloads the page, so the two apps never run together;
both use the same sign-in, routes and tables, so a pick or bet made in one shows in
the other. The switch is a convenience, not a security gate.

- The default stays the old app until the flip (build plan stage 80). Nothing
  saved, an unknown value or storage that throws all mean the default.
- `?app=classic` always opens the old app and keeps that choice for this device.
- If the new app's chunk cannot load, the old app opens in its place, the saved
  choice is cleared and the footer says so.
- If the browser refuses to save the choice, the old app stays open and the
  footer says why.

### The new app's frame (redesign stage 10)
Since stage 10 the new app opens on its frame (`web/src/next/shell/`), which still
reads and writes nothing and calls no route; the data layer arrives in stage 11.

- **Top bar:** the Field monogram (Home), the league pill (Community until stage 11
  reads your leagues; it opens "Your leagues", which sends groups and invites to the
  old app for now) and your avatar, which opens the menu: **Appearance** (Dark, Light
  or System, and Reduce motion), **Use the old app** and **Sign out**. Appearance
  and Reduce motion are kept on this device under the old app's own keys
  (`gtl.theme` and the motion choice in `gtl.dashboard.preferences.v1`), so both
  apps always agree.
- **Five tabs:** Home, Play, Bets, Lines and League, each with a "Coming next" card
  that says what the tab is for and offers Use the old app. Each tab and page has
  its own error card (Try again, Use the old app), so one failing screen never takes
  the app down.
- **Address and Back:** the tab is the address fragment (`#home`, `#play`, `#bets`,
  `#lines`, `#league`), so a reload keeps the tab and Back moves between tabs. While
  a sheet, dialog, page or celebration is open, the phone's Back button closes it
  first. The old app's links still work: `#picks` (and `#picks-spread`,
  `#picks-total`) open Play, `#feed` opens League, `#groups` opens "Your leagues".
  Sign-in and invite fragments, `#main` and `#picks-due` are left alone.
- **Layers:** one stack of sheets (a sub-view opens in place and keeps focus inside
  the sheet), one dialog, one popover, celebrations one at a time, and toasts one at
  a time 8 px above the tab bar or a dock bar, announced from one live region that
  is always in the page. An offline banner shows at the top when the browser is
  offline.
- Each tab has a slot file (`web/src/next/<tab>/index.js`: `homeTiles`, `counter`,
  `sheetActions`) that Home, the tab bar and the game sheet read; all are empty at
  stage 10.
