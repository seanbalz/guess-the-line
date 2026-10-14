-- M-08 guess_picks_reader: everyone's Guess picks for a week and market, game by game, through M-01's per-game gate
-- (redesign build plan, stage 26; D-39, D-31, D-36, D-30, D-23).
--
-- Sean, October 14, 2026 (D-39): "once you make a pick that game is revealed. you can change bets up until game start but you
-- cannot guess the spread or total again once youve locked in that games guess". Locking in a game's guess for a market opens,
-- for that player, everyone's guesses for that game and market; a game's kickoff opens it for everyone (D-31); a sit-out
-- (D-23), and from M-03 a skip or "See picks now" (D-36), opens the rest of the week for that market. Unlocked guesses are
-- drafts that only their owner sees.
--
-- What this file adds: one service-only, security-invoker reader and nothing else (no table, row, trigger, write path, grant on
-- any other object, and no other function body).
--
-- gtl_read_guess_picks(viewer, season, week, mode, game, target, now): one entry per game of that published week (one game when
-- `game` is given, ordered by kickoff), each with one row per member (one member when `target` is given):
-- * status: 'in' (that member's guess for this game and market is locked in), 'late' (locked in, and the ballot carries a
--   stored Late marker, D-30; nothing writes one until M-07), 'sat_out' (no locked-in guess for this game and a weekly opt-out
--   for this market) or 'not_yet' (anything else, a draft included, so another member's draft is never told apart from no
--   ballot). A locked-in guess keeps counting even if the rest of the week is later forfeited (D-39), so it reads 'in' or 'late'.
-- * pick: another member's guess only while it is locked in (gtl_guess_locked_in) and this game and market is open to the viewer
--   (gtl_markets_visible, the same gate History reads); the viewer's own guess always, a draft included (D-23: a player's own
--   entries are never redacted), with lockedIn telling a draft apart. A locked-in guess the viewer cannot see yet says
--   hidden: true and carries no number.
-- * From that game's kickoff, for a locked-in guess of an eligible ballot whose line at the guess is available: error (how far
--   the guess was from that member's own line at the guess, D-16/D-27), points (gtl_ballot_pick_scores, the leaderboard's single
--   scoring path, so they match the standings to the cent), a shared rank by error over every scored member of that game (ties
--   share it: 1, 2, 2, 4, with tied: true) and closest (the smallest error, ties included). Before kickoff all four are null and
--   tied and closest are false, even for a game open to the viewer. The rank is always taken over every member, so a `target`
--   row carries that member's place among everyone. No line value is ever returned: lines are stage 23's reader (M-06).
-- * late ({ deadline, minutes } from gtl_ballot_late) and eligible only on a locked-in row; removed (a removed member is listed
--   only while they have a submitted ballot or an opt-out for that week and market: nothing they entered is hidden, D-23).
-- A null season and week read the newest published week; an unknown week or game gives no games. Non-members are refused
-- (GTL_COMMUNITY_MEMBER) and a bad mode or a season without a week is GTL_COMMUNITY_INVALID; both are mapped in
-- cloud/community.mjs today, so the SQL raises no new error code.
--
-- Read by POST /community/picks (cloud/community.mjs), which checks every field, passes its own clock as `now`, and applies the
-- same gate a second time to whatever comes back. Apply after M-01 (it calls M-01's gtl_guess_locked_in, gtl_markets_visible
-- and gtl_ballot_late; build plan section 5 rule 3). Rerunnable: create or replace with this exact argument list, and the
-- grants are restated. Rollback: none needed (it replaces no function); the off switch is gtl-api's GTL_FEATURE_OFF=picks,
-- which refuses the route without a database change, or revoking the service role's execute grant on this one function.

