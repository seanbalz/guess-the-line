# Guess The Line — NBA daily board and private bets

Owner: Sean Balsiger · Version 1 · October 21, 2026

Status: proposed design for review. Sean selected **daily game board + bet
tracking first**, with NBA competitions later. That scope is confirmed; the
architecture and behavior below are proposed. This document does not establish
implementation, source access, deployment or final visual approval.

## Approach

Build an NBA section inside the existing application. An explicit NFL / NBA
switcher shares sign-in, profile and theme settings while selecting separate
sport navigation and data. Keep the private-group picker within NFL; it is not
the sport picker. NBA does not require an NFL ballot, published week or group
membership.

| Approach | Benefit | Cost |
|---|---|---|
| Separate NBA section in the same app — recommended | One account and familiar controls, with clear daily and accounting boundaries | Requires sport-aware routing and a separate NBA data adapter |
| NBA filter on the existing NFL screens | Smaller initial navigation change | Weekly competition assumptions and shared totals would need repeated exceptions |
| Separate NBA application | Independent product and release cycle | Duplicates navigation, account integration and ongoing maintenance |

The first release has **Games**, **My Bets** and **History**. It records actual
tickets placed elsewhere; it does not place wagers. NBA recommendations,
competitions, social sharing, Virtual Units, player-prop automation and Fantasy
are later milestones. No unrelated NFL refactor is part of this work.

## Daily Games

- Open on Today, with Yesterday, Tomorrow and a calendar available. Show the
  selected date and device timezone explicitly; a date is not an NFL week.
- Group games by scheduled, in progress and final. Each row shows the matchup,
  start time or game status, available verified scores, and one source/time line.
  Only an actual in-progress source status receives the LIVE treatment.
- A game opens its details and **Track bet**, which prefills its identity and
  matchup. Users enter the terms actually taken; no displayed game data is
  silently converted into a sportsbook quote.
- A date with no games has a distinct empty state. Failed refreshes retain the
  last valid board with its age and retry action; no cached result becomes fresh
  merely because the page reopened. Missing scores show an em dash, not zero.
- Store event timestamps in UTC and stable source game IDs. Group by the selected
  display timezone. A date rollover does not move an explicitly selected date or
  interrupt a bet draft. Rescheduled games keep their identity and audit history.

A permitted free schedule/results source is a launch dependency. Before wiring
it, record its reuse terms, NBA coverage, identifiers, update cadence, final/
postponed status semantics and rate limits. Qualify it with actual fixtures and
failure cases. Do not infer permission from an accessible endpoint or reuse NFL
provider capacity without a budget check. If no suitable source is verified,
report that dependency; do not substitute invented games or claim a live board.

Use shared server-side caching and a documented bounded refresh schedule.
Client refresh requests reuse that cache rather than multiplying provider calls.
Display the actual observation time; a periodically refreshed score is not a
promise of real-time delivery. Automatic sportsbook odds collection is outside
this release: a useful schedule/results board and manual ticket entry do not
depend on an odds subscription.

## My Bets and History

My Bets opens on all pending NBA tickets across dates, so an older unresolved
ticket cannot disappear at midnight. All and Settled controls remain visible.
History opens on settled NBA tickets with date-range, market and result filters;
All dates remains reachable. Both views use the same owner-scoped records.

Use compact grouped rows: matchup/selection first, then odds and units, with a
plain result label and net units aligned consistently. Expand a row for parlay
legs, source terms, notes and correction history. The overview shows pending
stake, settled record and net units; label any filtered subtotal as filtered.
Pending net is an em dash. A parlay is one ticket, one stake and one net result.

Existing archived tickets appear for their authenticated owner without another
import or duplicate copy. A new account starts empty. NBA tickets and summaries
remain private; neither NFL feeds nor NFL/Virtual Units totals include them.
Original source payloads and administrative import receipts are not exposed to
the browser. Ticket details receive only reviewed, owner-appropriate fields.

## Entry and results

Support moneyline, spread and game-total singles, plus parlays composed of these
markets. Each leg retains its game, selection, market and applicable line. Use
one explicit final Save, protect drafts when leaving, disable duplicate saves
and recover uncertain responses by ticket ID before retrying.

Accept American odds or Novig implied probability. Retain the original format
and probability as provenance alongside the converted price. For probability
`p` between zero and one, American odds are `-100p/(1-p)` above 0.5 and
`100(1-p)/p` below 0.5; 0.5 is +100. Validate both input and storage bounds.
Preserve the existing four-decimal stored price and eight-decimal accounting
precision. Display rounding must not rewrite historical prices or net results.

