# Guess The Line — play modes and personal tracking

> **Local implementation addendum — October 8, 2026:** The earlier proposal below
> is retained as design history. Solo, Favorites/notes, private forecasts and the
> personal journal now have local SQL/API/UI implementations and tests. The journal
> records optional manually entered stakes, returns and outcomes by currency; it
> does not place bets or transfer money. Hosted delivery remains outstanding.
> [D-16](SUBMISSION_TIME_SCORING.md) supersedes any permanent Spread/Total lock below:
> predeadline edits capture a new reference only for changed guesses. Challenge
> selections remain immutable. Best Bets/friends contest terms remain undecided.
> See the [account worker report](../planning/worker-reports/accounts-and-personal-play.json)
> and [tracker](../planning/project-tracker.json) for current evidence and acceptance.

Owner: Sean Balsiger · Planning version 1 · Reviewed October 8, 2026.

**Requested scope:** track personal selections, play with friends or one opponent,
save favorites, and choose a smaller Best Bets card with confidence weights and
the ability to skip other matchups. This document defines a proposed design and
acceptance checks. It does not activate a competition or change existing picks.

**D-15 confirmed:** Best Bets is a separate optional confidence-weighted
competition. Guess the Spread and Guess the Total retain complete ballots and
their existing scoring. Numerical confidence limits, timing and settlement
details below remain proposals. Those unresolved rules are recorded for later
sequential decisions; this document does not ask additional questions.

## Keep records, competitions and bookmarks distinct

| Product area | Purpose | Proposed saved object | Effect on standings |
|---|---|---|---|
| My journal | Record a personal selection, its context and later result | Private journal entry with event, market, side, line, odds, quote source/time, recorded time and optional notes | None by itself |
| Competitions | Compare the same account's eligible selections with a roster under agreed rules | Competition references and an immutable versioned ruleset | Only the named competition's scoring |
| Favorites | Save a matchup or research item to revisit | Private bookmark with target identity, saved time and optional tag | None; saving is not submitting |
| Best Bets | Select a subset and record confidence before results | Proposed weekly card referencing canonical Challenge selections, plus locked confidence allocations | Separate weighted score approved in D-15; exact rules pending |

The existing Guess competitions predict sportsbook numbers. The existing
Challenge records one immutable spread **or** total selection per NFL matchup,
reused across every group. Best Bets should reference that same selected side
and quote; marking it as a favorite or changing its display context must not
create a contradictory second competition pick.

A journal may eventually record multiple actual selections on the same matchup,
but this must be a separately labeled record, not a loophole in the Challenge's
one-pick limit. Financial stake, payout and profit fields are optional future
journal scope; the requested tracking does not turn existing contests into
bankroll competitions or initiate real-money bets or transfers.

## Solo, friends and one-on-one

Use context filters rather than separate copies of a player's entry:

- **Solo:** private journal, favorites, research and personal season records.
  No opponent or group is required. Account identity still supplies persistence
  across devices.
- **With friends:** a private group references members' eligible canonical
  entries. Each player must accept access; other groups and private journal
  details remain invisible. Sharing a journal item requires choosing its
  audience explicitly rather than exposing the whole journal.
- **One-on-one:** the existing Duel roster supplies a two-person view and its
  separate standings. A head-to-head matchup compares independently recorded
  choices; it does not require opponents to choose opposite sides or equal
  prices unless a later ruleset explicitly says so.

For example, a player's one recorded spread selection could appear in their
private journal, a friend group's Challenge and a Duel. Its source receipt and
outcome remain one record. A Best Bets card could attach a confidence weight to
that selection while each group's leaderboard remains separate. Favoriting the
matchup alone changes none of those records.

Troy's existing account is now linked to both Baustin Files and the fixed Triple
Threat slot; root verified shared ballots and preservation hashes. This is an
existing-access result, not implementation of the new tracking modes. Luke's
access is unchanged by this plan. Private email addresses and access tokens do
not belong in this document or public assets.

## Proposed Best Bets scoring choices

D-15 approves the separate weighted competition. None of the numerical values
below is an accepted rule yet.

