# Prism commissioner tools — native port, November 7, 2026

The subsequent [fidelity correction record](PRISM_COMMISSIONER_FIDELITY_FIXES_2026_11_07.md)
supersedes the initial footer placement, retained primary/error styling and
capture coverage described below. Source
`055e5840fa133e89b23a5bf2e155ce0da7e5e206` adds pinned tool actions, operational
reading proof and five-game coverage. The current manifest labels 205 refreshed
and 22 retained images separately; this remains unpublished local evidence.

This local port covers rollout areas 29–34. The approved reference is the read-only
owner-acceptance worktree at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`, especially
the six populated commissioner/status/referees/final-review/odds-connection/EPL
correction JSX/CSS pairs and their selected-system review. The branch starts from
freshly fetched `origin/main` and fast-forwards to the integration base
`e8332ca88eaff7f8760261745761fbb5ce3c94ce`.

The native tools now use floating destination/member cards, explicit access
decisions, graphical weekly status and settlement counts, current/draft referee
cards, team score tiles, quota tiles and original/recheck correction comparisons.
They reuse the selected card-face, glass, border, typography and theme tokens.
Reading and action labels are at least 16px; genuine source/status metadata uses
13px. Team marks keep their individual circles and decoded-image fallback.
Only the floating tools menu clears its List backplate. Global List and shared
header/dock/sports structure are unchanged.

The production views retain their existing controllers. The original final-score
editor receives an optional native TeamMark renderer through its existing
`LegacyTools.jsx` boundary; legacy selector styling remains in `resultReview.css`.
No boundary exemptions were added. The busy final dialog is keyboard focusable
so its long source review remains scrollable while its actions are disabled.
Schedule/referee lists initially show three rows with an explicit full-list
control. Their order, drafts and changed-row count continue to use the full read.

| Area | Local state and behavior evidence |
|---|---|
| 29 Members | Six tools; list, remove/restore review, self-protection, current-permission preflight, concurrent change, pending/lost reply across reload, current-access readback, admin-required refusal, retained player records |
| 30 Weekly operations | Enabled/configured status, quota pause, uncertain settlement with separate check-only readback, week inputs, schedule review/publish with real PGlite route, failed schedule read with no publish |
| 31 Referees | Current/cleared hosted precedence over file, unfamiliar current option, drafts, busy action, partial save retaining unsaved choices, disabled controls after read failure; native route remains `CommissionerTools.jsx` |
| 32 Final scores | Completed-game assertion, first confirmation, source correction, busy scroll/focus, conflict refresh then explicit version adoption and renewed assertion, unavailable read, exact receipt validation and retained Challenge warning |
| 33 Odds | Initial disabled fetch, zero-credit check, pending request with same ID, measured threshold/reserve, quota block, count-only fetch receipt, busy and rate-limit states; no market values rendered |
| 34 Corrections | Ready, missing, empty, unavailable, failed, denied, loading, refreshing and stale; separate source times, signed differences and preserved draft-order guidance; read-only refresh |

The [capture manifest](../design/prism-commissioner-native-2026-11-07/evidence.json)
records source/reference hashes, image hashes and per-capture metrics. Representative
tools have Dark and Light at 320/390, Dark at 768, Light at 1440 and forced system
colors at 320. Additional states have paired 390 captures, with lower-content
captures where the sheet/dialog scrolls. Every capture uses ThemeProvider's stored
preference and asserts its resolved theme plus computed canvas/ink. The same
capture checks assert no layout problems, 44px targets, 16px action labels and no
axe WCAG A/AA violations. Fixture accounts, supplied response states and local
PGlite are test evidence, not hosted observations.

Initial-port verification passed 17 focused browser tests, then both final-review tests after
the final dialog underlay adjustment; 13 component tests and 69 Node/PGlite checks.
The initial manifest recorded 196 captures, 140 theme/layout checks across 40 named states,
78 approved reference-image hashes and 20 native source/test/foundation hashes.
Representative images were inspected; this is not a claim that every image was
individually visually reviewed. Verification commands are recorded in the manifest. Required
checks include the four focused browser specs, commissioner/correction component
tests, token/native bridge and odds/correction boundary Node checks, referee and
reviewed-results PGlite checks, typecheck, Brand QA, cloud build and bundle privacy.
No API, SQL, migration, provider, collection allowance or save/grading rule changed.

Independent review and integration remain separate. Browser fixtures do not prove
physical-phone acceptance, real hosted administrator/source behavior, a live
provider request or every cross-account/slow-network interleaving. The held frame,
avatar/photo, NBA and award explorations remain excluded. This branch is local
and unpublished as requested: no push, PR, merge, deployment or migration apply.
