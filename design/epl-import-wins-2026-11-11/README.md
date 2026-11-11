# Import wins (D-83) — stat-corrections card mockups

Owner: Sean Balsiger · November 11, 2026 · Local implementation, not deployed.

Sean answered **"Yes, import wins"** (D-83, Rule 1 of the
[precedence brief](../../docs/EPL_ORDER_PRECEDENCE_DECISION_2026-11-10.md)). These phone
captures show the new states of the existing **Menu › Commissioner tools › Premier League stat
corrections** card: a Tuesday Sleeper recheck changed MW11 totals after you confirmed the MW11
import, so the amended M-35 kept the MW12 order and recorded the order Tuesday's totals would
have set (`preserved_import`). The MW11 flag stays on this screen, so `gtl-api` compares MW12's
**live** order with those two recorded orders and the card says what happened since.

What the card says in each state:

| State | When | Card text | MW12 pick order |
| --- | --- | --- | --- |
| **kept** | MW12 still has the order the recheck kept | "Tuesday's totals would put Casey first. Because you confirmed an import, MW12 keeps Alex first." | "Current MW12 order" beside "Tuesday's totals" |
| **adopted** | A later import, normally a correction import, set the order Tuesday's totals give | "An import after Tuesday's recheck set the order Tuesday's totals give. MW12 now has Casey first. Nothing else is needed." It asks for nothing. | "Current MW12 order" only |
| **changed** | MW12's order is now neither | "MW12's order changed after Tuesday's recheck. It now has Jordan first. Tuesday's totals would put Casey first." | "Current MW12 order" beside "Tuesday's totals" |

- The first column is always "Current MW12 order". It never says the import set that order: if
  your import's opening waited for results (`pending_results`), `settle` opened MW12, not the
  import.
- In the kept and changed states, while MW12 has no picks: "To use Tuesday's totals, add a new
  Sleeper Matchups screenshot in Premier League weekly scores and record it as a correction
  while the MW12 draft is open, before its first pick or kickoff." That is when M-43 applies a
  correction import's order. Once a pick exists, the card shows the existing "MW12 has N
  recorded picks. Its stored picks and draft order are preserved." instead.
- With two lists, position *n* sits on the same line in both columns at every width.
- The original and recheck season totals and the source captures stay below, as before. The
  screen stays read-only: one button, "Refresh reviews".

These are rendered captures of the real component in the authenticated app (local PGlite
sign-in, the existing approved Prism commissioner design and tokens). The corrections replies
are fabricated in the brief's worked-week shape: **every name, score and time is synthetic**
(Alex, Casey, Jordan, Riley, Taylor, Morgan, Drew and Quinn are placeholders, not league
managers). No hosted data, real pick, import or Sleeper read was used.

## Captures

Each state, width and theme has the top of the sheet, the card centred on the full lists
(`-order`), and at 390 px the bottom of the card (`-bottom`). Viewport height 844 px. The kept
and changed `-bottom` captures are byte-identical: below the lists the two states show the same
sentence, totals and sources.

