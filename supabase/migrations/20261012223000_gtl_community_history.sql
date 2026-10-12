-- Community history (Sean's ruling, October 12, 2026): every player's saved guesses for
-- every season, week and market are shown in the Community, scored against the line
-- saved when they guessed (D-16). This file adds a read path only: no table changes,
-- no row updates, no grants beyond execute to service_role (D-23: everything a player
-- entered stays stored and visible).
--
-- Per pick the reader returns the guess, the saved scoring reference (status, value,
-- source, observed/captured/saved times) and the points that reference gives, computed
-- with the same expression as gtl_read_community's standings (greatest(0, 10 - 2 * |guess
-- - line|), rounded to two places per pick like server/domain.mjs accuracy()). A submitted
-- ballot that carries no saved reference (the Week 5 ballots migrated from the group
-- leagues) is shown with the newest hosted 3-book snapshot captured at or before its
-- submission instant, labelled 'nearest snapshot at submission' and marked informational:
-- that line is NEVER fed into points, and when no such snapshot exists the pick reads
-- 'no line stored' with the value null. Nothing is invented (D-16): no line, no timestamp.
--
-- Reveal gate (D-23): another member's guesses, reference values and per-pick points for a
-- season/week/mode are returned only once gtl_week_revealed says so for the viewer (own
-- full submission, a final opt-out for that mode, or the deadline). Weekly totals are
-- shared as they already are on the leaderboard. Own drafts are returned to their owner
-- only (status 'draft'); sat-out weeks appear as status 'sat_out', and a draft saved
-- before sitting out is left in its row but not listed (one entry per member and market).
--
-- Own-only metadata: the last change (updatedAt), the number of post-submission edits
-- (revisions: the ballot_edited audit events; draft saves and the submission itself are
-- not revisions) and the ballot's origin (provenance) are derived from the private audit and
-- provenance columns, which gtl_read_weekly_state keeps own-only and the feed never shares,
-- so they are returned only for the viewer's own ballots, hidden or revealed; another
-- member's entry carries null for all three.

-- The standings expression, lifted into a helper so the history view and any later
-- reader cannot drift from it. gtl_read_community is left exactly as it is.
create function public.gtl_pick_points(p_guess numeric,p_reference numeric) returns numeric
language sql immutable strict security invoker set search_path='' as $$
  select round(greatest(0,10-2*abs(p_guess-p_reference)),2)
$$;

