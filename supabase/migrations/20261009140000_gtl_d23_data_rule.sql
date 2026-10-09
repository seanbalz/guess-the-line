-- D-23: user-entered data is never deleted, moved or hidden. Commissioner removal
-- only blocks the removed account from the community; its posts, comments, ballots,
-- standings and member entry stay visible to everyone. The single visibility
-- exception is the Guess pick reveal gate: a viewer sees other players' picks for a
-- season/week/mode after submitting their own full ballot, after a final weekly
-- opt-out ("Sit out this week") for that mode, or once the deadline passes.
create table public.gtl_weekly_optouts (
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  season integer not null, week integer not null,
  mode text not null check(mode in ('guess_spread','guess_total')),
  created_at timestamptz not null default now(),
  primary key(user_id,season,week,mode),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_weekly_optouts_slate_idx on public.gtl_weekly_optouts(season,week);
alter table public.gtl_weekly_optouts enable row level security;
revoke all on public.gtl_weekly_optouts from public,anon,authenticated,service_role;
-- No update or delete: an opt-out is final.
grant select,insert on public.gtl_weekly_optouts to service_role;

-- The reveal gate shared by the community feed and the group game screens.
create function public.gtl_week_revealed(p_user uuid,p_season integer,p_week integer,p_mode text,p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_ballots v where v.user_id=p_user and v.season=p_season and v.week=p_week and v.mode=p_mode and coalesce(v.ballot->>'submittedAt','')<>'')
    or exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=p_season and o.week=p_week and o.mode=p_mode)
    or exists(select 1 from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week and coalesce(p_now,clock_timestamp())>=to_timestamp((z.signature->>'deadline')::double precision))
$$;

-- Sitting out forfeits that mode's week: no draft or submission may follow it.
create function public.gtl_guard_optout_ballot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.gtl_weekly_optouts o where o.user_id=new.user_id and o.season=new.season and o.week=new.week and o.mode=new.mode) then
    raise exception 'GTL_COMMUNITY_SAT_OUT';
  end if;
  return new;
end $$;
create trigger gtl_optout_ballot_guard before insert or update on public.gtl_weekly_ballots
  for each row execute function public.gtl_guard_optout_ballot();

create function public.gtl_sit_out_week(p_user uuid,p_season integer,p_week integer,p_mode text,p_now timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); inserted boolean;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_mode is null or p_mode not in ('guess_spread','guess_total') then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if now_at>=to_timestamp((sig->>'deadline')::double precision) then raise exception 'GTL_COMMUNITY_CLOSED'; end if;
  if exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=p_season and b.week=p_week and b.mode=p_mode and coalesce(b.ballot->>'submittedAt','')<>'') then
    raise exception 'GTL_COMMUNITY_INVALID';
  end if;
  insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at) values(p_user,p_season,p_week,p_mode,now_at) on conflict do nothing;
  inserted:=found;
  if inserted then insert into public.gtl_access_audit(actor_id,event) values(p_user,format('sit_out:%s:%s:%s',p_season,p_week,p_mode)); end if;
  return jsonb_build_object('season',p_season,'week',p_week,'mode',p_mode,'satOut',true,'replayed',not inserted);
end $$;

-- Same signature and every field as the D-21 reader plus D-22's interests and
-- interestCounts (20261009130000). Removed members hide nothing; opt-outs satisfy
-- the picks gate, clear that mode's picks-due entry and mark standings as sat out.
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
    -- Who has submitted or sat out this week, never the numbers.
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(q.entry order by q.user_id,q.mode) from (
      select b.user_id,b.mode,jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt','satOut',false) entry
        from public.gtl_weekly_ballots b where b.season=s and b.week=w and coalesce(b.ballot->>'submittedAt','')<>'' and not b.origin_practice
      union all
      select o.user_id,o.mode,jsonb_build_object('userId',o.user_id,'mode',o.mode,'submittedAt',null,'satOut',true)
        from public.gtl_weekly_optouts o where o.season=s and o.week=w) q),'[]') end,
    -- Points only, never picks: each scored pick is fixed at save (D-16), so totals are safe to share.
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks,
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=t.user_id and o.season=s and o.week=w and o.mode=t.mode))
        order by t.mode,t.season_points desc,t.user_id) from (
      select u.user_id,u.mode,
        round(coalesce(sum(pt.points) filter (where b.week=w),0),2) week_points,count(pt.points) filter (where b.week=w) week_scored,
        round(coalesce(sum(pt.points),0),2) season_points,count(pt.points) season_scored,count(distinct b.week) weeks
      from (select x.user_id,x.mode from public.gtl_weekly_ballots x where x.season=s and coalesce(x.ballot->>'submittedAt','')<>'' and not x.origin_practice
            union select o.user_id,o.mode from public.gtl_weekly_optouts o where o.season=s) u
      left join public.gtl_weekly_ballots b on b.user_id=u.user_id and b.mode=u.mode and b.season=s and coalesce(b.ballot->>'submittedAt','')<>'' and not b.origin_practice
      left join lateral (select greatest(0,10-2*abs((e.value)::numeric-(b.ballot#>>array['scoringReferences',e.key,'value'])::numeric)) points
        from jsonb_each(coalesce(b.ballot->'picks','{}')) e
        where jsonb_typeof(e.value)='number' and jsonb_typeof(b.ballot#>array['scoringReferences',e.key,'value'])='number') pt on true
      group by u.user_id,u.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_likes l where l.post_id=p.id),
        'likedByMe',exists(select 1 from public.gtl_feed_likes l where l.post_id=p.id and l.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id),'[]'),
        'picks',case when p.kind<>'ballot_submitted' then null
          when p.actor_id=p_user or public.gtl_week_revealed(p_user,p.season,p.week,p.mode,now_at)
          then (select b.ballot->'picks' from public.gtl_weekly_ballots b where b.user_id=p.actor_id and b.season=p.season and b.week=p.week and b.mode=p.mode)
          else null end,
        'picksHidden',p.kind='ballot_submitted' and p.actor_id<>p_user and not public.gtl_week_revealed(p_user,p.season,p.week,p.mode,now_at)
      ) post
      from public.gtl_feed_posts p
      where p_before is null or p.created_at<p_before
      order by p.created_at desc,p.id desc limit p_limit) x),'[]')
  ) into result;
  return result;
