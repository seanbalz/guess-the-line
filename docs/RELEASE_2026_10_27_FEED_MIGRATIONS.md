# League feed migrations applied — October 27, 2026

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

## Not verified

- Hosted logs 14:55–15:00 UTC show only the probes' 401s: no signed-in feed read, reaction, comment or share has run on
  production yet, and no phone check.
- The trigger's first live run: the next `week_published` post (Week 9's open, Monday November 2) should write its
  kickoff posts in the same transaction.

## Rollback and off switch

M-13, M-21 and M-23 are fix-forward (no rollback file). M-22 has `supabase/rollback/20261026132000_gtl_league_feed.sql`.
Off switches: `GTL_FEATURE_OFF` with `reactions` pauses `/league/react`, and with `feed` pauses `/league/feed`,
`/comments`, `/reactors` and `/share-result` (the new app then shows `/community/read`); `alter table public.gtl_feed_posts
disable trigger gtl_feed_on_slate` stops new kickoff posts (Sean's approval). Rows stay (D-23).
