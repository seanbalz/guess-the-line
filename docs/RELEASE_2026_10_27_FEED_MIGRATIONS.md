# League feed, badges, History, Export and Bets boards migrations applied — October 27, 2026

Sean's instruction (October 27, 2026): "apply M-13, then M-21, M-22 and M-23, in order, with the Gate M checks, through the
SQL editor in my signed-in Chrome." Applied 14:56–14:58 UTC, one at a time, after `gtl-api` v38 and Pages `4a03e6cd`
([release record](RELEASE_2026_10_27_API_FRONTEND.md)) put the feed routes and screens live (Gate M step 2).

## Route

Each file was fetched in the page from `raw.githubusercontent.com` at `1db1c44062e2b63b7b945c6b0478a1ca6d72c8b6`, its SHA-256
compared with the repo copy, and run in the Supabase SQL editor (signed in as sbalsiger2@gmail.com, role `postgres`) with
its history row in the same script: `insert into supabase_migrations.schema_migrations(version,name,statements,created_by)`.
Every result was read back through the read-only `supabase-gtl` connection.

| Migration | File SHA-256 | Hosted version | History statement md5 = file md5 |
| --- | --- | --- | --- |
| M-13 `20261026130000_gtl_feed_kinds.sql` | `10a17df4…18a7` | **`20261027145602`** | `5aa7ced7512b85394d53335a73baf327` |
| M-21 `20261026131000_gtl_feed_reactions.sql` | `fbb603b6…1bfe0` | **`20261027145634`** | `a41d53f585f6df2645aa11c310118a7b` |
| M-22 `20261026132000_gtl_league_feed.sql` | `e0a6cd9d…3272e` | **`20261027145711`** | `767fb7d7326ae756a64b0de2de0e090a` |
| M-23 `20261026133000_gtl_kickoff_posts.sql` | `c19912f5…612f1` | **`20261027145740`** | `7067abbf5b56c66c5848c1b229325e09` |

Migration history: 54 rows (`bd53dcf4…f11a`) before, **58** after.

## Step 4, pre-check (read-only, 14:54 UTC)

- Replaced bodies matched each file's `-- replaces` header: `gtl_like_feed` `131d6fb0…`, `gtl_read_community` `ea70a00b…`
  (M-21), `gtl_comment_feed` `e2bcfcbf…` (M-22).
- None of the 14 new functions existed; no `gtl_feed_reaction_events`, no `league_id` column, no
  `gtl_feed_posts_league_idx`, no trigger on `gtl_feed_posts`. The kind check listed the 7 earlier kinds.
- M-23 dry run (`supabase/admin/kickoff_posts_dry_run.sql`): 6 Week 8 kickoff slots, none existing.

## Step 5, score and preservation hashes

- **Score hash** (SQL editor; every 2026 Weeks 1–7 ballot: user, season, week, mode, summed `gtl_ballot_pick_scores`
  points, scored count): **25 ballots, `41fa6ae2003cd33f7e7e14bbb3f136f2`** before M-13 and after M-23. Week 5 spread
  totals 128.0, 95.8, 91.4, 52.0, 37.6, with the anchors Sean 95.8, Steven 91.4 and Ben 37.6.
- **Feed rows:** 108 posts, md5 `2937f7b10f2eb0cf604c3a1903cd353f` (id, actor, kind, season, week, mode, payload,
  dedupe key, time); 3 comments, `34ccb5f373f03d6bae81fa5125b6131a`; 0 likes. Identical after every apply; after M-23 the
  same 108 non-kickoff posts and the 6 new kickoff posts.

## Step 7, verification after each apply

- **M-13:** `league_id` column with its foreign key to `gtl_leagues`; the kind check lists the 18 kinds; no post has a
  league.
- **M-21:** `gtl_feed_reactions` `910de581…`, `gtl_feed_post_visible` `2f0e204b…`, `gtl_feed_reaction_summary` `4982b939…`,
  `gtl_react_feed` `442d5b94…`, `gtl_like_feed` `22474cde…`, `gtl_read_community` `248464f9…`. `gtl_feed_reaction_events`
  has row security on and `service_role` select and insert only; `service_role` can no longer delete a like.
