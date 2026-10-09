# Guess The Line — Week 5 shared ticket import

Owner: Sean Balsiger · October 8, 2026 · Import record v1

**Status: imported into live accounts and verified.** All sixteen tickets are
available in the deployed app. The transaction saved sixteen entries, audits,
request receipts and commits; replay left the week at revision 16 with no changes.

## Authorized scope

Sean requested that Troy's fourteen one-unit singles and his two supplied parlays
be committed, deployed and synchronized. These are shared, tracked external
tickets for 2026 Week 5. They count toward records by default and remain pending
until their results are reported. No sportsbook wager is placed by this operation.

The existing production Bet Tracker, Unit Betting views and dashboard card use
the same hosted records as the local cloud preview on port 4173. The owner-only
preview on port 8794 is a separate fixture store and is not an account sync source.

## Identity, provenance and replay

The import maps `sean` and `troy` through active Triple Threat memberships to real
Auth users and profiles. Display names are editable and are not identity keys.
Local fixture UUIDs are never copied. Sean authorized this on-behalf import;
the public audit reason and import receipt identify that operator separately
from the ticket owner used by the existing owner-scoped commit function.

`scripts/prepare-social-intake.mjs` validates supplied terms through the same
domain function used by the application, against the hosted Week 5 slate. It
produces a reviewable SQL transaction and manifest; it does not connect to or
write the hosted database. The transaction uses the existing service-only
`gtl_commit_social` function, retains the source request IDs, checks current
account mappings and initial state, and preserves existing entries and audits.
An exact replay adds nothing; mismatched content or concurrent changes fail.

The original intake is preserved at
[`data/bets/2026-week-05-social-intake.json`](../data/bets/2026-week-05-social-intake.json).
Its local-only wording describes the initial source capture. Current delivery
evidence belongs to this record and its dated release receipt.

## Unknown terms and remaining limits

- Troy: fourteen single bets, one unit each. Actual accepted odds, sportsbook
  and placement/quote times are unknown. Comparison market quotes are not
  substituted for ticket prices.
- Sean: the five-leg parlay retains +2100; the Novig three-leg parlay retains
  effective +337.24, $50 risk and $218.62 potential total payout in its note.
  Unit stakes remain unknown. The first screenshot's stake is also unknown.
- The Jalon Daniels selection is transcribed exactly and remains explicitly
  unverified. Screenshot calendar dates remain unknown. No outcome is inferred.

These missing terms limit ROI completeness and later settlement; they do not
prevent saving or sharing the tickets. This import does not complete the separate
D-18 virtual-pick competition or connect automatic sportsbook settlement.

## Verification

- Five import-planner and real-SQL tests passed, including replay after an owner
  edit, rollback on a later failure, changed-mapping/state rejection and preservation
  of another owner's existing entry, audit and receipt.
- Live readback matched every prepared entry, audit, receipt and saved payload.
  Troy owns fourteen one-unit singles; Sean owns two parlays. All count by default
  and remain pending, with the supplied unknown fields preserved.
- All four current profiles can read all sixteen shared entries through the
  hosted read function. The signed-in production UI displayed all sixteen bets
  and both imported parlays on the main dashboard.
- An exact live replay changed no state and added no entries or audits.
- Before/after fingerprints of weekly ballots, leagues and prediction archives
  are identical. No fixture identities, new schema or permission changes were used.
- All twenty-four frontend assets matched the deployed build on production and
  the local cloud preview. The live API remains version 14 with JWT verification.

The [release receipt](../planning/releases/2026-10-08-social-intake.json) records
source hashes, operator and owner mapping, request IDs, entry IDs and readback.
No deployment or data-sync blocker remains for these sixteen tickets. The unknown
terms listed above remain data limitations, not silently filled values.
