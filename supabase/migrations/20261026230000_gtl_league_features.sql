-- M-25 league_features (redesign build plan stage 69; D-35, D-36, D-23). Streaks, badges, weekly awards and season
-- winners, decided by the shared pure rules in shared/game-features/ (stage 68) and recorded here by the features job
-- (cloud/features.mjs: the commissioner's POST /league/features/run now, the M-26 schedule later). They read the scored,
-- settled record and never change a score, a rank or a result.
--
-- What it adds (nothing existing is changed or replaced):
-- * gtl_feature_runs: one row per recorded run (its trigger, actor and summary), so a retried run replays.
-- * gtl_badge_events: append-only. A badge is earned once per key (the badge, the player, the week and the game or market);
--   a later run that no longer finds it, after a corrected final or settlement, adds a 'removed' event and deletes nothing.
--   Every event carries visible_at: a badge names a line, so it is recorded only once that game's kickoff (a week badge:
--   the week's last kickoff) has passed, when every line and guess for it is open to every member (D-31, D-39).
-- * gtl_weekly_awards: versioned per league (the Community or one group) and week; week 0 holds the season winners,
--   decided once Week 18 is final. A run writes a new version only when the awards changed.
-- * gtl_player_streaks: versioned per player and season (the Pick streak and the Bets streak, current and best).
-- * gtl_read_feature_inputs: the job's inputs, in shared/game-features/week.mjs's shape: every published week of the
--   season, its games and finals, the kickoff line (M-06's gtl_kickoff_line), the eligible locked-in guesses of games
--   that have kicked off (scored by gtl_ballot_pick_scores, the one scoring function), the ballots' lock-in facts for
--   the Pick streak, and the Virtual Units bets of games that have kicked off. Real slips are never read (D-36).
-- * gtl_record_feature_results: the idempotent writer (a run id that was recorded replays its summary). It refuses a
--   badge that is not visible yet, an unknown badge or award, and a player who is not a member.
-- * gtl_read_features: the gated reader behind POST /league/features. A Community member reads the Community's awards;
--   only a group's active members read that group's (group standings stay private). Badges and streaks are per account
--   and every member may see them, as the board shows them.
-- * Feed posts, Community only: badge_earned (fresh earns only, not a first-run backfill), weekly_recap (the newest
--   week's awards, once) and season_champion (once). They need M-13's kind list; until then each insert is refused by
--   the existing check and counted in the run summary as skipped, and the badges and awards are still recorded.
--   Group recaps are never posted: the Community feed reader would show them to everyone (stage 62 scopes posts).
--
-- Apply after M-13 (feed kinds) and M-06 (gtl_kickoff_line, hosted). Rerunnable: tables and indexes are created only if
-- missing, every function is create or replace with this exact argument list, and every grant is restated. Every
-- function and table is service-role only; no browser role gets anything. Off switches: GTL_FEATURE_OFF=features stops
-- the commissioner's run, M-26's schedule starts disabled, and no row is ever dropped. No hosted action is performed by
-- this file.

create table if not exists public.gtl_feature_runs (
  id uuid primary key,
  season integer not null check(season between 2000 and 2200),
  trigger text not null check(trigger in ('manual','schedule')),
  actor_id uuid,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  summary jsonb not null default '{}' check(jsonb_typeof(summary)='object')
);
create index if not exists gtl_feature_runs_season_idx on public.gtl_feature_runs(season,started_at desc);

create table if not exists public.gtl_badge_events (
  id bigint generated always as identity primary key,
  award_key text not null check(length(award_key) between 3 and 300),
  user_id uuid not null,
  badge text not null check(badge in ('bullseye','double_bullseye','called_the_move','dialed_in','closer','never_missed','sharp',
    'dog_day','perfect_week','hot_hand','lone_wolf','showdown','giant_slayer','taker')),
  season integer not null check(season between 2000 and 2200),
  week integer not null check(week between 1 and 25),
  event text not null check(event in ('earned','removed')),
  visible_at timestamptz not null,
  facts jsonb not null default '{}' check(jsonb_typeof(facts)='object' and octet_length(facts::text)<=2000),
  run_id uuid not null references public.gtl_feature_runs(id),
  created_at timestamptz not null default clock_timestamp(),
  check(award_key like badge||':'||user_id::text||':'||season::text||':'||week::text||'%')
);
create index if not exists gtl_badge_events_key_idx on public.gtl_badge_events(award_key,id desc);
create index if not exists gtl_badge_events_season_idx on public.gtl_badge_events(season,user_id);

create table if not exists public.gtl_weekly_awards (
  league_id text not null check(league_id='community' or league_id ~ '^(sean-troy-luke|g_[0-9a-f]{32})$'),
  season integer not null check(season between 2000 and 2200),
  -- Week 0 is the season: the Spread, Total and Bets champions.
  week integer not null check(week between 0 and 25),
  version integer not null check(version>=1),
  awards jsonb not null check(jsonb_typeof(awards)='array' and octet_length(awards::text)<=65536),
  run_id uuid not null references public.gtl_feature_runs(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(league_id,season,week,version)
);

create table if not exists public.gtl_player_streaks (
  user_id uuid not null,
  season integer not null check(season between 2000 and 2200),
  version integer not null check(version>=1),
  streaks jsonb not null check(jsonb_typeof(streaks)='object' and octet_length(streaks::text)<=2000),
  run_id uuid not null references public.gtl_feature_runs(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season,version)
);

alter table public.gtl_feature_runs enable row level security;
alter table public.gtl_badge_events enable row level security;
alter table public.gtl_weekly_awards enable row level security;
alter table public.gtl_player_streaks enable row level security;
revoke all on public.gtl_feature_runs,public.gtl_badge_events,public.gtl_weekly_awards,public.gtl_player_streaks from public,anon,authenticated,service_role;
-- Append-only and versioned: no update or delete for anyone the API runs as (D-23). A run's summary is filled in once.
grant select,insert on public.gtl_feature_runs,public.gtl_badge_events,public.gtl_weekly_awards,public.gtl_player_streaks to service_role;
grant update(finished_at,summary) on public.gtl_feature_runs to service_role;

-- One week's final or void result per game: the newest Virtual Units settlement version, else the newest commissioner-
-- reviewed final (the order Community history uses). Postponed and cancelled games are void (D-26).
create or replace function public.gtl_feature_results(p_season integer,p_week integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,case when v.status='final' then jsonb_build_object('status','final','home',v.home,'away',v.away)
        else jsonb_build_object('status','void') end r
      from public.gtl_virtual_units_settlements v where v.season=p_season and v.week=p_week order by v.game_id,v.version desc) q),'{}'::jsonb)
  || coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status','final','home',(q.result->>'home')::integer,'away',(q.result->>'away')::integer))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e
        where e.season=p_season and e.week=p_week order by e.game_id,e.version desc) q
      where q.result->>'status'='final' and (q.result->>'home') ~ '^[0-9]{1,3}$' and (q.result->>'away') ~ '^[0-9]{1,3}$'
        and not exists(select 1 from public.gtl_virtual_units_settlements v where v.season=p_season and v.week=p_week and v.game_id=q.game_id)),'{}'::jsonb)
