-- Private, owner-confirmed NBA tickets. Apply only after 20261021201054.
-- App access is exclusively through the two service RPCs; there are no table grants.
alter table nba_private.bets alter column import_id drop not null;
alter table nba_private.bets add column revision integer not null default 1 check (revision > 0);
alter table nba_private.bets add column updated_at timestamptz not null default now();
alter table nba_private.bets add column price_input jsonb;

create table nba_private.bet_changes (
  owner_id uuid not null references auth.users(id),
  operation_id uuid not null,
  ticket_id uuid not null references nba_private.bets(id),
  revision integer not null check (revision > 0),
  payload jsonb not null,
  reason text,
  before_terms jsonb,
  after_terms jsonb not null,
  response jsonb not null,
  created_at timestamptz not null,
  primary key (owner_id, operation_id),
  unique (ticket_id, revision)
);
create index nba_bet_changes_owner_ticket on nba_private.bet_changes(owner_id, ticket_id, revision);
alter table nba_private.bet_changes enable row level security;
alter table nba_private.bet_changes force row level security;

create function nba_private.preserve_archive() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if tg_table_name = 'bet_changes' then raise exception 'GTL_NBA_AUDIT_IMMUTABLE'; end if;
  if tg_table_name = 'bet_imports' or tg_op = 'DELETE' then raise exception 'GTL_NBA_ARCHIVE_IMMUTABLE'; end if;
  if new.owner_id is distinct from old.owner_id or new.import_id is distinct from old.import_id
    or new.imported_at is distinct from old.imported_at or new.source_record is distinct from old.source_record
    or new.provenance is distinct from old.provenance then raise exception 'GTL_NBA_ARCHIVE_IMMUTABLE'; end if;
  return new;
end $$;
create trigger nba_preserve_import before update or delete on nba_private.bet_imports
for each row execute function nba_private.preserve_archive();
create trigger nba_preserve_source before update or delete on nba_private.bets
for each row execute function nba_private.preserve_archive();
create trigger nba_append_only_changes before update or delete on nba_private.bet_changes
for each row execute function nba_private.preserve_archive();

create function nba_private.ticket_terms(b nba_private.bets) returns jsonb
language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object('id', b.id, 'season', b.season, 'eventDate', b.event_date,
    'kind', b.kind, 'label', b.label, 'legs', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'gameId', leg->'gameId', 'matchup', leg->'matchup', 'market', leg->'market',
      'team', leg->'team', 'side', leg->'side', 'line', leg->'line')) order by ordinal)
      from jsonb_array_elements(b.legs) with ordinality as l(leg, ordinal)),
    'odds', b.odds, 'stakeUnits', b.stake_units, 'outcome', b.outcome, 'netUnits', b.net_units,
    'priceInput', coalesce(b.price_input, jsonb_build_object('format', 'american', 'value', b.odds)))
$$;
create function nba_private.ticket_view(b nba_private.bets) returns jsonb
language sql stable set search_path = pg_catalog as $$
  select nba_private.ticket_terms(b) || jsonb_build_object('revision', b.revision, 'updatedAt', b.updated_at,
    'audit', coalesce((select jsonb_agg(jsonb_build_object('operationId', c.operation_id, 'revision', c.revision,
      'reason', c.reason, 'updatedAt', c.created_at, 'before', c.before_terms, 'after', c.after_terms) order by c.revision)
      from nba_private.bet_changes c where c.owner_id = b.owner_id and c.ticket_id = b.id), '[]'::jsonb))
$$;