create or replace function public.gtl_read_guess_picks(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text,p_target uuid,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_season integer:=p_season; v_week integer:=p_week; v_signature jsonb; v_market text; v_gate jsonb; result jsonb;
  now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or (p_season is null)<>(p_week is null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if v_season is null then
    select z.season,z.week into v_season,v_week from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
  end if;
  select z.signature into v_signature from public.gtl_weekly_slates z where z.season=v_season and z.week=v_week;
  v_market:=case when p_mode='guess_spread' then 'spread' else 'total' end;
  -- D-39: this viewer's gate for every game and market of the week (kickoff, own lock-in, own sit-out), as History reads it.
  v_gate:=public.gtl_markets_visible(p_user,v_season,v_week,now_at);
  with game as (
    select x->>'id' game_id,to_timestamp((x->>'kickoff')::numeric) kickoff
    from jsonb_array_elements(case when jsonb_typeof(v_signature->'games')='array' then v_signature->'games' else '[]'::jsonb end) x
    where p_game is null or x->>'id'=p_game
  ), member as (
    -- Every community member; a removed member only while they have an entry for this week and market (D-23 hides none).
    select p.user_id,p.display_name,exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id) removed
    from public.gtl_profiles p
  ), listed as (
    select m.* from member m where not m.removed
      or exists(select 1 from public.gtl_weekly_ballots x where x.user_id=m.user_id and x.season=v_season and x.week=v_week and x.mode=p_mode
        and coalesce(x.ballot->>'submittedAt','')<>'')
      or exists(select 1 from public.gtl_weekly_optouts o where o.user_id=m.user_id and o.season=v_season and o.week=v_week and o.mode=p_mode)
  ), ballot as (
    select b.user_id,b.ballot,b.audit,coalesce(b.ballot->>'submittedAt','')<>'' submitted,
      public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice) eligible
    from public.gtl_weekly_ballots b where b.season=v_season and b.week=v_week and b.mode=p_mode
  ), score as (
    -- The single scoring path (the standings and History read the same rows): submitted eligible ballots only, and only once
    -- a listed game has kicked off (before that no score is shown, so no line at a guess is looked up).
    select b.user_id,ps.game_id,ps.guess,ps.reference,ps.points
    from ballot b cross join lateral public.gtl_ballot_pick_scores(v_season,v_week,p_mode,b.ballot,b.audit) ps
    where b.submitted and b.eligible and exists(select 1 from game g where g.kickoff<=now_at)
  ), cell as (
    select g.game_id,g.kickoff,m.user_id,m.display_name,m.removed,m.user_id=p_user own,b.ballot,coalesce(b.eligible,false) eligible,
      case when jsonb_typeof(b.ballot->'picks'->g.game_id)='number' then (b.ballot->'picks'->>g.game_id)::numeric end guess,
      public.gtl_guess_locked_in(m.user_id,v_season,v_week,p_mode,g.game_id) locked,
      exists(select 1 from public.gtl_weekly_optouts o where o.user_id=m.user_id and o.season=v_season and o.week=v_week and o.mode=p_mode) sat_out,
      coalesce((v_gate->g.game_id->>v_market)::boolean,false) open,
      sc.guess scored_guess,sc.reference,sc.points
    from game g cross join listed m
    left join ballot b on b.user_id=m.user_id
    left join score sc on sc.user_id=m.user_id and sc.game_id=g.game_id
  ), judged as (
    -- Another member's guess only while locked in and open to the viewer; the viewer's own always. The error counts from
    -- kickoff, for a scored (locked-in, eligible, line available) guess only: a draft never scores.
    select c.*,c.own or (c.locked and c.open) visible,
      case when c.locked and c.kickoff<=now_at and (c.own or c.open) and c.points is not null
        then abs(c.scored_guess-(c.reference->>'value')::numeric) end error
    from cell c
  ), ranked as (
    select j.*,
      case when j.error is not null then rank() over (partition by j.game_id,j.error is null order by j.error) end place,
      case when j.error is not null then count(*) over (partition by j.game_id,j.error) end same,
      min(j.error) over (partition by j.game_id) best
    from judged j
  )
  select jsonb_build_object('viewer',p_user,'season',v_season,'week',v_week,'mode',p_mode,'now',now_at,
    'deadline',case when v_signature is not null then to_timestamp((v_signature->>'deadline')::double precision) end,
    'games',coalesce((select jsonb_agg(jsonb_build_object('gameId',g.game_id,'kickoff',g.kickoff,'started',g.kickoff<=now_at,
        'open',coalesce((v_gate->g.game_id->>v_market)::boolean,false),
        'rows',coalesce((select jsonb_agg(jsonb_build_object('userId',r.user_id,'removed',r.removed,
            'status',case when r.locked then case when public.gtl_ballot_late(r.ballot) is not null then 'late' else 'in' end
              when r.sat_out then 'sat_out' else 'not_yet' end,
            'lockedIn',r.locked,
            'late',case when r.locked then public.gtl_ballot_late(r.ballot) end,
            'eligible',case when r.locked then r.eligible end,
            'hidden',r.locked and not r.visible,
            'pick',case when r.visible then r.guess end,
            'error',r.error,'points',case when r.error is not null then r.points end,'rank',r.place,
            'tied',coalesce(r.same>1,false),'closest',coalesce(r.error=r.best,false))
          order by r.place nulls last,r.own desc,r.display_name,r.user_id)
          from ranked r where r.game_id=g.game_id and (p_target is null or r.user_id=p_target)),'[]'::jsonb))
      order by g.kickoff,g.game_id) from game g),'[]'::jsonb))
  into result;
  return result;
end $$;

-- Service-only, like every gtl_ reader: gtl-api calls it with the service role; browsers never do.
revoke all on function public.gtl_read_guess_picks(uuid,integer,integer,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_guess_picks(uuid,integer,integer,text,text,uuid,timestamptz) to service_role;
