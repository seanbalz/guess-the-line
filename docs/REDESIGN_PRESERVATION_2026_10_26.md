# Redesign preservation and native member management

Owner: Sean Balsiger · Source audit October 26, 2026

This is the Q17-C working record. It reconciles destination families against
[the 191-row inventory](redesign/INVENTORY_HOMES.md) and the current source.
It is not a complete row-by-row acceptance audit or a hosted-data reconciliation.
Classic remains reachable. No records are removed, no migration is applied and
no real membership changes are performed by this work.

## Destination matrix

| Retained information or operation | Existing source destination | Remaining work / exit evidence |
| --- | --- | --- |
| Guess history and scores | New-app `league/LeagueHistory.jsx`, `/community/history`, `play/WeeklyScore.jsx`; existing community and group records retained. Stages 72–73 (branch `claude/redesign-history`): Me › History (`page.history`, Menu › History or `#history`) with Guess weeks for any member, the week detail, your drafts closed at kickoff and your changes in plain words (`/me/changes`, M-27), and Bets weeks from `/bets/read` | M-27 (`20261026230000_gtl_me_history.sql`) is written and not applied: Sean's "apply M-27", then the gtl-api and Pages deploys. Exit: merged, applied, deployed, and a signed-in readback of Week 5 (95.8 / 91.4 / 37.6) and of your own changes. Bets weeks move to `/bets/season` once stage 42 ships. |
| Actual bets, corrections and past weeks | `bets/Bets.jsx` uses the retained actual-ticket tracker; NBA has its owner-only bet reader | Native coverage of every historical entry, revision and old-unit slip must be verified before retirement; existing readers are not a preservation audit. |
| Virtual Units | Group reader remains; account-level Everyone reader exists | M-11 placement, M-12 boards and consolidated history remain Q06. |
| Retired Betting Challenge, group archives and Week 5 freeze | Classic group history and stored archives remain | Native read-only older-record destinations, including dates and ruled-reference labels: stages 72–74. |
| Saved games, private notes and forecasts | New-app `lines/GameNote.jsx` edits private game notes; classic `PersonalWorkspace.jsx` retains saved games and forecasts | Owner-only read-only saved games/forecasts/history and revisions: M-27 / stage 74. |
| Journal and archived journal records | Classic `PersonalWorkspace.jsx` includes archived records and revision history | Read-only native journal, summary and changes: stage 74. No new journal writer in the redesign. |
| Exports | Classic `App.jsx` downloads the existing group-week `/export` | Account-wide owner-only `/me/export`, excluding push endpoints: M-28 / stage 75. |
| Creation and invitations | Q17-A/B, PR #209: native creation and host invitation management | Merge/CI, production release and recipient/device readback are separate milestones. |
| Community membership | This change: Menu → Community members for the Community commissioner | Source/tests below; release and signed-in readback still required. This implements the Members slice of stage 78, not the complete stage 77/78 hub. |
| Other commissioner operations | Classic Week opening, referees, settlement/schedule, odds connection, final scores | Native tools hub and the remaining stage 78 pages. Keep settlement separate from Final scores; no secrets on Odds connection. |
| Sign-in and recovery | Shared existing AuthGate | Stage 76 native skin with unchanged auth/recovery behavior and account/device acceptance. |
| Unsaved drafts and legacy access | Existing classic escape path and tab recovery mechanisms remain | Group-draft reconciliation and actual-device recovery remain RETIRE-01. No access closure or cleanup before RETIRE-01–04 evidence. |

The next commissioner page after Members is **Settlement and schedule status**.
Its source/permissions and the current settlement contract must be reconciled
before implementation. Q17's record destinations, OPT-01 measured performance,
and the current queue remain open; a new Menu row does not complete them.

## Members implementation

`web/src/next/me/CommunityMembers.jsx` loads only when the commissioner opens it.
The Menu's permission comes from authenticated Community data, never a private
league's host flag. The screen refreshes on opening and again before a write;
failed reads or a revoked grant block changes. Self-removal is not offered and
remains refused by the server.

Remove and Restore require an explicit review. The existing
`POST /community/member` performs the change with its existing server grant and
audit; neither its SQL nor permissions change. D-23 copy explains that Community
access changes while guesses, scores, bets, posts/comments and private-league
memberships remain preserved under their existing visibility rules.

A pending write is recorded per account in this tab before sending. Lost replies
and failed readbacks require checking current access, including after reload;
there is no automatic mutation retry. A changed state returns to review. A known
saved response followed by a read failure remains labelled saved but awaiting a
list check. Duplicate clicks and the screen’s back/close controls during the request are blocked; late
replies are confined to the mounted account. Sign-out clears the normal recovery
storage. Blocked browser storage is disclosed on the pending check.

## Verification and boundaries

The dedicated browser suite uses the real handler and migrations on disposable
PGlite with fictional accounts. It verifies explicit cancel/remove/restore,
unchanged ballot/selection/post/comment/membership rows, retained standings,
removed-account denial, private-host denial, self-removal refusal, lost replies
and failed reads across reload, no duplicate writes, concurrency and a refreshed response without
commissioner permission. The last case overrides only the read response; the
fixed founding roster is not edited. It also checks lazy chunk loading and Light/Dark axe at
320px. Screenshots of the list and confirmation were visually inspected.

Local checks passed: six member browser cases, 24 existing shell/D-23 browser
cases, four lazy-loading/performance cases, 72 focused shell/data/token/app-boundary/
community contract tests, typecheck and Brand QA. The authenticated cloud build,
bundle-only privacy scan and manifest generation also passed. These used the
fixture Supabase URL/key; no hosted environment was contacted.
CI, merge, deployment and physical-iPhone acceptance must be recorded as their
own outcomes. Fixture browser tests do not establish hosted or phone acceptance.

### Integration after PR #209 and the separate optimization PR #210

The Members branch incorporates main at
`c42148747ecdc6c3190c4a1582baa921807376af`, including both merged PRs. All 24
combined Members, new-app data, Lines and classic Trends browser cases passed
against that integration. Typecheck, the 72 focused contracts, authenticated
cloud build and bundle-only privacy scan also passed again. This specifically
checks the new screen alongside #210's shared/parallel reads and the two PRs'
historical Trends fixture corrections. The broader phone baseline remains open.

### PR #211 CI follow-through

The only initial CI failure counted an invisible nested disclosure summary in
`next-scroll-navigation` as content obscured by the tab bar. Main's PR #212 fixes
that visibility helper and isolates the startup-read test from the prior page's
requests. This branch incorporates #212. This is a browser-test repair, not a
new product scroll defect; Sean's corrected no-scroll-bug report stays in force.
The 18 focused member, startup-data and scroll browser checks passed locally
with #212 integrated, including the scroll check's deliberate-failure tests.
