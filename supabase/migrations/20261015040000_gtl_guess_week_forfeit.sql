-- M-03 guess_week_forfeit: "Skip this week's Guess the Line" and "See picks now" (redesign build plan, stage 19; D-36, D-39,
-- D-41, D-23, D-16).
--
-- replaces public.gtl_read_community_history md5 2ebcb46927105a7566670d279d12dcb6
--
-- D-36 (Sean, October 13, 2026): the line lock lasts until "you guess, or there's a button that you confirm you are skipping
-- this weeks guess the line and then it will show", and other players' guesses are "hidden until submit or kickoff, optional
-- button to bypass but then you forego the guess the line game for that week with a warning after clicking that button".
-- D-39 (October 14): both buttons still open everything after a warning and forfeit the rest of the week, and they are allowed
-- "until the last kickoff"; "guesses already locked in keep counting; only the rest of the week is forfeited".
-- D-41 (October 14): each locked-in guess counts on its own (scored per game from M-07, stage 24), and the old app's "Sit out
-- this week" (D-23) stays allowed after some games are locked in: it covers only the games not yet locked in, and the
-- locked-in guesses keep counting, the same as Skip and "See picks now".
--
-- Additive: one append-only table, three new service-only, security-invoker functions, and one read path replaced with the same
-- argument list (gtl_read_community_history, M-01's body plus the D-41 change below). No trigger, existing table, row or table
-- grant changes, nothing is dropped, and no writer other than the new one changes. Rollback:
-- supabase/rollback/20261015040000_gtl_guess_week_forfeit.sql (M-01's history body back, and the service role's execute grant
-- on the three new functions taken back: the two gtl-api calls and their market helper; the table and every row stay, D-23).
-- Off switch for the writer: the gtl-api secret GTL_FEATURE_OFF=forfeit (cloud/feature-off.mjs), which refuses
-- POST /community/forfeit before it reaches the database (and /community/read then reports the forfeit with open false).
--
-- What a forfeit writes, in one transaction (gtl_forfeit_guess_week):
-- * A gtl_weekly_optouts row (the D-23 sit-out, final for the week) for every Guess market of that week the player has neither
--   submitted nor sat out, at once: Spread, Total or both. A submitted market keeps counting and gets no opt-out. The ballot
--   itself is never touched: a guess saved before the forfeit stays stored as it was (D-23). A guess that was locked in stays
--   locked in (gtl_guess_locked_in reads the ballot only) and keeps counting (D-39, D-41): M-08 lists it as 'in', and History
--   lists it (below). A guess that was not locked in never counts and is never shown to anyone.
-- * One gtl_week_forfeits row: the reason ('skip' for "Skip this week's Guess the Line", 'reveal' for "See picks now"), the
--   markets it sat out, and the time (the same instant as its opt-out rows; D-16 keeps it). One per player and week: a forfeit
--   is final, and a repeat (a retry, a second tap, the other button) answers the stored one with replayed: true.
-- * One gtl_access_audit row, 'forfeit:<season>:<week>:<reason>:<markets>', as gtl_sit_out_week writes 'sit_out:...'.
--
-- What follows from the opt-out rows, with no change to any other reader: M-01's gate (gtl_guess_revealed, gtl_markets_visible)
-- opens that market's games for the player, so their lines (M-06, stage 20's Virtual Units lock) and everyone's locked-in
-- guesses (M-08, History, the feed) open; gtl_guard_optout_ballot refuses every later write to that market's ballot
-- (GTL_COMMUNITY_SAT_OUT, mapped in cloud/personal.mjs and cloud/weekly.mjs); /community/read's due and optOuts say sat out, so
-- the picks-due card and the D-28 reminder skip it; standings say "sat out" (null, never 0).
--
-- When (D-39): any time before the week's last kickoff on the published slate, including after Thursday's deadline. At or after
-- the last kickoff it is refused with GTL_FORFEIT_CLOSED (by then every game is open to everyone). A week with nothing left to
-- sit out (both markets submitted or sat out) is refused with GTL_FORFEIT_NOTHING. Either way nothing is written. A non-member is
-- refused with GTL_COMMUNITY_MEMBER and a bad argument or unknown week with GTL_COMMUNITY_INVALID. cloud/community.mjs maps all
-- four, and the gtl-api deploy that carries them goes out before this file is applied (Gate M step 2). The old
-- /community/sit-out (gtl_sit_out_week, unchanged) keeps its own rule: one market, refused after the deadline or once that
-- market is submitted, so under M-02 it stays allowed after some of the market's games are locked in (D-41).
--
-- Concurrency: the forfeit takes the player's gtl_weekly_versions row for the week first, the lock both ballot writers
-- (gtl_save_weekly_ballot, gtl_mutate_personal) take before they touch a ballot, so a save in flight finishes before the markets
-- are read and a save that starts later meets the opt-out guard: a market is never both submitted and forfeited.
--
-- gtl_read_forfeit(user, season, week, now): the player's own forfeit for a week (the newest published week by default), whether
-- a forfeit is still possible now, the last kickoff that closes it, and per market what one would do ('submitted' keeps
-- counting, 'sat_out' already, 'open' would be sat out) with how many of the week's games are locked in. Never another
-- player's data, a pick or a line. /community/read carries it as `forfeit` through cloud/optional-rpc.mjs, so before this apply
-- that reply is unchanged. gtl_forfeit_markets(user, season, week) is that per-market reading, shared by both.
--
-- gtl_read_community_history (D-41): M-01's body lists a market a member sat out as a bare "sat out" entry, whatever its ballot
-- holds. Once M-02 (stage 18) records per-game lock-ins, a player can lock in some of a market's games and then sit out or
-- forfeit the rest, and those locked-in guesses would vanish from History for everyone, the owner included, while M-08 lists
-- them as 'in'. Now such a market (a ballot never submitted that holds a locked-in guess) is listed from its ballot, status
-- 'sat_out' with satOutAt, carrying only its locked-in guesses, each behind the same gate as a submitted ballot's (the owner
-- always; another member while that game and market is open to them, otherwise a hidden row with no number). A guess not locked
-- in is never listed. It scores nothing yet (weekPoints null): per-game scoring is M-07's (D-41). Lock-in is read only through
-- gtl_guess_locked_in, so this works with or without M-02; without per-game lock-ins every reply is exactly M-01's.
--
-- Apply after M-01 (build plan section 6: the gate that opens a forfeited market and the history body this replaces are M-01's).
-- Rerunnable: the table and index are created only if missing, every function is create or replace with this exact argument
-- list, and the grants are restated.

create table if not exists public.gtl_week_forfeits (
  user_id uuid not null references public.gtl_profiles(user_id) on delete cascade,
  season integer not null, week integer not null,
  reason text not null check(reason in ('skip','reveal')),
  -- The markets this forfeit sat out, in mode order, each once.
  modes text[] not null check(cardinality(modes) between 1 and 2 and modes<@array['guess_spread','guess_total']::text[]
    and (cardinality(modes)=1 or modes[1]<modes[2])),
  created_at timestamptz not null default now(),
  primary key(user_id,season,week),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index if not exists gtl_week_forfeits_slate_idx on public.gtl_week_forfeits(season,week);
alter table public.gtl_week_forfeits enable row level security;
revoke all on public.gtl_week_forfeits from public,anon,authenticated,service_role;
-- Append-only: no update or delete for anyone the API runs as. A forfeit is final (D-23).
grant select,insert on public.gtl_week_forfeits to service_role;

-- Each Guess market of a week for one player, as a forfeit sees it, in mode order: [{ mode, status, lockedIn, games }]. status is
-- 'sat_out' (a weekly opt-out: the old "Sit out", or a forfeit), 'submitted' (it keeps counting) or 'open' (a forfeit would sit it
-- out); lockedIn counts the week's games whose guess is locked in (gtl_guess_locked_in); games counts the week's games. An
-- opt-out wins over a submission, as Community history lists a market that has both.
create or replace function public.gtl_forfeit_markets(p_user uuid,p_season integer,p_week integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  with g as (
    select x->>'id' game_id from public.gtl_weekly_slates z
      cross join lateral jsonb_array_elements(case when jsonb_typeof(z.signature->'games')='array' then z.signature->'games' else '[]'::jsonb end) x
    where z.season=p_season and z.week=p_week
  )
  select jsonb_agg(jsonb_build_object('mode',m.mode,'status',case
      when exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=p_season and o.week=p_week and o.mode=m.mode) then 'sat_out'
      when exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=p_season and b.week=p_week and b.mode=m.mode
        and coalesce(b.ballot->>'submittedAt','')<>'') then 'submitted'
      else 'open' end,
    'lockedIn',(select count(*) from g where public.gtl_guess_locked_in(p_user,p_season,p_week,m.mode,g.game_id)),
    'games',(select count(*) from g)) order by m.mode)
  from (values('guess_spread'),('guess_total')) m(mode)
$$;

-- "Skip this week's Guess the Line" ('skip') or "See picks now" ('reveal'): sits out every market of the week the player has
-- neither submitted nor sat out, records why, and audits it, all at once. Idempotent per player and week.
-- The opt-out insert's "on conflict do nothing" guards a race with the old sit-out: gtl_sit_out_week takes no gtl_weekly_versions
-- lock, so it can insert a market's opt-out after gtl_forfeit_markets has read that market as 'open' and before this insert. The
-- insert then skips that market (once the sit-out commits) instead of failing on the opt-out primary key, and only the rows this
-- forfeit inserted are returned, so its modes and audit row name only the markets it sat out (GTL_FORFEIT_NOTHING if none).
create or replace function public.gtl_forfeit_guess_week(p_user uuid,p_season integer,p_week integer,p_reason text,p_now timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); closes_at timestamptz; f public.gtl_week_forfeits; sat text[];
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_reason is null or p_reason not in ('skip','reveal') then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select z.signature into sig from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week;
  if sig is null then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  -- The ballot writers' lock for this player and week, taken first, so a save and a forfeit never cross.
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,p_season,p_week) on conflict do nothing;
  perform 1 from public.gtl_weekly_versions v where v.user_id=p_user and v.season=p_season and v.week=p_week for update;
  -- A forfeit is final: a repeat answers the stored one, whatever its reason, and writes nothing.
  select * into f from public.gtl_week_forfeits x where x.user_id=p_user and x.season=p_season and x.week=p_week;
  if found then
    return jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at,'replayed',true);
  end if;
  -- D-39: until the week's last kickoff on the published slate.
  select max(to_timestamp((g->>'kickoff')::double precision)) into closes_at
    from jsonb_array_elements(case when jsonb_typeof(sig->'games')='array' then sig->'games' else '[]'::jsonb end) g;
  if closes_at is null or now_at>=closes_at then raise exception 'GTL_FORFEIT_CLOSED'; end if;
  -- Sit out every market still open: neither submitted (it keeps counting) nor sat out already.
  with inserted as (
    insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at)
      select p_user,p_season,p_week,m->>'mode',now_at from jsonb_array_elements(public.gtl_forfeit_markets(p_user,p_season,p_week)) m
      where m->>'status'='open'
      on conflict do nothing returning mode)
  select coalesce(array_agg(mode order by mode),'{}') into sat from inserted;
  if cardinality(sat)=0 then raise exception 'GTL_FORFEIT_NOTHING'; end if;
  insert into public.gtl_week_forfeits(user_id,season,week,reason,modes,created_at) values(p_user,p_season,p_week,p_reason,sat,now_at) returning * into f;
  insert into public.gtl_access_audit(actor_id,event) values(p_user,format('forfeit:%s:%s:%s:%s',p_season,p_week,p_reason,array_to_string(sat,',')));
  return jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at,'replayed',false);
