# Import wins (D-83) — stat-corrections card mockups

Owner: Sean Balsiger · November 11, 2026 · Local implementation, not deployed.

Sean answered **"Yes, import wins"** (D-83, Rule 1 of the
[precedence brief](../../docs/EPL_ORDER_PRECEDENCE_DECISION_2026-11-10.md)). These phone
captures show the new state of the existing **Menu › Commissioner tools › Premier League stat
corrections** card: a Tuesday Sleeper recheck changed MW11 totals after you confirmed the MW11
import, so the amended M-35 kept your MW12 order and recorded the order Tuesday's totals would
have set (`preserved_import`).

What the card says in this state:

- "Tuesday's totals would put Casey first. Because you confirmed an import, MW12 keeps Alex
  first."
- **MW12 pick order**: two numbered lists side by side, "Kept by your import" and "Tuesday's
  totals". Position *n* sits on the same line in both columns at every width.
- While MW12 has no picks: "To use Tuesday's totals, add a new Sleeper Matchups screenshot in
  Premier League weekly scores and record it as a correction before the first MW12 pick." Once
  a pick exists, the card shows the existing "MW12 has N recorded picks. Its stored picks and
  draft order are preserved." instead.
- The original and recheck season totals and the source captures stay below, as before. The
  screen stays read-only: one button, "Refresh reviews".

These are rendered captures of the real component in the authenticated app (local PGlite
sign-in, the existing approved Prism commissioner design and tokens). The corrections reply is
fabricated in the brief's worked-week shape: **every name, score and time is synthetic** (Alex,
Casey, Jordan, Riley, Taylor, Morgan, Drew and Quinn are placeholders, not league managers). No
hosted data, real pick, import or Sleeper read was used.

## Captures

Each width and theme has the top of the sheet, the card centred on the two full lists
(`-order`), and at 390 px the bottom of the card (`-bottom`). Viewport height 844 px.

| Capture | SHA-256 |
| --- | --- |
| [corrections-import-kept-dark-320.png](corrections-import-kept-dark-320.png) | `4ed18b1810773802467a1208808817b7b07710bb280c5398d7c9b3a38b5751f8` |
| [corrections-import-kept-dark-320-order.png](corrections-import-kept-dark-320-order.png) | `53ddfe9fcc82c8f905754924d578f1198bb37da0903e63d8467c81f4f5c72aef` |
| [corrections-import-kept-light-320.png](corrections-import-kept-light-320.png) | `6409959ae1c865abcab6f8d0fa3f8a382092a520a5ceb56806bb96fe90230bd7` |
| [corrections-import-kept-light-320-order.png](corrections-import-kept-light-320-order.png) | `e1d0476c81063dc4e1ff82e467027a8822ef9fa2ec26060af6fc11563f77eff1` |
| [corrections-import-kept-dark-390.png](corrections-import-kept-dark-390.png) | `7da3255c418be24f525c4cd1691fadd80c6f8fe790decf7058d75a586eaec085` |
| [corrections-import-kept-dark-390-order.png](corrections-import-kept-dark-390-order.png) | `c99b3e38b0f6cafce023da23027c94591ac64e61bf2ab5ca4af3f83fc38aa3e5` |
| [corrections-import-kept-dark-390-bottom.png](corrections-import-kept-dark-390-bottom.png) | `4d483e4461db9051f5eb28ffff663328511340c7cde56d2af9beaff230e18bcc` |
| [corrections-import-kept-light-390.png](corrections-import-kept-light-390.png) | `1330ee1a6f00fae4cf334ddaf2f7aa64c3fae84f62152855bdbbd7473f10b9da` |
| [corrections-import-kept-light-390-order.png](corrections-import-kept-light-390-order.png) | `c5175ed32525bce6e375f10cab255ba4167b8ae8181de4797879cc7401dcbb73` |
| [corrections-import-kept-light-390-bottom.png](corrections-import-kept-light-390-bottom.png) | `83e70d81c0b57945a593527a3fe5ab9ab881cdc20770bb2571f743d100aab978` |

## Method and checks

Captured by `tests/cloud-browser/epl-correction-reviews.spec.js` ("a confirmed import keeps
the order …", D-83) through the existing `captureCommissioner` helper, from branch
`claude/epl-import-wins-2026-11-11` on `main` `8eaf7a77`. For every capture the helper asserts
the selected theme tokens, no horizontal overflow or clipping, zero axe WCAG 2.2 AA violations,
touch targets of at least 44 px, the 16 px reading floor (13 px for metadata) and a stationary
footer. It also captured 768 px Dark, 1440 px Light and 320 px forced colours, which passed
the same checks and are not committed here. The spec additionally asserts that each list
position is on the same line in both columns. [`evidence.json`](evidence.json) records the
source file hashes, every capture hash and the per-capture check counts.

Not established here: physical-phone acceptance, a signed-in hosted read, deployment, or any
M-33/M-35 apply. Deploying the compatible `gtl-api` and Pages, the interval prerequisite review
and "apply M-33" / "apply M-35" remain Sean's words.
