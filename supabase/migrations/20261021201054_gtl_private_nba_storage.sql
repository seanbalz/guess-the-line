-- Private archival NBA storage. No app RPC, public view, feed or NFL dependency.
-- Access is deliberately limited to database administrators until a separate NBA product is approved.
create schema if not exists nba_private authorization postgres;
revoke all on schema nba_private from public, anon, authenticated, service_role;
alter default privileges in schema nba_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema nba_private revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema nba_private revoke execute on functions from public, anon, authenticated, service_role;

create table if not exists nba_private.bet_imports (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  imported_at timestamptz not null default now(),
  unique (owner_id, source_sha256),
  unique (id, owner_id)
);

create table if not exists nba_private.bets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  import_id uuid not null,
  sport text not null default 'nba' check (sport = 'nba'),
  season text not null check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  event_date date not null,
  kind text not null check (kind in ('single', 'parlay')),
  label text not null check (length(trim(label)) between 1 and 500),
  legs jsonb not null check (jsonb_typeof(legs) = 'array'),
  odds numeric(12,4) not null check (abs(odds) between 100 and 1000000),
  stake_units numeric(16,8) not null check (stake_units > 0 and stake_units < 1000000),
  outcome text not null check (outcome in ('pending', 'win', 'loss', 'push', 'void')),
  net_units numeric(20,8) generated always as (
    case outcome when 'pending' then null when 'loss' then -stake_units
      when 'win' then round(case when odds > 0 then stake_units * odds / 100 else stake_units * 100 / nullif(abs(odds), 0) end, 8)
      else 0 end
  ) stored,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  source_record jsonb not null check (jsonb_typeof(source_record) = 'object'),
  imported_at timestamptz not null default now(),
  foreign key (import_id, owner_id) references nba_private.bet_imports(id, owner_id),
  check ((kind = 'single' and jsonb_array_length(legs) = 1) or
         (kind = 'parlay' and jsonb_array_length(legs) >= 2))
);
create index if not exists nba_bets_owner_date on nba_private.bets(owner_id, event_date, id);
create index if not exists nba_bets_import_owner on nba_private.bets(import_id, owner_id);

alter table nba_private.bet_imports enable row level security;
alter table nba_private.bet_imports force row level security;
alter table nba_private.bets enable row level security;
alter table nba_private.bets force row level security;
-- No policies: default deny, including account owners in the NFL client.
revoke all on all tables in schema nba_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema nba_private from public, anon, authenticated, service_role;
revoke all on all functions in schema nba_private from public, anon, authenticated, service_role;
