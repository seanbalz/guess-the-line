# Guess The Line — personal tracking and Best Bets architecture

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

Owner: Sean Balsiger · Prepared October 8, 2026 · Version 1

**Status: proposed implementation; separate Best Bets confirmed under D-15.**
This review inspected repository code and migrations. It does not constitute a
new live database or delivery verification. Sean confirmed keeping the existing
full-slate Guess the Spread and Guess the Total competitions and adding a
separate optional Best Bets card. Confidence weights and the other competition
terms remain unresolved. No journal/Best Bets schema or deployment change was
made by this architecture review.

## Confirmed separation and proposed implementation boundary

Keep four distinct objects: a private personal journal, a private shortlist,
the existing immutable Challenge selections, and separately accepted competition
entries. A saved sportsbook quote is evidence of an offered line; it is not
evidence that a wager was placed. Guess The Line records research and decisions;
it does not place bets, handle stakes, transfer money or settle payments.

| User activity | Proposed home | What it must not silently change |
|---|---|---|
| Track a bet privately without joining a group | Account-owned journal | Group membership, submitted guesses or public standings |
| Save an interesting game or selection | Account-owned Favorites shortlist | No bet, confidence claim or contest entry is created |
| Record the existing Challenge pick | Existing weekly Challenge selection | One immutable spread **or** total per NFL matchup, reused across groups |
| Select an optional subset and assign confidence | Separate Best Bets card, if approved | Existing full-ballot rules and accuracy scores |
| Compare against friends | Explicit competition entry with accepted terms | Private journal notes, unrelated groups and unshared entries |

The minimum first release can support NFL spread and total entries only, matching
the current validated event catalog. Moneylines, props, parlays, live betting,
multiple currencies and sportsbook-account synchronization are additional scope,
not consequences of the word “journal.” Optional stake/profit tracking, if wanted,
belongs only in the private journal until separately specified; existing
Challenge standings remain record-only.

## Current code that can be reused

| Repository evidence | Reuse | Limit |
|---|---|---|
| `cloud/handler.mjs`, `supabase/functions/gtl-api/index.ts` | Verified Auth identity, confirmed-email checks, request allowlists, bounded JSON, no-store responses, server-only service credentials | Existing game routes require active league membership; a solo journal needs an account route before that league-specific branch |
| `cloud/lobby.mjs`, `20261008174007_gtl_profiles_private_games_invites.sql` | Profiles, private Duels/Groups, recipient-bound invitation acceptance, membership checks, retry identifiers | Groups are not private journal storage; minimum capacity is two, and accepting a game invitation is not accepting a bet or competition rule set |
| `20261008182836_gtl_canonical_weekly_entries.sql`, `cloud/weekly.mjs` | Canonical account/season/week entries, row locking, revision checks, provenance and audit patterns | Challenge is keyed by user/season/week/game, has no edit path, and requires the matching submitted ballot; do not repurpose it as an editable journal |
| `server/domain.mjs` | Half-point/sign validation, final-score spread/total W–L–P arithmetic | `validateBet` rejects post-kickoff entries and quotes over six hours old; that is unsuitable for honest retrospective journal entry without a separate validator |
| `cloud/market-view.mjs`, `cloud/total-analysis-view.mjs` | Sourced, timestamped, independently gated market references and provisional Total analysis | A collected median is neither a particular executable sportsbook offer nor an official settlement result |
| `web/src/App.jsx` Challenge flow | Quote/side review and immutable selection interaction | Present copy describes manual unverified quotes; source labeling must survive any later provider-assisted flow |
| `web/src/DashboardPreferences.jsx` | Section visibility, motion and in-dashboard notice controls | Device-local presentation settings are not account-synced journal storage or phone/email/SMS delivery |

`gradeBet` can calculate a result from a final score supplied to it. There is no
connected results-ingestion route in the inspected cloud handler. This proposal
does not describe the existing app as automatically settling bets.

## Smallest durable account data model

