# Home spacing review — November 7, 2026

Owner: Sean Balsiger. Status: **proposed mockups; not approved or deployed**.

Sean requested better formatting and spacing across the page after the approved
Home deployment. This review covers the NFL Home landing, retaining its selected
glass finish, colors, typography, content order, figures and controls. It does not
extend the Home redesign to other pages. The Spread / Total selector and each
team's individual circular background remain.

## Proposed result

| Dark | Light |
| --- | --- |
| [Top viewport](proposed-dark-top.png) | [Top viewport](proposed-light-top.png) |
| [Bottom viewport](proposed-dark-bottom.png) | [Bottom viewport](proposed-light-bottom.png) |
| [Whole-page overview](proposed-dark-overview.png) | [Whole-page overview](proposed-light-overview.png) |
| [Bottom with simulated phone insets](proposed-dark-safe-area-bottom.png) | [Bottom with simulated phone insets](proposed-light-safe-area-bottom.png) |

![Proposed Dark Home spacing](proposed-dark-overview.png)

![Proposed Light Home spacing](proposed-light-overview.png)

The top/bottom captures use a 390 × 844 CSS-pixel browser viewport. The overviews
expand that viewport to the document height, placing the fixed navigation at the
bottom of the overview; they are not a physical phone viewport or proof of iPhone
acceptance. The safe-area images simulate 47px top / 34px bottom insets in CSS.

Compare the current source: [Dark top](before-dark-top.png),
[Dark overview](before-dark-overview.png), [Light top](before-light-top.png),
[Light overview](before-light-overview.png). Both variants use the same local
fictional fixture, not a signed-in production account.

## Recommendation

Use balanced spacing: 16px page gutters and section gaps, 12–16px card padding,
and a shared alignment grid. Move the progress ring alongside the action text;
put stat icons next to their values; align shortcut icons with their headings;
pair matchup logos with the names and time. Tighten the week header and activity
rhythm. Keep all text, charts and 44px minimum touch targets.

At 390px, the same fixture's document height changes from **1,561px to 1,279px**,
a **282px / 18.1% reduction**. The League and Research graphics now fit above the
floating navigation on the initial 844px viewport. The last activity row remains
reachable with clearance above that navigation when scrolled to the end.

| Section | Current height | Proposed height |
| --- | ---: | ---: |
| Primary action | 214px | 194px |
| Your season | 226px | 200px |
| League / Research shortcuts | 228px | 174px |
| This week | 315px | 211px |
| Around the league | 164px | 150px |

Reducing only the outer gaps would leave the oversized card interiors intact.
A dense alternative with smaller graphics would save more space but weaken the
visual emphasis Sean requested. The balanced proposal keeps the original 80px
chart height and reading text sizes while addressing stacked spacing throughout
Home. SVG rank labels are enlarged so their rendered size stays at least 12px,
including at 320px. The existing progress-pop animation targets the ring after
its wrapper becomes layout-transparent; reduced motion remains respected.

## Evidence and boundaries

The browser renders unchanged app source from main
`42a5ad9930a5712c6b357564701fbb5628b12b43` (the deployed Home source plus its
release record). [preview.css](preview.css) is injected into the browser only;
the app does not import it. No app, API, database, migration, provider or build
configuration file is changed. No release has been dispatched for this review.

The fixture uses the repository's real cloud handler and all local migrations on
PGlite, with `createCommunityWorld` and `seedFinishedWeek`. Accounts, rank, points,
games and kickoff labels are fictional test data. The mini Research chart keeps
the existing attributed public historical scoring series. All requests to hosted
accounts and live data providers are blocked; only the loopback app, loopback
fixture server and fake Supabase request interception are used. Webfonts are
blocked, so the app's system font fallback is shown here.

Checked using Playwright CLI / Chrome, both themes:

- 30 layout cases: 320, 359, 360, 390, 430, 768 and 1440px widths with the native
  fallback and wider Verdana; plus two 390px simulated-inset cases. No horizontal
  overflow, clipped text, overlapping content controls or targets below 44px.
- 24 sequential keyboard-focus observations with simulated insets; every checked
  Home content control cleared the floating bar.
- Axe WCAG 2 A/AA, 2.1 A/AA and 2.2 AA: zero violations in either theme. Automated
  color-contrast evaluation remained incomplete on translucent backgrounds; this
  is not a claim of full accessibility conformance.
- Existing canonical token/brand suite: 15/15 passed. The preview adds no colors
  or font tokens and uses the existing Home finish and spacing tokens.

The wider-font pass caught a 360px shortcut-label fit problem; a 4px column gap
resolved it before final capture. The simulated-inset check uses the same
scroll-padding selector specificity as the existing Home stylesheet. It does not
change that production rule or claim a physical-device test.

[evidence.json](evidence.json) records dimensions, results and file hashes.
Approval of these exact visuals is still required under Sean's standing
mockup-first instruction. After approval, port only these Home layout overrides,
run the relevant source/browser checks, and use the protected manual release
workflow with fresh exact-source evidence.