-- The line a history view can show for a submitted pick without a saved reference: the
-- newest snapshot for that slate captured at or before the submission instant whose
-- payload passes the same structural checks a submission-time save applies
-- (gtl_submission_reference), judged at the snapshot's own capture instant so the
-- five-minute freshness rule measures the quotes against the snapshot rather than
-- against a submission that may be hours later. Informational only.
create function public.gtl_history_reference(p_season integer,p_week integer,p_signature jsonb,p_game jsonb,p_market text,p_submitted timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare snap record; ref jsonb; captured timestamptz; later timestamptz;
begin
  if p_game is not null and p_submitted is not null and isfinite(p_submitted) then
    for snap in select id,payload,created_at from public.gtl_market_snapshots
      where season=p_season and week=p_week and slate_signature=p_signature and created_at<=p_submitted
      order by created_at desc,id desc limit 20 loop
      begin captured:=(snap.payload->>'fetchedAt')::timestamptz; exception when others then captured:=null; end;
      if captured is null or not isfinite(captured) then continue; end if;
      ref:=public.gtl_submission_reference(snap.payload,p_game,p_market,captured);
      if ref is not null and ref->>'status'='available' and jsonb_typeof(ref->'value')='number' then
        return jsonb_build_object('basis','nearest-snapshot','label','nearest snapshot at submission','status','informational',
          'value',ref->'value','source',ref->'source','sourceUrl',ref->'sourceUrl','bookCount',ref->'bookCount','snapshotId',snap.id,
          'capturedAt',ref->'capturedAt','observedAt',ref->'observedAt',
          'gapSeconds',round(extract(epoch from (p_submitted-(ref->>'observedAt')::timestamptz))));
      end if;
    end loop;
  end if;
  select min(created_at) into later from public.gtl_market_snapshots
    where season=p_season and week=p_week and slate_signature=p_signature and (p_submitted is null or created_at>p_submitted);
  return jsonb_build_object('basis','none','label','no line stored','status','unavailable','value',null,'nextSnapshotAt',later);
end $$;

create function public.gtl_read_community_history(p_user uuid,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; now_at timestamptz:=coalesce(p_now,clock_timestamp()); z record; b record; o record; g jsonb; tg jsonb; gid text;
  games jsonb; tmpl jsonb; results jsonb; entries jsonb; weeks jsonb:='[]'; deadline timestamptz; rev_spread boolean; rev_total boolean;
  submitted boolean; own boolean; revealed boolean; submitted_at timestamptz; market text; scope text; picks jsonb; guess numeric; saved jsonb; ref jsonb;
  pts numeric; week_points numeric; week_scored integer;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  s:=p_season;
  if s is null then select max(season) into s from public.gtl_weekly_slates; end if;
  for z in select season,week,signature from public.gtl_weekly_slates where season=s order by week desc loop
    deadline:=to_timestamp((z.signature->>'deadline')::double precision);
    -- Slate games with the full names the schedule template carries, resolved exactly as the
    -- fresh-submission guard resolves them (same id, codes and kickoff; newest template wins).
    games:='[]'; tmpl:='{}';
    for g in select x from jsonb_array_elements(z.signature->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
      select x into tg from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
        where t.season=z.season and t.week=z.week and x->>'id'=g->>'id' and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
          and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
      games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'away',coalesce(tg->>'away',g->>'away'),'home',coalesce(tg->>'home',g->>'home'),'kickoff',to_timestamp((g->>'kickoff')::numeric)));
      if tg is not null then tmpl:=tmpl||jsonb_build_object(g->>'id',tg); end if;
    end loop;
    -- Finals: the latest D-26 settlement version per game; a commissioner-reported final
    -- (gtl_reviewed_result_events) fills a game the settlement ledger has not recorded. Each is labelled.
    results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
        'observedAt',v.observed_at,'settledAt',v.settled_at,'origin','settlement') r
      from public.gtl_virtual_units_settlements v where v.season=z.season and v.week=z.week order by v.game_id,v.version desc) q),'{}');
    results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
        'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','settledAt',q.result->'reviewedAt','origin','commissioner_reported'))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=z.season and e.week=z.week order by e.game_id,e.version desc) q
      where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
    rev_spread:=public.gtl_week_revealed(p_user,z.season,z.week,'guess_spread',now_at);
    rev_total:=public.gtl_week_revealed(p_user,z.season,z.week,'guess_total',now_at);
    entries:='[]';
    -- Every submitted, non-practice ballot of every member, plus the viewer's own drafts. A member and market that was sat
    -- out is listed by the opt-out loop below instead: gtl_sit_out_week refuses only a submitted ballot and the opt-out trigger
    -- refuses every later save, so the only ballot such a row can carry is a draft saved before sitting out, which stays
    -- stored (D-23) while the week reads sat out, as it does on the feed and the leaderboard.
    for b in select x.* from public.gtl_weekly_ballots x where x.season=z.season and x.week=z.week and not x.origin_practice
        and (coalesce(x.ballot->>'submittedAt','')<>'' or (x.user_id=p_user and coalesce(x.ballot->'picks','{}'::jsonb)<>'{}'::jsonb))
        and not exists(select 1 from public.gtl_weekly_optouts opt where opt.user_id=x.user_id and opt.season=x.season and opt.week=x.week and opt.mode=x.mode)
        order by x.user_id,x.mode loop
      submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      own:=b.user_id=p_user;
      revealed:=own or (case when b.mode='guess_spread' then rev_spread else rev_total end);
      market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
      begin submitted_at:=(b.ballot->>'submittedAt')::timestamptz; exception when others then submitted_at:=null; end;
      scope:=case when jsonb_typeof(b.provenance)<>'array' then 'unknown'
        when exists(select 1 from jsonb_array_elements(b.provenance) e where e->>'import'='commissioner_ruled') then 'community-import'
        when b.provenance->-1->>'scope'='solo' then 'solo'
        when (b.provenance->-1->>'migration')::boolean then 'migrated-league'
        when b.provenance->-1 ? 'leagueId' then 'group' else 'unknown' end;
      picks:='[]'; week_points:=0; week_scored:=0;
      for g in select x from jsonb_array_elements(games) x loop
        gid:=g->>'id';
        guess:=case when jsonb_typeof(b.ballot#>array['picks',gid])='number' then (b.ballot#>>array['picks',gid])::numeric end;
        saved:=b.ballot#>array['scoringReferences',gid];
        if jsonb_typeof(saved)='object' then
          -- The reference saved with the guess (D-16) or ruled for it (D-25): the only lines that score.
          ref:=jsonb_build_object('basis',case when saved->>'basis'='commissioner-ruled' then 'commissioner-ruled' else 'saved' end,
            'label',case when saved->>'basis'='commissioner-ruled' then 'commissioner-ruled line' else 'line saved with guess' end,
            'status',saved->>'status','value',case when saved->>'status'='available' and jsonb_typeof(saved->'value')='number' then saved->'value' end,
            'source',saved->'source','sourceUrl',saved->'sourceUrl','bookCount',saved->'bookCount','snapshotId',saved->'snapshotId',
            'capturedAt',saved->'capturedAt','observedAt',saved->'observedAt','savedAt',saved->'savedAt','decision',saved->'decision','reason',saved->'reason');
          pts:=case when saved->>'status'='available' and jsonb_typeof(saved->'value')='number' then public.gtl_pick_points(guess,(saved->>'value')::numeric) end;
        elsif submitted then
          ref:=public.gtl_history_reference(z.season,z.week,z.signature,tmpl->gid,market,submitted_at); pts:=null;
        else
          ref:=null; pts:=null;
        end if;
        if pts is not null then week_points:=week_points+pts; week_scored:=week_scored+1; end if;
        picks:=picks||jsonb_build_array(jsonb_build_object('gameId',gid,'guess',guess,'reference',ref,'points',pts,'scorable',pts is not null));
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',b.user_id,'mode',b.mode,'status',case when submitted then 'submitted' else 'draft' end,
        'submittedAt',b.ballot->'submittedAt',
        -- Own-only (see the header): the last change, the post-submission edits and the origin, null for another member's ballot.
        'updatedAt',case when own then b.ballot->'updatedAt' end,
        'revisions',case when own then (select count(*) from jsonb_array_elements(b.audit) e where e->>'type'='ballot_edited') end,
        'provenance',case when own then scope end,'scoringPolicy',b.ballot->'scoringPolicy',
        'ruling',case when jsonb_typeof(b.ballot->'ruling')='object' then jsonb_build_object('decision',b.ballot#>'{ruling,decision}','basis',b.ballot#>'{ruling,basis}') end,
        'picksHidden',not revealed,'picks',case when revealed then picks end,
        'weekPoints',round(week_points,2),'weekScored',week_scored,'games',jsonb_array_length(games)));
    end loop;
    -- Sat-out weeks (one entry per member and market; any draft saved before the opt-out is excluded above).
    for o in select user_id,mode,created_at from public.gtl_weekly_optouts where season=z.season and week=z.week order by user_id,mode loop
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',o.user_id,'mode',o.mode,'status','sat_out','satOutAt',o.created_at,
        'picksHidden',false,'picks',null,'weekPoints',0,'weekScored',0,'games',jsonb_array_length(games)));
    end loop;
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'deadline',deadline,'closed',now_at>=deadline,
      'games',games,'results',results,'revealed',jsonb_build_object('guess_spread',rev_spread,'guess_total',rev_total),'entries',entries));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'now',now_at,
    'seasons',coalesce((select jsonb_agg(q.season order by q.season desc) from (select distinct season from public.gtl_weekly_slates) q),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'weeks',weeks);
end $$;

revoke all on function public.gtl_pick_points(numeric,numeric),public.gtl_history_reference(integer,integer,jsonb,jsonb,text,timestamptz),
  public.gtl_read_community_history(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_pick_points(numeric,numeric),public.gtl_history_reference(integer,integer,jsonb,jsonb,text,timestamptz),
  public.gtl_read_community_history(uuid,integer,timestamptz) to service_role;
