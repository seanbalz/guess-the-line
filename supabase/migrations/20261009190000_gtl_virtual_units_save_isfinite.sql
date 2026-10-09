-- D-18 follow-up (October 9, 2026): the hosted public.gtl_save_virtual_units_pick
-- (created by 20261008240000_gtl_virtual_units.sql, hosted version 20261009110415)
-- guards its numeric inputs with isfinite(line), isfinite(odds) and
-- isfinite(units). PostgreSQL defines isfinite() for date, timestamp and interval
-- only, so every call that reaches that line fails with SQLSTATE 42883 "function
-- isfinite(numeric) does not exist" and no D-18 Virtual Units pick can be saved
-- on the hosted project (found in the PR #33 review; reproduced under PGlite
-- 0.5.8 / PostgreSQL 18 by tests/virtual-units-save-sql.test.mjs).
--
-- Hosted migration history is append-only, so the original file is untouched and
-- this file re-creates the function with the identical signature, body and
-- grants, changing only the three numeric finiteness checks. They now use the
-- small immutable helper below: 'NaN'::numeric equals itself and sorts above
-- every other numeric, and 'Infinity'::numeric / '-Infinity'::numeric exist since
-- PostgreSQL 14, so a numeric is finite when it is none of the three. A null (the
-- body omitted the key, since the text-to-numeric cast above the check already
-- refuses anything else) is not finite either, so a missing line, odds or units
-- is refused as GTL_VIRTUAL_INVALID instead of passing null through the
-- remaining comparisons. The timestamptz check isfinite(quoted) is valid and
-- stays as it was. Every other validation (revision, body keys, game, market and
-- side, kickoff, half-point lines, integer odds in 100..10000, positive half-unit
-- stakes, quote time, source length) is byte-for-byte the original.
-- gtl_read_virtual_units, which 20261009170000_gtl_virtual_units_settlement.sql
-- re-created, is not touched.

create or replace function public.gtl_numeric_is_finite(p_value numeric) returns boolean
language sql immutable set search_path='' as $$
  select p_value is not null and p_value<>'NaN'::numeric and p_value<>'Infinity'::numeric and p_value<>'-Infinity'::numeric
$$;

create or replace function public.gtl_save_virtual_units_pick(p_user uuid,p_league text,p_revision bigint,p_body jsonb) returns bigint
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
  if not public.gtl_numeric_is_finite(line) or not public.gtl_numeric_is_finite(odds) or not public.gtl_numeric_is_finite(units) or not isfinite(quoted) or line*2<>trunc(line*2)
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

-- create or replace keeps existing privileges; the original grants are restated
-- so this file stands on its own and load order never matters.
revoke all on function public.gtl_numeric_is_finite(numeric),public.gtl_save_virtual_units_pick(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_numeric_is_finite(numeric),public.gtl_save_virtual_units_pick(uuid,text,bigint,jsonb) to service_role;
