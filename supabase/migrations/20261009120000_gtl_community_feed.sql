-- D-21: one community of every profile, an activity feed with likes and comments,
-- and a picks-due status. Guess picks inside feed posts stay hidden from a viewer
-- until that viewer submits the same season/week/mode ballot or the deadline passes.
create table public.gtl_community_removals (
  user_id uuid primary key references public.gtl_profiles(user_id) on delete cascade,
  removed_by uuid not null references public.gtl_profiles(user_id),
  removed_at timestamptz not null default now()
);
create table public.gtl_feed_posts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  kind text not null check(kind in ('joined','ballot_submitted','bet_posted','bet_settled','week_published')),
  season integer,
  week integer,
  mode text check(mode is null or mode in ('guess_spread','guess_total')),
  payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index gtl_feed_posts_recent_idx on public.gtl_feed_posts(created_at desc,id desc);
create table public.gtl_feed_likes (
  post_id uuid not null references public.gtl_feed_posts(id) on delete cascade,
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table public.gtl_feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.gtl_feed_posts(id) on delete cascade,
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  request_id uuid not null,
  body text not null check(char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index gtl_feed_comments_post_idx on public.gtl_feed_comments(post_id,created_at);
alter table public.gtl_community_removals enable row level security;
alter table public.gtl_feed_posts enable row level security;
alter table public.gtl_feed_likes enable row level security;
alter table public.gtl_feed_comments enable row level security;
revoke all on public.gtl_community_removals,public.gtl_feed_posts,public.gtl_feed_likes,public.gtl_feed_comments from public,anon,authenticated,service_role;
grant select,insert,delete on public.gtl_community_removals,public.gtl_feed_likes to service_role;
grant select,insert on public.gtl_feed_posts,public.gtl_feed_comments to service_role;
-- Publishing a week adds rows only; existing slates and templates are never updated.
grant select,insert on public.gtl_weekly_slates,public.gtl_schedule_templates to service_role;
grant select,update(season,week,slate_signature) on public.gtl_odds_schedule to service_role;

-- Automatic posts. Practice ballots never post; a post carries no pick values.
create function public.gtl_feed_on_profile() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.gtl_feed_posts(actor_id,kind,dedupe_key) values(new.user_id,'joined','joined:'||new.user_id) on conflict do nothing;
  return new;
end $$;
create trigger gtl_feed_on_profile after insert on public.gtl_profiles for each row execute function public.gtl_feed_on_profile();

create function public.gtl_feed_on_ballot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(new.ballot->>'submittedAt','')<>'' and not new.origin_practice
    and (tg_op='INSERT' or coalesce(old.ballot->>'submittedAt','')='') then
    insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,dedupe_key,created_at)
      values(new.user_id,'ballot_submitted',new.season,new.week,new.mode,
        format('ballot:%s:%s:%s:%s',new.user_id,new.season,new.week,new.mode),(new.ballot->>'submittedAt')::timestamptz)
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger gtl_feed_on_ballot after insert or update on public.gtl_weekly_ballots for each row execute function public.gtl_feed_on_ballot();

create function public.gtl_feed_on_social() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.action in ('create','tail','settle') then
    insert into public.gtl_feed_posts(actor_id,kind,season,week,payload,dedupe_key,created_at)
      values(new.actor_id,case when new.action='settle' then 'bet_settled' else 'bet_posted' end,new.season,new.week,
        jsonb_build_object('entryId',new.event->>'entryId','action',new.action),
        format('social:%s:%s',new.actor_id,new.request_id),new.created_at)
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger gtl_feed_on_social after insert on public.gtl_social_commits for each row execute function public.gtl_feed_on_social();

-- Profiles that existed before this migration get one backdated "joined" post each.
insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at)
  select user_id,'joined','joined:'||user_id,coalesce(updated_at,now()) from public.gtl_profiles on conflict do nothing;

