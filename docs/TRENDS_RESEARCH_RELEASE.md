# Guess The Line — trends research connection

Owner: Sean Balsiger · Version 1 · October 21, 2026

Status: first reviewed feed and UI deployed; API history-source correction pending.
See the [dated release evidence](RELEASE_2026_10_21_TRENDS_RESEARCH.md) for API v29,
Pages 0dde8b76, preservation, signed-in feed acceptance and the source mismatch
found during acceptance. The original preflight card below is retained as context;
the dated record supplies the actual release and rollback identifiers.

Sean approved the trends implementation and then instructed "get it connected".
This release connects the approved reviewed-import phase. Automatic X ingestion,
paid data access, automated fades and wagers are outside this release.

## Configuration and privacy

`GTL_RESEARCH_REVIEWED_FEED` was saved to the existing production Supabase
project at 2026-10-21 21:00:50 UTC. The dashboard's SHA-256 readback exactly
matched the validated 3,178-byte private JSON:
`1ac6798939e89dab2aaabae90da4ec12eafb2956617ab7f2f24fa36024fe1796`.
The dated capture checks all six requested primary accounts. Posts without
complete usable terms remain absent; availability is not a continuous-feed claim.

An operator reviewed primary pages, timestamps, factual terms and every NFL
dependency. Summaries are newly written factual reports with source links; no
images, video, promotional prose or full post text are republished. This review
does not grant a license for future scraping or copying. The private audit retains
the source/reuse basis separately. Original prices absent from the posts remain
unknown; claimed trends and outcomes are not presented as independently verified.

The exact configured feed passed strict schema validation and projection checks:
closed NFL markets reveal no entry ID, title or URL; the separate non-NFL Trent
card is retained; current and historical NFL entries appear only in their own
week after their market is open. No feed contents are in public assets or Git.
Configuration alone was not evidence of a live route. The dated release record
now establishes its deployment and the signed-in Trent feed readback.

## Release card

Runtime source: the full PR #161 merge SHA, to be recorded in its release card
before dispatch. Target `api-and-frontend`, API first. The API adds the
authenticated research route without changing existing readers/writers. The old
frontend remains compatible; the new client handles research unavailability.
No database, collector, odds-budget or app-default change is part of this release.

Baseline: API v27 ACTIVE with JWT verification and bundle digest
`8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656`;
Pages `dcfb977b-c388-4706-b728-d0c11e356228`, source
`368f5d46cd036d74f9dc5c32cf572dd702d320b2`. Recheck provider state before deploying:
other authorized work may advance production. The integrated source also preserves
the independently merged Recommended-percent/trend details and private NBA schema.
This release does not apply that schema or any other migration.

Required gates: final reviewed-source PR checks, exact merged-main push CI,
protected source/readiness runs, fresh migration digest and pending-file review,
preservation hashes for social records/receipts, ballots, finished scores, groups,
Virtual Units original terms, function grants and unrelated worker versions.
Review a new migration-history digest if the independent NBA apply completes.
Do not reuse an older digest after hosted history changes.

Rollback: disable only `research` using the existing feature-off configuration,
then restore the prior reviewed API/frontend through the shared release workflow.
Retain the private feed and every player record. No delete, migration rollback
or data rewrite is required. The release workflow keeps JWT verification enabled.

## Acceptance

Record source and deployment identifiers, unchanged data hashes and migration
history, signed-out denials, actual signed-in research/source display and hosted
Edge runtime results before claiming the connection is live. The prepared history
must still match the fresh source. Its stale/failure state withholds leans.
Physical-phone and human visual acceptance remain separate checks.

API release metadata verifies a version increment and bundle digest, but the
shared workflow does not independently prove API source-byte equivalence
(`apiSourceVerified: false`). Frontend manifest asset hashes are independently
verified at the immutable and production URLs. Preserve that distinction in
the final release evidence.
