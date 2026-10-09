-- Private self-service games. Existing Triple Threat state and mappings are preserved.
create table public.gtl_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60 and display_name !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default now()
);

create table public.gtl_schedule_templates (
  id text primary key,
  season integer not null,
  week integer not null,
  games jsonb not null check (jsonb_typeof(games) = 'array' and jsonb_array_length(games) > 0),
  deadline timestamptz not null,
  schedule_source text not null,
  created_at timestamptz not null default now()
);

-- An explicit schedule allowlist prevents private ballots, scores, quotes or audits
-- from entering newly created games. Future slates require independently validated imports.
insert into public.gtl_schedule_templates (id, season, week, games, deadline, schedule_source)
select 'nfl-2026-week-05', (state->'league'->>'season')::integer,
  (state->'league'->>'week')::integer,
  (select jsonb_agg(jsonb_build_object(
    'id', g->>'id', 'away', g->>'away', 'home', g->>'home',
    'awayCode', g->>'awayCode', 'homeCode', g->>'homeCode',
    'matchup', g->>'matchup', 'kickoff', g->>'kickoff') order by ord)
   from jsonb_array_elements(state->'games') with ordinality as games(g, ord)),
  (state->'league'->>'deadline')::timestamptz, state->'league'->>'scheduleSource'
from public.gtl_leagues where id = 'sean-troy-luke';

alter table public.gtl_leagues
  add column created_by uuid references auth.users(id),
  add column creation_key uuid,
  add column format text not null default 'triple-threat' check (format in ('triple-threat', 'duel', 'group')),
  add column max_members integer not null default 3 check (max_members between 2 and 20),
  add column practice boolean not null default false,
  add column joinable boolean not null default false,
  add constraint gtl_creation_unique unique (created_by, creation_key);

alter table public.gtl_memberships drop constraint gtl_memberships_player_id_check;
alter table public.gtl_memberships drop constraint gtl_roster_role;
alter table public.gtl_memberships add constraint gtl_player_id_shape
  check (player_id in ('sean', 'troy', 'luke') or player_id ~ '^u_[0-9a-f]{32}$');

create table public.gtl_invites (
  id uuid primary key default gen_random_uuid(),
  league_id text not null references public.gtl_leagues(id),
  invited_by uuid not null references auth.users(id),
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email !~ '[[:cntrl:]]'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  unique (invited_by, request_id),
  check (expires_at > created_at)
);
create unique index gtl_one_pending_invite_per_email on public.gtl_invites (league_id, email) where status = 'pending';
create index gtl_invites_recipient on public.gtl_invites (email, status, expires_at);

create table public.gtl_access_audit (
  id uuid primary key default gen_random_uuid(),
  league_id text references public.gtl_leagues(id),
  actor_id uuid not null references auth.users(id),
  event text not null,
  invite_id uuid references public.gtl_invites(id),
  created_at timestamptz not null default now()
);

alter table public.gtl_profiles enable row level security;
alter table public.gtl_schedule_templates enable row level security;
alter table public.gtl_invites enable row level security;
alter table public.gtl_access_audit enable row level security;
revoke all on public.gtl_profiles, public.gtl_schedule_templates, public.gtl_invites, public.gtl_access_audit from public, anon, authenticated;
grant select, insert, update on public.gtl_profiles, public.gtl_invites to service_role;
grant select on public.gtl_schedule_templates to service_role;
grant select, insert on public.gtl_access_audit to service_role;
grant insert on public.gtl_memberships to service_role;

-- Defense in depth for roster roles even when a trusted server calls the RPCs.
create function public.gtl_validate_membership() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid;
begin
  if new.league_id = 'sean-troy-luke' then
    if new.player_id not in ('sean', 'troy', 'luke') or ((new.player_id = 'sean') <> (new.role = 'commissioner')) then
      raise exception 'GTL_FIXED_ROSTER';
    end if;
  else
    select created_by into owner_id from public.gtl_leagues where id = new.league_id;
    if new.player_id <> 'u_' || replace(new.user_id::text, '-', '') or owner_id is null
      or ((new.user_id = owner_id) <> (new.role = 'commissioner')) then
      raise exception 'GTL_FORBIDDEN';
    end if;
  end if;
  return new;
