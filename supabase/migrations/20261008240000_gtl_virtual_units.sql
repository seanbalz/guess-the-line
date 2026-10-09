-- D-18 virtual play-money game. Separate from weekly prediction ballots,
-- record-only Challenge selections, and the shared social Bet Tracker.
create table public.gtl_virtual_units_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  game_id text not null,
  market text not null check (market in ('spread','total')),
  selection jsonb not null check (jsonb_typeof(selection)='object'),
  status text not null default 'pending' check (status in ('pending','win','loss','push','void')),
  result jsonb,
  audit jsonb not null default '[]' check (jsonb_typeof(audit)='array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season,week,game_id,market),
  foreign key(user_id,season,week) references public.gtl_weekly_versions on delete cascade
);
create index gtl_virtual_units_week_idx on public.gtl_virtual_units_picks(season,week,game_id,market);

create function public.gtl_read_virtual_units(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; rows jsonb; wins integer; losses integer; pushes integer; pending integer; voids integer; risk numeric; net numeric;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  select coalesce(revision,0) into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w;
  select coalesce(jsonb_agg(jsonb_build_object(
    'gameId',game_id,'market',market,'selection',selection,'status',status,'result',result,'audit',audit,
    'createdAt',created_at,'updatedAt',updated_at) order by game_id,market),'[]'::jsonb)
    into rows from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w;
  select count(*) filter(where status='win'),count(*) filter(where status='loss'),count(*) filter(where status='push'),
    count(*) filter(where status='pending'),count(*) filter(where status='void'),
    coalesce(sum((selection->>'units')::numeric) filter(where status in ('win','loss','push')),0),
    coalesce(sum(case when status='win' then coalesce((result->>'netUnits')::numeric,0) when status='loss' then -(selection->>'units')::numeric else 0 end),0)
    into wins,losses,pushes,pending,voids,risk,net
    from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w;
  return jsonb_build_object('season',s,'week',w,'revision',rev,'playerId',c->>'playerId','league',c->'state'->'league',
    'games',c->'state'->'games','picks',rows,'summary',jsonb_build_object('wins',wins,'losses',losses,'pushes',pushes,'pending',pending,'voids',voids,'riskUnits',risk,'netUnits',net,
      'roi',case when risk=0 then null else round(net/risk*100,2) end,'qualificationPicks',wins+losses+pushes+pending+voids,'qualificationUnits',coalesce((select sum((selection->>'units')::numeric) from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w),0)));
end $$;

create function public.gtl_save_virtual_units_pick(p_user uuid,p_league text,p_revision bigint,p_body jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; g jsonb; v_market text; v_game_id text; v_side text; line numeric; odds numeric; units numeric; quoted timestamptz; stamp timestamptz; old public.gtl_virtual_units_picks; value jsonb; event jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or exists(select 1 from jsonb_object_keys(p_body) k where k not in ('gameId','market','side','line','odds','units','source','quotedAt')) then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  v_game_id:=p_body->>'gameId'; v_market:=p_body->>'market'; v_side:=p_body->>'side';
  select x into g from jsonb_array_elements(c#>'{state,games}') x where x->>'id'=v_game_id;
  if g is null or v_market not in ('spread','total') or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under')) then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  stamp:=clock_timestamp();
  if stamp >= (g->>'kickoff')::timestamptz then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  begin line:=(p_body->>'line')::numeric; odds:=(p_body->>'odds')::numeric; units:=(p_body->>'units')::numeric; quoted:=(p_body->>'quotedAt')::timestamptz; exception when others then raise exception 'GTL_VIRTUAL_INVALID'; end;
  if not isfinite(line) or not isfinite(odds) or not isfinite(units) or not isfinite(quoted) or line*2<>trunc(line*2)
    or (v_market='spread' and (line < -100 or line > 100)) or (v_market='total' and (line < 0 or line > 200))
    or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 or units<=0 or units*2<>trunc(units*2)
    or quoted>=((g->>'kickoff')::timestamptz) or quoted>stamp or length(btrim(p_body->>'source'))<2 or length(p_body->>'source')>120
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  select v.* into old from public.gtl_virtual_units_picks v where v.user_id=p_user and v.season=s and v.week=w and v.game_id=v_game_id and v.market=v_market for update;
  value:=jsonb_build_object('gameId',v_game_id,'market',v_market,'side',v_side,'line',line,'odds',odds,'units',units,'source',btrim(p_body->>'source'),'quotedAt',quoted,'selectedAt',stamp,'riskDollars',units*100);
  event:=jsonb_build_object('id',gen_random_uuid(),'type',case when old.user_id is null then 'placed' else 'edited' end,'timestamp',stamp,'before',case when old.user_id is null then null else old.selection end,'after',value);
  insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,status,result,audit,created_at,updated_at)
    values(p_user,s,w,v_game_id,v_market,value,'pending',null,jsonb_build_array(event),stamp,stamp)
    on conflict(user_id,season,week,game_id,market) do update set selection=excluded.selection,status='pending',result=null,audit=public.gtl_virtual_units_picks.audit||excluded.audit,updated_at=stamp;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

alter table public.gtl_virtual_units_picks enable row level security;
revoke all on public.gtl_virtual_units_picks from public,anon,authenticated,service_role;
grant select,insert,update on public.gtl_virtual_units_picks to service_role;
revoke all on function public.gtl_read_virtual_units(uuid,text),public.gtl_save_virtual_units_pick(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_read_virtual_units(uuid,text),public.gtl_save_virtual_units_pick(uuid,text,bigint,jsonb) to service_role;
