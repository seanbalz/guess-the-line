-- D-26 (October 9, 2026): Virtual Units settle with standard sportsbook rules
-- against the FINAL score, using the book line and odds saved with each pick.
--   spread: the chosen side wins if it covers the saved line; total: over/under
--   the saved total as chosen; exact landing on the line is a push.
--   win  -> units x (decimal payout - 1) credited, where decimal payout =
--           1 + (odds > 0 ? odds / 100 : 100 / |odds|), the same American-odds
--           conversion shared/social-bets.mjs socialPotentialProfit() uses
--           (1U at -110 = +0.9091U; 2U at +120 = +2.4U), rounded to 4 places;
--   loss -> the staked units debited; push -> stake returned, zero net;
--   postponed / cancelled -> void: stake returned, excluded from record and ROI.
-- Settlement never changes a pick's saved side, line, odds, units, timestamps or
-- row timestamps; it appends a settlement result (final score, settled time,
-- source) to result and a before/after event to audit. Weekly qualification
-- (D-18: three picks OR 3 units, voids keep their credit) is unchanged because
-- the reader counts every placed pick regardless of status.
--
-- Idempotent: re-running the same finals changes nothing (no ledger row, no
-- pick write). A later call with a corrected final appends the next version
-- for that game, re-grades its picks from their original saved terms and
-- records the previous outcome in each pick's result and audit. A postponed
-- void is terminal for that placement (D-18: a fresh pick at the rescheduled
-- market replaces it through the ordinary save path, which resets the row to
-- pending); a cancelled void is a ruling and is re-graded if a later verified
-- final corrects it. Picks for games not in the payload are untouched.
--
-- Service-only. The handler's commissioner route and the future scheduled job
-- (pg_cron + pg_net, same pattern as gtl-week-open; NOT registered here) call it
-- with finals built from the free nflverse games.csv already used for team
-- records. No cron job, credential, extension or network call is created here.

