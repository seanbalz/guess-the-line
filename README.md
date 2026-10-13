# Guess The Line

**October 9, 2026 (D-21..D-25) — on `main` at `597ab59`, partly deployed:** PRs #10–#26
add the one-community social feed with a shared leaderboard and chip pick entry
(D-21), coming-soon leagues and a mark for all 32 teams (D-22), the never-delete
data rule with a weekly sit-out (D-23), the automatic Monday 12:00 AM PT week open
(D-24) and Ben's on-time Week 5 picks (D-25). Applied on the hosted Supabase
project today: the five remaining migrations, `gtl-week-open` v1 and the Monday
cron/schedule. Deployed from the Mac mini on October 12, 2026 from `main` at
`17c22b5`: `gtl-api` v15 and Pages `06c71c14`, so the live site shows the
Community screens; PR #35, PR #47 and the held PR #36 await a second deploy.
Week 6 opened automatically Monday October 12, 12:00 AM PT.
See the [October 9 release record](docs/RELEASE_2026_10_09.md) and the
[release checklist](docs/SOCIAL_COMMUNITY.md#release-checklist--october-9-2026).

**Latest verified release (October 12, 2026):** Pages `06c71c14` and authenticated
API v15, built from `main` at `17c22b5`, are deployed at [Guess The Line](https://guess-the-line.pages.dev), with
JWT verification enabled; see the [release record](docs/RELEASE_2026_10_09.md). The
October 8 release (Pages `2106725d`, API v14) included individual submission/edit-time
scoring, fresh-reference checks, sportsbook source details, Solo, reviewed quote
selections and final results, and the shared Bet Tracker with **Your betting
week**. Six migrations were applied. See the [release record](docs/RELEASE_2026_10_08.md)
and [cloud setup](docs/CLOUD_SETUP.md) for evidence and remaining work.

Release checks passed: **368 Node, 29 local browser, 79 cloud-style browser and
130 live access-denial checks**. These are separate checks, not proof of every
real-device workflow. The local cloud preview at `http://127.0.0.1:4173` serves the
exact production assets and uses the same hosted account data; the local owner
preview remains a separate store. Earlier evidence below is historical. Best Bets
and the complete D-18 virtual-pick flow remain separate work; the earlier "global
standings" item is answered by the D-21 shared community leaderboard, which is on
`main` and awaits the API and frontend deploy.


Private NFL prediction project for Sean, Troy and Luke. This checkout's remote is
[`seanbalz/guess-the-lines-repo`](https://github.com/seanbalz/guess-the-lines-repo).

The [Week 5 Score Snapshots chat](https://chatgpt.com/c/6ac75c83-f73c-83e8-8462-e6222f85091e)
is linked through [configuration](config/snapshots.json) and the
[evidence and handoff note](docs/WEEK_5_SNAPSHOT_LINK.md). This is a durable source
reference; it does not create automatic synchronization with ChatGPT or change
that chat's GitHub permissions or scheduled work.

## Run the private local dashboard

Requires Python 3.10+; no packages, account setup, or paid services are needed.

```sh
python3 scripts/snapshots.py check
python3 scripts/snapshots.py serve
```

Open <http://127.0.0.1:8765>. Both `/` and `/dashboard/` use the same dashboard.
Use `--port 8766` if the default port is occupied. Stop the viewer with Ctrl+C.

The viewer reads saved JSON on each open or refresh, validates predictions,
scores, and historical changes, and displays **provisional** scores with source
timestamps and quote age. It currently has three snapshots: **95.8 → 95.8 → 96.4**
out of 150. The latest capture is October 8, 2026, 8:02 AM Pacific. These are
historical records, not independently reverified live market quotes.

The server binds to this computer only, allows specific routes, and does not
serve raw `data/` files or `.git`. Predictions are absent from static HTML and
JavaScript; the local API supplies them to this private review. This is not a
multiuser authentication system. **Do not deploy the repository root as a public
static site:** tracked JSON contains private predictions. Production needs
authenticated APIs and league visibility rules.

## Connect a later saved snapshot

1. Save a separately sourced provisional snapshot as
   `data/snapshots/2026-week-05-<UTC timestamp>.json`, preserving older files.
2. Follow the latest snapshot's schema: capture time, source URL/page timestamp,
   signed home spreads, per-game scores and changes, and `previous_snapshot`
   pointing to the immediately preceding file. `picks_sha` is the Git **blob**
   hash of the prediction file, not a commit ID.
3. Run:

   ```sh
   python3 scripts/snapshots.py sync
   python3 scripts/snapshots.py check
   ```

4. Refresh the dashboard. Review changes in Git before publishing.

`sync` validates all snapshots, then atomically updates only `latest.json`. It
never edits predictions or historical snapshots, and orders records by time.
Missing games, inconsistent scores, changed predictions, broken history links,
or a stale pointer produce an error instead of fallback scores. Revised
predictions require historical pick versioning before this viewer can compare
them; it rejects a mismatch rather than rewriting history.

## Validation

```sh
python3 -m unittest discover -s tests -v
node --check dashboard/app.js
git diff --check
```

Tests cover score/delta integrity, signed away favorites, invalid and duplicate
games, unchanged predictions, pointer repair, stale quotes, provisional status,
and local HTTP access boundaries. Node is optional, for the JavaScript syntax
check only. Browser QA is recorded in the [linkage note](docs/WEEK_5_SNAPSHOT_LINK.md).

## Historical limits of the snapshot-only viewer

These limits describe the original local linkage only. They do not describe the later authenticated cloud app; use the latest release summary above and the tracker for that system.

- No live odds collector, scheduled polling, automatic Git pull, official kickoff
  freeze, or production hosting is established by this change.
- Source websites and the NFL schedule have not been independently reverified.
- Only Sean's spread predictions are available; comparative standings require
  the other players' predictions. Guess the Total remains unsubmitted.
- Broader application plans remain in [the handoff](docs/AGENT_HANDOFF.md).
- Brand choices remain provisional. The viewer uses [shared tokens](design/tokens.json),
  including the brand guide's white-paper print treatment.

Owner: Sean Balsiger · Local snapshot linkage v1 · October 8, 2026.

## New dashboard and three game modes

The responsive dashboard and local game workspace are also available:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173 for Guess the Spread, Guess the Total, Betting Challenge,
leaderboards, historical comparisons, saved ballots and audit export. This is
separate from the read-only Python snapshot viewer above. The Node service stores
new edits locally; original repository predictions and historical snapshots stay
unchanged. The [online sign-in page](https://guess-the-line.pages.dev) and protected
cloud backend are deployed; Sean’s signed-in read and profile/game/invitation writes are verified. Steven’s confirmed account and submitted spread picks are verified; general email delivery and second-device checks remain pending. Three-book odds collection is connected with an active twelve-hour hosted schedule. Results ingestion, outside models and betting-activity feeds remain unconnected. See [shared access setup](docs/CLOUD_SETUP.md).
See [dashboard setup, rules, verification and remaining work](docs/DASHBOARD_APP.md).


Current cloud release: **Guess The Line** uses the selected Yardline G identity and Field monogram icon. The Dashboard has independent **Spread / Over/Under** views with expandable accuracy/gap bars and recorded line charts. Spread and Total points use each guess's saved submission/edit-time reference; the latest collected consensus appears separately, and historical missing references stay unscored. **Customize dashboard** provides five layouts, section visibility, motion and in-page notices, saved on this device. Hosted collection runs every twelve hours for the validated current slate; it does not automatically freeze a historical kickoff benchmark or create future-week slates. Weekly Spread, Total and Challenge selections are shared
across every group on the same signed-in account. Sean’s original 15 spreads are
preserved. Light/Dark/System is under **Settings & setup → Appearance** and on
My games/sign-in; theme preference stays on each device. The intended recipient
has accepted the Sean & Steven invitation. On `main` since D-21 (October 9) every
Guess pick is entered with chips (favorite team or Pick'em, then a half-point chip;
totals around a central value) on the Community Picks tab and on the group game
screens; the typed number field, favorite dropdown and stepper are removed. That
build shipped in Pages `06c71c14` on October 12, 2026. See the
project tracker (`planning/project-tracker.html`, generated by `planning/render-tracker.mjs` from `planning/project-tracker.json`) for completed and outstanding work. Sean decided on October 9, 2026 to commit the tracker as-is (v62, reviewed October 8); the dated release records in `docs/RELEASE_*.md` remain the deployment evidence. On October 12, 2026 Sean froze that tracker as a historical register: current work is tracked on the Guess The Line Status Board artifact (private to Sean), and new work is not added to the JSON.

A [historical GTL model prototype](docs/MODEL_VALIDATION.md) has been backtested,
but does not beat its simple baseline and has no verified current-season inputs.
It is not published as a weekly forecast or betting recommendation. Permitted
outside forecasts, betting-activity data and official team-logo assets remain
separate work; see [visual polish](docs/VISUAL_POLISH.md).

## Shared Bet Tracker and weekly unit records

The main Dashboard includes **Your betting week**, with current-week records, risk, pending bets, ROI coverage and links into the shared tracker. **Bet Tracker** and **Unit Betting** provide shared singles, parlays, following, reviewed tails, player comparisons and ROI history. New tickets count by default; owners can exclude them with a visible audit. Private Solo entries and hidden prediction ballots remain separate. These features are included in the [current production release](docs/RELEASE_2026_10_08.md). Troy's fourteen singles and Sean's two supplied parlays are now saved under their live accounts and visible to every signed-in player; see the [verified import](docs/SOCIAL_BET_IMPORT_2026_10_08.md). Production and the local cloud preview on port 4173 use the same hosted records. See [Social Bet Tracker](docs/SOCIAL_BET_TRACKER.md) for accounting, historical feature tests and the remaining D-18 virtual-game work.

## Guess the Spread / Guess the Total scoring engine

A TypeScript engine scores both Guess modes separately from commissioner-entered picks and manually recorded, timestamped named-book quotes, using D-16 submission-time references (decision D-20). Run `npm ci`, `npm run test:engine`, then `npm run score -- --week 6`. File formats, the benchmark gate and the current limitations are documented in the [scoring engine guide](docs/SCORING_ENGINE.md). It is a local commissioner tool and is not yet wired into the dashboard app.
