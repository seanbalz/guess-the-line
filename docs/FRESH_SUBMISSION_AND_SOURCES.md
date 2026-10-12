# Fresh submissions and sportsbook sources — D-17

Owner: Sean Balsiger. Decision: October 8, 2026. Deployed in Pages `2106725d` /
API v14 with JWT verification enabled. The hosted migration was applied in the
subsequent six-migration release; see [the release record](RELEASE_2026_10_08.md).
Earlier feature-task verification remains identified as local evidence below.

## Approved behavior

For Guess the Spread and Guess the Total, each newly submitted guess or changed
submitted guess needs a qualifying consensus at the time it is saved. Reuse
eligible shared evidence first. If evidence is missing or older than five minutes,
attempt one shared collection within the existing free limits, then check again.
If any required reference is still unavailable, reject the entire save. The
previous ballot, audit, revision and market reveal remain unchanged. Entered
values stay in the form for retry; group drafts also retain existing tab recovery.
Solo form retention does not establish disk or account persistence after failure.

The database repeats the checks atomically when saving. Access, the exact slate,
deadline, current revision and complete valid ballot must qualify before collection
can reserve quota. Membership or revision changes during collection prevent that
intent from persisting a snapshot. A no-op edit cannot refresh the scoring
reference; unchanged guesses keep their original evidence. Historical submissions
without references remain unscored and are never backfilled.

The local Node workspace also requires eligible evidence when persisting a new
submission or changed submitted guess. It has no provider refresh connection;
missing evidence rejects the write. Its historical scalar-only imports do not
qualify. Only the cloud API has the shared on-demand provider path.

## Dashboard

After the relevant market is submitted, expand a matchup's **Sportsbook sources**
panel to compare:

| Display | Evidence |
| --- | --- |
| Saved scoring consensus | The median captured with this player's guess; this determines its points. |
| Latest collected consensus | The most recent collection, including explicit stale/unavailable status; later collections do not change saved points. |
| DraftKings, FanDuel and BetMGM | Each book's home-team spread or combined-points total, provider observation time, collection time and inclusion/exclusion reason. |
| Caesars | Unavailable on the current provider's free plan; excluded from consensus. |
| Action Network consensus | Not connected; a distinct source that cannot be inferred from our three-book median. |

Three eligible distinct books are required. Normalize spreads to the home team,
sort the three values and use the middle one. All three must pass the existing
within-five-points consistency rule. Observation times must be no more than five
minutes old when saved. Match the exact home/away teams, kickoff and provider
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

Because the submission path refuses to spend while references are still fresh,
a cooldown equal to the freshness window cannot cause a duplicate collection; it
only delays a retry for five minutes after a failed attempt. Six attempts leave
four submission-triggered collections per UTC day after the scheduled runs; a
further submitter after the cache expires receives the daily-limit reason until
00:00 UTC. These constants come from migration
`20261012213000_gtl_submission_odds_window.sql` (worst case 6 × 2 × 31 = 372
credits a month, 128 above the reserve), which is not applied to the hosted
project until Sean confirms them (pending entry in [DECISIONS.md](DECISIONS.md));
the hosted limits remain four attempts and fifteen minutes until then.

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
