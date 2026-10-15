import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { applySocialMutation, findSocialReceipt } from '../shared/social-bets.mjs';

const SEASON = 2026, WEEK = 5, LEAGUE = 'sean-troy-luke';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_IDS = { sean: '00000000-0000-4000-8000-000000000001', troy: '00000000-0000-4000-8000-000000000002' };
const FIELDS = ['season', 'week', 'kind', 'origin', 'legs', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord', 'notes'];
const fail = message => { throw new Error(`Social odds assumptions: ${message}`); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sqlJson = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

function correctionBody(entry, assumption, config) {
  return { ...Object.fromEntries(FIELDS.map(key => [key, structuredClone(entry[key])])),
    requestId: assumption.requestId, entryId: entry.id, revision: entry.revision, reason: config.reason,
    odds: config.odds, source: entry.source + config.sourceSuffix, notes: entry.notes + config.notesSuffix };
}

/** Prepare only. Original intake, historical audits and other tickets are never rewritten. */
export function planSocialOddsAssumptions(intake, config, context, { now = Date.now(), uuid = randomUUID, environment = 'hosted' } = {}) {
  if (!['hosted', 'local'].includes(environment)) fail('choose hosted or local explicitly.');
  if (intake?.version !== 1 || intake.entries?.length !== 16 || hash(intake) !== config?.sourceSha256) fail('the original sixteen-ticket intake changed.');
  const targets = intake.entries.filter(entry => entry.owner === 'troy');
  if (config.version !== 1 || config.season !== SEASON || config.week !== WEEK || config.owner !== 'troy' || config.odds !== -110
    || config.entries?.length !== 14 || targets.length !== 14 || targets.some(entry => entry.kind !== 'single' || entry.odds !== null || entry.stakeUnits !== 1)) fail('expected fourteen unpriced Troy singles and the approved -110 assumption.');
  if (typeof config.sourceSuffix !== 'string' || !config.sourceSuffix.includes('assumed -110') || typeof config.notesSuffix !== 'string'
    || !config.notesSuffix.includes('actual accepted odds, book and any point-buy cost remain unknown') || typeof config.reason !== 'string'
    || !config.reason.includes('accounting assumption of -110')) fail('assumption provenance must remain explicit.');
  const requestIds = new Set(), createIds = new Set();
  for (const item of config.entries) {
    if (!UUID.test(item.requestId) || !UUID.test(item.createRequestId) || requestIds.has(item.requestId) || createIds.has(item.createRequestId)
      || intake.entries.some(entry => entry.requestId === item.requestId) || !targets.some(entry => entry.requestId === item.createRequestId)) fail('expected unique stable correction IDs targeting only the original Troy tickets.');
    requestIds.add(item.requestId); createIds.add(item.createRequestId);
  }
  const mappings = ['sean', 'troy'].map(alias => {
    const rows = context?.mapping?.filter(row => row.alias === alias) ?? [];
    if (rows.length !== 1 || rows[0].active !== true || (environment === 'hosted' && rows[0].hasAuthUser !== true)) fail(`missing unique active membership for ${alias}.`);
    const row = rows[0];
    if (!UUID.test(row.id) || (environment === 'local' ? row.id !== LOCAL_IDS[alias] : row.id.startsWith('00000000-0000-4000-8000-'))) fail(`invalid ${environment} identity for ${alias}.`);
    if (!context.read?.profiles?.some(profile => profile.id === row.id)) fail(`missing profile for ${alias}.`);
    return { alias, id: row.id };
  });
  if (new Set(mappings.map(row => row.id)).size !== 2) fail('owners must be distinct.');
  const weeks = context.read?.weeks?.filter(row => row.season === SEASON && row.week === WEEK) ?? [];
  if (weeks.length !== 1 || !Number.isSafeInteger(weeks[0].revision) || weeks[0].revision < 0) fail('missing unique Week 5 snapshot.');
  const selected = weeks[0], initialState = structuredClone(selected.state), actorId = mappings.find(row => row.alias === 'troy').id;
  if (!Array.isArray(selected.games) || !selected.games.length) fail('missing Week 5 schedule.');
  const games = selected.games.map(game => {
    const kickoff = typeof game.kickoff === 'number' ? new Date(game.kickoff * 1000).toISOString() : game.kickoff;
    if (!game.id || !game.home || !game.away || !Number.isFinite(Date.parse(kickoff))) fail('invalid scheduled game.');
    return { ...game, season: SEASON, week: WEEK, kickoff };
  });
  if (new Set(games.map(game => game.id)).size !== games.length) fail('duplicate scheduled game.');
  let state = initialState;
  const operations = config.entries.map(assumption => {
    const { owner, ...originalBody } = structuredClone(targets.find(entry => entry.requestId === assumption.createRequestId));
    if (environment === 'hosted') originalBody.notes = originalBody.notes.replace('Imported locally from Sean’s report.', 'Shared by Sean from supplied report.');
    const original = findSocialReceipt(state, { actorId, action: 'create', body: originalBody });
    if (!original || state.receipts.filter(row => row.actorId === actorId && row.requestId === assumption.createRequestId).length !== 1) fail('a unique original create receipt is required; this planner never creates missing tickets.');
    const entry = state.entries.find(row => row.id === original.entryId);
    const originals = state.audit.filter(event => event.action === 'create' && event.entryId === original.entryId && event.actorId === actorId);
    if (!entry || entry.ownerId !== actorId || originals.length !== 1 || originals[0].after?.odds !== null) fail('original unknown-price history is missing.');
    const priorReceipts = state.receipts.filter(row => row.actorId === actorId && row.requestId === assumption.requestId);
    let body, delta = null;
    if (priorReceipts.length) {
      if (priorReceipts.length !== 1 || priorReceipts[0].action !== 'correct' || priorReceipts[0].entryId !== entry.id) fail('conflicting correction receipt.');
      const signed = JSON.parse(priorReceipts[0].signature);
      body = { ...signed.payload, requestId: assumption.requestId };
      const events = state.audit.filter(event => event.actorId === actorId && event.entryId === entry.id && event.action === 'correct' && event.before?.revision === body.revision);
      if (signed.action !== 'correct' || events.length !== 1 || events[0].before.odds !== null || !same(body, correctionBody(events[0].before, assumption, config))) fail('the stable request ID was used for different assumptions.');
      findSocialReceipt(state, { actorId, action: 'correct', body });
    } else {
      if (entry.odds !== null) fail('a ticket already has odds; never replace an accepted price with an assumption.');
      if (entry.outcome !== 'pending' || entry.sourceEntryId !== null || entry.rootEntryId !== null
        || ['season', 'week', 'kind', 'origin', 'legs', 'stakeUnits', 'quotedAt', 'placedAt'].some(key => !same(entry[key], originals[0].after[key]))) fail('ticket terms changed since the original import; review before assuming odds.');
      body = correctionBody(entry, assumption, config);
      const next = applySocialMutation(state, { actorId, action: 'correct', body, games, now, uuid });
      delta = { entry: next.entries.find(row => row.id === entry.id), event: next.audit.at(-1), receipt: next.receipts.at(-1) };
      state = next;
    }
    return { owner, actorId, createRequestId: assumption.createRequestId, requestId: assumption.requestId, body, delta };
  });
  const corrected = operations.filter(op => op.delta).length;
  return { version: 1, purpose: config.basis, environment, createdAt: new Date(now).toISOString(), leagueId: LEAGUE, season: SEASON, week: WEEK,
    operator: { alias: 'sean', id: mappings.find(row => row.alias === 'sean').id }, mappings,
    sourceSha256: hash(intake), assumptionsSha256: hash(config), initialStateSha256: hash(initialState), initialState,
    initialRevision: selected.revision, sourceGames: structuredClone(selected.games), operations, corrected, alreadyPresent: operations.length - corrected,
    expectedRevision: selected.revision + corrected, finalState: state, preserved: context.preserved ?? {} };
}

/** One guarded transaction, existing service-only RPC only; replay never reapplies old terms. */
export function socialOddsAssumptionsSql(plan) {
  if (plan.environment !== 'hosted') fail('local fixture plans cannot produce hosted SQL.');
  const { finalState, ...prepared } = plan;
  const literal = sqlJson(prepared), delimiter = `$gtl_odds_${hash(prepared).slice(0, 16)}$`;
  if (literal.includes(delimiter)) fail('unsafe SQL delimiter.');
  return `-- User-authorized accounting assumptions; no schema or authorization changes.
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
  PERFORM p.user_id FROM public.gtl_profiles p
    WHERE p.user_id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(plan->'mappings') x)
    ORDER BY p.user_id FOR UPDATE;
  FOR mapping IN SELECT value FROM jsonb_array_elements(plan->'mappings') LOOP
    PERFORM m.user_id FROM public.gtl_memberships m WHERE m.league_id=plan->>'leagueId'
      AND m.player_id=mapping->>'alias' AND m.user_id=(mapping->>'id')::uuid AND m.active FOR SHARE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.gtl_profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=(mapping->>'id')::uuid)
      OR (SELECT count(*) FROM public.gtl_memberships m WHERE m.league_id=plan->>'leagueId' AND m.player_id=mapping->>'alias' AND m.active)<>1
      THEN RAISE EXCEPTION 'GTL_ODDS_MAPPING_CHANGED'; END IF;
  END LOOP;
  FOR op IN SELECT value FROM jsonb_array_elements(plan->'operations') LOOP
    SELECT * INTO prior FROM public.gtl_social_commits WHERE actor_id=(op->>'actorId')::uuid AND request_id=(op->>'requestId')::uuid;
    IF FOUND THEN
      IF prior.season<>(plan->>'season')::integer OR prior.week<>(plan->>'week')::integer OR prior.action<>'correct'
        OR prior.payload IS DISTINCT FROM op->'body' THEN RAISE EXCEPTION 'GTL_ODDS_RETRY_CONFLICT'; END IF;
    ELSE pending_count := pending_count+1; END IF;
  END LOOP;
  IF pending_count=0 THEN RETURN; END IF;
  PERFORM 1 FROM public.gtl_weekly_slates WHERE season=(plan->>'season')::integer AND week=(plan->>'week')::integer
    AND signature->'games'=plan->'sourceGames' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GTL_ODDS_SLATE_CHANGED'; END IF;
  SELECT * INTO saved FROM public.gtl_social_weeks WHERE season=(plan->>'season')::integer AND week=(plan->>'week')::integer FOR UPDATE;
  IF NOT FOUND OR saved.revision<>(plan->>'initialRevision')::bigint OR saved.state IS DISTINCT FROM plan->'initialState'
    THEN RAISE EXCEPTION 'GTL_ODDS_SNAPSHOT_CHANGED'; END IF;
  current_state := saved.state; current_revision := saved.revision;
  FOR op IN SELECT value FROM jsonb_array_elements(plan->'operations') LOOP
    IF EXISTS(SELECT 1 FROM public.gtl_social_commits WHERE actor_id=(op->>'actorId')::uuid AND request_id=(op->>'requestId')::uuid) THEN CONTINUE; END IF;
    IF op->'delta' IS NULL OR op->'delta'='null'::jsonb THEN RAISE EXCEPTION 'GTL_ODDS_MISSING_RECEIPT'; END IF;
    SELECT * INTO prior FROM public.gtl_social_commits WHERE actor_id=(op->>'actorId')::uuid AND request_id=(op->>'createRequestId')::uuid;
    IF NOT FOUND OR prior.action<>'create' OR prior.season<>(plan->>'season')::integer OR prior.week<>(plan->>'week')::integer
      OR prior.event->>'entryId' IS DISTINCT FROM op#>>'{body,entryId}' OR prior.payload->'odds' IS DISTINCT FROM 'null'::jsonb
      THEN RAISE EXCEPTION 'GTL_ODDS_ORIGINAL_CHANGED'; END IF;
    candidate := jsonb_build_object('version',1,
      'entries',(SELECT jsonb_agg(CASE WHEN entry->>'id'=op#>>'{body,entryId}' THEN op#>'{delta,entry}' ELSE entry END ORDER BY position)
        FROM jsonb_array_elements(current_state->'entries') WITH ORDINALITY AS entries(entry,position)),
      'audit',current_state->'audit'||jsonb_build_array(op#>'{delta,event}'),
      'receipts',current_state->'receipts'||jsonb_build_array(op#>'{delta,receipt}'));
    PERFORM public.gtl_commit_social((op->>'actorId')::uuid,(plan->>'season')::integer,(plan->>'week')::integer,
      current_revision,(op->>'requestId')::uuid,'correct',op->'body',candidate);
    current_state := candidate; current_revision := current_revision+1;
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
  const contextPath = process.argv[2] ?? '.local/social-odds-context.json';
  const outPrefix = process.argv[3] ?? '.local/social-odds-plan';
  const intake = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));
  const config = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-odds-assumptions.json', import.meta.url), 'utf8'));
  const plan = planSocialOddsAssumptions(intake, config, JSON.parse(fs.readFileSync(contextPath, 'utf8')));
  fs.mkdirSync(path.dirname(outPrefix), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(`${outPrefix}.sql`, socialOddsAssumptionsSql(plan), { mode: 0o600 });
  console.log(JSON.stringify({ prepared: plan.corrected, alreadyPresent: plan.alreadyPresent, expectedRevision: plan.expectedRevision,
    sourceSha256: plan.sourceSha256, assumptionsSha256: plan.assumptionsSha256, manifest: `${outPrefix}.json`, sql: `${outPrefix}.sql`, executed: false }));
}
