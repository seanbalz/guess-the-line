# Research assessments production release — October 31, 2026

Owner: Sean Balsiger · Version 1

The first independent research/recommendation stage is deployed at
[Guess The Line → Bets → Research recommendations](https://guess-the-line.pages.dev/#bets/research).
The API, additive research schema and frontend were released in that order from
`89acd94cfd1f5e0ab837b0150dd28e12807ff5e8`. All 127 production asset hashes matched
the release build. Guess entry, locking, scoring references, points and reveal
rules are preserved. [Release card #394](https://github.com/seanbalz/guess-the-line/issues/394)
records the approved scope, source and recovery plan.

Sean directly requested “Merge and deploy” after reviewing the first-stage scope
and unapplied migration. Feature [PR #393](https://github.com/seanbalz/guess-the-line/pull/393)
merged. A quota-fixture UTC-day assumption was repaired in
[PR #395](https://github.com/seanbalz/guess-the-line/pull/395), without changing
production quota rules. All twelve exact-main push checks then passed:
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/41147616463),
[Dashboard, Persona and four browser shards](https://github.com/seanbalz/guess-the-line/actions/runs/41147616448),
and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/41147616457).
Later main PR #392 added formatting release records only; this release retained
its reviewed source pin. No other pending migration was applied.

## Protected releases

The integration token could not approve environment reviews (HTTP 403, “Resource
not accessible by integration”). Sean approved each production gate in GitHub
and confirmed completion here. All six workflow runs succeeded.

| Target | Source check | Protected readiness | Protected deployment |
| --- | --- | --- | --- |
| API | [41148566321](https://github.com/seanbalz/guess-the-line/actions/runs/41148566321) | [41148611992](https://github.com/seanbalz/guess-the-line/actions/runs/41148611992) | [41204624297](https://github.com/seanbalz/guess-the-line/actions/runs/41204624297) |
| Frontend | [41205170878](https://github.com/seanbalz/guess-the-line/actions/runs/41205170878) | [41205360008](https://github.com/seanbalz/guess-the-line/actions/runs/41205360008) | [41205635313](https://github.com/seanbalz/guess-the-line/actions/runs/41205635313) |

| Component | Verified state | Digest |
| --- | --- | --- |
| `gtl-api` | ACTIVE v44; JWT verification enabled | `7d63882f699b204d6f5b0e380ed0b1aa7638af5283fc8185d9dd51c62be12d00` |
| Pages | `a2e32966-cd1c-4cbd-9aad-69ef01766952`; 127 matching production assets at 13:32:11 UTC | `d70d8e5ad82b9b05da1c60b30f236e086e18fe277ce4ba2f139805404677a0ad` |

The immutable Pages URL is protected by Cloudflare Access. The workflow verified
all production asset hashes, one API version increment, unchanged other Edge
functions and unchanged migration history during each deployment. The frontend
release preserved API v44 and its bundle hash.

The API workflow records `apiSourceVerified: false`: it does not independently
match every remote bundle byte to the checkout. A separate recovery/readback
matched seven critical deployed project files exactly to reviewed source:
`gtl-api/index.ts`, `cloud/lines.mjs`, `cloud/research-assessments.mjs`,
`cloud/trends-research.mjs`, `shared/research-assessments.mjs`,
`shared/matchup-statistics.mjs` and `shared/research-play-statistics.mjs`.
This supports route/source acceptance without claiming complete bundle equivalence.

## Migration, permissions and preservation

Supabase MCP applied only `20261030204548_gtl_research_assessments.sql`, SHA-256
`3bae12fe2859005d1106e33d92c1e0adc34962c4d5180d11ed74c923c948084f`, once after
compatible API deployment. Hosted version is **20261031131929**, name
`gtl_research_assessments`. Fresh preflight was at 13:19:23 UTC; verified schema
and preservation readback was at 13:20:15 UTC. History grew from 71 to 72 entries;
every old entry is unchanged. The new history SHA-256 is
`b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
M-33/M-34/M-35 remain unapplied.

All seven functions have one signature, source-identical bodies, security invoker
and empty search paths. Anon/authenticated execute is false; service execute is
true. The three tables have RLS and no browser grants or policies. Service grants
are select/insert, plus update on only `status`, `quota`, `error`, `quote_payload`
in quote fetches. No synthetic production player, research link or quote was
created for acceptance. Security advisories added only the three expected private
table/no-policy INFO notices; existing warning categories stayed unchanged.

| Function | Verified body MD5 |
| --- | --- |
| gtl_begin_research_quotes | `151eb638e13f5819138da76e8a9f7b3d` |
| gtl_finish_research_quotes | `33e0d70f2f40c542e2ecc5ff0770f28e` |
| gtl_publish_research_snapshot | `9cd98abe2a0922720e11cd71a4df9f4a` |
| gtl_read_research_quotes | `8d3252b268f1271c4780e1c324a5fe82` |
| gtl_read_research_snapshot | `1d73de939ea98169050302613b1195c2` |
| gtl_read_research_submissions | `2046d650ee71627433b358f339b5d741` |
| gtl_submit_research_link | `e00f9ffca4fabc7a3e7cde5d98f67dee` |

All existing public GTL function bodies, grants and configurations retain MD5
`1d98dd538caeb84cba770348fa6f8b15`. Sorted-jsonb-md5-v1 preservation checks matched
before/after apply and again after the frontend release at 13:36:31 UTC:

| Protected set | Rows | Unchanged MD5 |
| --- | --- | --- |
| Finished Weeks 1–7 score rows | 359 | `1e2753375bbf6719a44d32a4d7323fc1` |
| Finished Weeks 1–7 ballots | 25 | `c097fbbce481d5124e710818d6d7a0f5` |
| Settled Virtual Units picks | 7 | `056fba89cd3e997c27b02dc3a3ee32a4` |
| Virtual Units settlement records | 44 | `8bf484c46a103d1d3065f874756d2b67` |

Strict research-only HTTP verification passed 16/16 requests: all three tables
and seven RPCs returned database permission code 42501, and all three API routes
refused missing and invalid sessions. The local probe used the configured proxy;
an earlier direct-network attempt failed before a response and was not counted
as a successful denial. Global release verification checked 444 resources:
425 denied, with 19 explicitly awaiting only unrelated EPL migrations. New research
absence exceptions are removed in this evidence batch.

The applied ledger now reflects the verified migration. Research test worlds
deduplicate their explicitly included migration against HOSTED, preserving the
same tests after apply. One hundred focused ledger, SQL, provider and boundary
checks passed locally. The research browser flow also passed against the applied
ledger, including Axe at 320/390px in both themes; typecheck and brand QA passed.
Raw receipts, source downloads, logs and screenshots remain ignored under `.local`.

## Operational scope and remaining acceptance

The independent assessment list and the existing Your guess vs. market list are
separate. Green remains unavailable until a tested model qualifies. The three
reference analyses and evidence/quote contracts are in
[the stage-one record](RESEARCH_ASSESSMENTS_STAGE_ONE.md).

No discovery/odds scheduler, subscription or extra quota was enabled. Automatic
X coverage is partial; submitted links remain pending until accessible content
is extracted and reviewed. No private operator snapshot was published during
this release. Unavailable evidence and quotes retain their explicit states.

The deployed metadata, assets, SQL readbacks and signed-out boundaries are
verified. Real signed-in browser and physical-phone acceptance remain open;
they are not inferred from the synthetic browser suite or gateway denials. The
user's connected Desktop Commander device was offline during this release.

Recovery remains `GTL_FEATURE_OFF=research-assessments`, preserving all stored
rows, or the tested permission rollback for only the seven new service entry
points. Restore only a reviewed previous API/frontend source if needed; never
drop the new tables or rewrite guesses to restore a fingerprint.
