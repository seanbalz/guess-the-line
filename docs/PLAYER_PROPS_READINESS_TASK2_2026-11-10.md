# Player Props readiness — Task 2 hosted results, November 10, 2026

Owner: Sean Balsiger. Observed November 10, 2026, 21:23 to 21:27 UTC.
Decision: D-82. Follows [the November 9 readiness record](PLAYER_PROPS_READINESS_2026_11_09.md)
and runs Task 2 of [the readiness plan](superpowers/plans/2026-11-09-player-props-readiness.md)
(section 8 of [the November 10 apply packet](MIGRATION_APPLY_PACKET_2026_11_10.md)).

**Result: `liveLockInReady` stays `false`.** The Player Props schema is on the hosted
project and matches the packet exactly. But no prop quote has ever been retained, so no
offer, reference or result can exist yet. The free odds allowance also cannot pay for a
full-slate prop pass. Nothing was written, enabled, collected or deployed by this audit.

Evidence tags: **executed** means I ran it in this audit; **inspected** means I read the code
or a record; **assumed** means inferred and not checked.

## How this was run

- **Project confirmed (executed).** The production environment's `SUPABASE_PROJECT_REF` and
  the read-only connector's project URL both name `onmrgvcehkflfaizvedl`.
- **Read-only (executed).** Every query ran inside `begin transaction read only; … rollback;`
  through the read-only Supabase connector. The connector role is `supabase_read_only_user`:
  not a superuser, but it bypasses RLS. So the counts below are complete table counts, not
  counts filtered by RLS.
- **Nothing private was read or published.** No player name, guess, price, line, request ID,
  provider event ID or raw quote. Quota amounts are left out on purpose (packet section 8);
  only capacity status is given.
- **Not called.** No `gtl_props_*` function, no provider request, no lease, no reservation,
  no workflow dispatch, no secret or variable change.
