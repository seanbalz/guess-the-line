# Guess The Line — saved-precision Virtual Units ROI

Owner: Sean Balsiger · Version 1 · November 8, 2026

Status: implemented and checked locally; independent review, exact-source CI
and compatible API/frontend release remain open. This record contains synthetic
fixtures only. No production rows or private picks are reproduced.

## Authority and scope

Sean answered **“Move forward with rec”** to the recommendation that week and
season ROI use saved four-place Virtual Units results uniformly. D-78 records
this confirmation without rewriting D-18, D-26 or D-35/D-36 history.

`shared/bets-qual.mjs` previously rounded `units`, `riskUnits` and `netUnits`
to cents in `normalizeWeek`. Both raw-pick weeks and SQL/API rows passed through
that normalizer, as did every week before season aggregation. The correction
retains four decimal places there, removing floating-sum noise at the saved
precision. The existing ROI percentage still rounds to two decimal places.
Season totals sum four-place week amounts before calculating the season ROI;
they do not average week percentages or sum cent-rounded weeks.

The shared model reaches API `projectBoard` / `projectSeason` in `cloud/bets.mjs`
and native Virtual `weekCard` in `web/src/next/bets/place.js`. The SQL readers
`gtl_bets_week_rows`, `gtl_read_bets_board` and `gtl_read_bets_season` already sum
saved numeric values, so no SQL change is needed. Recommended's `summaryOf`
also calculates its percentage from unrounded saved net; its separate amount
labels remain unchanged. Awards' `betsLine` retains four-place net and its own
existing ranking policy; no award controller or persisted award is changed.

Three placed picks **or** 3U still qualifies a week. Pending/void rows retain
pick/unit credit and contribute no settled risk/net. Loss fallback remains
minus the saved stake; a push counts as settled risk with zero net. ROI stays
null without settled risk. Board order is the existing two-place ROI, then
four-place net, then wins; equal keys share a rank. Season eligibility still
requires at least one qualified week and includes all weeks in its totals.

All visual layouts, tokens, amount/percentage formatting, locks, reveal/auth,
rosters and write controls remain. Fixtures below the current half-unit entry
floor test reader arithmetic only; they confer no entry permission. Legacy
amounts above 100U remain readable. No new maximum/precision validation,
migration, data rewrite, settlement, saved quote, result, audit, receipt, score
or timestamp change is included. PR #497 / M-41 Custom entry is separate and
unapplied; this approval does not apply/enable it. FEPL framing remains queued.

## Representative impact

These are deliberately synthetic examples, not observations of player history.

| Saved settled stake / net | Prior shared ROI | Corrected ROI |
|---|---:|---:|
| 0.5U / +0.4545U | 90% | 90.9% |
| 0.5U / +0.4505U | 90% | 90.1% |
| 0.01U / +0.0091U | 100% | 91% |

The first two correspond to existing half-unit win economics at −110 and −111.
Give each player two additional pending/void half-unit picks and both qualify
through three picks. The old model gives both +0.45U, 90% and T-1. The corrected
model ranks the first player 1 and the second 2. Thus previously tied historical
boards can separate even without custom entry or a change to saved results.
An exact four-place tie remains shared. Equal displayed ROI also uses saved net
before wins, rather than collapsing distinct net amounts to cents.

Across synthetic weeks, +0.4545U +0.4505U +0.0091U on 1.01U settled risk gives
+0.9141U and 90.5%; cent-normalizing those weeks previously gave +0.91U and
90.1%. A two-pick 2.9999U reader fixture remains below qualification, and tiny
settled losses retain risk instead of becoming a null ROI.

Hosted assessment was attempted by the controller through a table-identity-only
read. The connector returned `UNAUTHORIZED`, requiring reauthentication; no
production query result or mutation occurred. Actual affected-player/week counts,
historical rank changes and production data-preservation hashes were not
obtained here. Local fixture parity cannot establish those hosted facts.

## Local verification

The new tests failed against unchanged product source: 7 of 16 Node/SQL tests
failed, including exact SQL/shared net parity, fractional week/season totals,
qualification and tie-breaks; 1 of 16 native component tests failed because
the card showed +90% instead of +90.9%. No SQL test was skipped. After the
shared normalization correction, those 16 Node/SQL and 16 native tests pass.

The PGlite fixture runs the actual handler with the complete local migration
set. It compares SQL numeric totals directly with shared totals without
cent-rounding the expected evidence. API week/season reads preserve fractions,
qualification and no-term projections. Private roster filtering/refusal and
service-only grants remain covered. Full fixture selections/results/audits/
timestamps are equal before and after every read. Native static markup keeps
the existing +0.45U / +0.01U amount labels with corrected percentage labels.
Final focused checks pass **104 Node/SQL tests**, **52 component tests** in
seven files, **15 native token contracts**, typecheck and Brand/D-18 document
QA, with no skips. Dependencies came from `npm ci --no-audit --no-fund`;
the ignored local SQL runtime uses the same pinned `@electric-sql/pglite@0.5.8`
as CI. No dependency manifest or lockfile changed. Exact commands and red/green
logs are retained in the ignored task report for controller review. No browser
or actual-phone acceptance is claimed by static component checks.

## Compatible release and rollback

Release the API and frontend from the same reviewed, successful source through
the protected manual workflow; no migration or SQL apply belongs to this change.
Mixed versions read the same saved rows but may temporarily show different ROI
or ties, so verify the compatible pair's source/assets/API metadata and available
native reads. Preserve release evidence and disclose unavailable hosted/phone
checks. Exact CI, permissions/privacy and data-preservation requirements remain.

Rollback redeploys the previous compatible API/frontend source through the same
protected path. It restores the former displayed arithmetic, so previously split
ties can collapse again; it requires no result reconstruction, row rewrite or
SQL rollback. Verify source and reader behavior after either release. No release,
actual-phone acceptance, credential access or private-board synchronization is
established by these local checks.
