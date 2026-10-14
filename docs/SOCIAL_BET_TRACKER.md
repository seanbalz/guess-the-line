# Guess The Line — social Bet Tracker

Owner: Sean Balsiger · Version 2 · October 14, 2026 · Decisions D-19, D-36, D-39

**Status: deployed; supplied tickets imported and verified.** Bet Tracker and
Unit Betting read the same hosted records. The main Dashboard includes a **Your
betting week** card with the signed-in player's included record, known risk,
pending bets, settled ROI coverage, and recent shared tickets. Its buttons open
Bet Tracker and the same Unit Betting week. The frontend and API release is
documented in [the release record](RELEASE_2026_10_08.md); the sixteen supplied
tickets are now mapped to live accounts, as recorded in the
[audited import](SOCIAL_BET_IMPORT_2026_10_08.md).

## Confirmed behavior

- Deliberately shared singles and parlays are visible to all signed-in players,
  independent of group membership. Existing private journals, forecasts, guesses,
  rosters and reveal gates are unchanged; no private entries are auto-published.
- New bets count toward records and weekly qualification by default. Only the
  owner can change terms, report an external ticket result, or exclude/include
  their bet. Changes retain a public history and reason.
- A bet appears once in the shared feed and the owner's selected Unit Betting
  week. A parlay is one bet, one stake and one combined price, with expandable
  legs. Correlated legs are never multiplied to manufacture a parlay price.
- Follow players, review their history, or tail a pending selection before every
  leg's scheduled kickoff, once every leg's line is open to you (the line lock
  below). A tail creates the follower's own record and ancestry;
  it requires their own reviewed price, stake, source and quote time. It does not
  place a sportsbook wager or inherit the original player's result.
- Player, week/history, kind, market, result, origin, following, team and inclusion
  filters apply consistently to records, ROI, comparisons and charts. Comparison
  switches can exclude parlays, tailed bets or tracked tickets from that view.
  Owner exclusion is saved; comparison filters do not rewrite other users' bets.

## Line lock on real slips (redesign stage 21, M-04) — October 14, 2026

