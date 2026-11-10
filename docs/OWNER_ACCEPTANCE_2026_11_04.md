# Guess The Line — owner acceptance, November 4, 2026

Owner: Sean Balsiger · Version 1 · November 4, 2026

## Current direction

Sean instructed: **"Assume navigation all passes until I identify an isssue."**
Treat navigation across the app as accepted by owner direction unless he reports
an issue. This is a recorded assumption, not a claim that each route was
independently exercised. Do not repeat route-by-route navigation questions.

Sean then required **mockups for anything needing his sign-off**, and clarified
**"For everything."** Every future approval request must include a relevant
visual first: a current screen/mockup for presentation, and illustrated states
or a flow for behavior. A text-only description is not a finished design.
Existing explicit approvals remain valid; this does not reopen them or approve
unselected D-69 build choices.

Open the [visual review board](../design/owner-review-2026-11-04/index.html).
It contains 39 Dark/Light screen pairs, reminder-state illustrations, eight
functional check sequences, and direct X references. Its local notes are drafts;
exporting or choosing "Looks right" does not silently change this register.

## Checks Sean explicitly performed

| Check | Owner response | Recorded evidence |
| --- | --- | --- |
| Home readable cards, full scrolling, bottom navigation clear of content | "Pass — using Home Screen app" | iPhone Home Screen app; operator-reported pass |
| Research → Games → one game; information loads, readable detail, scrolling and Back | "Pass" | Same phone review sequence; operator-reported pass |
| Research → Trends → one trend/chart; names, percentages, labels, scrolling and Back | "Pass" | Same phone review sequence; operator-reported pass |

The replies do not identify theme, iOS version or exact device asset hash.
Do not attach an exact release SHA to those device observations. An independent
signed-out HTTP check returned 200 and served index-B7yBMEPr.js and
index-B8Ur-JWC.css; that does not prove the phone loaded those bytes.
The [Research release record](RELEASE_2026_11_04_RESEARCH_STEP3.md) remains the
dated source/deployment evidence.

The wider navigation pass is **owner-directed**, not another performed test.
No individual answer was received to the Fantasy check or the superseded
text-only Home design prompt.

## Visual review coverage

| Area | Included visuals | Remaining boundary |
| --- | --- | --- |
| Home | Next move, kit/game tiles and Who's in | H1A/C9 and residual D-69 build choices await visual review; loading and motion need state evidence |
| Play, community and records | Landing, picks/game, score/game, compare, Points, badges/detail, awards, league, feed, history | Preserve approved P1B–P6A and plan; review only remaining build choices; stills do not verify moments or privacy |
| Research | Landing, Games/detail, Teams/detail, Trends/chart | Captures precede final step 3 font/wrapping fixes; obtain current captures for those details |
| Bets/recommendations | My bets, Overview, Your picks, Everyone, gap record, inline expansion, backup lines | Existing layout selections stay approved; saved data and settlement need evidence |
| Fantasy | Method, usage, scoring profile and player comparison | November 3 captures predate the November 4 report-card layout; current report-card visuals still needed |
| Account/appearance | Menu, Appearance and commissioner tools | Persistence, isolation, icon caching and update recovery need functional evidence |
| EPL | Current table fixture and linked historical four-screen concept | Historical concept includes obsolete NBA option; current turn confirmation/claim visuals still needed |
| Reminders | NFL/EPL menu and illustrated off/on/blocked states | Illustrations are not OS-dialog captures or proof of notification delivery |
| Functional/transition work | Eight visual sequences: saved data, reveal/privacy, turn queues, scoring, reminders, moments, updates/icons, retirement/expansion | Exact evidence and specific approval remain necessary for substantive or destructive actions |

All screenshots are existing documented fictional fixtures or design concepts.
They are not hosted player-account captures. See the
[capture provenance](../design/owner-review-2026-11-04/README.md) and
[hash manifest](../design/owner-review-2026-11-04/manifest.json).
Sample odds, names and dates are for illustration, never current verified data.

## What remains open

- The unapproved Home and Research D-69 choices and any residual Play choices.
  Show the relevant mockup/state before requesting each decision.
- Fresh signed-in Research readback and other technical evidence still called
  out by their release records. Owner-reported readability does not replace
  hosted route/log or data checks.
- Saved-record persistence, permission/privacy boundaries, scoring/reference
  correctness, collector fallback observations, actual reminder delivery, EPL
  claim/turn/rollover behavior, and safe update/icon recovery where outstanding.
- Missing current-state visuals listed above. Do not ask for those sign-offs
  using older captures as if they depicted the current implementation.
- RETIRE-03 or any other removal, migration apply, deployment or future scope:
  navigation acceptance and this board are not authorization for them.
  Use the latest specific release/decision record; older queue wording can be
  superseded by newer applied/released evidence.

This session did not save a pick, ticket or subscription, apply a migration,
delete historical data, or deploy the product. Supabase authentication did not
produce usable live readback, so no new hosted acceptance is asserted.

## X / Twitter examples

Sean also supplied [MySpariEdge](https://x.com/MySpariEdge/status/2111185414421643313)
and [RotoBot](https://x.com/rotobot_ai/status/2110512433282625965). The
[reference brief and original storyboard](../design/owner-review-2026-11-04/SIMULATION_REFERENCES.md)
map their described game-replay and probability-summary ideas to a possible
Research game layer. This is proposed design, not simulator approval or evidence
of model accuracy. Their video frames were not available for inspection.


- [Shahid: sports-app concept](https://x.com/shahidux/status/2100570476951027756).
- [Lickability: Apple Sports design critique](https://x.com/lickability/status/1762199274475991412),
  also [shared by Sam Henri Gold](https://x.com/samhenrigold/status/1762199613317026076).

The original posts were located through web retrieval. Their attached media were
not available for inspection through the connector; these are source links for
comparison, not an endorsement of unviewed visuals. No third-party artwork was
copied into the product or this board.

## Validation

The board uses the current D-38/D-55 colors and fonts from
design/tokens-next.json. Local validation covers image signatures/dimensions
and SHA-256, internal file links, HTML structure, inline JavaScript syntax and
the repository Brand QA command. Browser rendering and interaction are not
claimed: local browser automation is disabled in Work settings. Original Home,
Play, Research, Fantasy and Bets fixture images were visually inspected.

Source base: 7604cee25f4182d7c5262217c05f20d84b2994e3. Source publication and
CI are separate from owner approval and production deployment.
