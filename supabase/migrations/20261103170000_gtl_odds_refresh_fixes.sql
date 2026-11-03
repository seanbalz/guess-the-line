-- M-37 (board item 40): two fixes to the twelve-hour odds refresh. No table, row, grant, schedule or credential changes.
--
-- 1. gtl_claim_odds_refresh asks the worker for a fresh zero-credit preflight once the last one is over 23 hours old, not
--    24. The collection that follows still refuses a preflight over 24 hours old (GTL_ODDS_PREFLIGHT_REQUIRED). With the
--    same 24 hours in both places and slots 12 hours apart, a preflight 23h59m58s old at the claim was not redone and was
--    then refused a second or two later at the collection, so the run was skipped as budget_guard (October 29 06:15 UTC,
--    with 400 credits left). The hour of margin keeps the claim's answer valid for the whole run. A preflight costs no
--    credits (x-requests-last 0), and it now lands on every other run, as intended.
-- 2. gtl_complete_odds_refresh counts a run as partial against the games not yet started when its collection began, not
--    against the whole week. The provider stops listing a game once it kicks off, so every run after Thursday's game was
--    partial (15 of the 19 runs from October 25 to November 3). A run is now partial only when a game still to be played has
--    no match or fewer than 6 quotes (3 books x spread and total).
--
-- Each body is otherwise the current hosted definition, byte for byte. Rollback: supabase/rollback/<this file>.

-- replaces public.gtl_claim_odds_refresh md5 de8b1651570a0d8119522d5250022c6f
-- replaces public.gtl_complete_odds_refresh md5 bd3c40ae00acfc271946ee95cb265107

create or replace function public.gtl_claim_odds_refresh(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_odds_schedule; run public.gtl_odds_refresh_runs; c jsonb; failure text;
  stamp timestamptz:=clock_timestamp(); upcoming integer; claim uuid; budget public.gtl_odds_budget;
begin
  select * into cfg from public.gtl_odds_schedule where id='nfl-12h';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_odds_refresh_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact private run BEFORE returning even a replay.
  -- A leaked/redirected queue token cannot choose actor, slate, budget or another
  -- run, and expires regardless of whether the original worker ever claimed it.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '12 hours',stamp,timestamptz '2000-01-01 06:15:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  begin c:=public.gtl_odds_collection_slate(cfg.authorized_by);
  exception when others then failure:=case when sqlerrm='GTL_ODDS_FORBIDDEN' then 'commissioner_unavailable' else 'slate_unavailable' end; end;
  if failure is null then
    if public.gtl_odds_schedule_slate(cfg.season,cfg.week,cfg.slate_signature) is null
      or c->'signature' is distinct from cfg.slate_signature or (c->>'season')::integer<>cfg.season or (c->>'week')::integer<>cfg.week then failure:='slate_changed';
    elsif jsonb_typeof(c->'games') is distinct from 'array' or jsonb_array_length(c->'games')<1
      or jsonb_array_length(c->'games')<>jsonb_array_length(cfg.slate_signature->'games') then failure:='slate_unavailable';
    else
      select count(*) into upcoming from jsonb_array_elements(c->'games') g where (g->>'kickoff')::timestamptz>stamp;
      if upcoming=0 then failure:='all_games_started'; end if;
    end if;
  end if;
  if failure is not null then
    update public.gtl_odds_refresh_runs set status='skipped',reason=failure,finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason',failure);
  end if;
  claim:=gen_random_uuid();
  update public.gtl_odds_refresh_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  select * into budget from public.gtl_odds_budget where provider='the-odds-api';
  -- 23, not 24: the collection refuses a preflight over 24 hours old moments later, so this answer must hold for the run.
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'actorId',cfg.authorized_by,
    'preflightRequestId',run.preflight_request_id,'collectionRequestId',run.collection_request_id,
    'needsPreflight',budget.last_successful_preflight_at is null or budget.last_successful_preflight_at<stamp-interval '23 hours' or budget.conservative_remaining is null);
end $$;

create or replace function public.gtl_complete_odds_refresh(p_run uuid,p_claim uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_odds_refresh_runs; collection public.gtl_odds_collections; state text; result_reason text; n integer;
begin
  select * into run from public.gtl_odds_refresh_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  if p_reason is not null and p_reason not in ('budget_guard','cooldown','daily_limit','collection_busy','preflight_failed','provider_failed','slate_changed','commissioner_unavailable') then raise exception 'GTL_SCHEDULE_RUN'; end if;
  select * into collection from public.gtl_odds_collections where id=run.collection_request_id;
  if found and collection.status='succeeded' then
    -- The games still to be played when the collection began: the provider no longer lists a game once it kicks off.
    select count(*) into n from jsonb_array_elements(coalesce(collection.slate_signature->'games','[]'::jsonb)) g
      where to_timestamp((g->>'kickoff')::double precision)>collection.started_at;
    if coalesce((collection.diagnostics->>'availableQuotes')::integer,0)=0 then state:='skipped'; result_reason:='no_quotes';
    elsif (collection.diagnostics->>'matchedEvents')::integer<n or (collection.diagnostics->>'availableQuotes')::integer<6*n then state:='partial';
    else state:='succeeded'; end if;
  else
    result_reason:=coalesce(p_reason,'provider_failed');
    state:=case when result_reason in ('budget_guard','cooldown','daily_limit','collection_busy','slate_changed','commissioner_unavailable') then 'skipped' else 'failed' end;
  end if;
  update public.gtl_odds_refresh_runs set status=state,reason=result_reason,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',result_reason);
end $$;