- **M-22:** `gtl_feed_league_access` `00cfc071…`, `gtl_feed_in_league` `f27b8967…`, `gtl_feed_embed` `453369d7…`,
  `gtl_read_league_feed` `2fdf8e7c…`, `gtl_read_post_comments` `a2c63075…`, `gtl_read_post_reactors` `9a46fa3e…`,
  `gtl_share_result` `0e7fc7eb…`, `gtl_comment_feed` `90b01cfc…`; `gtl_feed_posts_league_idx` exists.
- **M-23:** `gtl_kickoff_slots` `94e37c77…`, `gtl_write_kickoff_posts` `003eeabf…`, `gtl_feed_on_slate` `9b8f6bee…`;
  trigger `gtl_feed_on_slate` enabled, after insert for `week_published` posts only. The backfill wrote exactly the 6
  dry-run posts (`kickoff:2026:8:1793319300` and the five Sunday-to-Monday slots, 1, 8, 1, 2, 1 and 1 games), Community
  scope, each dated at its kickoff so no reader lists it earlier. No `kickoff_posts_failed` audit row.
- Every function body equals `scripts/migration-functions.mjs --latest`; each is security invoker, executable by
  `service_role` only, and has one `pg_proc` row. `gtl_feed_on_slate` also shows `service_role` execute (Supabase's default
  privileges); it returns a trigger, so it is never an RPC.

## Step 8, boundary and ledger (this record's PR)

- Signed-out probes after the applies (`1db1c44`'s area files): 367 checked, 351 denied, 16 awaiting, all of them M-12,
  M-25, M-26, M-27 and M-28 functions. No league feed piece awaits.
- `tests/migrations.mjs`: the four versions move from `NOT_HOSTED` to `APPLIED`; `REQUIRES` (M-21 and M-22 needing M-13
  and M-21) is emptied with them.
- `scripts/boundary/league.mjs`: the feed's `awaitingDeploy` entries are removed and `feed_reaction_events` joins the
  table probes. `tests/helpers/leak-scan.mjs` drops `/league/feed` from `READER_MIGRATIONS`.
- The tests that described the schema before these applies now build it as HOSTED minus the files applied here.

# Badges and awards migrations applied — October 27, 2026

Sean's instruction: "apply M-25, then M-26, in order, with the Gate M checks, through the SQL editor in my signed-in
Chrome." Applied 15:36 UTC by the same route, each file fetched at `b1bc64b493e6a6723ba7ee58582fdbd2569d448c` (unchanged
since `1db1c44`). Both only add objects: no body is replaced and applying them writes no row.

| Migration | File SHA-256 | Hosted version | History statement md5 = file md5 |
| --- | --- | --- | --- |
| M-25 `20261026234000_gtl_league_features.sql` | `416ee892…f3e4` | **`20261027153602`** | `96269f9ff9fffe54c0815facdc43bf24` |
| M-26 `20261026235000_gtl_features_schedule.sql` | `24988c67…108d` | **`20261027153637`** | `0c484b0600a27225734ece6db98473e2` |

Migration history: 58 rows before, **60** after.

- **Step 4:** none of the six tables or eight functions existed; `gtl_kickoff_line` (M-06) and `gtl_ballot_pick_scores`
  were present; the kind check already held M-13's `badge_earned`, `weekly_recap` and `season_champion`.
- **Step 5:** score hash 25 ballots `41fa6ae2003cd33f7e7e14bbb3f136f2` (same Week 5 anchors) before M-25 and after M-26.
  Feed posts created by 15:20 UTC: 110, `ee2d47f9a8c42f299fc7a9b672f22140` before and after (players added posts during
  the day, so the fingerprint is cut at a fixed time).
