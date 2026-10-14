-- M-04 social_line_lock: the line lock on real slips (redesign build plan, stage 21; D-36 as amended by D-39, D-23, D-19).
--
-- replaces public.gtl_read_social md5 a7f96942d52ffd86c992a1fbccfc2a0b
--
-- D-36 (line lock): a game's spread or total line stays hidden in Bets until the player submits that market's guesses or confirms
-- a skip. D-39 (Sean, October 14, 2026) makes it per game: "once you make a pick that game is revealed. you can change bets up
-- until game start but you cannot guess the spread or total again once youve locked in that games guess". Locking in a game's
-- Spread or Total guess opens, for that player, that game's line for that market; a sit-out (D-23), and from M-03 a skip or
-- "See picks now", opens the rest of the week for that market; a game's kickoff opens it for everyone. Real slips are the
-- shared Bet Tracker (D-19), which D-36 keeps inside Bets "as today": friends' slips stay visible, but another player's leg on a
-- game's spread or total carries that game's line, so it is held back until the line is open to the viewer.
--
-- What this file changes: gtl_read_social (same argument list, same output fields) adds one field to each week it returns,
-- `gate`: this viewer's gate for every game of that published week, { gameId: { spread, total } }, read from M-01's
-- gtl_markets_visible at the database's clock. Nothing else changes: no table, row, trigger, write path, grant on any other
-- object, or other function body. The function still returns every deliberately shared record unfiltered, and the edge handler
-- projects it: cloud/social.mjs redacts the locked legs of other players' slips (no line, no line in the selection text; the
-- slip's free-text note and its correction reasons are held back with it), keeps the viewer's own slips whole, and refuses a
-- Tail of a slip with a locked leg. A handler that reads a week without `gate` (this file not applied, or rolled back) keeps
-- today's behavior, so the deploy can go first.
--
-- Apply after M-01 (20261014223000_gtl_guess_gate_per_game.sql): this body calls M-01's gtl_markets_visible (build plan section 5
-- rule 3; ledger "apply after M-01"). Rerunnable: create or replace with the unchanged argument list and defaults, and the
-- grants are restated. Rollback: supabase/rollback/20261015050000_gtl_social_line_lock.sql restores the previous body; the
-- handler then reads no gate and shows every slip as today. Replaces one function, so the md5 header above names its body on main.

create or replace function public.gtl_read_social(p_user uuid,p_season integer default null,p_week integer default null,p_all boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; result jsonb; now_at timestamptz:=clock_timestamp();
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_SOCIAL_PROFILE'; end if;
  if p_all is null or (p_season is null)<>(p_week is null) or (p_all and p_season is not null) then raise exception 'GTL_SOCIAL_INVALID'; end if;
  if p_season is null then select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1;
  else s:=p_season; w:=p_week; end if;
  if not exists(select 1 from public.gtl_weekly_slates where season=s and week=w) then raise exception 'GTL_SOCIAL_SLATE'; end if;
  -- D-36/D-39 line lock: each week carries this viewer's per-game gate (kickoff, own lock-in, own sit-out) for the handler.
  select jsonb_build_object('season',s,'week',w,
    'weeks',coalesce((select jsonb_agg(jsonb_build_object('season',x.season,'week',x.week,'revision',coalesce(y.revision,0),
      'games',x.signature->'games','state',coalesce(y.state,'{"version":1,"entries":[],"audit":[],"receipts":[]}'::jsonb),
      'gate',public.gtl_markets_visible(p_user,x.season,x.week,now_at)) order by x.season,x.week)
      from public.gtl_weekly_slates x left join public.gtl_social_weeks y using(season,week) where p_all or (x.season=s and x.week=w)),'[]'),
    'availableWeeks',(select jsonb_agg(jsonb_build_object('season',season,'week',week) order by season desc,week desc) from public.gtl_weekly_slates),
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'displayName',display_name) order by display_name,user_id) from public.gtl_profiles),'[]'),
    'following',coalesce((select jsonb_agg(target_user_id order by target_user_id) from public.gtl_social_follows where user_id=p_user),'[]')) into result;
  return result;
end $$;

-- create or replace keeps existing privileges; the service-only grant is restated.
revoke all on function public.gtl_read_social(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.gtl_read_social(uuid,integer,integer,boolean) to service_role;