- **Hosted state at the time.** Migration history has 83 rows, newest `20261110204307`
  (M-47). All seven November 10 versions are present (executed). This matches
  [the M-41 to M-47 apply record](https://github.com/seanbalz/guess-the-line/pull/525).

## Task 2 results

### 2a. Schema and odds budget row

| Check | Result | Tag |
| --- | --- | --- |
| `gtl_research_quote_fetches` | Present | executed |
| `gtl_odds_budget` | Present, exactly one `the-odds-api` row | executed |
| Budget row state | Not paused. No lease held. Last successful preflight 18:15:03 UTC today, the same second as the newest Week 10 core market snapshot | executed |

### 2b. Retained prop-quote coverage, last 7 days

The packet's 2b query returned **an empty result**. I then widened it to find out why. This is
**observed absence, not unknown**:

| Count in `gtl_research_quote_fetches` | Value | Tag |
| --- | ---: | --- |
| Rows, all time | 0 | executed |
| Rows in the last 7 days | 0 | executed |
| Rows naming any `player_*` market, all time | 0 | executed |
| Rows holding any `prop` quote, all time | 0 | executed |

Research intake has never retained a quote of any kind on this project. The four research
functions (`gtl_begin_research_quotes`, `gtl_finish_research_quotes`, `gtl_read_research_quotes`,
`gtl_publish_research_snapshot`) are present. Each is executable by `service_role` only
(executed).

### 2c. Capacity

The budget row is shared. The core NFL collector and the EPL jobs both reserve from it, and
both keep the same 50-credit floor (inspected: `gtl_epl_reserve_credits` reads the same row).

A prop request costs one credit per returned market at one region, because the three books
are passed as `bookmakers` (inspected: `cloud/research-provider.mjs`). The intake allows at most
eight markets per request and four requests per job, so an eleven-stat game needs two requests.

Headroom here is the row's conservative remaining count above the 50-credit reserve. That is
the value every reservation checks (`gtl_begin_research_quotes`, `gtl_epl_reserve_credits` and
the core collector). The provider-reported remaining count is higher (executed).

| Scope per pass | Credits per pass | Status against current headroom above the reserve | Tag |
| --- | ---: | --- | --- |
| Full slate, Week 10 (14 games × 11 stats) | 154 | **Not enough** for one pass | executed (headroom) and arithmetic |
| Full slate, 16-game week (packet's example) | 176 | **Not enough** | arithmetic |
| Pilot: 2 games × 3 yardage stats | 6 | Enough | arithmetic |

One full-slate pass a week also costs more than the whole monthly free allowance, before the
core NFL and EPL collectors take their share (arithmetic, using the provider's published free
tier). The free-only rule is unchanged, so a full-slate Player Props mode is not fundable
today. Only a narrow scope is.

**Timing adds cost (inspected).** A lock-in reference must be built from quotes no more than
six hours old, observed before kickoff, with the three books within 30 minutes of each other
(`cloud/player-prop-receipts.mjs`). The offers job reads only the last six hours of fetches
(`cloud/player-prop-jobs.mjs`). So a live mode needs a fresh collection for each game inside
the six hours before any lock-in on it. One pass per game per week is the floor, not the
typical case.

### 2d. Roster/event identity and the result path

| Item | Result | Tag |
| --- | --- | --- |
| App game to provider event mapping | The newest Week 10 core market snapshot (18:15 UTC today) has 14 games. All 14 carry a `providerEventId`. Only presence was read, not the IDs. | executed |
| App game to nflverse event | The offers job maps `games.csv` `game_id` (`2026_10_AWAY_HOME`) to the app's `AWAY-HOME` game ID and checks the kickoff. | inspected |
| Player identity | Offers require a GSIS ID (`00-` and seven digits) and one consistent roster entry for that week (repeated rows must agree; `ACT`, QB/RB/WR/TE, one of the two teams). | inspected |
| Roster receipt for collection | Research intake matches a provider player name to exactly one row of a roster receipt that the operator supplies in the input file. **No script builds that receipt, or the `quoteRequests` list, from verified sources.** | inspected |
| nflverse sources the jobs read | All four assets are listed with a published SHA-256 digest, each under the job's size cap. Updated today: `stats_player_week_2026.csv` 17:04:17 UTC, `snap_counts_2026.csv` 12:27:37 UTC, `roster_weekly_2026.csv` 15:34:26 UTC, `games.csv` 21:16:31 UTC. The jobs refuse any asset without a digest, so this gate passes. | executed (GitHub release metadata, 21:24:48 UTC) |
| Row-level coverage of those files | Not measured: the files were not downloaded. Examples: Week 10 roster rows, Week 9 stat and snap rows. The offers and results dry runs measure this themselves. | unknown |
| Hosted result storage | `gtl_prop_results` and `gtl_prop_result_checks` exist with 0 rows | executed |
| Result path end to end | Cannot run yet. The results job grades only recorded offers, and there are none. | executed (0 offers) and inspected |

### Player Props schema (M-45, M-46, M-47)

| Check | Result | Tag |
| --- | --- | --- |
| `gtl_prop_capability` | Exactly one row, `live_lock_in = false` | executed |
| Tables | 8 `gtl_prop%` tables. Apart from the capability row, all are empty: offers, references, guesses, guess events, results, offer reviews and result checks each have 0 rows. | executed |
| Functions | 21 `gtl_props_*` functions. Every `md5(prosrc)` equals the packet's after-apply value (16 from M-45, 4 from M-46, 1 from M-47). | executed |
| Triggers | 7 non-internal `gtl_prop%` triggers | executed |
| Grants | No `gtl_props_*` function is executable by `anon` or `authenticated`. Every non-trigger function is executable by `service_role`, and none is security definer. No `gtl_prop%` table grants select or insert to `anon` or `authenticated`, none grants delete to `service_role`, and none has an RLS policy. | executed |
| Jobs capability | Not called (service-only). By its source it returns `{"jobs":true,"ready":false}` while `live_lock_in` is false. The apply record observed exactly that. | inspected |

### Switches outside the database

| Switch | State | Tag |
| --- | --- | --- |
| Repository secrets `GTL_PROPS_SUPABASE_URL`, `GTL_PROPS_SERVICE_ROLE_KEY` | Unset. The repository has 0 Actions secrets. The `production` environment holds only the two release tokens. | executed (names only) |
| Repository variable `GTL_PLAYER_PROPS_JOBS` | Unset. The repository has 0 Actions variables. | executed |
| `player-props-jobs.yml` runs | None | executed |
| Research intake credentials (`GTL_RESEARCH_SUPABASE_URL`, `GTL_RESEARCH_SERVICE_ROLE_KEY`, `GTL_RESEARCH_ODDS_API_KEY`) | Not in GitHub. Intake is a local operator script with no workflow. Whether an operator machine holds them is unknown. | executed (GitHub) / unknown (operator) |
| `gtl-api` secret `GTL_PLAYER_PROPS` | Off at the apply. The apply's signed-out boundary run saw all five `/props/*` routes answer 404. Function secrets cannot be read through the read-only connector, and I did not probe the routes again. | inspected (coordinator executed) |
| `VITE_GTL_PLAYER_PROPS` | Not a `production` environment variable. **`release.yml` does not pass it to the Pages build either:** the only `VITE_*` entries in the production job's `env` are the two `VITE_SUPABASE_*` values, and no `.env` file is committed. Setting the variable alone would not turn the app flag on. | executed (names) and inspected |

## What is ready

- The hosted Player Props schema: storage, jobs audit tables and the shared reader. All
  bodies match the packet, grants are service-only, and every table is empty (executed).
- The offer and result jobs and their manual workflow: written, merged and dark
  (inspected).
- The free public result sources. Each is listed with a published digest and was updated
  today (executed, metadata only).
- The provider event mapping for the open week's 14 games, in the core market snapshot
  (executed).
- The budget row: healthy, not paused, no lease (executed).

## What blocks each enabling step

| Step | Blocked by | Who can clear it |
| --- | --- | --- |
| 0. Retain prop quotes (research intake) | (a) **No input builder.** Nothing turns the hosted provider event IDs and the verified `roster_weekly` file into intake `quoteRequests` with a GSIS-keyed roster receipt. (b) The intake credentials are not configured anywhere I can verify. (c) Spending shared credits on props needs a scope decision, because a full slate does not fit (2c). | (a) An agent can build it without hosted access. (b) and (c) are Sean's. |
| 1. Jobs secrets and `GTL_PLAYER_PROPS_JOBS=on` | Technically ready. Only Sean's word is needed. But with zero retained quotes, step 2 below can prove only the plumbing. | Sean |
| 2. Dry runs (`offers`, then `results`) | Step 1. Until step 0 has run within the previous six hours, `offers` returns `fetches 0, candidates 0` and reads no source file ("an empty week costs nothing"). `results` returns `offers 0`. | Sean (dispatch) |
| 3. Write runs with `record_while_dark` | Steps 0 to 2. `offers` must run within six hours of a collection. `results` then needs a final game whose stats release came at least three hours after kickoff. | Sean |
| 4. `live_lock_in = true` (a reviewed SQL change) | Steps 0 to 3 proven at least once. Also measured coverage and eligibility from real reviews, and a result path proven end to end. Then a recurring collection inside the six-hour window of every lock-in (no collector is scheduled; the jobs workflow is manual only), sized to the free allowance. | Agents build and review; Sean approves the SQL |
| 5. `GTL_PLAYER_PROPS=on` (gtl-api secret) | After step 4. Turned on earlier, the routes would answer `available:false`. | Sean |
| 6. `VITE_GTL_PLAYER_PROPS=on` (Pages build) | After step 5. Also needs a reviewed `release.yml` change to pass the variable, the variable itself, phone mockups of every visible change, both-theme comparison against adjacent screens, and a Pages deploy. | Agents (workflow change and mockups); Sean (variable and deploy) |

## Not established

- Row-level coverage of the four nflverse files, such as current roster rows for Week 10.
  The dry runs measure it once quotes exist.
- Whether any operator machine holds the research intake credentials.
- The current value of the `GTL_FEATURE_OFF` secret.
- Live route behavior since the apply. An edge-log search for `/props/` from 19:00 to 21:29 UTC
  returned 0 lines. I did not confirm that the log message carries request paths, so this is
  not evidence either way.

## The next decision for Sean

The question is whether shared free odds credits may fund prop quotes at all, and at what scope.
Every later step depends on that answer. Without retained quotes, the jobs and flags have
nothing to act on.

- **Recommended:** a dark pilot. Two games a week, three yardage stats (passing, rushing and
  receiving yards), one pass per game before kickoff, with `record_while_dark` on. That is
  about 6 credits a week. It measures real coverage and eligibility and proves the result path,
  and nobody sees anything.
- **Alternative:** the full slate with all eleven stats. That needs a paid provider plan, which
  revises the free-only rule.
- **Alternative:** hold at zero. Player Props stays dark with no data, and readiness cannot
  move past plumbing.

Approving the pilot covers the scope only. Each step in the table above keeps its own word.
