-- M-13 feed_kinds (redesign build plan stage 48; D-35, D-36, D-23). Local implementation only: applying it to the hosted
-- project is Sean's "apply M-13" (Gate M). High risk, alone, fix forward (Gate M step 9): it changes a table constraint and
-- adds a column, which supabase/rollback/README.md never allows in a rollback file, so it has no rollback file and is listed
-- in FIX_FORWARD (tests/migrations.mjs). The Supabase MCP may ask to confirm an `alter table`: Sean is present, or uses the
-- SQL editor.
--
-- What it does, and nothing else:
--   1. Swaps gtl_feed_posts' kind check once, to the final list the redesign needs: the five D-21 kinds (20261009120000),
--      the two Guess the Points kinds (P-02, 20261023190000, hosted) and the eleven new ones the later stages write:
--      bet_shared (M-17), challenge_offered, challenge_matched and challenge_settled (M-15, M-18), kickoff (M-23),
--      bets_week_settled, badge_earned, streak_milestone, weekly_recap and season_champion (M-25), and result_shared (M-22).
--      Every existing row satisfies the new check (it only adds kinds), so the check validates without touching a row.
--   2. Adds a nullable league_id: null is the Community (every post today); a private group's id scopes a post to that
--      group's members (RULES.md: group standings stay private; read by M-21's gtl_read_community and M-22's feed reader).
--      It references gtl_leagues, so a post can only name a real league, and a league with posts can never be deleted.
--
-- No row is inserted, updated or deleted, and no function, trigger or grant changes. The readers and writers deployed
-- today are untouched: gtl_read_community selects its fields by name (a new column changes no reply), cloud/community.mjs
-- normalize() drops every kind it does not know (so the old app shows no new kind until a stage renders it), and nothing
-- writes a new kind or a league_id until the migrations that follow it are applied (M-15, M-17, M-22, M-23, M-25; build
-- plan section 5 rule 6).
--
-- Idempotent: the check is dropped if present and added in the same statement; the column is added only if missing (its
-- foreign key comes with it). Rerunning the file changes nothing.

alter table public.gtl_feed_posts
  drop constraint if exists gtl_feed_posts_kind_check,
  add constraint gtl_feed_posts_kind_check check (kind in (
    'joined','ballot_submitted','bet_posted','bet_settled','week_published',
    'points_played','points_final',
    'bet_shared','challenge_offered','challenge_matched','challenge_settled','kickoff','bets_week_settled',
    'badge_earned','streak_milestone','weekly_recap','result_shared','season_champion'));

alter table public.gtl_feed_posts add column if not exists league_id text references public.gtl_leagues(id);
