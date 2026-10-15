# Guess The Line — mobile layout and Bets recommendations

Owner: Sean Balsiger · Version 2 · October 15, 2026

Status: two open follow-ups requested by Sean; implementation and verification
are pending. Delivery owners are unassigned and no dates are committed.

## Report and evidence

Sean reported scrolling/formatting problems on some pages, specifically that the
footer menu sits halfway up the screen while scrolling Bets → Recommended. The
supplied **Photo 1.jpg** shows the Home / Play / Bets / Lines / League navigation
crossing recommendation content, with more card content below it. Sean also
requested a way to receive only spread recommendations or only total recommendations.

Evidence is the October 15 user report and attached screenshot in this task.
The current production source is identified below; the screenshot's device build,
browser/version, launch mode and triggering scroll sequence are not established.
This records the visible symptom, not an independently reproduced bug or a
confirmed CSS cause. Other affected pages remain to be identified.
The screenshot stays in the task; its player guesses and quote values are not
copied into this public repository.

The [October 15 audit](../docs/RETIREMENT_AUDIT_2026_10_15.md) verified fresh
production deployment metadata: Pages `ed3fb50b` maps to source
`b883c7742979d133720ed931c520821fdc4a13b5`. Production's index, entry bundle and
NextApp bundle matched the canonical immutable deployment. The
[D-48 release record](../docs/RELEASE_2026_10_15_RECOMMENDATIONS.md) separately
records the original deployment and API v24. These checks establish the current
production frontend identity; they do not reproduce the reported phone behavior.

The active Recommended screen is implemented by
`web/src/next/bets/Bets.jsx`, which embeds `web/src/VirtualUnits.jsx` with
`initialView="recommended"`. Its presentation and ranking live in
`web/src/recommendedBets.css`, `web/src/next/bets/bets.css` and
`shared/recommended-bets.mjs`; the shared navigation lives in
`web/src/next/shell/`. The earlier slot-stub finding came from stale source and
is superseded. The existing implementation ranks both markets together and
limits the initial list to three; it has no Spread/Total recommendation filter.