$$;

create or replace function public.gtl_read_feature_inputs(p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); s integer:=p_season; z record; g jsonb; gid text; ko timestamptz;
  weeks jsonb:='[]'; games jsonb; kick jsonb; results jsonb; guesses jsonb; ballots jsonb; bets jsonb; b record; ps record;
begin
  if s is null then select max(x.season) into s from public.gtl_weekly_slates x; end if;
  for z in select x.season,x.week,x.signature from public.gtl_weekly_slates x where x.season=s order by x.week loop
    results:=public.gtl_feature_results(z.season,z.week);
    games:='[]'; kick:='{}';
    for g in select x from jsonb_array_elements(case when jsonb_typeof(z.signature->'games')='array' then z.signature->'games' else '[]'::jsonb end) x
        order by (x->>'kickoff')::numeric,x->>'id' loop
      gid:=g->>'id'; ko:=to_timestamp((g->>'kickoff')::numeric);
      games:=games||jsonb_build_array(jsonb_build_object('id',gid,'home',g->>'home','away',g->>'away','kickoff',ko,'result',results->gid));
      -- The kickoff line is read only once the game has kicked off: before then the 12-hour window is still filling.
      if ko<=now_at then
        kick:=kick||jsonb_build_object(gid,jsonb_build_object('spread',public.gtl_kickoff_line(z.season,z.week,gid,'spread')->'value',
          'total',public.gtl_kickoff_line(z.season,z.week,gid,'total')->'value'));
      end if;
    end loop;
    guesses:='[]'; ballots:='[]';
    for b in select x.* from public.gtl_weekly_ballots x where x.season=z.season and x.week=z.week order by x.user_id,x.mode loop
      ballots:=ballots||jsonb_build_array(jsonb_build_object('userId',b.user_id,'market',case when b.mode='guess_spread' then 'spread' else 'total' end,
        'submitted',coalesce(b.ballot->>'submittedAt','')<>'',
        'locked',coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(case when jsonb_typeof(b.ballot->'picks')='object' then b.ballot->'picks' else '{}'::jsonb end) k
          where public.gtl_ballot_locked_in(b.ballot,k) and exists(select 1 from jsonb_array_elements(games) y where y->>'id'=k)),'[]'::jsonb),
        'closed',coalesce((select jsonb_agg(c order by c) from (select distinct c from jsonb_array_elements_text(case when jsonb_typeof(b.ballot->'closedAtKickoff')='array' then b.ballot->'closedAtKickoff' else '[]'::jsonb end) c
          where exists(select 1 from jsonb_array_elements(games) y where y->>'id'=c)) q),'[]'::jsonb),
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=b.user_id and o.season=b.season and o.week=b.week and o.mode=b.mode),
        'eligible',public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)));
      continue when not public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
      for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
        continue when ps.kickoff>now_at or ps.guess is null or not public.gtl_ballot_locked_in(b.ballot,ps.game_id);
        guesses:=guesses||jsonb_build_array(jsonb_build_object('userId',b.user_id,'market',case when b.mode='guess_spread' then 'spread' else 'total' end,
          'gameId',ps.game_id,'guess',ps.guess,
          'reference',case when ps.points is not null then ps.reference->'value' end,'points',ps.points,
          'late',public.gtl_guess_late(b.ballot,ps.game_id) is not null));
      end loop;
    end loop;
    -- A sit-out with no ballot row still breaks the Pick streak.
    ballots:=ballots||coalesce((select jsonb_agg(jsonb_build_object('userId',o.user_id,'market',case when o.mode='guess_spread' then 'spread' else 'total' end,
        'submitted',false,'locked','[]'::jsonb,'closed','[]'::jsonb,'satOut',true,'eligible',true) order by o.user_id,o.mode)
      from public.gtl_weekly_optouts o where o.season=z.season and o.week=z.week
        and not exists(select 1 from public.gtl_weekly_ballots x where x.user_id=o.user_id and x.season=o.season and x.week=o.week and x.mode=o.mode)),'[]'::jsonb);
    bets:=coalesce((select jsonb_agg(jsonb_build_object('userId',v.user_id,'gameId',v.game_id,'market',v.market,'side',v.selection->>'side',
        'line',(v.selection->>'line')::numeric,'odds',(v.selection->>'odds')::numeric,'units',(v.selection->>'units')::numeric,'status',v.status,
        'netUnits',case when v.status='win' and v.result->>'netUnits' ~ '^-?[0-9]+(\.[0-9]+)?$' then (v.result->>'netUnits')::numeric end,'kind','book')
        order by v.user_id,v.game_id,v.market)
      from public.gtl_virtual_units_picks v where v.season=z.season and v.week=z.week
        and exists(select 1 from jsonb_array_elements(games) y where y->>'id'=v.game_id and (y->>'kickoff')::timestamptz<=now_at)),'[]'::jsonb);
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'games',games,'kickoff',kick,
      'guesses',guesses,'ballots',ballots,'bets',bets,
      'publisher',(select f.actor_id from public.gtl_feed_posts f where f.kind='week_published' and f.season=z.season and f.week=z.week order by f.created_at,f.id limit 1)));
  end loop;
  return jsonb_build_object('season',s,'now',now_at,'weeks',weeks,
    'rosters',jsonb_build_object('community',coalesce((select jsonb_agg(p.user_id order by p.user_id) from public.gtl_profiles p),'[]'::jsonb))
      ||coalesce((select jsonb_object_agg(q.league_id,q.members) from (select m.league_id,jsonb_agg(m.user_id order by m.user_id) members
        from public.gtl_memberships m where m.active group by m.league_id) q),'{}'::jsonb),
    'removed',coalesce((select jsonb_agg(r.user_id order by r.user_id) from public.gtl_community_removals r),'[]'::jsonb));
