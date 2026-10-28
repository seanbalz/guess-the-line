-- M-19 / D-64 (proposed — needs Sean): automatic settlement of pending shared Bet Tracker tickets.
--
-- Sean, October 28, 2026: "make sure that all pending bets are settled after the day that the game completes.
-- There are still pending bets from week 7." Virtual Units and recommended picks (gtl_virtual_units_picks) already
-- settle on every gtl-results-refresh run (D-26, gtl_settle_virtual_units). Shared Bet Tracker tickets
-- (gtl_social_weeks, one JSON document per week) had no automatic path: a tracked ticket stayed pending until its
-- owner reported a result, and a virtual ticket could never be settled at all. This file adds that path.
--
-- Rule. A pending single whose one leg is a spread or total is settled once
--   (1) the game's latest final in the D-26 ledger (gtl_virtual_units_settlements, the same verified nflverse finals
--       the worker already records) is 'final', and
--   (2) the game's America/Los_Angeles calendar day has ended: eligible at 00:00 Pacific on the day after kickoff.
--       If the ledger ever recorded the game as postponed or cancelled, the day is the one on which that final (or the
--       cancellation) was observed, so a rescheduled game waits for the day it is actually played.
-- A latest 'postponed' row keeps the ticket pending; a latest 'cancelled' row voids it. Grading is D-26's: the chosen
-- side covers the saved line (spread: own score − other score + line; total: (home + away − line) × ±1); exactly on
-- the line is a push. Net units: win = stake × American-odds multiplier rounded to four places, loss = −stake,
-- push = 0, void = none (excluded from ROI, as before). The ticket's saved odds, stake, line and source never change.
--
-- Never touched: a settled ticket (any result a player reported, settlementSource 'user_reported'); a pending ticket
-- whose owner has ever reported a result for it (a deliberate reopen); parlays and props (counted as needsManual, by
-- reason); a leg whose game is not on that week's published slate. A ticket this function settled is settled again
-- only when the ledger records a newer version for its game (a corrected final), never un-settled by a later
-- postponement.
--
-- Writes. Each settled ticket gets outcome, settledAt, updatedAt, settlementSource 'automatic_final', revision + 1
-- and an autoSettlement block (final score, margin, net units, ledger version, source, sourceUrl, observedAt,
-- eligibleAt). The week's audit gains one 'settle' event per ticket by actorId 'system' (no player), with the
-- before/after entry, source and observedAt, and the week's revision goes up once, so a player's in-flight write is
-- refused as stale (GTL_SOCIAL_CONFLICT) instead of overwriting it. No gtl_social_commits row is written (it names a
-- player), so no feed post is created. Idempotent and replay-safe: a ticket is settled once per ledger version, a
-- second run changes nothing and keeps the revision.
--
-- Service-only, security invoker, empty search path. Called by the gtl-results-refresh worker after it stores
-- finals (cloud/results-refresh.mjs) and, once, by supabase/admin/settle_pending_backfill.sql. p_dry_run returns the
-- same report and writes nothing. p_now may only move the clock back (a preview "as of"), never ahead.

