-- Shared, explicitly posted bets only. Existing private journals, ballots, groups,
-- and selections are neither copied nor joined into this new social surface.
create table public.gtl_social_weeks (
  season integer not null,
  week integer not null,
  revision bigint not null default 0 check(revision between 0 and 9007199254740990),
  state jsonb not null default '{"version":1,"entries":[],"audit":[],"receipts":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(season,week),
  foreign key(season,week) references public.gtl_weekly_slates,
  check(jsonb_typeof(state)='object' and state->'version'='1'::jsonb and jsonb_typeof(state->'entries')='array'
    and jsonb_typeof(state->'audit')='array' and jsonb_typeof(state->'receipts')='array'),
  check(jsonb_array_length(state->'entries')<=2000 and jsonb_array_length(state->'audit')<=20000
    and jsonb_array_length(state->'receipts')<=20000 and octet_length(state::text)<=33554432)
);
create table public.gtl_social_commits (
  actor_id uuid not null references public.gtl_profiles(user_id),
  request_id uuid not null,
  season integer not null,
  week integer not null,
  revision bigint not null,
  action text not null check(action in ('create','tail','settle','include','correct')),
  payload jsonb not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id),
  unique(season,week,revision),
  foreign key(season,week) references public.gtl_social_weeks
);
create table public.gtl_social_follows (
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  target_user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,target_user_id),
  check(user_id<>target_user_id)
);
create table public.gtl_social_follow_receipts (
  user_id uuid not null references public.gtl_profiles(user_id),
  request_id uuid not null,
  target_user_id uuid not null references public.gtl_profiles(user_id),
  following boolean not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.gtl_social_weeks enable row level security;
alter table public.gtl_social_commits enable row level security;
alter table public.gtl_social_follows enable row level security;
alter table public.gtl_social_follow_receipts enable row level security;
revoke all on public.gtl_social_weeks,public.gtl_social_commits,public.gtl_social_follows,public.gtl_social_follow_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.gtl_social_weeks to service_role;
grant select,insert on public.gtl_social_commits,public.gtl_social_follow_receipts to service_role;
grant select,insert,delete on public.gtl_social_follows to service_role;

-- Internal service-only read. Auth is verified by the edge handler before this
-- RPC; the actor must also have a real profile. No membership or reveal gates
-- apply to deliberately shared records. Public projections happen in the handler.
create function public.gtl_read_social(p_user uuid,p_season integer default null,p_week integer default null,p_all boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; result jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_SOCIAL_PROFILE'; end if;
  if p_all is null or (p_season is null)<>(p_week is null) or (p_all and p_season is not null) then raise exception 'GTL_SOCIAL_INVALID'; end if;
  if p_season is null then select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1;
  else s:=p_season; w:=p_week; end if;
  if not exists(select 1 from public.gtl_weekly_slates where season=s and week=w) then raise exception 'GTL_SOCIAL_SLATE'; end if;
  select jsonb_build_object('season',s,'week',w,
    'weeks',coalesce((select jsonb_agg(jsonb_build_object('season',x.season,'week',x.week,'revision',coalesce(y.revision,0),
      'games',x.signature->'games','state',coalesce(y.state,'{"version":1,"entries":[],"audit":[],"receipts":[]}'::jsonb)) order by x.season,x.week)
      from public.gtl_weekly_slates x left join public.gtl_social_weeks y using(season,week) where p_all or (x.season=s and x.week=w)),'[]'),
    'availableWeeks',(select jsonb_agg(jsonb_build_object('season',season,'week',week) order by season desc,week desc) from public.gtl_weekly_slates),
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'displayName',display_name) order by display_name,user_id) from public.gtl_profiles),'[]'),
    'following',coalesce((select jsonb_agg(target_user_id order by target_user_id) from public.gtl_social_follows where user_id=p_user),'[]')) into result;
  return result;
end $$;

