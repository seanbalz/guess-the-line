-- M-27 me_history: Me › History, your own changes and the older records (redesign build plan stage 72; D-16, D-21, D-23,
-- D-27, D-30, D-36, D-39, D-41, D-43; Q8: the private journal is read-only in History).
--
-- Additive: four new service-only, security-invoker functions (two readers and two helpers). No table, trigger, row, grant on
-- an existing object or existing function body changes, and nothing is dropped, so there is no rollback file (Gate M step 9:
-- nothing is replaced). Until this file is applied, gtl-api's /me/changes and /me/records answer "History is not available
-- yet" (PostgREST's PGRST202, mapped in cloud/me.mjs) and every existing route answers exactly as today.
--
-- gtl_read_ballot_changes(p_user, p_season, p_week, p_now): the owner's own Guess the Spread and Guess the Total changes, read
-- from each of their weekly ballots' stored audit (every writer appends one event per save; D-16 keeps every revision). Only
-- `p_user`'s own ballots are read: another player's changes are never returned (D-16). Per event it gives the games the event
-- touched with the pick before and after, whether the event locked that game in, the line saved with it, the Late marker
-- (D-30: the event's save time after the week's deadline) and the ruling of a commissioner-ruled import (D-25). A game's
-- change shows once that game's market is past the draft stage for its owner: the guess is locked in (D-39), the game has
-- kicked off, or the owner sat out the market (D-23). Changes to a draft that can still change are counted, not listed, and
-- appear once the game is locked in or kicks off. No event carries a line for a game its owner has not locked in.
--
-- gtl_read_me_records(p_user, p_now): the older records.
-- * The retired Betting Challenge (D-35): every player's recorded selections with their quote. Another player's selection
--   shows once its game has kicked off (D-21), to a community member; before that only a count per player and week. The
--   owner's own selections always show. Grading is done by the old engine (server/domain.mjs gradeBet in cloud/me.mjs), from
--   each week's newest final, the same precedence as gtl_read_reviewed_results.
-- * Private to their owner: saved games and notes (gtl_favorites, every row, saved or not, with each change), personal
--   forecasts with each change, the journal (Q8, read-only; archived records included and labelled) with each record's
--   changes, and forfeit records (a skip, a "See picks now" or a D-23 sit-out). A journal record stays counted, not listed,
--   until its game's line is open to its owner (the market sent or locked in, a sit-out, or kickoff), the line lock it was
--   written under (gtl_read_personal's gate, widened to D-39's per-game lock-in and kickoff).
-- * The older group scoring views of each group the owner belongs to (gtl_prediction_archives): the archived source
--   timeline with the consensus line of each game that has kicked off and the count of archived invalid-matchup predictions.
--   The archived score movement (each snapshot's total) and the original picks and their points are the commissioner seat's
--   own record and go only to that seat, as the old History page shows them (server/engine.mjs: `id === 'sean'`); a game's
--   values show, to anyone, only once it has kicked off.
-- * The Week 5 benchmark freeze record (DP-4), read-only, for a member of its group, once its kickoff has passed.
-- Closed-at-kickoff drafts are not repeated here: /community/history already gives the owner every draft with its kickoff
-- and lock-in state (M-07), and History reads it there.

-- Each game of a published week, in kickoff order: { season, week, deadline, games: [{ id, awayCode, homeCode, kickoff }] }.
create function public.gtl_me_slate(p_season integer,p_week integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('season',z.season,'week',z.week,'deadline',to_timestamp((z.signature->>'deadline')::double precision),
    'games',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'kickoff',to_timestamp((g->>'kickoff')::double precision)) order by (g->>'kickoff')::double precision,g->>'id')
      from jsonb_array_elements(case when jsonb_typeof(z.signature->'games')='array' then z.signature->'games' else '[]'::jsonb end) g),'[]'::jsonb))
  from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week
$$;

