# EPL work and verification — October 29, 2026

Owner: Sean Balsiger · Coordinator: Codex · Source baseline: `76329b7f2c57bdb2a2710ab5a90817c3318f75da`

Sean requested parallel workflow agents for all EPL items, followed by the rest
of the approved backlog. This changes the immediate work order. It does not
establish a software deployment, migration apply, provider-market verdict or
physical-device acceptance. The frozen v62 tracker remains unchanged.

## Work order

| Priority | Item | Owner | Current state | Required evidence to finish |
| --- | --- | --- | --- | --- |
| 1 | Capture and operational correctness | EPL operations agent | Five existing jobs are enabled. Source audit found an ambiguous Sleeper rollover capture path, absent Tuesday correction handling, and absent league-position auto-pick tiebreak. | Tested fixes, reviewed source/CI, separate release and hosted readback. Preserve entered picks during corrections. |
| 1 | Account linking, claims and Fantasy design | EPL access/acceptance agent | Existing M-31 is hosted; seven of eight managers are linked. Disposable-database browser acceptance and narrow-screen fixes are in progress. | Account-switch/claim/queue privacy and four Fantasy sections pass real-handler browser checks; real iPhone Safari/Home Screen acceptance remains separate. |
| 1 | Moneyline readiness and market gate | EPL moneyline agent | Five unpublished predecessor commits are preserved in their original checkout and continued in an isolated branch. M-32 and server-side gate are not hosted. The schedule CHECK needs to admit `dnb-check`. | Rules/SQL/gate tests and CI; apply/deploy/enable separately; a successful real DNB verdict before routes, collection and player UI proceed. |
| 2 | First complete matchweek | EPL operations agent, then Sean | MW9 is seeded and open; results/bonus/next order have not completed a live cycle. | Before-kickoff capture, final results, bonus calculation, after-week capture, next order, correction recheck and phone readback, with timestamps and preservation checks. |
| 2 | Remaining manager access | Sean with EPL access agent | One manager remains unlinked; identity is omitted from public task evidence. | The intended owner signs in and claims, or the commissioner links under the existing audited flow. Tests do not claim a real manager. |
| 3 | Return to non-EPL queue | Codex | Deferred behind EPL work and explicit external gates. Existing trend-discovery PR #363 remains separate. | Resume the approved Research/trends and optimization order from the current queue. |

## Fresh hosted evidence

Read-only SQL against project `onmrgvcehkflfaizvedl` at
**2026-10-29 15:12:19–15:13:11 UTC** established:

- M-30 hosted version `20261029051846` and M-31 `20261029131259` are present.
- All **26** current M-30/M-31 EPL function bodies match their latest repository
  definitions by `md5(prosrc)`. All are security invoker with empty search path
  and deny browser-role execution. The dispatcher is intentionally cron-only.
- All **14** EPL tables have RLS enabled and deny direct `anon` and
  `authenticated` SELECT access. This is a database-boundary check, not proof of
  every API authorization path.
- The fixtures, nudge, resolve, settle and snapshot schedule rows and their five
  cron jobs are enabled. Last-seven-day runs show fixtures succeeded once and
  snapshot succeeded once. Nudge skipped 20 times for `no_subscription` and three
  for `nothing_due`; resolve skipped 24 times for `not_due`; snapshot skipped
  eight times for `nothing_due`. No failed runs and no settlement run appeared.
  These skips do not establish a completed live cycle or successful delivery.
- MW9 is seeded/open; its window is October 30 through November 4 UTC and its
  first kickoff is October 31 at 12:30 UTC.
- Stored snapshots include `after-mw08` captured October 28 at 17:32:37 UTC and
  `daily-2026-10-29` captured October 29 at 13:13:04 UTC. Only labels, times and
  hashes were inspected; no private snapshot payload was published.
- Eight managers exist; seven are linked. This supersedes the earlier release
  record's six-link count without rewriting its historical observation.
- The shared odds budget reports 407 remaining and is unpaused. No provider
  request was made by this audit. The existing reserve remains 50.
- There are **zero** `dnb-check` runs in the hosted run table. Its schedule CHECK
  still permits only the five existing job types. There is no live moneyline
  verdict: this is not evidence that the market is unavailable.

The deployed-function metadata separately reports `gtl-api` v42 and
`gtl-epl-jobs` v1 active. Source metadata and grants close the old M-30 function
hash-readback gap; they do not close correction, tie-break, matchweek-cycle,
moneyline-market or device acceptance work.

## Decisions and dependencies still open

Tuesday corrections can change the next draft order after someone has picked.
Sean has been asked whether to preserve picks and flag for review, reorder only
unpicked managers, or wait for Tuesday before opening each draft. Until ruled,
new work must preserve entered picks and cannot invent a replacement draft rule.

The final auto-pick tiebreak needs a dated, permitted free league-table source.
An alphabetical club-code fallback is not the approved league-position rule.
Unavailable source data must remain explicit.

Moneyline requires distinct real events, at least two allowed books on at least
two of three checked events, valid two-way American prices and matching kickoff
times, with the shared free-plan reserve retained. No route, collection or UI
completion is claimed from pure rules, SQL or mocked-provider tests.

## Published source batches

| Batch | Pull request | Evidence | State |
| --- | --- | --- | --- |
| Rollover validation and reproducible read-only preflight | [#366](https://github.com/seanbalz/guess-the-line/pull/366) | Agent reports 78 targeted Node/SQL tests, typecheck, cloud build/privacy and Brand QA passed. Head `a8ac622d90322159e43ff9dede885682c5f82818`; clean sync verified. | CI running; not merged or released by this work. |
| Moneyline foundation and disabled market check | [#367](https://github.com/seanbalz/guess-the-line/pull/367) | Agent reports 260 EPL/migration/rollback tests and 47 final targeted tests, typecheck, cloud build/privacy and Brand QA passed. Head `dc6ddb708a7fcf48ab46fe1c3f627506b8bc0a89`; clean sync verified. | CI running; M-32 remains NOT_HOSTED. No market verdict. |

The access agent's disposable-database browser checks have found actual UI defects
in narrow-screen Fantasy tab labels, cold account access discovery and Play-tab
routing. Those repairs and regression cases remain in progress. Local browser
emulation is separate from acceptance on a physical iPhone.
