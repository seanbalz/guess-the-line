-- P-02 Guess the Points feed posts and the one weekly Points reminder (D-56; spec
-- docs/superpowers/specs/2026-10-22-guess-the-points-design.md; Task 8). Local implementation only: applying it to the
-- hosted project is Sean's "apply P-02" (Gate M). It follows P-01 (20261026120000_gtl_points_core.sql).
--
-- What it does. (1) Widens three CHECK constraints: the feed post kinds (points_played, points_final), the reminder log's
-- mode (guess_points) and kind (points_next_2h). Every existing row still satisfies them. (2) Two triggers on P-01 tables
-- write the feed posts: the first lock-in of a member's week writes points_played, and the FINAL freeze of a week writes
-- points_final for the top scorer. (3) Two service-only functions serve the push worker: the Points reminder candidates
-- and the idempotent mark that records a reminder before it is sent.
--
-- Rollback: none. supabase/rollback/README.md forbids `alter` in rollback files, and this file's only alters widen CHECKs
-- (fix-forward; tests/migrations.mjs FIX_FORWARD). Leaving the widened CHECKs in place is harmless. The off switches are the
-- gtl-api secret GTL_FEATURE_OFF=points (no new lock-ins, so no new points_played posts) and the P-03 schedule
-- enabled=false (no finalize, so no points_final). Posts and reminder rows already written stay (D-23).
--
-- The existing gtl_mark_push_reminder is NOT changed: its mode list stays ('guess_spread','guess_total'), so it still
-- refuses guess_points. Points reminders go through gtl_mark_points_reminder only.

-- (1) CHECK widening -----------------------------------------------------------------------------------------------
alter table public.gtl_feed_posts drop constraint gtl_feed_posts_kind_check,
  add constraint gtl_feed_posts_kind_check check (kind in ('joined','ballot_submitted','bet_posted','bet_settled','week_published','points_played','points_final'));
alter table public.gtl_push_reminders_sent drop constraint gtl_push_reminders_sent_mode_check,
  add constraint gtl_push_reminders_sent_mode_check check (mode in ('guess_spread','guess_total','guess_points'));
alter table public.gtl_push_reminders_sent drop constraint gtl_push_reminders_sent_kind_check,
  add constraint gtl_push_reminders_sent_kind_check check (kind in ('deadline_2h','points_next_2h'));

-- (2) Feed triggers ------------------------------------------------------------------------------------------------
-- points_played: the member's first lock-in of a season/week (an insert with locked_at set, or an update that sets it from
-- null). The dedupe key keeps it to one post per member and week. A member without a profile writes no post and, above all,
-- never fails the lock-in (the post is a courtesy, the guess is the record).
create function public.gtl_feed_points_played_post() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.locked_at is not null and (tg_op = 'INSERT' or old.locked_at is null) then
    insert into public.gtl_feed_posts(actor_id, kind, season, week, mode, payload, dedupe_key)
      select new.user_id, 'points_played', new.season, new.week, null, '{}'::jsonb,
             format('points_played:%s:%s:%s', new.user_id, new.season, new.week)
      where exists(select 1 from public.gtl_profiles p where p.user_id = new.user_id)
      on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;
create trigger gtl_feed_points_played_post after insert or update of locked_at on public.gtl_points_guesses
  for each row execute function public.gtl_feed_points_played_post();

-- points_final: one post per FINAL week, by the top scorer; every tied top scorer is listed in payload.winners. Ties for the
-- actor break by display name, then user id. No members, no post.
create function public.gtl_feed_points_final_post() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid; top numeric; winners jsonb;
begin
  select m.user_id, m.points into actor, top
    from (select (e->>'userId')::uuid user_id, (e->>'points')::numeric points from jsonb_array_elements(coalesce(new.results->'members','[]'::jsonb)) e) m
    join public.gtl_profiles p on p.user_id = m.user_id
    order by m.points desc, p.display_name, m.user_id limit 1;
  if actor is null then return null; end if;
  select jsonb_agg(jsonb_build_object('userId', m.user_id, 'points', m.points) order by m.user_id) into winners
    from (select (e->>'userId')::uuid user_id, (e->>'points')::numeric points from jsonb_array_elements(new.results->'members') e) m
    where m.points = top;
  insert into public.gtl_feed_posts(actor_id, kind, season, week, mode, payload, dedupe_key)
    values(actor, 'points_final', new.season, new.week, null,
           jsonb_build_object('winners', winners, 'house', coalesce(new.results->'house', 'null'::jsonb), 'max', new.results->'max'),
           format('points_final:%s:%s', new.season, new.week))
    on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger gtl_feed_points_final_post after insert on public.gtl_points_week_final
  for each row execute function public.gtl_feed_points_final_post();