- **Step 7, M-25:** `gtl_feature_results` `dda6f6e4…`, `gtl_read_feature_inputs` `3cad80a8…`, `gtl_feature_post`
  `55fd7293…`, `gtl_record_feature_results` `12f08ac0…`, `gtl_read_features` `33f10f4c…`, each security invoker,
  `service_role` only, one `pg_proc` row. `gtl_feature_runs`, `gtl_badge_events`, `gtl_weekly_awards` and
  `gtl_player_streaks` have row security on, `service_role` select and insert, and no rows.
- **Step 7, M-26:** `gtl_claim_league_features` `c572b414…` and `gtl_complete_league_features` `6aa1510c…` (`service_role`
  only), `gtl_dispatch_league_features` `a8727557…` (owner only, no API role). `gtl_features_schedule` and
  `gtl_features_schedule_runs` have row security on, `service_role` read, and no rows: the schedule row and its cron are
  `supabase/admin/league_features_cron.sql`, still to run (Sean, after a live dry run). `gtl-league-features` is not
  deployed (no release target).
- **Boundary:** 368 signed-out probes with the six new table probes: 360 denied, 8 awaiting (M-12, M-27, M-28 only).
- **Step 8 (this PR):** both versions move to `APPLIED`; `scripts/boundary/league.mjs` empties `awaitingDeploy` (the two
  features routes ship in `gtl-api` v38) and adds the six tables; `/league/features` leaves `READER_MIGRATIONS`; the
  tests that described the schema before M-25 build it as HOSTED minus M-25 and M-26.

# History and Export migrations applied — October 27, 2026

Sean's instruction: "apply M-27, then M-28, in order, with the Gate M checks, through the SQL editor in my signed-in
Chrome." Applied 16:07 UTC by the same route, each file fetched at `fddcaf3d1ae6211324a80a9d3fef3f65d87ca003`. Both are
additive (`create function`, no replaced body, no table, no row), so neither has a rollback file.

| Migration | File SHA-256 | Hosted version | History statement md5 = file md5 |
| --- | --- | --- | --- |
| M-27 `20261026230000_gtl_me_history.sql` | `c6de522f…a965` | **`20261027160702`** | `ae409d18e6b7882137cbf96825b0c0f1` |
| M-28 `20261026231000_gtl_me_export.sql` | `ca029ff0…7295` | **`20261027160732`** | `058e6074a6e545dd30232d1d42a673b0` |

Migration history: 60 rows before, **62** after.

- **Step 4:** none of the five functions existed; every function they call was present (`gtl_ballot_locked_in`,
  `gtl_community_member`, `gtl_guess_revealed`, `gtl_ballot_late`, `gtl_nba_read_bets`, `gtl_read_reviewed_results`).
- **Step 5:** score hash 25 ballots `41fa6ae2003cd33f7e7e14bbb3f136f2` (same Week 5 anchors) and the 110 posts made by
  15:20 UTC (`ee2d47f9…`) identical before M-27 and after M-28.
- **Step 7:** `gtl_me_slate` `9ef62bd5…`, `gtl_me_results` `19502c7a…`, `gtl_read_ballot_changes` `7d2aeaa1…`,
  `gtl_read_me_records` `3673b4da…` (M-27) and `gtl_export_me` `b95eeae8…` (M-28): each equals
  `migration-functions --latest`, security invoker, `service_role` only, one `pg_proc` row.
- **Boundary:** 374 signed-out probes, 371 denied, 3 awaiting: M-12's three functions only.
- **Step 8 (this PR):** both versions move to `APPLIED`; `scripts/boundary/me.mjs` empties `awaitingDeploy` (the three
  routes ship in `gtl-api` v38); `/me/changes`, `/me/records` and `/me/export` leave `READER_MIGRATIONS`; the "while
  M-27/M-28 is missing" tests build HOSTED minus each file.
- **Signed-in use:** none of `/me/changes`, `/me/records` or `/me/export` had a signed-in request by 16:08 UTC.

# Bets boards migration applied — October 27, 2026

