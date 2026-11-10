# EPL compact label fitting — November 7, 2026

Owner: Sean Balsiger. Status: checked locally; pending independent review and
combined CI. Base: `2b7c009a8c846b818081889cd9c2ab74516f92c5`.

Linux Chromium CI [run 42451818573, shard 1](https://github.com/seanbalz/guess-the-line/actions/runs/42451818573/job/128642465412)
failed the existing actual EPL Home/Play test at `next-expanded-frame.spec.js:198`:
`button "Leaderboard": text leaves its box`. The owning EPL recipe gave all
three Play tabs equal grid tracks, while the complete Leaderboard label stays
on one line at the required 16px size. At 320px, each track was 88.656px wide.
The Windows native label measures 91.516px, with about 1.43px of overflow on
each side, within the existing helper's 1.5px tolerance. Representative wider
Arial/sans fallback metrics measure 96.922px, overflowing by 4.14px per side.
Offline browser fixtures abort external webfonts, making fallback fitting
necessary. The downloaded Linux trace confirms the platform and reported
failure; no exact installed Linux font inventory or fresh Linux execution is
claimed.

The existing three-column presentation now gives Leaderboard an intrinsic
minimum through `minmax(max-content,1fr)`. At 320px the fallback label receives
106.922px, including 5px clear space at each side; the other two labels wrap at
spaces. At 390px all three tracks remain equal at 112px, and at 768/1440px they
remain equal at 155.328px. The existing padding, glass, border, selected state,
full labels, 16px type and 44px minimum targets are retained. This is a fitting
adjustment to the approved EPL moneyline/draft direction (`eplMoneylinePreview`
and `eplDraftPreview` in review `3ac2eb50513ba73447ef890e4a47863cde7bdd76`).

`epl-compact-labels.spec.js` checks the actual signed-in production EPL routes
using disposable local data. Native and representative wider fallback fonts are
each exercised in saved Dark and Light preferences at 320/390/768/1440px. All
three choices are keyboard activated, with visible focus before navigation,
pressed state, readable full labels, control/text geometry, whole-page layout,
normal contrast and forced-color checks. Geometry JSON and screenshots go only
to ignored Playwright output. Existing helper assertions and tolerances are
unchanged. No capture opt-in was enabled.

Verification:

- Red: replacing only the fixed grid declaration with the original equal
  tracks fails the new fallback case at 320px, `Leaderboard left inset` =
  `-4.125px` (exit 1). Restoring the fix passes.
- `npx playwright test --config .local/epl-label.config.mjs tests/cloud-browser/epl-compact-labels.spec.js tests/cloud-browser/next-expanded-frame.spec.js --grep 'compact widths|actual EPL Home/Play'`:
  **5/5 passed**, 40.6 seconds, including the original CI-failing test at line
  181. The local config changes only the server port to 5306 and ignored output
  location. Normal repository invocation uses `playwright.cloud.config.js`.
- `node --test tests/next-tokens.test.mjs`: **15/15 passed** (Brand QA).
- `npx vitest run tests/epl-app.test.jsx tests/epl-home-moneyline.test.jsx tests/epl-guess.test.jsx`:
  **45/45 passed**.
- SHA-256 verification against the existing expanded evidence manifest:
  **128 PNGs, 30 receipts and 80 historical files match**, with no overwrites.

Only the EPL Play tab grid matches the changed selector. Home, NFL, FEPL native
Research, modal/page layering, routes, APIs, storage, data, scoring and migration
files are untouched. No label clipping, ellipsis, scaling, smaller font, splitword
rule or relaxed assertion was introduced. No new paid service or dependency was
used. The page screenshots were inspected in both themes at 320px. Exact-head
hosted CI, independent review and physical-device acceptance remain separate.

Source file SHA-256 values (the older capture manifests retain their original
source provenance):

- `web/src/next/epl/prism-epl.css`: `5478762e69c917238f92a980b9b08caeb85201e05cf09c2abe40e562daa7bd38`.
- `tests/cloud-browser/epl-compact-labels.spec.js`: `d09efa7571436571d3ee6ac0dbb135501011fe4f3496816d972baf594cec2f89`.