| Approach | Example rules | Tradeoff |
|---|---|---|
| **Fixed confidence budget — recommended proposal** | Up to 10 confidence points per week; 1–5 points on each selected matchup; at most one spread OR total per matchup; any other matchup may be skipped. Win adds the weight, loss subtracts it, push or verified void scores zero. Unallocated confidence scores zero. | Comparable maximum exposure across players. Confidence affects the score without becoming a dollar stake. A player using fewer points may still finish ahead; show allocated points and participation beside score. |
| Flat contest points, confidence for research only — not selected | Each selected matchup scores +1/−1/0; confidence is recorded as a label or ordered rank and evaluated separately | Does not satisfy D-15's confidence-weighted competition; retain only as an optional journal comparison, not the Best Bets scoring implementation. |

Do not silently use a variable 1-to-N ranking when players choose different
numbers of games: its available score changes with N. Do not introduce
odds-weighted payouts, stake-based ranking or a bankroll as an implementation
shortcut. Those would require a separate decision.

If the fixed-budget proposal is selected, show a small **confidence used / limit**
bar, selected matchups and each weight. A skipped game needs no fake selection.
An empty card is **Not entered**, not a completed zero-score competitor.
Ties should remain ties in the first version unless Sean chooses a tiebreaker;
do not silently reward volume or fabricate a winning percentage for no results.

## Timing, locking and reveal

Existing protections remain mandatory until expressly superseded:

1. Spread and Total guesses remain separate and permanently lock on full-ballot
   submission. They keep their current scores and original timestamps.
2. Their market data and model outputs remain gated by the matching submitted
   ballot. Bookmarks, notifications, shared journal previews and Best Bets
   summaries must not reveal a still-hidden market. A projected score pair
   reveals both markets and requires both submissions.
3. Challenge picks remain immutable once confirmed and closed after their
   scheduled kickoff. A confidence card never edits the side, source, line,
   odds or original quote time.
4. **Proposed Best Bets rule:** finalize the whole card, including weights and
   skips, at one shared weekly deadline before the week's first game starts.
   Thursday kickoff is the candidate default, not an accepted new rule. After
   finalization, no reallocating confidence from a settled game to a later one.
5. **Proposed opponent reveal:** show a competitor's Best Bets only after the
   viewer finalizes their own card or the shared deadline passes, and only where
   the underlying Spread/Total visibility gates permit. A deadline alone does
   not expose an unsubmitted prediction market under current rules.
6. Late entries, cancellations, postponements and corrected results need explicit
   versioned rules. Until resolved, preserve the entry as pending or requiring
   adjudication; do not invent forfeits or rewrite a completed card.

A rolling per-game confidence lock is an alternative design, not an equivalent
implementation: it needs rules preventing changes after earlier outcomes become
known. Decide that separately if the shared weekly deadline is unsuitable.

For an already-placed personal selection, preserve both the reported placement
time and the actual journal-entry time; never backdate an audit. Logging a quote
before a blind ballot can establish prior market exposure. The eligibility and
visibility handling for that case needs an explicit rule, rather than silently
declaring the later prediction blind or changing its scores.

## Data and result prerequisites

- **Identity and storage:** store favorites, journal entries and confidence cards
  by authenticated account. Row-level/API checks must separate ownership,
  group membership and explicit sharing. Device-only storage is insufficient
  for the requested phone/desktop reuse.
- **Quote evidence:** a competition selection needs its exact canonical event,
  market, selected side, line, American odds, named source and observation time.
  A historical three-book median is a research reference, not proof of an
  offered price. Stale or missing evidence must remain labeled.
- **Results:** automated final-score ingestion and settlement are still
  unconnected. The first end-to-end version must either connect a permitted
  final-result source or implement an auditable commissioner review path.
  Pending games cannot be marked won or lost from model predictions or an
  in-progress score. Corrections append an explicit adjudication trail.
- **Models:** the historical GTL prototype exists but lacks current inputs and
  did not outperform its simpler baseline. Outside forecast permissions remain
  unresolved. Best Bets is a user-selected category, not a claim that the app
  has found profitable bets. Source/model evidence follows
  [MODEL_VALIDATION.md](MODEL_VALIDATION.md).
- **Free-only budget:** reuse permitted sources and cached observations. Any
  results collection needs a measured quota plan alongside the existing odds
  schedule. No paid feed, subscription or trial is assumed.