create function public.gtl_nba_save_bet(p_user_id uuid, p_operation_id uuid, p_ticket jsonb,
  p_expected_revision integer, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  b nba_private.bets%rowtype;
  receipt nba_private.bet_changes%rowtype;
  ticket_id uuid;
  leg jsonb;
  price numeric;
  stake numeric;
  probability numeric;
  expected_net numeric;
  payload jsonb;
  before_terms jsonb;
  after_terms jsonb;
  audit jsonb;
  response jsonb;
  at_time timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision >= 2147483647 or jsonb_typeof(p_ticket) is distinct from 'object'
    or (p_expected_revision > 0 and (p_reason is null or length(trim(p_reason)) = 0))
    or (p_reason is not null and (length(trim(p_reason)) = 0 or length(trim(p_reason)) > 500))
    or exists(select 1 from jsonb_object_keys(p_ticket) k where k not in
      ('id','season','eventDate','kind','label','legs','odds','stakeUnits','outcome','netUnits','priceInput'))
    or not (p_ticket ?& array['id','season','eventDate','kind','label','legs','odds','stakeUnits','outcome','netUnits','priceInput'])
  then raise exception 'GTL_NBA_INVALID'; end if;
  if jsonb_typeof(p_ticket->'id') is distinct from 'string' or (p_ticket->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or jsonb_typeof(p_ticket->'season') is distinct from 'string' or (p_ticket->>'season') !~ '^[0-9]{4}-[0-9]{2}$'
    or right(p_ticket->>'season',2)::integer <> (left(p_ticket->>'season',4)::integer + 1) % 100
    or jsonb_typeof(p_ticket->'eventDate') is distinct from 'string' or (p_ticket->>'eventDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_ticket->>'eventDate')::date::text <> p_ticket->>'eventDate'
    or jsonb_typeof(p_ticket->'kind') is distinct from 'string' or p_ticket->>'kind' not in ('single','parlay')
    or jsonb_typeof(p_ticket->'label') is distinct from 'string' or length(trim(p_ticket->>'label')) not between 1 and 500
    or jsonb_typeof(p_ticket->'outcome') is distinct from 'string' or p_ticket->>'outcome' not in ('pending','win','loss','push','void')
    or jsonb_typeof(p_ticket->'stakeUnits') is distinct from 'number' or jsonb_typeof(p_ticket->'odds') is distinct from 'number'
    or jsonb_typeof(p_ticket->'priceInput') is distinct from 'object'
    or jsonb_typeof(p_ticket->'legs') is distinct from 'array'
  then raise exception 'GTL_NBA_INVALID'; end if;
  stake := (p_ticket->>'stakeUnits')::numeric; price := (p_ticket->>'odds')::numeric;
  if stake <= 0 or stake >= 1000000 or stake <> round(stake,8) or abs(price) < 100 or abs(price) > 1000000 or price <> round(price,4)
    or jsonb_array_length(p_ticket->'legs') > 20
    or (p_ticket->>'kind' = 'single' and jsonb_array_length(p_ticket->'legs') <> 1)
    or (p_ticket->>'kind' = 'parlay' and jsonb_array_length(p_ticket->'legs') < 2)
    or exists(select 1 from jsonb_object_keys(p_ticket->'priceInput') k where k not in ('format','value'))
    or jsonb_typeof(p_ticket->'priceInput'->'value') is distinct from 'number'
    or coalesce(p_ticket->'priceInput'->>'format','') not in ('american','probability')
  then raise exception 'GTL_NBA_INVALID'; end if;
  probability := (p_ticket->'priceInput'->>'value')::numeric;
  if p_ticket->'priceInput'->>'format' = 'probability' then
    if probability <= 0 or probability >= 100 then raise exception 'GTL_NBA_INVALID'; end if;
    if price <> round(case when probability > 50 then -100 * probability / (100-probability)
      else 100 * (100-probability) / probability end,4) then raise exception 'GTL_NBA_INVALID'; end if;
  elsif price <> probability then raise exception 'GTL_NBA_INVALID'; end if;
  expected_net := case p_ticket->>'outcome' when 'pending' then null when 'loss' then -stake when 'win'
    then round(case when price > 0 then stake * price / 100 else stake * 100 / abs(price) end,8) else 0 end;
  if (p_ticket->'netUnits') is distinct from coalesce(to_jsonb(expected_net),'null'::jsonb) then raise exception 'GTL_NBA_INVALID'; end if;
  for leg in select value from jsonb_array_elements(p_ticket->'legs') loop
    if jsonb_typeof(leg) is distinct from 'object' then raise exception 'GTL_NBA_INVALID'; end if;
    if exists(select 1 from jsonb_object_keys(leg) k where k not in ('gameId','matchup','market','team','side','line'))
      or jsonb_typeof(leg->'gameId') is distinct from 'string' or length(leg->>'gameId') > 200
      or (leg->>'gameId') !~ '^NBA:[A-Za-z0-9_:.-]+$'
      or jsonb_typeof(leg->'market') is distinct from 'string' or leg->>'market' not in ('moneyline','spread','total')
      or (leg ? 'matchup' and (jsonb_typeof(leg->'matchup') is distinct from 'string' or length(trim(leg->>'matchup')) not between 1 and 200))
    then raise exception 'GTL_NBA_INVALID'; end if;
    if leg->>'market' = 'total' then
      if coalesce(leg->>'side','') not in ('over','under') or leg ? 'team' then raise exception 'GTL_NBA_INVALID'; end if;
    elsif jsonb_typeof(leg->'team') is distinct from 'string' or length(trim(leg->>'team')) not between 1 and 100 or leg ? 'side'
      then raise exception 'GTL_NBA_INVALID'; end if;
    if leg->>'market' <> 'moneyline' then
      if jsonb_typeof(leg->'line') is distinct from 'number' then raise exception 'GTL_NBA_INVALID'; end if;
      if abs((leg->>'line')::numeric) > 1000 or (leg->>'line')::numeric * 2 <> trunc((leg->>'line')::numeric * 2)
        or (leg->>'market' = 'total' and (leg->>'line')::numeric <= 0) then raise exception 'GTL_NBA_INVALID'; end if;
    elsif leg ? 'line' then raise exception 'GTL_NBA_INVALID'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_ticket->'legs') l group by l->>'gameId',l->>'market' having count(*) > 1)
    then raise exception 'GTL_NBA_INVALID'; end if;
  ticket_id := (p_ticket->>'id')::uuid;
  p_reason := nullif(trim(p_reason),'');
  payload := jsonb_build_object('ticket',p_ticket,'expectedRevision',p_expected_revision,'reason',p_reason);
  -- Serialize an operation across retries, then ticket creation/update across devices.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operation_id::text,0));
  select * into receipt from nba_private.bet_changes c where c.owner_id = p_user_id and c.operation_id = p_operation_id;
  if found then
    if receipt.payload <> payload then raise exception 'GTL_NBA_OPERATION_CONFLICT'; end if;
    return receipt.response;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nba-ticket:' || ticket_id::text,0));
  select * into b from nba_private.bets t where t.owner_id = p_user_id and t.id = ticket_id for update;
  if found then
    if b.revision <> p_expected_revision then raise exception 'GTL_NBA_CONFLICT'; end if;
    before_terms := nba_private.ticket_terms(b);
    update nba_private.bets t set season=p_ticket->>'season', event_date=(p_ticket->>'eventDate')::date,
      kind=p_ticket->>'kind', label=p_ticket->>'label', legs=p_ticket->'legs', odds=price, stake_units=stake,
      outcome=p_ticket->>'outcome', price_input=p_ticket->'priceInput', revision=t.revision+1, updated_at=at_time
      where t.owner_id=p_user_id and t.id=ticket_id returning * into b;
  else
    if p_expected_revision <> 0 then raise exception 'GTL_NBA_NOT_FOUND'; end if;
    insert into nba_private.bets(id,owner_id,import_id,season,event_date,kind,label,legs,odds,stake_units,outcome,
      provenance,source_record,price_input,updated_at)
      values(ticket_id,p_user_id,null,p_ticket->>'season',(p_ticket->>'eventDate')::date,p_ticket->>'kind',
        p_ticket->>'label',p_ticket->'legs',price,stake,p_ticket->>'outcome',
        jsonb_build_object('source','manual'),jsonb_build_object('source','manual','ticket',p_ticket),p_ticket->'priceInput',at_time)
      on conflict (id) do nothing returning * into b;
    if not found then raise exception 'GTL_NBA_NOT_FOUND'; end if;
  end if;
  after_terms := nba_private.ticket_terms(b);
  audit := (nba_private.ticket_view(b)->'audit') || jsonb_build_array(jsonb_build_object('operationId',p_operation_id,
    'revision',b.revision,'reason',p_reason,'updatedAt',at_time,'before',before_terms,'after',after_terms));
  response := jsonb_build_object('ticket',after_terms || jsonb_build_object('revision',b.revision,'updatedAt',at_time,'audit',audit));
  insert into nba_private.bet_changes(owner_id,operation_id,ticket_id,revision,payload,reason,before_terms,after_terms,response,created_at)
    values(p_user_id,p_operation_id,ticket_id,b.revision,payload,p_reason,before_terms,after_terms,response,at_time);
  return response;
