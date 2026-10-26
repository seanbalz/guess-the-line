-- replaces public.gtl_comment_feed md5 e2bcfcbff3a0b5d190972d63021ec8a2
--
-- M-22 league_feed (redesign build plan stage 62; D-35 social ruling, D-36, D-31 as amended by D-39, D-50, D-23). Local
-- implementation only: applying it to the hosted project is Sean's "apply M-22" (Gate M). Medium risk. Apply after M-13
-- (20261026130000_gtl_feed_kinds.sql: league_id and the result_shared kind) and M-21 (20261026131000_gtl_feed_reactions.sql:
-- gtl_feed_reactions and gtl_feed_post_visible); M-01, M-04 and M-08 are hosted.
--
-- What it adds (every function service-only):
--   * gtl_feed_league_access(user, league): a Community member, and for a private group an active member of it.
--   * gtl_feed_in_league(post kind, actor, post league, league): which posts a league's feed lists. The Community feed is
--     every Community post (league_id null). A group's feed is that group's own posts, the system posts every member shares
--     (week_published, kickoff) and the Community posts of anyone ever on its roster (D-23: a member who left keeps their posts).
--   * gtl_feed_embed(viewer, post, now): the one place a post's details are built, gated for that viewer. A ballot post's
--     picks pass one game at a time (the actor's own, or the actor's locked-in guess on a game open to the viewer: M-01's
--     gtl_guess_revealed); a shared result passes its guess and points only on the same terms (D-50: other players' per-game
--     scores follow the reveal gate); a kickoff post carries, per game, who is in (a locked-in guess, never its number) and
--     how many Virtual Units bets it has (D-36: bets are visible any time); a Bet Tracker post carries its entry id only
--     (the real slip's legs stay behind M-04's gate on /social/read). A kind this file does not know gets an empty embed: no
--     payload is ever passed through raw. Later kinds (M-15, M-17, M-25) replace this function to add theirs.
--   * gtl_read_league_feed(user, league, before_at, before_id, limit, now): one page of a league's feed, newest first, with
--     keyset paging on (created_at, id) (two posts at the same time page correctly), each post's reaction summary, its
--     newest two comments and its comment count, plus every profile's name and the group's roster.
--   * gtl_read_post_comments(user, post, before_at, before_id, limit, now): a visible post's comments, a page at a time.
--   * gtl_read_post_reactors(user, post, now): who reacted to a visible post, and with what.
--   * gtl_share_result(user, request, league, season, week, mode, game, now): posts the caller's own scored, locked-in guess
--     as a result_shared post to the Community or to one of their groups; one post per result and league, replayable.
--   * gtl_comment_feed (same arguments and reply): accepts a comment only on a post visible to the member now (a group post
--     to its members, a kickoff post from its kickoff); a replay of a saved comment still answers with its id.
--
-- No existing row is updated or deleted, no table changes, and the old readers are untouched. Off switch:
-- GTL_FEATURE_OFF=feed stops POST /league/feed, /league/comments, /league/reactors and /league/share-result before the
-- database (cloud/feature-off.mjs); the new app then shows the Community feed from /community/read, and every post and
-- comment stays (D-23). Rollback: supabase/rollback/20261026132000_gtl_league_feed.sql restores gtl_comment_feed's previous
-- body; the added functions stay (supabase/rollback/README.md: new things stay).
--
-- Rerunnable: create or replace with unchanged argument lists; grants restated. One partial index is created if missing.

create index if not exists gtl_feed_posts_league_idx on public.gtl_feed_posts(league_id,created_at desc,id desc) where league_id is not null;

create or replace function public.gtl_feed_league_access(p_user uuid,p_league text) returns boolean
language sql stable security invoker set search_path='' as $$
  select public.gtl_community_member(p_user) and (p_league is null
    or exists(select 1 from public.gtl_memberships m where m.user_id=p_user and m.league_id=p_league and m.active))
$$;

