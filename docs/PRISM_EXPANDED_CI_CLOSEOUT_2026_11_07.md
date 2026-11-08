# Expanded Prism CI follow-up — November 7, 2026

This records source integration and local verification, not deployment. The
reviewed product and test source is
`04daf0b63b0d18b734f029deda7d7fd219421d41`. All scoped task corrections have
independent approval. The final whole-branch addendum, exact-source CI and
protected release remain required. Only the separately recorded Home release,
Pages `6a847959`, is live. Dates are November 7 Pacific, November 8 UTC.

## Previous CI result

At `2b7c009a`, Tests, Brand QA, dashboard, Persona and Windows checks succeeded.
The [Dashboard run](https://github.com/seanbalz/guess-the-line/actions/runs/42451818573)
completed with these browser results:

| Shard | Passed | Failed |
| --- | ---: | ---: |
| 1 | 120 | 2 |
| 2 | 96 | 16 |
| 3 | 117 | 2 |
| 4 | 113 | 2 |

All 22 failures have concrete causes: three removed league-picker openers;
sixteen numeric matches inside static inline G artwork; two obsolete native
header selectors or geometry checks; and one real narrow EPL Leaderboard label
overflow in Linux Chromium. The earlier 49-case local selection did not cover
all of these failures and did not establish full CI success.

## Reviewed corrections

**League picker paths.** Worker source `b01c7bb3` is integrated as `ab2b9840`.
The EPL shell capture opens the actual native Research/FEPL destination. Trends
scope changes use the actual Research landing and league picker, then browser
Back to the exact previous address. Tests retain the held private read, loading
and absence checks, Community history request count, failure behavior, recovered
Carolina filter and account reset. The original selection had three failures
and one pass; the repaired selection passed all four cases in 1.4 minutes.
Commit `3ccf6414` describes this coverage as restoration after a remount, rather
than an in-place scope change within the same hook instance.

**EPL label fitting.** Worker source `9318f4ee` is integrated as `59df8f42`.
The last grid track reserves the Leaderboard label's intrinsic width. Full 16px
text, 44px targets, existing labels, routes and selected styles remain. At wider
sizes the tracks remain equal. A representative fallback font reproduced a
4.125px text spill before the fix; corrected labels retain 5px insets. Four new
cases and the unchanged EPL frame case passed, as did 45 component and 15 token
checks. The matrix contains 48 views across fonts, themes, widths and sections.
Forced-color and axe coverage targets Leaderboard at 320px, rather than all 48
views. [Scope and evidence](PRISM_EPL_COMPACT_LABELS_2026_11_07.md).

**Compact G packaging and header contracts.** Worker source `b94d567e` is
integrated as `4dd785e6`. HomeBrand uses the established `?no-inline` import
option. The same SVG bytes now load as external media, avoiding numeric matches
from SVG drawing values in image attributes. All sixteen previously failing
privacy cases pass with the same scanner, secrets and permitted-value rules.
Games tests assert its actual compact G, selected 52px sport circle, header
containment and detail-title clearance with a 1px tolerance. There is no null
skip or generic either-frame acceptance. All 18 targeted cases passed, followed
by three final identity executions. Strict Node, typecheck, Brand QA, build and
bundle privacy checks also passed.

Both assets returned HTTP 200 with SVG MIME type and decoded in Dark and Light
at 320px and 390px. Served SHA-256 values equal the unchanged Home and native
files:

- Lime: `9d44fb0d29b21a5fc3fdc0177fb5cf906392e31c5979dbf411d950755f9a6ac8`.
- Light: `ea8f11978dc2fffc3b51a15a6b631ccdb3e0be52f22be845df9e4dcbb1e74401`.

Displayed size remains 64 × 54; natural size is 185 × 150. This verifies local
served assets, not production CDN headers or physical-phone rendering.

Normal capture replay writes ignored output. Only the exact environment values
`GTL_NATIVE_ACTION_CAPTURE=1` and `GTL_IDENTITY_SCOPE_CAPTURE=1` opt into their
original design directories. Every screenshot, theme, width, forced-color state
and assertion still runs. Old manifests retain their original source and capture
provenance; they do not claim the current helper bytes. All 1,759 tracked design
files remained byte-identical. Thirty native and four identity replay images
exist only in ignored output.

## Back-scroll regression closure

After the header guard was corrected, the original game flow passed once but
failed one of three repeats: Back returned to scroll zero instead of 1,251.
Application memory still held 1,251, the HOU-JAX focus target and sufficient
available height of 1,302. One passing trace also restored before `hashchange`,
but already had the board URL. Thus `hashchange` alone was an insufficient
traversal marker. A passing batch and the initial manual-mode experiment did
not establish stable behavior.

The separate systematic investigation controlled actual native push/back calls
and rendering boundaries. Before product edits, all three executions reproduced
1,251 → 0. Changing the native departure capture to its actual clamped position,
584, changed the browser's final result to 584 while application memory remained
1,251. That counterfactual failed the application assertion as expected. It
established the browser's separate persisted position as a competing input.

Reviewed worker source `a1e1d598`, integrated as `04daf0b6`, assigns restoration
ownership at the existing history connection before entry writes. Cleanup restores
the previous supported mode, respects a later auto selection, is idempotent and
keeps unsupported, read-only or throwing hosts usable. Shell memory, focus,
observers, navigation, private history payloads and persistence stay unchanged.
The old harness manual-mode assignment is removed, so its delayed-content and
input-cancellation checks exercise production behavior.

Controlled and unchanged original flows each pass three executions. Eight related
browser cases and 58 router/state contracts also pass. Independent task review
finds no Critical or Important issue and accepts local regression closure.
[Cause, exact tests and limitations](BACK_SCROLL_RESTORATION_2026_11_07.md).
All three authoritative green event attachments are in the aggregate
`controlled-original-green.json`; separate green-order filenames in the handoff
were inaccurate and are not evidence relied on here. Chromium verification is
separate from Safari, physical-phone or hosted acceptance. Cleanup affects the
active entry; it does not rewrite older entries.

## Final combined integration checks

At product/test source `04daf0b6`, Git tree
`c687207db14269eba3686ba74485f1fbd1245476` equals the independently reviewed
Back candidate, including all prior CSS, packaging and test corrections. Fresh
root checks pass:

- 923 component tests in 92 files.
- 89 Node import, token, loading, frame, router and state contracts.
- Typecheck, Brand/D-18 QA, cloud production build, bundle privacy and whitespace.
- Eleven browser flows in 1.4 minutes, with no skips or retries.
- All 1,759 raw design-file hashes against the recorded baseline.

The browser selection covers native and fallback fonts in both themes; all EPL
Play routes and native returns; GameDetails loading; external G assets;
controlled and complete game Back flows; private history failure; and restored
scope/account masking. These results supplement task runs without claiming that
every body or acceptance image was freshly reviewed. Existing BiasChart fixture
key warnings and the Vite chunk-size advisory remain. Exact-source Linux CI is
still a release gate. No thresholds, scanner rules or assertion floors changed.

## Remaining release gates

Complete the final whole-branch addendum and required PR/main CI. Release the
tolerant frontend first, then the API in a separate protected run. Record actual
public Research publication source and receipt, fresh hosted history, schedule,
privacy, preservation, compatibility, rollback and release-byte/API evidence.

FEPL's frame choice remains queued after the pending ROI-policy question. M-41
is separate PR #497, neither integrated nor applied. Frozen v62 and parked
avatars, awards, NBA and Signal remain unchanged. Browser control is disabled in
Work settings, so no new signed-in hosted or physical-phone acceptance is claimed.