-- Each game's newest recorded result for a week, { gameId: { status, home, away, origin } }: a commissioner-reviewed final or
-- an automatic settlement, whichever was recorded last (gtl_read_reviewed_results' precedence, which the old engine grades
-- Betting Challenge selections from).
create function public.gtl_me_results(p_season integer,p_week integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  with candidates as (
    select e.game_id,e.result->>'status' status,e.result->'home' home,e.result->'away' away,'commissioner_reported' origin,e.reviewed_at stamp,e.version
      from public.gtl_reviewed_result_events e where e.season=p_season and e.week=p_week
    union all
    select s.game_id,s.status,to_jsonb(s.home),to_jsonb(s.away),'settlement',s.settled_at,s.version
      from public.gtl_virtual_units_settlements s where s.season=p_season and s.week=p_week
  ), latest as (
    select distinct on (game_id) game_id,status,home,away,origin from candidates order by game_id,stamp desc,version desc
  )
  select coalesce(jsonb_object_agg(game_id,jsonb_build_object('status',status,'home',home,'away',away,'origin',origin)),'{}'::jsonb) from latest
$$;

create function public.gtl_read_ballot_changes(p_user uuid,p_season integer default null,p_week integer default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); b record; e record; ev jsonb; slate jsonb; deadline timestamptz;
  ids text[]; gid text; kick timestamptz; sat boolean; touched jsonb; changes jsonb; markets jsonb:='[]'; pending integer;
  kind text; locked_here boolean; legacy boolean; held boolean; stamp timestamptz; late jsonb; any_lock boolean; ref jsonb; before_ref jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_ME_PROFILE'; end if;
  if (p_season is null)<>(p_week is null) then raise exception 'GTL_ME_INVALID'; end if;
  for b in select x.season,x.week,x.mode,x.ballot,x.audit from public.gtl_weekly_ballots x
      where x.user_id=p_user and (p_season is null or (x.season=p_season and x.week=p_week))
      order by x.season desc,x.week desc,x.mode loop
    slate:=public.gtl_me_slate(b.season,b.week);
    continue when slate is null;
    deadline:=(slate->>'deadline')::timestamptz;
    sat:=exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=b.season and o.week=b.week and o.mode=b.mode);
    changes:='[]'; pending:=0;
    for e in select a.value ev,a.n from jsonb_array_elements(case when jsonb_typeof(b.audit)='array' then b.audit else '[]'::jsonb end) with ordinality a(value,n) order by a.n loop
      ev:=e.ev;
      continue when jsonb_typeof(ev) is distinct from 'object';
      legacy:=jsonb_typeof(ev->'changedGameIds') is distinct from 'array' and jsonb_typeof(ev->'lockedGameIds') is distinct from 'array';
      if legacy then
        -- An event written before the writers named the games: every game whose pick differs between before and after.
        select coalesce(array_agg(k order by k),'{}') into ids from jsonb_object_keys(
            (case when jsonb_typeof(ev->'before')='object' then ev->'before' else '{}'::jsonb end)
            ||(case when jsonb_typeof(ev->'after')='object' then ev->'after' else '{}'::jsonb end)) k
          where ev#>array['before',k] is distinct from ev#>array['after',k];
      else
        select coalesce(array_agg(distinct x),'{}') into ids from (
          select jsonb_array_elements_text(case when jsonb_typeof(ev->'changedGameIds')='array' then ev->'changedGameIds' else '[]'::jsonb end) x
          union select jsonb_array_elements_text(case when jsonb_typeof(ev->'lockedGameIds')='array' then ev->'lockedGameIds' else '[]'::jsonb end)) q;
      end if;
      begin stamp:=(ev->>'timestamp')::timestamptz; exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then stamp:=null; end;
      touched:='[]'; any_lock:=false; held:=false;
      for gid in select g->>'id' from jsonb_array_elements(slate->'games') g where g->>'id'=any(ids) order by (g->>'kickoff')::timestamptz,g->>'id' loop
        kick:=(select (g->>'kickoff')::timestamptz from jsonb_array_elements(slate->'games') g where g->>'id'=gid);
        -- Before per-game lock-in (M-02) a submission locked every game it carried; from M-02 the event names them.
        locked_here:=case when jsonb_typeof(ev->'lockedGameIds')='array' then ev->'lockedGameIds' ? gid else ev->>'type'='ballot_submitted' end;
        kind:=case when ev->>'type'='reference_resolved' then 'resolved' when locked_here then 'locked'
          when ev->>'type' in ('ballot_edited','ballot_submitted') then 'edited' else 'draft' end;
        -- A D-16-era draft save named every game; only the ones whose pick changed are a change.
        continue when kind in ('draft','edited') and ev#>array['before',gid] is not distinct from ev#>array['after',gid];
        -- A draft that can still change stays the owner's working copy in Play: counted, and listed once it is past the draft stage.
        if not (public.gtl_ballot_locked_in(b.ballot,gid) or kick<=now_at or sat) then held:=true; continue; end if;
        any_lock:=any_lock or kind in ('locked','edited');
        ref:=case when kind in ('locked','edited','resolved') then ev#>array['afterScoringReferences',gid] end;
        before_ref:=case when kind='resolved' then ev#>array['beforeScoringReferences',gid] end;
        touched:=touched||jsonb_build_array(jsonb_build_object('gameId',gid,'kind',kind,
          'before',case when kind<>'resolved' and jsonb_typeof(ev#>array['before',gid])='number' then ev#>array['before',gid] end,
          'after',case when kind<>'resolved' and jsonb_typeof(ev#>array['after',gid])='number' then ev#>array['after',gid] end,
          'reference',case when jsonb_typeof(ref)='object' then jsonb_build_object('status',ref->>'status','basis',ref->>'basis',
            'value',case when ref->>'status'='available' and jsonb_typeof(ref->'value')='number' then ref->'value' end,
            'observedAt',ref->'observedAt','source',ref->'source') end,
          'beforeReference',case when jsonb_typeof(before_ref)='object' then jsonb_build_object('status',before_ref->>'status','basis',before_ref->>'basis') end));
      end loop;
      if held then pending:=pending+1; end if;
      continue when jsonb_array_length(touched)=0;
      late:=case when any_lock and stamp is not null and stamp>=deadline
        then jsonb_build_object('deadline',deadline,'minutes',floor(extract(epoch from stamp-deadline)/60)::integer) end;
      changes:=changes||jsonb_build_array(jsonb_build_object('type',ev->>'type','at',case when stamp is not null then to_jsonb(stamp) end,
        'late',late,'ruled',case when ev->>'origin'='commissioner_ruled_import' then jsonb_build_object('decision',ev->'decision') end,
        'games',touched));
    end loop;
    markets:=markets||jsonb_build_array(jsonb_build_object('season',b.season,'week',b.week,'mode',b.mode,'deadline',deadline,
      'satOut',sat,'games',slate->'games','changes',changes,'pendingChanges',pending));
  end loop;
  return jsonb_build_object('ownerId',p_user,'season',p_season,'week',p_week,'now',now_at,'markets',markets);
end $$;

create function public.gtl_read_me_records(p_user uuid,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); member boolean; challenge jsonb; hidden jsonb; players jsonb;
  saved jsonb; forecasts jsonb; journal jsonb; journal_hidden integer; forfeits jsonb; sit_outs jsonb; archives jsonb; benchmarks jsonb; slates jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_ME_PROFILE'; end if;
  -- A removed account keeps its own records; only community members read other players' selections (D-21, D-23).
  member:=public.gtl_community_member(p_user);
  with sel as (
    select s.user_id,s.season,s.week,s.game_id,s.selection,s.origin_practice,
      (select to_timestamp((g->>'kickoff')::double precision) from public.gtl_weekly_slates z
        cross join lateral jsonb_array_elements(z.signature->'games') g where z.season=s.season and z.week=s.week and g->>'id'=s.game_id) kickoff
    from public.gtl_weekly_selections s
  ), shown as (
    select * from sel where user_id=p_user or (member and kickoff is not null and kickoff<=now_at)
  )
  select coalesce((select jsonb_agg(jsonb_build_object('userId',x.user_id,'season',x.season,'week',x.week,'gameId',x.game_id,'kickoff',x.kickoff,
        'practice',x.origin_practice,'market',x.selection->>'market','side',x.selection->>'side',
        'line',case when jsonb_typeof(x.selection->'line')='number' then x.selection->'line' end,
        'odds',case when jsonb_typeof(x.selection->'odds')='number' then x.selection->'odds' end,
        'source',x.selection->>'source','quotedAt',x.selection->'quotedAt','selectedAt',x.selection->'selectedAt','verification',x.selection->>'verification',
        'receipt',case when jsonb_typeof(x.selection->'quoteReceipt')='object' then jsonb_build_object('source',x.selection#>>'{quoteReceipt,source}',
          'quotedAt',x.selection#>'{quoteReceipt,quotedAt}','collectedAt',x.selection#>'{quoteReceipt,collectedAt}',
          'tradability',x.selection#>>'{quoteReceipt,tradability}') end)
      order by x.season desc,x.week desc,x.kickoff,x.game_id,x.user_id) from shown x),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('userId',h.user_id,'season',h.season,'week',h.week,'count',h.n) order by h.season desc,h.week desc,h.user_id)
      from (select user_id,season,week,count(*) n from sel where member and user_id<>p_user and not (kickoff is not null and kickoff<=now_at) group by 1,2,3) h),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p where p.user_id=p_user or (member and exists(select 1 from sel where sel.user_id=p.user_id))),'[]'::jsonb)
  into challenge,hidden,players;

  select coalesce(jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'gameId',f.game_id,'saved',f.saved,'note',f.notes,
      'createdAt',f.created_at,'updatedAt',f.updated_at,
      'changes',coalesce((select jsonb_agg(jsonb_build_object('at',e.created_at,'action',e.action,'before',e.before_value,'after',e.after_value) order by e.revision)
        from public.gtl_personal_events e where e.user_id=p_user and e.target=f.season||'/'||f.week||'/'||f.game_id and e.action in ('favorite/set','personal/note')),'[]'::jsonb))
    order by f.season desc,f.week desc,f.created_at,f.game_id),'[]'::jsonb)
  into saved from public.gtl_favorites f where f.user_id=p_user;

  select coalesce(jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'gameId',f.game_id,'market',f.market,'value',f.value,
      'savedAt',f.saved_at,'revision',f.revision,
      'changes',coalesce((select jsonb_agg(jsonb_build_object('at',e.created_at,'before',e.before_value->'value','after',e.after_value->'value') order by e.revision)
        from public.gtl_personal_events e where e.user_id=p_user and e.action='personal/forecast'
          and e.target=f.season||'/'||f.week||'/'||f.game_id||'/'||f.market),'[]'::jsonb))
    order by f.season desc,f.week desc,f.game_id,f.market),'[]'::jsonb)
  into forecasts from public.gtl_personal_forecasts f where f.user_id=p_user;

  with entries as (
    select j.*,coalesce(exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=j.season and b.week=j.week
        and b.mode=case when j.entry->>'market'='spread' then 'guess_spread' else 'guess_total' end and coalesce(b.ballot->>'submittedAt','')<>'')
      or public.gtl_guess_revealed(p_user,j.season,j.week,case when j.entry->>'market'='spread' then 'guess_spread' else 'guess_total' end,j.game_id,now_at),false) open
    from public.gtl_journal_entries j where j.user_id=p_user
  )
  select coalesce((select jsonb_agg(x.entry||jsonb_build_object('id',x.id,'season',x.season,'week',x.week,'gameId',x.game_id,'revision',x.revision,
        'archived',x.archived,'createdAt',x.created_at,'updatedAt',x.updated_at,
        'changes',coalesce((select jsonb_agg(jsonb_build_object('at',q.created_at,'action',q.action,'before',q.before_value,'after',q.after_value,'reason',q.reason) order by q.revision)
          from (select * from public.gtl_personal_events e where e.user_id=p_user and e.target=x.id::text order by e.revision desc limit 100) q),'[]'::jsonb))
      order by x.season desc,x.week desc,x.created_at desc,x.id) from entries x where x.open),'[]'::jsonb),
    (select count(*)::integer from entries x where not x.open)
  into journal,journal_hidden;

  select coalesce(jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at)
    order by f.season desc,f.week desc),'[]'::jsonb) into forfeits from public.gtl_week_forfeits f where f.user_id=p_user;
  select coalesce(jsonb_agg(jsonb_build_object('season',o.season,'week',o.week,'mode',o.mode,'createdAt',o.created_at) order by o.season desc,o.week desc,o.mode),'[]'::jsonb)
  into sit_outs from public.gtl_weekly_optouts o where o.user_id=p_user
    and not exists(select 1 from public.gtl_week_forfeits f where f.user_id=o.user_id and f.season=o.season and f.week=o.week and o.mode=any(f.modes));

  select coalesce(jsonb_agg(jsonb_build_object('leagueId',a.league_id,'name',a.state#>>'{league,name}',
      'season',a.state#>'{league,season}','week',a.state#>'{league,week}','archivedAt',a.archived_at,'own',m.player_id='sean',
      'archivedCount',case when jsonb_typeof(a.state->'archivedCount')='number' then a.state->'archivedCount' end,
      'games',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','awayCode',g->>'awayCode','homeCode',g->>'homeCode','kickoff',g->'kickoff') order by g->>'kickoff',g->>'id')
        from jsonb_array_elements(case when jsonb_typeof(a.state->'games')='array' then a.state->'games' else '[]'::jsonb end) g),'[]'::jsonb),
      'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',h->>'id','source',h->>'source','sourceUrl',h->>'sourceUrl','quotedAt',h->'quotedAt',
          'capturedAt',h->'capturedAt','timeBasis',h->>'timeBasis','total',case when m.player_id='sean' then h->'total' end,
          'games',coalesce((select jsonb_object_agg(v.key,case when m.player_id='sean' then jsonb_build_object('value',v.value->'value','originalPick',v.value->'originalPick','points',v.value->'points')
                else jsonb_build_object('value',v.value->'value') end)
              from jsonb_each(case when jsonb_typeof(h->'games')='object' then h->'games' else '{}'::jsonb end) v
              where exists(select 1 from jsonb_array_elements(case when jsonb_typeof(a.state->'games')='array' then a.state->'games' else '[]'::jsonb end) g
                where g->>'id'=v.key and (g->>'kickoff')::timestamptz<=now_at)),'{}'::jsonb))
        order by h->>'capturedAt',h->>'id')
        from jsonb_array_elements(case when jsonb_typeof(a.state->'history')='array' then a.state->'history' else '[]'::jsonb end) h),'[]'::jsonb))
    order by a.league_id),'[]'::jsonb)
  into archives from public.gtl_prediction_archives a join public.gtl_memberships m on m.league_id=a.league_id and m.user_id=p_user;

  select coalesce(jsonb_agg(jsonb_build_object('policyId',p.id,'leagueId',p.league_id,'season',p.season,'week',p.week,'mode',p.mode,
      'decision',p.decision_text,'status',case when f.policy_id is null then 'not_frozen' else 'frozen' end,
      'frozenAt',f.frozen_at,'actualKickoff',f.actual_kickoff,'sourceUrl',f.source_url,
      'capturedAt',f.benchmark->'capturedAt','quotedAt',f.benchmark->'quotedAt',
      'games',case when f.policy_id is not null and f.actual_kickoff<=now_at then coalesce((select jsonb_object_agg(v.key,jsonb_build_object('value',v.value->'value',
          'oldestObservedAt',v.value->'oldestObservedAt','newestObservedAt',v.value->'newestObservedAt'))
        from jsonb_each(case when jsonb_typeof(f.benchmark->'games')='object' then f.benchmark->'games' else '{}'::jsonb end) v),'{}'::jsonb) end)
    order by p.season desc,p.week desc,p.id),'[]'::jsonb)
  into benchmarks from public.gtl_benchmark_policies p left join public.gtl_frozen_benchmarks f on f.policy_id=p.id
  where exists(select 1 from public.gtl_memberships m where m.league_id=p.league_id and m.user_id=p_user);

  select coalesce(jsonb_agg(public.gtl_me_slate(w.season,w.week)||jsonb_build_object('results',public.gtl_me_results(w.season,w.week)) order by w.season desc,w.week desc),'[]'::jsonb)
  into slates from (
    select (x->>'season')::integer season,(x->>'week')::integer week from jsonb_array_elements(challenge||saved||forecasts||journal) x
    union select season,week from public.gtl_week_forfeits where user_id=p_user
    union select season,week from public.gtl_weekly_optouts where user_id=p_user) w
  where exists(select 1 from public.gtl_weekly_slates z where z.season=w.season and z.week=w.week);

  return jsonb_build_object('ownerId',p_user,'now',now_at,'member',member,
    'challenge',jsonb_build_object('players',players,'selections',challenge,'hidden',hidden),
    'saved',saved,'forecasts',forecasts,'journal',journal,'journalHidden',journal_hidden,
    'forfeits',forfeits,'sitOuts',sit_outs,'archives',archives,'benchmarks',benchmarks,'slates',slates);
end $$;

revoke all on function public.gtl_me_slate(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_me_slate(integer,integer) to service_role;
revoke all on function public.gtl_me_results(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_me_results(integer,integer) to service_role;
revoke all on function public.gtl_read_ballot_changes(uuid,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_ballot_changes(uuid,integer,integer,timestamptz) to service_role;
revoke all on function public.gtl_read_me_records(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_me_records(uuid,timestamptz) to service_role;