| Capture | SHA-256 |
| --- | --- |
| [corrections-import-kept-dark-320.png](corrections-import-kept-dark-320.png) | `8828487164ef448d0e7333f015da3d03fdd0d718a689d1180cb3881efdd27a9a` |
| [corrections-import-kept-dark-320-order.png](corrections-import-kept-dark-320-order.png) | `8ccd64d695a1a9f3c4a7a79d32f0cbb28180354335f02730469a68d70186207f` |
| [corrections-import-kept-light-320.png](corrections-import-kept-light-320.png) | `35872e38b88816af31019967737bb87314a83fc5dcdb1c7544284003dd561399` |
| [corrections-import-kept-light-320-order.png](corrections-import-kept-light-320-order.png) | `1a73461d66a68b620951bc8eeef4ce6de0a058aa3f6e186b1eb1e8e49caf39e2` |
| [corrections-import-kept-dark-390.png](corrections-import-kept-dark-390.png) | `80ec203be0d019f7155c1c567351c562f5b3067e6853dcb37927b3b464fdd6b7` |
| [corrections-import-kept-dark-390-order.png](corrections-import-kept-dark-390-order.png) | `c067d7e656b69fb668881a3de033d3fc103086a7098f9bfbc13d93ead67a62c8` |
| [corrections-import-kept-dark-390-bottom.png](corrections-import-kept-dark-390-bottom.png) | `5ddf28536fa5cbc541640bec3889c52e8c1fa66cf038059f7b75677af8315924` |
| [corrections-import-kept-light-390.png](corrections-import-kept-light-390.png) | `5ef78a487345f1fe7031c84a2075b8ce217649844436dace45abd257532442a7` |
| [corrections-import-kept-light-390-order.png](corrections-import-kept-light-390-order.png) | `6ab03f0728c5c7012777cb80429ccdb5156e0ea821003c0d11eb2f82de7e824e` |
| [corrections-import-kept-light-390-bottom.png](corrections-import-kept-light-390-bottom.png) | `d12372f9a73f134f905d4400485b5adc4a04c16396d0af0b273d6bafe9d029da` |
| [corrections-import-adopted-dark-320.png](corrections-import-adopted-dark-320.png) | `124feb9f6745a3e23cb37327f1bfd02a223282012b490a470087ecc29f518510` |
| [corrections-import-adopted-dark-320-order.png](corrections-import-adopted-dark-320-order.png) | `bb4f4a5fea03ef469cd601cff04f79d09b2d7757f45cd62fbc85e6f375bad3db` |
| [corrections-import-adopted-light-320.png](corrections-import-adopted-light-320.png) | `e829a7a8b6e715e93197a907cf95b8bf81da181916a5a11ffbb5e3942275caa5` |
| [corrections-import-adopted-light-320-order.png](corrections-import-adopted-light-320-order.png) | `f1128332f6fc39ae2087ad06d1564dd5b41ed1b4e5c8548a2ad311fd091fb6db` |
| [corrections-import-adopted-dark-390.png](corrections-import-adopted-dark-390.png) | `881415420656651ef5fa87b73c853555ba72fc9f1989ebe2b28198c286e1ceae` |
| [corrections-import-adopted-dark-390-order.png](corrections-import-adopted-dark-390-order.png) | `af3e13896c50c908eea58e503edfff131909e2e0b5ab4ae7c9b03011ab74f8b3` |
| [corrections-import-adopted-dark-390-bottom.png](corrections-import-adopted-dark-390-bottom.png) | `a62657489c74ed80df4d71cf1198c4c74820e676a3ecc63c0e9a4dfb966b274e` |
| [corrections-import-adopted-light-390.png](corrections-import-adopted-light-390.png) | `2b1ea04f9a96b9d23aaf31a52cf9bff4112e9da1cec4c1a8dcf4c499ae968067` |
| [corrections-import-adopted-light-390-order.png](corrections-import-adopted-light-390-order.png) | `b629e50671b1b2d0eed76a07f7b07fd8d3c904a671c4ff544e7a92817d5fc6a8` |
| [corrections-import-adopted-light-390-bottom.png](corrections-import-adopted-light-390-bottom.png) | `27b75c2a3adfe4f1da03fabc833639c5e9e6fe74ffdd05d55cffaebea6684d6d` |
| [corrections-import-changed-dark-320.png](corrections-import-changed-dark-320.png) | `5af84bdc73268eb0129c4aec5f4e2ab8f88ca5a8a4d0407af917fc593b7643a6` |
| [corrections-import-changed-dark-320-order.png](corrections-import-changed-dark-320-order.png) | `a31e11806e32c725e00bc14938b48c1e01190e971ed13b0cf8042b12fad4fb37` |
| [corrections-import-changed-light-320.png](corrections-import-changed-light-320.png) | `419372be309bf012295dec9e689fd9e66ca0d761d424a8ae5551fb199b7dcc61` |
| [corrections-import-changed-light-320-order.png](corrections-import-changed-light-320-order.png) | `ed3c02b2dd89594c2054c3e2be16300cdf22fba6666726e760b447daace62ad4` |
| [corrections-import-changed-dark-390.png](corrections-import-changed-dark-390.png) | `c99e83609687b176864ebffb0f57e65dadae23dc600c4e9984bbc710255d658c` |
| [corrections-import-changed-dark-390-order.png](corrections-import-changed-dark-390-order.png) | `7fb8e535648bb9b9198af13dff6cfa7f5a01252c110c24bb20783e2d03e00674` |
| [corrections-import-changed-dark-390-bottom.png](corrections-import-changed-dark-390-bottom.png) | `5ddf28536fa5cbc541640bec3889c52e8c1fa66cf038059f7b75677af8315924` |
| [corrections-import-changed-light-390.png](corrections-import-changed-light-390.png) | `7aff4a1200d7a38639aa0eab430e72c7c755ad8680a3d8647f9aa01942b85e80` |
| [corrections-import-changed-light-390-order.png](corrections-import-changed-light-390-order.png) | `4990acaa843a87ffc14abfbed9f2ee88a71aebcfccdca616f6c2e941da86a2ef` |
| [corrections-import-changed-light-390-bottom.png](corrections-import-changed-light-390-bottom.png) | `d12372f9a73f134f905d4400485b5adc4a04c16396d0af0b273d6bafe9d029da` |

## Method and checks

Captured by `tests/cloud-browser/epl-correction-reviews.spec.js` ("a confirmed import kept the
order: the card says kept, adopted or changed …", D-83) through the existing
`captureCommissioner` helper, from branch `claude/epl-import-wins-2026-11-11` on `main`
`8eaf7a77`. For every capture the helper asserts the selected theme tokens, no horizontal
overflow or clipping, zero axe WCAG 2.2 AA violations, touch targets of at least 44 px, the
16 px reading floor (13 px for metadata) and a stationary footer. For each state it also
captured 768 px Dark, 1440 px Light and 320 px forced colours, which passed the same checks and
are not committed here. The spec additionally asserts each state's text and lists, that "Kept
by your import" never appears, that the adopted card asks for nothing, and that each list
position is on the same line in both columns. [`evidence.json`](evidence.json) records the
source file hashes, every capture hash and the per-capture check counts (21 checked captures).

The reader's states are also tested on the actual migrations (PGlite,
`tests/epl-order-corrections-sql.test.mjs`): import, recheck (`preserved_import`), then a
correction import with Tuesday's order reads kept, then adopted, then changed after a further
correction; and an import whose opening waited for results reads kept with `settle`'s order.

Not established here: physical-phone acceptance, a signed-in hosted read, deployment, or any
M-33/M-35 apply. Sean's "Yes, import opens it" (D-83 addendum) completed the M-35 interval
prerequisite review; deploying the compatible `gtl-api` and Pages and "apply M-33" / "apply
M-35" remain Sean's words.
