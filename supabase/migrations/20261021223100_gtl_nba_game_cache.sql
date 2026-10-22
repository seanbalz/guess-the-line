-- NBA-only display cache. Apply after 20261021201054. No player tickets or original source payloads.
create table nba_private.game_cache (
  range_date date primary key,
  games jsonb not null check (jsonb_typeof(games) = 'array'),
  observed_at timestamptz not null
);
create table nba_private.game_provider (
  id boolean primary key default true check (id),
  lease_token uuid,
  range_date date,
  leased_at timestamptz,
  lease_until timestamptz,
  cooldown_until timestamptz
);
insert into nba_private.game_provider(id) values (true);
alter table nba_private.game_cache enable row level security;
alter table nba_private.game_cache force row level security;
alter table nba_private.game_provider enable row level security;
alter table nba_private.game_provider force row level security;
revoke all on nba_private.game_cache,nba_private.game_provider from public,anon,authenticated,service_role;

create function public.gtl_nba_claim_games(p_date date, p_refresh boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  provider nba_private.game_provider%rowtype;
  cached nba_private.game_cache%rowtype;
  current_time_ timestamptz;
  token uuid;
begin
  if p_date is null or not isfinite(p_date) or p_refresh is null then raise exception 'GTL_NBA_INVALID'; end if;
  -- Serialize every range against a single provider budget, across all Edge instances.
  select * into provider from nba_private.game_provider where id for update;
  current_time_ := clock_timestamp();
  select * into cached from nba_private.game_cache where range_date=p_date;
  if p_refresh and (cached.observed_at is null or cached.observed_at <= current_time_-interval '5 minutes')
    and (provider.cooldown_until is null or provider.cooldown_until <= current_time_)
    and (provider.lease_until is null or provider.lease_until <= current_time_) then
    token := gen_random_uuid();
    update nba_private.game_provider set lease_token=token,range_date=p_date,leased_at=current_time_,
      -- Reserve the full lease plus the minimum gap: even a delayed holder cannot bunch provider calls.
      lease_until=current_time_+interval '15 seconds',cooldown_until=current_time_+interval '35 seconds' where id;
  end if;
  return jsonb_build_object('games',cached.games,'observedAt',cached.observed_at,'leaseToken',token,
    'leasedAt',case when token is not null then current_time_ else null end);
end $$;

create function public.gtl_nba_finish_games(p_date date, p_token uuid, p_games jsonb) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare
  provider nba_private.game_provider%rowtype;
  published integer := 0;
begin
  if p_date is null or not isfinite(p_date) or p_token is null
    or p_games is not null and (jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games)>100) then raise exception 'GTL_NBA_INVALID'; end if;
  select * into provider from nba_private.game_provider where id for update;
  if provider.lease_token is distinct from p_token or provider.range_date is distinct from p_date
    or provider.lease_until <= clock_timestamp() then return false; end if;
  if p_games is not null then
    insert into nba_private.game_cache(range_date,games,observed_at) values(p_date,p_games,provider.leased_at)
    on conflict (range_date) do update set games=excluded.games,observed_at=excluded.observed_at
      where nba_private.game_cache.observed_at < excluded.observed_at;
    get diagnostics published = row_count;
  end if;
  update nba_private.game_provider set lease_token=null,lease_until=null where id;
  return published = 1;
end $$;
revoke all on function public.gtl_nba_claim_games(date,boolean) from public,anon,authenticated,service_role;
revoke all on function public.gtl_nba_finish_games(date,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.gtl_nba_claim_games(date,boolean) to service_role;
grant execute on function public.gtl_nba_finish_games(date,uuid,jsonb) to service_role;
