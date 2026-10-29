-- M-36: optional EPL moneyline collection. Applied M-32 is immutable. New service-only objects and widened job check.
-- Creates no schedule row, enables nothing and makes no provider request. Fix forward: disable moneyline, keep evidence.
-- p_now is a trusted service clock/test seam. Browser input must never supply it.
alter table public.gtl_epl_jobs_schedule drop constraint if exists gtl_epl_jobs_schedule_job_check;
alter table public.gtl_epl_jobs_schedule add constraint gtl_epl_jobs_schedule_job_check
  check(job in ('snapshot','fixtures','resolve','settle','nudge','dnb-check','standings','moneyline'));

create table if not exists public.gtl_epl_moneyline_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.gtl_epl_fixtures(event_id),
  kickoff_at timestamptz not null,
  kind text not null check(kind in ('open','pre-kickoff','lock')),
  owner_id text references public.gtl_epl_managers(owner_id),
  run_id uuid references public.gtl_epl_job_runs(id),
  requested_at timestamptz not null,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  status text not null default 'running' check(status in ('running','refreshed','unavailable','auth','rate_limit')),
  finished_at timestamptz,
  check((kind='lock')=(owner_id is not null))
);
create unique index if not exists gtl_epl_moneyline_lock_once_idx on public.gtl_epl_moneyline_attempts(event_id,owner_id) where kind='lock';
create unique index if not exists gtl_epl_moneyline_checkpoint_once_idx on public.gtl_epl_moneyline_attempts(event_id,kickoff_at,kind) where kind<>'lock';
create index if not exists gtl_epl_moneyline_attempts_event_idx on public.gtl_epl_moneyline_attempts(event_id,requested_at desc);
create index if not exists gtl_epl_moneyline_attempts_block_idx on public.gtl_epl_moneyline_attempts(finished_at desc) where status in ('auth','rate_limit');
create table if not exists public.gtl_epl_moneyline_collections (
  id uuid primary key references public.gtl_epl_moneyline_attempts(id),
  event_id text not null references public.gtl_epl_fixtures(event_id),
  observed_at timestamptz not null,
  home text not null,
  away text not null,
  home_price integer not null check(abs(home_price) between 100 and 100000),
  away_price integer not null check(abs(away_price) between 100 and 100000),
  unscorable_count integer not null default 0 check(unscorable_count>=0),
  evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16384),
  unique(event_id,observed_at)
);
alter table public.gtl_epl_moneyline_attempts enable row level security;
alter table public.gtl_epl_moneyline_collections enable row level security;
revoke all on public.gtl_epl_moneyline_attempts,public.gtl_epl_moneyline_collections from public,anon,authenticated,service_role;
grant select,insert,update on public.gtl_epl_moneyline_attempts to service_role;
grant select,insert on public.gtl_epl_moneyline_collections to service_role;

-- A flag alone, a failed run, duplicate events or unknown books cannot open the week. A successful week stays open.
create or replace function public.gtl_epl_moneyline_gate(p_season integer,p_week integer) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare run jsonb; e jsonb; b text; seen text[]; n integer; priced integer; q jsonb;
begin
  for run in select detail from public.gtl_epl_job_runs where job='dnb-check' and status='succeeded' and reason is null
    and detail->>'season'=p_season::text and detail->>'week'=p_week::text and detail->'dnbAvailable'='true'::jsonb loop
    seen:='{}'; priced:=0;
    for e in select value from jsonb_array_elements(case when jsonb_typeof(run->'events')='array' then run->'events' else '[]'::jsonb end) loop
      if jsonb_typeof(e->'eventId') is distinct from 'string' or coalesce(e->>'eventId','')='' or e->>'eventId'=any(seen) then continue; end if;
      n:=0;
      foreach b in array array['draftkings','fanduel','betmgm'] loop
        q:=e->'books'->b;
        if jsonb_typeof(q) is distinct from 'object' then continue; end if;
        if (select count(*) from jsonb_each(q))=2
          and not exists(select 1 from jsonb_each(q) x where not (case when jsonb_typeof(x.value)='number' and x.value::text ~ '^-?[0-9]+$'
            then abs((x.value::text)::numeric) between 100 and 100000 else false end)) then n:=n+1; end if;
      end loop;
      if n>=2 then priced:=priced+1; seen:=array_append(seen,e->>'eventId'); end if;
    end loop;
    if priced>=2 then return true; end if;
  end loop;
  return false;
end $$;