Require a confirmed stake in Units (U) and ticket price to save a new ticket;
incomplete inputs remain a draft. Sean's past import defaults are provenance of
those records, not silent defaults for every user. A parlay requires its quoted
combined odds; do not multiply leg prices to invent a price, including when legs
are correlated. Show a summary of all legs, combined price and stake before Save.

First-release bet outcomes are owner-confirmed: Pending, Win, Loss, Push or Void.
Verified game scores provide context, but do not automatically settle actual
bookmaker tickets. Bookmaker rules, overtime exclusions, reduced parlays and
cashouts cannot be inferred from a scoreboard. Do not offer fabricated cashout
or partial-return calculations; preserve an unresolved ticket until its actual
terms/result can be represented correctly.

Wins use the saved American price, losses subtract the stake, push/void return
zero net, and pending is excluded from realized net. Display wins, losses,
pushes and voids separately. Editing terms or correcting a result requires an
audited change and recalculates the same ticket, preserving its previous values
and original source. Later automated grading is a separate reviewed milestone.

## Application and privacy boundaries

The existing [NBA archive](../../PRIVATE_NBA_STORAGE.md) is administrator-only;
app access does not exist yet. Build a narrow authenticated NBA read/write
contract with server-derived identity and database-enforced owner checks. Deny
cross-owner access on individual tickets, lists, summaries, receipts and updates.
Do not grant broad table access or expose the private schema through the Data
API. Never ship a service credential, raw import or private ticket in public
assets, public routes or shared feeds.

Keep `nba_private.bets` as the authoritative ticket store. Add only the reviewed
support needed for owner operations, correction audits and manual-entry source
receipts; preserve existing IDs, ownership, terms, imports and generated net
units. A manual-entry receipt must be distinguishable from an imported source.
Schedule/results data are separate from private tickets. Any privileged writer
must have a fixed search path, minimum grants and identity checks that cannot be
replaced by a client-supplied owner ID.

Separate the implementation into sport routing, an NBA data adapter, schedule/
results ingestion and the ticket operations/accounting layer. Reuse the existing
shell and presentational primitives, not NFL eligibility gates or shared social
ticket readers. Authentication failures show sign-in/retry without suggesting
that a user must join an NFL group.

Browser back/forward restores sport, screen and selected date/filter. Preserve
unsaved work when changing sports. Account changes immediately clear private
state; stale responses from another account, sport or date cannot replace the
current view. Server validation/conflict errors preserve entered values and
explain whether the ticket saved. Distinguish an empty account from a failed read.

## Presentation

Follow the [Brand Guide](../../BRAND_GUIDE.md),
[new-app tokens](../../../design/tokens-next.json) and existing `gx-` components.
Use restrained grouped cards, clear spacing and subtle dividers consistent with
Sean's earlier layout references. This is a functional layout direction, not a
new palette, typography selection or claim of completed visual alternatives.

Keep Light, Dark and System support, 16px tappable labels, 44px minimum targets,
safe-area insets, visible keyboard focus and reduced-motion behavior. Status
must have words as well as color. Use original team abbreviation marks until
rights to any external marks are verified. Review actual mobile and desktop
screenshots during implementation; retain the current new-app width rules.

## Acceptance and release

The implementation plan must cover these observable checks:

1. A signed-in NBA user can open a daily board without an NFL week or roster.
   Dates, timezone changes, overnight games, reschedules and empty/error states
   behave correctly with verified source fixtures and bounded refreshes.
2. The archive reads back exactly for its owner; another account sees none of it.
   Anonymous access, guessed IDs, forged owners and stale account responses fail.
   NFL tickets, ballots, scores, totals and permissions remain unchanged.
3. A new single/parlay saves once, appears in My Bets, survives reload and moves
   into History after owner-confirmed settlement. A correction remains audited.
   Test uncertain saves, retries, concurrent edits and invalid input.
4. American/probability conversion, precision, parlay counting, push/void,
   pending exclusion and filtered totals agree between server and display.
   Source precision and existing historical accounting are preserved.
5. Games and ticket flows pass at 320px and 390px and desktop, light/dark,
   keyboard, accessibility and reduced motion. Label fixture/browser evidence
   separately from physical-phone acceptance.

Use disposable fixtures for writes, never synthetic production bets or
competition picks. Review additive migrations individually, with preservation
hashes and a rollback that seals access while retaining data. Required exact-
source CI, compatible API/Pages versions, fresh permission checks and live
read/asset verification precede release completion. Deploy only the dependencies
of this feature; no generic database push or unrelated migrations.

Record actual hosted source/versions and outcomes in a dedicated release card,
update the [completion register](../../COMPLETION_REGISTER.md), and synchronize
the clean Windows main, Mini shared-sync and Neo main checkouts under the
[repository sync workflow](../../REPOSITORY_SYNC.md). Preserve other worktrees.
There is no calendar or game-window release freeze.
