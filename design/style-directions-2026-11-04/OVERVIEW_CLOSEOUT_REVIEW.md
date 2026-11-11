# Overview and ticket screens — phone review

Fourteen current captures, seven views in both themes. **Approved by Sean in both themes** (“Approved continue”), reviewed at
`6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`.
The remaining NFL action/shared-navigation set is approved at
`9c2aa961f14f6a68cc51858e777c4e0796a9b5e5`; this review preserves that approval.

The audit found older explicit whole-view flags for Home, Play, Bets and the
original ticket/entry screens. Later component and specialized-state approvals
did not close those flags. These captures show the existing current viewer,
with the selected compact action card, separate team-logo tiles, charts,
outlined glass buttons and 16px ticket-action spacing. No new feature proposal.

| View | Dark | Light |
|---|---|---|
| Home overview | [Dark](previews/overview-closeout-home-dark-phone.png) | [Light](previews/overview-closeout-home-light-phone.png) |
| Play overview | [Dark](previews/overview-closeout-play-dark-phone.png) | [Light](previews/overview-closeout-play-light-phone.png) |
| Bets overview | [Dark](previews/overview-closeout-bets-dark-phone.png) | [Light](previews/overview-closeout-bets-light-phone.png) |
| Settled tracked ticket | [Dark](previews/overview-closeout-settled-ticket-dark-phone.png) | [Light](previews/overview-closeout-settled-ticket-light-phone.png) |
| Open tracked ticket | [Dark](previews/overview-closeout-open-ticket-dark-phone.png) | [Light](previews/overview-closeout-open-ticket-light-phone.png) |
| Entry: selection | [Dark](previews/overview-closeout-entry-selection-dark-phone.png) | [Light](previews/overview-closeout-entry-selection-light-phone.png) |
| Entry: odds, units and source | [Dark](previews/overview-closeout-entry-terms-dark-phone.png) | [Light](previews/overview-closeout-entry-terms-light-phone.png) |

Entry selection and terms are two scroll positions of the same form. The
smallest quick unit choice is 0.5U; Custom supports smaller positive values,
including 0.01U; each unit +/− tap changes 0.1U. Source choices are manual
labels, not connected sportsbook integrations. Unknown personal terms stay
unknown. Nothing was submitted or saved.

The overview figures are illustrative. Ticket selections reuse previously
reviewed public historical Week 8 references, not current quotes or saved
scoring benchmarks. The fictional receipt reports 0.5U risk and +0.75U net;
book, odds and quote/placement times remain unknown or blank. This does not
represent a live account, current matchup or verified betting recommendation.

<details>
<summary>Verification and scope</summary>

The narrow-width preview grid previously overflowed its card tracks. Constrained
tracks now retain full individual team tiles; below 360px Play cards stack and
Home matchup names occupy their own row. This is confined to the review viewer.

56 layouts at 320/390/768/1440 parent widths, 14 scenario checks and 66 image
decodes passed. All 14 final captures were inspected. No horizontal overflow or
undersized control targets was found (checkboxes use their 44px label target).
No page errors, provider/auth reads, non-GET requests, storage writes, bundle
intervals or OS dialogs were observed. Capture hashes are in the selection
record. Navigation keeps Sean's standing pass-unless-an-issue-is-reported rule.

Current frame approval does not establish completion of the separate earlier
league-wide logo replacement request; that requirement still needs scope
reconciliation. NBA stays parked. New avatar/photo choices and awards remain
held. No production implementation, merge, deploy or migration is included.

</details>
