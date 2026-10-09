-- Local implementation only. Applying this migration to a hosted project is a separate release.
-- Account records never require a league and never enter a group projection.
create table public.gtl_personal_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision between 0 and 9007199254740990)
);
create table public.gtl_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null, week integer not null, game_id text not null,
  saved boolean not null, notes text not null default '' check(length(notes)<=2000),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season,week,game_id), foreign key(season,week) references public.gtl_weekly_slates
);
create table public.gtl_journal_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null, week integer not null, game_id text not null,
  entry jsonb not null check(jsonb_typeof(entry)='object'), revision bigint not null default 1,
  archived boolean not null default false, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_journal_owner_page_idx on public.gtl_journal_entries(user_id,season,week,created_at desc,id desc);
create table public.gtl_personal_forecasts (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null, week integer not null, game_id text not null, market text not null check(market in ('spread','total')),
  value numeric not null, saved_at timestamptz not null default clock_timestamp(), revision bigint not null default 1,
  primary key(user_id,season,week,game_id,market), foreign key(season,week) references public.gtl_weekly_slates
);
create table public.gtl_personal_events (
  user_id uuid not null references auth.users(id) on delete cascade, revision bigint not null,
  action text not null, target text not null, before_value jsonb, after_value jsonb,
  reason text, created_at timestamptz not null default clock_timestamp(), primary key(user_id,revision)
);
create index gtl_personal_event_target_idx on public.gtl_personal_events(user_id,target,revision desc);
create table public.gtl_personal_receipts (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(user_id,request_id)
);