end $$;

-- One feed post, never blocking the run: a kind the feed check does not allow yet (before M-13) or an actor without a
-- profile is counted as skipped. Returns true when a post was written, false when it was skipped or already there.
create or replace function public.gtl_feature_post(p_actor uuid,p_kind text,p_season integer,p_week integer,p_payload jsonb,p_dedupe text,p_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_actor is null then return false; end if;
  insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,payload,dedupe_key,created_at)
    values(p_actor,p_kind,p_season,p_week,null,p_payload,p_dedupe,p_at) on conflict(dedupe_key) do nothing;
  get diagnostics n=row_count;
  return n>0;
exception when check_violation or foreign_key_violation then return false;
end $$;

-- p_results (cloud/features.mjs computeFeatures):
--   { season, computed: [badge id], badges: [{ badge, userId, key, week, visibleAt, facts }],
--     awards: [{ leagueId, week, awards: [...] }], seasonWinners: [{ leagueId, winners: [...] }],
--     streaks: [{ userId, streaks: { pick: { current, best }, bets: { current, best } } }] }
-- p_trigger 'manual' needs the community commissioner as p_actor; 'schedule' is the M-26 job. The writer takes the
-- database clock for visibility: a badge whose visibleAt has not passed is refused, whatever the caller sends.
create or replace function public.gtl_record_feature_results(p_run uuid,p_trigger text,p_actor uuid,p_results jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz; s integer; item jsonb; prior record; computed text[]; listed text[]:='{}'; members uuid[]; removed uuid[];
  earned_n integer:=0; removed_n integer:=0; awards_n integer:=0; streaks_n integer:=0; posted integer:=0; skipped integer:=0;
  latest_week integer; v_key text; v_badge text; v_user uuid; v_week integer; v_visible timestamptz; v_league text; v_version integer;
  publisher uuid; v_summary jsonb; r public.gtl_feature_runs;
begin
  if p_run is null or p_trigger is null or p_trigger not in ('manual','schedule') or p_results is null or jsonb_typeof(p_results)<>'object'
    or octet_length(p_results::text)>2000000 or jsonb_typeof(p_results->'season') is distinct from 'number'
    or exists(select 1 from jsonb_object_keys(p_results) k where k not in ('season','computed','badges','awards','seasonWinners','streaks'))
    then raise exception 'GTL_FEATURES_INVALID'; end if;
  if p_trigger='manual' and not public.gtl_community_admin(p_actor) then raise exception 'GTL_FEATURES_FORBIDDEN'; end if;
  s:=(p_results->>'season')::integer;
  -- One writer at a time, so two runs can never both earn the same key.
  perform pg_advisory_xact_lock(hashtext('gtl_record_feature_results'));
  select * into r from public.gtl_feature_runs where id=p_run;
  if found then
    if r.season<>s or r.trigger<>p_trigger then raise exception 'GTL_FEATURES_INVALID'; end if;
    return r.summary||jsonb_build_object('replay',true);
  end if;
  stamp:=clock_timestamp();
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_results->'computed')='array' then p_results->'computed' else '[]'::jsonb end) x loop
    if jsonb_typeof(item)<>'string' then raise exception 'GTL_FEATURES_INVALID'; end if;
  end loop;
  select coalesce(array_agg(x),'{}') into computed from jsonb_array_elements_text(case when jsonb_typeof(p_results->'computed')='array' then p_results->'computed' else '[]'::jsonb end) x;
  if exists(select 1 from unnest(computed) c where c not in ('bullseye','double_bullseye','called_the_move','dialed_in','closer','never_missed','sharp',
      'dog_day','perfect_week','hot_hand','lone_wolf','showdown','giant_slayer','taker')) then raise exception 'GTL_FEATURES_INVALID'; end if;
  select coalesce(array_agg(user_id),'{}') into members from public.gtl_profiles;
  select coalesce(array_agg(user_id),'{}') into removed from public.gtl_community_removals;
  insert into public.gtl_feature_runs(id,season,trigger,actor_id,started_at) values(p_run,s,p_trigger,p_actor,stamp);

  -- Badges: earn each listed key whose newest event is not an earn.
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_results->'badges')='array' then p_results->'badges' else '[]'::jsonb end) x loop
    begin
      v_badge:=item->>'badge'; v_user:=(item->>'userId')::uuid; v_week:=(item->>'week')::integer; v_key:=item->>'key'; v_visible:=(item->>'visibleAt')::timestamptz;
    exception when others then raise exception 'GTL_FEATURES_INVALID';
    end;
    if v_badge is null or not (v_badge=any(computed)) or v_user is null or not (v_user=any(members)) or v_week is null or v_key is null
      or v_key not like v_badge||':'||v_user::text||':'||s::text||':'||v_week::text||'%' or v_visible is null or v_visible>stamp
      or jsonb_typeof(coalesce(item->'facts','{}'::jsonb))<>'object' then raise exception 'GTL_FEATURES_INVALID'; end if;
    listed:=listed||v_key;
    select e.event into prior from public.gtl_badge_events e where e.award_key=v_key order by e.id desc limit 1;
    continue when found and prior.event='earned';
    insert into public.gtl_badge_events(award_key,user_id,badge,season,week,event,visible_at,facts,run_id)
      values(v_key,v_user,v_badge,s,v_week,'earned',v_visible,coalesce(item->'facts','{}'::jsonb),p_run);
    earned_n:=earned_n+1;
    -- A fresh earn makes a post; a first run's backfill of older weeks, or a removed member's, does not.
    if v_visible>=stamp-interval '24 hours' and not (v_user=any(removed)) then
      if public.gtl_feature_post(v_user,'badge_earned',s,v_week,jsonb_build_object('badge',v_badge,'key',v_key,'facts',coalesce(item->'facts','{}'::jsonb)),'badge_earned:'||v_key,stamp)
        then posted:=posted+1; else skipped:=skipped+1; end if;
    end if;
  end loop;
  -- A computed badge's earn that this run no longer finds (a corrected final or settlement) gets a 'removed' event.
  for prior in select distinct on (e.award_key) e.award_key,e.user_id,e.badge,e.week,e.event from public.gtl_badge_events e
      where e.season=s and e.badge=any(computed) order by e.award_key,e.id desc loop
    continue when prior.event<>'earned' or prior.award_key=any(listed);
    insert into public.gtl_badge_events(award_key,user_id,badge,season,week,event,visible_at,facts,run_id)
      values(prior.award_key,prior.user_id,prior.badge,s,prior.week,'removed',stamp,'{}'::jsonb,p_run);
    removed_n:=removed_n+1;
  end loop;

  -- Weekly awards, then the season (week 0): a new version only when they changed.
  latest_week:=(select max((x->>'week')::integer) from jsonb_array_elements(case when jsonb_typeof(p_results->'awards')='array' then p_results->'awards' else '[]'::jsonb end) x
    where x->>'leagueId'='community' and jsonb_typeof(x->'awards')='array' and jsonb_array_length(x->'awards')>0);
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_results->'awards')='array' then p_results->'awards' else '[]'::jsonb end) x
    union all select jsonb_build_object('leagueId',x->>'leagueId','week',0,'awards',x->'winners') from jsonb_array_elements(case when jsonb_typeof(p_results->'seasonWinners')='array' then p_results->'seasonWinners' else '[]'::jsonb end) x loop
    v_league:=item->>'leagueId';
    if v_league is null or not (v_league='community' or (v_league ~ '^(sean-troy-luke|g_[0-9a-f]{32})$' and exists(select 1 from public.gtl_leagues l where l.id=v_league)))
      or jsonb_typeof(item->'week') is distinct from 'number' or (item->>'week') !~ '^[0-9]{1,2}$' or (item->>'week')::integer>25
      or jsonb_typeof(item->'awards') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(item->'awards') a where jsonb_typeof(a)<>'object' or coalesce(a->>'id','') not in
        ('spread_winner','total_winner','bets_winner','best_guess','sharpest_bet','saw_it_coming','worst_beat','biggest_upset','duel_of_the_week','spread_champion','total_champion','bets_champion')
        or jsonb_typeof(a->'winners')<>'array' or exists(select 1 from jsonb_array_elements(a->'winners') w
          where case when jsonb_typeof(w)='string' and w#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then not ((w#>>'{}')::uuid=any(members)) else true end))
      then raise exception 'GTL_FEATURES_INVALID'; end if;
    v_week:=(item->>'week')::integer;
    select w.version,w.awards into prior from public.gtl_weekly_awards w where w.league_id=v_league and w.season=s and w.week=v_week order by w.version desc limit 1;
    v_version:=case when found then prior.version else 0 end;
    if v_version=0 or prior.awards is distinct from item->'awards' then
      insert into public.gtl_weekly_awards(league_id,season,week,version,awards,run_id) values(v_league,s,v_week,v_version+1,item->'awards',p_run);
      awards_n:=awards_n+1;
    end if;
    continue when v_league<>'community' or jsonb_array_length(item->'awards')=0;
    if v_week>0 and v_week=latest_week then
      publisher:=coalesce((select f.actor_id from public.gtl_feed_posts f where f.kind='week_published' and f.season=s and f.week=v_week order by f.created_at,f.id limit 1),
        case when p_actor=any(members) then p_actor end);
      if public.gtl_feature_post(publisher,'weekly_recap',s,v_week,jsonb_build_object('season',s,'week',v_week,'awards',item->'awards'),'weekly_recap:'||s||':'||v_week,stamp)
        then posted:=posted+1; elsif not exists(select 1 from public.gtl_feed_posts f where f.dedupe_key='weekly_recap:'||s||':'||v_week) then skipped:=skipped+1; end if;
    elsif v_week=0 then
      publisher:=coalesce((select f.actor_id from public.gtl_feed_posts f where f.kind='week_published' and f.season=s order by f.week desc,f.created_at,f.id limit 1),
        case when p_actor=any(members) then p_actor end);
      if public.gtl_feature_post(publisher,'season_champion',s,null,jsonb_build_object('season',s,'winners',item->'awards'),'season_champion:'||s,stamp)
        then posted:=posted+1; elsif not exists(select 1 from public.gtl_feed_posts f where f.dedupe_key='season_champion:'||s) then skipped:=skipped+1; end if;
    end if;
  end loop;

  -- Streaks: a new version only when a player's streaks changed.
  for item in select x from jsonb_array_elements(case when jsonb_typeof(p_results->'streaks')='array' then p_results->'streaks' else '[]'::jsonb end) x loop
    begin v_user:=(item->>'userId')::uuid; exception when others then raise exception 'GTL_FEATURES_INVALID'; end;
    if v_user is null or not (v_user=any(members)) or jsonb_typeof(item->'streaks') is distinct from 'object' then raise exception 'GTL_FEATURES_INVALID'; end if;
    select p.version,p.streaks into prior from public.gtl_player_streaks p where p.user_id=v_user and p.season=s order by p.version desc limit 1;
    v_version:=case when found then prior.version else 0 end;
    continue when v_version>0 and prior.streaks is not distinct from item->'streaks';
    insert into public.gtl_player_streaks(user_id,season,version,streaks,run_id) values(v_user,s,v_version+1,item->'streaks',p_run);
    streaks_n:=streaks_n+1;
  end loop;

  v_summary:=jsonb_build_object('runId',p_run,'season',s,'trigger',p_trigger,'earned',earned_n,'removed',removed_n,'awards',awards_n,
    'streaks',streaks_n,'posts',posted,'postsSkipped',skipped,'replay',false);
  update public.gtl_feature_runs set finished_at=clock_timestamp(),summary=v_summary where id=p_run;
  return v_summary;
end $$;

-- The features a viewer may read for one league and season (POST /league/features). p_league null is the Community.
create or replace function public.gtl_read_features(p_user uuid,p_league text default null,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); league text:=coalesce(p_league,'community'); s integer:=p_season; roster uuid[];
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if league='community' then
    select coalesce(array_agg(p.user_id),'{}') into roster from public.gtl_profiles p;
  else
    if league !~ '^(sean-troy-luke|g_[0-9a-f]{32})$' then raise exception 'GTL_FEATURES_INVALID'; end if;
    if not exists(select 1 from public.gtl_memberships m where m.user_id=p_user and m.league_id=league and m.active) then raise exception 'GTL_FEATURES_MEMBER'; end if;
    select coalesce(array_agg(m.user_id),'{}') into roster from public.gtl_memberships m where m.league_id=league and m.active;
  end if;
  if s is null then select max(x.season) into s from public.gtl_weekly_slates x; end if;
  return jsonb_build_object('viewer',p_user,'leagueId',p_league,'season',s,
    'ran',exists(select 1 from public.gtl_feature_runs r where r.season=s and r.finished_at is not null),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('userId',e.user_id,'badge',e.badge,'key',e.award_key,'week',e.week,'visibleAt',e.visible_at,'facts',e.facts)
        order by e.visible_at,e.award_key)
      from (select distinct on (x.award_key) x.* from public.gtl_badge_events x where x.season=s and x.user_id=any(roster) order by x.award_key,x.id desc) e
      where e.event='earned' and e.visible_at<=now_at),'[]'::jsonb),
    'awards',coalesce((select jsonb_agg(jsonb_build_object('week',a.week,'version',a.version,'createdAt',a.created_at,'awards',a.awards) order by a.week)
      from (select distinct on (w.week) w.* from public.gtl_weekly_awards w where w.league_id=league and w.season=s and w.week>0 and w.created_at<=now_at
        order by w.week,w.version desc) a),'[]'::jsonb),
    'seasonWinners',(select jsonb_build_object('version',w.version,'createdAt',w.created_at,'winners',w.awards) from public.gtl_weekly_awards w
      where w.league_id=league and w.season=s and w.week=0 and w.created_at<=now_at order by w.version desc limit 1),
    'streaks',coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'streaks',t.streaks) order by t.user_id)
      from (select distinct on (p.user_id) p.* from public.gtl_player_streaks p where p.season=s and p.user_id=any(roster) order by p.user_id,p.version desc) t),'[]'::jsonb));
end $$;

-- Every function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_feature_results(integer,integer),public.gtl_read_feature_inputs(integer,timestamptz),
  public.gtl_feature_post(uuid,text,integer,integer,jsonb,text,timestamptz),public.gtl_record_feature_results(uuid,text,uuid,jsonb),
  public.gtl_read_features(uuid,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_feature_results(integer,integer),public.gtl_read_feature_inputs(integer,timestamptz),
  public.gtl_feature_post(uuid,text,integer,integer,jsonb,text,timestamptz),public.gtl_record_feature_results(uuid,text,uuid,jsonb),
  public.gtl_read_features(uuid,text,integer,timestamptz) to service_role;
