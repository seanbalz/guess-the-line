# Shared identity, Menu and scope evidence — November 7, 2026

Status: locally checked; independent review and integration pending. Branch
`codex/prism-shell-identity-20261107` was created from freshly fetched
`origin/main` at `7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9`, then fast-forwarded
to the shared parent checkpoint `726e8526a598a0d2110ff56acd272206cac6dd2d`.
No push, PR, merge, deployment, API/SQL or migration is part of this handoff.

The exact approved reference checkout is unchanged at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. The selected-system review,
selected league marks/team circles/wording, populated Games, Account and
National Football League actions were reconciled against native source.
[The manifest](../design/prism-identity-scope-native-2026-11-07/evidence.json)
records exact reference/source/capture hashes. These are actual mounted native
controllers over fictional local PGlite data; no hosted account or provider is read.

## Source reconciliation

- Shared tokens, card/button/dialog materials, selected typography and functional
  icons remain the existing reviewed native foundation. Sit-out operational prose
  no longer inherits a 13px metadata override: it uses 16px/1.5; actual metadata
  remains 13px. Native inputs/actions retain the existing size/target contract.
- Every National Football League team mark uses the registered official image,
  original-badge fallback and bounded letter fallback inside its own glass circle.
  All 32 official assets and their provenance hashes pass the existing contracts.
  Native slow decode, no layout shift, official-to-badge fallback, individual
  circles in both themes and narrow three-letter fallback tests pass. Premier
  League Crest/context wrappers retain the independently reviewed EPL port.
  Native G artwork remains outside this circle rule; league marks retain selected
  artwork, 52px circles, contain fit, full accessible names and hidden NBA.
- The approved populated Games source labels scoring bars with full team names.
  Native bars now do so, with the reference's bounded 78px label column and wrapping;
  values retain 16px and labels 13px. Game-action accessible names now speak the
  full team names while handlers receive their original game and team IDs.
- App invitation prose, scoring guidance, Research season/condition explanations
  and the Premier League matchweek accessible name use full league names.
  App-authored trend titles/short explanations expand at their rendered boundary,
  including chart control names. Expansion is explicitly opt-in: registered built-in legacy titles and computed
  Research copy only; custom/saved/source-reported titles keep literal display.
  Original title values, selection fingerprints,
  predicates, IDs, API objects and option values are preserved. FEPL stays FEPL.
  Verbatim source/license attribution remains intact, including the source caveat
  beginning “NFL data belongs…” and publisher identifiers such as NFL.com/nflverse.
  Commissioner explanatory labels belong to the separate active commissioner task.
- Existing Account Menu composition supersedes the older actions-row styling.
  All admin, reminder availability, sign-out, destinations and focus controllers
  remain native; this work only adds evidence for their four variants.

## Scenario reconciliation

| Scenario | Actual local evidence |
|---|---|
| menu | Paired native Dark/Light at 390/320, forced colors and lower-body captures; reminder row present; no commissioner rows for Luke |
| menu-admin | Same native captures with Sean; Community members and Commissioner tools present |
| menu-no-reminders | Same native captures with a genuinely unconfigured push service; reminder row absent |
| menu-busy | Actual pending `supabase.auth.signOut({scope: 'local'})` request, held at `/auth/v1/logout?scope=local`; paired/narrow/forced captures, aria-disabled button and no duplicate request; release reaches sign-in |
| saved-scope | Open actual saved-pick controller, refresh through authenticated local `/personal`; explicit test-only changed-week response makes captured args mismatch; refusal replaces details/community values and safe Back closes it |
| distinct forfeit account-changed branch | Actual cross-tab SIGNED_OUT broadcast purges the open forfeit before another account mounts; no sit-out write occurs. The defensive branch is separately proved by controlled component rendering, **not** called a native capture |
| saved account-change | Same actual account transition purges the saved-pick sheet; another account mounts without the old sheet. Separate controlled mismatch rendering proves refusal without community values |

The five previously unverified core scenarios now have native pairs: **38 paired,
zero unverified, five held** of the 43 core scenarios. The four navigation
positions and finer Virtual precision remain held under their existing owner/
API-SQL dependencies. This does not claim all 106 reference images or every
viewport of every prior state. The distinct account-changed dialog branch is
unreachable as a stable native state through the safe actual account transition;
no test hook, product mock or fabricated capture was installed.

The 16px dialog change has fresh loading, ready, busy, unconfirmed, uncertain-close
warning and confirmed captures in both themes at 390/320 plus forced colors.
Native Escape, safe-action focus return, busy dismissal/write guard and recovery
are exercised. Every capture asserts the real stored preference, resolved theme,
canvas token and rendered ink. Menu/saved/dialog captures check axe, 44px targets,
primary 16px labels/prose, overflow and lower scroll reachability. Keyboard tests
use the native Sheet trap and actual dialog actions; native modal browser-chrome
Tab cycling is not represented as a custom Sheet focus trap.

## Area 01/02 limits and verification

The shared frame's global header/sports-row/dock positions remain held. All
currently ported identity contexts use their existing native components and the
selected recipe; individual source differences above are corrected. Area 01
cannot be called a completely released shell while positional examples remain
held. Area 02's independent review and the separately owned Commissioner wording
integration remain pending. Neither checkbox is promoted to whole-app completion
by this task; the parent can close their local scope after combined source review.
New profile avatars/photos, NBA, award/celebration exploration, physical-phone
acceptance, hosted acceptance and release are outside these local checks.

Final product-source verification:

- `npm run typecheck` — passed.
- `npx vitest run` — 91 files / 919 tests passed. Existing BiasChart key warnings remain unrelated.
- `node --test tests/next-app-view.test.mjs tests/next-tokens.test.mjs tests/brand-mark.test.mjs tests/team-marks.test.mjs tests/theme-tokens.test.mjs` — 41 passed, no skips.
- `npx playwright test --config playwright.identity-prism.config.js --grep 'native menu|saved scope refuses|external account|approved Games labels|sit-out operational prose|axe in dark and light at 390 and 320|DP-27:|D-46:|Prism:|three-letter fallbacks|game action bar opens'` — 15 passed in 1.7 minutes, no skips; result recorded in manifest.
- After the final opt-in wording boundary, 97 focused component tests and the full 919-test run pass again; `npx playwright test --config playwright.identity-prism.config.js --grep 'all public-source row curves|opened non-shortlist detail'` passes both native public-row/season/table selection and period/account isolation cases, no skips.
- `python -X utf8 scripts/check-brand-docs.py`, test-configured `npm run build:cloud`, `npm run check:cloud -- --bundle-only`, and whitespace checks — passed. The build retains its existing chunk-size warning; hosted probes were not run.

The native set contains 114 captures: 50 Menu/saved-scope views, four Games views
and 60 dialog views. This replaces no older capture manifest. Matched materials,
identity, hierarchy and operational states were inspected beside approved
references; differing local names/week/data and omission of the prototype-only
fictional-data disclaimer are intentional. No exact pixel equality is claimed.
