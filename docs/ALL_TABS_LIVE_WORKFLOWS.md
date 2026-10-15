# Guess The Line — all five tabs using hosted workflows

Owner: Sean Balsiger · Version 1 · October 14, 2026

Sean asked to get the application running on all of its tabs. This release connects
the existing hosted workflows to the new shell while the later redesign stages
remain in progress. It replaces the Play, Bets and League placeholder screens.
Deployment evidence belongs in the dated release record; this document describes
the implementation and its boundaries.

| Tab | Available workflow | Data and scope |
| --- | --- | --- |
| Home | Weekly status, separate Spread/Total ranks, Make picks opens Play | Shared authenticated Community read; refreshed after successful entries |
| Play | Draft recovery, whole-market submission, edits before the deadline, independent Spread/Total ballots, sit-out and submission receipts | Existing account-wide personal ballot routes; the server's live rules decide editability |
| Bets | Tracked bets, corrections, reported results, following, history and comparison; Virtual Units in an eligible selected group | Tracked bets are shared with signed-in Community members. Virtual Units always names the selected private group; Community never defaults to Triple Threat |
| Lines | Schedule, own saved scoring references, permitted trends, weather, records and game details | Existing authenticated personal data and permitted public research. The new current-line readers remain a later stage |
| League | Community activity, likes, comments, separate market standings and history; selected private group's weekly standings | Community data is explicitly global. Private rosters and standings come only from that group's authenticated state route |

## Rules and release scope

This is a functional bridge, not completion of stages 29–81. No database migration,
collector schedule, odds budget, default-app setting or reveal rule changes here.
M-02 is still unapplied: live Week 6 ballots use full-market Submit and remain
editable until the configured deadline. There is no new per-game Lock in action
and no promise of late picking. The server remains authoritative in both apps.

`DEFAULT_APP` remains `classic`; **Try the new app** opens the five-tab shell and
the device remembers that choice. **Use the old app** remains in the menu.
League creation and invitations remain reachable in the original app and existing
league joining/switching stays in the new shell. Native replacements and the
full redesign cutover retain their separately recorded gates.

## Intentional design exception

The existing WeekPicks, SocialBetTracker and VirtualUnits editors are reused to
make the tabs functional under today's hosted rules. Their original markup is
adapted inside `.gx-live-workflow` by `web/src/liveWorkflows.css`, which maps the
legacy components' token names onto D-38 tokens, restores controls after the new
shell's reset and places save controls above the tab bar. This scoped adapter is
temporary; it does not approve a new brand direction or retire the prototype.
History reuses `HistoryLine` so pending, provisional and imported reference
provenance remains identical to the established history screen.
Native new components continue to follow `design/tokens-next.json` and the strict
new-app token tests. The classic app keeps its existing styles.

## Data protection and save recovery

- Play keeps account/week/market draft recovery and the existing revision and
  request-ID checks. A successful save refreshes the shared Home and Lines reads.
- Bets warns before leaving unsaved work, including browser Back and league
  switching. A lost response does not silently retry. Tracked-bet recovery keeps
  the same request ID; Virtual Units checks saved terms before allowing another save.
- Comments retain the account/post draft and request ID across tab changes.
- Private group reads are keyed by account, league and market; switching scope
  clears the old rows, cancels the old read and ignores a late answer. Refusals
  remove the cached group data. Hidden values are never synthesized in the client.
- Hosted-account verification is read-only. Browser mutation tests use fictional
  accounts and local PGlite with the HOSTED migration inventory.

## Verification

The focused browser suites are `next-play-live.spec.js`, `next-bets-live.spec.js`
and `next-league-live.spec.js`. They exercise the real handler and hosted schema,
including successful saves, uncertainty, server refusals, independent markets,
membership scope and phone layouts. Existing shell, Community, Social and Virtual
Units tests remain part of regression validation. The dated release record lists
actual test outcomes, GitHub checks, deployment source and production readback.
