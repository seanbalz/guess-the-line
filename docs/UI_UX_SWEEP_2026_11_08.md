# App UX, formatting and scrolling sweep — November 8, 2026

Status: corrections implemented and task-reviewed locally; publication and release pending.
Production remains at the separately recorded ROI release until the protected
frontend release succeeds. This record must be updated with actual source and
release receipts before claiming deployment.

## Authority and scope

[D-79](DECISIONS.md) records Sean’s explicit choice of Home’s approved floating
glass **bottom navigation only** across the app. Section-specific top headers and
approved page layouts remain. The older FEPL frame question applies only to its
header; it no longer blocks a consistent bottom bar. The [implementation plan](superpowers/plans/2026-11-08-app-ui-ux-sweep.md)
covers the audit, corrections, regression review and protected release.

## Confirmed baseline findings

| Finding | Reproduction | Correction |
| --- | --- | --- |
| Mixed bottom navigation | At 390×844, Home is 358×72 at x16 with 12px bottom gap; native Research/FEPL/Bets can be 390×64 edge-to-edge | Apply Home’s shared recipe and align dock, toast, focus and content clearance |
| Hidden Guidance labels | Account → Guidance and sources: 19 closed details collapse to 2px while summaries remain 78px | Preserve each full summary and expandable content in the scrolling sheet |
| Singular ticket count | One active tracked ticket shows “1 bets” in its compact header | Use singular “1 bet” and plural counts consistently |

The baseline is freshly fetched main `0c83bb4b3c55409b234c5587a735a096d100a866`.
Fresh isolated browser sessions used an immutable local cloud-test build. No
existing approved capture or frozen v62 tracker was changed. New test captures,
fixture bridges and raw measurement logs remain ignored local audit artifacts.

## Fresh audit evidence

- Home, Play, guesses, Points, Score and League: 48 theme/viewport combinations
  at 320×568,390×844,768×1024,1440×1000; text geometry, document width, visible
  images and end content pass. Twenty-four phone combinations also pass 40 Tab
  presses each. Actual Spread/Total editor paths, draft-departure confirmation,
  offline notice and ten editor layout/scroll cases were exercised.
- Research/Bets: 200 deterministic measured states plus 20 actual clicked Overview
  states. Games/detail, historical cumulative and seasonal trends, Teams/detail,
  Fantasy rankings/player, tracked/open/settled tickets, gap, Virtual and Everyone
  views were inspected. Short/landscape tracked-bet editor scrolling reaches its
  footer; Teams Back restores the 1930px position and opener focus in both themes.
- Account/EPL:both themes at 320/390/768/1440 widths and a short phone. Profile,
  Settings, Appearance, Guidance, Invite, Export, auth/reset layouts, History,
  EPL Home/draft/moneyline/leaderboard, FEPL sections, recovery/unavailable states
  and six read-only commissioner panels were inspected. Sampled focus containment,
  focus return, unsaved-change guards and final controls pass; the Guidance defect
  above persisted after an independent settled recheck.
- Mobile WebKit emulation: 30 layout/end/width/image combinations across Home,
  guesses, Bets, Research root and Games, both themes at 320×568,390×844,844×390.
  Programmatic scrolling reaches the dynamic content maximum. This engine does
  not support Playwright’s mouse wheel, so this is not touch/wheel acceptance.
- Public production signed-out form:both themes at 320/390/768/1440, with no global
  sideways scroll or broken visible images. This does not establish signed-in
  production behavior for the new corrections.

Actual native controllers and the real local handler/PGlite were used for NFL and
account scenarios. Default worlds use HOSTED migrations. Richer domain cases may
use ALL migrations as defensive local coverage; they do not establish deployed
capabilities. Fictional accounts, quotes and results are explicitly test-only.
EPL normalized UI payloads are synthetic fixtures; EPL collectors, SQL and saved
results are not established by these visuals. Remote webfonts were blocked to
exercise fallback typography. Screenshot representatives were visually reviewed,
not only measured.

Same-document hash navigation and immediate theme changes caused early harness
races. Final measurements wait for the actual rendered screen/resolved theme and
settled scrolling. Transient frames were discarded. Fixed bars in full-page tall
screenshots remain at the original viewport bottom; that capture artifact is not
a mid-page navigation defect. Deliberately contained table scrolling and inline
source links are retained.

The supplemental Research review covered sixty further states at 320/390 in both
themes: 126 genuine historical situations with 12 visible cards, cumulative and
season curves/tables, team margins/game logs, opened source evidence, and an actual
two-player Fantasy comparison. Its narrow comparison region intentionally scrolls
horizontally with keyboard focus retained; the document remains within the
viewport. Historical Research comes from the committed nflverse subset through
the real provider. Team-game and prop-assessment payloads reuse existing explicitly
fictional fixtures; no live-data accuracy is asserted.

## Verification and release boundary

The shared-navigation implementation `4ce541942c12751862672d8cb89209d819fd452e`
passed independent task review with no Critical/Important findings. One Minor
finding records inherited validation warnings: React missing-key messages in
BiasChart, Vite large chunks and Playwright color-environment advisories. Output
is not described as pristine. The full local suite passed 2958 Node and 924 Vitest
tests with zero skips; 56 unique covering browser cases passed across the initial
49 successes and focused rerun of seven superseded bottom expectations. Guidance/copy implementation `3175462f6839e01fece3d4d43c8171b07983ff1e` passed its
independent task review with no Critical/Important findings and one Minor
validation-noise finding. Its two regressions first failed for the actual defects,
then passed; all 19 existing Account/Bets browser cases, 15 token contracts and 7
component cases pass with no skips, plus typecheck, Brand QA, build and whitespace.
The final whole-branch review, exact CI, merge and protected frontend evidence
remain pending. The combined candidate’s 645 tracked frontend/build inputs match the committed
source. Across 136 fresh Chromium route/theme/viewport combinations (17 routes ×
both themes × four sizes), layout, global width, final content and shared floating
geometry pass. The initial image probe counted offscreen lazy images; a focused
96-position top/middle/end check of actually visible images passes after loading.
Thirty WebKit layout/end cases also pass. Eight additional WebKit Guidance cases
cover both themes, 320/390×568 and normal/24px text: all summaries fit, keyboard
opening/closing works, final text remains within the scrollport and Close stays
visible. This is emulation, not physical touch acceptance.

Only frontend corrections are planned. API v52,
migration history, stored picks/results, collectors and worker configuration must
remain unchanged. Rollback is a protected frontend redeploy from the prior
verified compatible source `1c5a9da0deb479c15abf390a905acd47084cb338` with fresh
release gates. Never apply M-41 or other SQL as part of this sweep.

Physical iPhone Safari/Home Screen keyboard, browser-toolbar and safe-area
behavior, OAuth/email delivery, actual hosted memberships and every possible
live-data state are not certified by desktop automation. Missing optional local
providers are coverage limits, not evidence that production lacks data; supplemental rich Research, team-game-log and Fantasy comparison coverage uses
the existing repository fixtures described above. No live user
record or provider collection was changed.