- **Notifications:** in-page notices exist separately from push, email and SMS.
  Delivery channels, permission, opt-outs, deduplication and preview privacy
  need implementation and verification. The twelve-hour odds schedule does not
  provide immediate line-movement delivery.

## Minimal dashboard design

Use the selected Field monogram and the existing tokens in `design/tokens.json`.
Start with three compact destinations: **My journal**, **Competitions**, and
**Saved**. Show **Best Bets** within the relevant competition view.
Context filters can select Solo, With friends or One-on-one without multiplying
top-level modes.

Cards lead with the matchup, selected side, confidence if applicable and the
actual status: Draft, Locked, Pending result, Won, Lost, Push or Voided. A tap
expands quote evidence, research, sharing context and audit. The dashboard should
not repeat unavailable source panels in every card. Confidence controls must
work with keyboard and touch, display their numeric value, and preserve reduced
motion and Light/Dark/System behavior.

## Three bounded follow-on categories

These are proposals after the core workflow, not additional competitions:

1. **Passed games:** optional skip reasons such as disagreement, stale quote or
   no clear view. Review passed games later without turning hindsight into a
   submitted pick or scoring omitted entries.
2. **Closing-line review:** compare the exact selected line with a sourced last
   pre-kickoff observation. Call it a recorded comparison until collection
   coverage establishes a true closing reference; a twelve-hour snapshot alone
   is not necessarily the close. Do not equate this metric with profit.
3. **Decision review:** show results by market, confidence band and decision
   source—personal read, GTL model, permitted outside model or disagreement.
   Display sample size and missing outcomes; keep Guess accuracy separate from
   Challenge/Best Bets results. Never claim improvement from a small sample.

## Running work list

Statuses below describe this plan as of October 8, 2026. They are not claims of
deployment or a live worker-monitoring service. The main project tracker remains
the cross-workstream register.

| ID | Status | Owner | Dependency | Acceptance evidence |
|---|---|---|---|---|
| PLAY-PLAN | Completed — planning only | Codex product worker | Current rules, brand guide and user request | This document distinguishes tracking, bookmarks and competition; proposals are labeled |
| PLAY-SCOPE | Completed — decision only | Sean | D-15 confirmed | Separate optional confidence-weighted Best Bets; Spread/Total remain complete ballots; numerical and timing rules still unselected |
| PLAY-FAVORITES | New | Implementation worker to be assigned | Authenticated storage and visibility contract | Save/remove survives sign-in on another device; private by default; no pick created and no hidden market leaks |
| PLAY-JOURNAL | New | Implementation worker to be assigned | Scope and exposure/duplicate-entry decisions | Private entry stores exact quote, placement/recorded times and append-only corrections; no unintended standings changes |
| PLAY-CONTEXT | New | Implementation worker to be assigned | Journal/competition separation | Same canonical selection appears across permitted contexts; other groups and unshared notes remain inaccessible |
| PLAY-CONFIDENCE | Blocked on rules | Sean, then implementation worker | PLAY-SCOPE; budget, deadline and reveal decisions | Budget is enforced server-side; skips work; final confirmation locks selection references and weights; no reallocation after lock |
| PLAY-SETTLEMENT | Open | Data/backend worker to be assigned | Permitted final results or explicit manual adjudication contract | Correct spread/total W-L-P and weighted score, pending/void states, corrected-result audit; original quote unchanged |
| PLAY-NOTICES | Open | Delivery worker to be assigned | Event definitions and channel choice | Opt-in, opt-out, no duplicates, authorized-recipient previews and actual delivery verified per channel |
| PLAY-RESEARCH | Open — historical prototype only | Model/data worker | Current licensed inputs, independent evaluation and quote receipts | Research shows source/version/age; missing model abstains; no unsupported EV or automatic selection |
| PLAY-REVIEW | Proposed | Unassigned | Core storage and settlement | Up to the three follow-on categories above with sample sizes and honest source coverage |
| PLAY-RELEASE | Blocked on implementation | Release worker to be assigned | Applicable items above | Mobile and keyboard checks, access-denial tests, cross-device persistence, original-pick hashes and live readback |

Before release, test that a second group never creates a second canonical pick,
concurrent saves cannot exceed confidence or per-game limits, a bookmark cannot
reveal Total after only Spread submission, and a repeated settlement request
cannot double-count a result. No first release date is committed by this plan.
