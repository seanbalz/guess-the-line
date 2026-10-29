# EPL-DATA-01 — roster display metadata

Owner: EPL access/data agent. Branch: `codex/epl-player-directory`, initially from `76329b7f2c57bdb2a2710ab5a90817c3318f75da` and rebased onto current main `5648082d7da31b879ff8211749f12b572fc94908` before publication.

## Problem and evidence

The coordinating task's October 29 read-only hosted aggregate found 150 rostered player IDs but only 134 with keys in any saved player directory. Thus at least 16 were entirely unmapped; this query did not establish whether every existing entry had a usable name or the exact count of “Unknown player” labels. The source built directories only from `player` objects embedded in stats/projections, which can omit injured or bench players. Merging previous saved directories could not fill an ID never seen in any of them.

Sleeper's [official player-map documentation](https://docs.sleeper.com/#fetch-all-players) provides `GET /v1/players/<sport>` and instructs callers to cache it on their own server, at most once per day. The coordinator verified the EPL variant on October 29: HTTP 200, 2,331,736 bytes, 1,910 entries, SHA-256 `6ecd9efeba913f98962c3e4ccc2f15b71b59f43951707329524995dcf0ee2707`. This agent reused that ignored local cache and made no second directory request.

## Implemented source behavior

| Boundary | Behavior |
| --- | --- |
| When requested | Only the jobs source adapter opts the current UTC `daily-YYYY-MM-DD` capture into enrichment. Weekly before/after captures, correction rechecks, historical imports and Fantasy API reads never fetch the map |
| Bounds | Fixed public Sleeper origin/path, GET, no credentials, no redirects, 10-second timeout, 4 MiB streamed/declared body bound, at most 10,000 entries |
| Stored data | Only currently rostered IDs; only missing display names and team abbreviations supplement embedded snapshot metadata. No age, birth date, injury notes, unrelated players or arbitrary directory fields are stored |
| Scoring | Directory `position` and `fantasy_positions` are never imported. Existing embedded snapshot positions remain authoritative; a genuinely missing position stays unknown. Per-player field merges keep display-only entries from erasing stored position fields; explicit snapshot null remains null |
| Provenance | `sha256.player_directory` and `payload.sources.player_directory` retain the raw-body hash, path, attempt time, availability/fixed failure code and separate `rostered`, `mapped`, `named`, `missingEntries` and `missingNames` counts. A key is not evidence of a nonempty bounded display name |
| Optional outage | A failed or oversized directory response does not discard valid totals, lineups, stats or projections. The daily base snapshot is saved with explicit unavailable/coverage metadata; its saved daily label prevents subsequent five-minute jobs from requesting the map again that UTC day |
| Persistence | Existing immutable snapshot save only; no schema or migration required. No historical snapshot is rewritten |

The daily-label guard takes effect after a successful snapshot save, as the existing scheduler does. A failure to persist the base snapshot is a failed capture and remains subject to the existing job retry behavior; this change does not claim a new durable provider-attempt ledger.

## Verification

New `tests/epl-player-directory.test.mjs` covers an absent bench player, minimal roster-only output, raw hash provenance, daily-only opt-in, malformed/partial/inherited/prototype metadata, invalid JSON, request errors, HTTP rate limits/outages, entry/body limits, unchanged scoring, position preservation and successful base persistence without same-day directory retry.

The committed after-MW8 **test fixture contains 88 rostered IDs**, distinct from the current hosted 150. An offline pass against the coordinator's cached directory named 88/88, added zero scoring-position fields and produced a 7,735-byte trimmed fixture (3,265 bytes before display enrichment). These counts are fixture evidence, not hosted closure of the 16-row gap.

Commands:

```sh
node --test tests/epl-player-directory.test.mjs tests/epl-sources.test.mjs tests/epl-fantasy-view.test.mjs tests/epl-fantasy.test.mjs tests/epl-sleeper.test.mjs tests/epl-jobs.test.mjs
# 100 passed
node --test tests/epl-*.test.mjs
# 219 passed after rebasing onto main
node node_modules/vitest/vitest.mjs run tests/epl-fantasy.test.jsx
# 17 passed
npm run typecheck
python3 scripts/check-brand-docs.py
npm run build:cloud
node scripts/check-cloud-boundary.mjs --bundle-only
```

The build uses the existing synthetic cloud-test public configuration. No production key, hosted roster payload, player map or ignored cache is copied into the frontend or committed.

## Completion boundary

Implementation and local tests are complete. CI/review, merge, an exact-source `gtl-epl-jobs` release and the first **new** daily capture remain separate. An already-saved daily label stays immutable; it is not overwritten to add names. After that future capture, check aggregate roster/name coverage and the signed-in roster view before closing EPL-DATA-01. Any provider IDs still missing stay explicit; never invent a player or infer a historical scoring position from today's directory.

No hosted claim, link, pick, queue, snapshot, schedule, migration or deployment was changed by this batch. Physical iPhone acceptance remains separate from these data/route tests.