create function public.gtl_community_member(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select p_user is not null and exists(select 1 from public.gtl_profiles where user_id=p_user)
    and not exists(select 1 from public.gtl_community_removals where user_id=p_user)
$$;

-- The commissioner of the founding league manages community membership.
create function public.gtl_community_admin(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_memberships where user_id=p_user and league_id='sean-troy-luke' and role='commissioner' and active)
$$;

create function public.gtl_read_community(p_user uuid,p_before timestamptz default null,p_limit integer default 30,p_now timestamptz default null)
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

create function public.gtl_like_feed(p_user uuid,p_post uuid,p_like boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_post is null or p_like is null or not exists(select 1 from public.gtl_feed_posts where id=p_post) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if p_like then insert into public.gtl_feed_likes(post_id,user_id) values(p_post,p_user) on conflict do nothing;
  else delete from public.gtl_feed_likes where post_id=p_post and user_id=p_user; end if;
  return jsonb_build_object('likes',(select count(*) from public.gtl_feed_likes where post_id=p_post),'likedByMe',p_like);
end $$;

create function public.gtl_comment_feed(p_user uuid,p_request_id uuid,p_post uuid,p_body text)
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
  insert into public.gtl_feed_comments(post_id,user_id,request_id,body) values(p_post,p_user,p_request_id,btrim(p_body)) returning * into saved;
  return jsonb_build_object('id',saved.id,'replayed',false);
end $$;

create function public.gtl_set_community_member(p_user uuid,p_target uuid,p_member boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.gtl_community_admin(p_user) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  if p_target is null or p_member is null or p_target=p_user or not exists(select 1 from public.gtl_profiles where user_id=p_target) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if p_member then delete from public.gtl_community_removals where user_id=p_target;
  else insert into public.gtl_community_removals(user_id,removed_by) values(p_target,p_user) on conflict do nothing; end if;
  insert into public.gtl_access_audit(actor_id,event) values(p_user,(case when p_member then 'community_restore:' else 'community_remove:' end)||p_target);
  return jsonb_build_object('userId',p_target,'member',p_member);
end $$;

-- Commissioner-reviewed weekly slate. Writes the same signature shape as
-- gtl_weekly_slate() and a schedule template, so personal ballots work for every
-- member without a league. Republishing identical games is a no-op; a different
-- slate for an existing week fails closed.
create function public.gtl_publish_week(p_user uuid,p_season integer,p_week integer,p_games jsonb,p_deadline timestamptz,p_source text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sig jsonb; existing jsonb; template_id text;
begin
  if not public.gtl_community_admin(p_user) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  if p_season is null or p_season not between 2000 and 2200 or p_week is null or p_week not between 1 and 25 or p_deadline is null
    or p_source is null or char_length(p_source) not between 1 and 500 or jsonb_typeof(p_games) is distinct from 'array'
    or jsonb_array_length(p_games) not between 1 and 16 then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_games) g where jsonb_typeof(g) is distinct from 'object'
      or coalesce(g->>'id','') !~ '^[A-Z]{2,3}-[A-Z]{2,3}$' or g->>'id'<>(g->>'awayCode')||'-'||(g->>'homeCode')
      or coalesce(g->>'away','')='' or coalesce(g->>'home','')='' or coalesce(g->>'matchup','')<>(g->>'away')||' @ '||(g->>'home')
      or g->>'kickoff' is null or (g->>'kickoff')::timestamptz<p_deadline)
    or (select count(*)<>count(distinct g->>'id') from jsonb_array_elements(p_games) g)
    or not exists(select 1 from jsonb_array_elements(p_games) g where (g->>'kickoff')::timestamptz=p_deadline) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  sig:=jsonb_build_object('season',p_season,'week',p_week,'deadline',extract(epoch from p_deadline),
    'games',(select jsonb_agg(jsonb_build_object('id',g->>'id','away',g->>'awayCode','home',g->>'homeCode',
      'kickoff',extract(epoch from (g->>'kickoff')::timestamptz)) order by g->>'id') from jsonb_array_elements(p_games) g));
  select signature into existing from public.gtl_weekly_slates where season=p_season and week=p_week;
  if existing is not null then
    if existing<>sig then raise exception 'GTL_SLATE_CONFLICT'; end if;
    return jsonb_build_object('season',p_season,'week',p_week,'games',jsonb_array_length(p_games),'published',false);
  end if;
  insert into public.gtl_weekly_slates(season,week,signature) values(p_season,p_week,sig);
  template_id:=format('nfl-%s-week-%s',p_season,lpad(p_week::text,2,'0'));
  insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source)
    values(template_id,p_season,p_week,(select jsonb_agg(jsonb_build_object('id',g->>'id','away',g->>'away','home',g->>'home',
      'awayCode',g->>'awayCode','homeCode',g->>'homeCode','matchup',g->>'matchup','kickoff',g->>'kickoff') order by (g->>'kickoff')::timestamptz,g->>'id')
      from jsonb_array_elements(p_games) g),p_deadline,p_source);
  insert into public.gtl_feed_posts(actor_id,kind,season,week,payload,dedupe_key)
    values(p_user,'week_published',p_season,p_week,jsonb_build_object('games',jsonb_array_length(p_games),'deadline',p_deadline),
      format('week:%s:%s',p_season,p_week));
  -- The twelve-hour collector follows the newest published week; its enabled flag is unchanged.
  update public.gtl_odds_schedule set season=p_season,week=p_week,slate_signature=sig
    where id='nfl-12h' and (season,week)<(p_season,p_week);
  insert into public.gtl_access_audit(actor_id,event) values(p_user,format('publish_week:%s:%s',p_season,p_week));
  return jsonb_build_object('season',p_season,'week',p_week,'games',jsonb_array_length(p_games),'published',true);
end $$;

revoke all on function public.gtl_feed_on_profile(),public.gtl_feed_on_ballot(),public.gtl_feed_on_social(),
  public.gtl_community_member(uuid),public.gtl_community_admin(uuid),public.gtl_read_community(uuid,timestamptz,integer,timestamptz),
  public.gtl_like_feed(uuid,uuid,boolean),public.gtl_comment_feed(uuid,uuid,uuid,text),public.gtl_set_community_member(uuid,uuid,boolean),
  public.gtl_publish_week(uuid,integer,integer,jsonb,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.gtl_community_member(uuid),public.gtl_community_admin(uuid),public.gtl_read_community(uuid,timestamptz,integer,timestamptz),
  public.gtl_like_feed(uuid,uuid,boolean),public.gtl_comment_feed(uuid,uuid,uuid,text),public.gtl_set_community_member(uuid,uuid,boolean),
  public.gtl_publish_week(uuid,integer,integer,jsonb,timestamptz,text)
  to service_role;