D-36 keeps real slips inside Bets "as today" and hides a game's spread or total
line until the player submits that market or skips the week; D-39 makes the lock
per game. Another player's slip stays visible, but each of its spread and total
legs comes back without its line until the viewer locks in their Guess the Line
pick for that game and market (today: submits that market's ballot), sits out that
market for the week (from M-03 also a skip or "See picks now"), or the game kicks
off.

- **Database.** `20261015050000_gtl_social_line_lock.sql` (M-04) replaces
  `gtl_read_social` with the same arguments and adds `gate` to every week it
  returns: M-01's `gtl_markets_visible` for the viewer, `{ gameId: { spread, total } }`.
  Nothing else changes. Its rollback,
  `supabase/rollback/20261015050000_gtl_social_line_lock.sql`, restores the
  previous body. Apply it after M-01.
- **Handler.** `cloud/social.mjs` redacts each locked leg of another player's slip
  to `{ gameId, market, side, line: null, selection, locked: true }`. The selection
  names the team or Over/Under and never the line. The slip also gets
  `locked: true`, `lockedMarkets` and `canTail: false`, and its note and change
  reasons (which can carry the line) wait with it (`noteHidden`). Earlier versions
  in its history are redacted the same way. A Tail of a slip with a locked leg is
  refused with 409 and the lock sentence ("Submit your Spread picks to see this
  line.", or "Lock in your Spread pick to see this line." once `rules.sentFinal`)
  before anything is written; an exact retry of a tail already saved replays as
  before. Player props are never locked. The viewer's own slips are never
  redacted. A week without `gate` (M-04 not applied, or rolled back) is shown
  exactly as before. Replies carry the live `rules`.
- **Screens.** Bet Tracker shows a lock and "Line locked" on a locked leg, the
  lock sentence, "The ticket note shows with the line." when a note waits, and a
  disabled Tail ("Tail opens with the line."). The Your betting week card lists
  only the player's own bets, which are never locked; it reads a locked leg as
  locked all the same. Bet Tracker now opens on the current published week (DP-3)
  instead of a fixed Week 5 or a group's league week. The week picker still
  reaches every past week, and the card keeps its group's week until the new
  app's Bets tab (stage 46).
- **Tests.** `tests/social-line-lock.test.mjs`: gate, redaction, Tail, the
  handler, and PGlite on `ALL`, on `ALL` without M-04 (the deploy before the apply)
  and on `HOSTED`. With M-04, every reader in the leak scan's `READERS`, now
  including `/social/read`, gives a player who has not locked in no line, and so
  do the slip-change replies. A `/social` reply names its viewer at the root
  (`actorId`), so the scan reads it through `readerReply`, which takes that name
  off: the counts, chart and selection rows built from other players' slips are
  scanned too. Also the 390 px real-slip case in
  `tests/cloud-browser/social-no-league.spec.js`.

## Accounting and scope

W–L–P uses included reported results; pushes do not enter win percentage. ROI is
the sum of settled net units divided by the sum of settled risk, multiplied by
100. A complete win uses saved combined American odds unless an actual reported
total return overrides it. A loss loses its saved stake; a push returns its stake.
Pending and void bets are excluded from ROI. Unknown stake or an unpriced win
without an actual return stays outside the ROI sample. Coverage and exclusions
are shown separately; an incomplete price does not erase a reported W–L–P result.

Weekly qualification uses at least three included bets **or** at least 3 included
units for that player/week. One parlay counts once. Unknown stakes add no invented
unit credit. Unqualified weeks remain in personal overall history; the comparison
labels qualification. Selection charts count legs, while net-unit charts use each
ticket once. Any stake allocation across parlay legs is visualization only.

These are tracked, user-reported external tickets. This release is **not the
complete D-18 virtual game**. Public routes reject virtual creation until a saved
named-book quote receipt flow is connected; manual virtual settlement remains
unavailable. D-18 still requires automatic verified results, reschedule handling
and its other outstanding delivery. Its latest rule has no quote-age cutoff for
retained named-book quotes before kickoff. No live price or result feed is added.

## Supplied Week 5 records

The server-side intake contains Troy's 14 exact singles at 1 unit each. His actual
accepted odds, book and placement times remain unknown; researched comparison
prices are not represented as ticket prices. Sean's five-leg screenshot preserves
the +2100 boost and exact text, including the unverified Jalon Daniels leg. The
Novig screenshot preserves $50 risked, $218.62 total payout, $168.62 potential
profit and effective combined +337.24 odds. Both parlay unit stakes remain unknown
because their dollar-to-unit conversion is unconfirmed. No outcome is inferred.

The original intake seeded the default loopback owner preview with fixture
identities. A subsequent authorized import mapped its sixteen tickets to verified
Sean/Troy accounts through active Triple Threat memberships, with fresh import
audits and stable request receipts. It is not bundled into static assets. Dates
not established by the images remain blank; the Week 5 association follows this
chat. Production and the local cloud preview on port 4173 share the hosted records;
the separate owner preview on port 8794 is not an account-sync source.

## Architecture and verification

`shared/social-bets.mjs` owns validation, retry receipts, audited mutations and one
public accounting projection. `cloud/social.mjs` binds identity to verified auth;
`server/social-store.mjs` supplies isolated atomic local persistence. Migration
`20261009005145_gtl_social_bet_tracker.sql` adds social-only storage, following,
owner checks, revision checks and atomic receipts. Browser roles cannot directly
read its tables or invoke its service-only RPCs. The UI uses existing GTL tokens.

Tests: `social-bets`, `social-cloud`, `social-local` and `social-sql` cover math,
privacy, ownership, replay, concurrency, intake and historical scope. Browser
coverage is in `tests/browser/social.spec.js`, `tests/browser/social-dashboard.spec.js` and
`tests/cloud-browser/social-no-league.spec.js`; cloud browser tests use fixtures.
Run `node --test tests/social-*.test.mjs` for the targeted suite. Local SQL tests
use PGlite and explicitly skip if unavailable; none proves hosted deployment.

Initial local validation recorded October 8, 2026: `npm test` passed 368 checks with zero skips; local browser regression passed 29 tests; fixture-backed cloud browser regression passed 79 tests. Local and cloud builds passed, and the cloud bundle scan found no private source data or server credentials. The build retains its existing large-chunk warning. Final read-only visual QA confirmed the supplied tickets, dark/light layouts at 320px and 1440px, unknown parlay units preserved in correction, and personal history retaining its player filter. At that point, no hosted release or live-account import had been performed.

That paragraph records the initial local validation. The subsequent
[production release](RELEASE_2026_10_08.md) and
[verified ticket import](SOCIAL_BET_IMPORT_2026_10_08.md) supersede its delivery
status. Five additional import tests pass; hosted readback and an exact replay
confirm sixteen saved tickets without duplicates or changes to existing ballots.