The [completion register](../docs/COMPLETION_REGISTER.md) already keeps Bets and
Recommended visual/phone acceptance open. Its shared visual criteria require
content to scroll above navigation with iPhone safe-area clearance.
[Issue #126](https://github.com/seanbalz/guess-the-lines-repo/issues/126) tracks
overlapping mobile formatting and acceptance work; this report adds a distinct
Recommended scrolling symptom and filter request. No external issue or private
Status Board update was performed by this document. Existing DASH-4 and DASH-12
tasks and stages 10, 43 and 79 in the
[redesign build plan](../docs/REDESIGN_BUILD_PLAN.md) are extended below; their
earlier requirements and recorded delivery evidence remain intact.

Pending D-51 refinements at `3985acb` in
[PR #140](https://github.com/seanbalz/guess-the-lines-repo/pull/140) are separate,
not deployed work. That source
adds compact cards, offer-based ranking and a guess/forecast comparison basis,
but neither the requested Spread/Total filter nor a navigation-position fix.
Coordinate shared-component edits with that branch; do not treat its card-height
checks as evidence that this scrolling report is fixed.

The current shell CSS already uses `position: fixed`, `bottom: 0` and safe-area
spacing (`web/src/next/shell/shell.css`). The existing shell test checks the tab
bar's bottom once at an 844px viewport without a preceding scroll in that check
(`tests/cloud-browser/next-shell.spec.js`). Extend it with actual scrolling and
viewport changes; neither finding establishes the cause of the pictured failure.

## Task register

Reviewed October 15, 2026. P1 means needed for the requested user experience.
Lane names are suggested routing from the build plan, not active assignments.

| ID | Priority | Task | State | Suggested lane / owner | Dependencies | Target |
|---|---|---|---|---|---|---|
| UX-NEXT-01 | P1 | Fix mobile navigation displacement and scrolling/formatting | Open — production source identified; phone reproduction pending | A + C / TBD | D-48 Recommended integration; DASH-12; stages 10 and 79; coordinate pending D-51 work | Not committed |
| BETS-NEXT-01 | P1 | Filter Recommended by All, Spreads or Totals | Open — requested; implementation pending | C / TBD | D-48 recommendation list; DASH-4; stage 43; existing eligibility/reveal gates; coordinate pending D-51 work | Not committed |

### UX-NEXT-01 — stable navigation while scrolling

- Reproduce on the reported Bets → Recommended flow with a long list. Record
  build, device, OS/browser, Safari versus Home Screen launch, and scroll steps.
  Inspect the actual scroll container, viewport sizing, safe-area spacing and
  fixed/sticky ancestors before choosing a fix.
- Keep the bottom navigation at the visible viewport's bottom, with the home
  indicator safe area respected. It must not float through the middle of cards,
  leave a displaced blank band, or trap taps during scrolling in either direction.
- Reserve sufficient space for the navigation and any active bet-card dock so
  the final card, source text and Add to card action can scroll fully into view.
  Focused controls must remain visible; opening/closing a sheet or the keyboard
  must restore usable navigation and scroll position.
- Check top, middle and end of long lists, short/empty states, tab changes,
  recommendation filter changes, rotation and browser toolbar expansion/collapse.
  Sweep Home, Play, Bets, Lines and League for the same shared-shell problem and
  for clipping, overlapping text, excess gaps and horizontal page overflow. Record
  each result; the screenshot alone establishes only the Bets symptom.
- Use the existing brand tokens, layer order and touch sizes. Verify light/dark,
  320px and 390px widths, larger text and keyboard focus. Include a real iPhone
  Safari/Home Screen check because desktop viewport emulation alone cannot close
  this issue.
- Exit: recorded before/after evidence on the affected build and device shows
  stable navigation and reachable content throughout the scroll sequence; a
  targeted browser regression checks navigation geometry and last-action
  reachability, and the cross-page sweep has recorded results. Local repair,
  deployment and real-device acceptance are separate states.

### BETS-NEXT-01 — recommendation market filter

- Add a visible, labelled **All / Spreads / Totals** control within Bets →
  Recommended. All preserves the mixed list by default; Spreads shows only spread
  recommendations and Totals shows only total recommendations. The chosen option
  is apparent without relying on color alone and is keyboard/screen-reader usable.
- Apply the choice to the complete eligible recommendation set before any display
  limit or pagination. Preserve the existing order within the chosen market and
  keep counts consistent with visible results; avoid filtering only a previously
  truncated mixed list.
- Keep the choice while opening a recommendation, adding to the card and returning
  within Bets. Filtering is a display preference: it must not delete or alter
  existing card selections, saved bets, guesses or scoring. Cross-device preference
  synchronization is not specified by this request.
- Preserve per-game/market reveal gates, eligibility, named-book terms and source
  timestamps. Selecting a market must never expose locked lines or bypass the
  existing eligibility checks. This filter is distinct from the scoring filters
  in SCORE-NEXT-05 and from legacy Best Bets contest work.
- When the selected market has no eligible recommendations, show an explicit
  market-specific empty state and an easy way to change the filter. Do not silently
  fall back to the other market.
- Exit: a mixed synthetic fixture verifies all three choices, an empty market,
  gated/missing data, result limits and preservation of card selections. Verify
  the chosen filter and final card remain reachable on mobile, including the
  UX-NEXT-01 scroll sequence. Record implementation and release evidence separately.

## Updates to existing tasks

| Existing task | Updated scope / acceptance |
|---|---|
| DASH-12; stage 10 Shell frame | UX-NEXT-01 adds vertical viewport anchoring, safe-area/dock spacing and long-list scrolling to existing navigation checks |
| DASH-4; stage 43 Bets board | BETS-NEXT-01 adds Recommended market filtering; UX-NEXT-01 adds the reported long-list regression |
| Stage 79 Final phone-first sweep | Include both follow-ups, real-device scrolling and a recorded result for every main tab; older horizontal-overflow checks do not close this new report |
| Completion register: Bets, Recommended and shared visual acceptance; issue #126 | Keep acceptance open and include the reported Recommended navigation displacement in the existing mobile sweep; the market filter is separately tracked by BETS-NEXT-01. This document does not update or close the external issue |
| SCORE-NEXT-09 | Reuse the shared-shell scroll checks on new scoring/Trends screens; the Bets filter remains separate from SCORE-NEXT-05 and does not block scoring/server work |

## Maintenance

Current production source is recorded above. Add the affected device's reproduction
result, owner and implementation/QA evidence as they become available, and refresh
the deployment identity before reproducing if production changes. Preserve prior
completed work as historical evidence; these follow-ups remain open until their
own exit criteria are met. No code fix, deployment or real-phone reproduction is
claimed here. The frozen v62 tracker is unchanged. The private Guess The Line
Status Board was not accessed or updated; this repository supplement links to the
completion register, redesign plan and retirement audit.