The names below are proposed, not created. Use new tables rather than editing
the historical pick/snapshot JSON or adding journal data to league state.

| Object | Required content and constraints |
|---|---|
| `gtl_journal_entries` | Random ID, server-derived owner, canonical season/week/game identity, spread/total market, side, signed selected-side line, odds, source, quote time, entered-at server time, optional user-reported placed-at time, entry kind, revision and archive state |
| `gtl_journal_events` | Entry ID, owner, monotonic event sequence, request ID, action, server time, before/after revision and correction reason; append-only event history |
| `gtl_favorites` | Owner plus allowlisted target kind and canonical target ID; optional market; unique owner/target pair; created-at server time. Start with games and owned journal entries; broader favorites need a defined target catalog |
| `gtl_mutation_receipts` | Unique owner/operation/request UUID, normalized request hash and committed result/revision, written in the same transaction as the mutation |

Suggested journal kinds distinguish `research_note` from
`user_reported_placed_bet`. Promotion is an explicit action, not a side effect of
opening a quote or starring a game. Use separate observation time, recording
time and user-reported placement time. A late entry stays visibly late; it does
not gain contest eligibility because the user supplies an earlier timestamp.

Represent monetary values as exact decimal/minor-unit amounts if that optional
scope is approved. Confidence is a separate field and never a currency amount.
Free-text notes are bounded, escaped text, private by default and excluded from
public bundles, logs and shared competition projections.

Store references to any supporting source snapshot, personal forecast and model
version instead of silently refreshing the decision's historical rationale.
Deleting a favorite is reversible presentation housekeeping. Archiving a journal
entry removes it from active lists while preserving its audit; an account
deletion/retention policy needs separate implementation and documentation.

Index the owner plus pagination cursor for journal reads, owner/target for
favorites, entry/sequence for events, and actor/operation/request for receipts.
Use bounded cursor pages; do not return an entire account's journal in every
game-state response. Matchup identifiers such as `TB-DAL` repeat across seasons,
so references must include the canonical season/week identity or a stable
provider-mapped event ID, never a matchup string alone.

## Access, locks and retries

Use the existing authenticated Edge API boundary. New account routes obtain the
owner solely from the verified session and do not require a made-up solo league.
Suggested routes are `/journal`, `/journal/entry`, `/journal/correct`,
`/journal/archive`, `/favorites`, and `/favorite/set`; the final route names are
implementation choices. Reject client-supplied owner/role/verified/result flags.

