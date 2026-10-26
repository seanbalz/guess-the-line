-- replaces public.gtl_like_feed md5 131d6fb07631ed05dc1904c259ac13fc
-- replaces public.gtl_read_community md5 ea70a00b6f2b8467165fc8b01bbcf1a5
--
-- M-21 feed_reactions (redesign build plan stage 61; D-35 social ruling: emoji reactions; D-23: nothing deleted, moved or
-- hidden). Local implementation only: applying it to the hosted project is Sean's "apply M-21" (Gate M). Medium risk, fix
-- forward (Gate M step 9): no rollback file, listed in FIX_FORWARD (tests/migrations.mjs). Apply after M-13
-- (20261026130000_gtl_feed_kinds.sql: the gtl_read_community body below reads gtl_feed_posts.league_id) and M-01 (hosted).
-- The ledger's M-14 dependency is gone: D-39 dropped stage 49 and the tester list.
--
-- What it does:
--   1. gtl_feed_reaction_events: append-only. One row per change a person makes to their reaction on a post: one of six
--      fixed keys (thumbs_up, fire, laughing, grimace, bullseye, clap; the prototype's D-35 set) or null for "no reaction".
--      Each person's latest event (by seq) is their current reaction. Service role may select and insert; nothing may
--      update or delete.
--   2. gtl_feed_reactions(post): every current reaction on a post, one per person. A like in the old gtl_feed_likes table
--      reads as a thumbs up until that person's first event on that post; every like row stays where it is.
--   3. gtl_react_feed: sets the caller's reaction on a post visible to them now (a key, or null to take it back), adding
--      an event only when it changes. Returns the post's reaction summary.
--   4. gtl_like_feed (same arguments and reply): the old app's heart. A like adds a thumbs_up event when the caller has no
--      reaction; an unlike adds a null event instead of deleting the like row; any current reaction reads as a like.
--   5. gtl_read_community (same arguments and reply, M-07's body): `likes` counts the current reactions and `likedByMe`
--      says the viewer has one, so a fire from the new app is a heart in the old one. It also lists Community posts only
--      (league_id is null): a post scoped to a private group (M-22's group result shares, M-25's group recaps) never
--      reaches the whole Community (RULES.md: group standings stay private). Nothing else in the body changes.
--
-- No existing row is updated or deleted; the delete grant on gtl_feed_likes is revoked, so no path deletes a like again.
-- Off switch: GTL_FEATURE_OFF=reactions stops POST /league/react before the database (cloud/feature-off.mjs); the old
-- heart keeps working, and every event written stays (D-23).
--
-- Rerunnable: the table and index are created if missing, functions are create or replace with unchanged argument lists,
-- and grants are restated.

create table if not exists public.gtl_feed_reaction_events (
  seq bigint generated always as identity primary key,
  post_id uuid not null references public.gtl_feed_posts(id) on delete cascade,
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  reaction text check (reaction is null or reaction in ('thumbs_up','fire','laughing','grimace','bullseye','clap')),
  source text not null check (source in ('react','like')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_feed_reaction_events_post_idx on public.gtl_feed_reaction_events(post_id,user_id,seq desc);
alter table public.gtl_feed_reaction_events enable row level security;
revoke all on public.gtl_feed_reaction_events from public,anon,authenticated,service_role;
grant select,insert on public.gtl_feed_reaction_events to service_role;
revoke delete on public.gtl_feed_likes from service_role;

-- Every current reaction on one post, one per person: their latest event, or a thumbs up for a like row they have not
-- changed since. A null latest event means no reaction.
create or replace function public.gtl_feed_reactions(p_post uuid)
returns table(user_id uuid, reaction text, reacted_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select c.user_id,c.reaction,c.at from (
    select distinct on (x.user_id) x.user_id,x.reaction,x.at
    from (select e.user_id,e.reaction,e.created_at at,e.seq from public.gtl_feed_reaction_events e where e.post_id=p_post
          union all
          select l.user_id,'thumbs_up',l.created_at,0 from public.gtl_feed_likes l where l.post_id=p_post) x
    order by x.user_id,x.seq desc) c
  where c.reaction is not null
$$;

-- A post the member may see and answer now: it exists, its time has come (a kickoff post is dated at its kickoff), and it
-- is a Community post or one scoped to a league the member belongs to.
create or replace function public.gtl_feed_post_visible(p_user uuid,p_post uuid,p_now timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_feed_posts p where p.id=p_post and p.created_at<=coalesce(p_now,clock_timestamp())
    and (p.league_id is null or exists(select 1 from public.gtl_memberships m where m.user_id=p_user and m.league_id=p.league_id and m.active)))
$$;

-- The summary a reaction write returns: counts per key, the caller's own and the total.
create or replace function public.gtl_feed_reaction_summary(p_user uuid,p_post uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('postId',p_post,
    'counts',coalesce((select jsonb_object_agg(k.reaction,k.n order by k.reaction) from (select r.reaction,count(*)::int n from public.gtl_feed_reactions(p_post) r group by r.reaction) k),'{}'::jsonb),
    'total',(select count(*)::int from public.gtl_feed_reactions(p_post)),
    'mine',(select r.reaction from public.gtl_feed_reactions(p_post) r where r.user_id=p_user))
$$;

create or replace function public.gtl_react_feed(p_user uuid,p_post uuid,p_reaction text,p_now timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_reaction text;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_post is null or (p_reaction is not null and p_reaction not in ('thumbs_up','fire','laughing','grimace','bullseye','clap'))
    or not public.gtl_feed_post_visible(p_user,p_post,p_now) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select r.reaction into current_reaction from public.gtl_feed_reactions(p_post) r where r.user_id=p_user;
  if current_reaction is distinct from p_reaction then
    insert into public.gtl_feed_reaction_events(post_id,user_id,reaction,source) values(p_post,p_user,p_reaction,'react');
  end if;
  return public.gtl_feed_reaction_summary(p_user,p_post)||jsonb_build_object('changed',current_reaction is distinct from p_reaction);
end $$;

create or replace function public.gtl_like_feed(p_user uuid,p_post uuid,p_like boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_reaction text;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_post is null or p_like is null or not public.gtl_feed_post_visible(p_user,p_post,null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select r.reaction into current_reaction from public.gtl_feed_reactions(p_post) r where r.user_id=p_user;
  if p_like and current_reaction is null then
    insert into public.gtl_feed_reaction_events(post_id,user_id,reaction,source) values(p_post,p_user,'thumbs_up','like');
  elsif not p_like and current_reaction is not null then
    insert into public.gtl_feed_reaction_events(post_id,user_id,reaction,source) values(p_post,p_user,null,'like');
  end if;
  return jsonb_build_object('likes',(select count(*) from public.gtl_feed_reactions(p_post)),
    'likedByMe',exists(select 1 from public.gtl_feed_reactions(p_post) r where r.user_id=p_user));
end $$;

-- M-07's body (20261015190710_gtl_guess_write_window.sql) with three changes: likes and likedByMe read gtl_feed_reactions,
-- and the posts page lists Community posts only (f.league_id is null).
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
        'locked',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}')) k where public.gtl_ballot_locked_in(b.ballot,k)),0),
        'filled',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}'))),0),
        'games',game_count,'openGames',(select count(*) from jsonb_array_elements(sig->'games') g where public.gtl_guess_game_open(s,w,g->>'id',now_at) and not public.gtl_ballot_locked_in(b.ballot,g->>'id')),'nextKickoff',(select min(to_timestamp((g->>'kickoff')::numeric)) from jsonb_array_elements(sig->'games') g where public.gtl_guess_game_open(s,w,g->>'id',now_at) and not public.gtl_ballot_locked_in(b.ballot,g->>'id'))) order by m.mode)
      from (values('guess_spread'),('guess_total')) m(mode)
      left join public.gtl_weekly_ballots b on b.user_id=p_user and b.season=s and b.week=w and b.mode=m.mode) end,
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(q.entry order by q.user_id,q.mode) from (
      select b.user_id,b.mode,jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt','satOut',false,
          'late',public.gtl_ballot_late(b.ballot)) entry
        from public.gtl_weekly_ballots b where b.season=s and b.week=w and public.gtl_ballot_has_locked(b.ballot)
          and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      union all
      select o.user_id,o.mode,jsonb_build_object('userId',o.user_id,'mode',o.mode,'submittedAt',null,'satOut',true,'late',null)
        from public.gtl_weekly_optouts o where o.season=s and o.week=w) q),'[]') end,
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks,
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=t.user_id and o.season=s and o.week=w and o.mode=t.mode))
        order by t.mode,t.season_points desc nulls last,t.user_id) from (
      select u.user_id,u.mode,
        case when coalesce(bool_or(b.week=w),false) then round(sum(pt.points) filter (where b.week=w),2) end week_points,
        count(pt.points) filter (where b.week=w) week_scored,
        case when coalesce(bool_or(b.user_id is not null),false) then round(sum(pt.points),2) end season_points,
        count(pt.points) season_scored,count(distinct b.week) weeks
      from (select x.user_id,x.mode from public.gtl_weekly_ballots x where x.season=s and public.gtl_ballot_has_locked(x.ballot)
              and public.gtl_ballot_eligible(x.user_id,x.season,x.week,x.mode,x.origin_practice)
            union select o.user_id,o.mode from public.gtl_weekly_optouts o where o.season=s) u
      left join public.gtl_weekly_ballots b on b.user_id=u.user_id and b.mode=u.mode and b.season=s and public.gtl_ballot_has_locked(b.ballot)
        and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      left join lateral (select ps.points from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) ps
        where ps.points is not null and ps.kickoff<=now_at) pt on true
      group by u.user_id,u.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_reactions(p.id)),
        'likedByMe',exists(select 1 from public.gtl_feed_reactions(p.id) r where r.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id),'[]'),
        'picks',case when p.kind<>'ballot_submitted' then null
          when g.shown is null and g.hidden is not null then null else coalesce(g.shown,'{}'::jsonb) end,
        'picksHidden',p.kind='ballot_submitted' and g.hidden is not null,
        'hiddenGames',case when p.kind='ballot_submitted' then coalesce(g.hidden,'[]'::jsonb) end,
        'late',case when p.kind='ballot_submitted' then public.gtl_ballot_late(pb.ballot) end
      ) post
      from (select * from public.gtl_feed_posts f where f.league_id is null and (p_before is null or f.created_at<p_before) and f.created_at<=now_at
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

revoke all on function public.gtl_feed_reactions(uuid),public.gtl_feed_post_visible(uuid,uuid,timestamptz),public.gtl_feed_reaction_summary(uuid,uuid),
  public.gtl_react_feed(uuid,uuid,text,timestamptz),public.gtl_like_feed(uuid,uuid,boolean),public.gtl_read_community(uuid,timestamptz,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_feed_reactions(uuid),public.gtl_feed_post_visible(uuid,uuid,timestamptz),public.gtl_feed_reaction_summary(uuid,uuid),
  public.gtl_react_feed(uuid,uuid,text,timestamptz),public.gtl_like_feed(uuid,uuid,boolean),public.gtl_read_community(uuid,timestamptz,integer,timestamptz)
  to service_role;
