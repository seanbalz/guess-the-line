# Confirmed Bets landing and saved history — November 7, 2026

The four composition differences listed in this historical handoff are now
closed by the [subsequent native closeout](PRISM_BETS_CLOSEOUT_2026_11_07.md).

Owner: Sean Balsiger. Status: local native implementation and fixture verification;
unpublished, not hosted or accepted on a physical phone.

This closes the missing Bets landing found during independent review of the
[first Bets slice](PRISM_BETS_NATIVE_2026_11_07.md). The exclusive branch is
`codex/confirmed-prism-bets-landing-2026-11-07`, created from freshly fetched
`origin/main` at `42a5ad9930a5712c6b357564701fbb5628b12b43` and fast-forwarded to
integration base `b5e1f269a2294a1b77b4d909534935ca5228b793`. Shared media-emission
fix `642a240c` is present as local dependency `8e973744`; it is not a new Bets
area change. No other checkout was switched, reset or stashed.

## Approval mapping

Authority remains the read-only owner-acceptance `design/style-directions-2026-11-04`
tree at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`. Its
`selected-system-review.json` retains the exact scope, statements and captures.

| Approved source | Native mapping and verified scope |
| --- | --- |
| `overviewCloseoutReview`, “Approved continue”, reviewed commit `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`; paired `overview-closeout-bets` captures and `app.js` Bets root | `BetsLanding` now starts with Your tracked bets/net units, Settled/Open counts and chart, then a tinted Tickets summary card and Recommended card. The former generic action and seven-row root is replaced. |
| `populated-bets-overview.jsx/css`, `betsOverviewPreview` | Reuse `trackedOverview`, `TrackedOverview`, `NetUnits` and `TrendLine`. Full analytics retain outcome/type/source/date filters, records, ROI, unit/cash display and drill-down. Actual owner-scoped reads replace fictional illustration amounts. |
| `populated-bets.jsx/css`, paired `overview-closeout-open-ticket` and `overview-closeout-settled-ticket` | Existing native `TrackedBetRow` remains expandable with a distinct panel for each leg, actual matchup circles, separate risk/return, unknown source/odds and player-reported results. New open and parlay captures supplement the first slice's settled receipt. |
| Paired `overview-closeout-entry-selection` / `overview-closeout-entry-terms`, `isolated-bet-editor.jsx` | Actual native editor/controller, current matchups, selected-matchup marks, odds/units/source controls and ordinary confirmation/retry flows. Selected matchup and correction terms are captured here; the first slice retains entry-terms evidence. |
| `populated-bets-changes.jsx/css`, `betsChangesPreview` approved correction/result direction | New native `BetChangeHistory` renders numbered saved revisions, reason/time, Before/After summary and expandable changed fields. It closes the old audit's omission of changed source, notes and quote/placement times. All server-permitted selections retain lock handling. Actual correction, save and history are exercised through cloud/PGlite. |

## Actual data and controller behavior

`useTicketSummary` still uses its existing shared account-scoped all-history
`social/read`, filtered to the owner and tracked origin. It now projects that
reply through the same `trackedOverview` used in full analytics; it never uses
foreign aggregates. Excluded tickets remain reachable in Tickets but do not
enter summary performance. Virtual Units and Guess points never contribute.

Loading draws shared static skeletons. Errors retain explicit retry. Empty or
incomplete return evidence shows a dash, with no invented sample chart or price.
With two complete settled tickets the summary reuses the pointer/keyboard chart,
visible plotted range and zero baseline. Negative totals use loss styling.
An actual saved/corrected/included/reported ticket invalidates the shared summary
cache before returning to the landing, so a recent landing does not show the
pre-save cached totals. Existing account abort/refusal/privacy behavior remains.

Active/Settled all-week routes, remembered tracked filters, Add, detailed
Overview, recommendation review/save/cancel and gap/Virtual/Everyone routes
retain their real controllers. No preview DOM adapters, fixture data, iframe,
no-op callbacks, new endpoint, SQL or collection path enters production source.
The 0.5U tracked quick minimum, exact Custom precision and ±0.1U taps remain;
Virtual's backend still requires half units.

## Comparison limits and remaining differences

These captures establish the native implementation above, not pixel identity of
every fictional viewer screen or completion of all approved Bets routes.

- The native header/dock and reachable league switch remain in place while the
  parent's single navigation question is pending. There is no new Menu row.
- The approved landing's static sample matchup and made-up history/record are
  not current account recommendations. Native Recommended opens real Research;
  the saved-gap and Virtual tools remain reachable in a separate group below
  the three approved landing blocks. A current recommendation teaser with a
  real selected matchup has not been added.
- The native chart retains its scale, accessible tooltip and 44px keyboard
  slider; the fictional landing's noninteractive illustrative sparkline lacks
  these. Its curve and values are not copied.
- Full Overview keeps the live tracker scope/filter/navigation controls above
  the reviewed analytic cards. The preview's fictional-history heading, sample
  footer and memory-only filter controls are not production UI.
- Native receipts remain expandable in place and history remains behind Ticket
  details / Details & history, following the existing live receipt disclosure.
  The fictional change viewer places the example history/actions outside its
  receipt. That full-page placement has not been imported.
- Initial matchup choice buttons retain canonical short labels; the selected
  actual matchup has separate marks. The preview's full-name text-choice
  arrangement has not been ported. Team identity is not inferred for manually
  entered players.
- The separate Guess scorecard is outside this sportsbook slice. Broader
  recommendation/gap-history/Virtual and older-record visual parity is not
  established by these landing/receipt checks.

## Verification and evidence

All browser accounts, tickets, odds and results are explicitly local fixtures.
They use the real cloud handler and PGlite migrations at isolated port **5218**;
external unmocked requests are rejected. No hosted account/provider is contacted.

- 17 existing `next-bets-live.spec.js` browser cases passed: scope/filter/cash,
  owner isolation, multiweek/history, exact Custom terms, source/manual entry,
  saved/reloaded tickets, lost-reply/same-request recovery, expired sign-in,
  Virtual placement/edit conflict guards, six-leg parlay expansion and spacing.
- 3 new `next-bets-landing.spec.js` cases passed: actual owner-only summary,
  all destinations and unchanged storage for read navigation; loading/retry/
  empty/unknown-return states and immediate post-save refresh; actual saved
  correction and full before/after history. Both themes at 320/390px pass axe
  WCAG A/AA checks with no horizontal overflow.
- 4 recommendation review/save/cancel flows passed in `recommended-bets.spec.js`,
  including two successive saves in each phone width without leaving the list.
- 67 focused Node/model/cloud/SQL/token/brand checks and 21 component checks
  passed. Typecheck, `python -X utf8 scripts/check-brand-docs.py`, cloud build,
  `node scripts/check-cloud-boundary.mjs --bundle-only` and diff whitespace
  checks passed. Build retains its existing large-chunk advisory.

Browser commands used a private copy of `playwright.cloud.config.js` with only
port 5218, worktree cwd/test/output paths changed. Standard reproduction uses
`npm run test:cloud-browser -- tests/cloud-browser/next-bets-landing.spec.js`
in an exclusive checkout with PGlite provisioned.

Focused Node command:
`node --test tests/tracked-bet-terms.test.mjs tests/social-bets.test.mjs tests/social-cloud.test.mjs tests/social-sql.test.mjs tests/social-line-lock.test.mjs tests/next-tokens.test.mjs tests/brand-mark.test.mjs`.
Component command:
`npx vitest run tests/next-bets-landing.test.jsx tests/next-bets-overview.test.jsx tests/next-bets-review.test.jsx tests/tracked-bet-grid.test.jsx`.

[Native phone captures and source/capture SHA-256 hashes](../design/prism-bets-landing-native-2026-11-07/evidence.json)
include landing (viewport and full scroll), full Overview's performance region,
open ticket, parlay receipt, selected entry, correction terms and saved history,
each in Dark and Light. Existing entry-terms/result/settled captures remain in
the first slice's evidence. Device emulation and isolated fixtures do not
establish hosted authorization, real-phone acceptance or deployment.

No push, PR, merge, deployment, migration or private-board synchronization is
part of this area handoff. Unpublished branches cannot pass the clean equal-to-
remote sync contract; publication and exact-source release belong to the parent.
