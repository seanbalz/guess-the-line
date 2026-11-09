# Gap period follow-up review — November 9, 2026

Owner: Sean Balsiger · Version 1 · Status: two reproduced UI findings, not fixed.

Scope is [PR #505](https://github.com/seanbalz/guess-the-line/pull/505) only,
source `9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`. Its
[frontend deployment](https://github.com/seanbalz/guess-the-line/actions/runs/42665392227)
succeeded, including live frontend-byte, access-boundary and unchanged-history
verification. These findings do not change that deployment result.

## Findings

1. **Medium: recommendation changes reset the record period.** Select All time,
   then change Recommendation week: Record period returns to Week. Refresh lines
   also returns All time to Week, even without changing recommendation week.
   `VirtualUnits.jsx` removes the record while loading and keys it by account/week;
   `useGapPeriod.js` initializes its local selection to Week on each mount. D-80's
   independent record scope is therefore lost during these actions. Keep the
   selected period/range in account-scoped state that survives these reloads,
   while preserving cancellation and stale/private-data guards.
2. **Low: an expanded list retains the old period's row limit.** In the synthetic
   fixture, Week 9 has eight graded gaps. Click Show all 8 gaps, then select All
   time, which has twenty. The headline correctly shows twenty graded gaps, but
   only eight list rows render and the button says Show first 6. The player must
   collapse and expand again to see every row. `GapRecord.jsx` stores expansion
   as the previous numeric row count, which is not reset or recomputed on period
   changes. Store expanded/collapsed intent or reset consistently when scope
   changes; the label and displayed list must agree.

The existing grading function is unchanged. This fixture's All time headline
included all twenty outcomes; finding 2 concerns the displayed list, not a lost
outcome or rewritten pick. No production data was read or written by this audit.

## Reproduction evidence and limits

An isolated local Chromium session rendered the actual unchanged `VirtualUnits`,
`GapRecord` and `useGapPeriod` modules with a synthetic API adapter. Two synthetic
2026 weeks supplied eight and twelve graded outcomes. The browser used the real
Record period, Recommendation week, Show all and Refresh lines controls. Both
paths completed twice; the second run returned this structured observation:

| Step | Period | Headline graded gaps | Visible list rows | List control |
| --- | --- | --- | --- | --- |
| Expand Week 9 | Week | 8 | 8 | Show first 6 |
| Select All time | All time | 20 | 8 | Show first 6 |
| Change recommendation to Week 8 | Week | 12 | Not captured | Not captured |
| Select All time, then Refresh lines | Week | Not captured | Not captured | Not captured |

The scoped harness/CLI reproduction remains ignored under
`.local/gap-followup/` in the `codex/gap-deploy-readiness-2026-11-09` worktree.
Initial tool setup encountered sandbox DNS/loopback isolation, an incorrect CLI
snippet format and development entry pre-transform warnings; these are separate
from the completed state-transition checks. This is local behavioral evidence,
not a full production sign-in, real phone, server account-switch or visual audit.
No application implementation was changed. Add regression coverage for both
transitions with their eventual fixes; the committed UI tests currently mock the
period hook and do not exercise these parent unmount/remount transitions.

## Remaining acceptance and documentation

Signed-in production period/range totals, slow/failed reads, actual sign-out and
account switching, and physical-iPhone controls/scrolling still need recorded
acceptance. Local synthetic checks do not establish those results.

[PR #507](https://github.com/seanbalz/guess-the-line/pull/507) owns the durable
release record and completion-register reconciliation. It was open at review,
with corrected-head CI outstanding; it needs no application redeployment. Keep
that work with its existing owner. The separate NFL gap-scale change, Player
Props, migrations and held FEPL design are outside this review.