create or replace function public.gtl_feed_in_league(p_kind text,p_actor uuid,p_post_league text,p_league text) returns boolean
language sql stable security invoker set search_path='' as $$
  select case when p_league is null then p_post_league is null
    else p_post_league=p_league or (p_post_league is null and (p_kind in ('week_published','kickoff')
      or exists(select 1 from public.gtl_memberships m where m.league_id=p_league and m.user_id=p_actor))) end
$$;

create or replace function public.gtl_feed_embed(p_user uuid,p_post uuid,p_league text,p_now timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare p public.gtl_feed_posts; b public.gtl_weekly_ballots; now_at timestamptz:=coalesce(p_now,clock_timestamp()); game text; shown boolean; guess_v numeric; points_v numeric;
begin
  select * into p from public.gtl_feed_posts where id=p_post;
  if not found then return '{}'::jsonb; end if;
  if p.kind='ballot_submitted' then
    select * into b from public.gtl_weekly_ballots x where x.user_id=p.actor_id and x.season=p.season and x.week=p.week and x.mode=p.mode;
    return (select jsonb_build_object(
        'picks',coalesce(jsonb_object_agg(k.key,k.value) filter (where k.visible),'{}'::jsonb),
        'hiddenGames',coalesce(jsonb_agg(k.key order by k.key) filter (where not k.visible),'[]'::jsonb),
        'late',public.gtl_ballot_late(b.ballot))
      from (select e.key,e.value,p.actor_id=p_user or (public.gtl_guess_locked_in(p.actor_id,p.season,p.week,p.mode,e.key)
            and public.gtl_guess_revealed(p_user,p.season,p.week,p.mode,e.key,now_at)) visible
        from jsonb_each(case when jsonb_typeof(b.ballot->'picks')='object' then b.ballot->'picks' else '{}'::jsonb end) e) k);
  elsif p.kind='result_shared' then
    game:=p.payload->>'gameId';
    shown:=p.actor_id=p_user or public.gtl_guess_revealed(p_user,p.season,p.week,p.mode,game,now_at);
    if not shown then return jsonb_build_object('gameId',game,'visible',false); end if;
    select * into b from public.gtl_weekly_ballots x where x.user_id=p.actor_id and x.season=p.season and x.week=p.week and x.mode=p.mode;
    select s.guess,s.points into guess_v,points_v from public.gtl_ballot_pick_scores(p.season,p.week,p.mode,b.ballot,b.audit) s where s.game_id=game;
    return jsonb_build_object('gameId',game,'visible',true,'pick',guess_v,'points',points_v);
  elsif p.kind='kickoff' then
    return jsonb_build_object('kickoff',p.payload->'kickoff','games',coalesce((select jsonb_agg(jsonb_build_object('gameId',g.id,
        'in',coalesce((select jsonb_agg(distinct x.user_id order by x.user_id) from public.gtl_weekly_ballots x
          where x.season=p.season and x.week=p.week and public.gtl_ballot_locked_in(x.ballot,g.id)
            and public.gtl_ballot_eligible(x.user_id,x.season,x.week,x.mode,x.origin_practice)
            and (p_league is null or exists(select 1 from public.gtl_memberships m where m.league_id=p_league and m.user_id=x.user_id and m.active))),'[]'::jsonb),
        'bets',(select count(*)::int from public.gtl_virtual_units_picks v where v.season=p.season and v.week=p.week and v.game_id=g.id and v.status<>'void'
            and (p_league is null or exists(select 1 from public.gtl_memberships m where m.league_id=p_league and m.user_id=v.user_id and m.active))))
        order by g.ord)
      from (select value id,ordinality ord from jsonb_array_elements_text(case when jsonb_typeof(p.payload->'games')='array' then p.payload->'games' else '[]'::jsonb end) with ordinality) g
      where g.id ~ '^[A-Z]{2,4}-[A-Z]{2,4}$'),'[]'::jsonb));
  elsif p.kind in ('bet_posted','bet_settled') then
    return jsonb_build_object('entryId',p.payload->'entryId');
  elsif p.kind='week_published' then
    return jsonb_build_object('games',p.payload->'games','deadline',p.payload->'deadline');
  elsif p.kind='points_final' then
    return jsonb_build_object('winners',p.payload->'winners','house',p.payload->'house','max',p.payload->'max');
  end if;
  return '{}'::jsonb;
end $$;

create or replace function public.gtl_read_league_feed(p_user uuid,p_league text,p_before_at timestamptz,p_before_id uuid,p_limit integer,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_limit is null or p_limit<1 or p_limit>50 or (p_before_at is null)<>(p_before_id is null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if not public.gtl_feed_league_access(p_user,p_league) then raise exception 'GTL_LEAGUE_MEMBER'; end if;
  return jsonb_build_object(
    'viewer',p_user,'leagueId',p_league,'now',now_at,
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',x.user_id,'displayName',x.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=x.user_id)) order by x.display_name,x.user_id)
      from public.gtl_profiles x),'[]'::jsonb),
    'roster',case when p_league is null then null else coalesce((select jsonb_agg(m.user_id order by m.user_id) from public.gtl_memberships m
      where m.league_id=p_league and m.active),'[]'::jsonb) end,
    'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'leagueId',p.league_id,'createdAt',p.created_at,
        'reactions',public.gtl_feed_reaction_summary(p_user,p.id)-'postId',
        'commentCount',(select count(*)::int from public.gtl_feed_comments c where c.post_id=p.id),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from (select * from public.gtl_feed_comments c where c.post_id=p.id order by c.created_at desc,c.id desc limit 2) c),'[]'::jsonb),
        'embed',public.gtl_feed_embed(p_user,p.id,p_league,now_at)) order by p.created_at desc,p.id desc)
      from (select * from public.gtl_feed_posts f where f.created_at<=now_at
              and (p_before_at is null or (f.created_at,f.id)<(p_before_at,p_before_id))
              and public.gtl_feed_in_league(f.kind,f.actor_id,f.league_id,p_league)
            order by f.created_at desc,f.id desc limit p_limit) p),'[]'::jsonb));
