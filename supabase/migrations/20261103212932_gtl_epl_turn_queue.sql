-- replaces public.gtl_epl_save_pick md5 a077d98ad82e5e161bc23018b6e841c2
-- replaces public.gtl_epl_save_queue md5 96df64835d5c206c7bc85f3d95ae4217
-- replaces public.gtl_epl_week_state md5 82ab06aaa1422df82265e42dd3be044e


-- M-40: use saved backup rankings immediately when a manager reaches the clock.
-- Only future pick/queue writes advance the draft. Applying this file performs no picks or backfill.
-- Queues remain private. All three writers serialize on the same week row; no browser must stay open.
-- No available ranked club: leave that manager on the clock. Existing kickoff resolution is unchanged.

create or replace function public.gtl_epl_advance_queues(p_season integer,p_week integer,p_now timestamptz default null) returns integer
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; stamp timestamptz:=coalesce(p_now,clock_timestamp()); idx integer; chosen text; added integer:=0;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status<>'open' or stamp>=w.first_kickoff then return 0; end if;
  loop
    select min(i) into idx from generate_subscripts(w.pick_order,1) as i
      where not exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=w.pick_order[i]);
    exit when idx is null;
    select c.club into chosen from public.gtl_epl_queues q cross join lateral unnest(q.clubs) with ordinality as c(club,rank)
      where q.season=p_season and q.week=p_week and q.owner_id=w.pick_order[idx]
      and exists(select 1 from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week and f.status<>'postponed' and (f.home=c.club or f.away=c.club))
      and not exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.club=c.club)
      order by c.rank limit 1;
    exit when not found;
    insert into public.gtl_epl_picks(season,week,owner_id,club,source,picked_at,final)
      values(p_season,p_week,w.pick_order[idx],chosen,'queue',stamp,false);
    if idx>1 then update public.gtl_epl_picks set final=true where season=p_season and week=p_week and owner_id=w.pick_order[idx-1]; end if;
    insert into public.gtl_epl_pick_history(season,week,owner_id,club,action,at)
      values(p_season,p_week,w.pick_order[idx],chosen,'queue:turn',stamp);
    added:=added+1;
  end loop;
  return added;
end $$;
revoke all on function public.gtl_epl_advance_queues(integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_epl_advance_queues(integer,integer,timestamptz) to service_role;

create or replace function public.gtl_epl_save_pick(p_user uuid,p_season integer,p_week integer,p_club text,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); w public.gtl_epl_weeks; v_owner text; v_club text:=btrim(p_club);
  cur_idx integer; last_idx integer; idx integer; act text; prior text; prior_final boolean;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status<>'open' or now_at>=w.first_kickoff then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  v_owner:=public.gtl_epl_member(p_user);
  idx:=case when v_owner is null or v_owner='commissioner' then null else array_position(w.pick_order,v_owner) end;
  if idx is null then raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
  -- The current picker is the first manager in the order without a pick; the most recent picker is the one before them.
  select min(i) into cur_idx from generate_subscripts(w.pick_order,1) as i
    where not exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=w.pick_order[i]);
  last_idx:=case when cur_idx is null then cardinality(w.pick_order) else cur_idx-1 end;
  if cur_idx is not null and idx=cur_idx then act:='pick';
  elsif last_idx>=1 and idx=last_idx then act:='change';
  else raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
  if v_club is null or v_club='' or not exists(select 1 from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week
      and f.status<>'postponed' and (f.home=v_club or f.away=v_club)) then raise exception 'GTL_EPL_CLUB_NOT_PLAYING' using errcode='P0001'; end if;
  begin
    if act='pick' then
      insert into public.gtl_epl_picks(season,week,owner_id,club,source,picked_at,final) values(p_season,p_week,v_owner,v_club,'pick',now_at,false);
      -- The previous manager's pick can no longer change once the next manager has picked.
      if idx>1 then update public.gtl_epl_picks set final=true where season=p_season and week=p_week and owner_id=w.pick_order[idx-1]; end if;
    else
      select k.club,k.final into prior,prior_final from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=v_owner;
      -- A final pick never changes (a seeded week can hold the latest picker's pick as final).
      if prior_final then raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
      if prior is distinct from v_club then
        update public.gtl_epl_picks set club=v_club,picked_at=now_at,source='pick' where season=p_season and week=p_week and owner_id=v_owner;
      else act:='unchanged'; end if;
    end if;
  exception when unique_violation then raise exception 'GTL_EPL_CLUB_TAKEN' using errcode='P0001';
  end;
  if act<>'unchanged' then
    insert into public.gtl_epl_pick_history(season,week,owner_id,club,action,at) values(p_season,p_week,v_owner,v_club,act,now_at);
  end if;
  perform public.gtl_epl_advance_queues(p_season,p_week,now_at);
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',v_owner,'club',v_club,'action',act,
    'picks',(public.gtl_epl_week_state(p_season,p_week))->'picks');
end $$;

create or replace function public.gtl_epl_save_queue(p_user uuid,p_season integer,p_week integer,p_clubs text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner text:=public.gtl_epl_member(p_user); list text[]; w public.gtl_epl_weeks; stamp timestamptz;
begin
  if owner is null or owner='commissioner' then raise exception 'GTL_EPL_NOT_MEMBER' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  stamp:=clock_timestamp();
  if w.status<>'open' or stamp>=w.first_kickoff then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  select coalesce(array_agg(c order by first_pos),'{}') into list from (
    select btrim(x) as c,min(n) as first_pos from unnest(coalesce(p_clubs,'{}')) with ordinality as t(x,n) where btrim(x)<>'' group by btrim(x)) q;
  if cardinality(list)>20 then raise exception 'GTL_EPL_QUEUE_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_queues(season,week,owner_id,clubs,updated_at) values(p_season,p_week,owner,list,clock_timestamp())
    on conflict(season,week,owner_id) do update set clubs=excluded.clubs,updated_at=excluded.updated_at;
  perform public.gtl_epl_advance_queues(p_season,p_week,stamp);
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',owner,'clubs',to_jsonb(list));
end $$;

create or replace function public.gtl_epl_week_state(p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare w public.gtl_epl_weeks;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week;
  if not found then return null; end if;
  return jsonb_build_object('queueOnTurn',true,'season',p_season,'week',p_week,
    'weekRow',jsonb_build_object('windowStart',w.window_start,'windowEnd',w.window_end,'firstKickoff',w.first_kickoff,
      'pickOrder',to_jsonb(w.pick_order),'status',w.status,'seeded',w.seeded),
    'picks',coalesce((select jsonb_agg(jsonb_build_object('ownerId',k.owner_id,'club',k.club,'source',k.source,'pickedAt',k.picked_at,'final',k.final)
        order by coalesce(array_position(w.pick_order,k.owner_id),99),k.owner_id)
      from public.gtl_epl_picks k where k.season=p_season and k.week=p_week),'[]'::jsonb),
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'homeGoals',f.home_goals,'awayGoals',f.away_goals) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week),'[]'::jsonb),
    'bonus',coalesce((select jsonb_agg(jsonb_build_object('ownerId',b.owner_id,'points',b.points,'margin',b.margin,'club',b.club) order by b.owner_id)
      from public.gtl_epl_bonus b where b.season=p_season and b.week=p_week-1),'[]'::jsonb));
end $$;