end $$;
create trigger gtl_membership_guard before insert or update on public.gtl_memberships
for each row execute function public.gtl_validate_membership();

create function public.gtl_save_profile(p_user_id uuid, p_display_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 60 or p_display_name ~ '[[:cntrl:]]' then raise exception 'GTL_INVALID_NAME'; end if;
  insert into public.gtl_profiles (user_id, display_name) values (p_user_id, btrim(p_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();
  return jsonb_build_object('id', p_user_id, 'displayName', btrim(p_display_name));
end $$;

create function public.gtl_lobby(p_user_id uuid, p_email text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p_user_id, 'displayName', coalesce((select display_name from public.gtl_profiles where user_id = p_user_id), '')),
    'leagues', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.state->'league'->>'name', 'format', l.format, 'role', m.role,
      'memberCount', (select count(*) from public.gtl_memberships x where x.league_id = l.id and x.active),
      'maxMembers', l.max_members, 'practice', l.practice) order by l.id)
      from public.gtl_memberships m join public.gtl_leagues l on l.id = m.league_id where m.user_id = p_user_id and m.active), '[]'::jsonb),
    'pendingInvites', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'leagueId', l.id, 'leagueName', l.state->'league'->>'name', 'format', l.format,
      'inviterName', coalesce(p.display_name, 'Game commissioner'), 'expiresAt', i.expires_at) order by i.created_at)
      from public.gtl_invites i join public.gtl_leagues l on l.id = i.league_id
      left join public.gtl_profiles p on p.user_id = i.invited_by
      where i.email = lower(btrim(p_email)) and i.status = 'pending' and i.expires_at > now()
        and not exists (select 1 from public.gtl_memberships m where m.user_id = p_user_id and m.league_id = l.id)), '[]'::jsonb));
end $$;

