# EPL expansion — November 9, 2026

Owner: Sean Balsiger. Status: requirements confirmed in this conversation;
implementation and release evidence pending. Based on freshly fetched main
`9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`.

## Confirmed behavior

1. Each match offers two-way draw-no-bet or three-way home/draw/away American
   moneyline guessing. Choose one outcome and enter one price, not all three.
   Each manager has one guess per match, in either market. Market, outcome and
   price become final together at lock-in. Existing drafts, guesses, history,
   references, kickoff locks and reveal permissions remain intact.
2. Both markets feed the same leaderboard using the existing average American
   price distance (with -100 and +100 equivalent). References remain fixed at
   lock-in under the existing pending-reference rule. Missing references remain
   unscored, never replaced with invented or post-kickoff prices.
3. EPL Bets gains automatic recommendations from the player's locked guesses
   versus the latest available same-market odds. Favorable gap alone orders the
   list; trends and analysis explain/support/flag concerns without reordering or
   excluding candidates. No manual publishing or independent-model ranking in
   this version. Show market, outcome, guess, comparison, source/time and gap.
   A guess of sportsbook price is not an estimated outcome probability or proof
   of profitable expected value. Retain that distinction in the explanation.
4. Commissioner score entry accepts Sleeper screenshots. Extract candidates,
   then let the commissioner review/edit all eight manager scores before any
   durable write. Screenshots are taken after Pick a Team bonuses are included
   in Sleeper: use displayed final weekly totals and do not add bonuses again.
5. Confirmation calculates ascending weekly-score order, using the existing
   lower season-total tiebreaker, opens the next draft and notifies the first
   picker through opted-in push. Preserve existing picks and audit every import.
   Incomplete/ambiguous extraction never silently supplies zero or publishes.
6. Announce Pick a Team results on EPL Home and Pick a Team as soon as all of
   the week's results are verified final (or explicitly postponed under the
   existing rules), independently of fantasy capture/upload or draft opening.
   Show winning manager(s), club, result, margin and earned bonus. Retain widest
   margin, goals scored/conceded, full shared-tie awards and no-winner rules.
   Notify opted-in league members through push; retries must not duplicate an
   announcement. No guessed finals from elapsed time or a missing feed row.

## Implementation boundaries

- Keep the selected GTL Prism kit and tokens. Commissioner-only imports and
  account-scoped recommendations stay behind authenticated API permissions.
- Keep private screenshots, extracted scores, player guesses and source
  payloads out of Git, static bundles, public objects, logs and notifications to
  unrelated users. Audit import source hashes and confirmed corrections.
- Reuse free permitted providers and existing shared quota/reserve protections.
  Verify three-way outcome completeness and matching event identity. Reference
  collection and result availability are separate from product rules.
- Existing M-32/M-36 moneyline code is two-way only; old API clients must keep
  reading/saving two-way guesses during rollout. New writers must positively
  detect schema capability before offering three-way entry.
- Existing settlement waits for cumulative Sleeper snapshots before storing
  awards/opening the next week. Result announcement must be separated from
  that dependency. A confirmed weekly-score import is an explicit source and
  must not masquerade as an automatic cumulative snapshot.
- The current settlement schedule is roughly twelve-hourly. A winner banner
  alone cannot satisfy the final-match timing goal. Build and verify bounded
  collection around the last match, retaining the free allocation and reserve;
  delays or missing verified results must remain visibly pending.
- Missing next-week fixtures or a started/already-picked draft must not result
  in fabricated kickoff times or an overwritten order. Preserve the confirmed
  import and clearly report the remaining opening prerequisite.
- OCR should run locally in the browser using a free engine with explicit
  review and correction; test on representative screenshots before claiming
  extraction acceptance. No new paid OCR service is authorized.

## Delivery sequence

1. Market-aware storage, references and collection; then the two/three-way
   selector and combined scoring. Verify legacy two-way preservation and
   capability-gated rollout before enabling the new market.
2. Account-scoped EPL recommendations and sourced trend context. Reads reuse
   stored permitted evidence; opening the screen must not buy provider calls.
3. Commissioner screenshot extraction, reviewed weekly-score import, order
   preview within the confirmation screen, atomic opening and first-turn notice.
4. Independent verified results, Home/Pick a Team winner cards, durable opt-in
   notifications and bounded final-match collection; exercise the full weekly
   cycle before claiming completion.

Input still needed for extraction design: a representative final Sleeper score
screenshot (or several screenshots covering the league). Confirm where the
matchweek, manager identity, actual weekly score and any season-total tiebreak
appear. Do not infer the screenshot layout or confuse projections with scores.

## Verification and release

Required: SQL lock/one-market invariants, cross-market references, combined
leaderboard and reveal isolation; API permissions and bounded replies; OCR
ambiguity/duplicate/missing-manager handling; atomic import/opening and existing
pick preservation; result-finality, tied/no winners and notification deduplication;
mobile light/dark UI, keyboard/error recovery; build, privacy, Brand QA and CI.

Record named migration dependencies, rollback/compatibility and actual hosted
status separately. No migration apply, deployment, live import or notification
is established by this requirements record.
