-- M-28 me_export: Export my data (redesign build plan stage 75; D-23, D-30, D-52). Apply after M-27.
--
-- Additive: one new service-only, security-invoker function, gtl_export_me(p_user, p_now). No table, trigger, row, grant on
-- an existing object or existing function body changes, and nothing is dropped, so there is no rollback file (Gate M step 9).
-- Until this file is applied, gtl-api's POST /me/export answers "Export is not available yet" (PostgREST's PGRST202, mapped
-- in cloud/me.mjs) and every existing route answers exactly as today. It replaces the old app's group-week download
-- (GET /export), which stays for the old app until stage 81.
--
-- What it returns: every row the signed-in account owns, and nothing of another account's. Your Guess ballots with every
-- revision, their saved lines and the Late marker (D-30, also read out as `late`); your sit-outs and forfeits; the
-- eligibility rulings on your ballots (without the approving account); your Betting Challenge selections, Virtual Units bets
-- with their results, NBA tickets (through their own reader, gtl_nba_read_bets), real slips you posted with their changes,
-- the players you follow; your saved games and notes, forecasts, journal (archived records included) and their change
-- history; your Guess the Points guesses and their events; your posts, comments and likes; your profile, account
-- preferences, league interest, group memberships, removal record and access log. Left out: push reminder devices (their
-- endpoints and keys are device secrets, D-28) and internal version counters.

