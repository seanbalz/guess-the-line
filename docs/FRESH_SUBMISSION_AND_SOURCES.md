# Fresh submissions and sportsbook sources — D-17

Owner: Sean Balsiger. Decision: October 8, 2026. Deployed in Pages `2106725d` /
API v14 with JWT verification enabled. The hosted migration was applied in the
subsequent six-migration release; see [the release record](RELEASE_2026_10_08.md).
Earlier feature-task verification remains identified as local evidence below.

## Approved behavior (D-27, October 12, 2026; supersedes D-17's rejection rule)

For Guess the Spread and Guess the Total, players can submit or edit whenever
before the deadline. Each newly submitted or changed guess saves, server-selected,
the newest qualifying stored line for that game and market at the save instant,
with its observation time and age. If that line is missing or more than five
minutes old, the save first tries one shared collection within the existing free
limits; whether the collection succeeds, is refused (cooldown, daily cap, budget
guard, busy lease) or fails, the save proceeds with the newest stored line. With
no stored line yet, the guess saves as `pending` and the first qualifying line
collected after it and before that game's kickoff becomes its reference ("first
line after submission"), with its observation time and age; a book whose last
update precedes the save still counts, and a collection made before the save is
never used for it. The collection that stores the line resolves it in the same
transaction. Age is shown, never used to unscore. A client cannot supply a
reference or a line value.
References stored before D-27 stay exactly as stored.

The database repeats the checks atomically when saving. Access, the exact slate,
deadline, kickoff locks, current revision and complete valid ballot must qualify
before collection can reserve quota and again at the save. Membership or revision changes during collection prevent that
intent from persisting a snapshot. A no-op edit cannot refresh the scoring
reference; unchanged guesses keep their original evidence. Historical submissions
without references remain unscored and are never backfilled.

