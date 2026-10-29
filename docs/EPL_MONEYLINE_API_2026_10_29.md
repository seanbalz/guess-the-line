# EPL moneyline API contract

Owner: EPL operations workflow · Version 1 · October 29, 2026

Source implementation only. The actual MW9 draw-no-bet gate passed in [PR #375's release record](RELEASE_2026_10_29_DNB.md); M-32 is applied. API source, the M-36 safe-save/capability wrapper and collector, UI and end-to-end release acceptance remain separate. No live guesses, source requests, migrations or deployments occurred in this lane.

## Read and save behavior

All three POST routes require verified sign-in and confirmed email through the existing handler. Reads are open to signed-in unlinked accounts, with `ownerId:null`; writes require a linked FEPL manager, including a linked commissioner. Reads perform no linking or provider call.

| Action | Body | Response |
|---|---|---|
| `epl/guess/read` | `{season?,week?}`; both or neither | `{available,reason,season,week,ownerId,weeks,ownerNames,fixtures,guesses}` |
| `epl/guess/save` | `{eventId,club,price,lock:boolean}` | Accepted caller guess as below |
| `epl/guess/leaderboard` | `{season?}` | `{season,rows:[{ownerId,name,average,total,guessed,unscored}]}` |

The week selector uses the latest 38 stored EPL weeks, with each week's verified DNB history; no NFL week or invented range. Availability requires the exact week's successful two-event/two-book verdict, verified through the same service-only M-36 boolean gate used by the collector, and M-36 safe-save readiness. `reason` is `prices_not_verified`, `schema_unavailable` or null. Unavailable entry keeps SQL-permitted stored history visible. A missing M-36 pure readiness function means unavailable; other errors remain errors. M-32 board and leaderboard reads remain usable before M-36. Missing M-32 board returns explicit schema unavailability rather than invented results.

Fixtures have `{eventId,home,away,commenceTime,status,kickedOff}` with status `scheduled|final|postponed` and a server-derived kickoff flag. Postponed closes entry but does not itself reveal anyone else's guess. `ownerNames` is a bounded plain map of manager ID to display name.

Every guess is rebuilt as `{eventId,ownerId,club,price,status,savedAt,lockedAt,referencePrice,referenceObservedAt,referenceSource,distance,state}`. Status is `draft|locked`; state is `draft|pending|scored|unscored`; missing references are explicit nulls, source is `at-lock|first-after|null`. The applied M-32 board enforces D-31. The API additionally rejects any other manager's draft or locked row revealed before the caller locks that event or kickoff. It never selects a current/global quote or a queue. Leaderboard uses M-32's kickoff-only aggregate, excluding unscored guesses from the average.

Save ordering is validation/member/readiness/exact-week gate → new database wrapper → optional refresh → own accepted-record readback. The API samples trusted server time immediately before `gtl_epl_save_guess_current`; that additive M-36 wrapper acquires the fixture lock and samples actual database time afterward, then invokes unchanged M-32 with an effective timestamp that cannot be backdated by a lock wait. Missing wrapper is off; the unsafe older writer is never a fallback. No client timestamp is accepted.

Only an accepted `lock:true` calls the injected shared `refreshForLock({userId,eventId})` hook once. It returns only refreshed/cached/unavailable, never prices. Draft, refused and duplicate saves do not collect. Refresh failure, unknown/missing odds or crossing kickoff cannot undo an accepted lock; a missing reference stays pending and may take only a qualifying first-after observation. M-36 collection has its own explicit schedule/gate/budget launch prerequisites; this API does not enable it.

## Validation and errors

New guesses use shared `validGuessPrice` and `MAX_GUESS_PRICE=2147383847`. M-36 admits provider references with absolute price at most 100000; opposite-sign distance is `abs(guess)+abs(reference)-200`, so the bound is `INT_MAX-100000+200`. Every new valid guess/reference pair fits M-32's integer distance. This is storage validation, not a changed scoring formula. Existing broader `validPrice`/legacy score math and readable saved rows are preserved. Noninteger/malformed/out-of-range prices, nonboolean lock and extra client fields return 400 before a writer. The named wrapper's SQLSTATE 22003 also maps to structured invalid input, preserving the transaction/draft; unrelated RPC errors do not receive this mapping.

| Code | HTTP | Extra fields |
|---|---|---|
| `GTL_EPL_GUESS_INVALID` | 400 | None |
| `GTL_EPL_GUESS_NOT_MEMBER` | 403 | None |
| `GTL_EPL_GUESS_OFF` | 404 | None |
| `GTL_EPL_GUESS_LOCKED` | 409 | `guess` when readable: accepted caller lock |
| `GTL_EPL_GUESS_CLOSED` | 409 | `draft`: persisted caller draft or null |
| `GTL_EPL_GUESS_UNCERTAIN` | 503 | `readbackRequired:true` |

Unknown save/commit or unreadable accepted-lock readback requires a read before any further write. Neither server nor client blindly replays a save. Error bodies expose only these fixed fields and no SQL/provider payload.

## Release boundary

Three new API route probes carry explicit API-only pending-deploy descriptors; ordinary awaiting accepts only exact 404 `{"error":"Not found."}`, strict mode rejects absence, and anonymous/invalid-session requests must deny without private data. Applied M-32 table/RPC denial checks stay mandatory with no missing-schema exemption. M-36's private resources belong to its separate migration boundary registry.

Before launch: review combined API/M-36/UI source and CI, apply the additive M-36 functions with fresh grants/preservation evidence, configure and explicitly enable its bounded collector only under authorized release gates, deploy exact source, run authenticated read/deny/save/readback acceptance without exposing unrevealed guesses, and retain actual full-cycle evidence separately. Local SQL/HTTP fixtures do not prove hosted acceptance or real concurrent lock waits.


Local source checks: 180 route/rules/boundary/weather cases passed before collector integration; after merging M-36 `d29c1d4`, 16 focused API cases passed including actual M-32/M-36 SQL behind the real HTTP handler/adapter, service-role writer grants, D-31 before/after kickoff, postponed non-reveal, duplicate locks, preserved closed drafts, safe-bound validation, actual integer overflow rollback and M-32-only schema unavailability with retained history. No actual source request or player action occurred. Shared helper commit `2209593` carries the API/UI numeric contract.

Combined M-33/M-34/M-35/M-36 source check passed **515 Node tests, zero skipped**, including EPL, actual SQL, migrations/rollback, boundaries, weather and tokens. The subsequent canonical M-36 gate-reader change passed **51 focused route/SQL/HTTP tests**; it removes private job-history reads from the API and uses the collector's same validated boolean gate. The API also samples readiness before catalog gate reads, preserving M-32-only history honestly. These results remain local source QA, not hosted cycle or concurrent PostgreSQL evidence.
