# EPL work and verification — October 29, 2026

Owner: Sean Balsiger · Coordinator: Codex · Source baseline: `76329b7f2c57bdb2a2710ab5a90817c3318f75da`

Sean requested parallel workflow agents for all EPL items, followed by the rest
of the approved backlog. This changes the immediate work order. It does not
establish a software deployment, migration apply, provider-market verdict or
physical-device acceptance. The frozen v62 tracker remains unchanged.

## Coordinated release batches

Sean explicitly authorized coordination with **Hide NBA and deploy EPL items**.
That existing chat owns deployment; this workflow owns source fixes and task
reconciliation. The coordinator verified the direct human authorization before
messaging it. No second deployment is dispatched here.

The release owner's first cutoff is **#364 + #366 (merged), #367, repaired #369
and this tracker PR #368**. Merge only reviewed green heads, then hold further
main merges while the owner pins the final main SHA and runs exact-source CI,
readiness and frontend / EPL-worker deployment. Avoid a docs-only main merge
interrupting that pinned run.

**Next EPL batch:** #370 (M-33 correction evidence and compatibility), the visible
commissioner review flag and EPL-DATA-01 player-directory enrichment. Their
publication/tests may continue in isolated branches during the release hold.
M-32/M-33 apply and enabling the DNB schedule require their separate named gates;
the first source deployment does not enable the moneyline game. No live verdict,
future matchweek cycle or physical-phone acceptance is implied by either batch.

## Work order

| Priority | Item | Owner | Current state | Required evidence to finish |
| --- | --- | --- | --- | --- |
| 1 | Capture and operational correctness | EPL operations agent | Five existing jobs are enabled. Rollover fix #366 is merged. Tuesday capture/audit and strict fallback work is published in #370; correction actionability and the current standings source remain open. | Tested fixes, reviewed source/CI, separate release and hosted readback. Preserve entered picks during corrections. |
| 1 | Account linking, claims and Fantasy design | EPL access/acceptance agent | Existing M-31 is hosted; seven of eight managers are linked. Disposable-database browser acceptance and narrow-screen/account-entry repairs are published in #369; CI/release pending. | Account-switch/claim/queue privacy and four Fantasy sections pass real-handler browser checks; real iPhone Safari/Home Screen acceptance remains separate. |
| 1 | Moneyline readiness and market gate | EPL moneyline agent | Five unpublished predecessor commits are preserved in their original checkout and continued in an isolated branch. M-32 and server-side gate are not hosted. The pending source repairs the schedule CHECK to admit `dnb-check` without enabling it. | Rules/SQL/gate tests and CI; apply/deploy/enable separately; a successful real DNB verdict before routes, collection and player UI proceed. |
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

Sean confirmed the Tuesday correction policy on October 29: **preserve picks;
flag for review**. When corrections would change the next order after drafting
has begun, preserve the existing picks and order and make the commissioner review
flag visible. D-68 item 23 records the exact ruling. Capture/audit and corrected
readers are separate from that visible review flag; no silent reordering is
permitted. The operations agent owns the follow-on UI/read contract.

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
| Rollover validation and reproducible read-only preflight | [#366](https://github.com/seanbalz/guess-the-line/pull/366) | Agent reports 78 targeted Node/SQL tests, typecheck, cloud build/privacy and Brand QA passed. Head `a8ac622d90322159e43ff9dede885682c5f82818`; clean sync verified. | All 12 CI checks passed; merged as `245b8d1177e6be3188c408e2d7d9ad5fb7a4b768`. Worker release remains separate. |
| Moneyline foundation and disabled market check | [#367](https://github.com/seanbalz/guess-the-line/pull/367) | Agent reports 264 combined EPL/migration/rollback tests and 55 focused tests after integrating #366 and distinguishing hosted versus pending-source preflight scopes; typecheck, cloud build/privacy and Brand QA passed. Head `56edf25f0f8e2898b125eadb9e1700f1990f3141`; clean sync verified. | CI running; M-32 remains NOT_HOSTED. No market verdict. |
| Access, private queues and Fantasy navigation/labels | [#369](https://github.com/seanbalz/guess-the-line/pull/369) | Agent reports 124 Node, 50 JSX, four browser cases and 26 axe analyses passed, plus typecheck/Brand QA/build. Head `59b5e023b7f8ae6683d4ec249fd14968be3b1919`; clean sync verified. Root inspected the 320px light capture. The identical Play-tab fix also landed independently in #364. | CI running; unique fixes still need merge/release and phone acceptance. |
| Tuesday recheck evidence and strict auto-pick fallback | [#370](https://github.com/seanbalz/guess-the-line/pull/370) | Head `d2f712852a1f17faf5c7325d4059cab0d60b8277`: agent reports 280 combined tests passed with no skips, typecheck/build/privacy/Brand QA passed. Review repair preserves current captures before M-33: only an absent recheck entry point is optional, and run detail records `recheckReady=false`. | CI pending; next release batch after #367. M-33 not hosted. Visible commissioner review flag is a separate follow-on under the confirmed preserve-picks rule. |

## Player-directory quality

A further read-only aggregate of saved snapshots found 150 rostered IDs, with
134 represented by a directory key in any stored snapshot. At least 16 IDs
therefore have no saved directory entry; key coverage is not proof that every
existing entry has a nonempty display name. This explains a verified gap behind
the independent desktop report of Unknown player rows.

**EPL-DATA-01:** the access agent is preparing daily-only enrichment from the
verified free Sleeper player directory, preserving minimal rostered display
metadata and raw-source hashes. A current directory must never replace historical
scoring positions. The local batch is not a hosted repair: its exit criteria
include source/CI/release, a new successful daily capture and fresh nonempty-name
coverage readback. Original snapshots stay immutable. The full directory is not
published in the repository or fetched on a player-facing read.

The access agent's browser checks use disposable SQL and emulated widths;
physical iPhone Safari/Home Screen acceptance remains separate. All remaining
items above have a named owner or an explicit source, product-rule, release or
future-event dependency. Return to the non-EPL queue after those boundaries are
recorded; do not label them complete to clear the work list.