The local Node workspace saves the newest qualifying local consensus row (quotes
within five minutes of that row's own capture) at any age, or a pending reference.
It has no provider refresh connection and no collector, so a local pending guess
stays pending. Its historical scalar-only imports do not qualify. Only the cloud
API has the shared on-demand provider path.

## Dashboard

After the relevant market is submitted, expand a matchup's **Sportsbook sources**
panel to compare:

| Display | Evidence |
| --- | --- |
| Line at your guess | The newest stored median when this player saved the guess (or, for a pending guess, the first one collected after it), with its age; this determines its points. |
| Latest collected consensus | The most recent collection, including explicit stale/unavailable status; later collections do not change saved points. |
| DraftKings, FanDuel and BetMGM | Each book's home-team spread or combined-points total, provider observation time, collection time and inclusion/exclusion reason. |
| Caesars | Unavailable on the current provider's free plan; excluded from consensus. |
| Action Network consensus | Not connected; a distinct source that cannot be inferred from our three-book median. |

Three eligible distinct books are required. Normalize spreads to the home team,
sort the three values and use the middle one. All three must pass the existing
within-five-points consistency rule. Observation times must be no more than five
minutes before their own collection (the qualifying rule for a stored line); since
D-27 the line's age at the save is shown, not enforced. Match the exact home/away teams, kickoff and provider
event; validate both paired outcomes. A provider HTTP response alone does not
prove its underlying market is fresh. Saved receipts persist each book's value
and timestamps, even after the live history window rolls past twenty snapshots.
Missing individual historical rows are shown as unavailable, never reconstructed
from an aggregate. The other unsubmitted market stays hidden.

Times shown in the UI are Pacific, with exact UTC timestamps available on the time
elements. Provider market observation times are not confirmed sportsbook-issued
timestamps. These are collected references, not guaranteed executable prices.

## Connected and unavailable sources

The existing server-only **The Odds API** adapter requests DraftKings, FanDuel and
BetMGM spreads/totals. Its free plan advertises 500 credits/month. A two-market
request for these books costs two credits; up to ten selected books count as one
region. Current terms permit application display and indefinite storage, subject
to the restriction on standalone raw-data redistribution.
[Plan](https://the-odds-api.com/),
[V4 request and timestamp documentation](https://the-odds-api.com/liveapi/guides/v4/),
[terms](https://the-odds-api.com/terms-and-conditions.html).

The provider lists Caesars (`williamhill_us`) as paid-subscription access. No paid
upgrade or paid-book request was made.
[Official bookmaker availability](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html#us-bookmakers).

Action Network requires permitted access and written redistribution/display
permission for its consensus content. The bounded official-source review found
no verified public free feed for this application. An existing personal or paid
Action account alone would not establish those rights. No scraping, manual copy
import or provider outreach was performed.
[Action terms, sections 1–2](https://www.actionnetwork.com/terms).

## Limits and remaining acceptance work

Scheduled, commissioner and submission-triggered collection share one database
lease, **six collection attempts per UTC day**, a **5-minute cooldown** equal
to the five-minute freshness window, a **50-credit reserve**, and at most
**two credits per collection**. A measured zero-cost event preflight is required
within the previous 24 hours. A failed request keeps its reservation
conservatively counted. Quota is not reset from an unverified assumption. The
twelve-hour hosted schedule is unchanged; its two runs count inside the six.

Because the submission path refuses to spend while the newest line is under five
minutes old, the 5-minute cooldown cannot cause a duplicate collection. Under D-27
these limits only bound spending: a submitter who meets the cooldown, the daily
cap or the budget guard is saved against the newest stored line and sees its age.
The earlier residual "dead zone" (a line older than five minutes while the
cooldown still ran, up to the provider's observation lag) therefore no longer
refuses anyone. Six attempts leave four submission-triggered collections per UTC
day after the two scheduled runs (migration
`20261012213000_gtl_submission_odds_window.sql`; worst case 6 × 2 × 31 = 372
credits a month, 128 above the reserve), confirmed with D-27.

Collection continues on a closed week between its Thursday deadline and its last
kickoff: the scheduled runs keep collecting the published week's remaining games
(up to six runs at two credits before the next Monday publish). This is intended:
D-18 Virtual Units picks stay open until each game's kickoff and read these
quotes, and a pending guess on a later game still needs its first line. The
scheduled claim and the schedule status read share one slate resolver
(`gtl_odds_schedule_slate`), so a schedule row lagging the newest published week
reads `slate_changed` in both.

**Monday-night lines (M-05, D-39; built, not applied).** Migration
`20261014221500_gtl_odds_open_weeks.sql` keeps collecting the previous published
week's games that have not kicked off once the next week opens on Monday (the
Monday night game, or two): `gtl_odds_carryover_slate` lists them, the scheduled
and commissioner collections hand them to the adapter after the newest week's
games, and they ride in the same free event check and the same two-credit odds
request (spreads and totals, one region, three books; the cost does not depend on
how many event ids the request names, and a reported cost above two credits still
pauses the budget). The newest week's snapshot is stored exactly as before; the
carried games are stored as a snapshot of their own week, so the line at a late
save, pending references and the community reads of that week find them. Because
`gtl_market_snapshots.id` names a collection, a zero-credit `collect` row
(`reserved_credits` 0, `diagnostics.carryoverOf` = the provider collection)
records that snapshot, and both begin RPCs count only collections that reserved
credits toward the six a day. Submission-triggered collections still collect only
the week being submitted. With no carried game (Tuesday to Sunday) every replaced
function behaves exactly as before. Tests: `tests/odds-open-weeks-sql.test.mjs`
and `tests/odds-provider.test.mjs`. Apply on a Tuesday or Wednesday; after the
apply, check that the next scheduled collection succeeds, and copy the
remaining-credit count into the release record weekly.

The reviewed release applied the earlier dependencies and
`supabase/migrations/20261008232055_gtl_fresh_submission_odds.sql`, then deployed
the API and dashboard. Its 130 live access-denial checks passed; the inspected
32-table inventory had RLS enabled, zero browser-role grants and zero
browser-callable GTL database functions. Release validation also passed 368 Node,
29 local browser and 79 cloud-style browser checks. These are separate from the
earlier feature evidence below.

Authenticated group/Solo submission acceptance and production quota/lease
behavior still require their own evidence. Do not infer a successful real save,
hosted concurrency, fresh provider quotes or second-device behavior from a
deployment, denial probe, PGlite or mocked browser check. Deployment does not
establish publication of the working-tree changes to GitHub.

## Implementation evidence

- SQL: `gtl_preflight_submission`, per-member begin/finish collection RPCs and
  `gtl_fresh_submission_guard`, with service-only permissions and private intents.
- API: `cloud/submission-odds.mjs`, `cloud/submission-collection.mjs` and the
  handler/personal integration. Known source failures return safe retry codes;
  genuine revision conflicts still require a refresh.
- Projection/UI: `cloud/sportsbook-sources.mjs`, sanitized engine receipts,
  `web/src/SportsbookSources.jsx` and `web/src/ScoringReference.jsx`.
- Verification: focused SQL, handler, quota/orchestration, source projection,
  component and actual-app browser tests, with final results below.

## Local verification completed

- Full Node/SQL suite: **335 passed, zero failed or skipped** in
  `.local/fresh-odds-final-unit.log`.
- The final API fallback improvement keeps persisted sportsbook receipts visible
  when the latest-market read fails. After that change, **33 affected checks
  passed** in `.local/fresh-odds-final-read-failure.log`. These overlap the full
  suite; do not add them as unique tests.
- Isolated authenticated-browser and sportsbook-source checks: **11 passed**,
  including 320/1440 layouts, Light/Dark, saved/latest comparison, hidden-market
  protection and 409/429/503 draft retention and retry. The affected local
  dashboard suite also passed **6 checks** against explicit synthetic test data.
- Cloud frontend build passed, with the existing large-chunk advisory. Compiled
  private-data/credential scan and `git diff --check` passed.
- New SQL cases use local PGlite; handler and browser cases use synthetic trusted
  fakes. These establish separate-layer behavior, not a combined live database
  integration or independent PostgreSQL session concurrency test.
- Independent read-only review found no remaining blocking defect. The timestamp
  policy rejects future/nonfinite collection envelopes instead of persisting a
  successful but permanently unreadable snapshot. All original source times are
  retained without rewriting.

The new private table and callable RPCs are included in the local boundary
inventory; the trigger helper's privileges are checked in SQL. No hosted boundary
probes, provider-credit requests, migrations, deployment or player messages were
performed by this feature task. Git publication may be handled separately by the
user's other session; these checks do not establish that publication.

Machine-readable evidence and a source hash manifest are in
`planning/fresh-submission-verification.json`. Broader refresh windows/frequency,
an authorized Action feed, and paid-only Caesars access remain separate decisions.
