-- Private application storage. Browsers must use the authenticated gtl-api.
-- No anon/authenticated table grants or RLS policies are intentional:
-- the Edge Function verifies identity and league membership before reading.
create table public.gtl_leagues (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint gtl_state_version check (state->>'version' = '1'),
  constraint gtl_state_league check (state->'league'->>'id' = id),
  constraint gtl_state_shape check (
    jsonb_typeof(state) = 'object'
    and jsonb_typeof(state->'games') = 'array'
    and jsonb_typeof(state->'ballots') = 'object'
    and jsonb_typeof(state->'audit') = 'array'
  )
);

create table public.gtl_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null references public.gtl_leagues(id),
  player_id text not null check (player_id in ('sean', 'troy', 'luke')),
  active boolean not null default true,
  role text not null check (role in ('commissioner', 'player')),
  created_at timestamptz not null default now(),
  primary key (user_id, league_id),
  unique (league_id, player_id),
  constraint gtl_roster_role check ((player_id = 'sean') = (role = 'commissioner'))
);

alter table public.gtl_leagues enable row level security;
alter table public.gtl_memberships enable row level security;
revoke all on public.gtl_leagues, public.gtl_memberships from public, anon, authenticated;
grant select, insert, update on public.gtl_leagues to service_role;
grant select on public.gtl_memberships to service_role;

comment on table public.gtl_leagues is 'Private state; RLS enabled with no browser grants. Only the verified-member Edge API may expose filtered views. Revision enables compare-and-swap updates across devices.';
comment on table public.gtl_memberships is 'Owner-managed account-to-roster mapping. Signup and user_metadata never grant league access. No browser access.';