create function public.gtl_personal_context(p_user uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_PERSONAL_SLATE'; end if;
  return sig;
end $$;

create function public.gtl_read_personal(p_user uuid,p_season integer default null,p_week integer default null,p_cursor uuid default null,p_archived boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; result jsonb; cursor_row public.gtl_journal_entries; page jsonb; s integer; w integer;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  if (p_season is null)<>(p_week is null) or p_archived is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
  s:=p_season; w:=p_week;
  if s is null then select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1; end if;
  sig:=public.gtl_personal_context(p_user,s,w);
  if p_cursor is not null then
    select * into cursor_row from public.gtl_journal_entries where user_id=p_user and id=p_cursor and season=s and week=w;
    if not found then raise exception 'GTL_PERSONAL_NOT_FOUND'; end if;
  end if;
  with entries as (
    select e.* from public.gtl_journal_entries e where user_id=p_user and season=s and week=w and (p_archived or not archived)
      and (p_cursor is null or (e.created_at,e.id)<(cursor_row.created_at,cursor_row.id))
      -- Defense in depth: a future administrative ballot change cannot expose stored market records.
      and exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=s and b.week=w
        and b.mode=case when e.entry->>'market'='spread' then 'guess_spread' else 'guess_total' end and coalesce(b.ballot->>'submittedAt','')<>'')
      order by created_at desc,id desc limit 26
  ) select coalesce(jsonb_agg(entry||jsonb_build_object('id',id,'revision',revision,'archived',archived,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc,id desc),'[]') into page from entries;
  result:=jsonb_build_object(
    'scope','account_private','revision',coalesce((select revision from public.gtl_personal_versions where user_id=p_user),0),
    'season',s,'week',w,'now',clock_timestamp(),'deadline',to_timestamp((sig->>'deadline')::numeric),
    'weeklyRevision',coalesce((select revision from public.gtl_weekly_versions where user_id=p_user and season=s and week=w),0),
    'slates',coalesce((select jsonb_agg(jsonb_build_object('season',season,'week',week) order by season desc,week desc) from public.gtl_weekly_slates),'[]'),
    'games',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home','away',g->>'away','home',g->>'home','kickoff',to_timestamp((g->>'kickoff')::numeric)) order by (g->>'kickoff')::numeric,g->>'id') from jsonb_array_elements(sig->'games') g),'[]'),
    'ballots',coalesce((select jsonb_object_agg(mode,ballot||jsonb_build_object('originPractice',origin_practice)) from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w),'{}'),
    'favorites',coalesce((select jsonb_agg(jsonb_build_object('gameId',game_id,'notes',notes,'createdAt',created_at,'updatedAt',updated_at) order by created_at,game_id) from public.gtl_favorites where user_id=p_user and season=s and week=w and saved),'[]'),
    'forecasts',coalesce((select jsonb_agg(jsonb_build_object('gameId',game_id,'market',market,'value',value,'savedAt',saved_at,'revision',revision) order by game_id,market) from public.gtl_personal_forecasts where user_id=p_user and season=s and week=w),'[]'),
    'journal',case when jsonb_array_length(page)>25 then page-25 else page end,
    'accountingRecords',coalesce((select jsonb_agg(jsonb_build_object('kind',e.entry->>'kind','outcome',e.entry->>'outcome','currency',e.entry->>'currency','stakeMinor',e.entry->'stakeMinor','returnedMinor',e.entry->'returnedMinor','archived',false)) from public.gtl_journal_entries e where user_id=p_user and season=s and week=w and not archived and exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=s and b.week=w and b.mode=case when e.entry->>'market'='spread' then 'guess_spread' else 'guess_total' end and coalesce(b.ballot->>'submittedAt','')<>'')),'[]'),
    'nextCursor',case when jsonb_array_length(page)>25 then page#>'{24,id}' else 'null'::jsonb end
  );
  return result;
end $$;

create function public.gtl_personal_history(p_user uuid,p_entry uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare e public.gtl_journal_entries;
begin
  select * into e from public.gtl_journal_entries where user_id=p_user and id=p_entry;
  if e.id is null then raise exception 'GTL_PERSONAL_NOT_FOUND'; end if;
  if not exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=e.season and b.week=e.week
      and b.mode=case when e.entry->>'market'='spread' then 'guess_spread' else 'guess_total' end and coalesce(b.ballot->>'submittedAt','')<>'') then raise exception 'GTL_MATCHING_BALLOT_REQUIRED'; end if;
  return jsonb_build_object('entryId',p_entry,'events',coalesce((select jsonb_agg(x order by x.revision desc) from (
    select revision,action,before_value as "before",after_value as "after",reason,created_at as "recordedAt" from public.gtl_personal_events
    where user_id=p_user and target=p_entry::text order by revision desc limit 100) x),'[]'),
    'olderEventsAvailable',(select count(*)>100 from public.gtl_personal_events where user_id=p_user and target=p_entry::text));
end $$;

create function public.gtl_mutate_personal(p_user uuid,p_action text,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rev bigint; request uuid; receipt public.gtl_personal_receipts; sig jsonb; s integer; w integer; g jsonb;
  stamp timestamptz; before_value jsonb; after_value jsonb; target text; result jsonb; entry_id uuid;
  old_entry public.gtl_journal_entries; allowed text[]; val numeric; odds numeric; v_market text; quote_time timestamptz; placed_time timestamptz;
  b public.gtl_weekly_ballots; week_rev bigint; pick record; next_ballot jsonb; event jsonb;
  was_submitted boolean; is_submitted boolean; refs jsonb; scoring_ref jsonb; changed jsonb:='[]'; named_game jsonb; snap record;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or p_action is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
  allowed:=case p_action
    when 'favorite/set' then array['season','week','gameId','saved','notes']
    when 'personal/forecast' then array['season','week','gameId','market','value']
    when 'personal/ballot' then array['season','week','mode','weeklyRevision','picks','submit']
    when 'journal/create' then array['season','week','gameId','kind','market','side','line','odds','source','quotedAt','placedAt','notes','outcome','currency','stakeMinor','returnedMinor']
    when 'journal/correct' then array['entryId','reason','season','week','gameId','kind','market','side','line','odds','source','quotedAt','placedAt','notes','outcome','currency','stakeMinor','returnedMinor']
    when 'journal/archive' then array['entryId','reason','archived'] end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_body) k where not(k=any(allowed||array['requestId','revision'])))
    or not(p_body ?& (allowed||array['requestId','revision'])) or jsonb_typeof(p_body->'revision') is distinct from 'number'
    or (p_body->>'revision') !~ '^[0-9]+$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
  begin request:=(p_body->>'requestId')::uuid; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
  if request is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
  insert into public.gtl_personal_versions(user_id) values(p_user) on conflict do nothing;
  select revision into rev from public.gtl_personal_versions where user_id=p_user for update;
  select * into receipt from public.gtl_personal_receipts where user_id=p_user and request_id=request;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_body then raise exception 'GTL_PERSONAL_RETRY_CONFLICT'; end if;
    return receipt.result;
  end if;
  if (p_body->>'revision')::numeric<>rev then raise exception 'GTL_PERSONAL_CONFLICT'; end if;
  stamp:=clock_timestamp();
  if p_action in ('journal/correct','journal/archive') then
    begin entry_id:=(p_body->>'entryId')::uuid; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
    select * into old_entry from public.gtl_journal_entries where user_id=p_user and id=entry_id for update;
    if not found then raise exception 'GTL_PERSONAL_NOT_FOUND'; end if;
    if jsonb_typeof(p_body->'reason') is distinct from 'string' or length(btrim(p_body->>'reason'))<3 or length(p_body->>'reason')>300 then raise exception 'GTL_PERSONAL_INVALID'; end if;
    before_value:=old_entry.entry||jsonb_build_object('archived',old_entry.archived,'revision',old_entry.revision);
  end if;
  if p_action='journal/archive' then
    if jsonb_typeof(p_body->'archived') is distinct from 'boolean' then raise exception 'GTL_PERSONAL_INVALID'; end if;
    update public.gtl_journal_entries set archived=(p_body->>'archived')::boolean,revision=revision+1,updated_at=stamp where id=entry_id and user_id=p_user;
    after_value:=old_entry.entry||jsonb_build_object('archived',(p_body->>'archived')::boolean,'revision',old_entry.revision+1); target:=entry_id::text;
  else
    if jsonb_typeof(p_body->'season') is distinct from 'number' or jsonb_typeof(p_body->'week') is distinct from 'number'
      or (p_body->>'season') !~ '^[0-9]{4}$' or (p_body->>'week') !~ '^[0-9]{1,2}$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
    s:=(p_body->>'season')::integer; w:=(p_body->>'week')::integer;
    sig:=public.gtl_personal_context(p_user,s,w);
    if p_action<>'personal/ballot' then
      select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=p_body->>'gameId';
      if g is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
      target:=s||'/'||w||'/'||(g->>'id');
    end if;
    if p_action='favorite/set' then
      if jsonb_typeof(p_body->'saved') is distinct from 'boolean' or jsonb_typeof(p_body->'notes') is distinct from 'string' or length(p_body->>'notes')>2000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      select jsonb_build_object('saved',saved,'notes',notes) into before_value from public.gtl_favorites where user_id=p_user and season=s and week=w and game_id=g->>'id';
      after_value:=jsonb_build_object('saved',(p_body->>'saved')::boolean,'notes',btrim(p_body->>'notes'));
      insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(p_body->>'saved')::boolean,btrim(p_body->>'notes'),stamp)
        on conflict(user_id,season,week,game_id) do update set saved=excluded.saved,notes=excluded.notes,updated_at=excluded.updated_at;
    elsif p_action='personal/forecast' then
      v_market:=p_body->>'market';
      if v_market is null or v_market not in ('spread','total') or jsonb_typeof(p_body->'value') is distinct from 'number' then raise exception 'GTL_PERSONAL_INVALID'; end if;
      val:=(p_body->>'value')::numeric;
      if val*2<>trunc(val*2) or (v_market='spread' and (val < -100 or val > 100)) or (v_market='total' and (val < 0 or val > 200)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      target:=target||'/'||v_market;
      select jsonb_build_object('value',value,'savedAt',saved_at,'revision',revision) into before_value from public.gtl_personal_forecasts where user_id=p_user and season=s and week=w and game_id=g->>'id' and gtl_personal_forecasts.market=v_market;
      insert into public.gtl_personal_forecasts(user_id,season,week,game_id,market,value,saved_at) values(p_user,s,w,g->>'id',v_market,val,stamp)
        on conflict(user_id,season,week,game_id,market) do update set value=excluded.value,saved_at=excluded.saved_at,revision=public.gtl_personal_forecasts.revision+1;
      after_value:=jsonb_build_object('value',val,'savedAt',stamp);
    elsif p_action='personal/ballot' then
      if p_body->>'mode' is null or p_body->>'mode' not in ('guess_spread','guess_total') or jsonb_typeof(p_body->'picks') is distinct from 'object' or jsonb_typeof(p_body->'submit') is distinct from 'boolean' or jsonb_typeof(p_body->'weeklyRevision') is distinct from 'number' or (p_body->>'weeklyRevision') !~ '^[0-9]+$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
      insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
      select revision into week_rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
      if (p_body->>'weeklyRevision')::numeric<>week_rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
      select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_body->>'mode';
      was_submitted:=coalesce(b.ballot->>'submittedAt','')<>''; is_submitted:=(p_body->>'submit')::boolean or was_submitted;
      if stamp>=to_timestamp((sig->>'deadline')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      for pick in select * from jsonb_each(p_body->'picks') loop
        if not exists(select 1 from jsonb_array_elements(sig->'games') x where x->>'id'=pick.key) or jsonb_typeof(pick.value)<>'number' then raise exception 'GTL_PERSONAL_INVALID'; end if;
        val:=pick.value::numeric;
        if val*2<>trunc(val*2) or (p_body->>'mode'='guess_spread' and (val < -100 or val > 100)) or (p_body->>'mode'='guess_total' and (val < 0 or val > 200)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
        if not was_submitted or b.ballot#>array['picks',pick.key] is distinct from pick.value then changed:=changed||jsonb_build_array(pick.key); end if;
      end loop;
      if is_submitted and (select count(*) from jsonb_object_keys(p_body->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
      -- D-16 uses the same server-owned reference validator as group ballot saves.
      -- The later submission-time migration must be installed before enabling this route.
      refs:=coalesce(b.ballot->'scoringReferences','{}');
      if is_submitted then
        for g in select x from jsonb_array_elements(sig->'games') x where changed ? (x->>'id') loop
          scoring_ref:=null; named_game:=null;
          select x into named_game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
            where t.season=s and t.week=w and x->>'id'=g->>'id' and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
              and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
          if named_game is not null then
            for snap in select * from public.gtl_market_snapshots where season=s and week=w and slate_signature=sig and created_at<=stamp order by created_at desc,id desc limit 20 loop
              scoring_ref:=public.gtl_submission_reference(snap.payload,named_game,case when p_body->>'mode'='guess_spread' then 'spread' else 'total' end,stamp);
              if scoring_ref is not null then scoring_ref:=scoring_ref||jsonb_build_object('snapshotId',snap.id); exit; end if;
            end loop;
          end if;
          refs:=refs||jsonb_build_object(g->>'id',coalesce(scoring_ref,jsonb_build_object('status','unavailable','value',null,'savedAt',stamp,
            'source',null,'sourceUrl',null,'snapshotId',null,'capturedAt',null,'observedAt',null,'reason','No qualifying saved reference at submission; unscored.')));
        end loop;
      end if;
      next_ballot:=coalesce(b.ballot,'{}')||jsonb_build_object('picks',p_body->'picks',
        'submittedAt',case when was_submitted then b.ballot->'submittedAt' when (p_body->>'submit')::boolean then to_jsonb(stamp) else 'null'::jsonb end,
        'updatedAt',stamp,'scoringPolicy','submission-time','scoringReferences',refs);
      event:=jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(p_user::text,'-',''),'mode',p_body->>'mode',
        'type',case when was_submitted then 'ballot_edited' when (p_body->>'submit')::boolean then 'ballot_submitted' else 'ballot_saved' end,
        'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_body->'picks','changedGameIds',changed,
        'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs);
      insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
        values(p_user,s,w,p_body->>'mode',next_ballot,jsonb_build_array(event),false,jsonb_build_array(jsonb_build_object('scope','solo')))
        on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
      update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
      before_value:=b.ballot; after_value:=next_ballot; target:=s||'/'||w||'/'||(p_body->>'mode');
    else
      v_market:=p_body->>'market';
      if v_market is null or v_market not in ('spread','total') or p_body->>'kind' is null or p_body->>'kind' not in ('research_note','user_reported_placed_bet') or p_body->>'side' is null
        or (v_market='spread' and p_body->>'side' not in ('home','away')) or (v_market='total' and p_body->>'side' not in ('over','under'))
        or jsonb_typeof(p_body->'line') is distinct from 'number' or jsonb_typeof(p_body->'odds') is distinct from 'number'
        or jsonb_typeof(p_body->'source') is distinct from 'string' or length(btrim(p_body->>'source'))<2 or length(p_body->>'source')>120
        or jsonb_typeof(p_body->'notes') is distinct from 'string' or length(p_body->>'notes')>2000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if p_body->>'outcome' is null or p_body->>'outcome' not in ('pending','win','loss','push','void')
        or (jsonb_typeof(p_body->'stakeMinor') not in ('null','number')) or (jsonb_typeof(p_body->'returnedMinor') not in ('null','number'))
        or (p_body->'stakeMinor'<>'null'::jsonb and ((p_body->>'stakeMinor') !~ '^[0-9]+$' or (p_body->>'stakeMinor')::numeric not between 1 and 1000000000))
        or (p_body->'returnedMinor'<>'null'::jsonb and ((p_body->>'returnedMinor') !~ '^[0-9]+$' or (p_body->>'returnedMinor')::numeric not between 0 and 1000000000))
        or (p_body->'stakeMinor'='null'::jsonb and (p_body->'currency'<>'null'::jsonb or p_body->'returnedMinor'<>'null'::jsonb))
        or (p_body->'stakeMinor'<>'null'::jsonb and (p_body->>'currency' is null or p_body->>'currency' not in ('USD','CAD','EUR','GBP','AUD')))
        or (p_body->>'outcome'='pending' and p_body->'returnedMinor'<>'null'::jsonb)
        or (p_body->>'kind'='research_note' and (p_body->'stakeMinor'<>'null'::jsonb or p_body->'currency'<>'null'::jsonb or p_body->'returnedMinor'<>'null'::jsonb)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if not exists(select 1 from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when v_market='spread' then 'guess_spread' else 'guess_total' end and coalesce(ballot->>'submittedAt','')<>'') then raise exception 'GTL_MATCHING_BALLOT_REQUIRED'; end if;
      val:=(p_body->>'line')::numeric; odds:=(p_body->>'odds')::numeric;
      if val*2<>trunc(val*2) or (v_market='spread' and (val < -100 or val > 100)) or (v_market='total' and (val < 0 or val > 200)) or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      begin quote_time:=(p_body->>'quotedAt')::timestamptz; placed_time:=(p_body->>'placedAt')::timestamptz; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
      if quote_time is null or not isfinite(quote_time) or quote_time>stamp or (placed_time is not null and (not isfinite(placed_time) or placed_time>stamp)) or ((p_body->>'kind'='user_reported_placed_bet')<>(placed_time is not null)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if p_action='journal/correct' and (old_entry.season<>s or old_entry.week<>w or old_entry.game_id<>g->>'id' or old_entry.entry->>'market'<>v_market) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      after_value:=(p_body-array['requestId','revision','entryId','reason'])||jsonb_build_object('source',btrim(p_body->>'source'),'notes',btrim(p_body->>'notes'),'quotedAt',quote_time,'placedAt',placed_time,'verification','User-reported; not independently verified','retrospective',case when p_action='journal/correct' then (old_entry.entry->>'retrospective')::boolean else stamp>=to_timestamp((g->>'kickoff')::numeric) end);
      if p_action='journal/correct' then
        after_value:=after_value||jsonb_build_object('context',old_entry.entry->'context');
      else
        -- Pin information known to this account when recorded, never retrospectively claim placement-time knowledge.
        after_value:=after_value||jsonb_build_object('context',jsonb_build_object('recordedAt',stamp,
          'sportsbookGuess',(select jsonb_build_object('value',ballot#>array['picks',g->>'id'],'submittedAt',ballot->'submittedAt','scoringReference',ballot#>array['scoringReferences',g->>'id']) from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when v_market='spread' then 'guess_spread' else 'guess_total' end),
          'personalForecast',(select jsonb_build_object('value',value,'savedAt',saved_at,'revision',revision) from public.gtl_personal_forecasts where user_id=p_user and season=s and week=w and game_id=g->>'id' and market=v_market),
          'quote',jsonb_build_object('line',val,'side',p_body->>'side','odds',odds,'source',btrim(p_body->>'source'),'observedAt',quote_time),
          'model',null));
      end if;
      if p_action='journal/create' then
        if (select count(*)>=2000 from public.gtl_journal_entries where user_id=p_user and season=s and week=w) then raise exception 'GTL_PERSONAL_LIMIT'; end if;
        insert into public.gtl_journal_entries(user_id,season,week,game_id,entry,created_at,updated_at) values(p_user,s,w,g->>'id',after_value,stamp,stamp) returning id into entry_id;
      else update public.gtl_journal_entries set entry=after_value,revision=revision+1,updated_at=stamp where id=entry_id and user_id=p_user; end if;
      target:=entry_id::text;
    end if;
  end if;
  insert into public.gtl_personal_events(user_id,revision,action,target,before_value,after_value,reason,created_at) values(p_user,rev+1,p_action,target,before_value,after_value,p_body->>'reason',stamp);
  update public.gtl_personal_versions set revision=rev+1 where user_id=p_user;
  result:=jsonb_build_object('revision',rev+1,'entryId',entry_id,'saved',true);
  insert into public.gtl_personal_receipts(user_id,request_id,action,payload,result,created_at) values(p_user,request,p_action,p_body,result,stamp);
  return result;
end $$;

alter table public.gtl_personal_versions enable row level security;
alter table public.gtl_favorites enable row level security;
alter table public.gtl_journal_entries enable row level security;
alter table public.gtl_personal_forecasts enable row level security;
alter table public.gtl_personal_events enable row level security;
alter table public.gtl_personal_receipts enable row level security;
revoke all on public.gtl_personal_versions,public.gtl_favorites,public.gtl_journal_entries,public.gtl_personal_forecasts,public.gtl_personal_events,public.gtl_personal_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.gtl_personal_versions,public.gtl_favorites,public.gtl_journal_entries,public.gtl_personal_forecasts to service_role;
grant select,insert on public.gtl_personal_events,public.gtl_personal_receipts to service_role;
revoke all on function public.gtl_personal_context(uuid,integer,integer),public.gtl_read_personal(uuid,integer,integer,uuid,boolean),public.gtl_personal_history(uuid,uuid),public.gtl_mutate_personal(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_personal_context(uuid,integer,integer),public.gtl_read_personal(uuid,integer,integer,uuid,boolean),public.gtl_personal_history(uuid,uuid),public.gtl_mutate_personal(uuid,text,jsonb) to service_role;