create table public.gtl_virtual_units_settlements (
  season integer not null, week integer not null, game_id text not null,
  version bigint not null check(version between 1 and 9007199254740990),
  status text not null check(status in ('final','postponed','cancelled')),
  home integer check(home between 0 and 200), away integer check(away between 0 and 200),
  source text not null check(length(btrim(source)) between 2 and 120),
  source_url text check(source_url is null or (source_url ~ '^https://[^[:space:]@]+$' and length(source_url)<=2048)),
  observed_at timestamptz not null,
  actor_id uuid references auth.users(id),
  settled_at timestamptz not null default clock_timestamp(),
  previous jsonb check(previous is null or jsonb_typeof(previous)='object'),
  picks_settled integer not null default 0 check(picks_settled>=0),
  check((status='final' and home is not null and away is not null) or (status<>'final' and home is null and away is null)),
  primary key(season,week,game_id,version),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_virtual_units_settlements_week_idx on public.gtl_virtual_units_settlements(season,week,settled_at desc);

-- p_results: {"source": text, "sourceUrl"?: https url, "observedAt"?: timestamptz,
--   "actorId"?: uuid (null for a scheduled run), "games": [{"gameId": text,
--   "status": "final"|"postponed"|"cancelled", "home"?: 0..200, "away"?: 0..200}]}
-- Refuses an unpublished week (GTL_SETTLEMENT_WEEK), a game id that is not on
-- that week's slate (GTL_SETTLEMENT_GAME), any status other than final or the
-- two void statuses, malformed scores or keys (GTL_SETTLEMENT_INPUT), and a
-- final before that game's scheduled kickoff (GTL_SETTLEMENT_EARLY). A refused
-- call settles nothing: the whole statement rolls back.
create function public.gtl_settle_virtual_units(p_season integer,p_week integer,p_results jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sig jsonb; item jsonb; g jsonb; v_game text; v_status text; v_home integer; v_away integer; v_source text; v_url text;
  observed timestamptz; actor uuid; stamp timestamptz; latest public.gtl_virtual_units_settlements; ver bigint; kickoff timestamptz;
  pick public.gtl_virtual_units_picks; outcome text; diff numeric; units numeric; odds numeric; line numeric; side text; net numeric; payout numeric;
  graded jsonb; event jsonb; changed integer; settled integer:=0; corrected integer:=0; unchanged integer:=0;
  games jsonb:='[]'::jsonb; touched jsonb:='[]'::jsonb; seen text[]:='{}';
begin
  if p_season is null or p_week is null or p_season<2000 or p_season>2200 or p_week<1 or p_week>25 then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_SETTLEMENT_WEEK'; end if;
  if p_results is null or jsonb_typeof(p_results)<>'object' or jsonb_typeof(p_results->'games') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(p_results) k where k not in ('source','sourceUrl','observedAt','actorId','games'))
    or jsonb_typeof(p_results->'source') is distinct from 'string' or length(btrim(p_results->>'source'))<2 or length(p_results->>'source')>120
    or (p_results->'sourceUrl' is not null and jsonb_typeof(p_results->'sourceUrl')<>'null'
      and (jsonb_typeof(p_results->'sourceUrl')<>'string' or p_results->>'sourceUrl' !~ '^https://[^[:space:]@]+$' or length(p_results->>'sourceUrl')>2048))
    or (p_results->'observedAt' is not null and jsonb_typeof(p_results->'observedAt') not in ('string','null'))
    or (p_results->'actorId' is not null and jsonb_typeof(p_results->'actorId') not in ('string','null'))
    then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
  stamp:=clock_timestamp();
  begin observed:=coalesce((p_results->>'observedAt')::timestamptz,stamp); actor:=(p_results->>'actorId')::uuid;
    exception when others then raise exception 'GTL_SETTLEMENT_INPUT'; end;
  if not isfinite(observed) or observed>stamp then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
  v_source:=btrim(p_results->>'source'); v_url:=p_results->>'sourceUrl';
  -- One settlement writer per season/week; service_role holds only select on the slate, so lock by key.
  perform pg_advisory_xact_lock(hashtext('gtl_virtual_units_settlement'),p_season*100+p_week);
  for item in select x from jsonb_array_elements(p_results->'games') x loop
    if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('gameId','status','home','away'))
      or jsonb_typeof(item->'gameId') is distinct from 'string' or jsonb_typeof(item->'status') is distinct from 'string' then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
    v_game:=item->>'gameId'; v_status:=item->>'status';
    if v_game=any(seen) then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
    seen:=seen||v_game;
    select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=v_game;
    if g is null then raise exception 'GTL_SETTLEMENT_GAME'; end if;
    kickoff:=to_timestamp((g->>'kickoff')::double precision);
    if v_status='final' then
      if jsonb_typeof(item->'home') is distinct from 'number' or jsonb_typeof(item->'away') is distinct from 'number'
        or (item->>'home') !~ '^[0-9]{1,3}$' or (item->>'away') !~ '^[0-9]{1,3}$' or (item->>'home')::integer>200 or (item->>'away')::integer>200
        then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
      v_home:=(item->>'home')::integer; v_away:=(item->>'away')::integer;
      if stamp<kickoff then raise exception 'GTL_SETTLEMENT_EARLY'; end if;
    elsif v_status in ('postponed','cancelled') then
      if coalesce(jsonb_typeof(item->'home'),'null')<>'null' or coalesce(jsonb_typeof(item->'away'),'null')<>'null' then raise exception 'GTL_SETTLEMENT_INPUT'; end if;
      v_home:=null; v_away:=null;
    else raise exception 'GTL_SETTLEMENT_INPUT'; end if;
    select * into latest from public.gtl_virtual_units_settlements where season=p_season and week=p_week and game_id=v_game order by version desc limit 1;
    if latest.version is not null and latest.status=v_status and latest.home is not distinct from v_home and latest.away is not distinct from v_away then
      -- The same result again: nothing to write. Source or fetch time alone never makes a new version.
      unchanged:=unchanged+1;
      games:=games||jsonb_build_object('gameId',v_game,'status',v_status,'version',latest.version,'changed',false,'picksSettled',0);
      continue;
    end if;
    ver:=coalesce(latest.version,0)+1; changed:=0;
    for pick in select * from public.gtl_virtual_units_picks
      where season=p_season and week=p_week and game_id=v_game and not (status='void' and result->>'reason'='postponed')
      order by user_id,market for update loop
      side:=pick.selection->>'side'; line:=(pick.selection->>'line')::numeric; odds:=(pick.selection->>'odds')::numeric; units:=(pick.selection->>'units')::numeric;
      if v_status='final' then
        diff:=case when pick.market='spread' then (case when side='home' then v_home-v_away else v_away-v_home end)+line
          else (v_home+v_away-line)*(case when side='over' then 1 else -1 end) end;
        outcome:=case when diff>0 then 'win' when diff<0 then 'loss' else 'push' end;
      else diff:=null; outcome:='void'; end if;
      payout:=round(1+case when odds>0 then odds/100 else 100/abs(odds) end,4);
      net:=case outcome when 'win' then round(units*(payout-1),4) when 'loss' then -units else 0 end;
      graded:=jsonb_build_object('outcome',outcome,'status',v_status,'reason',case when v_status='final' then null else v_status end,
        'home',v_home,'away',v_away,'margin',diff,'netUnits',net,'returnedUnits',case outcome when 'win' then round(units*payout,4) when 'loss' then 0 else units end,
        'payoutDecimal',payout,'version',ver,'settledAt',stamp,'observedAt',observed,'source',v_source,'sourceUrl',v_url,
        'previous',case when pick.result is null then null else jsonb_build_object('outcome',pick.result->>'outcome','netUnits',pick.result->'netUnits','version',pick.result->'version') end);
      event:=jsonb_build_object('id',gen_random_uuid(),'type',case when pick.result is null then 'settled' when outcome='void' then 'voided' else 'resettled' end,
        'timestamp',stamp,'before',pick.result,'after',graded);
      -- selection, created_at and updated_at stay exactly as the player saved them.
      update public.gtl_virtual_units_picks set status=outcome,result=graded,audit=audit||jsonb_build_array(event)
        where user_id=pick.user_id and season=pick.season and week=pick.week and game_id=pick.game_id and market=pick.market;
      changed:=changed+1;
      touched:=touched||jsonb_build_object('userId',pick.user_id,'gameId',v_game,'market',pick.market,'outcome',outcome,'previousOutcome',pick.result->>'outcome','netUnits',net);
    end loop;
    insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,source_url,observed_at,actor_id,settled_at,previous,picks_settled)
      values(p_season,p_week,v_game,ver,v_status,v_home,v_away,v_source,v_url,observed,actor,stamp,
        case when latest.version is null then null else jsonb_build_object('version',latest.version,'status',latest.status,'home',latest.home,'away',latest.away,'settledAt',latest.settled_at) end,changed);
    if latest.version is null then settled:=settled+1; else corrected:=corrected+1; end if;
    games:=games||jsonb_build_object('gameId',v_game,'status',v_status,'version',ver,'changed',true,'picksSettled',changed,
      'previous',case when latest.version is null then null else jsonb_build_object('version',latest.version,'status',latest.status,'home',latest.home,'away',latest.away) end);
  end loop;
  -- D-21 hook (not built): score-change / weekly-winner feed posts and D-18
  -- corrected-result notices can read `picks` (per pick: userId, gameId, market,
  -- outcome, previousOutcome, netUnits) and `players` from this return value or
  -- from the audit events written above. No post or notice is created here.
  return jsonb_build_object('season',p_season,'week',p_week,'settledAt',stamp,'source',v_source,'sourceUrl',v_url,
    'games',games,'settled',settled,'corrected',corrected,'unchanged',unchanged,'picksSettled',jsonb_array_length(touched),'picks',touched,
    'players',coalesce((select jsonb_agg(jsonb_build_object('userId',u,'picksSettled',n,'netUnitsDelta',d) order by u)
      from (select e->>'userId' u,count(*) n,sum((e->>'netUnits')::numeric) d from jsonb_array_elements(touched) e group by 1) t),'[]'::jsonb));