create function public.gtl_create_league(p_user_id uuid, p_name text, p_format text, p_practice boolean, p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare profile public.gtl_profiles; template public.gtl_schedule_templates; existing public.gtl_leagues; lid text; pid text; member jsonb; fresh jsonb; cap integer;
begin
  -- Serialize requests per owner, including identical retries and creation limits.
  select * into profile from public.gtl_profiles where user_id = p_user_id for update;
  if not found then raise exception 'GTL_PROFILE_REQUIRED'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_name ~ '[[:cntrl:]]' or p_format not in ('duel', 'group') or p_format is null or p_practice is null or p_request_id is null then raise exception 'GTL_INVALID_GAME'; end if;
  select * into existing from public.gtl_leagues where created_by = p_user_id and creation_key = p_request_id;
  if found then
    if existing.state->'league'->>'name' <> btrim(p_name) or existing.format <> p_format or existing.practice <> p_practice then raise exception 'GTL_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('leagueId', existing.id);
  end if;
  if (select count(*) from public.gtl_leagues where created_by = p_user_id) >= 10 then raise exception 'GTL_GAME_LIMIT'; end if;
  select * into template from public.gtl_schedule_templates order by season desc, week desc limit 1;
  if not found then raise exception 'GTL_SCHEDULE_UNAVAILABLE'; end if;
  lid := 'g_' || replace(gen_random_uuid()::text, '-', '');
  pid := 'u_' || replace(p_user_id::text, '-', '');
  cap := case when p_format = 'duel' then 2 else 20 end;
  member := jsonb_build_object('id', pid, 'name', profile.display_name, 'role', 'Commissioner');
  fresh := jsonb_build_object('version', 1, 'league', jsonb_build_object(
    'id', lid, 'name', btrim(p_name), 'season', template.season, 'week', template.week,
    'roster', jsonb_build_array(member), 'format', case when p_format = 'duel' then 'Duel' else 'Private Group' end,
    'perGameLimit', 1, 'maxMembers', cap, 'practice', p_practice, 'deadline', template.deadline,
    'actualKickoff', null, 'scheduleSource', template.schedule_source),
    'games', template.games, 'ballots', '{}'::jsonb, 'bets', '{}'::jsonb, 'results', '{}'::jsonb,
    'history', '[]'::jsonb, 'audit', '[]'::jsonb, 'archivedCount', 0, 'frozen', '{}'::jsonb);
  insert into public.gtl_leagues (id, state, created_by, creation_key, format, max_members, practice, joinable)
    values (lid, fresh, p_user_id, p_request_id, p_format, cap, p_practice, true);
  insert into public.gtl_memberships (user_id, league_id, player_id, role) values (p_user_id, lid, pid, 'commissioner');
  insert into public.gtl_access_audit (league_id, actor_id, event) values (lid, p_user_id, 'game_created');
  return jsonb_build_object('leagueId', lid);
end $$;

create function public.gtl_create_invite(p_user_id uuid, p_actor_email text, p_league_id text, p_email text, p_token_hash text, p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare game public.gtl_leagues; invitation public.gtl_invites;
begin
  select * into game from public.gtl_leagues where id = p_league_id for update;
  if not found or not exists (select 1 from public.gtl_memberships where user_id = p_user_id and league_id = p_league_id and active and role = 'commissioner') then raise exception 'GTL_FORBIDDEN'; end if;
  if not game.joinable or p_league_id = 'sean-troy-luke' then raise exception 'GTL_FIXED_ROSTER'; end if;
  if p_email is null or char_length(p_email) not between 3 and 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_email <> lower(btrim(p_email)) or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_request_id is null then raise exception 'GTL_INVALID_INVITE'; end if;
  if p_email = lower(btrim(p_actor_email)) then raise exception 'GTL_SELF_INVITE'; end if;
  if exists (select 1 from public.gtl_invites i join public.gtl_memberships m on m.user_id = i.accepted_by and m.league_id = i.league_id
    where i.league_id = p_league_id and i.email = p_email and i.status = 'accepted' and m.active) then raise exception 'GTL_ALREADY_MEMBER'; end if;
  if exists (select 1 from public.gtl_invites where invited_by = p_user_id and request_id = p_request_id) then raise exception 'GTL_INVITE_RETRY'; end if;
  update public.gtl_invites set status = 'expired' where league_id = p_league_id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.gtl_invites where league_id = p_league_id and email = p_email and status = 'pending') then raise exception 'GTL_PENDING_INVITE'; end if;
  if (select count(*) from public.gtl_memberships where league_id = p_league_id and active) + (select count(*) from public.gtl_invites where league_id = p_league_id and status = 'pending') >= game.max_members then raise exception 'GTL_GAME_FULL'; end if;
  insert into public.gtl_invites (league_id, invited_by, email, token_hash, request_id)
    values (p_league_id, p_user_id, p_email, p_token_hash, p_request_id) returning * into invitation;
  insert into public.gtl_access_audit (league_id, actor_id, event, invite_id) values (p_league_id, p_user_id, 'invite_created', invitation.id);
  return jsonb_build_object('inviteId', invitation.id, 'expiresAt', invitation.expires_at);
end $$;

create function public.gtl_list_invites(p_user_id uuid, p_league_id text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.gtl_memberships where user_id = p_user_id and league_id = p_league_id and active and role = 'commissioner') then raise exception 'GTL_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'expiresAt', expires_at,
    'status', case when status = 'pending' and expires_at <= now() then 'expired' else status end, 'createdAt', created_at) order by created_at desc)
    from public.gtl_invites where league_id = p_league_id), '[]'::jsonb);
end $$;