end $$;

-- Group game screens read opt-outs with the weekly state so the engine's reveal
-- gate honors them. Body copied from the D-16 reader; only optOuts is added.
create or replace function public.gtl_read_weekly_state(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; result jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  -- One statement snapshot keeps revision, ballot, and selection reads coherent.
  with members as (select user_id,player_id from public.gtl_memberships where league_id=p_league and active and exists(select 1 from jsonb_array_elements(c#>'{state,league,roster}') r where r->>'id'=player_id)),
  bs as (select m.player_id,b.* from members m join public.gtl_weekly_ballots b on b.user_id=m.user_id and b.season=s and b.week=w),
  xs as (select m.player_id,x.* from members m join public.gtl_weekly_selections x on x.user_id=m.user_id and x.season=s and x.week=w),
  rs as (select m.player_id,r.* from members m join public.gtl_weekly_eligibility_rulings r on r.user_id=m.user_id and r.season=s and r.week=w),
  os as (select m.player_id,jsonb_agg(o.mode order by o.mode) modes from members m join public.gtl_weekly_optouts o on o.user_id=m.user_id and o.season=s and o.week=w group by m.player_id),
  ba as (select player_id,jsonb_object_agg(mode,case when user_id=p_user then ballot else jsonb_build_object('picks',ballot->'picks','submittedAt',ballot->'submittedAt','updatedAt',ballot->'updatedAt','scoringPolicy',ballot->'scoringPolicy','scoringReferences',ballot->'scoringReferences') end) value from bs group by player_id),
  xa as (select player_id,jsonb_object_agg(game_id,selection) value from xs group by player_id),
  events as (select e from bs cross join lateral jsonb_array_elements(audit) e where user_id=p_user union all select e from xs cross join lateral jsonb_array_elements(audit) e where user_id=p_user)
  select jsonb_build_object('state',
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(c->'state','{ballots}',coalesce((select jsonb_object_agg(player_id,value) from ba),'{}')),
    '{bets}',coalesce((select jsonb_object_agg(player_id,value) from xa),'{}')),
    '{audit}',coalesce((select jsonb_agg(e||jsonb_build_object('player',c->>'playerId') order by e->>'timestamp',e->>'id') from events),'[]')),
    '{optOuts}',coalesce((select jsonb_object_agg(player_id,modes) from os),'{}')),
    '{league,roster}',coalesce((select jsonb_agg(r order by n) from jsonb_array_elements(c#>'{state,league,roster}') with ordinality q(r,n) where exists(select 1 from members where player_id=r->>'id') or not exists(select 1 from public.gtl_memberships where league_id=p_league and player_id=r->>'id')),'[]')),
    'revision',coalesce((select revision from public.gtl_weekly_versions where user_id=p_user and season=s and week=w),0),
    'leagueRevision',c->'leagueRevision',
    'ownEligibilityRulings',coalesce((select jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) from rs where user_id=p_user),'{}'),
    'eligibilityRulings',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) value from rs group by player_id) q),'{}'),
    'originPractice',coalesce((select jsonb_object_agg(mode,origin_practice) from bs where user_id=p_user),'{}'),
    'selectionPractice',coalesce((select bool_or(origin_practice) from xs where user_id=p_user),false),
    'selectionEligibility',coalesce((select jsonb_object_agg(player_id,eligible) from (select player_id,not bool_or(origin_practice) eligible from xs group by player_id) q),'{}'),
    'eligibility',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,coalesce((select eligible from rs where rs.player_id=bs.player_id and rs.mode=bs.mode),not origin_practice)) value from bs group by player_id) q),'{}')) into result;
  return result;
end $$;

revoke all on function public.gtl_week_revealed(uuid,integer,integer,text,timestamptz),public.gtl_guard_optout_ballot(),
  public.gtl_sit_out_week(uuid,integer,integer,text,timestamptz),public.gtl_read_community(uuid,timestamptz,integer,timestamptz),
  public.gtl_read_weekly_state(uuid,text) from public,anon,authenticated;
grant execute on function public.gtl_week_revealed(uuid,integer,integer,text,timestamptz),public.gtl_sit_out_week(uuid,integer,integer,text,timestamptz),
  public.gtl_read_community(uuid,timestamptz,integer,timestamptz),public.gtl_read_weekly_state(uuid,text) to service_role;
