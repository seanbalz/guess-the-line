-- M-09 game_notes (redesign build plan stage 27; D-36 "notes stay", D-39): a private note on each game. Only the
-- owner reads or writes it. Local implementation only: applying it to the hosted project is Sean's "apply M-09".
--
-- Additive. Two new service-only, security-invoker functions over the personal workspace tables of
-- 20261008224444_gtl_personal_workspace.sql. No table, column, trigger or table grant changes and no function is
-- replaced, so this file has no "-- replaces" header and no supabase/rollback/ file. The off switch is the gtl-api
-- secret GTL_FEATURE_OFF=notes (cloud/feature-off.mjs): the writer refuses, every stored note stays readable (D-23).
--
-- A note is gtl_favorites.notes, the column the old app's Favorites card writes through
-- gtl_mutate_personal('favorite/set'), so a note written in either app shows in the other:
--   * Up to 2,000 characters, stored exactly as typed. A longer note is refused (GTL_NOTE_TOO_LONG), never shortened,
--     and a stored note always reads back whole. Saving the text already stored writes nothing.
--   * The saved flag is kept: a note never changes an existing row's `saved`. A note on a game with no row creates
--     the row with saved = true, because the old app shows a note only on a saved game; with false it would hide the
--     note and its "Save to Favorites" button would send an empty note over it. OPEN: this default awaits Sean's
--     ruling ("Open choice for Sean" in docs/redesign/PRIVATE_NOTES.md). The change that records his D-entry sets the
--     default and this comment to match, before the merge and before "apply M-09".
--   * Each change appends a gtl_personal_events row (before and after, `{saved, notes}` as favorite/set writes them)
--     and bumps the shared gtl_personal_versions revision, so an old-app screen opened before the change gets
--     GTL_PERSONAL_CONFLICT instead of overwriting the note.
--   * A request id replays its first answer (gtl_personal_receipts, shared with gtl_mutate_personal). A note's
--     `revision` is the shared revision of the last change to its text, in either app (0 for none); a save names the
--     revision it started from and is refused with GTL_NOTE_CONFLICT when the text changed since.

create function public.gtl_read_game_notes(p_user uuid,p_season integer default null,p_week integer default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  if (p_season is null)<>(p_week is null) then raise exception 'GTL_PERSONAL_INVALID'; end if;
  s:=p_season; w:=p_week;
  if s is null then select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1; end if;
  perform public.gtl_personal_context(p_user,s,w);
  -- Every row the owner has for the week, saved or not, with the whole note: nothing is hidden or cut (D-23).
  return jsonb_build_object('scope','account_private','ownerId',p_user,'season',s,'week',w,
    'notes',coalesce((select jsonb_agg(jsonb_build_object('gameId',f.game_id,'note',f.notes,'saved',f.saved,
        'revision',coalesce((select max(e.revision) from public.gtl_personal_events e
          where e.user_id=p_user and e.target=f.season||'/'||f.week||'/'||f.game_id and e.action in ('favorite/set','personal/note')
            and coalesce(e.before_value->>'notes','') is distinct from coalesce(e.after_value->>'notes','')),0),
        'createdAt',f.created_at,'updatedAt',f.updated_at) order by f.created_at,f.game_id)
      from public.gtl_favorites f where f.user_id=p_user and f.season=s and f.week=w),'[]'::jsonb));
end $$;

create function public.gtl_set_game_note(p_user uuid,p_request uuid,p_season integer,p_week integer,p_game text,p_note text,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rev bigint; receipt public.gtl_personal_receipts; payload jsonb; sig jsonb; t text; old_row public.gtl_favorites; new_row public.gtl_favorites;
  note_revision bigint; stamp timestamptz; kept boolean; changed boolean:=false; result jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  if p_request is null or p_season is null or p_week is null or p_game is null or p_note is null or p_revision is null or p_revision<0 then raise exception 'GTL_PERSONAL_INVALID'; end if;
  payload:=jsonb_build_object('season',p_season,'week',p_week,'gameId',p_game,'note',p_note,'revision',p_revision);
  -- The same lock order as gtl_mutate_personal: the owner's version row first, then the receipt.
  insert into public.gtl_personal_versions(user_id) values(p_user) on conflict do nothing;
  select revision into rev from public.gtl_personal_versions where user_id=p_user for update;
  select * into receipt from public.gtl_personal_receipts where user_id=p_user and request_id=p_request;
  if found then
    if receipt.action<>'personal/note' or receipt.payload<>payload then raise exception 'GTL_PERSONAL_RETRY_CONFLICT'; end if;
    return receipt.result;
  end if;
  if length(p_note)>2000 then raise exception 'GTL_NOTE_TOO_LONG'; end if;
  if p_note ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'GTL_PERSONAL_INVALID'; end if;
  sig:=public.gtl_personal_context(p_user,p_season,p_week);
  if not exists(select 1 from jsonb_array_elements(sig->'games') x where x->>'id'=p_game) then raise exception 'GTL_PERSONAL_INVALID'; end if;
  t:=p_season||'/'||p_week||'/'||p_game;
  select * into old_row from public.gtl_favorites where user_id=p_user and season=p_season and week=p_week and game_id=p_game;
  select coalesce(max(e.revision),0) into note_revision from public.gtl_personal_events e
    where e.user_id=p_user and e.target=t and e.action in ('favorite/set','personal/note')
      and coalesce(e.before_value->>'notes','') is distinct from coalesce(e.after_value->>'notes','');
  stamp:=clock_timestamp();
  if p_note is distinct from coalesce(old_row.notes,'') then
    if p_revision<>note_revision then raise exception 'GTL_NOTE_CONFLICT'; end if;
    kept:=coalesce(old_row.saved,true);
    insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,created_at,updated_at) values(p_user,p_season,p_week,p_game,kept,p_note,stamp,stamp)
      on conflict(user_id,season,week,game_id) do update set notes=excluded.notes,updated_at=excluded.updated_at;
    insert into public.gtl_personal_events(user_id,revision,action,target,before_value,after_value,reason,created_at)
      values(p_user,rev+1,'personal/note',t,case when old_row.user_id is null then null else jsonb_build_object('saved',old_row.saved,'notes',old_row.notes) end,
        jsonb_build_object('saved',kept,'notes',p_note),null,stamp);
    update public.gtl_personal_versions set revision=rev+1 where user_id=p_user;
    note_revision:=rev+1; changed:=true;
  end if;
  select * into new_row from public.gtl_favorites where user_id=p_user and season=p_season and week=p_week and game_id=p_game;
  result:=jsonb_build_object('ownerId',p_user,'season',p_season,'week',p_week,'gameId',p_game,'note',coalesce(new_row.notes,''),'saved',coalesce(new_row.saved,false),
    'revision',note_revision,'createdAt',new_row.created_at,'updatedAt',new_row.updated_at,'changed',changed);
  insert into public.gtl_personal_receipts(user_id,request_id,action,payload,result,created_at) values(p_user,p_request,'personal/note',payload,result,stamp);
  return result;
end $$;

revoke all on function public.gtl_read_game_notes(uuid,integer,integer),public.gtl_set_game_note(uuid,uuid,integer,integer,text,text,bigint) from public,anon,authenticated;
grant execute on function public.gtl_read_game_notes(uuid,integer,integer),public.gtl_set_game_note(uuid,uuid,integer,integer,text,text,bigint) to service_role;
