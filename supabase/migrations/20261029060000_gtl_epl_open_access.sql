-- M-31 epl_open_access (EPL open access plan, Task 1; D-68 addendum, Sean on October 29, 2026: "lets automatically link
-- users to fantasy epl team, also EPL section can show for everyone"). Every signed-in account may read EPL; an account
-- links itself to its FEPL manager automatically when its display name matches uniquely, or claims an unclaimed manager
-- in one tap. Only a linked manager picks or keeps a queue (gtl_epl_member is unchanged).
--
-- What it adds:
-- * gtl_epl_link_audit: one append-only row per link, unlink, claim or automatic link (owner_id, user_id, action, by,
--   at). Nothing is ever deleted (D-23). An unlink records the account it removed.
-- * gtl_epl_auto_link(p_user) -> the linked owner_id or null. It links only when the caller has no link, exactly one
--   unclaimed manager matches the caller's gtl_profiles.display_name (case-insensitive, after btrim: the first word
--   equals the manager's first name, or the whole name equals the Sleeper username or one of the manager's aliases), and
--   no other profile matches that manager by the same rules. Anything ambiguous links nothing and writes nothing.
-- * gtl_epl_manager_aliases: extra whole-name matches, seeded from a live read of gtl_profiles that Sean approved on
--   October 29, 2026 ("my user should be fistathon and seanbalz"): Sean is "Fistathon", Steven is "Sthomas".
-- * gtl_epl_name_owners(p_name): the managers a display name names by those rules (the one matcher both checks use).
-- * gtl_epl_claim_manager(p_user,p_owner_id) -> jsonb. GTL_EPL_INVALID for an unknown owner or a missing argument,
--   GTL_EPL_ALREADY_LINKED when the caller already has a link, GTL_EPL_CLAIMED when the manager is linked. The manager
--   row is locked (for update), so the first claim wins.
-- * gtl_epl_link_manager is re-created with the same argument list and body, plus its audit row.
-- Known risk (accepted, D-68 addendum): an account could rename itself to an unclaimed manager's name and be linked.
-- Every link is audited and the commissioner can unlink through epl/admin/link with userId null.
--
-- Apply order is the M-ledger in docs/REDESIGN_BUILD_PLAN.md section 6: M-31 after M-30 (it reads M-30's tables).
-- Rerunnable: the tables and index are created only if missing, the alias seed rows are inserted with
-- on conflict do nothing, every function is create or replace with this exact
-- argument list, and every grant is restated. Service-role only: no browser role gets anything, and no policy exists.
-- Nothing is dropped, deleted or truncated. Rollback: supabase/rollback/20261029060000_gtl_epl_open_access.sql restores
-- M-30's gtl_epl_link_manager; the new functions are switched off by not calling them. No hosted action is performed
-- by this file.
-- replaces public.gtl_epl_link_manager md5 97a398e4a4ea319be9164685231d762d

create table if not exists public.gtl_epl_link_audit (
  id bigint generated always as identity primary key,
  owner_id text not null references public.gtl_epl_managers(owner_id),
  user_id uuid,
  action text not null check(action in ('link','unlink','claim','auto_link')),
  by uuid,
  at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_epl_link_audit_owner_idx on public.gtl_epl_link_audit(owner_id,id);
alter table public.gtl_epl_link_audit enable row level security;
revoke all on public.gtl_epl_link_audit from public,anon,authenticated,service_role;
-- Append-only (D-23): no update or delete for anyone the API runs as.
grant select,insert on public.gtl_epl_link_audit to service_role;

-- Whole display names (lowercase, trimmed) that also name a manager.
create table if not exists public.gtl_epl_manager_aliases (
  owner_id text not null references public.gtl_epl_managers(owner_id),
  alias text primary key check(alias=lower(btrim(alias)) and alias<>'')
);
alter table public.gtl_epl_manager_aliases enable row level security;
revoke all on public.gtl_epl_manager_aliases from public,anon,authenticated,service_role;
grant select on public.gtl_epl_manager_aliases to service_role;
insert into public.gtl_epl_manager_aliases(owner_id,alias) values
  ('473955676301815808','fistathon'),
  ('702644837370929152','sthomas')
on conflict (alias) do nothing;

-- The managers (owner_id) a display name names: its first word is the manager's first name, or the whole name is the
-- Sleeper username or an alias. Case-insensitive, after btrim. Linked or not; the caller decides.
create or replace function public.gtl_epl_name_owners(p_name text) returns setof text
language sql stable security invoker set search_path='' as $$
  select m.owner_id from public.gtl_epl_managers m
  where nullif(lower(btrim(p_name)),'') is not null
    and ((regexp_split_to_array(lower(btrim(p_name)),'\s+'))[1]=lower(m.name)
      or lower(btrim(p_name))=lower(m.sleeper_name)
      or exists(select 1 from public.gtl_epl_manager_aliases a where a.owner_id=m.owner_id and a.alias=lower(btrim(p_name))))
$$;

-- The commissioner links an account to a manager, or unlinks the manager with p_user null (p_by is checked here too, so a
-- caller cannot link on their own say-so). Unlinking keeps the manager row and every pick; it only clears the account.
-- M-31: every change also writes an audit row.
create or replace function public.gtl_epl_link_manager(p_owner_id text,p_user uuid,p_by uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_prev uuid;
begin
  if p_by is null or not exists(select 1 from public.gtl_memberships where user_id=p_by and league_id='sean-troy-luke' and role='commissioner' and active) then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  select m.user_id into v_prev from public.gtl_epl_managers m where m.owner_id=p_owner_id for update;
  if not found then raise exception 'GTL_EPL_UNKNOWN_MANAGER' using errcode='P0001'; end if;
  begin
    update public.gtl_epl_managers set user_id=p_user,linked_by=p_by,linked_at=clock_timestamp() where owner_id=p_owner_id;
  exception when unique_violation then raise exception 'GTL_EPL_ALREADY_LINKED' using errcode='P0001';
  end;
  if p_user is not null then
    insert into public.gtl_epl_link_audit(owner_id,user_id,action,by) values(p_owner_id,p_user,'link',p_by);
  elsif v_prev is not null then
    insert into public.gtl_epl_link_audit(owner_id,user_id,action,by) values(p_owner_id,v_prev,'unlink',p_by);
  end if;
  return jsonb_build_object('ownerId',p_owner_id,'userId',p_user);
end $$;

-- Links the caller to the one manager their display name names, or returns null and changes nothing.
create or replace function public.gtl_epl_auto_link(p_user uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare v_name text; v_owner text; v_count integer;
begin
  if p_user is null then return null; end if;
  if exists(select 1 from public.gtl_epl_managers m where m.user_id=p_user) then return null; end if;
  select p.display_name into v_name from public.gtl_profiles p where p.user_id=p_user;
  if v_name is null then return null; end if;
  select count(*)::integer,min(m.owner_id) into v_count,v_owner
    from public.gtl_epl_name_owners(v_name) o join public.gtl_epl_managers m on m.owner_id=o
    where m.user_id is null;
  if v_count<>1 then return null; end if;
  -- Ambiguous when any other profile names the same manager by the same rules.
  if exists(select 1 from public.gtl_profiles p where p.user_id<>p_user
      and v_owner in (select public.gtl_epl_name_owners(p.display_name))) then
    return null;
  end if;
  perform 1 from public.gtl_epl_managers m where m.owner_id=v_owner and m.user_id is null for update;
  if not found then return null; end if;
  begin
    update public.gtl_epl_managers set user_id=p_user,linked_by=p_user,linked_at=clock_timestamp() where owner_id=v_owner and user_id is null;
  exception when unique_violation then return null;
  end;
  if not found then return null; end if;
  insert into public.gtl_epl_link_audit(owner_id,user_id,action,by) values(v_owner,p_user,'auto_link',p_user);
  return v_owner;
end $$;

-- The caller claims an unclaimed manager. First claim wins.
create or replace function public.gtl_epl_claim_manager(p_user uuid,p_owner_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_manager public.gtl_epl_managers;
begin
  if p_user is null or p_owner_id is null then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into v_manager from public.gtl_epl_managers m where m.owner_id=p_owner_id for update;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  if exists(select 1 from public.gtl_epl_managers m where m.user_id=p_user) then raise exception 'GTL_EPL_ALREADY_LINKED' using errcode='P0001'; end if;
  if v_manager.user_id is not null then raise exception 'GTL_EPL_CLAIMED' using errcode='P0001'; end if;
  begin
    update public.gtl_epl_managers set user_id=p_user,linked_by=p_user,linked_at=clock_timestamp() where owner_id=p_owner_id;
  exception
    when unique_violation then raise exception 'GTL_EPL_ALREADY_LINKED' using errcode='P0001';
    when foreign_key_violation then raise exception 'GTL_EPL_INVALID' using errcode='P0001';
  end;
  insert into public.gtl_epl_link_audit(owner_id,user_id,action,by) values(p_owner_id,p_user,'claim',p_user);
  return jsonb_build_object('ownerId',p_owner_id,'userId',p_user,'name',v_manager.name);
end $$;

-- Every function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_epl_link_manager(text,uuid,uuid),public.gtl_epl_name_owners(text),public.gtl_epl_auto_link(uuid),
  public.gtl_epl_claim_manager(uuid,text) from public,anon,authenticated;
grant execute on function public.gtl_epl_link_manager(text,uuid,uuid),public.gtl_epl_name_owners(text),public.gtl_epl_auto_link(uuid),
  public.gtl_epl_claim_manager(uuid,text) to service_role;
