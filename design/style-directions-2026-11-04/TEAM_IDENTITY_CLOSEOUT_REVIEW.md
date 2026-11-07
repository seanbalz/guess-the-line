# Final team-identity inventory and compact labels

Sean's **“Good”** approves the twenty supplied league-wording captures in both
themes at `5fe706bc7f1ecea2d51ab2b5f40d486f7d050718`, answering “Do these wording
updates look good in both themes?” Earlier circle, G-exclusion and screen
approvals remain closed; this audit does not reopen them.

## One format choice

| Comparison | Dark | Light |
|---|---|---|
| A: logo + number; B: full name + number | [Dark](previews/team-label-format-dark-phone.png) | [Light](previews/team-label-format-light-phone.png) |

**A — recommended:** show a small circled team logo beside a compact number,
such as the existing fictional Denver −3.5 guess. Use full team names in longer
explanations. **B:** use the full team name beside the number as well. Both
remove the visible team abbreviation without changing its underlying code or
value. Neither option is applied to the existing records yet; owner choice is
pending. League-name versus logo navigation decisions are already approved.

The values −3.5 and −4 are reused unchanged from the existing fictional
History rule-math example, not real saved picks, bookmaker lines, current
prices or scoring references. The comparison uses the selected theme/card/
circle recipes and existing unchanged Denver artwork. No new asset or action.

## Circle repair from the audit

| Corrected existing view | Dark | Light |
|---|---|---|
| Home → game detail | [Dark](previews/final-home-game-circles-dark-phone.png) | [Light](previews/final-home-game-circles-light-phone.png) |

This legacy prototype view had two bare images outside the recognized tile
classes. The shared circle adapter now wraps only such unwrapped prototype
matchup marks in independent 64px circles, using the already selected glass
treatment. Original artwork, names, values and buttons remain. Native React
marks and the original G are untouched. This repairs fidelity to the approved
circle rule; it does not propose a new style.

## Inventory evidence

All 268 registered views were read back in both themes at 390px: 536 checks
and 1,492 team-image decodes. After the repair, every matching audited team
image had a recognized wrapper. No page errors, provider/auth reads, non-GET
requests, resource failures or OS dialogs were observed. The repair separately
passed eight layouts at 320/390/768/1440 widths, two Back/reopen flows, separate
surface/shadow checks and duplicate-wrapper checks. The comparison passed
eight layouts across the same widths/themes. All four captures inspected.

The visible team-code inventory found 33 distinct text variants in 45 text/
style combinations, repeated 454 times across states/themes. These are nine
team identifiers in fictional History, Bets and shared sheets, not hundreds
of separate design gaps. Examples include DEN −3.5, Example comparison DEN −4,
SEA @ DEN and an explanatory final-score sentence. Repeated states account for
the totals. MIN in the timer, NEW in a proposal label and NO in review notices
are unrelated words and must not be replaced as teams.

Implementation should use the existing typed team/game context, preserve
fallback and accessible names, and retain codes in data/route identifiers,
source literals and entered values. Do not globally rewrite ambiguous tokens.
[Consolidated selected-design handoff](SELECTED_DESIGN_HANDOFF.md) records the
approved recipes, this remaining choice and the production boundary.

This is mockup work only. No stored record, native production source, bundle
entry, scoring/provider rule, merge, deployment or migration changed. NBA
stays parked; new avatars/photos/awards remain held. Parked Signal files are
untouched/unpublished. No whole-project completion claim.
