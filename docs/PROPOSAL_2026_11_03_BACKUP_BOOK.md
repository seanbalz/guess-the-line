# Proposal card: BetRivers as a backup book (D-74, M-39) — November 3, 2026

**Status: draft.** Sean, November 3, 2026: "Draft it, don't ship". Nothing here is approved, merged, applied or deployed.
[D-74](DECISIONS.md) records the proposal; it is not a decision yet.

## Why

At 18:15 UTC the scheduled run's reply had no FanDuel prices for any of the 15 Week 9 games. DraftKings and BetMGM were
there. A saved line needs three books (`gtl_line_from_snapshot`), so no new line can be made while FanDuel is missing.
Week 9 guesses keep the 06:15 UTC line, and each scheduled run spends two credits for nothing. `gtl-api` v47 already
stops saves spending credits in that state.

The provider still lists FanDuel as a US book. Its docs say a bookmaker "might disappear from the API response"
occasionally, so the gap may close by itself; the November 4 06:15 UTC run will show.

## The proposal

- **One request, same cost:**
  - The provider adapter (`cloud/odds-provider.mjs`) asks for `draftkings,fanduel,betmgm,betrivers`. The provider counts
    up to 10 named books as one region, so a collection still costs two credits.
  - `MAX_COST` still stops the adapter for good if a reply ever reports more.
- **Stand-in only:**
  - Game by game and market by market, BetRivers is used only in place of a selected book the reply could not quote.
  - It is never used alongside all three. With all three quoted, the payload is exactly as today.
  - The missing book stays in `unavailable`, and `standIns` records `{ book: 'betrivers', for: 'fanduel' }`.
  - The market counts as `available` once it has three quotes.
- **Same checks:**
  - A BetRivers quote passes every check the others do: a fresh market update within five minutes, paired outcomes, the
    right event and kickoff.
  - M-39 lets `gtl_line_from_snapshot` accept `betrivers` as one of exactly three distinct books. Everything else in it is
    unchanged: observation windows, the five-point spread around the median, the median itself.
  - With three distinct books out of four, at least two are always selected ones.
- **Shown:**
  - Book-level prices (`gtl_book_quotes_from_snapshot`, the Lines sheet) name BetRivers. Under it, the game sheet says
    "Standing in for FanDuel" (Sean, November 3: "Add the label"; `standInFor`).
  - Phone mockups from the real app: [design/backup-book-2026-11-03](../design/backup-book-2026-11-03/README.md).
  - The revealed sources table lists the missing book as missing ("BetRivers stood in.") and BetRivers as included ("Stood
    in for FanDuel.").
  - The app already lists a book that is not required as "Not a required book".
- **Credits:** v47's skip (`selectedBookMissing`) now counts a market as missing only when it has fewer than three quotes.
  So a save refreshes again once BetRivers can stand in.
- **Unchanged:**
  - Lines already saved (D-16, D-23).
  - Challenge selections, Virtual Units and the frozen spread benchmark keep the three books.
  - EPL keeps its own three books.

## Open questions for Sean

1. **Rule:** may a backup book stand in for a missing one? That is D-74 itself.
2. **Which backup:** BetRivers is the one free US book already allowed in the adapter. Caesars (`williamhill_us`) and
   Fanatics are listed by the provider but not allowed by the adapter, and Caesars is marked unavailable on the current plan.
3. **Mockups:** phone mockups of the Lines sheet are in `design/backup-book-2026-11-03/`, with the label Sean asked for.
   They wait for his OK, like every visible change.

## Not verified (needs a real collection)

- **Freshness:** whether BetRivers' market updates are fresh enough (within five minutes of the collection) for it to
  stand in often. The first collection after release will show, at no extra credits.
- **Cost:** that four named books bill two credits. It is the provider's documented rule, not yet seen in a reply.

## Release, if approved

1. **M-39 by Gate M** (Sean's SQL editor). Pre-check md5s:
   - `gtl_line_from_snapshot` `a4c48626930c05b9d0a8ec2f70be0197`
   - `gtl_book_quotes_from_snapshot` `051d3033460ea3fb7d28257c3528c657`

   Rollback: `supabase/rollback/20261103210000_gtl_backup_book.sql`. Before it lands, a snapshot with BetRivers simply
   makes no line (as today), so the order is safe either way. Applying M-39 first means the first collection after the
   code deploy counts.
2. **`api` release** (shared workflow, Sean's approval). Save-triggered collections then ask for BetRivers.
3. **`gtl-odds-refresh` Mac mini deploy**, so the scheduled runs, the main collectors, ask for it too.
4. **Readback:** the next collection's `availableQuotes`, its `standIns`, and the age of new saved lines.

## Evidence (local, executed)

- **PGlite run** of the deployed handler, provider adapter and every migration (`tests/odds-open-weeks-sql.test.mjs`).
  FanDuel is missing from every reply:
  - The lock-in collects once, asking for the four books, and stores three quotes per market (84 for 14 games).
  - It saves a fresh three-book line (DraftKings, BetMGM, BetRivers), and the book-level prices name BetRivers.
  - The same snapshot makes a line with M-39 and none without it.
- **v47's test** still holds, with FanDuel and BetRivers both missing: no collection, the save goes through.
- **Provider tests:**
  - With all three selected books quoted, BetRivers is ignored.
  - With FanDuel missing, BetRivers stands in in every market.
  - With two missing, one stand-in and the market is partial.
  - With BetRivers missing or stale, there is no stand-in.
  - Backup configuration is validated, and with no backup the request names three books.
- **Sources view:** the stand-in rows, the saved receipt read two ways, and three cases where a stand-in cannot form
  consensus.
- **Mutation checks:** each of these fails a test:
  - dropping the stand-in loop;
  - M-39 not accepting BetRivers;
  - the skip ignoring stand-ins;
  - the view ignoring stand-ins.
- **Full suite:** 2,754 of 2,755 node tests pass (0 skipped), and the app suite passes 668 of 668. The one failure is the
  Windows-only research-intake file-mode check.
