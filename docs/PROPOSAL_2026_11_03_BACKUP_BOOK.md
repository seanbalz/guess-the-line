# Release card: BetRivers as a backup book (D-74, M-39) — November 3, 2026

**Status: applied and deployed.** Sean, November 3, 2026: "Draft it, don't ship", then "Add the label", then "Ship D-74
now". [D-74](DECISIONS.md) is the decision. M-39, `gtl-api` v50 and `gtl-odds-refresh` v8 are live; see "Applied and
deployed" below.

## Why

At 18:15 UTC the scheduled run's reply had no FanDuel prices for any of the 15 Week 9 games. DraftKings and BetMGM were
there. A saved line needs three books (`gtl_line_from_snapshot`), so no new line can be made while FanDuel is missing.
Week 9 guesses keep the 06:15 UTC line, and each scheduled run spends two credits for nothing. `gtl-api` v47 already
stops saves spending credits in that state.

The provider still lists FanDuel as a US book. Its docs say a bookmaker "might disappear from the API response"
occasionally, so the gap may close by itself; the November 4 06:15 UTC run will show.

## The change

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

## Questions Sean settled

1. **Rule:** may a backup book stand in for a missing one? Yes ("Ship D-74 now").
2. **Which backup:** BetRivers, the one free US book already allowed in the adapter. Caesars (`williamhill_us`) and
   Fanatics are listed by the provider but not allowed by the adapter, and Caesars is marked unavailable on the current plan.
3. **Mockups:** phone mockups of the Lines sheet are in `design/backup-book-2026-11-03/`. Sean asked for the label after
   seeing them, then said "Ship D-74 now".

## Not verified (needs a real collection)

- **Freshness:** whether BetRivers' market updates are fresh enough (within five minutes of the collection) for it to
  stand in often. The first collection after release will show, at no extra credits.
- **Cost:** that four named books bill two credits. It is the provider's documented rule, not yet seen in a reply.

## Release

1. **M-39 by Gate M** (Sean's SQL editor). Pre-check md5s:
   - `gtl_line_from_snapshot` `a4c48626930c05b9d0a8ec2f70be0197`
   - `gtl_book_quotes_from_snapshot` `051d3033460ea3fb7d28257c3528c657`

   Rollback: `supabase/rollback/20261103210000_gtl_backup_book.sql`. Before it lands, a snapshot with BetRivers simply
   makes no line (as today), so the order is safe either way. Applying M-39 first means the first collection after the
   code deploy counts.
2. **`api` release** (shared workflow, Sean's approval). Save-triggered collections then ask for BetRivers.
3. **`odds-refresh` release** (shared workflow target; `gtl-odds-refresh` is v7 from `4cf149e7`), so the scheduled runs, the main collectors, ask for it too.
4. **Readback:** the next collection's `availableQuotes`, its `standIns`, and the age of new saved lines.

## Applied and deployed (November 3–4, 2026)

- **Merge:** #452 merged at 23:32:34 UTC as `49f60718565f9bef45045fd20dc2b9535263f716`, after all 12 PR checks passed.
  Auto-merge had not fired, so it was merged pinned to the head commit.
- **M-39, Gate M (Sean's Chrome SQL editor, as `postgres`):**
  - **Before:** the bodies matched the headers (`a4c48626…`, `051d3033…`), with ACL
    `{postgres=X/postgres,service_role=X/postgres}`, security invoker and `search_path=""`. M-39 was not in history.
  - **The apply:** the file was fetched from GitHub at `49f60718`: 7,969 bytes, SHA-256 `259069ca…3c1c35`, equal to the
    repo copy. One implicit transaction ran the guard, the file, the history insert
    (`array[$gtlmig$<file>$gtlmig$]`, created by sbalsiger2@gmail.com) and a readback.
  - **Hosted version `20261103233404`.** The history row has 1 statement, 7,969 bytes, md5 `4f20b6a7…`, equal to the
    file.
  - **After:** `gtl_line_from_snapshot` `47ee81756faa18c12aa6796a971514c8` and `gtl_book_quotes_from_snapshot`
    `5c6c4b46e02c16e05d0503f401984740`, equal to the repo bodies. One version of each, with the ACL, invoker and
    search path unchanged.
  - **Score hash, before (23:33:19) and after (23:34:23 UTC):** 40 ballots `81cb7094efd09ba2768eedce818e7ede` and 57
    settlements `43a064a0490661770a06317f7f1eeae6`, unchanged.
  - **History:** 76 rows, digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`. That includes M-40
    (`20261103232119`), which the Codex rollout applied separately at 23:21 UTC.
- **`api`:** [release run 41741408404](https://github.com/seanbalz/guess-the-line/actions/runs/41741408404), card
  [#465](https://github.com/seanbalz/guess-the-line/issues/465).
  - The deploy finished at 00:09:51 UTC on November 4. `gtl-api` is **v50**, bundle `c5ed571b…`, JWT verification on.
  - The deployed source contains `DEFAULT_BACKUP_BOOKS`, `standInFor` and the three-quote skip. It also carries #421's API
    part: EPL standings use Sleeper totals, and the bonus is not added twice. Sean approved that ("Ship both").
- **`odds-refresh`:** [release run 41744806151](https://github.com/seanbalz/guess-the-line/actions/runs/41744806151), from
  the same source, finished at 00:12:36 UTC. `gtl-odds-refresh` is **v8**, bundle `65d23faf…`.
- **Gates:** Sean asked for both production gates to be approved for him ("Approve it for me"). Each was approved with the
  GitHub CLI as seanbalz, after checking the run's title, source SHA and card.
- **Still to read back:**
  - the next collection with FanDuel missing, which should record `standIns` and make lines again (the 06:15 UTC run on
    November 4, or a lock-in);
  - BetRivers' freshness;
  - that four named books bill two credits.

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
