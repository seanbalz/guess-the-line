# Signal Focus implementation — November 5, 2026

Ben selected the right-hand treatment in the Home light and Research dark comparison screenshots: “I prefer the right.” After being told it was a separate preview and not applied to app code, he requested: “Sync it with both local and cloud GitHub.”

This branch carries that direction into the new app's shared tokens and Home styles. Signal blue `#2B3BFF` fills primary controls; Glaze `#E8EBFF` and Paper `#FFFFFF` form the light surfaces; Ink `#0B0D17` anchors dark mode. Dark foreground accents use `#A8AFFF` for contrast. Home's action card is blue with white text and an inverse white button. Other heroes retain readable neutral surfaces. Cards use softer 26/28px corners, Figtree headings and sentence case. Existing G geometry follows the theme foreground color; numeral typography remains tabular. The favicon, transparent installed-app PNGs, manifest and browser theme colors follow the new palette. Disabled controls retain their shared styling.

Clay `#FFE3D6` and Ember `#FF5A1F` are retained as brand tokens for future controlled use. This change does not assign them scoring, error, pending or live-state meanings. Existing semantic colors, labels, routes, data reads, writes, gates, scoring and account behavior are unchanged. No reference-brand logo or original reference image is added to app assets. Existing design comparisons remain available.

## Source and destination

- Verified host: `sean-macbook-neo.local`.
- Isolated clone in this task, separate from the stale Mac checkout and all other worktrees.
- Base: remote `main` at `7604cee25f4182d7c5262217c05f20d84b2994e3`.
- Branch: `codex/signal-focus-neo`.
- Remote: `https://github.com/seanbalz/guess-the-line.git`.
- GitHub metadata reports this repository **public**. After being told that the code would be visible to anyone and asked whether to sync there, Ben answered “Yes.” The Neo’s existing authenticated GitHub CLI reports ADMIN permission. The approved destination is the existing public repository; no repository permission change is included.
- No merge or production deployment is authorized or performed.

## Review and validation

The token contract retains 4.5:1 text and 3:1 control/focus thresholds in both themes, and adds explicit checks for Home's blue card and inverse CTA. Historical fixed lime ratios were replaced with those applicable contracts. JSON and CSS tokens must still match exactly. Semantic state colors remain distinct from the brand blue.

The companion isolated preview and preference record remain in the task's `branding-preview` directory. They contain fictional fixtures, not player data. Their five alternatives and original lime/Porcelain baseline are preserved. Applying the selected palette does not establish complete device acceptance or final acceptance of every screen and state.


## Local validation evidence

- Typecheck and Vite build passed on the implementation. The build retains the existing chunk-size advisory.
- All 889 Vitest component/engine tests passed (85 files).
- Final targeted Node rerun: 32 passed, zero failed/skipped, covering token/CSS parity, contrast, transparent icon geometry/alpha, browser theme colors, HTTP behavior and legal pages.
- Six local-fixture browser tests passed in 8.8 minutes: Home draft/submitted/sat-out states and Who’s in; every new-app screen/sheet/menu layout; game action-bar labels; every Research address. Coverage includes 320/390 widths, Light/Dark, wide fallback fonts and axe checks.
- An additional fixture-only capture passed; Home/Research Light/Dark screenshots were visually inspected. Files are ignored under `.local/signal-*.png`, outside published source.
- Brand/D-18 document QA and diff whitespace checks passed.

The broad Node run completed all 2,931 tests: 2,921 passed, 10 failed, zero skipped. Two failures observed the intermediate brand assets before their fixes; eight were sandbox-denied loopback sockets. All ten failing cases subsequently passed on the final source: seven within the 32-test targeted rerun and the remaining three in a dedicated loopback rerun (export, service worker CSP, font CSP; 3 passed, zero failed/skipped). No unexplained test failure remains. This records results across runs, not a second clean full-suite run. GitHub CI and physical-device acceptance are separate.


## CI contract follow-through

The initial CI head `5a1b7a1d` passed all three unit shards, Typecheck and test, Windows portability, dashboard, Persona and Brand QA. All four browser shards were reviewed before the corrective push: shard 2 passed; shards 1, 3 and 4 each had one failure.

- Shard 4: Source details expected the historical 16px medium-card radius. Signal Focus intentionally uses 26px. The browser contract now checks all four corners against the shared medium-card token and requires a positive radius, while retaining every closed-body/open-body/reclose assertion.
- Shard 1: the icon cache tag `signal-20261105` happened to contain `105`, a synthetic secret-odds sentinel scanned across every page attribute. It is now `signal-focus`; the secrecy assertions and API/UI gating checks are unchanged.
- Shard 3: the shell test expected literal lime/deep-green logo colors. It now derives the expected RGB from the canonical theme accent-ink, retaining both parent/SVG transparency, shadow, geometry, responsive and axe checks.

Final local follow-up: all 14 tests in the complete Trends and Everyone specs passed, plus the shell's full Light/Dark 320/390 accessibility/menu sweep (1 passed). The 25 token/brand/theme Node checks, JavaScript syntax, Brand QA and diff checks also passed. The corrective push triggers a fresh complete CI run; its result is reported at handoff rather than inferred from the previous head.
