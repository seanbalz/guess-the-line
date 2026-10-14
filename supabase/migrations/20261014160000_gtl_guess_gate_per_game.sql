-- M-01 guess_gate_per_game: one Guess reveal gate per game and market (redesign build plan, stage 16; D-39, D-31, D-36, D-23).
--
-- replaces public.gtl_week_revealed md5 df4def7bfa8df63c61caa2bce0820395
-- replaces public.gtl_read_community md5 390a6a1d8259aa829c74baad02c7b131
-- replaces public.gtl_read_community_history md5 d148eaf892999ced66e2330dba508f43
--
-- Sean, October 14, 2026 (D-39): "once you make a pick that game is revealed. you can change bets up until game start but you
-- cannot guess the spread or total again once youve locked in that games guess". Each game's Spread guess and Total guess is
-- locked in on its own. Locking it in opens, for that player, that game's line for that market and everyone's guesses for that
-- game and market; the game's other market and the other games stay hidden. A game's kickoff opens it for everyone (D-31).
-- A weekly sit-out (D-23), and from M-03 a skip or "See picks now" (D-36, which write the same opt-out rows), open the rest of
-- the week for that market. Unlocked guesses are drafts: their owner sees them, nobody else does.
--
-- Read paths only. What this file adds:
-- * gtl_guess_locked_in(user, season, week, mode, game): whether that player's guess for that game and market is locked in.
--   Today the old app sends a market as one submission, so a guess is locked in when it is a pick in a submitted ballot (the
--   new app's rule view model reads a sent ballot the same way: web/src/next/rules.js). M-02 (stage 18) records per-game
--   lock-ins and replaces this body; every reader below asks this function, so none of them changes with it.
-- * gtl_guess_revealed(viewer, season, week, mode, game, now): the gate. True from that game's kickoff on the published slate,
--   once the viewer's own guess for that game and market is locked in, or once the viewer sat out that market for the week.
-- * gtl_markets_visible(viewer, season, week, now): the gate for every game of a published week, { gameId: { spread, total } }.
--   Stage 21 (real slips) and stage 23 (the lines reader) read it.
-- * gtl_ballot_late(ballot): the Late marker stored on a ballot, { deadline, minutes }, or null. Nothing writes one until M-07
--   (stage 24); it is read here so the feed and History carry it from the day it is written (D-30).
-- * gtl_live_rules(): the live Guess rules (build plan section 3.4), { sentFinal: false, lateWindow: 'deadline',
--   revealAt: 'kickoff' }. cloud/live-rules.mjs carries them as `rules` on /community/read, /personal and /state, and both apps
--   follow them. revealAt is this file's field: from this apply the clock opens each game at its own kickoff, no longer the
--   whole week at the deadline, so the new app's screens (web/src/next/rules.js) match the gate below. The other two fields
--   are today's (D-16, D-24) until M-02 and M-07.
--
-- What this file replaces (same argument lists, same output fields, plus new ones):
-- * gtl_week_revealed: the whole week and market is open to the viewer: a sit-out, or every game of the slate open through
--   gtl_guess_revealed. Its deadline clause becomes each game's kickoff, which closes the deadline reveal before late picks
--   exist (M-07): after Thursday's deadline a player who has not locked in Sunday's games no longer sees Sunday's guesses.
-- * gtl_read_community: a ballot_submitted post carries another member's pick for a game only while that pick is locked in and
--   that game and market is open to the viewer. picksHidden stays a boolean and is true while any of those picks is hidden, so
--   the deployed handler, which drops every pick of a hidden post, keeps showing nothing until stage 17 reads the new
--   hiddenGames (the hidden game ids). The viewer's own posts are never redacted. Standings count kicked-off games only;
--   weekPoints is null with no submitted ballot that week and seasonPoints with none that season (a sit-out is not a zero; the
--   handler maps null to 0 until stage 17). Posts dated after now are left out. Posts and submissions carry late. Paging, the
--   members, week, optOuts and due fields are unchanged.
-- * gtl_read_community_history: per game and market. Another member's guess, line and points for a game come back only while
--   their pick is locked in and that game and market is open to the viewer; a hidden row says hidden: true and carries no
--   number, picks is null when every row is hidden, and picksHidden is true while any row is. The viewer's own guesses always
--   come back, but the line with one only once that game and market is open to them, so an unlocked draft's line stays hidden.
--   Points count from that game's kickoff, for a submitted eligible ballot only; weekPoints is null for a draft and a sit-out.
--   Each week adds gate (gtl_markets_visible) and revealed follows gtl_week_revealed; each entry adds hiddenGames and late.
--
-- What does not change: every write path, trigger, table, row and table grant; gtl_ballot_pick_scores and every stored or ruled
-- reference, so a finished week scores exactly as before (Week 5: Sean 95.8, Steven 91.4, Ben 37.6); D-23 (nothing is deleted,
-- moved or hidden from its owner); the group screens' gtl_read_weekly_state (stage 17 moves their reveal).
--
-- Function-only and rerunnable: every definition is create or replace with an unchanged argument list, and the grants are
-- restated. Rollback: supabase/rollback/20261014160000_gtl_guess_gate_per_game.sql (the three previous bodies, and a revoke
-- that stops the service role reading gtl_live_rules, so every reply carries today's rules again).

-- Today a pick in a submitted ballot is locked in. The ballot JSON is written only by the server (the writers take picks and a
-- submit flag, never other keys), and no other field is read, so a client cannot mark a guess locked in without sending it.
create or replace function public.gtl_guess_locked_in(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=p_season and b.week=p_week and b.mode=p_mode
    and coalesce(b.ballot->>'submittedAt','')<>'' and jsonb_typeof(b.ballot->'picks'->p_game)='number')
$$;

-- The gate for one game and market, for one viewer. A game that is not on that week's published slate has no kickoff to open it.
create or replace function public.gtl_guess_revealed(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text,p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(p_mode in ('guess_spread','guess_total'),false) and p_game is not null and (
    exists(select 1 from public.gtl_weekly_slates z cross join lateral jsonb_array_elements(z.signature->'games') g
      where z.season=p_season and z.week=p_week and g->>'id'=p_game
        and coalesce(p_now,clock_timestamp())>=to_timestamp((g->>'kickoff')::double precision))
    or exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=p_season and o.week=p_week and o.mode=p_mode)
    or public.gtl_guess_locked_in(p_user,p_season,p_week,p_mode,p_game))
$$;

-- The gate for every game of a published week: { gameId: { spread: boolean, total: boolean } }, {} for an unknown week.
create or replace function public.gtl_markets_visible(p_user uuid,p_season integer,p_week integer,p_now timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_object_agg(g->>'id',jsonb_build_object(
      'spread',public.gtl_guess_revealed(p_user,p_season,p_week,'guess_spread',g->>'id',p_now),
      'total',public.gtl_guess_revealed(p_user,p_season,p_week,'guess_total',g->>'id',p_now)))
    from public.gtl_weekly_slates z cross join lateral jsonb_array_elements(z.signature->'games') g
    where z.season=p_season and z.week=p_week),'{}'::jsonb)
$$;

-- The stored Late marker (D-30; written from M-07): only its two known keys, never anything else from the ballot.
create or replace function public.gtl_ballot_late(p_ballot jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(p_ballot->'late')='object' and jsonb_typeof(p_ballot->'late'->'minutes')='number'
    then jsonb_build_object('deadline',p_ballot->'late'->'deadline','minutes',p_ballot->'late'->'minutes') end
$$;

-- The live Guess rules, the same for everyone (no argument, no player data). Created here because M-01 is applied before M-02
-- (filename order is apply order, Gate M step 1). Each later file copies this body, changes only its own field and keeps the
-- others: M-02 (stage 18) sets sentFinal true and M-07 (stage 24) sets lateWindow 'kickoff', both keeping revealAt 'kickoff'.
-- Were M-02 to merge first, this file would be stamped after it and copy its body with revealAt 'kickoff' and its md5 header.
create or replace function public.gtl_live_rules() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('sentFinal',false,'lateWindow','deadline','revealAt','kickoff')
$$;

-- Body of 20261009140000 rewritten per game: a sit-out opens the week; otherwise every game of the slate must be open to the
-- viewer through gtl_guess_revealed (own lock-in or kickoff). A full ballot locks in every game, so it still opens the week.
create or replace function public.gtl_week_revealed(p_user uuid,p_season integer,p_week integer,p_mode text,p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(p_mode in ('guess_spread','guess_total'),false) and (
    exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=p_season and o.week=p_week and o.mode=p_mode)
    or exists(select 1 from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week
      and not exists(select 1 from jsonb_array_elements(z.signature->'games') g
        where not public.gtl_guess_revealed(p_user,p_season,p_week,p_mode,g->>'id',p_now))))
$$;

-- Body of 20261013010000 with these changes: submissions carry late; standings sum kicked-off games only, with weekPoints null
-- without a submitted ballot that week and seasonPoints null without one that season (ordered nulls last); posts are paged first,
-- posts dated after now are left out, and a ballot_submitted post carries per game only the picks gtl_guess_locked_in and
-- gtl_guess_revealed allow, with hiddenGames and late.
create or replace function public.gtl_read_community(p_user uuid,p_before timestamptz default null,p_limit integer default 30,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; sig jsonb; deadline timestamptz; game_count integer; result jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  deadline:=to_timestamp((sig->>'deadline')::double precision);
  game_count:=coalesce(jsonb_array_length(sig->'games'),0);
  select jsonb_build_object(
    'viewer',p_user,
    -- D-22: the viewer's coming-soon league notifications and member counts per league.
    'interests',coalesce((select jsonb_agg(i.league order by i.league) from public.gtl_league_interest i where i.user_id=p_user and i.notify),'[]'),
    'interestCounts',(select jsonb_object_agg(l.league,(select count(*) from public.gtl_league_interest i
        where i.league=l.league and i.notify and public.gtl_community_member(i.user_id)) order by l.league)
      from (values('nba'),('mlb'),('nhl'),('cfb'),('cbb')) l(league)),
    'admin',public.gtl_community_admin(p_user),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'week',case when s is null then null else jsonb_build_object('season',s,'week',w,'deadline',deadline,'games',game_count) end,
    'optOuts',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(o.mode order by o.mode) from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=s and o.week=w),'[]') end,
    'due',case when s is null then '[]'::jsonb else (select jsonb_agg(jsonb_build_object('mode',m.mode,
        'submitted',coalesce(b.ballot->>'submittedAt','')<>'',
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=s and o.week=w and o.mode=m.mode),
        'filled',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}'))),0),
        'games',game_count) order by m.mode)
      from (values('guess_spread'),('guess_total')) m(mode)
      left join public.gtl_weekly_ballots b on b.user_id=p_user and b.season=s and b.week=w and b.mode=m.mode) end,
    -- Who has submitted or sat out this week, never the numbers; a submission carries its stored Late marker (D-30).
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(q.entry order by q.user_id,q.mode) from (
      select b.user_id,b.mode,jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt','satOut',false,
          'late',public.gtl_ballot_late(b.ballot)) entry
        from public.gtl_weekly_ballots b where b.season=s and b.week=w and coalesce(b.ballot->>'submittedAt','')<>''
          and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      union all
      select o.user_id,o.mode,jsonb_build_object('userId',o.user_id,'mode',o.mode,'submittedAt',null,'satOut',true,'late',null)
        from public.gtl_weekly_optouts o where o.season=s and o.week=w) q),'[]') end,
    -- Points only, never picks, from the same gtl_ballot_pick_scores rows the history shows, and only for games that have
    -- kicked off: a game's points count from its kickoff. No submitted ballot that week (or season) is null, never 0.
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks,
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=t.user_id and o.season=s and o.week=w and o.mode=t.mode))
        order by t.mode,t.season_points desc nulls last,t.user_id) from (
      select u.user_id,u.mode,
        case when coalesce(bool_or(b.week=w),false) then round(coalesce(sum(pt.points) filter (where b.week=w),0),2) end week_points,
        count(pt.points) filter (where b.week=w) week_scored,
        case when coalesce(bool_or(b.user_id is not null),false) then round(coalesce(sum(pt.points),0),2) end season_points,
        count(pt.points) season_scored,count(distinct b.week) weeks
      from (select x.user_id,x.mode from public.gtl_weekly_ballots x where x.season=s and coalesce(x.ballot->>'submittedAt','')<>''
              and public.gtl_ballot_eligible(x.user_id,x.season,x.week,x.mode,x.origin_practice)
            union select o.user_id,o.mode from public.gtl_weekly_optouts o where o.season=s) u
      left join public.gtl_weekly_ballots b on b.user_id=u.user_id and b.mode=u.mode and b.season=s and coalesce(b.ballot->>'submittedAt','')<>''
        and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      left join lateral (select ps.points from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) ps
        where ps.points is not null and ps.kickoff<=now_at) pt on true
      group by u.user_id,u.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_likes l where l.post_id=p.id),
        'likedByMe',exists(select 1 from public.gtl_feed_likes l where l.post_id=p.id and l.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id),'[]'),
        -- D-39 per game: only picks the actor locked in, for games open to the viewer; the viewer's own picks always.
        'picks',case when p.kind<>'ballot_submitted' then null
          when g.shown is null and g.hidden is not null then null else coalesce(g.shown,'{}'::jsonb) end,
        'picksHidden',p.kind='ballot_submitted' and g.hidden is not null,
        'hiddenGames',case when p.kind='ballot_submitted' then coalesce(g.hidden,'[]'::jsonb) end,
        'late',case when p.kind='ballot_submitted' then public.gtl_ballot_late(pb.ballot) end
      ) post
      from (select * from public.gtl_feed_posts f where (p_before is null or f.created_at<p_before) and f.created_at<=now_at
            order by f.created_at desc,f.id desc limit p_limit) p
      left join public.gtl_weekly_ballots pb on p.kind='ballot_submitted' and pb.user_id=p.actor_id and pb.season=p.season and pb.week=p.week and pb.mode=p.mode
      left join lateral (select jsonb_object_agg(k.key,k.value) filter (where k.visible) shown,
          jsonb_agg(k.key order by k.key) filter (where not k.visible) hidden
        from (select e.key,e.value,p.actor_id=p_user or (public.gtl_guess_locked_in(p.actor_id,p.season,p.week,p.mode,e.key)
              and public.gtl_guess_revealed(p_user,p.season,p.week,p.mode,e.key,now_at)) visible
          from jsonb_each(case when p.kind='ballot_submitted' and jsonb_typeof(pb.ballot->'picks')='object' then pb.ballot->'picks' else '{}'::jsonb end) e) k) g on true
      ) x),'[]')
  ) into result;
  return result;
