# Selected Prism Bets native port — November 7, 2026

Owner: Sean Balsiger. State: locally checked, unpublished integration slice.

The owned task branch `codex/confirmed-prism-bets-2026-11-07` starts from fresh
main `42a5ad9930a5712c6b357564701fbb5628b12b43`. Shared foundation source
`1e104fdf1266660a84c98971ddae91d9c153be68` is present for integrated checks
(local cherry-pick `6178c4be`). Only the subsequent Bets commit is the area handoff.

The read-only review authority is `design/style-directions-2026-11-04` at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` in the owner-acceptance worktree.
`selected-system-review.json` and `SELECTED_DESIGN_HANDOFF.md` retain the scope.
The `overviewCloseoutReview` approval says “Approved continue” for fourteen
supplied views at `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`; its Bets, open-ticket,
settled-ticket and entry selection/terms Dark/Light captures map to this work.

| Approved reference | Native implementation |
| --- | --- |
| `populated-bets.jsx/css`, `overview-closeout-{open-ticket,settled-ticket}` | `TrackedBetRow`: shared floating card; roomy expandable preview; one centered selection panel per exact leg; separate matchup circles; risk/return and player-reported net remain distinct. |
| `populated-bets-overview.jsx/css`, `overview-closeout-bets` | Existing `TrackedOverview`/`NetUnits` native projection and chart; shared material, restrained supporting cards, functional outcome/book/type/date filters and cash display. |
| `bets-number-choices.jsx`, `bets-adjustments.mjs`, `overview-closeout-entry-terms` | Native manual ticket odds ±5 and units ±0.1 controls, unknown/disabled states, 0.5U minimum quick choice, existing Custom precision and writer limits retained. |
| `bets-book-choices.jsx` | Twelve manual source labels upfront, twenty-one more searchable labels, Unknown and Custom. No feed connection is implied. |
| `isolated-bet-editor.jsx`, `overview-closeout-entry-selection` | Actual editor, real matchup identities, change/search controls, required complete parlay legs and ordinary save/recovery controllers. |
| `populated-bets-changes.jsx/css` | Existing correction and result dialogs, exact reported full return, reason, revision/audit and inclusion controls retain their controllers and receive the selected form material. |

The approved 24px ticket gap replaces the measured older 32px gap. The native
controller CSS remains Bets-scoped in `web/src/prismBets.css`; prefixed component
styles stay in `web/src/next/bets/prism-bets.css`. This is CSS over real React
components, with no preview DOM adapter, fixture payload, iframe or no-op writer
in the production path. Sources/times stay unknown when not entered. Cash
conversion remains display or explicit user entry; saved stakes are units.

The separately approved Guess pick-focused scorecard integration is outside this
tracked-receipt slice; it does not await further owner design approval. Both
rejected full-pill proposals remain excluded.
Header/dock placement follows the shared native foundation's separate held scope.
This slice does not establish whole-redesign, hosted or actual-phone acceptance.

## Virtual Units compatibility dependency

Tracked stakes already accept positive four-decimal units in
`shared/social-bets.mjs` (`stake`); the existing manual editor range remains
0.0001–10000U. Custom 0.01U needs no schema change and has been saved/reloaded
through the real local cloud handler and PGlite writer.

Virtual Units remains half-unit only. A 0.1U tap or 0.01U Custom save there would
be refused; the UI therefore retains its honest existing half-unit control.
The concrete dependency is separate API/model and additive writer work:

- `cloud/bets.mjs`: `validatePlace` checks positive half units for the single
  placement path; `validTerms` checks the same for both new slip terms and the
  `expected` terms used by edits in `validateBetsPlace`.
- M-11 `supabase/migrations/20261028181000_gtl_bets_place.sql`:
  `public.gtl_place_bets` rejects `v_units<=0` or
  `v_units*2<>trunc(v_units*2)` (line 160).
- `cloud/virtual-units.mjs`: `validateBody` rejects nonpositive/non-half stakes
  for `/virtual-pick`. The legacy SQL writer
  `public.gtl_save_virtual_units_pick` in
  `20261009190000_gtl_virtual_units_save_isfinite.sql` repeats the check (line 59).
- Recommendation-only `public.gtl_save_recommended_virtual_pick` in
  `20261015143006_gtl_recommended_virtual_pick.sql` repeats it (line 55).
- `shared/social-bets.mjs` `terms` enforces half stakes for origin
  `virtual`; tracked stakes have separate rules.
- `web/src/next/bets/place.js` `stepUnits` uses 0.5U increments/clamp and
  `PlaceBets.jsx` exposes those limits; the legacy Virtual editor is also separate.

Future compatible changes must update every applicable writer and expected-term
validator together, preserve existing rows/audits/idempotency/kickoff/quote/reveal
guards, add SQL/API/browser regressions, and use a separately reviewed additive
migration with apply authorization and preservation evidence. This UI slice
changes no backend rule and applies no migration.

## Verification and release boundary

Local checks use fictional accounts/tickets on isolated port 5212, actual native
components, the real cloud handler and PGlite. The 17-test Bets browser suite
passed; final focused phone checks cover 320/390px, Dark/Light, axe, six complete
parlay legs, keyboard expand/collapse focus, 24px spacing, entry, exact 0.01U save,
reload and player-reported 0.03U full return yielding +0.02U net. Existing tests
also cover correction precision, cash, filters, lost-reply/same-request recovery,
expired sign-in and unchanged Virtual placement/edit conflict guards.
Four recommendation review/save/cancel flows also passed. The final exact-stake
flow verifies the selected source's system Highlight/HighlightText colors in
forced-colors mode before saving and reporting the result.

Other passing checks: 38 focused Node/model/cloud/SQL tests, 32 native component
tests, 20 token/brand contracts, typecheck, Brand QA, cloud production build and
bundle-only privacy scan. [Six native phone captures and their hashes](../design/prism-bets-native-2026-11-07/evidence.json)
are local evidence with fictional data explicitly identified. No hosted
account/provider read or write establishes acceptance here.

No push, PR, merge, release, migration or private-board synchronization is part
of this delegated handoff. `sync:check` cannot be green for an unpublished branch;
the parent owns reviewed publication and exact-source release verification.
