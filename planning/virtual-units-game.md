# Virtual units game — D-18 task list

Status: confirmed product rules; game not implemented or deployed. This is a separate play-money game under Picks, not a real sportsbook wager, the record-only Betting Challenge, a private actual-bet journal, Guess the Spread/Total, or Best Bets. One unit represents $100 virtual.

Owner: Sean Balsiger · Version 1 · October 8, 2026.

## Confirmed play rules

- A player can place one spread pick and one total pick on the same NFL matchup, but cannot place a second pick in the same market and matchup. First placement and edits are allowed until that game's kickoff. Keep every prior side, line, odds, unit amount and timestamp in an audit.
- Make entry button-driven: choose a spread side or Over/Under, then 0.5, 1, 1.5, 2, 2.5, 3 or another permitted unit amount, then confirm. There is no starting bankroll or stake cap; a pick is not rejected for an insufficient virtual balance.
- For each side, offer the most favorable **point line** from the latest retained named-book quotes. If points tie, choose the better American odds. More points favor the selected spread team; a lower total favors Over, and a higher total favors Under. Show the actual book, line, odds and quote observation/collection times. Show consensus separately as comparison data, never as a book offer. No manual line or odds entry is required for this flow.
- New saved quotes update the offered buttons. Already placed picks retain their saved line and odds unless the player explicitly edits before kickoff. **Do not impose a quote-age cutoff on this virtual game:** the latest retained named-book quote for that matchup and market remains selectable before kickoff when collection fails or a successful refresh omits that book's market. A newer saved quote from another book still competes for the best offered point line. Label the saved quote's source, observation/collection time and age prominently, save its exact historical terms and never call an aged quote a current executable offer. If no named-book quote has ever been saved for a matchup's spread or total, disable only that market's pick button until a genuine quote is saved. Keep other games and markets open; never fabricate a line or silently substitute consensus.
- Weekly standings qualification requires **at least three picks OR at least 3 units**. A week below both thresholds is omitted from weekly standings, while its settled picks still count in that player's personal overall record and ROI. An unreplaced voided pick retains its original pick and unit qualification credit. If the same market and matchup is replaced within the same competition week, count one qualifying pick at the replacement's unit stake, even if lower than the original; do not count both placements.
- A same-calendar-day postponement carries the saved pick, line, odds and units to the revised kickoff. A move to a different calendar day voids the original, returns its virtual stake, retains the audit and permits a fresh pick at the rescheduled market. A possible cancellation or no contest leaves picks pending while status is uncertain; verified cancellation or no contest from a permitted official source voids them, returns virtual stakes and preserves original pick/unit qualification credit. Notify affected players of these voids with a persistent in-app notice and opt-in push and email once those external paths are connected and verified. An unconfirmed cancellation report does not settle or void picks.
- Settle only from a permitted, verified automatic final-score feed. Commissioner-entered finals do not settle this game. A win earns net units from saved American odds (1 unit at −110 earns about +0.9091); a loss costs the staked units; a push returns the stake for zero net. ROI is net units divided by units risked on settled picks; pending and void picks are excluded. Track this game's own W-L-P, pending/void counts, units risked, net units and ROI by week, season and market. Whenever that automatic feed verifies a corrected final, even after weekly standings appear, regrade affected picks from their original saved terms, append a before/after audit, recalculate records, net units, ROI and standings, and notify affected players. No verified automatic feed is connected for this game yet, so picks would remain pending.

## Open decisions, one at a time

1. **Current — schedule calendar timezone.** Recommend using `America/Los_Angeles` to decide whether a revised kickoff is on the same calendar day or a different day; store UTC timestamps for evidence and display the Pacific date to players. Confirm this convention.
2. **Other schedule details.** Confirm the verified schedule-change and cancellation sources, actual kickoff evidence and how a replacement moved into a different competition week counts.

## Delivery register

| Item | State | Owner | Dependency | Exit evidence |
| --- | --- | --- | --- | --- |
| BET-07 rules and open decisions | Partially confirmed | Sean for open choices; Codex records them | Answers above | Decision log and this task list agree; no open choice is presented as confirmed. |
| Quote selector and button flow | Not implemented | Codex | Free named-book data and source rights | Mobile and desktop flows show the best point line, honest age, exact receipt and kickoff guard. A separate virtual selector preserves the existing five-minute quote gates used by other modes. |
| Virtual picks, audit and qualification | Not implemented | Codex | Account identity, schedule and final policy | One spread plus one total per game, editable until kickoff; immutable revisions and qualification examples verified without duplicate credit. |
| Automatic settlement and ROI | Blocked | Codex | Permitted automatic NFL final-score feed, event mapping and corrections | Verified results settle saved odds once; W-L-P, pending/void, units and ROI pass arithmetic and correction checks. |
| Void notices and release | Blocked | Codex | Notification consent/delivery and remaining rules | In-app notice persists; opt-in push/email delivery is verified; private authenticated device acceptance and hosted release are evidenced. |

No target date is committed. The existing free-only data budget remains in force. Product decisions above do not establish source rights, connected feeds, working controls, notifications or a live deployment.
