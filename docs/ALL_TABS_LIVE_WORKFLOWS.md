# Guess The Line — all five tabs using hosted workflows

Owner: Sean Balsiger · Version 2 · October 15, 2026

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
| Lines | Schedule, own saved scoring references, permitted trends, weather, records, game details and a private game-note editor | Existing authenticated personal data and permitted public research. Notes use the hosted M-09/M-29 owner-only routes; current-line readers remain a later stage |
| League | Community activity, likes, comments, separate market standings and history; selected private group's weekly standings | Community data is explicitly global. Private rosters and standings come only from that group's authenticated state route |

Me also includes an explicit display-name editor through the existing profile
route. The October 15 formatting, profile and note changes shipped as Pages
`fc7f3cd2` from `d71a988`; the [release record](RELEASE_2026_10_15.md) separates
deployment evidence, fixture-based save checks and remaining real-phone acceptance.

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
Play now supplies optional presentation components for padded matchup cards,
compact guidance, source details and a measured save dock. Favorite buttons show
team abbreviations so names never break across narrow controls; the matchup and
accessible button names retain the full teams. Its shared writer and
classic fallback remain intact. Bets adds `web/src/liveBets.css`, scoped under
`.gx .gx-bets`, for the existing forms and tables. League keeps comment drafts
mounted when the reply form is collapsed.
History reuses `HistoryLine` so pending, provisional and imported reference
provenance remains identical to the established history screen.
Native new components continue to follow `design/tokens-next.json` and the strict
new-app token tests. The classic app keeps its existing styles.

Stage 25 adds a narrow, capability-gated exception for per-game entry. The native
`PerGamePlay` editor reuses only the existing D-21 `ChipPicker` control and the pure
`communityDraft`/`soloDraft` recovery helpers. Classic `CommunityHome` and
`PersonalWorkspace` lazily load only `PerGameLegacy` when the server reports
`sentFinal: true`, `lateWindow: kickoff` and `perGameScoring: true`. That wrapper
mounts the same editor inside `.gx.gx-legacy-per-game` with D-38 scoped tokens,
base styles and `.gx-live-play` chip styles; it has no new-app shell or data-provider
dependency. Existing classic screen styles remain outside that root. The exact
imports and capability gates are allowlisted in `next-app-view.test.mjs`; arbitrary
cross-app screen imports remain forbidden. This implementation does not establish
that M-07 is applied or that per-game entry is enabled on the hosted site.

October 28 (D-65 follow-up) adds Menu › **Commissioner tools**, shown only to the
Community commissioner (`shell.communityAdmin`, the Community members grant). Its
native views (`web/src/next/me/commissioner/CommissionerTools.jsx`) cover the
schedule and settlement status (`/community/week-open`, the Triple Threat `/state`
odds schedule, `/virtual-units` and `/virtual-units/settle`), week opening
(`/community/publish-preview`, `/community/publish`) and game referees
(`/officials/read`, `/officials/set`). One adapter, `LegacyTools.jsx`, reuses the
old `ResultReviewControls` (Final scores, `/results/review`) and
`ManualOddsControls` (Odds connection, `/odds/preflight`, `/odds/collect`) inside
`.gx-live-workflow`, plus the pure `marketStatus.js` formatter. Both editors keep
their old gate: only the original Triple Threat commissioner sees them. No server
route or rule changes. The legacy D-16 benchmark freeze (`BenchmarkControls`) is not
carried over: it applies only under the retired common-reference scoring policy.

## Data protection and save recovery

- Play keeps account/week/market draft recovery and the existing revision and
  request-ID checks. A successful save refreshes the shared Home and Lines reads.
- Bets warns before leaving unsaved work, including browser Back and league
  switching. A lost response does not silently retry. Tracked-bet recovery keeps
  the same request ID; Virtual Units checks saved terms before allowing another save.
- Comments retain the account/post draft and request ID across tab changes.
- Profile drafts belong to the signed-in account. Saving checks the latest name
  first; an uncertain save must be checked before another deliberate save.
- Private notes retain exact text, revision and request ID in account/game/week
  drafts. Conflicts show both versions; an earlier save receipt cannot replace a
  known newer note. Neither opening nor saving a note creates a Favorite or post.
  Sign-out clears these private recovery drafts.
- Private group reads are keyed by account, league and market; switching scope
  clears the old rows, cancels the old read and ignores a late answer. Refusals
  remove the cached group data. Hidden values are never synthesized in the client.
- Hosted-account verification is read-only. Browser mutation tests use fictional
  accounts and local PGlite with the HOSTED migration inventory.

## Verification

The focused browser suites are `next-play-live.spec.js`, `next-bets-live.spec.js`
and `next-league-live.spec.js`, with `next-profile.spec.js` and
`next-game-notes.spec.js` for the new editors. They exercise the real handler and hosted schema,
including successful saves, uncertainty, server refusals, independent markets,
membership scope and phone layouts. Existing shell, Community, Social and Virtual
Units tests remain part of regression validation. The dated release record lists
actual test outcomes, GitHub checks, deployment source and production readback.

## October 16 — Fantasy adapter and Home preview

D-53 reuses #143: the new FantasyScreen wraps FantasyFootball with its next theme,
and FantasyHomeTile shares the named public snapshot hook from fantasyData.js.
The app shells remain separate; the shared snapshot contains no account data.
FantasyFootball uses only Button, Card, Segmented, Switch and LockLine from the
presentation kit for its next theme, and FantasyAccuracy.jsx uses Card and Pill; it
does not import the next shell or account context.

**October 28 (D-66):** Research › Fantasy no longer wraps FantasyFootball. The
new-app `FantasyNest.jsx` lays the same rankings out as nesting cards: the
rankings card, one player, the report card and compare. It is the adapter now and
imports only `fantasyData.js`, `fantasyContext.js` and `FantasyAccuracy.jsx`, the
snapshot and game-context reads and the report card, with the same
`shared/fantasy-*` engine. FantasyFootball stays for the old Community screen's
Fantasy tab.