-- (3) Points reminder functions ------------------------------------------------------------------------------------
-- Service-role only. Verifies the run claim (as gtl_mark_push_reminder does), then returns the members to remind: opted in
-- (a locked Points guess this season), with an active subscription, who have a non-void slot of a published, not yet FINAL
-- slate that they have not locked, kicking off in (p_now, p_now + 2 hours], and who were not reminded for that week.
-- open = their unlocked non-void slots in that week still ahead of p_now; nextKickoff = the earliest of them. No guess, name
-- or score leaves this function.
create function public.gtl_points_reminder_candidates(p_run uuid, p_claim uuid, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_push_reminder_runs; players jsonb;
begin
  select * into run from public.gtl_push_reminder_runs where id = p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status <> 'running'
    or run.claimed_at < clock_timestamp() - interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_now is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId', t.user_id, 'season', t.season, 'week', t.week, 'open', t.open,
      'nextKickoff', to_jsonb(t.next_kickoff),
      'subscriptions', (select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth) order by x.created_at, x.endpoint)
        from public.gtl_push_subscriptions x where x.user_id = t.user_id and x.disabled_at is null))
      order by t.season, t.week, t.user_id), '[]'::jsonb)
    into players
    from (select s.season, s.week, u.user_id, o.open, o.next_kickoff
      from public.gtl_points_slates s
      cross join (select distinct user_id from public.gtl_push_subscriptions where disabled_at is null) u
      cross join lateral (select count(*)::integer open, min((e->>'kickoff')::timestamptz) next_kickoff
        from jsonb_array_elements(s.slots) e
        where jsonb_typeof(e->'void') = 'null' and (e->>'kickoff')::timestamptz > p_now
          and not exists(select 1 from public.gtl_points_guesses g where g.user_id = u.user_id and g.season = s.season and g.week = s.week
                           and g.slot = e->>'slot' and g.locked_at is not null)) o
      where o.open > 0 and o.next_kickoff <= p_now + interval '2 hours'
        and not exists(select 1 from public.gtl_points_week_final f where f.season = s.season and f.week = s.week)
        and public.gtl_community_member(u.user_id)
        and exists(select 1 from public.gtl_points_guesses g where g.user_id = u.user_id and g.season = s.season and g.locked_at is not null)
        and not exists(select 1 from public.gtl_push_reminders_sent r where r.user_id = u.user_id and r.season = s.season and r.week = s.week
                         and r.mode = 'guess_points' and r.kind = 'points_next_2h')) t;
  return jsonb_build_object('players', players);
end $$;

-- Records the Points reminder before it is sent. recorded is true only for the call that wrote the row, so a retry or an
-- overlapping run never sends it twice.
create function public.gtl_mark_points_reminder(p_run uuid, p_claim uuid, p_user uuid, p_season integer, p_week integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_push_reminder_runs; wrote integer;
begin
  select * into run from public.gtl_push_reminder_runs where id = p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status <> 'running'
    or run.claimed_at < clock_timestamp() - interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_user is null or p_season is null or p_week is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  insert into public.gtl_push_reminders_sent(user_id, season, week, mode, kind, run_id)
    values(p_user, p_season, p_week, 'guess_points', 'points_next_2h', p_run) on conflict do nothing;
  get diagnostics wrote = row_count;
  return jsonb_build_object('recorded', wrote > 0);
end $$;

-- (4) Function grants: service_role only, like every push function.
revoke all on function public.gtl_feed_points_played_post(), public.gtl_feed_points_final_post(),
  public.gtl_points_reminder_candidates(uuid, uuid, timestamptz), public.gtl_mark_points_reminder(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.gtl_points_reminder_candidates(uuid, uuid, timestamptz), public.gtl_mark_points_reminder(uuid, uuid, uuid, integer, integer) to service_role;
