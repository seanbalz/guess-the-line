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

> **Since then, November 11, 2026.** Sean said "lets turn these on". Branch
> `claude/props-pilot-prep-2026-11-11` closes the two agent-buildable gaps below, without
> spending a credit or changing hosted state: blocker 0(a), the input builder, and the
> `release.yml` half of step 6. See [Pilot input builder](#pilot-input-builder-november-11) at
> the end. Every switch is still off, and each remains Sean's own word.
>
> **Later on November 11.** Branch `claude/props-pilot-collect-2026-11-11` moves the collection
> into GitHub Actions, so no laptop holds a key (blocker 0(b)). See
> [Pilot collection from GitHub Actions](#pilot-collection-from-github-actions-november-11) for
> the exact run order.

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

## Pilot input builder, November 11

Branch `claude/props-pilot-prep-2026-11-11` adds these two pieces. Neither is merged or
deployed. No credit was spent, nothing hosted was written, and no switch was set.

### 0(a): `scripts/player-props-quote-requests.mjs`

This script builds the research-intake input file. Its logic is in
`cloud/player-prop-quote-requests.mjs`; tests are in `tests/player-prop-quote-requests.test.mjs`.

```sh
node scripts/player-props-quote-requests.mjs --season 2026 --week 11 --output .local/props-pilot-2026-w11.json
# Spending is a separate step, under Sean's word for the credit scope. Never add --publish:
node scripts/research-intake.mjs --input .local/props-pilot-2026-w11.json --collect-quotes
```

**Scope (inspected and tested with fixtures).**

- By default the script takes the two earliest eligible games of the week.
- `--game AWAY-HOME`, repeated, names exact games. A named game that fails a check refuses
  the whole build.
- `--stats` takes catalog keys only. The default is passing, rushing and receiving yards.

**Credit math (executed in tests).** A request costs 1 credit for each requested market,
because the three named books count as one region.

- The default pilot is 2 games × 3 stats × 1 region = **6 credits**, in two requests of 3.
- `gtl_begin_research_quotes` reserves exactly those 3 credits before each request, and the
  intake treats any higher reported cost as a failure.
- The reservation is not refunded.
- Each request also needs `conservative_remaining` to be at least 50 plus its cost.

**Refusals (executed in tests).** These are refused before anything is read:

- a scope above `--max-credits` (default 6, at most 32);
- a scope needing more than the intake's four requests (eight markets per request);
- a public output path.

The builder also never overwrites an existing output file, because its request IDs may
already be spent. All eleven stats for two games cost 22 credits.

**Sources (inspected).** The script makes one read-only GET, on `gtl_market_snapshots`. It
reads the newest core snapshot of the week with the intake's own `GTL_RESEARCH_*`
credentials, and from it takes:

- the provider event IDs of matched games;
- team names that agree with the app codes;
- kickoffs that equal the verified nflverse `games.csv`, and are at least 15 minutes away.

It then reads the verified `roster_weekly_<season>.csv`. Both nflverse files have their size
and SHA-256 checked, exactly as the jobs check theirs.

**The roster receipt.** It is keyed by GSIS ID. A player is listed only when all of these hold:

- he is ACT for one of the two teams;
- he is a QB, RB, WR or TE;
- his repeated rows agree;
- no one on either team shares his name key.

The intake matches provider names by that key and needs exactly one row.

**Wiring (executed in tests).** In the tests, a built request runs through
`collectResearchQuotes` with a fake reservation and a fake provider reply. The offers job then
reviews the retained quotes as **eligible** offers, keyed by GSIS ID. Research intake accepts
the built file for validation, refuses `--publish` with it (it has no `publicationId`), and
cannot collect without its own credentials.

**Output.** The script prints one line of counts, app game IDs, stat keys, credits and source
digests. It never prints a player, a provider event ID or a key.

**Timing (inspected).** The offers job reads only fetches from the last six hours and records
nothing after kickoff. Run `offers` within six hours of the collection, before the games kick off.

### Step 6's `release.yml` half

A new step, "Pass only app flags that are on to the frontend build", hands the repository
variable `VITE_GTL_PLAYER_PROPS` to the Pages build through `$GITHUB_ENV`, and only as
`VITE_GTL_PLAYER_PROPS=on`. Unset, empty or `off` adds nothing. Any other value fails before the
build.

**Why not a job-level entry (executed).** A job-level `env` entry, like the two `VITE_SUPABASE_*`
ones, was not used. An unset variable would reach Vite as an empty string, and that alone
changed the bundle:

| Build | `frontendSha256` | Files / bytes |
| --- | --- | --- |
| `origin/main` `8eaf7a77`, no variable (built twice) | `2f9d16b6f5369ddd5f27a935713a25169f8c61da7671517166edf2b7af1a7b06` | 145 / 19,756,262 |
| `origin/main`, `VITE_GTL_PLAYER_PROPS=` (the job-level entry, unset) | `8dbfee9a07287588b2a63bdee6d361eef0e113655243b6f82fd25529de74c256` | 145 / 19,756,287 |
| This branch, new step with the variable unset, empty or `off` | `2f9d16b6f5369ddd5f27a935713a25169f8c61da7671517166edf2b7af1a7b06` | 145 / 19,756,262 |
| This branch, new step with `on` | `d802fdffc9e54e332148fe32f35f6d91e46d5797edd276f53ff11d15681728b9` | 145 / 19,756,289 |

The unset branch build also matched `origin/main` file for file (`diff -rq`). An invalid value
(`On`) failed the step and wrote nothing.

### Still Sean's, in order

- The credit scope.
- Adding the `GTL_PROPS_SUPABASE_URL` and `GTL_PROPS_SERVICE_ROLE_KEY` secrets himself.
- The `GTL_PLAYER_PROPS_JOBS` variable.
- Dry runs, then write runs.
- `live_lock_in`.
- The `GTL_PLAYER_PROPS` secret.
- The `VITE_GTL_PLAYER_PROPS` variable plus a Pages deploy.

The collection also needs the research intake credentials on the operator machine
(blocker 0(b), still unknown). *Superseded the same day: the next section runs the
collection in GitHub Actions instead.*

## Pilot collection from GitHub Actions, November 11

Branch `claude/props-pilot-collect-2026-11-11` adds the manual workflow **Player Props
collect** (`.github/workflows/player-props-collect.yml`) and its step script
`scripts/player-props-collect.mjs`. Tests are in `tests/player-props-collect.test.mjs`. Nothing
was merged, dispatched, set, spent or written by this branch.

The coordinator relayed Sean's approval of the hidden pilot (D-82, November 11): 2 games × 3
yardage stats a week, about 6 credits, recorded while dark. That approval is not yet written in
`docs/DECISIONS.md`. `live_lock_in` and `GTL_PLAYER_PROPS` stay off.

**Why a separate workflow (inspected).** The offers and results workflow never calls the odds
provider, and its tests say so. Keeping the spending step in its own file means the odds key is
named in exactly one workflow, and `player-props-jobs.yml` is unchanged. Both workflows share the
`player-props-jobs` concurrency group, so a collection never overlaps an offers or results run.

**Guards (executed in tests).**

- It runs only on `workflow_dispatch`, only from `main`, and only when the repository variable
  `GTL_PLAYER_PROPS_JOBS` is `on`. There is no schedule.
- `dry_run` defaults to on. A dry run builds the request file and prints the credit cost. Its
  build step never receives the odds key, only whether it is set.
- `max_credits` defaults to 6. A value above 6 is refused unless `allow_above_six` is ticked, and
  the builder still refuses anything above 32. Inputs are checked before anything is read.
- Before spending, the collect step checks the built file again: same season, week, stats and
  cap, no `publicationId`, and a market count equal to the planned credits. Any difference stops
  the run with nothing reserved. It never passes `--publish`.
- The token is `contents: read`, checkout keeps no credentials, and no input or secret is
  interpolated into a shell line.

**Secrets mapping (executed in tests).** Each value reaches only the steps that use it.

| Repository secret | Research intake name | Build step | Collect step |
| --- | --- | --- | --- |
| `GTL_PROPS_SUPABASE_URL` | `GTL_RESEARCH_SUPABASE_URL` | yes | yes |
| `GTL_PROPS_SERVICE_ROLE_KEY` | `GTL_RESEARCH_SERVICE_ROLE_KEY` | yes | yes |
| `GTL_PROPS_ODDS_API_KEY` (new) | `GTL_RESEARCH_ODDS_API_KEY` | only "is it set" | yes |

**The summary artifact (executed in tests).** `player-props-collect-summary` holds one JSON file:
counts, credits, stat keys and reason names. It never holds a key, URL, quote, player, provider
event ID or game ID. The request file, with its event IDs and roster receipts, stays on the
runner. For this, research intake's receipt now also counts a collection: requests collected,
unavailable or already attempted, credits reserved, and quotes retained. It adds counts only.

**Each real run spends again (inspected).** The builder mints new request IDs every run, so a
second real dispatch reserves its credits a second time. Before re-running, read the last
summary: `credits.reserved` is what that run reserved. A failed run reports `reservedAtMost`
instead, because the failure may have come after a reservation.

### The exact pilot run order

1. **Secrets.** In **Settings → Secrets and variables → Actions → Repository secrets** (not the
   `production` environment):
   - `GTL_PROPS_SUPABASE_URL`: `https://onmrgvcehkflfaizvedl.supabase.co`, with no trailing
     slash. The URL is not secret, so the coordinator can add it.
   - `GTL_PROPS_SERVICE_ROLE_KEY`: Sean adds the project's service-role key.
   - `GTL_PROPS_ODDS_API_KEY`: Sean adds the same The Odds API key that is saved as the
     `THE_ODDS_API_KEY` Edge Function secret. `gtl_odds_budget` tracks that one account's quota
     (inspected), so a key from another account would put the wrong quota into the shared row.

   The first two also serve Player Props jobs.
2. **The variable.** Set the repository variable `GTL_PLAYER_PROPS_JOBS` to `on`. It switches on
   both Player Props workflows. Unset it to stop both.
3. **Collect, dry run.** Run **Player Props collect** from `main` with the season and week. Leave
   games `2`, the three yardage stats, max_credits `6`, allow_above_six off and dry_run on.
   Expect `status: built`, `mode: dry_run`, `credits.planned: 6`, `build.games: 2` and
   `oddsKeyConfigured: true`. Nothing is reserved. This makes one read-only GET on the core market
   snapshot and reads the two nflverse files.
4. **Collect for real (6 credits or fewer).** Run it again with the same inputs and dry_run off.
   Expect `status: collected`, `credits.reserved` of 6 or fewer, and `collection.quotes` above 0.
   Each game must still be at least 15 minutes from kickoff. `gtl_begin_research_quotes` also needs
   a successful core odds preflight within 24 hours and `conservative_remaining` of at least 50 plus
   the request's cost (inspected).
5. **Offers, dry run, then write.** Within six hours of step 4 and before kickoff, run **Player
   Props jobs** with job `offers`, the same season and week, and write off. Then run it again with
   write on and record_while_dark on.
6. **Results, after the games are final.** Run **Player Props jobs** with job `results` and write
   off. Then run it again with write on and record_while_dark on. A result needs the game's stats
   release at least three hours after kickoff.

`live_lock_in`, `GTL_PLAYER_PROPS` and `VITE_GTL_PLAYER_PROPS` are not part of this order. Each
stays off until Sean's separate word.

### Week 10 pilot readiness readback

At 00:44–00:47 UTC November 12 (November 11 Pacific), the GTL connection returned
86 hosted migrations, including all three Player Props versions. The capability
row had `live_lock_in = false`. Research fetches, offers, references, guesses,
results and review/check records each counted zero. The shared budget had a
recent preflight, room for six credits above the reserve, and no active lease
or pause at the time of the read.

The latest published slate was 2026 Week 10. Its November 11 18:15 UTC core
snapshot had 14 matched games. The production request builder ran locally against
a read-only projection of that snapshot and the current size- and digest-verified
nflverse schedule and roster. It selected two games with 58 eligible roster
entries and planned two requests at three credits each. The schedule digest was
`d10922778a11525cf00597ff56f934964a37cdea45b42a189d409357d2f4ed13` and the roster
digest was `e864647adeca43c6d84665f9387096dea79b787afbbf2cc11c3a6add63579d71`.
The local run reserved zero credits. All 16 existing builder and collection tests
passed at `cac63e7a0d10a38b4badc41c663a763b5301aee4`.

At that readback, GitHub listed the URL secret and the other two entries were
still pending. Sean later added `GTL_PROPS_SERVICE_ROLE_KEY` and
`GTL_PROPS_ODDS_API_KEY`. All three names were verified before
`GTL_PLAYER_PROPS_JOBS` was enabled.

### Week 10 pilot collection and offer receipts

All four runs used `main` at `fc2a942a9ad8705365cfec47257a3e108166b5f3`
on November 11 Pacific (November 12 UTC). The pilot covered passing, rushing
and receiving yards across two games.

| Run | Verified outcome |
| --- | --- |
| [Collect dry run](https://github.com/seanbalz/guess-the-line/actions/runs/43134637274) | Built two requests from 58 roster entries. Six credits planned, zero reserved. |
| [Collect](https://github.com/seanbalz/guess-the-line/actions/runs/43134800622) | Collected both requests and retained 198 quotes with six credits reserved. |
| [Offers dry run](https://github.com/seanbalz/guess-the-line/actions/runs/43134921802) | 31 of 34 candidates qualified. The other three lacked a required book. |
| [Offers write](https://github.com/seanbalz/guess-the-line/actions/runs/43135049798) | Recorded 31 offers, 31 references and 34 eligibility reviews. |

Hosted readback at 01:32:41 UTC confirmed 31 offers, 31 references and 34
reviews. Guesses and results each counted zero. The `anon` and `authenticated`
roles had no direct read access to the prop tables or execute access to the
prop functions. The lock-in capability was off.

| Kickoff (Pacific) | Offers | Earliest qualifying stats release (Pacific) |
| --- | ---: | --- |
| Thursday, November 12 at 5:15 p.m. | 21 | Thursday, November 12 at 8:15 p.m. |
| Sunday, November 15 at 6:30 a.m. | 10 | Sunday, November 15 at 9:30 a.m. |

Run the results dry run and write after final scores and verified stats are
available. The pilot references age out before either kickoff. Player access
still needs fresh qualifying lines and the reviewed activation checks.