exception when data_exception or check_violation or not_null_violation or foreign_key_violation then
  raise exception 'GTL_NBA_INVALID';
end $$;

create function public.gtl_nba_read_bets(p_user_id uuid, p_filters jsonb default '{}'::jsonb,
  p_cursor jsonb default null, p_ticket_id uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  date_from date; date_to date; cursor_date date; cursor_id uuid;
  tickets jsonb; next_cursor jsonb; summary jsonb;
begin
  if p_user_id is null or jsonb_typeof(p_filters) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('status','market','from','to'))
    or (p_filters ? 'status' and (jsonb_typeof(p_filters->'status') is distinct from 'string' or p_filters->>'status' not in ('pending','win','loss','push','void')))
    or (p_filters ? 'market' and (jsonb_typeof(p_filters->'market') is distinct from 'string' or p_filters->>'market' not in ('moneyline','spread','total')))
    then raise exception 'GTL_NBA_INVALID'; end if;
  if p_filters ? 'from' then
    if jsonb_typeof(p_filters->'from') is distinct from 'string' or (p_filters->>'from') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'GTL_NBA_INVALID'; end if;
    date_from := (p_filters->>'from')::date;
  end if;
  if p_filters ? 'to' then
    if jsonb_typeof(p_filters->'to') is distinct from 'string' or (p_filters->>'to') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'GTL_NBA_INVALID'; end if;
    date_to := (p_filters->>'to')::date;
  end if;
  if date_from > date_to then raise exception 'GTL_NBA_INVALID'; end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) is distinct from 'object' then raise exception 'GTL_NBA_INVALID'; end if;
    if not (p_cursor ?& array['eventDate','id']) or exists(select 1 from jsonb_object_keys(p_cursor) k where k not in ('eventDate','id'))
      or jsonb_typeof(p_cursor->'eventDate') is distinct from 'string' or (p_cursor->>'eventDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(p_cursor->'id') is distinct from 'string' or (p_cursor->>'id') !~ '^[0-9a-fA-F-]{36}$'
      then raise exception 'GTL_NBA_INVALID'; end if;
    cursor_date := (p_cursor->>'eventDate')::date; cursor_id := (p_cursor->>'id')::uuid;
  end if;
  with matching as materialized (
    select b.* from nba_private.bets b where b.owner_id = p_user_id and (p_ticket_id is null or b.id = p_ticket_id)
      and (not (p_filters ? 'status') or b.outcome = p_filters->>'status')
      and (date_from is null or b.event_date >= date_from) and (date_to is null or b.event_date <= date_to)
      and (not (p_filters ? 'market') or exists(select 1 from jsonb_array_elements(b.legs) l where l->>'market' = p_filters->>'market'))
  ), page as (
    select m.* from matching m where cursor_date is null or (m.event_date,m.id) < (cursor_date,cursor_id)
      order by m.event_date desc,m.id desc limit 101
  ), visible as (select p.* from page p order by p.event_date desc,p.id desc limit 100), totals as (
    select count(*) n, count(*) filter(where outcome='win') wins, count(*) filter(where outcome='loss') losses,
      count(*) filter(where outcome='push') pushes,count(*) filter(where outcome='void') voids,count(*) filter(where outcome='pending') pending,
      coalesce(sum(stake_units) filter(where outcome in ('win','loss','push')),0) risk,
      coalesce(sum(net_units),0) net from matching
  )
  select coalesce((select jsonb_agg(nba_private.ticket_view(v) order by v.event_date desc,v.id desc) from visible v),'[]'::jsonb),
    case when (select count(*) from page) > 100 then (select jsonb_build_object('eventDate',v.event_date,'id',v.id)
      from visible v order by v.event_date asc,v.id asc limit 1) else null end,
    (select jsonb_build_object('count',n,'wins',wins,'losses',losses,'pushes',pushes,'voids',voids,'pending',pending,
      'riskUnits',risk,'netUnits',net,'roi',case when risk > 0 then round(net/risk*100,8) else null end) from totals)
    into tickets,next_cursor,summary;
  return jsonb_build_object('tickets',tickets,'nextCursor',next_cursor,'summary',summary);
exception when data_exception then raise exception 'GTL_NBA_INVALID';
end $$;

revoke all on all tables in schema nba_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema nba_private from public, anon, authenticated, service_role;
revoke all on all functions in schema nba_private from public, anon, authenticated, service_role;
revoke all on function public.gtl_nba_read_bets(uuid,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.gtl_nba_save_bet(uuid,uuid,jsonb,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.gtl_nba_read_bets(uuid,jsonb,jsonb,uuid) to service_role;
grant execute on function public.gtl_nba_save_bet(uuid,uuid,jsonb,integer,text) to service_role;