end $$;

-- The reader now returns the latest settlement per slate game (`results`) and a
-- `settlement` block; record, net units and ROI still come from settled picks
-- only, and qualification still counts every placed pick (D-18).
create or replace function public.gtl_read_virtual_units(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; rows jsonb; wins integer; losses integer; pushes integer; pending integer; voids integer; risk numeric; net numeric; results jsonb; last_settled timestamptz;
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
    coalesce(sum(case when status in ('win','loss','push') then coalesce((result->>'netUnits')::numeric,case when status='loss' then -(selection->>'units')::numeric else 0 end) else 0 end),0)
    into wins,losses,pushes,pending,voids,risk,net
    from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w;
  select coalesce(jsonb_object_agg(game_id,jsonb_build_object('status',status,'home',home,'away',away,'version',version,'settledAt',settled_at,'observedAt',observed_at,'source',source,'sourceUrl',source_url)),'{}'::jsonb),max(settled_at)
    into results,last_settled
    from (select distinct on (game_id) * from public.gtl_virtual_units_settlements where season=s and week=w
      and exists(select 1 from jsonb_array_elements(c#>'{state,games}') g where g->>'id'=game_id) order by game_id,version desc) latest;
  return jsonb_build_object('season',s,'week',w,'revision',rev,'playerId',c->>'playerId','league',c->'state'->'league',
    'games',c->'state'->'games','picks',rows,'results',results,
    'settlement',jsonb_build_object('settledGames',(select count(*) from jsonb_object_keys(results)),'lastSettledAt',last_settled,'settledPicks',wins+losses+pushes+voids,'pendingPicks',pending),
    'summary',jsonb_build_object('wins',wins,'losses',losses,'pushes',pushes,'pending',pending,'voids',voids,'riskUnits',risk,'netUnits',net,
      'roi',case when risk=0 then null else round(net/risk*100,2) end,'qualificationPicks',wins+losses+pushes+pending+voids,'qualificationUnits',coalesce((select sum((selection->>'units')::numeric) from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w),0)));
end $$;

alter table public.gtl_virtual_units_settlements enable row level security;
revoke all on public.gtl_virtual_units_settlements from public,anon,authenticated,service_role;
grant select,insert on public.gtl_virtual_units_settlements to service_role;
revoke all on function public.gtl_settle_virtual_units(integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_settle_virtual_units(integer,integer,jsonb) to service_role;