end $$;

-- Body of 20261013010000 with these changes, per game and market: the gate (gtl_markets_visible) and gtl_guess_locked_in decide
-- what another member's row shows (a hidden row carries no number); the viewer's own guesses always show, and their line only
-- once that game and market is open to them; points count from kickoff for a submitted eligible ballot only; a draft's and a
-- sit-out's weekPoints are null; each week adds gate and takes revealed from gtl_week_revealed; each entry adds hiddenGames and
-- late.
create or replace function public.gtl_read_community_history(p_user uuid,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; now_at timestamptz:=coalesce(p_now,clock_timestamp()); z record; b record; o record; g jsonb; tg jsonb; ps record;
  games jsonb; results jsonb; entries jsonb; weeks jsonb:='[]'; deadline timestamptz; gate jsonb; market text;
  submitted boolean; own boolean; shown boolean; any_shown boolean; hidden jsonb; scope text; picks jsonb; pts numeric;
  week_points numeric; week_scored integer; eligible boolean; ruled boolean; eligibility text;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  s:=p_season;
  if s is null then select max(season) into s from public.gtl_weekly_slates; end if;
  for z in select season,week,signature from public.gtl_weekly_slates where season=s order by week desc loop
    deadline:=to_timestamp((z.signature->>'deadline')::double precision);
    -- Slate games with the full names the schedule template carries.
    games:='[]';
    for g in select x from jsonb_array_elements(z.signature->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
      tg:=public.gtl_slate_game(z.season,z.week,z.signature,g->>'id');
      games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'away',coalesce(tg->>'away',g->>'away'),'home',coalesce(tg->>'home',g->>'home'),'kickoff',to_timestamp((g->>'kickoff')::numeric)));
    end loop;
    -- Finals: the latest D-26 settlement version per game; a commissioner-reported final (gtl_reviewed_result_events) fills a
    -- game the settlement ledger has not recorded. Each is labelled.
    results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
        'observedAt',v.observed_at,'settledAt',v.settled_at,'origin','settlement') r
      from public.gtl_virtual_units_settlements v where v.season=z.season and v.week=z.week order by v.game_id,v.version desc) q),'{}');
    results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
        'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','settledAt',q.result->'reviewedAt','origin','commissioner_reported'))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=z.season and e.week=z.week order by e.game_id,e.version desc) q
      where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
    -- D-39: this viewer's gate for every game and market of the week (kickoff, own lock-in, own sit-out).
    gate:=public.gtl_markets_visible(p_user,z.season,z.week,now_at);
    entries:='[]';
    -- Every submitted ballot of every member, eligible or not, plus the viewer's own drafts. A member and market that was sat
    -- out is listed by the opt-out loop below instead (a draft saved before sitting out stays stored, D-23).
    for b in select x.* from public.gtl_weekly_ballots x where x.season=z.season and x.week=z.week
        and (coalesce(x.ballot->>'submittedAt','')<>'' or (x.user_id=p_user and coalesce(x.ballot->'picks','{}'::jsonb)<>'{}'::jsonb))
        and not exists(select 1 from public.gtl_weekly_optouts opt where opt.user_id=x.user_id and opt.season=x.season and opt.week=x.week and opt.mode=x.mode)
        order by x.user_id,x.mode loop
      submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      own:=b.user_id=p_user;
      market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
      ruled:=exists(select 1 from public.gtl_weekly_eligibility_rulings r where r.user_id=b.user_id and r.season=b.season and r.week=b.week and r.mode=b.mode);
      eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
      eligibility:=case when ruled and eligible then 'ruled-eligible' when ruled then 'ruled-ineligible' when b.origin_practice then 'practice' else 'standard' end;
      scope:=case when jsonb_typeof(b.provenance)<>'array' then 'unknown'
        when exists(select 1 from jsonb_array_elements(b.provenance) e where e->>'import'='commissioner_ruled') then 'community-import'
        when b.provenance->-1->>'scope'='solo' then 'solo'
        when (b.provenance->-1->>'migration')::boolean then 'migrated-league'
        when b.provenance->-1 ? 'leagueId' then 'group' else 'unknown' end;
      picks:='[]'; hidden:='[]'; any_shown:=false; week_points:=0; week_scored:=0;
      for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
        shown:=coalesce((gate->ps.game_id->>market)::boolean,false);
        -- Points count from the game's kickoff, for a submitted eligible ballot only: an ineligible ballot shows its guesses and
        -- lines but never scores (D-08/D-23), and a draft never scores. Shared as totals, as on the leaderboard.
        pts:=case when eligible and submitted and ps.kickoff<=now_at then ps.points end;
        if pts is not null then week_points:=week_points+pts; week_scored:=week_scored+1; end if;
        if own then
          -- The viewer's own guess always; its line only once this game and market is open to them (a draft's stays hidden).
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',case when shown then ps.reference end,
            'points',pts,'scorable',pts is not null,'hidden',false));
          any_shown:=true;
        elsif shown and public.gtl_guess_locked_in(b.user_id,b.season,b.week,b.mode,ps.game_id) then
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',ps.reference,
            'points',pts,'scorable',pts is not null,'hidden',false));
          any_shown:=true;
        elsif shown then
          -- Open to the viewer, but this member locked in no guess for the game: nothing of theirs to show.
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',false));
        else
          hidden:=hidden||to_jsonb(ps.game_id);
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',true));
        end if;
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',b.user_id,'mode',b.mode,'status',case when submitted then 'submitted' else 'draft' end,
        'submittedAt',b.ballot->'submittedAt','submittedAtKnown',not public.gtl_submission_time_unknown(b.ballot),
        -- Own-only: the last change, the post-submission edits and the origin, null for another member's ballot.
        'updatedAt',case when own then b.ballot->'updatedAt' end,
        'revisions',case when own then (select count(*) from jsonb_array_elements(b.audit) e where e->>'type'='ballot_edited') end,
        'provenance',case when own then scope end,'scoringPolicy',b.ballot->'scoringPolicy',
        'ruling',case when jsonb_typeof(b.ballot->'ruling')='object' then jsonb_build_object('decision',b.ballot#>'{ruling,decision}','basis',b.ballot#>'{ruling,basis}') end,
        'eligible',eligible,'eligibility',eligibility,
        'picksHidden',jsonb_array_length(hidden)>0,
        'picks',case when jsonb_array_length(hidden)>0 and not any_shown then null else picks end,
        'hiddenGames',coalesce((select jsonb_agg(h order by h) from jsonb_array_elements_text(hidden) h),'[]'),
        'late',public.gtl_ballot_late(b.ballot),
        'weekPoints',case when submitted then round(week_points,2) end,'weekScored',week_scored,'games',jsonb_array_length(games)));
    end loop;
    -- Sat-out weeks (one entry per member and market; any draft saved before the opt-out is excluded above). No ballot: null.
    for o in select user_id,mode,created_at from public.gtl_weekly_optouts where season=z.season and week=z.week order by user_id,mode loop
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',o.user_id,'mode',o.mode,'status','sat_out','satOutAt',o.created_at,
        'picksHidden',false,'picks',null,'hiddenGames','[]'::jsonb,'late',null,'weekPoints',null,'weekScored',0,'games',jsonb_array_length(games)));
    end loop;
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'deadline',deadline,'closed',now_at>=deadline,
      'games',games,'results',results,
      'revealed',jsonb_build_object('guess_spread',public.gtl_week_revealed(p_user,z.season,z.week,'guess_spread',now_at),
        'guess_total',public.gtl_week_revealed(p_user,z.season,z.week,'guess_total',now_at)),
      'gate',gate,'entries',entries));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'now',now_at,
    'seasons',coalesce((select jsonb_agg(q.season order by q.season desc) from (select distinct season from public.gtl_weekly_slates) q),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'weeks',weeks);
end $$;

-- create or replace keeps existing privileges; every grant is restated, and the new functions are service-only.
revoke all on function public.gtl_guess_locked_in(uuid,integer,integer,text,text),public.gtl_guess_revealed(uuid,integer,integer,text,text,timestamptz),
  public.gtl_markets_visible(uuid,integer,integer,timestamptz),public.gtl_ballot_late(jsonb),public.gtl_live_rules(),
  public.gtl_week_revealed(uuid,integer,integer,text,timestamptz),public.gtl_read_community(uuid,timestamptz,integer,timestamptz),
  public.gtl_read_community_history(uuid,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_guess_locked_in(uuid,integer,integer,text,text),public.gtl_guess_revealed(uuid,integer,integer,text,text,timestamptz),
  public.gtl_markets_visible(uuid,integer,integer,timestamptz),public.gtl_ballot_late(jsonb),public.gtl_live_rules(),
  public.gtl_week_revealed(uuid,integer,integer,text,timestamptz),public.gtl_read_community(uuid,timestamptz,integer,timestamptz),
  public.gtl_read_community_history(uuid,integer,timestamptz)
  to service_role;