end $$;

-- The player's own forfeit for a week (the newest published week when season and week are null) and whether one is still
-- possible now: { season, week, closesAt (the last kickoff), open, forfeit: { reason, modes, createdAt } | null, markets }.
create or replace function public.gtl_read_forfeit(p_user uuid,p_season integer default null,p_week integer default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer:=p_season; w integer:=p_week; sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); closes_at timestamptz;
  f public.gtl_week_forfeits; markets jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if (p_season is null)<>(p_week is null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if s is null then
    select z.season,z.week,z.signature into s,w,sig from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
    if s is null then return jsonb_build_object('season',null,'week',null,'closesAt',null,'open',false,'forfeit',null,'markets','[]'::jsonb); end if;
  else
    select z.signature into sig from public.gtl_weekly_slates z where z.season=s and z.week=w;
    if sig is null then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  end if;
  select max(to_timestamp((g->>'kickoff')::double precision)) into closes_at
    from jsonb_array_elements(case when jsonb_typeof(sig->'games')='array' then sig->'games' else '[]'::jsonb end) g;
  select * into f from public.gtl_week_forfeits x where x.user_id=p_user and x.season=s and x.week=w;
  markets:=public.gtl_forfeit_markets(p_user,s,w);
  return jsonb_build_object('season',s,'week',w,'closesAt',closes_at,
    'open',f.user_id is null and closes_at is not null and now_at<closes_at and exists(select 1 from jsonb_array_elements(markets) m where m->>'status'='open'),
    'forfeit',case when f.user_id is not null then jsonb_build_object('reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at) end,
    'markets',markets);
end $$;

-- create or replace keeps existing privileges; every grant is restated, and every function is service-only.
-- Body of 20261014223000 (M-01) with D-41: a market a member sat out (the old "Sit out this week", a skip or "See picks now")
-- whose ballot was never submitted but holds a locked-in guess is listed from its ballot as 'sat_out', with satOutAt and its
-- locked-in guesses alone, each behind the same gate as a submitted ballot's; it is not listed again as a bare sit-out. Lock-in
-- is read through gtl_guess_locked_in only. Every other entry, and every reply without such a ballot, is exactly M-01's.
create or replace function public.gtl_read_community_history(p_user uuid,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; now_at timestamptz:=coalesce(p_now,clock_timestamp()); z record; b record; o record; g jsonb; tg jsonb; ps record;
  games jsonb; results jsonb; entries jsonb; weeks jsonb:='[]'; deadline timestamptz; gate jsonb; market text;
  submitted boolean; own boolean; shown boolean; any_shown boolean; hidden jsonb; scope text; picks jsonb; pts numeric;
  week_points numeric; week_scored integer; eligible boolean; ruled boolean; eligibility text; sat_out boolean; locked boolean; listed jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  s:=p_season;
  if s is null then select max(season) into s from public.gtl_weekly_slates; end if;
  for z in select season,week,signature from public.gtl_weekly_slates where season=s order by week desc loop
    deadline:=to_timestamp((z.signature->>'deadline')::double precision);
    -- Slate games with the full names the schedule template carries.
    games:='[]';
    for g in select x from jsonb_array_elements(z.signature->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
      tg:=public.gtl_slate_game(z.season,z.week,z.signature,g->>'id');
      games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'away',coalesce(tg->>'away',g->>'away'),'home',coalesce(tg->>'home',g->>'home'),'kickoff',to_timestamp((g->>'kickoff')::numeric)));
    end loop;
    -- Finals: the latest D-26 settlement version per game; a commissioner-reported final (gtl_reviewed_result_events) fills a
    -- game the settlement ledger has not recorded. Each is labelled.
    results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
        'observedAt',v.observed_at,'settledAt',v.settled_at,'origin','settlement') r
      from public.gtl_virtual_units_settlements v where v.season=z.season and v.week=z.week order by v.game_id,v.version desc) q),'{}');
    results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
        'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','settledAt',q.result->'reviewedAt','origin','commissioner_reported'))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=z.season and e.week=z.week order by e.game_id,e.version desc) q
      where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
    -- D-39: this viewer's gate for every game and market of the week (kickoff, own lock-in, own sit-out).
    gate:=public.gtl_markets_visible(p_user,z.season,z.week,now_at);
    entries:='[]';
    -- Every submitted ballot of every member, eligible or not, plus the viewer's own drafts. A member and market that was sat
    -- out (the old "Sit out this week", or from M-03 a skip or "See picks now") is listed by the opt-out loop below instead (a
    -- draft saved before sitting out stays stored, D-23), except (D-41) a ballot never submitted that holds a locked-in guess
    -- for a game of the week: the opt-out covered only the games not locked in, so it is listed here, as sat out, with its
    -- locked-in guesses alone, each behind the same gate as a submitted ballot's. Without per-game lock-ins (before M-02) no
    -- such ballot exists, and this reader answers exactly as M-01's.
    listed:='[]';
    for b in select x.*,opt.created_at sat_out_at from public.gtl_weekly_ballots x
        left join public.gtl_weekly_optouts opt on opt.user_id=x.user_id and opt.season=x.season and opt.week=x.week and opt.mode=x.mode
        where x.season=z.season and x.week=z.week
        and case when opt.user_id is null then coalesce(x.ballot->>'submittedAt','')<>'' or (x.user_id=p_user and coalesce(x.ballot->'picks','{}'::jsonb)<>'{}'::jsonb)
          else coalesce(x.ballot->>'submittedAt','')='' and exists(select 1 from jsonb_array_elements(z.signature->'games') lg
            where public.gtl_guess_locked_in(x.user_id,x.season,x.week,x.mode,lg->>'id')) end
        order by x.user_id,x.mode loop
      submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      sat_out:=b.sat_out_at is not null;
      own:=b.user_id=p_user;
      market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
      ruled:=exists(select 1 from public.gtl_weekly_eligibility_rulings r where r.user_id=b.user_id and r.season=b.season and r.week=b.week and r.mode=b.mode);
      eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
      eligibility:=case when ruled and eligible then 'ruled-eligible' when ruled then 'ruled-ineligible' when b.origin_practice then 'practice' else 'standard' end;
      scope:=case when jsonb_typeof(b.provenance)<>'array' then 'unknown'
        when exists(select 1 from jsonb_array_elements(b.provenance) e where e->>'import'='commissioner_ruled') then 'community-import'
        when b.provenance->-1->>'scope'='solo' then 'solo'
        when (b.provenance->-1->>'migration')::boolean then 'migrated-league'
        when b.provenance->-1 ? 'leagueId' then 'group' else 'unknown' end;
      picks:='[]'; hidden:='[]'; any_shown:=false; week_points:=0; week_scored:=0;
      for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
        shown:=coalesce((gate->ps.game_id->>market)::boolean,false);
        locked:=case when sat_out or (shown and not own) then public.gtl_guess_locked_in(b.user_id,b.season,b.week,b.mode,ps.game_id) end;
        -- D-41: a sat-out market lists its locked-in guesses alone; a guess not locked in is never listed, to anyone.
        continue when sat_out and not locked;
        -- Points count from the game's kickoff, for a submitted eligible ballot only: an ineligible ballot shows its guesses and
        -- lines but never scores (D-08/D-23), and a draft never scores. Shared as totals, as on the leaderboard.
        pts:=case when eligible and submitted and ps.kickoff<=now_at then ps.points end;
        if pts is not null then week_points:=week_points+pts; week_scored:=week_scored+1; end if;
        if own then
          -- The viewer's own guess always; its line only once this game and market is open to them (a draft's stays hidden).
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',case when shown then ps.reference end,
            'points',pts,'scorable',pts is not null,'hidden',false));
          any_shown:=true;
        elsif shown and locked then
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',ps.reference,
            'points',pts,'scorable',pts is not null,'hidden',false));
          any_shown:=true;
        elsif shown then
          -- Open to the viewer, but this member locked in no guess for the game: nothing of theirs to show.
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',false));
        else
          hidden:=hidden||to_jsonb(ps.game_id);
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',true));
        end if;
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',b.user_id,'mode',b.mode,'status',case when sat_out then 'sat_out' when submitted then 'submitted' else 'draft' end,
        'submittedAt',b.ballot->'submittedAt','submittedAtKnown',not public.gtl_submission_time_unknown(b.ballot),
        -- Own-only: the last change, the post-submission edits and the origin, null for another member's ballot.
        'updatedAt',case when own then b.ballot->'updatedAt' end,
        'revisions',case when own then (select count(*) from jsonb_array_elements(b.audit) e where e->>'type'='ballot_edited') end,
        'provenance',case when own then scope end,'scoringPolicy',b.ballot->'scoringPolicy',
        'ruling',case when jsonb_typeof(b.ballot->'ruling')='object' then jsonb_build_object('decision',b.ballot#>'{ruling,decision}','basis',b.ballot#>'{ruling,basis}') end,
        'eligible',eligible,'eligibility',eligibility,
        'picksHidden',jsonb_array_length(hidden)>0,
        'picks',case when jsonb_array_length(hidden)>0 and not any_shown then null else picks end,
        'hiddenGames',coalesce((select jsonb_agg(h order by h) from jsonb_array_elements_text(hidden) h),'[]'),
        'late',public.gtl_ballot_late(b.ballot),
        'weekPoints',case when submitted then round(week_points,2) end,'weekScored',week_scored,'games',jsonb_array_length(games))
        -- A sat-out entry listed here also carries its opt-out time, as the opt-out loop's entries do; it is never submitted,
        -- so its weekPoints is null and it scores nothing until per-game scoring (M-07, D-41).
        ||case when sat_out then jsonb_build_object('satOutAt',b.sat_out_at) else '{}'::jsonb end);
      if sat_out then listed:=listed||to_jsonb(b.user_id::text||':'||b.mode); end if;
    end loop;
    -- Sat-out weeks (one entry per member and market; any draft saved before the opt-out is excluded above, and a market listed
    -- above with its locked-in guesses is not listed twice). No ballot: null.
    for o in select user_id,mode,created_at from public.gtl_weekly_optouts where season=z.season and week=z.week order by user_id,mode loop
      continue when listed ? (o.user_id::text||':'||o.mode);
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',o.user_id,'mode',o.mode,'status','sat_out','satOutAt',o.created_at,
        'picksHidden',false,'picks',null,'hiddenGames','[]'::jsonb,'late',null,'weekPoints',null,'weekScored',0,'games',jsonb_array_length(games)));
    end loop;
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'deadline',deadline,'closed',now_at>=deadline,
      'games',games,'results',results,
      'revealed',jsonb_build_object('guess_spread',public.gtl_week_revealed(p_user,z.season,z.week,'guess_spread',now_at),
        'guess_total',public.gtl_week_revealed(p_user,z.season,z.week,'guess_total',now_at)),
      'gate',gate,'entries',entries));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'now',now_at,
    'seasons',coalesce((select jsonb_agg(q.season order by q.season desc) from (select distinct season from public.gtl_weekly_slates) q),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'weeks',weeks);
end $$;

-- create or replace keeps existing privileges; every grant is restated, and every function is service-only.
revoke all on function public.gtl_forfeit_markets(uuid,integer,integer),public.gtl_forfeit_guess_week(uuid,integer,integer,text,timestamptz),
  public.gtl_read_forfeit(uuid,integer,integer,timestamptz),public.gtl_read_community_history(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_forfeit_markets(uuid,integer,integer),public.gtl_forfeit_guess_week(uuid,integer,integer,text,timestamptz),
  public.gtl_read_forfeit(uuid,integer,integer,timestamptz),public.gtl_read_community_history(uuid,integer,timestamptz) to service_role;
