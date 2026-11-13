-- One-time data correction: MW11 spans the November 2026 international break.
-- Source: https://www.premierleague.com/en/news/4725574 (checked 2026-11-12 UTC).
-- First match Nov 21 12:30 UTC; last match Nov 23 20:00 UTC.
-- Keep the existing window start and Wednesday boundary convention.
-- No fixtures, guesses, picks, queues, bonuses, order or past weeks are rewritten.
do $repair$
declare w public.gtl_epl_weeks; before_hash text; after_hash text;
begin
  select * into w from public.gtl_epl_weeks where season=2026 and week=11 for update;
  if not found or w.status<>'open' or w.seeded
    or w.window_start is distinct from timestamptz '2026-11-11T00:00:00Z'
    or w.window_end is distinct from timestamptz '2026-11-18T00:00:00Z'
    or w.first_kickoff is distinct from w.window_end
    or clock_timestamp()>=w.first_kickoff
    or exists(select 1 from public.gtl_epl_fixtures where season=2026 and week=11)
    or exists(select 1 from public.gtl_epl_picks where season=2026 and week=11)
    or exists(select 1 from public.gtl_epl_guesses where season=2026 and week=11)
  then raise exception 'MW11 changed; stop and review'; end if;
  select encode(sha256(convert_to(jsonb_build_object('picks',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_picks t),
      'pick_history',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_pick_history t),
      'guesses',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_guesses t),
      'guess_history',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_guess_history t),
      'queues',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_queues t),
      'bonus',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_bonus t),
      'weeks',(select coalesce(jsonb_agg(case when t.season=2026 and t.week=11 then to_jsonb(t)-'window_end'-'first_kickoff' else to_jsonb(t) end order by season,week),'[]'::jsonb) from public.gtl_epl_weeks t))::text,'UTF8')),'hex') into before_hash;
  if before_hash<>'6e3418768633ea1c64282ce160fda9150c16c985248480ba0639781db6b9bfb5'
  then raise exception 'Preserved data changed; stop and review'; end if;
  perform public.gtl_epl_set_week_window(2026,11,w.window_start,
    timestamptz '2026-11-25T00:00:00Z',timestamptz '2026-11-21T12:30:00Z');
  select encode(sha256(convert_to(jsonb_build_object('picks',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_picks t),
      'pick_history',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_pick_history t),
      'guesses',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_guesses t),
      'guess_history',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_guess_history t),
      'queues',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_queues t),
      'bonus',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.gtl_epl_bonus t),
      'weeks',(select coalesce(jsonb_agg(case when t.season=2026 and t.week=11 then to_jsonb(t)-'window_end'-'first_kickoff' else to_jsonb(t) end order by season,week),'[]'::jsonb) from public.gtl_epl_weeks t))::text,'UTF8')),'hex') into after_hash;
  if before_hash is distinct from after_hash then raise exception 'Preservation hash mismatch'; end if;
end $repair$;
select season,week,window_start,window_end,first_kickoff,status
from public.gtl_epl_weeks where season=2026 and week=11;
