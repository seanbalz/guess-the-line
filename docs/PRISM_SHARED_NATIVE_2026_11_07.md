# Selected Prism shared native foundation — November 7, 2026

Owner: Sean Balsiger. State: checked locally; unpublished task branch.

The selected review at `3ac2eb50513ba73447ef890e4a47863cde7bdd76` is the
recipe authority. This work starts from fresh main
`42a5ad9930a5712c6b357564701fbb5628b12b43`; PR #491 supplies reusable native
source, not a wholesale merge or release candidate.

Shared tokens and native components now use charcoal/Porcelain gradients,
ivory/deep-green text, the selected system stack with Inter fallback, 28px
floating cards, .65 neutral masked edge gloss and 18px blur with 140% saturation.
Primary actions are transparent with the full 3px green outline and selected
20px radius/shadows. Supporting muted/semantic colors retain tested contrast.

`.gx-card` and `.gx-nest-card` carry the floating material centrally. Custom area
cards can reuse `.gx-card`; `--gx-card-face`, `--gx-e1`, `--gx-glass-line`,
`--gx-card-filter`, `--gx-card-edge` and `--gx-card-gloss` define the contract.
Small tiles retain `--gx-glass-shadow`. Lucide geometry is retained with the
selected glossy shell icon treatment. Reduced transparency supplies opaque
surfaces; reduced motion and forced-color outlines remain.

The native shell uses the selected hybrid G without a circle. League controls
have individual 52px circles and full descriptive accessible names. Team marks
retain async decode, official-to-badge-to-letter fallback, aspect ratio and
reserved size inside separate circles. Three-letter fallbacks fit at 24px.
The asset provenance ledger is `web/src/next/ui/brand-assets/sources.json`.

The latest native-frame review captures retain the Community/FEPL pill in the
header, circles in a separate centered sport row and a full-width bottom bar.
The approved prototype Play/Home composition instead places circles in the
header and floats the dock. The parent identified this conflict for one pointed
owner question. Structural placement is held; the reachable league switcher,
route/access/dirty-draft guards and hidden NBA remain. No new Menu row is added.

Home files and all additive Home tokens are unchanged from main. This work does
not complete the separate Play/Bets/Research/League/account/sheet compositions,
or supply held avatar/award features. No fixture, iframe viewer or DOM adapter
is included in production. Native browser tests use fictional local PGlite only.

[Evidence and native captures](../design/prism-shared-native-2026-11-07/evidence.json)
record token/contrast/font/brand contracts (32), UI component contracts (58),
the shell/UI browser suite (53), and final material/fallback/access/focus checks
(13). Typecheck, Brand QA, production cloud build and bundle-only privacy scan
passed. The hosted boundary check was not run because this owned task checkout
has no `.env.cloud`; no hosted credentials were copied. The native Dark/Light
captures were inspected beside the selected Play/native-frame references:
materials and identity align; pending per-screen and positional differences are
explicitly retained above. This is not real-device or hosted acceptance.

No push, PR, merge, deployment, API/SQL, rules, source-data or provider change is
part of this local handoff. Integration and release require their own exact-source
checks. The frozen v62 tracker and other worktrees are untouched.

## Integration follow-up

The shared checkpoint and full rollout checklist are published in draft PR #495;
no merge or deployment is claimed. The initial full CI exposed two static EPL
tests that still read abbreviated button text after the approved logo-only
controls adopted full accessible names. Their assertions now check the exact
accessible choices and selected sport, retaining access denial and hidden NBA
coverage. The moneyline shell test uses the same full National Football League
button name. Full Vitest passed 85 files / 886 tests; both moneyline shell browser
flows passed, including dirty-draft guarding and account-remount privacy.
The separate Research card-radius expectation is tracked with that area port.

The full browser run also found the new G images had been inlined as SVG data
URLs. Their decorative vector numbers collided with the strict numeric
hidden-pick/line scan of image attributes. The two imports now request emitted
media files; the original artwork and hashes are unchanged, and the privacy
scanner was not relaxed. Both focused delayed-market and saved-pick privacy/
focus tests pass, as do 20 brand/token/import contracts. The build emits both
original SVG files. Play's keyboard focus race and Research chart target sizing
remain tracked separately until their regressions are resolved.