Sean's instruction: "apply M-12 (Bets boards) with the Gate M checks, through the SQL editor in my signed-in Chrome."
Applied 16:40 UTC by the same route, the file fetched at `519c46a9839b2ca11f1c189974a350c789158ec5`. Read only: three new
service-only functions over M-10's `gtl_bets_context`; no table, writer, row or replaced body, so no rollback file.

| Migration | File SHA-256 | Hosted version | History statement md5 = file md5 |
| --- | --- | --- | --- |
| M-12 `20261026233000_gtl_bets_boards.sql` | `f54ee6a1…2eb9` | **`20261027164010`** | `604e3061a27db61e1280b355acec205a` |

Migration history: 62 rows before, **63** after.

- **Step 4:** `gtl_bets_week_rows`, `gtl_read_bets_board` and `gtl_read_bets_season` did not exist; `gtl_bets_context`
  (M-10) was present.
- **Step 5:** score hash 25 ballots `41fa6ae2003cd33f7e7e14bbb3f136f2` and the 110 posts made by 15:20 UTC unchanged;
  Virtual Units `gtl_virtual_units_picks` 7 rows `f3018a3f…` and `gtl_virtual_units_settlements` 43 rows `8a736744…`,
  identical before and after.
- **Step 7:** `gtl_bets_week_rows` `b8b9419b…`, `gtl_read_bets_board` `7eac16f1…`, `gtl_read_bets_season` `5439c246…`:
  each equals `migration-functions --latest`, security invoker, `service_role` only, one `pg_proc` row.
- **Boundary:** 374 signed-out probes, **374 denied, none awaiting**: every piece the probes know is hosted and deployed.
- **Step 8 (this record's PR):** the version moves to `APPLIED`; `scripts/boundary/bets.mjs` empties `awaitingDeploy` (the
  board routes ship in `gtl-api` v38), so every area's list is now empty; `/bets/board` and `/bets/season` leave
  `READER_MIGRATIONS`; the "before the apply" test builds HOSTED without M-12.
- **Not verified:** no screen reads the boards yet, so they have no signed-in use.

## Signed-in readback (hosted logs, 14:43–15:50 UTC)

- `POST /league/features`: 22 answers 404 "coming soon" from 15:02 to 15:34 (before M-25), then 7 answers 200 from
  15:38 (after it).
- `POST /league/feed`: 200 at 15:48 (after M-22). `POST /personal/ballot`: 28 answers 200; `/points/read`, `/me/preferences`,
  `/community/read`, `/lobby` and `/bets/read` 200.
- No 5xx on `gtl-api` and no CPU, memory or uncaught-error line in `function_logs`; the slowest `gtl-api` answer took
  3.9 s.

## Probe timeouts

Five signed-out probe runs from this PC aborted on the checker's 15-second request limit (`invite/revoke` and
`league/comparison` signed out, plus three unnamed); none of those requests appears in the edge logs, where every probe of
those routes answered 401 within a second. They look like this PC's connection, not the API; other runs passed with no
request over 5 seconds. Not resolved.

## Not verified

- A signed-in reaction, comment or result share, and phone checks.
- The trigger's first live run: the next `week_published` post (Week 9's open, Monday November 2) should write its
  kickoff posts in the same transaction.
- A features run: none has been recorded yet (`gtl_feature_runs` is empty); the commissioner's
  `POST /league/features/run` or the M-26 schedule writes the first.

## Rollback and off switch

M-13, M-21 and M-23 are fix-forward (no rollback file). M-22 has `supabase/rollback/20261026132000_gtl_league_feed.sql`.
M-25 and M-26 replace nothing; `GTL_FEATURE_OFF` with `features` pauses the commissioner's run (`/league/features` keeps
reading), and the schedule stays off until its row is enabled. Rows stay (D-23).
Off switches: `GTL_FEATURE_OFF` with `reactions` pauses `/league/react`, and with `feed` pauses `/league/feed`,
`/comments`, `/reactors` and `/share-result` (the new app then shows `/community/read`); `alter table public.gtl_feed_posts
disable trigger gtl_feed_on_slate` stops new kickoff posts (Sean's approval). Rows stay (D-23).
