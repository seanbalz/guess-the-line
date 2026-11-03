# Release card: no refresh while a selected book is missing, `gtl-api` — November 3, 2026

Sean, November 3, 2026: "do not waste credits. correct this asap". This is the [D-71](DECISIONS.md) addendum. It touches
`gtl-api` only: no migration and no frontend change.

## Why

The 18:15 UTC scheduled run collected Week 9 at two credits, but its reply had no FanDuel prices for any of the 15
games. DraftKings and BetMGM were there (60 quotes against the usual 90), so the run is correctly labelled partial. A
saved line needs all three selected books (`gtl_line_from_snapshot`). So until FanDuel returns:

- No collection can make a new line, and saves keep the 06:15 line (the newest that qualifies).
- After D-71 (`gtl-api` v46, 18:47 UTC) every lock-in whose line is over five minutes old would spend two credits on a
  collection that cannot help. That is up to four a day, eight credits.

No collection ran between 18:16 UTC and this card. The 14 credits used outside the odds runs since 06:15 were the EPL
moneyline collections at about 14:05 UTC, which share the key.

## The change

- `cloud/submission-odds.mjs`:
  - `selectedBookMissing` is true when the newest stored snapshot has a selected book missing from the provider's reply
    (`book_missing`). It must be missing in the mode's market for every game the save needs that has not kicked off.
  - `runSubmissionWithFreshOdds` then skips the collection and commits as before (D-27).
  - A fault reading the snapshot keeps the refresh.
- `cloud/handler.mjs`:
  - The `/personal/ballot` refresh, lock-ins and sends, reads that snapshot first.
  - The read is one service-role row from `gtl_market_snapshots`, with only its games and selected books, server-side
    only and never sent to a player.
  - The games it checks are the lock-in's, or for a send every game it names.
- **Still refreshes:** a stale market, one game missing a book while another has all three, a game the snapshot does not
  hold, or no snapshot at all.
- **Unchanged:**
  - The scheduled runs (`gtl-odds-refresh`) still collect twice a day. Once one sees FanDuel again, saves refresh as before.
  - All limits: six attempts a UTC day, the 5-minute cooldown, the 50-credit reserve, two credits a collection.
  - The older league ballot route (no week in its intent) keeps the plain D-17 refresh.

What players notice: nothing on screen. While a book is missing, a lock-in saves straight away with the newest
qualifying line, as it did before D-71.

## Not solved here

While FanDuel is missing, each scheduled run still spends two credits, four a day, and finds no three-book line. Those
runs are how the app notices FanDuel is back. If FanDuel stays missing, the lines Week 9 picks are scored against stay
those from 06:15 UTC on November 3. Choosing a replacement book changes the rules and is Sean's call; nothing here
changes the three books.

## Release

- **Target:** `api` in the [shared release workflow](SHARED_DEPLOYMENT.md), from the merge commit on `main`, with Sean's
  approval in the GitHub UI.
- **Order:** none needed.
- **Rollback:** redeploy `gtl-api` from `ff7b27f5b7e727db6012dd5198dec8bc8b37e970` (v46).
- **After the deploy (read-only):**
  - no `gtl_submission_odds_intents` collection while the newest Week 9 snapshot lacks FanDuel;
  - the next scheduled run (November 4, 06:15 UTC) shows whether FanDuel is back.

## Deployed

- **Run:** [release run 41704220392](https://github.com/seanbalz/guess-the-line/actions/runs/41704220392), `deploy` · `api`
  from `2c0c18b71fae57c5a425ad5c867e77d4a312f647`, with Sean's approval. Card:
  [#447](https://github.com/seanbalz/guess-the-line/issues/447). Both jobs succeeded; the deploy finished at 19:36:41 UTC
  on November 3.
- **Why that commit:** #444 merged as `cce79f2a`, but its main Tests run was cancelled when #445 merged after it, and the
  workflow needs green CI on the exact commit. #445 changes only docs and planning files, so `gtl-api` is the same.
- **Hosted:** `gtl-api` v47, bundle `e45076a2d22cf9d9674ff6be31fc644555a52f659ba3d267cff87590c3acf472`, JWT verification
  on.
  - Migration history is unchanged at 74 rows, digest `4345486d…` (latest `20261103184656`, M-38).
  - Signed-out calls to v47 got 401, as expected.
- **Readback (read-only, 19:37 UTC):** no odds collection of any kind since the 18:15 scheduled run. The November 4
  06:15 UTC run shows whether FanDuel is back.

## Evidence (local, executed)

- `tests/odds-open-weeks-sql.test.mjs`, on PGlite with the deployed `gtl-api` handler, provider adapter and every
  migration (skipped 0). FanDuel drops out of the provider double:
  - The first lock-in collects once, since no snapshot yet shows the gap. Its reply has no FanDuel.
  - Past the cooldown, the next lock-in still has no line under five minutes old. It reads the snapshot once, begins no
    collection, makes no provider request (not even the free event check) and saves (200).
  - With FanDuel back, the scheduled run collects all three books, and the next lock-in saves that line with no request.
- `tests/submission-odds.test.mjs`:
  - The skip, the read fault and the fresh-line path.
  - Every case of `selectedBookMissing`: the 18:15 shape, a total that still had every book, one game still quotable, a
    started game, an unknown game, a stale market, a book that is not selected, and unreadable input.
- **Mutation checks:**
  - Dropping the handler's `worthCollecting` fails the PGlite test.
  - Matching a reason other than `book_missing` also fails it.
- **Full suite:** 2,751 node tests, 2,750 pass and 0 skipped. The one failure is `tests/research-intake.test.mjs`
  checking POSIX file modes, which Windows cannot set. It is unrelated and passes on Linux CI.
