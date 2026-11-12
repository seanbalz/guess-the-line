# Gap period follow-up review — November 9, 2026

Owner: Sean Balsiger · Version 3 · Status: both findings merged and verified in production.

## Release closeout — November 11, 2026 Pacific

Sean approved the mockups and requested "Merge and deploy". Readback found
[PR #510](https://github.com/seanbalz/guess-the-line/pull/510) already merged on
November 9 at `3d7bbc12d3eeb8692d5c133ed4cba68b43eeb8bc` (implementation
`dfc4d50ce20e4edaf9704b1575408d0293b92de8`). That merge is an ancestor of the
latest successful frontend release source,
`cac63e7a0d10a38b4badc41c663a763b5301aee4`. Comparing the three changed modules
confirms the account-scoped period preference, controlled period hook and
boolean expansion remain present; the hook is unchanged. Subsequent gap-scale
and Player Props changes remain intact.

[Release run 43124865004](https://github.com/seanbalz/guess-the-line/actions/runs/43124865004)
passed its exact-source CI gate, hosted preflight, frontend deployment and live
verification. Its downloaded `verified.json`, checked at
`2026-11-12T00:11:11.320Z` (November 11 Pacific), records Pages
`b8019df1-f084-4ce7-bbb8-99757902b6dd`, all 176 production assets matched, and
frontend digest `988570448bcc405ffb3233ca6118ab0994372cc138a5bb584281db76a12dd461`.
The [durable release record](RELEASE_2026_11_12_NBA_N1.md) preserves the complete
batch evidence and limits. This closes the stale "not deployed" status; no
additional production run was necessary or dispatched for this readback.

The release kept API v55 and migration history unchanged (86 rows, digest
`5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382`). Its boundary
report records 514 denials and five documented Player Props probes awaiting
the feature flag, not five successful denials. This establishes the fixes'
presence in verified deployed assets. Fresh signed-in Gap interaction and
physical-phone acceptance were not performed during this closeout; the local
behavioral regression evidence below remains the interaction evidence.

## Implementation and mockup update

Sean asked to fix both issues and send mockups. The parent recommendation
controller now retains only period/custom-range intent across its child reloads,
scoped to the account. The composed board remains inside the keyed child with
the same cancellation, complete-read and hidden-stale-state checks. Expansion
stores a boolean, so an expanded list always includes every current row and the
collapse control remains accurate. This adds no persistent browser storage.

[Dark/Light before-and-after review](../design/gap-period-fixes-2026-11-09/index.html),
[Dark overview](../design/gap-period-fixes-2026-11-09/dark-overview.png) and
[Light overview](../design/gap-period-fixes-2026-11-09/light-overview.png) use actual
app components with synthetic local accounts, slates, references and finals.
The fixes preserve the original appearance and grading rules. Sean's mockup
approval, merge and deployed-source verification are recorded above.

Verification of the fixes:

- Both new lifecycle regressions failed against the unfixed source for the
  reported reasons, then passed with the implementation.
- The full 21-case recommendation browser suite passed. A final three-case run
  includes those two regressions and a new actual fixture sign-out/sign-in test:
  the second account starts at Week with zero graded gaps, never the first
  account's All time result. This is 22 unique browser cases across the runs,
  not hosted authentication or physical-phone acceptance.
- 39 focused Node checks and six UI render checks passed, with zero skips.
  Typecheck, Brand/D-18 documentation QA, cloud build, bundle-only privacy scan
  and whitespace checks passed.
- Paired 390px Dark/Light captures show All time and applied Custom range
  retained after refresh, and all fourteen rows after growing an expanded
  seven-row week. Capture fixture errors were empty for both versions.

Initial private test-run setup failed before tests due to worktree dependency
links and config working directory; both were corrected. The browser CLI did
not support importing the fixture, so capture used the repository's Playwright
runtime. The preview-sheet renderer's initial implicit-label lookup timed out;
its explicit selector rendered both sheets successfully. Existing Vite chunk
size and NO_COLOR warnings remain. These setup attempts are not test passes.

The earlier findings and their original observations follow for provenance.

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
No application implementation was changed during the initial review. At that
point the committed UI tests mocked the period hook and did not exercise these
parent unmount/remount transitions; the implementation update above adds that
regression coverage to the real controller browser suite.

## Remaining acceptance and documentation

Signed-in production period/range totals, slow/failed reads, actual sign-out and
account switching, and physical-iPhone controls/scrolling still need recorded
acceptance. Local synthetic checks do not establish those results.

[PR #507](https://github.com/seanbalz/guess-the-line/pull/507) owns the durable
release record and completion-register reconciliation. It was open at review,
with corrected-head CI outstanding; it needs no application redeployment. Keep
that work with its existing owner. The separate NFL gap-scale change, Player
Props, migrations and held FEPL design are outside this review.