-- A compare-and-swap transaction serializes the whole weekly document. Exact
-- request replay is checked before stale revisions, including concurrent retries.
create function public.gtl_commit_social(p_user uuid,p_season integer,p_week integer,p_expected_revision bigint,
  p_request_id uuid,p_action text,p_body jsonb,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.gtl_social_weeks; receipt public.gtl_social_commits; old_entry jsonb; next_entry jsonb; changed integer:=0; audit_event jsonb; new_receipt jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_SOCIAL_PROFILE'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740990
    or p_action is null or p_action not in ('create','tail','settle','include','correct') or jsonb_typeof(p_body) is distinct from 'object'
    or p_body->>'requestId' is distinct from p_request_id::text then raise exception 'GTL_SOCIAL_INVALID'; end if;
  if not exists(select 1 from public.gtl_weekly_slates where season=p_season and week=p_week) then raise exception 'GTL_SOCIAL_SLATE'; end if;
  -- A per-actor lock makes the idempotency key global across weeks too.
  perform 1 from public.gtl_profiles where user_id=p_user for update;
  select * into receipt from public.gtl_social_commits where actor_id=p_user and request_id=p_request_id;
  if found then
    if receipt.season<>p_season or receipt.week<>p_week or receipt.action<>p_action or receipt.payload<>p_body then raise exception 'GTL_SOCIAL_RETRY_CONFLICT'; end if;
    return jsonb_build_object('revision',receipt.revision,'replayed',true);
  end if;
  insert into public.gtl_social_weeks(season,week) values(p_season,p_week) on conflict do nothing;
  select * into saved from public.gtl_social_weeks where season=p_season and week=p_week for update;
  if saved.revision<>p_expected_revision then raise exception 'GTL_SOCIAL_CONFLICT'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or p_state->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_state->'entries') is distinct from 'array' or jsonb_typeof(p_state->'audit') is distinct from 'array'
    or jsonb_typeof(p_state->'receipts') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(p_state) k where k not in ('version','entries','audit','receipts')) then raise exception 'GTL_SOCIAL_INVALID'; end if;
  if jsonb_array_length(p_state->'entries')>2000 or jsonb_array_length(p_state->'audit')>20000
    or jsonb_array_length(p_state->'receipts')>20000 or octet_length(p_state::text)>33554432 then raise exception 'GTL_SOCIAL_LIMIT'; end if;
  if jsonb_array_length(p_state->'entries')<jsonb_array_length(saved.state->'entries')
    or jsonb_array_length(p_state->'audit')<>jsonb_array_length(saved.state->'audit')+1
    or jsonb_array_length(p_state->'receipts')<>jsonb_array_length(saved.state->'receipts')+1 then raise exception 'GTL_SOCIAL_INVALID'; end if;
  audit_event:=p_state->'audit'->-1; new_receipt:=p_state->'receipts'->-1;
  if p_state->'audit'<>saved.state->'audit'||jsonb_build_array(audit_event)
    or p_state->'receipts'<>saved.state->'receipts'||jsonb_build_array(new_receipt)
    or audit_event->>'actorId' is distinct from p_user::text or audit_event->>'action' is distinct from p_action
    or new_receipt->>'actorId' is distinct from p_user::text or new_receipt->>'requestId' is distinct from p_request_id::text
    or new_receipt->>'action' is distinct from p_action then raise exception 'GTL_SOCIAL_INVALID'; end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_state->'entries') x) then raise exception 'GTL_SOCIAL_INVALID'; end if;
  for old_entry in select value from jsonb_array_elements(saved.state->'entries') loop
    if not exists(select 1 from jsonb_array_elements(p_state->'entries') x where x->>'id'=old_entry->>'id') then raise exception 'GTL_SOCIAL_INVALID'; end if;
  end loop;
  for next_entry in select value from jsonb_array_elements(p_state->'entries') loop
    if jsonb_typeof(next_entry) is distinct from 'object' or next_entry->>'id' is null or next_entry->>'ownerId' is null
      or next_entry->'season' is distinct from to_jsonb(p_season) or next_entry->'week' is distinct from to_jsonb(p_week)
      then raise exception 'GTL_SOCIAL_INVALID'; end if;
    select value into old_entry from jsonb_array_elements(saved.state->'entries') where value->>'id'=next_entry->>'id';
    if old_entry is distinct from next_entry then
      changed:=changed+1;
      if next_entry->>'ownerId'<>p_user::text or (old_entry is not null and old_entry->>'ownerId'<>p_user::text) then raise exception 'GTL_SOCIAL_FORBIDDEN'; end if;
      if (p_action in ('create','tail'))<>(old_entry is null) or audit_event->>'entryId' is distinct from next_entry->>'id'
        or new_receipt->>'entryId' is distinct from next_entry->>'id' then raise exception 'GTL_SOCIAL_INVALID'; end if;
    end if;
  end loop;
  if changed<>1 then raise exception 'GTL_SOCIAL_INVALID'; end if;
  update public.gtl_social_weeks set state=p_state,revision=saved.revision+1,updated_at=clock_timestamp() where season=p_season and week=p_week;
  insert into public.gtl_social_commits(actor_id,request_id,season,week,revision,action,payload,event)
    values(p_user,p_request_id,p_season,p_week,saved.revision+1,p_action,p_body,audit_event);
  return jsonb_build_object('revision',saved.revision+1,'replayed',false);
end $$;

create function public.gtl_follow_social(p_user uuid,p_request_id uuid,p_target uuid,p_following boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt public.gtl_social_follow_receipts; replayed boolean:=false;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_SOCIAL_PROFILE'; end if;
  if p_request_id is null or p_target is null or p_user=p_target or p_following is null
    or not exists(select 1 from public.gtl_profiles where user_id=p_target) then raise exception 'GTL_SOCIAL_INVALID'; end if;
  perform 1 from public.gtl_profiles where user_id=p_user for update;
  select * into receipt from public.gtl_social_follow_receipts where user_id=p_user and request_id=p_request_id;
  if found then
    if receipt.target_user_id<>p_target or receipt.following<>p_following then raise exception 'GTL_SOCIAL_RETRY_CONFLICT'; end if;
    replayed:=true;
  else
    if p_following then insert into public.gtl_social_follows(user_id,target_user_id) values(p_user,p_target) on conflict do nothing;
    else delete from public.gtl_social_follows where user_id=p_user and target_user_id=p_target; end if;
    insert into public.gtl_social_follow_receipts(user_id,request_id,target_user_id,following) values(p_user,p_request_id,p_target,p_following);
  end if;
  return jsonb_build_object('following',coalesce((select jsonb_agg(target_user_id order by target_user_id) from public.gtl_social_follows where user_id=p_user),'[]'),'replayed',replayed);
end $$;
revoke all on function public.gtl_read_social(uuid,integer,integer,boolean),public.gtl_commit_social(uuid,integer,integer,bigint,uuid,text,jsonb,jsonb),public.gtl_follow_social(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gtl_read_social(uuid,integer,integer,boolean),public.gtl_commit_social(uuid,integer,integer,bigint,uuid,text,jsonb,jsonb),public.gtl_follow_social(uuid,uuid,uuid,boolean) to service_role;
