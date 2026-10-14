-- M-29, redesign build plan stage 27a (D-40, Sean's ruling on the stage 27 open choice: "The note doesn't create a
-- Favorite (matches D-36: Favorites leave the screens). A small extra old-app change makes 'Save to Favorites' keep a
-- stored note instead of overwriting it with a blank one."). The D-40 entry in docs/DECISIONS.md comes with stage 27.
-- Local implementation only: applying it to the hosted project is Sean's "apply M-29".
--
-- The problem. The old app's Favorites card starts a game that is not saved from an empty note, because
-- gtl_read_personal lists saved games only. Its "Save to Favorites" button therefore sends an empty note, and
-- gtl_mutate_personal('favorite/set') wrote it over a note already stored for that game. A game removed from Favorites
-- and saved again lost its note (only the audit kept the text). Under D-40 the same would happen to a note the new
-- app's game sheet writes on a game the player never saved (M-09, stage 35), because that game stays not saved.
--
-- The change, in gtl_mutate_personal's favorite/set branch only: a save that takes a game from not saved (or no row)
-- to saved and sends an empty note keeps the note already stored, exactly as stored. The server decides, so every
-- client is covered, including an old-app tab opened before this apply. No gtl-api or Pages change is needed.
--
-- What does not change:
-- * Every other favorite/set save writes the note it sends, as before: a note typed on a saved game, an edit of a
--   saved game's note to empty (it still clears the note), a removal, and a save that sends a note of its own.
-- * The audit (D-23): each save still appends one gtl_personal_events row with before and after {saved, notes}. For a
--   kept note both sides hold the same text. The receipt, the request-id replay, GTL_PERSONAL_RETRY_CONFLICT, the
--   shared revision and GTL_PERSONAL_CONFLICT are untouched. No new error code.
-- * Every other action (personal/ballot, personal/forecast, journal/*) is byte for byte the previous body.
-- * No table, column, trigger, grant or row changes. gtl_read_personal is unchanged: it still lists saved games only.
-- * It works with or without M-09: it reads and writes gtl_favorites only, the table gtl_set_game_note also writes.
--
-- Rollback: supabase/rollback/<this file> restores the previous body. Every stored row stays (D-23).
--
-- replaces public.gtl_mutate_personal md5 4ad94514859c027cf19385f2a7b08385

-- Body of 20261012230000 except the favorite/set branch, which keeps a stored note on a save from not saved to saved.
create or replace function public.gtl_mutate_personal(p_user uuid,p_action text,p_body jsonb) returns jsonb
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
      -- D-40: "Save to Favorites" keeps a stored note. A save that takes the game from not saved (or no row) to saved
      -- and sends an empty note keeps the note already stored, exactly as stored. Every other save writes what it sends.
      if (after_value->>'saved')::boolean and after_value->>'notes'='' and not coalesce((before_value->>'saved')::boolean,false) then
        after_value:=after_value||jsonb_build_object('notes',coalesce(before_value->>'notes',''));
      end if;
      insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(after_value->>'saved')::boolean,after_value->>'notes',stamp)
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
      select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_body->>'mode' for update;
      was_submitted:=coalesce(b.ballot->>'submittedAt','')<>''; is_submitted:=(p_body->>'submit')::boolean or was_submitted;
      if stamp>=to_timestamp((sig->>'deadline')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      for pick in select * from jsonb_each(p_body->'picks') loop
        if not exists(select 1 from jsonb_array_elements(sig->'games') x where x->>'id'=pick.key) or jsonb_typeof(pick.value)<>'number' then raise exception 'GTL_PERSONAL_INVALID'; end if;
        val:=pick.value::numeric;
        if val*2<>trunc(val*2) or (p_body->>'mode'='guess_spread' and (val < -100 or val > 100)) or (p_body->>'mode'='guess_total' and (val < 0 or val > 200)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
        if not was_submitted or b.ballot#>array['picks',pick.key] is distinct from pick.value then changed:=changed||jsonb_build_array(pick.key); end if;
      end loop;
      if is_submitted and (select count(*) from jsonb_object_keys(p_body->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
      -- October 12, 2026: each changed guess saves the newest stored line at this instant, whatever its age, or the
      -- pending reference that the first line collected after it resolves. Kickoff locks are explicit (unchanged rule).
      refs:=coalesce(b.ballot->'scoringReferences','{}');
      if is_submitted then
        for g in select x from jsonb_array_elements(sig->'games') x where changed ? (x->>'id') loop
          if stamp>=to_timestamp((g->>'kickoff')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
          named_game:=null;
          select x into named_game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
            where t.season=s and t.week=w and x->>'id'=g->>'id' and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
              and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
          if named_game is null then raise exception 'GTL_PERSONAL_SLATE'; end if;
          scoring_ref:=public.gtl_reference_at_save(s,w,sig,named_game,case when p_body->>'mode'='guess_spread' then 'spread' else 'total' end,stamp);
          if scoring_ref is null then raise exception 'GTL_PREDICTION_CLOSED'; end if;
          refs:=refs||jsonb_build_object(g->>'id',scoring_ref);
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

-- create or replace keeps existing privileges; the grants are restated so this file stands on its own.
revoke all on function public.gtl_mutate_personal(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_mutate_personal(uuid,text,jsonb) to service_role;
