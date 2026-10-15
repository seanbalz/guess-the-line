# Guess The Line — recommended bets

Owner: Sean Balsiger · Version 2 · October 15, 2026

Status: version 1 deployed October 15 as Pages `ed3fb50b` / API v24. Version 2 (D-51) is implemented with focused checks passed and is **not deployed**; required full CI remains tracked on its PR. See the [original release](RELEASE_2026_10_15_RECOMMENDATIONS.md) and [refinement release card](RELEASE_2026_10_15_RECOMMENDATION_REFINEMENTS.md); physical-phone acceptance remains separate.

Sean requested a Recommended tab in Bets using his own Spread and Total guesses.
He then replaced the proposed three-point cutoff with a red/yellow/green comparison,
the top three suggestions first, and an expandable list of the other discrepancies.
This is D-48; D-47 is reserved by the weather-schedule draft.

## Ranking and colors

Compare the player's submitted (or per-game locked-in) guess with each side's retained named-book offer. An optional personal-forecast basis uses an explicit saved forecast instead; missing forecasts never silently fall back to guesses. Both bases require the own submitted/locked guess and the same market gate. Include all positive offer gaps, including those below three points, and rank Spread and Total together by actual positive offer gap. Show up to three actionable, unsaved suggestions; expand for all comparisons, including saved and unavailable ones. Exact consensus matches can still produce a favorable book offer. Ties use kickoff and row key.
This ranking does not combine the two Guess games' scores or leaderboards.

Both sides have a signed advantage relative to the player's guess:

| Market | Side | Advantage in points |
| --- | --- | --- |
| Spread | Home | Offered home spread minus your home spread |
| Spread | Away | Offered away spread plus your home spread |
| Total | Over | Your total minus offered over total |
| Total | Under | Offered under total minus your total |

A positive advantage points toward the player's perceived value. Green means
one point or more in that direction; red means one point or more against it;
yellow means less than one point either way or an even line. These are display
boundaries chosen for this first version, not a measured confidence scale or
a reason to hide a smaller discrepancy. Every color has text and the actual
signed number. Unavailable offers have no color or invented gap. Consensus comparisons remain separate. Line-before-odds selection follows D-18, so point ranking is not an odds-adjusted return ranking.

These suggestions express the player's own valuation. A guess is not a
validated outcome model, a probability, or proof of positive expected value.
Trends remain available in their existing game details; they do not boost this
ranking or imply agreement with a suggestion. No new model, provider, paid
data, collection schedule or external sportsbook connection is introduced.

## Placement and visibility

- Use the signed-in account's current published Community week. Private-league
  membership is not required; an older private-group week does not move the
  recommendation week. Drafts and locked markets do not produce suggestions.
  Missing or invalid references stay unavailable. Started or settled games are
  not new recommendations.
- The actionable comparison uses retained book offers; consensus is separate.
  Saved Guess references and points never change because of this feature.
- Show the consensus source/time separately from the exact named-book offer.
  Retained quotes may be old under D-18; show age, book count and observation range. “Saved ≤12h ago” and “Saved >12h ago” describe age, not eligibility or a live-price guarantee. A single book is labelled a limited comparison. Never invent a price or
  turn consensus into an executable book offer.
- Add to card prepares a Virtual Units selection. The player reviews the book,
  line, odds and units, then explicitly places the virtual pick. Opening,
  expanding or adding a suggestion writes no bet. If the exact offered line has
  no advantage relative to the guess, that recommendation cannot be added.
- An existing pick is labelled on the recommendation and cannot be overwritten
  through the placement path. A prepared card retains its reviewed terms across reranking and unit-only changes; “Use updated quote” explicitly adopts a newer offer. Every unsaved review has Remove. Kickoff closes placement. Every save checks current account/week, visibility, kickoff and weekly revision again on the server. Placement and explicit quote updates also recheck the exact offer; units-only edits preserve saved terms even when current quotes are unavailable.
