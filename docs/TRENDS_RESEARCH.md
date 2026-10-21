# Trends research

Owner: Sean Balsiger · Version 1 · October 21, 2026

Implementation and verification are tracked in [PR #161](https://github.com/seanbalz/guess-the-lines-repo/pull/161)
and the [implementation plan](superpowers/plans/2026-10-21-trends-research.md).
This record does not establish deployment or real-phone acceptance.

## Product behavior

The new app uses one research projection for the weekly shortlist, matchup
evidence and Explore. The shortlist contains at most three consistent candidates.
Explore makes emerging patterns and other periods available without changing
the complete evidence used to determine a lean. Recent means the last 30
qualifying completed games, including pushes and games from earlier seasons.

A research lean needs at least two agreeing evidence groups, a strict majority,
known conditions, an open pregame market, current history and a sportsbook
reference observed within 12 hours. Overlapping candidates are grouped before
counting. Those groups are not claims of statistical independence. Qualifying
opposition remains a yellow Alternative; it is not a bad bet merely because it
opposes the lean. Insufficient or unresolved evidence produces No clear lean.

The player's guess is an expected sportsbook line. Its difference from the
current market is not a fair-line estimate, expected return or instruction to
bet. Saved scoring references, current quotes and guesses remain separate.
This feature does not change submission locks, scoring or bet tracking rules.

Charts show the selected sample and label modeled returns **Illustrative units
at -110**. An accessible table reconciles to the same chart bins. Actual-price
returns require a fully priced sample. Descriptive consistency is not proof of
a betting advantage. The frozen historical study and its original tier gates
remain unchanged; newly registered candidates cannot acquire those tiers.

## Prepared historical data

The free source is the [nflverse schedules release](https://github.com/nflverse/nflverse-data/releases/tag/schedules),
used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
`shared/trends-research-candidates.mjs` wraps the frozen registry and engine.
`cloud/trends-research-snapshot.mjs` is a generated server-only artifact, never
imported into the browser bundle. Its metadata records input hashes, generation
time and actual coverage. Upcoming context is redacted before feature building;
the artifact contains no player data, upcoming lines, prices or reviewed posts.

Full historical evaluation runs offline because it exceeds hosted request
budgets. The request path decodes the base catalogue and only the requested
period, retaining at most two decoded periods. It checks the free schedule
source on demand, with a five-minute shared source cache, request coalescing and
one-minute retry backoff. Viewer projections are never shared or persisted.

The server compares all observable completed-row content with the prepared
fingerprint and verifies target schedule identity. The completed fingerprint is
memoized only for that public source fetch and observation day; a new fetch or
noon boundary invalidates it. New finals, corrected
results, missed finals, changed schedules or a failed source refresh disable
affected leans. Historical summaries retain their snapshot date. Season and
rolling-year windows are anchored to that snapshot, not silently relabeled as
current. No new collector or scheduled job is added.

The CSV has no exact final observation timestamp. Results become eligible at
noon UTC following the scheduled game date. Game time and this conservative
availability time are separate: a late-observed result cannot make an earlier
game prospective. Prospective results must come from games beginning at or after
registration. When a historical kickoff time is missing, UTC start of its schedule
date is used conservatively for this split. Unsupported current weather, referee and state-plus-line
conditions remain unavailable rather than inferred from missing values.

### Refresh and reproduce

Refresh the prepared artifact as part of the existing reviewed data publication
workflow whenever completed source data changes. Keep original input bytes in an
ignored local directory for audit and reproduction:

```powershell
node scripts/prepare-trends-research.mjs --season 2026 --file .local/trends-research/source.csv --now 2026-10-21T19:38:17.207Z
node scripts/prepare-trends-research.mjs --season 2026 --file .local/trends-research/source.csv --now 2026-10-21T19:38:17.207Z --check
```

Omitting `--file` fetches the existing free nflverse URL. Omitting `--now` uses
the actual generation time. Reproduction requires the identical input and time.
Review generated metadata, redaction tests and applicable tests before committing
the named artifact. Publication still follows [SHARED_DEPLOYMENT.md](SHARED_DEPLOYMENT.md).
A local refresh alone does not update production. Until a changed snapshot is
published, the runtime honestly marks its history stale and withholds leans.

## Reviewed source feeds

RotoBot, ParlayScience, Fatboss, TrendsCenter and BettingPros are research
references. Their posts are source-reported claims, never extra votes in a
computed lean. Book It With Trent is its own section showing original plays.
There is no automatic fade, fabricated play or claimed source profitability.
No live X connection is configured by this implementation.

An operator may supply `GTL_RESEARCH_REVIEWED_FEED` as server-only JSON through
the existing release configuration workflow. Validate the ignored local file
first with `node scripts/trends-research.mjs validate --file <path>`. The strict versioned schema lives in
`shared/trends-research-sources.mjs`. It requires an original account/post URL,
post and capture times, original terms, explicit line/price or null, a primary
post/reuse review and complete NFL visibility dependencies. Corrections append
an immutable revision referencing the previous revision. Do not replace history.

Keep the serialized feed within 24,000 characters and 48,000 UTF-8 bytes.
Unavailable, inaccessible, deleted and corrected material has explicit states.
Unconfigured or invalid feeds fail closed for this feature. Do not place feed
contents in frontend assets, public documentation or logs. A parlay is visible
only when every associated NFL market is open for that viewer. Suppressed plays
must not disclose their titles, IDs, source URLs or counts.

## Verification and release limits

### Historical diagnostics, October 21

The refreshed source contains 7,548 schedule rows, with completed games through
October 19. Its SHA-256 is
`defc1a8d2e3f3818d4c6fa3bfd572edb933ca94a0dcad5ba81664e831bd1bde1`.
The prepared catalogue has 750 fixed candidates; eight qualify before current
matchup checks: five through retained historical gates and three through the
new recent-consistency rule. The generated module is 2,033,638 bytes; a local
esbuild of the complete Edge entrypoint is 2,467,927 bytes. Exact regeneration
with the recorded input and time passed `--check`.

The [versioned diagnostic result](../model/trends/research-diagnostics-2026-10-21.json)
records 20 seeded null runs. Three candidates passed the recent rule on actual
outcomes; the shuffled runs averaged 5.65 qualifiers, ranging from two to ten.
The observed count did not exceed the typical shuffled count. This is evidence
against treating the consistency badge as proof of an edge. Retained historical
tiers were excluded from this comparison and are not revalidated by it.

The diagnostic flips one outcome sign per physical game across all overlapping
candidates, retaining membership, pushes and opposing sides. It does not rebuild
feature membership from simulated seasons and is not a forecast backtest or a
calibrated false-positive probability. Replays at October 11, 15 and 20 retained
original registration times, admitted no future registrations/results, and
produced zero, seven and six qualifiers respectively. New October 21 candidates
could not appear in those earlier decisions.

Reproduce with:

```powershell
node scripts/trends-research-diagnostics.mjs --file .local/trends-research/source.csv --now 2026-10-21T19:38:17.207Z --season 2026 --permutations 20
```

### Boundaries and acceptance

The authenticated `POST /lines/research` route reads and projects the existing
Lines reader before computing viewer research. It inherits authentication,
confirmed-email, JSON-only, no-query and no-store boundaries. Closed markets
are exactly `{ "visible": false }`. The dedicated `research` entry in the
existing `GTL_FEATURE_OFF` configuration disables this route without changing Lines.

The [local runtime measurements](../model/trends/research-profile-2026-10-21.json)
use Node 24 on Windows, all 14 Week 7 games open, synthetic test references and
no player picks or source-feed entries. They exclude network and service RPC
latency. After reducing grouping allocations and memoizing public fingerprints,
the response hashes remained identical across all four measured requests.

| Request | Wall time | Process CPU | Response bytes | RSS after response serialization |
| --- | --- | --- | --- | --- |
| Cold last 30 | 633 ms | 562 ms | 770,338 | 183,001,088 bytes |
| Warm last 30 | 68 ms | 63 ms | 770,338 | 210,137,088 bytes |
| First full history | 153 ms | 173 ms | 777,914 | 254,500,864 bytes |
| First rolling year | 87 ms | 109 ms | 768,298 | 241,876,992 bytes |

These are sampled local measurements, not upper bounds or hosted acceptance.
The largest sampled RSS before optimization was 296,763,392 bytes. Supabase documents a 2-second request
CPU limit and 256 MB memory limit; local Node measurements cannot establish
hosted compliance. A release must verify memory, latency, source freshness,
locked-market absence and the actual served UI before claiming production
acceptance. See the [Edge limits](https://supabase.com/docs/guides/functions/limits).

Rollback can disable `research` first and restore the prior reviewed frontend
and API versions through the manual release workflow. No migration or data
rewrite is part of this feature.
