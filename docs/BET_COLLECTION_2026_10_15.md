# Collected bets and complete exports — October 15, 2026

Owner: Sean Balsiger · Record version 1

Sean requested that all supplied bets appear in collected data, then authorized
assuming missing odds and closing the shared-ticket export gap. The original
collection is 16 tickets: Troy's fourteen one-unit singles and Sean's two parlays,
with 22 selections in total. They remain associated with 2026 Week 5.

**Data update applied and verified at 19:13–19:17 UTC:** fourteen audited
corrections moved the hosted week from revision 24 to 38; all 24 existing tickets
remain. Sean's two parlays and eight other tickets are unchanged. Exact replay
stayed at revision 38, and preparation against the new state reports zero new
corrections. The local tracker received the same fourteen labeled assumptions
(revision 16 to 30). The export fix is implemented and verified locally, but its
production API deployment remains held as described below.

## Assumed prices

The fourteen unpriced Troy singles use **−110 as an accounting assumption**:
one unit risked has a potential profit of about 0.9091 units. This is not a
verified historical market price or an estimate of a sportsbook's point-buy
charge. Actual accepted odds, bookmaker, placement time and quote time remain
unknown. Source labels, public notes and correction reasons state the assumption.

The original intake and create audits retain unknown odds. The separate
[assumption record](../data/bets/2026-week-05-odds-assumptions.json) supplies stable
correction request IDs. The [preparation script](../scripts/prepare-social-odds-assumptions.mjs)
validates original receipts and account mappings, generates a guarded transaction,
and uses only existing audited `gtl_commit_social` corrections. A changed snapshot,
mapping, slate or already-priced ticket stops preparation or application. Exact
replay adds no corrections and cannot undo a subsequent owner edit.

Sean's +2100 and effective +337.24 combined parlay prices stay unchanged. The
Novig note preserves $50 risk and $218.62 potential gross return. Parlay unit
stakes remain unknown; no dollar-to-unit conversion or result is assumed. The
Jalon Daniels leg stays transcribed exactly and explicitly unverified.

## Export gap

The existing **Export my data** download gains a `socialBets` object containing
the signed-in player's shared tickets across all stored weeks, every parlay leg,
source and assumption notes, inclusion settings, outcomes, complete change
history, scoped game details and summary counts. Excluded tickets remain in the
download. Existing ballot, Challenge and audit fields are preserved.

The API derives identity from sign-in and filters by owner again when composing
the export. It never exports another player's tickets, raw receipt signatures
or private profile fields. If shared history cannot be read, the request fails
instead of silently producing an incomplete download. The existing active-group
requirement for this export route remains in force.

Local exports follow the same projection and retain each saved week's schedule
when the preview advances to another week. Historical local data without its
schedule produces an explicit error rather than disappearing from the export.

## Release boundary

The export change is additive and compatible with the deployed JSON downloader.
It needs **an API-only deployment**; no Pages deployment, database migration,
collector change or M-02 apply is required. Normal ticket corrections use the
already deployed write path and are independent of that code release.

Production deployment is held by [Gate D](REDESIGN_BUILD_PLAN.md#43-gate-d-deploys):
“Freeze windows (no deploy, no apply): Thu 12:00 PM PT until 1 h after the Thursday
kickoff.” The release preflight additionally protects six hours after every
published kickoff. With the hosted October 15 kickoff at 5:15 PM Pacific, the
next possible release is after 11:15 PM Pacific, subject to a fresh slate and
quiet-window check. No freeze override is inferred from the general deployment
request.

After green merged-source CI, build and scan that exact SHA, generate its release
manifest, deploy only `gtl-api` with JWT verification enabled, and verify its
version, unchanged migration history, authentication boundaries and an
authenticated owner export. This document does not claim that the export fix
has been deployed.

## Verification evidence

- Eleven import/assumption tests passed with no skips, including the real SQL
  RPC, atomic rollback, stale-state guards and replay after later edits.
- Export tests cover all 16 supplied tickets and 22 selections, multiple weeks,
  exclusions, historical changes, unknown stakes, owner boundaries, failed
  shared reads and local week rollover. Typecheck passed.
- Hosted readback equals the prepared final social state exactly. Original
  create audits and all non-target tickets are unchanged; the source intake
  hash is unchanged. League and migration fingerprints match the before read.
- The aggregate ballot fingerprint changed during this verification window:
  separate Week 6 Spread and Total submission audits occurred at 19:11:40 and
  19:14:12 UTC, bracketing the 19:13:24 ticket corrections. No global claim that
  every live table stayed unchanged is made.
- Local owner exports contain Troy's fourteen assumed-price singles and Sean's
  two parlays/eight legs. Original unknown prices remain readable in Troy's
  create history. Live authenticated export acceptance remains pending until
  the API release.

Private prepared transactions, readback and test logs are under the isolated
worktree's ignored `.local/bet-collection/`. The original dirty checkout and its
unrelated rule/planning edits were preserved.
