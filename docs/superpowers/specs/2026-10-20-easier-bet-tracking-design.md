# Guess The Line — easier actual-bet tracking

Owner: Sean Balsiger · Version 1 · October 20, 2026

Status: implementation authorized. Sean selected actual bets first, with
Virtual Units in a separate view, then requested completion, deployment and sync.
Actual release evidence is recorded separately in the release card.

## Scope and approach

Prioritize Q16 after the completed private-week/results repair. Improve the
existing shared ticket tracker rather than create a second ticket store.
Actual-ticket reads already work accountwide through `/social/read`; the
unhosted M-10 Virtual Units reader is not a prerequisite for this milestone.

Alternatives considered: navigation-only changes would leave entry cumbersome;
a replacement tracker would duplicate corrections, privacy and recovery logic.
Reusing the existing tracker provides the complete entry-to-history improvement
while preserving existing tickets and audits.

## My bets landing

- The Bets destination opens on the signed-in player's actual tickets for the
  current published week, with **My bets** selected and one prominent **Add bet**.
- Virtual Units and Recommended remain separate destinations within Bets.
  Opening an explicit existing Virtual Units destination still honors it.
- Show **All**, **Pending**, and **Settled** result controls, plus **All markets**,
  **Spreads**, **Totals**, and **Props**. Settled includes win, loss, push and void;
  the existing ROI rules still exclude void and incomplete returns.
- Keep a visible week picker and an **All weeks** option. My bets keeps the owner
  scope across weeks. Switching to the shared feed or comparisons is explicit.
- Apply filters before deriving the displayed list, counts and summaries. A
  filtered subtotal must be labelled as filtered, never as an official record.
  Preserve existing market matching for parlay legs; a parlay counts once.
- Keep detailed filters, shared feed, comparisons, corrections, inclusion controls,
  and audits reachable. Separate empty account/week and no-matching-filter states;
  offer Add bet for the former and Clear filters for the latter.
- Account changes clear prior account data immediately. Late responses must not
  show another account's or an earlier filter's entries as the current selection.

## Faster entry

Reconcile the eight unpublished files in the Mini's `codex/button-bet-entry`
worktree against current main; do not overwrite, reset or commit that worktree.
Its existing October 15 design supplies reusable entry controls, not verified
production behavior. Review and test its code before incorporating named changes.

Use buttons for verified matchups, market, team/Over/Under, common lines, odds,
units and sportsbook. Spread direction is explicit: Favorite (−), Underdog (+),
and Pick'em. Keep half-point adjustment and custom exact values. Changing a
matchup clears that leg's team and line; each parlay leg remains independent.
Player props retain text for player and exact selection. Optional notes and
timestamps can be expanded; tailing retains required timestamps and confirmation.

Presets describe the user's ticket, not fetched quotes. Do not invent odds or
stakes, silently assume −110, or imply a sportsbook integration. Preserve Unknown
and custom entry. The existing final Save is the only write. Preserve required
field validation when replacing inputs with buttons, duplicate-save protection,
conflict handling, draft protection and uncertain-save recovery.

## Data and privacy boundaries

Actual bets remain records of tickets placed elsewhere, shared with signed-in
players under existing rules. My bets is a personal filter, not a private journal.
Results remain player reported and correctable with an audit. Do not automatically
settle sportsbook tickets from the new Virtual Units final-results worker.

Preserve existing stake units and labels. Dollar-stake storage, sportsbook import,
receipt scanning, new recommendations, Fantasy tools and Virtual Units placement
are separate milestones. Do not relabel stored units as dollars. Preserve game/
market line locks for other players and the associated note/audit redactions.

Prefer existing `/social/*` behavior. If a grouped Settled filter needs shared
filter logic, update the authoritative projection consistently for lists, charts
and metrics, and test both local and hosted-handler paths. Any runtime dependency
must be identified before deployment; never deploy a frontend that assumes an
unavailable server filter.

## Presentation and acceptance

Use the current brand tokens and shared components, preserving the old-app editor
and the new-app token bridge. At 320px and 390px, light/dark themes: readable
16px interactive labels, at least 44px targets, no page overflow, visible save/
cancel controls, keyboard focus and labelled dialog/choice controls.

Required coverage: own-account default; explicit shared/Virtual navigation;
pending/settled and market combinations; all-week owner retention; consistent
metrics including parlays, voids and unknown returns; account/filter race handling;
button-only spread/total entry; custom/unknown values; independent parlay legs;
tail confirmation; correction and uncertain-save recovery; line-lock privacy.
Use fixtures for writes, never production competition picks or synthetic tickets.

Completion requires reviewed named changes, relevant local tests, all required
exact-source CI, merge, compatible Pages/API deployment only as needed, live
asset/read verification, and clean sync of Windows main, Mini shared-sync and
Neo main. Preserve other worktrees. Record actual release versions and outcomes;
browser fixtures do not establish physical-phone acceptance.

References: [queue](../../../planning/PLATFORM_WORK_QUEUE.md),
[tracker rules](../../SOCIAL_BET_TRACKER.md),
[brand](../../BRAND_GUIDE.md), [sync](../../REPOSITORY_SYNC.md),
[release](../../SHARED_DEPLOYMENT.md).
