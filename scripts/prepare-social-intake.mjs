import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { applySocialMutation, emptySocialState, findSocialReceipt } from '../shared/social-bets.mjs';

const SEASON = 2026, WEEK = 5, LEAGUE = 'sean-troy-luke';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = message => { throw new Error(`Social intake: ${message}`); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sqlJson = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

/** Prepare only. No network, credentials, or database writes are performed. */
export function planSocialIntake(intake, context, { now = Date.now(), uuid = randomUUID } = {}) {
  if (intake?.version !== 1 || !Array.isArray(intake.entries) || intake.entries.length !== 16) fail('expected the sixteen supplied Week 5 tickets.');
  const mappings = ['sean', 'troy'].map(alias => {
    const rows = context?.mapping?.filter(row => row.alias === alias) ?? [];
    if (rows.length !== 1 || rows[0].active !== true || rows[0].hasAuthUser !== true) fail(`missing unique active authenticated membership for ${alias}.`);
    const row = rows[0];
    if (!UUID.test(row.id) || row.id.startsWith('00000000-0000-4000-8000-')) fail(`invalid hosted identity for ${alias}.`);
    if (!context.read?.profiles?.some(profile => profile.id === row.id)) fail(`missing hosted profile for ${alias}.`);
    return { alias, id: row.id };
  });
  if (new Set(mappings.map(row => row.id)).size !== 2) fail('owners must map to distinct accounts.');
  const weeks = context.read?.weeks?.filter(row => row.season === SEASON && row.week === WEEK) ?? [];
  if (weeks.length !== 1 || !Number.isSafeInteger(weeks[0].revision) || weeks[0].revision < 0) fail('missing unique hosted Week 5 state.');
  const selected = weeks[0], initialState = structuredClone(selected.state);
  if (!Array.isArray(selected.games) || !selected.games.length) fail('missing hosted schedule.');
  const games = selected.games.map(game => {
    const kickoff = typeof game.kickoff === 'number' ? new Date(game.kickoff * 1000).toISOString() : game.kickoff;
    if (!game.id || !game.home || !game.away || !Number.isFinite(Date.parse(kickoff))) fail('invalid hosted game.');
    return { ...game, season: SEASON, week: WEEK, kickoff };
  });
  if (new Set(games.map(game => game.id)).size !== games.length) fail('duplicate hosted game.');
  const ids = new Set(), operations = [];
  let state = initialState;
  for (const item of intake.entries) {
    const { owner, ...body } = structuredClone(item);
    if (!['sean', 'troy'].includes(owner) || body.season !== SEASON || body.week !== WEEK || body.origin !== 'tracked' || body.countsForRecord !== true) fail('unexpected owner, scope, origin, or record setting.');
    if (!UUID.test(body.requestId) || ids.has(body.requestId)) fail('request IDs must be unique and stable.');
    ids.add(body.requestId);
    body.notes = body.notes?.replace('Imported locally from Sean’s report.', 'Shared by Sean from supplied report.');
    const actorId = mappings.find(row => row.alias === owner).id;
    const existing = findSocialReceipt(state, { actorId, action: 'create', body });
    const next = applySocialMutation(state, { actorId, action: 'create', body, games, now, uuid });
    let delta = null;
    if (!existing) {
      const event = next.audit.at(-1);
      event.reason = 'Administrative import by Sean on behalf of the owner, from the supplied report and screenshots; user authorized shared visibility.';
      delta = { entry: next.entries.at(-1), event, receipt: next.receipts.at(-1) };
    }
    operations.push({ owner, actorId, requestId: body.requestId, body, delta });
    state = next;
  }
  if (operations.filter(op => op.owner === 'troy' && op.body.kind === 'single').length !== 14 || operations.filter(op => op.owner === 'sean' && op.body.kind === 'parlay').length !== 2) fail('expected fourteen Troy singles and two Sean parlays.');
  const created = operations.filter(op => op.delta).length;
  return {
    version: 1, purpose: 'Authorized administrative import of supplied Week 5 shared bets',
    createdAt: new Date(now).toISOString(), leagueId: LEAGUE, season: SEASON, week: WEEK,
    operator: { alias: 'sean', id: mappings.find(row => row.alias === 'sean').id }, mappings,
    sourceSha256: hash(intake), initialStateSha256: hash(initialState),
    initialRevision: selected.revision, initialState, sourceGames: structuredClone(selected.games),
    operations, created, alreadyPresent: operations.length - created,
    expectedRevision: selected.revision + created, preserved: context.preserved ?? {},
  };
}

/** SQL is all-or-nothing and uses the existing audited RPC for every new record. */
export function socialIntakeSql(plan) {
  const literal = sqlJson(plan), delimiter = `$gtl_intake_${hash(plan).slice(0, 16)}$`;
  if (literal.includes(delimiter)) fail('unsafe SQL delimiter.');
  return `-- Prepared administrative import; no schema or authorization changes.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '10s';
DO ${delimiter}
DECLARE
  plan jsonb := ${literal};
  mapping jsonb; op jsonb; prior public.gtl_social_commits;
  saved public.gtl_social_weeks; current_state jsonb; current_revision bigint;
  candidate jsonb; pending_count integer := 0;
BEGIN
  -- Follow the RPC's profile-before-week lock order, deterministically across owners.
  PERFORM p.user_id FROM public.gtl_profiles p
    WHERE p.user_id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(plan->'mappings') x)
    ORDER BY p.user_id FOR UPDATE;
  FOR mapping IN SELECT value FROM jsonb_array_elements(plan->'mappings') LOOP
    PERFORM m.user_id FROM public.gtl_memberships m
      WHERE m.league_id=plan->>'leagueId' AND m.player_id=mapping->>'alias'
      AND m.user_id=(mapping->>'id')::uuid AND m.active FOR SHARE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.gtl_profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=(mapping->>'id')::uuid)
      OR (SELECT count(*) FROM public.gtl_memberships m WHERE m.league_id=plan->>'leagueId' AND m.player_id=mapping->>'alias' AND m.active)<>1
      THEN RAISE EXCEPTION 'GTL_INTAKE_MAPPING_CHANGED'; END IF;
  END LOOP;
  -- Exact replays are safe even if an owner subsequently corrected or settled a bet.
  FOR op IN SELECT value FROM jsonb_array_elements(plan->'operations') LOOP
    SELECT * INTO prior FROM public.gtl_social_commits
      WHERE actor_id=(op->>'actorId')::uuid AND request_id=(op->>'requestId')::uuid;
    IF FOUND THEN
      IF prior.season<>(plan->>'season')::integer OR prior.week<>(plan->>'week')::integer
        OR prior.action<>'create' OR prior.payload IS DISTINCT FROM op->'body'
        THEN RAISE EXCEPTION 'GTL_INTAKE_RETRY_CONFLICT'; END IF;
    ELSE pending_count := pending_count+1;
    END IF;
  END LOOP;
  IF pending_count=0 THEN RETURN; END IF;
  PERFORM 1 FROM public.gtl_weekly_slates
    WHERE season=(plan->>'season')::integer AND week=(plan->>'week')::integer
    AND signature->'games'=plan->'sourceGames' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GTL_INTAKE_SLATE_CHANGED'; END IF;
  SELECT * INTO saved FROM public.gtl_social_weeks
    WHERE season=(plan->>'season')::integer AND week=(plan->>'week')::integer FOR UPDATE;
  current_state := CASE WHEN FOUND THEN saved.state ELSE ${sqlJson(emptySocialState())} END;
  current_revision := CASE WHEN saved.revision IS NOT NULL THEN saved.revision ELSE 0 END;
  IF current_revision<>(plan->>'initialRevision')::bigint OR current_state IS DISTINCT FROM plan->'initialState'
    THEN RAISE EXCEPTION 'GTL_INTAKE_SNAPSHOT_CHANGED'; END IF;
  FOR op IN SELECT value FROM jsonb_array_elements(plan->'operations') LOOP
    IF EXISTS(SELECT 1 FROM public.gtl_social_commits WHERE actor_id=(op->>'actorId')::uuid AND request_id=(op->>'requestId')::uuid) THEN CONTINUE; END IF;
    IF op->'delta' IS NULL OR op->'delta'='null'::jsonb THEN RAISE EXCEPTION 'GTL_INTAKE_MISSING_RECEIPT'; END IF;
    candidate := jsonb_build_object('version',1,
      'entries',current_state->'entries'||jsonb_build_array(op#>'{delta,entry}'),
      'audit',current_state->'audit'||jsonb_build_array(op#>'{delta,event}'),
      'receipts',current_state->'receipts'||jsonb_build_array(op#>'{delta,receipt}'));
    PERFORM public.gtl_commit_social((op->>'actorId')::uuid,(plan->>'season')::integer,(plan->>'week')::integer,
      current_revision,(op->>'requestId')::uuid,'create',op->'body',candidate);
    current_state := candidate;
    current_revision := current_revision+1;
  END LOOP;
END;
${delimiter};
SELECT season,week,revision,jsonb_array_length(state->'entries') AS entries,
  jsonb_array_length(state->'audit') AS audit_events,jsonb_array_length(state->'receipts') AS receipts
  FROM public.gtl_social_weeks WHERE season=${SEASON} AND week=${WEEK};
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const contextPath = process.argv[2] ?? '.local/social-import-context.json';
  const outPrefix = process.argv[3] ?? '.local/social-intake-plan';
  const intake = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));
  const plan = planSocialIntake(intake, JSON.parse(fs.readFileSync(contextPath, 'utf8')));
  fs.mkdirSync(path.dirname(outPrefix), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(`${outPrefix}.sql`, socialIntakeSql(plan), { mode: 0o600 });
  console.log(JSON.stringify({ prepared: plan.created, alreadyPresent: plan.alreadyPresent, sourceSha256: plan.sourceSha256, manifest: `${outPrefix}.json`, sql: `${outPrefix}.sql`, executed: false }));
}