end $$;

create or replace function public.gtl_read_post_comments(p_user uuid,p_post uuid,p_before_at timestamptz,p_before_id uuid,p_limit integer,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_post is null or p_limit is null or p_limit<1 or p_limit>100 or (p_before_at is null)<>(p_before_id is null)
    or not public.gtl_feed_post_visible(p_user,p_post,p_now) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  return jsonb_build_object('postId',p_post,
    'total',(select count(*)::int from public.gtl_feed_comments c where c.post_id=p_post),
    'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
      from (select * from public.gtl_feed_comments c where c.post_id=p_post and (p_before_at is null or (c.created_at,c.id)<(p_before_at,p_before_id))
            order by c.created_at desc,c.id desc limit p_limit) c),'[]'::jsonb));
end $$;

create or replace function public.gtl_read_post_reactors(p_user uuid,p_post uuid,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_post is null or not public.gtl_feed_post_visible(p_user,p_post,p_now) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  return jsonb_build_object('postId',p_post,'reactors',coalesce((select jsonb_agg(jsonb_build_object('userId',r.user_id,'reaction',r.reaction,'reactedAt',r.reacted_at)
      order by r.reacted_at desc,r.user_id) from public.gtl_feed_reactions(p_post) r),'[]'::jsonb));
end $$;

create or replace function public.gtl_share_result(p_user uuid,p_request_id uuid,p_league text,p_season integer,p_week integer,p_mode text,p_game text,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.gtl_weekly_ballots; points numeric; key text; saved uuid; now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request_id is null or p_season is null or p_week is null or p_mode is null or p_mode not in ('guess_spread','guess_total')
    or p_game is null or p_game !~ '^[A-Z]{2,4}-[A-Z]{2,4}$' then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if not public.gtl_feed_league_access(p_user,p_league) then raise exception 'GTL_LEAGUE_MEMBER'; end if;
  key:=format('result:%s:%s:%s:%s:%s:%s',p_user,coalesce(p_league,'community'),p_season,p_week,p_mode,p_game);
  select id into saved from public.gtl_feed_posts where dedupe_key=key;
  if found then return jsonb_build_object('postId',saved,'replayed',true); end if;
  select * into b from public.gtl_weekly_ballots x where x.user_id=p_user and x.season=p_season and x.week=p_week and x.mode=p_mode;
  if not found or not public.gtl_ballot_locked_in(b.ballot,p_game) or not public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice) then
    raise exception 'GTL_RESULT_UNAVAILABLE'; end if;
  select s.points into points from public.gtl_ballot_pick_scores(p_season,p_week,p_mode,b.ballot,b.audit) s where s.game_id=p_game;
  if points is null then raise exception 'GTL_RESULT_UNAVAILABLE'; end if;
  insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,league_id,payload,dedupe_key,created_at)
    values(p_user,'result_shared',p_season,p_week,p_mode,p_league,jsonb_build_object('gameId',p_game,'requestId',p_request_id),key,now_at)
    on conflict (dedupe_key) do nothing returning id into saved;
  if saved is null then select id into saved from public.gtl_feed_posts where dedupe_key=key; return jsonb_build_object('postId',saved,'replayed',true); end if;
  return jsonb_build_object('postId',saved,'replayed',false);
