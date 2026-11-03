# Pick a Team turn queues — M-40 release, November 3, 2026

Saved backup rankings now assign the highest-ranked available club when the
manager reaches the clock. Consecutive queued managers advance in draft order;
an exhausted ranking leaves the turn open for a manual pick. The app shows the
recorded team in a persistent confirmation and a one-time popup. Existing
kickoff resolution and latest-picker change windows remain in force.

Sean authorized the rollout with **"Apply m-40"** after confirming the exhausted
queue behavior. PR [#455](https://github.com/seanbalz/guess-the-line/pull/455)
merged as `5d72f870a58c8c803890c37ceced7e7bdeaea231`. This release used exact
green main source `4cf149e7c4361547647db3573651fcd57204e36d`; subsequent
documentation commits are not the deployed source. The scope and rollback were
reviewed in [release card #460](https://github.com/seanbalz/guess-the-line/issues/460).

## Compatible deployment first

All 12 exact-main checks passed: Tests `41730530373`, Dashboard checks
`41730530331`, Brand QA `41730530379`. Protected source check `41732536400`,
readiness `41732638317` and combined API/frontend
[deploy `41734832322`](https://github.com/seanbalz/guess-the-line/actions/runs/41734832322)
passed. Sean approved the protected environment gates in GitHub after the
integration's approval attempts were rejected with HTTP 403.

- API: ACTIVE **v49**, JWT verification enabled, bundle SHA-256
  `b1488217fc89c0fe9de03f7fe20d4d9afe0485714305b88158739614b71776c4`.
- Pages: `06129739-8c5c-4186-b270-bc739637c9d4`, production
  `https://guess-the-line.pages.dev`, verified at 22:58 UTC. The deployment URL
  is access protected; canonical production assets were checked.
- Manifest source SHA-256:
  `cbce4606f1ab519cd18027e73a10c49b880bbbe6860a03e1a60c6bb068cee93d`.
  Frontend SHA-256:
  `f46033d10ba051794bed3457dba0f3d1aa55f8527d7248fba498c456522e61ec`.
- Deployment evidence artifact `13277923827`, ZIP SHA-256
  `420831c3c44d077f3f44e6e4792d20ecf2b7ae74556fcce48fe4585760901197`,
  independently downloaded and verified. Source/readiness artifacts were also
  verified before dispatch.
- Independent readback at 23:20 UTC matched all **129** canonical served assets
  against the clean release manifest. Served app JavaScript contains the backup
  confirmation and capability handling. Supabase-retrieved `cloud/epl.mjs` and
  `supabase/functions/gtl-api/index.ts` match the selected source exactly.
  This verifies those modules, not every byte of the remote API bundle.

The deployment preserved the other nine functions and the reviewed 74-entry
migration history, SHA-256
`4345486d8d5097cfa2d8a114d44c5569682e5a70cc42a97901635e8379434066`.
Its signed-out boundary report checked 457 probes: 437 denied and 20 explicitly
awaiting pending migrations, including M-40 before its apply.

## Authorized apply and verification

At 23:21 UTC the Supabase MCP applied only the exact merged file
`supabase/migrations/20261103212932_gtl_epl_turn_queue.sql`, name
`gtl_epl_turn_queue`, as hosted version **`20261103232119`**. The three prior
bodies and service-only invoker grants matched immediately before apply; the
new helper and M-40 history entry were absent. History increased from 74 to 75.
The apply performs no picks, queue changes or backfill.

All four post-apply bodies match the source (`md5(prosrc)`), with exactly one
RPC each, security invoker, empty search path, service_role execute and no
public/anon/authenticated execute:

| RPC | Before | After |
| --- | --- | --- |
| `gtl_epl_advance_queues` | Absent | `e24ecf47884f3b7e7be4166bbfe3e287` |
| `gtl_epl_save_pick` | `a077d98ad82e5e161bc23018b6e841c2` | `d70bae7bb2b8b6a43d15c129096e8475` |
| `gtl_epl_save_queue` | `96df64835d5c206c7bc85f3d95ae4217` | `88b6b2c7bfb8ff448fc548cdf154a519` |
| `gtl_epl_week_state` | `82ab06aaa1422df82265e42dd3be044e` | `80849bdf72a9459d182fd61d3917fe0a` |

The latest hosted week reader reports `queueOnTurn=true`. Before/after hashes
match for all eight preservation groups: EPL picks (12), private queues (5),
pick history (12), weeks (2), bonuses (3), finished per-ballot Guess scores
(36), settled Virtual Units picks (7), and settlement records (57). Private
receipts remain local; no raw rankings or player data are in this record.
Security advisor findings/counts are unchanged, ignoring observation times.

The registry moves M-40 to `APPLIED` with its actual hosted version; the
advance-queues denial probe remains and its pending exception is removed.
Post-apply live boundary verification at 23:26 UTC checked all 457 probes:
**438 denied**, 19 awaiting only M-33/M-34/M-35. The new helper specifically
rejects an anonymous inert request with HTTP 401 / PostgreSQL `42501`. Global
`--strict` correctly stops at the unapplied M-35 `epl_order_corrections` table
(404); M-40 has no pending exception. This run used the shared checker with the
deployed app's public browser key and did not submit a real pick.
M-33/M-34/M-35 remain unapplied. Reserved M-39 is a separate unmerged proposal.
No worker, cron, odds collection, historical repair or other migration ran in
this rollout.

## Validation and recovery

Pre-release checks passed: 74 focused Node checks, 87 boundary/migration checks,
670 component tests, the M-40 rollback harness, four EPL browser scenarios,
typecheck, build/privacy scan and Brand QA. Local browser evidence covers
server assignment without a browser pick request, ownership, persistent note,
one-time popup/reload, 320/390px Light/Dark and Axe. Live signed-in/real-phone
confirmation acceptance is not established by deployment metadata or those
local scenarios. No real player pick was submitted to test the hosted apply.
After updating the hosted registry, 72 focused migration, boundary, draft,
route and PGlite turn-queue checks passed with zero skips; Brand QA and
`git diff --check` also passed.

SQL rollback `supabase/rollback/20261103212932_gtl_epl_turn_queue.sql` restores
the three previous bodies, retaining all data and the unused private helper.
Compatible clients then return to the kickoff explanation. API rollback source
is `386467aafff0090ff7f3bca92d457daeb7a5ef0e` (previous v48); Pages rollback
target is `489e8b38-2a7f-4d23-a8b2-d73706c4fe0d` from
`134f17c8dcc2241c54bee9d67712e177d718c2b8`. Database restore, record deletion
and replay of historical migrations are outside this rollback.