create function public.gtl_export_me(p_user uuid,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); page jsonb; next_cursor jsonb; nba jsonb:='[]'; pages integer:=0; own_entries jsonb; own_ids jsonb;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_ME_PROFILE'; end if;
  -- NBA tickets live in the private nba_private schema; their own definer reader pages them, 100 at a time.
  loop
    page:=public.gtl_nba_read_bets(p_user,'{}'::jsonb,next_cursor,null);
    nba:=nba||coalesce(page->'tickets','[]'::jsonb);
    next_cursor:=page->'nextCursor'; pages:=pages+1;
    exit when jsonb_typeof(next_cursor) is distinct from 'object' or pages>=200;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('season',w.season,'week',w.week,'entry',e) order by w.season,w.week,e->>'recordedAt',e->>'id'),'[]'::jsonb),
    coalesce(jsonb_agg(e->'id'),'[]'::jsonb)
  into own_entries,own_ids
  from public.gtl_social_weeks w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.state->'entries')='array' then w.state->'entries' else '[]'::jsonb end) e
  where e->>'ownerId'=p_user::text;
  return jsonb_build_object(
    'format','gtl-account-export-v1','ownerId',p_user,'exportedAt',now_at,
    'excluded',jsonb_build_array('Push reminder devices: their endpoints and keys are device secrets (D-28).','Internal version counters.'),
    'profile',(select jsonb_build_object('displayName',p.display_name,'updatedAt',p.updated_at) from public.gtl_profiles p where p.user_id=p_user),
    'communityRemoval',(select jsonb_build_object('removedAt',r.removed_at) from public.gtl_community_removals r where r.user_id=p_user),
    'preferences',coalesce((select jsonb_agg(jsonb_build_object('revision',a.revision,'value',a.value,'savedAt',a.created_at) order by a.revision) from public.gtl_account_preferences a where a.user_id=p_user),'[]'::jsonb),
    'leagueInterest',coalesce((select jsonb_agg(jsonb_build_object('league',i.league,'notify',i.notify,'updatedAt',i.updated_at) order by i.league) from public.gtl_league_interest i where i.user_id=p_user),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('leagueId',m.league_id,'playerId',m.player_id,'role',m.role,'active',m.active,'joinedAt',m.created_at) order by m.league_id) from public.gtl_memberships m where m.user_id=p_user),'[]'::jsonb),
    'ballots',coalesce((select jsonb_agg(jsonb_build_object('season',b.season,'week',b.week,'mode',b.mode,'late',public.gtl_ballot_late(b.ballot),'ballot',b.ballot,'audit',b.audit,
        'originPractice',b.origin_practice,'provenance',b.provenance) order by b.season,b.week,b.mode) from public.gtl_weekly_ballots b where b.user_id=p_user),'[]'::jsonb),
    'sitOuts',coalesce((select jsonb_agg(jsonb_build_object('season',o.season,'week',o.week,'mode',o.mode,'createdAt',o.created_at) order by o.season,o.week,o.mode) from public.gtl_weekly_optouts o where o.user_id=p_user),'[]'::jsonb),
    'forfeits',coalesce((select jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at) order by f.season,f.week) from public.gtl_week_forfeits f where f.user_id=p_user),'[]'::jsonb),
    'eligibilityRulings',coalesce((select jsonb_agg(jsonb_build_object('season',r.season,'week',r.week,'mode',r.mode,'eligible',r.eligible,'reason',r.reason,'recordedAt',r.recorded_at,
        'leagueId',r.context_league_id,'evidence',r.evidence) order by r.season,r.week,r.mode) from public.gtl_weekly_eligibility_rulings r where r.user_id=p_user),'[]'::jsonb),
    'challengeSelections',coalesce((select jsonb_agg(jsonb_build_object('season',s.season,'week',s.week,'gameId',s.game_id,'selection',s.selection,'audit',s.audit,
        'originPractice',s.origin_practice,'provenance',s.provenance) order by s.season,s.week,s.game_id) from public.gtl_weekly_selections s where s.user_id=p_user),'[]'::jsonb),
    'virtualUnits',coalesce((select jsonb_agg(jsonb_build_object('season',v.season,'week',v.week,'gameId',v.game_id,'market',v.market,'selection',v.selection,'status',v.status,
        'result',v.result,'audit',v.audit,'createdAt',v.created_at,'updatedAt',v.updated_at) order by v.season,v.week,v.game_id,v.market) from public.gtl_virtual_units_picks v where v.user_id=p_user),'[]'::jsonb),
    'nbaTickets',nba,
    'realSlips',own_entries,
    'realSlipChanges',coalesce((select jsonb_agg(jsonb_build_object('season',w.season,'week',w.week,'change',a) order by w.season,w.week,a->>'at')
      from public.gtl_social_weeks w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.state->'audit')='array' then w.state->'audit' else '[]'::jsonb end) a
      where own_ids ? (a->>'entryId')),'[]'::jsonb),
    'following',coalesce((select jsonb_agg(jsonb_build_object('userId',f.target_user_id,'displayName',p.display_name,'since',f.created_at) order by f.created_at)
      from public.gtl_social_follows f left join public.gtl_profiles p on p.user_id=f.target_user_id where f.user_id=p_user),'[]'::jsonb),
    'savedGames',coalesce((select jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'gameId',f.game_id,'saved',f.saved,'note',f.notes,'createdAt',f.created_at,'updatedAt',f.updated_at)
      order by f.season,f.week,f.game_id) from public.gtl_favorites f where f.user_id=p_user),'[]'::jsonb),
    'forecasts',coalesce((select jsonb_agg(jsonb_build_object('season',f.season,'week',f.week,'gameId',f.game_id,'market',f.market,'value',f.value,'savedAt',f.saved_at,'revision',f.revision)
      order by f.season,f.week,f.game_id,f.market) from public.gtl_personal_forecasts f where f.user_id=p_user),'[]'::jsonb),
    'journal',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'season',j.season,'week',j.week,'gameId',j.game_id,'entry',j.entry,'revision',j.revision,'archived',j.archived,
        'createdAt',j.created_at,'updatedAt',j.updated_at) order by j.season,j.week,j.created_at,j.id) from public.gtl_journal_entries j where j.user_id=p_user),'[]'::jsonb),
    'personalChanges',coalesce((select jsonb_agg(jsonb_build_object('revision',e.revision,'action',e.action,'target',e.target,'before',e.before_value,'after',e.after_value,
        'reason',e.reason,'at',e.created_at) order by e.revision) from public.gtl_personal_events e where e.user_id=p_user),'[]'::jsonb),
    'personalRequests',coalesce((select jsonb_agg(jsonb_build_object('requestId',r.request_id,'action',r.action,'payload',r.payload,'result',r.result,'at',r.created_at) order by r.created_at,r.request_id)
      from public.gtl_personal_receipts r where r.user_id=p_user),'[]'::jsonb),
    'pointsGuesses',coalesce((select jsonb_agg(jsonb_build_object('season',g.season,'week',g.week,'slot',g.slot,'guess',g.guess,'lockedAt',g.locked_at,'createdAt',g.created_at,'updatedAt',g.updated_at)
      order by g.season,g.week,g.slot) from public.gtl_points_guesses g where g.user_id=p_user),'[]'::jsonb),
    'pointsChanges',coalesce((select jsonb_agg(jsonb_build_object('season',e.season,'week',e.week,'slot',e.slot,'action',e.action,'guess',e.guess,'at',e.created_at) order by e.created_at,e.id)
      from public.gtl_points_guess_events e where e.user_id=p_user),'[]'::jsonb),
    'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,'payload',p.payload,'createdAt',p.created_at) order by p.created_at,p.id)
      from public.gtl_feed_posts p where p.actor_id=p_user),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'postId',c.post_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id) from public.gtl_feed_comments c where c.user_id=p_user),'[]'::jsonb),
    'likes',coalesce((select jsonb_agg(jsonb_build_object('postId',l.post_id,'createdAt',l.created_at) order by l.created_at,l.post_id) from public.gtl_feed_likes l where l.user_id=p_user),'[]'::jsonb),
    'accessLog',coalesce((select jsonb_agg(jsonb_build_object('event',a.event,'leagueId',a.league_id,'at',a.created_at) order by a.created_at,a.id) from public.gtl_access_audit a where a.actor_id=p_user),'[]'::jsonb));
end $$;

revoke all on function public.gtl_export_me(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_export_me(uuid,timestamptz) to service_role;