end $$;

-- The original D-21 body (20261009120000) with one change: the post must be visible to the member now
-- (gtl_feed_post_visible, M-21), checked after a replay so a saved comment always answers with its id.
create or replace function public.gtl_comment_feed(p_user uuid,p_request_id uuid,p_post uuid,p_body text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.gtl_feed_comments;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request_id is null or p_post is null or p_body is null or char_length(btrim(p_body)) not between 1 and 500
    or not exists(select 1 from public.gtl_feed_posts where id=p_post) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select * into saved from public.gtl_feed_comments where user_id=p_user and request_id=p_request_id;
  if found then
    if saved.post_id<>p_post or saved.body<>btrim(p_body) then raise exception 'GTL_COMMUNITY_RETRY_CONFLICT'; end if;
    return jsonb_build_object('id',saved.id,'replayed',true);
  end if;
  if not public.gtl_feed_post_visible(p_user,p_post,null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  insert into public.gtl_feed_comments(post_id,user_id,request_id,body) values(p_post,p_user,p_request_id,btrim(p_body)) returning * into saved;
  return jsonb_build_object('id',saved.id,'replayed',false);
end $$;

revoke all on function public.gtl_feed_league_access(uuid,text),public.gtl_feed_in_league(text,uuid,text,text),public.gtl_feed_embed(uuid,uuid,text,timestamptz),
  public.gtl_read_league_feed(uuid,text,timestamptz,uuid,integer,timestamptz),public.gtl_read_post_comments(uuid,uuid,timestamptz,uuid,integer,timestamptz),
  public.gtl_read_post_reactors(uuid,uuid,timestamptz),public.gtl_share_result(uuid,uuid,text,integer,integer,text,text,timestamptz),
  public.gtl_comment_feed(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.gtl_feed_league_access(uuid,text),public.gtl_feed_in_league(text,uuid,text,text),public.gtl_feed_embed(uuid,uuid,text,timestamptz),
  public.gtl_read_league_feed(uuid,text,timestamptz,uuid,integer,timestamptz),public.gtl_read_post_comments(uuid,uuid,timestamptz,uuid,integer,timestamptz),
  public.gtl_read_post_reactors(uuid,uuid,timestamptz),public.gtl_share_result(uuid,uuid,text,integer,integer,text,text,timestamptz),
  public.gtl_comment_feed(uuid,uuid,uuid,text)
  to service_role;