-- Exact lease admission is shared by the optional scheduled job and API's post-save hook. Fixture lock matches M-32.
create or replace function public.gtl_epl_begin_moneyline_read(p_event_id text,p_user uuid default null,p_run uuid default null,p_claim uuid default null,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz; fx public.gtl_epl_fixtures; owner text; v_kind text;
  a public.gtl_epl_moneyline_attempts; remain integer; paused boolean;
begin
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id for update;
  stamp:=greatest(clock_timestamp(),coalesce(p_now,clock_timestamp()));
  if not found or fx.status<>'scheduled' or stamp>=fx.commence_time then return jsonb_build_object('status','unavailable'); end if;
  if not coalesce((select enabled from public.gtl_epl_jobs_schedule where job='moneyline'),false)
    or not public.gtl_epl_moneyline_gate(fx.season,fx.week) then return jsonb_build_object('status','unavailable'); end if;
  if p_user is not null then
    if p_run is not null or p_claim is not null then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
    owner:=public.gtl_epl_member(p_user); v_kind:='lock';
    if owner is null or owner='commissioner' or not exists(select 1 from public.gtl_epl_guesses g where g.event_id=p_event_id and g.owner_id=owner
      and g.status='locked' and g.locked_at<=stamp and g.locked_at>=stamp-interval '30 seconds')
      or exists(select 1 from public.gtl_epl_moneyline_attempts where event_id=p_event_id and owner_id=owner and kind='lock') then
      return jsonb_build_object('status','unavailable'); end if;
  else
    if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and job='moneyline'
      and status='running' and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
    if not exists(select 1 from public.gtl_epl_weeks w where w.season=fx.season and w.week=fx.week
      and w.window_start<=stamp ) then return jsonb_build_object('status','unavailable'); end if;
    v_kind:=case when stamp>=fx.commence_time-interval '3 hours' then 'pre-kickoff' else 'open' end;
    if exists(select 1 from public.gtl_epl_moneyline_attempts where event_id=p_event_id and kickoff_at=fx.commence_time and gtl_epl_moneyline_attempts.kind=v_kind) then
      return jsonb_build_object('status','cached'); end if;
  end if;
  -- Fresh qualifying collections are shared by every manager. The save already selected its immutable at-lock reference.
  if exists(select 1 from public.gtl_epl_moneyline_collections where event_id=p_event_id and observed_at<=stamp and observed_at>stamp-interval '5 minutes')
    or exists(select 1 from public.gtl_epl_moneyline_attempts where event_id=p_event_id and requested_at>stamp-interval '5 minutes') then
    return jsonb_build_object('status','cached'); end if;
  if exists(select 1 from public.gtl_epl_moneyline_attempts where status in ('auth','rate_limit') and finished_at>stamp-interval '5 minutes')
    or (select count(*) from public.gtl_epl_moneyline_attempts where event_id=p_event_id and requested_at>=date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC')>=6 then
    return jsonb_build_object('status','unavailable'); end if;
  select b.conservative_remaining,b.paused into remain,paused from public.gtl_odds_budget b where b.provider='the-odds-api' for update;
  if exists(select 1 from public.gtl_epl_moneyline_attempts where status in ('auth','rate_limit') and finished_at>stamp-interval '5 minutes')
    or remain is null or coalesce(paused,true) or remain-1<50 then return jsonb_build_object('status','unavailable'); end if;
  update public.gtl_odds_budget set conservative_remaining=remain-1,updated_at=clock_timestamp() where provider='the-odds-api';
  insert into public.gtl_epl_moneyline_attempts(event_id,kickoff_at,kind,owner_id,run_id,requested_at,expires_at)
    values(p_event_id,fx.commence_time,v_kind,owner,p_run,stamp,stamp+interval '2 minutes') returning * into a;
  return jsonb_build_object('status','ready','leaseId',a.id,'token',a.token,
    'fixture',jsonb_build_object('eventId',fx.event_id,'home',fx.home,'away',fx.away,'commenceTime',fx.commence_time));
end $$;

-- The worker asks for candidates only. Begin rechecks all conditions atomically and reserves one credit/event.
create or replace function public.gtl_epl_moneyline_due(p_run uuid,p_claim uuid,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and job='moneyline' and status='running'
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if not coalesce((select enabled from public.gtl_epl_jobs_schedule where job='moneyline'),false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x.event_id) from (select f.event_id from public.gtl_epl_fixtures f join public.gtl_epl_weeks w using(season,week)
    where f.status='scheduled' and f.commence_time>stamp and w.window_start<=stamp
      and public.gtl_epl_moneyline_gate(f.season,f.week)
      and not exists(select 1 from public.gtl_epl_moneyline_attempts a where a.event_id=f.event_id and a.kickoff_at=f.commence_time
        and a.kind=case when stamp>=f.commence_time-interval '3 hours' then 'pre-kickoff' else 'open' end)
    order by f.commence_time,f.event_id limit 10) x),'[]'::jsonb);
end $$;

-- Private evidence + latest normalized medians + M-32 pending references commit together under the same fixture lock.
-- Every finish reconciles quota conservatively, even when the source was invalid or kickoff passed. No reservation refund.
create or replace function public.gtl_epl_finish_moneyline_read(p_lease uuid,p_token uuid,p_event jsonb default null,p_quota jsonb default null,p_error text default null,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz; a public.gtl_epl_moneyline_attempts; fx public.gtl_epl_fixtures;
  observed timestamptz; book_at timestamptz; b text; v_club text; prices integer[]; hp integer; ap integer; n integer:=0; p integer;
  unscorable integer:=0; valid boolean:=true; v integer; q jsonb; raw text;
begin
  -- Read only to find the fixture, then take locks in the same order as Begin and the M-32 save writer.
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=a.event_id for update;
  stamp:=greatest(clock_timestamp(),coalesce(p_now,clock_timestamp()));
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token for update;
  if a.status<>'running' then return jsonb_build_object('status',case when a.status='refreshed' then 'refreshed' else 'unavailable' end); end if;
  -- Trust only bounded nonnegative integer header values. Missing/invalid headers cannot increase the shared budget.
  if jsonb_typeof(p_quota)='object' then
    foreach b in array array['remaining','used','last'] loop
      raw:=p_quota->>b;
      if raw is not null and (raw !~ '^[0-9]{1,9}$' or jsonb_typeof(p_quota->b)<>'number') then p_quota:=null; exit; end if;
    end loop;
    if p_quota is not null then
      update public.gtl_odds_budget set observed_remaining=coalesce((p_quota->>'remaining')::integer,observed_remaining),
        observed_used=coalesce((p_quota->>'used')::integer,observed_used),observed_last=coalesce((p_quota->>'last')::integer,observed_last),observed_at=clock_timestamp(),
        conservative_remaining=case when p_quota->>'remaining' is null then conservative_remaining when conservative_remaining is null then least((p_quota->>'remaining')::integer,500)
          else least(conservative_remaining,(p_quota->>'remaining')::integer) end,updated_at=clock_timestamp() where provider='the-odds-api';
    end if;
  end if;
  if p_error in ('auth','rate_limit') then
    update public.gtl_epl_moneyline_attempts set status=p_error,finished_at=stamp where id=a.id;
    return jsonb_build_object('status','unavailable');
  end if;
  if p_error is not null or stamp>a.expires_at or stamp<a.requested_at or fx.status<>'scheduled' or stamp>=fx.commence_time
    or a.kickoff_at<>fx.commence_time or not coalesce((select enabled from public.gtl_epl_jobs_schedule where job='moneyline'),false)
    or jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>16384 then valid:=false; end if;
  if valid then
    begin
      observed:=(p_event->>'observedAt')::timestamptz;
      if observed is null or observed<a.requested_at or observed>stamp or observed>=fx.commence_time
        or p_event->>'eventId' is distinct from fx.event_id or p_event->>'home' is distinct from fx.home or p_event->>'away' is distinct from fx.away
        or (p_event->>'commenceTime')::timestamptz is distinct from fx.commence_time
        or coalesce(p_event->>'responseSha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_event->'books') is distinct from 'object'
        or jsonb_typeof(p_event->'bookObservedAt') is distinct from 'object' then valid:=false; end if;
      if valid then
        foreach b in array array['draftkings','fanduel','betmgm'] loop
          q:=p_event->'books'->b;
          if q is null then continue; end if;
          if jsonb_typeof(q) is distinct from 'object' then valid:=false; exit; end if;
          if (select count(*) from jsonb_each(q))<>2 then valid:=false; exit; end if;
          book_at:=(p_event->'bookObservedAt'->>b)::timestamptz;
          if book_at is null or book_at>observed or book_at<observed-interval '5 minutes' then valid:=false; exit; end if;
          foreach v_club in array array[fx.home,fx.away] loop
            raw:=q->>v_club;
            if jsonb_typeof(q->v_club) is distinct from 'number' or raw !~ '^-?[0-9]{1,6}$' or abs(raw::integer) not between 100 and 100000 then valid:=false; exit; end if;
          end loop;
          if not valid then exit; end if;
          n:=n+1;
        end loop;
        if n<2 or (select count(*) from jsonb_each(p_event->'books'))<>n or (select count(*) from jsonb_each(p_event->'bookObservedAt'))<>n then valid:=false; end if;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then valid:=false;
    end;
  end if;
  if not valid then
    update public.gtl_epl_moneyline_attempts set status='unavailable',finished_at=stamp where id=a.id;
    return jsonb_build_object('status','unavailable');
  end if;
  foreach v_club in array array[fx.home,fx.away] loop
    select array_agg(case when z.value::text::integer>=100 then z.value::text::integer-100 else z.value::text::integer+100 end order by
      case when z.value::text::integer>=100 then z.value::text::integer-100 else z.value::text::integer+100 end) into prices
      from jsonb_each(p_event->'books') x cross join lateral (select x.value->v_club as value) z;
    v:=case when n=3 then prices[2] else round((prices[1]+prices[2])::numeric/2)::integer end;
    p:=case when v>=0 then v+100 else v-100 end;
    if v_club=fx.home then hp:=p; else ap:=p; end if;
  end loop;
  -- Applied M-32 stores int distances. An extreme old pending guess must not roll back every other manager's reference.
  select count(*)::integer into unscorable from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked' and g.reference_price is null
    and observed>g.locked_at and observed<fx.commence_time
    and abs((case when g.price>=100 then g.price::bigint-100 else g.price::bigint+100 end)
      -(case when g.club=fx.home then case when hp>=100 then hp-100 else hp+100 end else case when ap>=100 then ap-100 else ap+100 end end))>2147483647;
  insert into public.gtl_epl_moneyline_collections(id,event_id,observed_at,home,away,home_price,away_price,unscorable_count,evidence)
    values(a.id,fx.event_id,observed,fx.home,fx.away,hp,ap,unscorable,p_event);
  insert into public.gtl_epl_prices as current(event_id,club,market,price,observed_at) values
    (fx.event_id,fx.home,'draw_no_bet',hp,observed),(fx.event_id,fx.away,'draw_no_bet',ap,observed)
    on conflict(event_id,club,market) do update set price=excluded.price,observed_at=excluded.observed_at where excluded.observed_at>current.observed_at;
  -- Use THIS captured observation, never a later latest-price row. No established reference can move.
  with refs as (select g.owner_id,case when g.club=fx.home then hp else ap end price,
      abs((case when g.price>=100 then g.price::bigint-100 else g.price::bigint+100 end)
        -(case when g.club=fx.home then case when hp>=100 then hp-100 else hp+100 end else case when ap>=100 then ap-100 else ap+100 end end)) dist
    from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked' and g.reference_price is null
      and observed>g.locked_at and observed<fx.commence_time)
  update public.gtl_epl_guesses g set reference_price=r.price,reference_observed_at=observed,reference_source='first-after',distance=r.dist::integer
    from refs r where g.event_id=fx.event_id and g.owner_id=r.owner_id and r.dist<=2147483647;
  update public.gtl_epl_moneyline_attempts set status='refreshed',finished_at=stamp where id=a.id;
  return jsonb_build_object('status','refreshed');
end $$;

revoke all on function public.gtl_epl_moneyline_gate(integer,integer),public.gtl_epl_begin_moneyline_read(text,uuid,uuid,uuid,timestamptz),
  public.gtl_epl_moneyline_due(uuid,uuid,timestamptz),public.gtl_epl_finish_moneyline_read(uuid,uuid,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_epl_moneyline_gate(integer,integer),public.gtl_epl_begin_moneyline_read(text,uuid,uuid,uuid,timestamptz),
  public.gtl_epl_moneyline_due(uuid,uuid,timestamptz),public.gtl_epl_finish_moneyline_read(uuid,uuid,jsonb,jsonb,text,timestamptz) to service_role;

-- Fresh clock AFTER lock acquisition: an API timestamp sampled before waiting cannot backdate a post-kickoff lock.
-- M-32 remains byte-identical; the API must use this wrapper and never fall back to its unsafe timing path.
create or replace function public.gtl_epl_save_guess_current(p_user uuid,p_event_id text,p_club text,p_price integer,p_lock boolean,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;
begin
  perform 1 from public.gtl_epl_fixtures where event_id=p_event_id for update;
  stamp:=clock_timestamp();
  stamp:=greatest(stamp,coalesce(p_now,stamp));
  return public.gtl_epl_save_guess(p_user,p_event_id,p_club,p_price,p_lock,stamp);
end $$;
revoke all on function public.gtl_epl_save_guess_current(uuid,text,text,integer,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_epl_save_guess_current(uuid,text,text,integer,boolean,timestamptz) to service_role;

-- Effect-free schema capability for API reads: exact absence keeps the game unavailable until the safe writer exists.
create or replace function public.gtl_epl_moneyline_save_ready() returns boolean
language sql immutable security invoker set search_path='' as $$ select true; $$;
revoke all on function public.gtl_epl_moneyline_save_ready() from public,anon,authenticated;
grant execute on function public.gtl_epl_moneyline_save_ready() to service_role;