create function public.gtl_accept_invite(p_user_id uuid, p_email text, p_token_hash text, p_invite_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare invitation public.gtl_invites; game public.gtl_leagues; profile public.gtl_profiles; pid text; joined jsonb;
begin
  if p_email is null or btrim(p_email) = '' or (p_token_hash is null) = (p_invite_id is null) then raise exception 'GTL_INVALID_INVITE'; end if;
  select * into invitation from public.gtl_invites where (p_token_hash is not null and token_hash = p_token_hash) or (p_invite_id is not null and id = p_invite_id);
  if not found or invitation.email <> lower(btrim(p_email)) then raise exception 'GTL_INVITE_UNAVAILABLE'; end if;
  -- Every joining/inviting/revoking transaction locks the league before the invite.
  select * into game from public.gtl_leagues where id = invitation.league_id for update;
  select * into invitation from public.gtl_invites where id = invitation.id for update;
  if invitation.status = 'accepted' and invitation.accepted_by = p_user_id and exists (select 1 from public.gtl_memberships where user_id = p_user_id and league_id = game.id and active) then return jsonb_build_object('leagueId', game.id); end if;
  if invitation.status <> 'pending' or invitation.expires_at <= now() or not game.joinable or game.id = 'sean-troy-luke' then raise exception 'GTL_INVITE_UNAVAILABLE'; end if;
  select * into profile from public.gtl_profiles where user_id = p_user_id;
  if not found then raise exception 'GTL_PROFILE_REQUIRED'; end if;
  if exists (select 1 from public.gtl_memberships where user_id = p_user_id and league_id = game.id) then raise exception 'GTL_ALREADY_MEMBER'; end if;
  if (select count(*) from public.gtl_memberships where league_id = game.id and active) >= game.max_members then raise exception 'GTL_GAME_FULL'; end if;
  pid := 'u_' || replace(p_user_id::text, '-', '');
  joined := jsonb_build_object('id', pid, 'name', profile.display_name, 'role', 'Player');
  insert into public.gtl_memberships (user_id, league_id, player_id, role) values (p_user_id, game.id, pid, 'player');
  update public.gtl_leagues set state = jsonb_set(game.state, '{league,roster}', (game.state->'league'->'roster') || jsonb_build_array(joined)), revision = revision + 1, updated_at = now() where id = game.id;
  update public.gtl_invites set status = 'accepted', accepted_by = p_user_id, accepted_at = now() where id = invitation.id;
  insert into public.gtl_access_audit (league_id, actor_id, event, invite_id) values (game.id, p_user_id, 'invite_accepted', invitation.id);
  return jsonb_build_object('leagueId', game.id);
end $$;

create function public.gtl_revoke_invite(p_user_id uuid, p_league_id text, p_invite_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare game public.gtl_leagues; invitation public.gtl_invites;
begin
  select * into game from public.gtl_leagues where id = p_league_id for update;
  if not found or not exists (select 1 from public.gtl_memberships where user_id = p_user_id and league_id = p_league_id and active and role = 'commissioner') then raise exception 'GTL_FORBIDDEN'; end if;
  select * into invitation from public.gtl_invites where id = p_invite_id and league_id = p_league_id for update;
  if not found then raise exception 'GTL_INVITE_UNAVAILABLE'; end if;
  if invitation.status = 'accepted' then raise exception 'GTL_INVITE_ACCEPTED'; end if;
  if invitation.status = 'revoked' then return jsonb_build_object('revoked', true); end if;
  update public.gtl_invites set status = 'revoked' where id = invitation.id;
  insert into public.gtl_access_audit (league_id, actor_id, event, invite_id) values (p_league_id, p_user_id, 'invite_revoked', invitation.id);
  return jsonb_build_object('revoked', true);
end $$;

-- SQL RPCs run with caller privileges, never SECURITY DEFINER. Only the verified
-- server service role may supply actor identity and confirmed email parameters.
revoke execute on function public.gtl_validate_membership() from public, anon, authenticated;
revoke execute on function public.gtl_save_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.gtl_lobby(uuid, text) from public, anon, authenticated;
revoke execute on function public.gtl_create_league(uuid, text, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.gtl_create_invite(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.gtl_list_invites(uuid, text) from public, anon, authenticated;
revoke execute on function public.gtl_accept_invite(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.gtl_revoke_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.gtl_validate_membership(), public.gtl_save_profile(uuid, text), public.gtl_lobby(uuid, text),
  public.gtl_create_league(uuid, text, text, boolean, uuid), public.gtl_create_invite(uuid, text, text, text, text, uuid),
  public.gtl_list_invites(uuid, text), public.gtl_accept_invite(uuid, text, text, uuid), public.gtl_revoke_invite(uuid, text, uuid) to service_role;