Preserve the current server-mediated database pattern: enable RLS, revoke table
and function access from `PUBLIC`, `anon` and ordinary authenticated clients,
grant the minimum trusted-server privileges, and check ownership again inside
each service-only mutation/read function. Prefer invoker functions with an empty
search path and qualified names. RLS does not constrain a service-role request,
so it cannot replace those explicit owner and membership checks. If direct
client access is later chosen, it needs separately tested per-operation owner
policies, including both `USING` and `WITH CHECK` for updates. These distinctions
are documented in the current [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [database-function guidance](https://supabase.com/docs/guides/database/functions).

Within one transaction: authenticate/authorize, bind the request ID to its exact
normalized payload, lock the entry or card, compare its revision, validate the
transition, append its audit event, apply the state change and store the receipt.
An identical retry returns the original result; the same request ID with a
different payload fails. A stale revision returns a conflict, not a silent
overwrite. The current Challenge revision checks are reusable concepts but are
not a complete replay receipt for a lost-response journal write.

Private research notes may be revised with history. A user-reported placed bet
needs an explicit correction event rather than erasing the original line. Once
an entry is submitted to a competition, its published revision and confidence
are immutable under that competition's rules; later private corrections cannot
rewrite accepted opponent terms or retroactively improve contest scores.

## Protect hidden-market prediction games

New routes, favorites, invitations, notifications, exports and search must use
the same **per-market** reveal gate as the dashboard. Submitting Spread does not
unlock Total, and creating another group cannot create a new weekly ballot.

- A pre-submission favorite can show neutral schedule/team information. Do not
  embed a hidden quote, model number, gap, ranked edge or thumbnail in its list,
  preview text, notification or client payload.
- Provider-assisted journal entry and Best Bets research need the matching
  market's submitted ballot under the current rules. Do not waive that gate as
  part of the solo-workspace implementation.
- A private user-entered historical record is not proof of blind play. If solo
  users should research without completing predictions, define an explicit
  research-only participation/exposure rule before enabling that path. Never
  infer that rule or modify already submitted guesses.
- Never export another player's private journal, favorites, draft or unrelated
  group's selections. Owning a league or being its commissioner grants no
  access to members' personal journals.
- Shared previews should contain only the approved contest fields and only
  after the applicable reveal rule. Counts and ordering can leak information
  too; do not rank concealed picks by unseen model/market differences.

## Separate Best Bets and friend competitions

Add a versioned competition object associated with an existing private group,
explicit participants and a frozen rule version. Reuse profiles and group
invitations; separately record acceptance of the competition's rules. Membership
alone does not publish a user's private entries or accept an offered head-to-head
challenge. Preserve the fixed Triple Threat roster.

A minimal Best Bets entry can **reference an existing immutable weekly Challenge
selection** and attach the approved confidence weight. A card chooses an optional
subset; it does not create an alternative Challenge side or consume another
weekly prediction. Store the referenced selection identity plus an immutable
snapshot/hash so later reads and audit exports remain reproducible. If users
need Best Bets choices that differ from Challenge, that requires a new explicit
rule; it cannot be disguised as another group's version of D-06 selections.

Do not publish a live journal pointer. Publish an explicit immutable projection
containing only the accepted side/line/odds/time/source, confidence and relevant
rule/evidence IDs. Exclude private notes, stakes and unrelated favorites. A
head-to-head proposal needs two separately accepted participants and the same
versioned terms; edits after one acceptance require renewed acceptance.

The following rule fields remain unresolved, not defaults:

| Decision | Why implementation needs it |
|---|---|
| Optional subset size or minimum/maximum count | Prevents incomparable “one pick versus fifteen picks” leaderboards |
| Meaning and range of confidence | A rating, unique rank and allocation of points produce different scoring systems |
| Win/loss/push/void weights and tie-breaker | Determines whether confidence rewards wins, penalizes losses or both |
| Card-wide versus per-game deadline; reschedules/cancellations | Prevents selecting or reweighting a known result |
| Reveal after both cards, per-game lock or fixed time | Determines when opponent terms may be shown without information advantage |
| Reuse of confidence across groups | D-06 reuses selections; it does not yet decide new confidence-card reuse |
| Journal and Best Bets scope versus blind-play eligibility | Determines research-only participation without bypassing existing prediction gates |
| Disputes and correction authority | A private manual outcome is not an agreed head-to-head result |

Ask these sequentially after the confirmed D-15 separate-mode decision;
this document is not a request for a bulk questionnaire.

## Data, results and suggestions

Use only the approved free provider and its existing shared quota protections.
Favorites and journal edits must not trigger a fresh odds-provider call per
click. Reference saved snapshots with age labels; a twelve-hour capture is not
an executable current offer. Preserve named sportsbook price and timestamp when
recording an individual offered line, separately from the comparison median.

Offer private **manual, user-reported** outcome tracking first if approved. A
manual win/loss/push entry needs provenance and correction history; do not use it
as an official competition result or sportsbook-confirmed payout. A later
licensed final-score collector can support deterministic spread/total grading,
but finality, cancellations, postponed games, ties, overtime and result corrections
need explicit rules and replay-safe settlement events. Final NFL scores do not
prove how a sportsbook graded a particular real ticket.

The existing GTL model prototype does not provide validated current-week
recommendations. Keep current guesses, sourced market references, future
personal outcome forecasts and future named model forecasts distinct. Pin the
numbers actually consulted at selection time. Rank point differences as research
signals; confidence is a user's choice, not a calibrated probability. Public
tickets/handle/counts and verified sharp action remain source dependencies.
See [MODEL_VALIDATION.md](MODEL_VALIDATION.md) and
[ODDS_PROVIDER_EVALUATION.md](ODDS_PROVIDER_EVALUATION.md) for measured limits and
permission status. This proposal authorizes no paid source or wagering service.

## Incremental implementation and release gates

| Step | Concrete deliverable | Dependency and exit evidence |
|---|---|---|
| 0 — now | Preserve this architecture; map existing contracts and unanswered rules | Read-only evidence complete; D-15 separation confirmed. Weights and remaining competition rules are still pending |
| 1 | Specify one journal entry and shortlist flow with empty, saved, conflicting and corrected states | D-15 recorded; resolve scope-specific journal fields. Reuse selected icon and provisional tokens; 44px controls, light/dark and reduced motion |
| 2 | New private journal/favorites tables, account API, append-only audit and retry receipts | Local migration and ownership/concurrency tests pass; original weekly tables and source files unchanged |
| 3 | Account-level Personal workspace with Favorites and private manual tracking | Works for a confirmed account with zero groups; second-device readback; no hidden-market payloads or provider calls from starring |
| 4 | Optional Best Bets card and explicit competition acceptance | Count, confidence, lock, reveal and scoring rules resolved; chosen existing-selection reuse contract enforced server-side |
| 5 | Manual outcome review with agreed dispute handling | Private self-reports clearly separated from accepted competition results; correction and repeated-settlement tests pass |
| 6 | Current permitted model inputs and licensed result integration | Separate data licenses, coverage, point-in-time model validation and result-finality evidence complete |
| 7 | Isolated cloud release and live verification | Migrations/RPC denials, bundle privacy scan, two-account tests, preserved ballot hashes and rollback plan verified; deploy compiled frontend only |

Safe independent work while weighting and competition rules are pending is this repository/data
contract review, source-rights research, acceptance criteria and inventory of
missing rule decisions. It excludes modifying the current ballot rules,
enabling data feeds, sending invitations, creating paid services or deploying a
partially specified competition.

## Required verification

- Two confirmed accounts plus signed-out/invalid-token clients: journal,
  favorites, audit, receipts, exports and aggregate counts deny cross-owner
  access even for a shared-game commissioner; account with zero games works.
- Direct REST/RPC grants and Edge routes reject forged owner, role, verification,
  final-result and arbitrary target IDs. Private payloads never enter static
  assets, logs, cacheable responses or invitation links.
- Every combination of submitted/unsubmitted Spread and Total gates provider,
  model, difference ranking, favorite preview, competition and export data.
- Two devices, two groups, simultaneous writes, lost responses, repeated request
  IDs and changed-payload retries produce one audited mutation or a clear
  conflict. Test real database concurrency, not only sequential mocks.
- No change to immutable current weekly predictions, Challenge selections,
  eligibility rulings, historical snapshots or a frozen benchmark.
- Sign and total arithmetic, half-point limits, zero values, missing odds,
  retrospective timestamps, stale quotes, cancellation/void/push and final-result
  corrections remain distinct. No duplicate aggregate counting from sharing one
  selection into multiple competitions.
- Confidence limits, subset limits, accepted terms, kickoff races, reschedules,
  post-lock edits and opponent reveal operate against server time and stored
  rules. A private correction cannot mutate a submitted card.
- Phone layouts at 320/390px, keyboard controls, readout labels, contrast,
  reduced-motion and durable second-device persistence pass before release.

## Review provenance

Inspected October 8: the repository files named above, current rules/decisions,
brand guide and tokens, provider evaluation, and the Supabase RLS/function
documentation. The [Supabase changelog](https://supabase.com/changelog) index was
also checked: this plan introduces no server-adapter dependency, legacy cipher,
ltree or custom-operator migration. Recheck current platform documentation and
advisors when implementation begins. No new automated tests were run for this
documentation-only proposal; existing tests are future extension points, not
proof that the proposed journal or competition exists.