- Bets → Recommended is available in the opt-in app. The old app offers
  Virtual Units → Recommended. The old app's All games view and the opt-in app's
  separate Virtual Units view keep their existing private-league behavior.

Current-week saved, pending picks have an explicit Edit virtual pick flow. Units-only edits preserve all saved terms; changing a quote requires explicit review. Cancel edit discards only the local review. Settled, started and historical picks stay read-only. The selected week has W-L-P, net units and settled-stake ROI with pending/void pick counts and settlement status explicit.

The old app remains the default. Real-money tracked tickets and their records
are unchanged; GTL does not place external wagers. Settlement uses the existing
D-26 service and records. Your virtual card remains visible after kickoff, with saved terms and settled
results when available. A week selector keeps earlier published weeks accessible
as read-only cards. This feature adds no settlement scheduler, current-week
commissioner settlement control or combined season leaderboard.

## Services and release scope

`POST /bets/recommendations` defaults to the current published week and accepts
an exact season/week for historical read-only cards. It returns only the
authenticated player's selected-week personal guesses and forecasts, visible market references, exact named-book offers and own
Virtual Units picks. It reuses the hosted personal context, M-01 market gate and
retained quote reader. No odds refresh occurs. Missing gates fail closed; the
service never returns opponents' guesses or private notes.

`POST /bets/recommendations/place` validates reviewed terms, then calls the new
service-only `gtl_save_recommended_virtual_pick` function. Migration
`20261015143006_gtl_recommended_virtual_pick.sql` adds only that function and its
execute grants. It writes a new pick and audit in the existing Virtual Units
storage, with the shared account/week revision lock. It refuses an existing pick,
a different published week, an unsubmitted guess, kickoff, or an altered quote.
It does not replace any hosted function or rewrite existing rows.

`POST /bets/recommendations/edit` adds the service-only
`gtl_edit_recommended_virtual_pick` function in
`20261015190955_gtl_edit_recommended_virtual_pick.sql`. Units-only bodies carry
season/week/revision/game/market/units and preserve saved terms. An explicit
`updateQuote: true` body additionally carries the exact reviewed side/book/line/
odds/time. It never inserts a missing pick; it requires the active owner,
current published week, own submitted market, pending status, pre-kickoff time,
and shared revision, with before/after audits. Missing RPC returns unavailable,
not a fallback to another writer. The existing place function is unchanged.

The compact forecast editor uses the existing `/personal/forecast` mutation,
personal revision and stable request ID. A conflict keeps the entered value for
review. A lost write reply blocks another write until scoped saved-data readback.
Its values do not change competition guesses or score references.

This is the D-48 recommendation path, not the full redesign Bets service (M-10 /
M-11): it does not open other players' bets, add general account Bets editing, publish feed
posts or change the wager cap. M-02, M-03, M-04, M-05, M-06 and M-08 remain
unapplied. Guess rules and all existing routes keep their hosted behavior.

Before the refinement release, the compatible API maps the new refusal codes; the new edit migration is applied separately, never with a generic database push.
Verify its body and service-only grants, preserved historical scores/ballots,
old function bodies and live rules. The SQL off switch,
`supabase/admin/disable_recommended_virtual_pick.sql`, revokes only the new
function's execute permission and retains all records. The new edit-only off switch is `supabase/admin/disable_recommended_virtual_pick_edit.sql`. `GTL_FEATURE_OFF` accepts `recommendations` to disable the recommendation routes; `recommendation-edits` disables only the edit route. The previous frontend/API remain
the application rollback targets.

## Verification and release

The pure helper tests cover direction, thresholds, ranking and fail-closed
eligibility. Fictional-account browser tests cover the top-three list, expansion,
side labels, preparing versus placing, failure states and phone layouts in both
themes. Existing Virtual Units, Bets, privacy, brand and broader CI checks remain
required. Production asset and authenticated read checks must be recorded after
deployment; fixture saves do not establish a real production wager.

The original private message screenshots are task evidence only and are not
included in public source or assets. The existing [brand guide](BRAND_GUIDE.md)
and shared tokens govern both app presentations.