create function public.gtl_social_auto_grade(p_season integer,p_week integer,p_entry jsonb,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare leg jsonb; g jsonb; v_game text; v_market text; v_side text; v_line numeric; kickoff timestamptz;
  latest public.gtl_virtual_units_settlements; anchor timestamptz; eligible timestamptz; diff numeric; outcome text;
  units numeric; odds numeric; multiplier numeric; net numeric;
begin
  if jsonb_typeof(p_entry) is distinct from 'object' or jsonb_typeof(p_entry->'legs') is distinct from 'array' or jsonb_array_length(p_entry->'legs')<1 then
    return jsonb_build_object('status','manual','reason','invalid'); end if;
  if p_entry->>'kind' is distinct from 'single' or jsonb_array_length(p_entry->'legs')<>1 then
    return jsonb_build_object('status','manual','reason',case when p_entry->>'kind'='parlay' then 'parlay' else 'invalid' end); end if;
  leg:=p_entry->'legs'->0; v_game:=leg->>'gameId'; v_market:=leg->>'market'; v_side:=leg->>'side';
  if v_market is distinct from 'spread' and v_market is distinct from 'total' then
    return jsonb_build_object('status','manual','reason',case when v_market='prop' then 'prop' else 'market' end,'gameId',v_game); end if;
  if jsonb_typeof(leg->'line') is distinct from 'number' or v_side is null
    or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under')) then
    return jsonb_build_object('status','manual','reason','invalid','gameId',v_game); end if;
  v_line:=(leg->>'line')::numeric;
  select x into g from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(s.signature->'games') x
    where s.season=p_season and s.week=p_week and x->>'id'=v_game;
  if g is null then return jsonb_build_object('status','manual','reason','unknown_game','gameId',v_game); end if;
  kickoff:=to_timestamp((g->>'kickoff')::double precision);
  select * into latest from public.gtl_virtual_units_settlements where season=p_season and week=p_week and game_id=v_game order by version desc limit 1;
  if latest.version is null then return jsonb_build_object('status','waiting','reason','no_final','gameId',v_game); end if;
  if latest.status='postponed' then return jsonb_build_object('status','waiting','reason','postponed','gameId',v_game); end if;
  anchor:=kickoff;
  if latest.status='cancelled' or exists(select 1 from public.gtl_virtual_units_settlements
      where season=p_season and week=p_week and game_id=v_game and status<>'final') then anchor:=greatest(kickoff,latest.observed_at); end if;
  -- 00:00 America/Los_Angeles on the day after the game's Pacific calendar day (daylight time handled by the zone).
  eligible:=(((anchor at time zone 'America/Los_Angeles')::date+1)::timestamp at time zone 'America/Los_Angeles');
  if p_now<eligible then return jsonb_build_object('status','waiting','reason','before_day_end','gameId',v_game,'eligibleAt',eligible); end if;
  units:=case when jsonb_typeof(p_entry->'stakeUnits')='number' and (p_entry->>'stakeUnits')::numeric>0 then (p_entry->>'stakeUnits')::numeric end;
  odds:=case when jsonb_typeof(p_entry->'odds')='number' and abs((p_entry->>'odds')::numeric)>=100 then (p_entry->>'odds')::numeric end;
  if latest.status='cancelled' then diff:=null; outcome:='void';
  else
    diff:=case when v_market='spread' then (case when v_side='home' then latest.home-latest.away else latest.away-latest.home end)+v_line
      else (latest.home+latest.away-v_line)*(case when v_side='over' then 1 else -1 end) end;
    outcome:=case when diff>0 then 'win' when diff<0 then 'loss' else 'push' end;
  end if;
  multiplier:=case when odds is null then null when odds>0 then odds/100 else 100/abs(odds) end;
  net:=case outcome when 'win' then round(units*multiplier,4) when 'loss' then -units when 'push' then units*0 else null end;
  return jsonb_build_object('status','settle','outcome',outcome,'gameId',v_game,'market',v_market,'resultStatus',latest.status,
    'home',latest.home,'away',latest.away,'margin',diff,'netUnits',net,'version',latest.version,
    'source',latest.source,'sourceUrl',latest.source_url,'observedAt',latest.observed_at,'eligibleAt',eligible);
end $$;

create function public.gtl_settle_social_pending(p_season integer default null,p_week integer default null,
  p_now timestamptz default null,p_dry_run boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); v_now timestamptz; at_text text; wk record; saved public.gtl_social_weeks;
  entries jsonb; events jsonb; entry jsonb; grade jsonb; next_entry jsonb; regrade boolean; touched integer; i integer; k text;
  settled integer:=0; voided integer:=0; regraded integer:=0; reopened integer:=0; limited integer:=0;
  waiting jsonb:='{}'::jsonb; manual jsonb:='{}'::jsonb; outcomes jsonb:='{}'::jsonb; weeks jsonb:='[]'::jsonb; changes jsonb:='[]'::jsonb;
begin
  if p_dry_run is null or (p_week is not null and p_season is null) or p_season<2000 or p_season>2200 or p_week<1 or p_week>25 then
    raise exception 'GTL_SOCIAL_SETTLE_INPUT'; end if;
  v_now:=coalesce(p_now,stamp);
  if not isfinite(v_now) or v_now>stamp then raise exception 'GTL_SOCIAL_SETTLE_INPUT'; end if;
  at_text:=to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for wk in select season,week from public.gtl_social_weeks
      where (p_season is null or season=p_season) and (p_week is null or week=p_week) order by season,week loop
    -- The same row lock gtl_commit_social takes, so a player's write and this run serialize on the week.
    if p_dry_run then select * into saved from public.gtl_social_weeks where season=wk.season and week=wk.week;
    else select * into saved from public.gtl_social_weeks where season=wk.season and week=wk.week for update; end if;
    entries:=saved.state->'entries'; events:='[]'::jsonb; touched:=0;
    for i in 0..jsonb_array_length(entries)-1 loop
      entry:=entries->i;
      regrade:=entry->>'settlementSource'='automatic_final' and entry->>'outcome' in ('win','loss','push','void');
      if entry->>'outcome' is distinct from 'pending' and not regrade then continue; end if;
      grade:=public.gtl_social_auto_grade(saved.season,saved.week,entry,v_now);
      if regrade then
        -- Only a newer ledger version (a corrected final or a cancellation ruling) re-grades a system settlement.
        if grade->>'status'<>'settle' or (grade->>'version')::bigint<=coalesce((entry#>>'{autoSettlement,version}')::bigint,0) then continue; end if;
      else
        if grade->>'status'='manual' then k:=grade->>'reason'; manual:=jsonb_set(manual,array[k],to_jsonb(coalesce((manual->>k)::integer,0)+1)); continue; end if;
        if grade->>'status'='waiting' then k:=grade->>'reason'; waiting:=jsonb_set(waiting,array[k],to_jsonb(coalesce((waiting->>k)::integer,0)+1)); continue; end if;
        -- An owner who reported a result and later set the ticket back to pending made a choice; it is never overridden.
        if exists(select 1 from jsonb_array_elements(saved.state->'audit') e
            where e->>'entryId'=entry->>'id' and e->>'action'='settle' and e->>'actorId'=entry->>'ownerId') then reopened:=reopened+1; continue; end if;
      end if;
      next_entry:=entry||jsonb_build_object('outcome',grade->>'outcome','settledAt',at_text,'updatedAt',at_text,
        'settlementSource','automatic_final','actualReturnUnits',null,'revision',coalesce((entry->>'revision')::bigint,0)+1,
        'autoSettlement',(grade-'status')||jsonb_build_object('settledAt',at_text,'actor','system'));
      entries:=jsonb_set(entries,array[i::text],next_entry);
      events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId','system','action','settle','entryId',entry->>'id','at',at_text,
        'reason',case when regrade then 'Final score corrected; settled again automatically from ' else 'Settled automatically from the verified final score: ' end||(grade->>'source'),
        'source',grade->'source','sourceUrl',grade->'sourceUrl','observedAt',grade->'observedAt','before',entry,'after',next_entry));
      touched:=touched+1;
      if regrade then regraded:=regraded+1; elsif grade->>'outcome'='void' then voided:=voided+1; else settled:=settled+1; end if;
      outcomes:=jsonb_set(outcomes,array[grade->>'outcome'],to_jsonb(coalesce((outcomes->>(grade->>'outcome'))::integer,0)+1));
      changes:=changes||jsonb_build_object('season',saved.season,'week',saved.week,'entryId',entry->>'id','gameId',grade->>'gameId',
        'outcome',grade->>'outcome','previousOutcome',entry->>'outcome','netUnits',grade->'netUnits','version',grade->'version');
    end loop;
    if touched=0 then continue; end if;
    if jsonb_array_length(saved.state->'audit')+touched>20000 then
      -- The week's audit is full (GTL_SOCIAL_LIMIT for players too); report it rather than drop history.
      limited:=limited+touched; continue;
    end if;
    if not p_dry_run then
      update public.gtl_social_weeks set state=jsonb_set(jsonb_set(saved.state,'{entries}',entries),'{audit}',(saved.state->'audit')||events),
        revision=saved.revision+1,updated_at=stamp where season=saved.season and week=saved.week;
    end if;
    weeks:=weeks||jsonb_build_object('season',saved.season,'week',saved.week,'revision',saved.revision+case when p_dry_run then 0 else 1 end,'settled',touched);
  end loop;
  return jsonb_build_object('dryRun',p_dry_run,'asOf',v_now,'settledAt',stamp,'settled',settled,'voided',voided,'regraded',regraded,
    'outcomes',outcomes,'waiting',waiting,'needsManual',manual,'userReopened',reopened,'auditFull',limited,'weeks',weeks,'changes',changes);
end $$;

revoke all on function public.gtl_social_auto_grade(integer,integer,jsonb,timestamptz),
  public.gtl_settle_social_pending(integer,integer,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.gtl_social_auto_grade(integer,integer,jsonb,timestamptz),
  public.gtl_settle_social_pending(integer,integer,timestamptz,boolean) to service_role;
