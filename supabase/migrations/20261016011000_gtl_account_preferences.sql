-- D-53 account preferences. Append-only versions preserve every saved choice.
-- Additive service-only functions, no browser table access. Apply after API error mappings.
-- GTL_FEATURE_OFF=preferences disables writes; saved preferences remain readable.
create table public.gtl_account_preferences (
  user_id uuid not null references auth.users(id),
  revision bigint not null check (revision between 1 and 9007199254740990),
  value jsonb not null check (jsonb_typeof(value)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,revision)
);
alter table public.gtl_account_preferences enable row level security;
revoke all on public.gtl_account_preferences from public,anon,authenticated,service_role;
grant select,insert on public.gtl_account_preferences to service_role;

create function public.gtl_read_account_preferences(p_user uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare prefs public.gtl_account_preferences; books jsonb; snapshot jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PREFERENCES_PROFILE'; end if;
  select * into prefs from public.gtl_account_preferences where user_id=p_user order by revision desc limit 1;
  select payload into snapshot from public.gtl_market_snapshots order by created_at desc,id desc limit 1;
  -- Book identities only; no event, line, price or hidden-market counts escape this reader.
  select coalesce(jsonb_agg(book order by book),'[]') into books from (
    select distinct x->>'book' book from jsonb_array_elements(case when jsonb_typeof(snapshot->'games')='array' then snapshot->'games' else '[]' end) g
    cross join lateral jsonb_each(case when jsonb_typeof(g->'markets')='object' then g->'markets' else '{}' end) m
    cross join lateral jsonb_array_elements(case when jsonb_typeof(m.value->'quotes')='array' then m.value->'quotes' else '[]' end) x
    where x->>'book' in ('draftkings','fanduel','betmgm','betrivers','betonlineag','betus','bovada','lowvig','mybookieag')
  ) q;
  return jsonb_build_object('ownerId',p_user,'revision',coalesce(prefs.revision,0),
    'sportsbooks',coalesce(prefs.value->'sportsbooks','[]'), 'guidanceCollapsed',coalesce(prefs.value->'guidanceCollapsed','false'), 'supportedBooks',books);
end $$;

create function public.gtl_save_account_preferences(p_user uuid,p_revision bigint,p_value jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current jsonb; clean jsonb;
begin
  if p_revision is null or p_revision<0 or p_revision>=9007199254740990 or p_value is null or jsonb_typeof(p_value)<>'object'
    or (select count(*) from jsonb_object_keys(p_value))<>2 or not p_value ?& array['sportsbooks','guidanceCollapsed']
    or jsonb_typeof(p_value->'sportsbooks') is distinct from 'array' or jsonb_typeof(p_value->'guidanceCollapsed') is distinct from 'boolean'
    then raise exception 'GTL_PREFERENCES_INVALID'; end if;
  if jsonb_array_length(p_value->'sportsbooks')>9 or exists(select 1 from jsonb_array_elements(p_value->'sportsbooks') x where jsonb_typeof(x)<>'string')
    or (select count(distinct x) from jsonb_array_elements(p_value->'sportsbooks') x)<>jsonb_array_length(p_value->'sportsbooks')
    then raise exception 'GTL_PREFERENCES_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl-preferences:'||p_user::text,0));
  current:=public.gtl_read_account_preferences(p_user);
  clean:=jsonb_build_object('sportsbooks',coalesce((select jsonb_agg(x order by x) from jsonb_array_elements(p_value->'sportsbooks') x),'[]'),
    'guidanceCollapsed',p_value->'guidanceCollapsed');
  -- Same revision/payload retry after a lost response is idempotent, never a second write.
  if (current->>'revision')::bigint=p_revision+1 and clean=current-'ownerId'-'revision'-'supportedBooks' then return current; end if;
  if (current->>'revision')::bigint<>p_revision then raise exception 'GTL_PREFERENCES_CONFLICT'; end if;
  if exists(select 1 from jsonb_array_elements_text(clean->'sportsbooks') book
    where not (current->'supportedBooks') ? book and not (current->'sportsbooks') ? book) then raise exception 'GTL_PREFERENCES_BOOK'; end if;
  insert into public.gtl_account_preferences(user_id,revision,value) values(p_user,p_revision+1,clean);
  return public.gtl_read_account_preferences(p_user);
end $$;
revoke all on function public.gtl_read_account_preferences(uuid),public.gtl_save_account_preferences(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_read_account_preferences(uuid),public.gtl_save_account_preferences(uuid,bigint,jsonb) to service_role;
