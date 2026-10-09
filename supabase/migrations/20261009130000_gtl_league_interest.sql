-- D-22: other leagues are "Coming soon"; NFL is the only live league. Members can ask
-- to be notified when a league opens. Interest is account-level; counts are shared.
-- No games, picks, schedules or odds exist for these leagues.
create table public.gtl_league_interest (
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  league text not null check(league in ('nba','mlb','nhl','cfb','cbb')),
  notify boolean not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,league)
);
alter table public.gtl_league_interest enable row level security;
revoke all on public.gtl_league_interest from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.gtl_league_interest to service_role;

create function public.gtl_set_league_interest(p_user uuid,p_league text,p_notify boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_league is null or p_notify is null or p_league not in ('nba','mlb','nhl','cfb','cbb') then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  insert into public.gtl_league_interest(user_id,league,notify,updated_at) values(p_user,p_league,p_notify,now())
    on conflict(user_id,league) do update set notify=excluded.notify,updated_at=excluded.updated_at
    where public.gtl_league_interest.notify is distinct from excluded.notify;
  return jsonb_build_object('league',p_league,'notify',p_notify,
    'count',(select count(*) from public.gtl_league_interest i where i.league=p_league and i.notify and public.gtl_community_member(i.user_id)));
end $$;

-- Same signature and every existing field as 20261009120000; adds 'interests' and 'interestCounts'.
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
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name) order by p.display_name,p.user_id)
      from public.gtl_profiles p where not exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)),'[]'),
    'week',case when s is null then null else jsonb_build_object('season',s,'week',w,'deadline',deadline,'games',game_count) end,
    'due',case when s is null then '[]'::jsonb else (select jsonb_agg(jsonb_build_object('mode',m.mode,
        'submitted',coalesce(b.ballot->>'submittedAt','')<>'',
        'filled',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}'))),0),
        'games',game_count) order by m.mode)
      from (values('guess_spread'),('guess_total')) m(mode)
      left join public.gtl_weekly_ballots b on b.user_id=p_user and b.season=s and b.week=w and b.mode=m.mode) end,
    -- Who has submitted this week, never the numbers.
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt') order by b.user_id,b.mode)
      from public.gtl_weekly_ballots b where b.season=s and b.week=w and coalesce(b.ballot->>'submittedAt','')<>'' and not b.origin_practice
        and public.gtl_community_member(b.user_id)),'[]') end,
    -- Points only, never picks: each scored pick is fixed at save (D-16), so totals are safe to share.
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks)
        order by t.mode,t.season_points desc,t.user_id) from (
      select b.user_id,b.mode,
        round(coalesce(sum(pt.points) filter (where b.week=w),0),2) week_points,count(pt.points) filter (where b.week=w) week_scored,
        round(coalesce(sum(pt.points),0),2) season_points,count(pt.points) season_scored,count(distinct b.week) weeks
      from public.gtl_weekly_ballots b
      left join lateral (select greatest(0,10-2*abs((e.value)::numeric-(b.ballot#>>array['scoringReferences',e.key,'value'])::numeric)) points
        from jsonb_each(coalesce(b.ballot->'picks','{}')) e
        where jsonb_typeof(e.value)='number' and jsonb_typeof(b.ballot#>array['scoringReferences',e.key,'value'])='number') pt on true
      where b.season=s and coalesce(b.ballot->>'submittedAt','')<>'' and not b.origin_practice and public.gtl_community_member(b.user_id)
      group by b.user_id,b.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_likes l where l.post_id=p.id),
        'likedByMe',exists(select 1 from public.gtl_feed_likes l where l.post_id=p.id and l.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id and public.gtl_community_member(c.user_id)),'[]'),
        'picks',case when p.kind<>'ballot_submitted' then null
          when p.actor_id=p_user
            or exists(select 1 from public.gtl_weekly_ballots v where v.user_id=p_user and v.season=p.season and v.week=p.week and v.mode=p.mode and coalesce(v.ballot->>'submittedAt','')<>'')
            or exists(select 1 from public.gtl_weekly_slates z where z.season=p.season and z.week=p.week and now_at>=to_timestamp((z.signature->>'deadline')::double precision))
          then (select b.ballot->'picks' from public.gtl_weekly_ballots b where b.user_id=p.actor_id and b.season=p.season and b.week=p.week and b.mode=p.mode)
          else null end,
        'picksHidden',p.kind='ballot_submitted' and p.actor_id<>p_user
          and not exists(select 1 from public.gtl_weekly_ballots v where v.user_id=p_user and v.season=p.season and v.week=p.week and v.mode=p.mode and coalesce(v.ballot->>'submittedAt','')<>'')
          and not exists(select 1 from public.gtl_weekly_slates z where z.season=p.season and z.week=p.week and now_at>=to_timestamp((z.signature->>'deadline')::double precision))
      ) post
      from public.gtl_feed_posts p
      where public.gtl_community_member(p.actor_id) and (p_before is null or p.created_at<p_before)
      order by p.created_at desc,p.id desc limit p_limit) x),'[]')
  ) into result;
  return result;
end $$;

revoke all on function public.gtl_set_league_interest(uuid,text,boolean),public.gtl_read_community(uuid,timestamptz,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_set_league_interest(uuid,text,boolean),public.gtl_read_community(uuid,timestamptz,integer,timestamptz) to service_role;
