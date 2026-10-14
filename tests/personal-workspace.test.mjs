import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { handlePersonal, providerPersonalError } from '../cloud/personal.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Report explicit skip. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: id(1), email: 'solo@example.invalid', emailConfirmed: true };
const skip = PGlite ? false : 'Optional local PGlite not installed. No remote database is used.';

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const migrations = ['20261008164249_gtl_private_cloud_state.sql','20261008174007_gtl_profiles_private_games_invites.sql','20261008182836_gtl_canonical_weekly_entries.sql','20261008185715_gtl_weekly_eligibility_rulings.sql','20261008185738_gtl_manual_odds_collection.sql','20261008224444_gtl_personal_workspace.sql','20261008225401_gtl_submission_time_scoring.sql'];
  await db.exec(fs.readFileSync(`supabase/migrations/${migrations[0]}`, 'utf8'));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.league.deadline = '2099-10-09T00:15:00Z';
  state.games.forEach(g => { g.kickoff = g.kickoff.replace('2026-', '2099-'); });
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
  for (let n = 1; n <= 3; n++) await db.query('insert into auth.users values($1)', [id(n)]);
  for (const migration of migrations.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  await rpc('gtl_save_profile', [id(1), 'Solo One']); await rpc('gtl_save_profile', [id(2), 'Solo Two']);
  let request = 100;
  const read = (who = 1, cursor = null, archived = false) => rpc('gtl_read_personal', [id(who), 2026, 5, cursor, archived]);
  const mutate = async (action, body, who = 1) => rpc('gtl_mutate_personal', [id(who), action, { requestId: id(++request), revision: (await read(who)).revision, ...body }]);
  const ballot = (mode, who = 1) => mutate('personal/ballot', { season: 2026, week: 5, mode, weeklyRevision: 0, picks: Object.fromEntries(state.games.map(g => [g.id, mode === 'guess_total' ? 45 : -3])), submit: true }, who);
  const journal = { season: 2026, week: 5, gameId: 'TB-DAL', kind: 'research_note', market: 'spread', side: 'home', line: -3, odds: -110, source: 'Manual test source', quotedAt: '2026-10-01T01:00:31.456Z', placedAt: null, notes: 'Private rationale <script>text only</script>', outcome: 'pending', currency: null, stakeMinor: null, returnedMinor: null };
  return { db, as, rpc, read, mutate, ballot, journal, state };
}

test('account personal routes authenticate before RPC and require no group membership', async () => {
  const calls = [];
  const handler = createCloudHandler({ authenticate: async token => token === 'valid' ? user : null, storage: { membership: () => { throw new Error('Must not check groups'); } }, personal: { rpc: async (name, args) => { calls.push({ name, args }); return { scope: 'account_private' }; } } });
  const request = (path, body, token = 'valid') => new Request(`https://app.invalid/gtl-api/${path}`, { headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  assert.equal((await handler(request('personal', null, 'bad'))).status, 401);
  assert.equal((await handler(request('personal?league=sean-troy-luke'))).status, 400);
  const response = await handler(request('personal')); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].args.p_user, user.id);
  for (const field of ['userId', 'owner', 'role', 'verified', 'result']) {
    const response = await handler(request('favorite/set', { requestId: id(8), revision: 0, season: 2026, week: 5, gameId: 'TB-DAL', saved: true, notes: '', [field]: 'spoofed' }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 1);
});

test('personal validators reject money, fabricated verification and invalid chronology', async () => {
  const service = { rpc: () => assert.fail('Invalid inputs must not reach the database') };
  const invoke = (route, body) => handlePersonal({ route, body, user, service, clock: () => Date.parse('2026-10-08T12:00:00Z') });
  const base = { requestId: id(9), revision: 0, season: 2026, week: 5, gameId: 'TB-DAL', kind: 'research_note', market: 'spread', side: 'home', line: -3, odds: -110, source: 'Book', quotedAt: '2026-10-01T00:00:00Z', placedAt: null, notes: '' };
  for (const patch of [{ stake: 10 }, { result: 'win' }, { verified: true }, { quotedAt: '2099-01-01T00:00:00Z' }, { line: '' }, { odds: null }, { kind: 'user_reported_placed_bet' }]) await assert.rejects(() => invoke('/journal/create', { ...base, ...patch }), /Check the entry/);
  assert.equal(providerPersonalError('GTL_PERSONAL_CONFLICT').status, 409);
  assert.equal(providerPersonalError('PRIVATE_TOKEN secret').message.includes('secret'), false);
});

test('personal SQL preserves privacy, canonical ballots, atomic retry and correction history', { skip }, async t => {
  const f = await fixture(t);
  await t.test('zero-group home contains neutral slate and only the owner; no membership is created', async () => {
    const view = await f.read(); assert.equal(view.games.length, 15); assert.equal(view.scope, 'account_private');
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_memberships')).rows[0].n, 0);
    assert.deepEqual(view.favorites, []); assert.deepEqual(view.journal, []); assert.deepEqual(view.ballots, {});
    assert.deepEqual(Object.keys(view.games[0]).sort(), ['away', 'awayCode', 'home', 'homeCode', 'id', 'kickoff'].sort());
    await assert.rejects(() => f.read(3), /GTL_PERSONAL_PROFILE/);
  });
  await t.test('private tables deny every browser operation and all functions are invoker-only', async () => {
    for (const table of ['gtl_personal_versions','gtl_favorites','gtl_journal_entries','gtl_personal_forecasts','gtl_personal_events','gtl_personal_receipts']) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `insert into public.${table} default values`, `update public.${table} set user_id=user_id`]) await assert.rejects(() => f.as(role, sql), /permission denied/);
    }
    for (const role of ['anon', 'authenticated']) await assert.rejects(() => f.as(role, 'select public.gtl_read_personal($1)', [id(1)]), /permission denied/);
    for (const table of ['gtl_personal_events', 'gtl_personal_receipts']) await assert.rejects(() => f.as('service_role', `update public.${table} set user_id=user_id`), /permission denied/);
    assert.equal((await f.db.query("select count(*)::int n from pg_proc where proname like 'gtl_%' and prosecdef")).rows[0].n, 0);
  });
  await t.test('favorites persist independently with retry receipts, exact payload matching and conflicts', async () => {
    const body = { requestId: id(30), revision: 0, season: 2026, week: 5, gameId: 'TB-DAL', saved: true, notes: 'Revisit matchup' };
    const save = b => f.rpc('gtl_mutate_personal', [id(1), 'favorite/set', b]);
    assert.deepEqual(await save(body), await save(body));
    await assert.rejects(() => save({ ...body, notes: 'different' }), /GTL_PERSONAL_RETRY_CONFLICT/);
    await assert.rejects(() => save({ ...body, requestId: id(31) }), /GTL_PERSONAL_CONFLICT/);
    assert.equal((await f.read()).favorites[0].notes, 'Revisit matchup'); assert.deepEqual((await f.read(2)).favorites, []);
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_personal_events')).rows[0].n, 1);
    await f.mutate('favorite/set', { ...body, requestId: id(32), revision: 1, saved: false });
    assert.deepEqual((await f.read()).favorites, []);
  });
  await t.test('manual forecasts stay separate before submission and retain earlier values in audit', async () => {
    const body = { season: 2026, week: 5, gameId: 'TB-DAL', market: 'spread', value: -4 };
    await f.mutate('personal/forecast', body); await f.mutate('personal/forecast', { ...body, value: -5 });
    assert.equal((await f.read()).forecasts[0].value, -5); assert.equal((await f.read()).forecasts[0].revision, 2); assert.deepEqual((await f.read()).ballots, {});
    assert.deepEqual((await f.read(2)).forecasts, []);
    assert.equal((await f.db.query("select before_value->>'value' v from public.gtl_personal_events where action='personal/forecast' order by revision desc limit 1")).rows[0].v, '-4');
  });
  await t.test('solo submissions use the existing shared ballot and deadline, independent markets and changed-only D16 references', async () => {
    await assert.rejects(() => f.mutate('journal/create', f.journal), /GTL_MATCHING_BALLOT_REQUIRED/);
    await f.ballot('guess_spread');
    const view = await f.read(); assert.equal(view.weeklyRevision, 1); assert.equal(view.ballots.guess_spread.picks['TB-DAL'], -3);
    assert.ok(view.ballots.guess_spread.submittedAt); assert.equal(view.ballots.guess_total, undefined);
    await assert.rejects(() => f.mutate('personal/ballot', { season: 2026, week: 5, mode: 'guess_spread', weeklyRevision: 1, picks: {}, submit: false }), /GTL_BALLOT_INCOMPLETE/);
    const full = view.ballots.guess_spread.picks, initial = view.ballots.guess_spread;
    await f.mutate('personal/ballot', { season: 2026, week: 5, mode: 'guess_spread', weeklyRevision: 1, picks: full, submit: true });
    assert.deepEqual((await f.read()).ballots.guess_spread.scoringReferences, initial.scoringReferences);
    await f.mutate('personal/ballot', { season: 2026, week: 5, mode: 'guess_spread', weeklyRevision: 2, picks: { ...full, 'TB-DAL': -4 }, submit: true });
    const edited = (await f.read()).ballots.guess_spread;
    assert.equal(edited.submittedAt, initial.submittedAt); assert.equal(edited.scoringPolicy, 'submission-time');
    assert.equal(edited.scoringReferences['TB-DAL'].status, 'unavailable');
    assert.deepEqual(edited.scoringReferences['PHI-JAX'], initial.scoringReferences['PHI-JAX']);
    assert.notEqual(edited.scoringReferences['TB-DAL'].savedAt, initial.scoringReferences['TB-DAL'].savedAt);
    await assert.rejects(() => f.mutate('personal/ballot', { season: 2026, week: 5, mode: 'guess_total', weeklyRevision: 0, picks: {}, submit: false }), /GTL_WEEKLY_CONFLICT/);
    await assert.rejects(() => f.mutate('journal/create', { ...f.journal, market: 'total', side: 'over', line: 45 }), /GTL_MATCHING_BALLOT_REQUIRED/);
    const league = await f.rpc('gtl_create_league', [id(1), 'Later group', 'group', false, id(90)]);
    const shared = await f.rpc('gtl_read_weekly_state', [id(1), league.leagueId]);
    assert.equal(shared.state.ballots[`u_${id(1).replaceAll('-', '')}`].guess_spread.picks['TB-DAL'], -4);
  });
  let entryId;
  await t.test('manual journal saves preserve exact rationale and dates; cross-owner correction and history denied', async () => {
    entryId = (await f.mutate('journal/create', f.journal)).entryId;
    const entry = (await f.read()).journal[0]; assert.equal(entry.id, entryId); assert.equal(entry.notes, f.journal.notes);
    assert.equal(entry.context.personalForecast.value,-5);assert.equal(entry.context.sportsbookGuess.value,-4);
    await f.mutate('personal/forecast',{season:2026,week:5,gameId:'TB-DAL',market:'spread',value:-9});
    assert.equal(entry.verification, 'User-reported; not independently verified'); assert.equal(entry.placedAt, null);
    await assert.rejects(() => f.mutate('journal/archive', { entryId, archived: true, reason: 'Archive' }, 2), /GTL_PERSONAL_NOT_FOUND/);
    await assert.rejects(() => f.rpc('gtl_personal_history', [id(2), entryId]), /GTL_PERSONAL_NOT_FOUND/);
    const signature = (await f.db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
    const afterKickoff = structuredClone(signature); afterKickoff.games.forEach(game => { game.kickoff = 1; });
    await f.db.query('update public.gtl_weekly_slates set signature=$1 where season=2026 and week=5', [afterKickoff]);
    await f.mutate('journal/correct', { ...f.journal, entryId, notes: 'Corrected rationale', reason: 'Correct typo' });
    assert.equal((await f.read()).journal[0].retrospective, false);
    assert.equal((await f.read()).journal[0].context.personalForecast.value,-5);
    assert.equal(Date.parse((await f.read()).journal[0].quotedAt), Date.parse(f.journal.quotedAt));
    await f.db.query('update public.gtl_weekly_slates set signature=$1 where season=2026 and week=5', [signature]);
    const history = await f.rpc('gtl_personal_history', [id(1), entryId]); assert.equal(history.events.length, 2);
    assert.equal(history.events[0].before.notes, f.journal.notes); assert.equal(history.events[0].reason, 'Correct typo');
    await f.mutate('journal/archive', { entryId, archived: true, reason: 'Hide from active journal' });
    assert.deepEqual((await f.read()).journal, []); assert.equal((await f.read(1, null, true)).journal[0].archived, true);
  });
  await t.test('database rejects forged fields and unknown targets even with trusted-role direct calls', async () => {
    await assert.rejects(() => f.mutate('favorite/set', { season: 2026, week: 5, gameId: 'FAKE-TEAM', saved: true, notes: '' }), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.mutate('journal/create', { ...f.journal, verified: true }), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.mutate('journal/create', { ...f.journal, placedAt: 'infinity' }), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.mutate('journal/create', { ...f.journal, quotedAt: '2099-01-01T00:00:00Z' }), /GTL_PERSONAL_INVALID/);
  });
  await t.test('simultaneous same-revision writes yield one commit and one conflict', async () => {
    const revision = (await f.read()).revision;
    const payload = { revision, season: 2026, week: 5, gameId: 'TB-DAL', saved: true, notes: 'Concurrent' };
    const results = await Promise.allSettled([id(200), id(201)].map(requestId => f.rpc('gtl_mutate_personal', [id(1), 'favorite/set', { ...payload, requestId }])));
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(results.filter(x => x.status === 'rejected').length, 1);
    assert.match(results.find(x => x.status === 'rejected').reason.message, /GTL_PERSONAL_CONFLICT/);
  });
});


test('Solo D16 captures actual saved quote evidence and edits only the changed reference', { skip }, async t => {
  const f = await fixture(t), signature = (await f.db.query('select signature from public.gtl_weekly_slates')).rows[0].signature;
  const full = Object.fromEntries(f.state.games.map(g => [g.id, -4]));
  async function snapshot(number, age, value) {
    const captured = new Date(Date.now() - age).toISOString();
    const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: captured, games: f.state.games.map((g,i) => ({ gameId:g.id,home:g.home,away:g.away,kickoff:g.kickoff,providerEventId:`event${i}`,matchStatus:'matched',markets:{spread:{quotes:['draftkings','fanduel','betmgm'].map(book=>({provider:'the-odds-api',providerEventId:`event${i}`,book,market:'spread',value,timeBasis:'provider_market_last_update',collectedAt:captured,providerObservedAt:captured,outcomes:{home:{line:value,odds:-110},away:{line:-value,odds:-110}}}))}} })) };
    await f.db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [id(number),id(1),id(number+1000),signature]);
    await f.db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)',[id(number),signature,payload,captured]);
  }
  await snapshot(400,60000,-3.5);
  await f.mutate('personal/ballot',{season:2026,week:5,mode:'guess_spread',weeklyRevision:0,picks:full,submit:true});
  const original = (await f.read()).ballots.guess_spread;
  assert.equal(original.scoringReferences['TB-DAL'].value,-3.5); assert.equal(original.scoringReferences['TB-DAL'].snapshotId,id(400));
  await snapshot(401,30000,-7.5);
  await f.mutate('personal/ballot',{season:2026,week:5,mode:'guess_spread',weeklyRevision:1,picks:{...full,'TB-DAL':-7},submit:true});
  const changed = (await f.read()).ballots.guess_spread;
  assert.equal(changed.submittedAt,original.submittedAt);assert.equal(changed.scoringReferences['TB-DAL'].value,-7.5);assert.deepEqual(changed.scoringReferences['PHI-JAX'],original.scoringReferences['PHI-JAX']);
  await f.mutate('personal/ballot',{season:2026,week:5,mode:'guess_spread',weeklyRevision:2,picks:changed.picks,submit:true});
  assert.deepEqual((await f.read()).ballots.guess_spread.scoringReferences,changed.scoringReferences);
});

// Redesign build plan stage 27 (M-09): the private notes routes. The SQL side is tests/game-notes-sql.test.mjs.
test('notes routes: only the signed-in owner, exact fields, the note passed as typed and never cut', async () => {
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push({ name, args }); return { ok: true }; } };
  const invoke = (route, body, options = {}) => handlePersonal({ route, body, user, service, ...options });
  const base = { requestId: id(40), season: 2026, week: 6, gameId: 'SEA-JAX', note: '  Two spaces, a tab\t and a line\nbreak stay.\r\n', revision: 7 };
  await invoke('/personal/notes', {});
  await invoke('/personal/notes', { season: 2026, week: 6 });
  await invoke('/personal/note', base);
  assert.deepEqual(calls, [
    { name: 'gtl_read_game_notes', args: { p_user: user.id, p_season: null, p_week: null } },
    { name: 'gtl_read_game_notes', args: { p_user: user.id, p_season: 2026, p_week: 6 } },
    { name: 'gtl_set_game_note', args: { p_user: user.id, p_request: id(40), p_season: 2026, p_week: 6, p_game: 'SEA-JAX', p_note: base.note, p_revision: 7 } },
  ]);
  calls.length = 0;
  // The limit counts as a textarea's maxLength does (UTF-16 code units), the same as the old /favorite/set route.
  await invoke('/personal/note', { ...base, note: 'x'.repeat(2000) });
  await invoke('/personal/note', { ...base, note: '\u{1F3C8}'.repeat(1000) });
  await invoke('/personal/note', { ...base, note: '' });
  assert.equal(calls.length, 3);
  for (const note of ['x'.repeat(2001), '\u{1F3C8}'.repeat(1001)]) {
    await assert.rejects(() => invoke('/personal/note', { ...base, note }), error => error.status === 400 && error.message === 'A note can be up to 2,000 characters.');
  }
  const refused = [
    ['/personal/notes', { season: 2026 }], ['/personal/notes', { week: 6 }], ['/personal/notes', { season: '2026', week: 6 }],
    ...['userId', 'ownerId', 'owner', 'saved', 'notes', 'role'].flatMap(field => [['/personal/notes', { [field]: id(2) }], ['/personal/note', { ...base, [field]: id(2) }]]),
    ...['requestId', 'season', 'week', 'gameId', 'note', 'revision'].map(field => ['/personal/note', { ...base, [field]: undefined }]),
    ['/personal/note', { ...base, requestId: 'not-a-uuid' }], ['/personal/note', { ...base, revision: -1 }], ['/personal/note', { ...base, revision: 1.5 }],
    ['/personal/note', { ...base, revision: '7' }], ['/personal/note', { ...base, gameId: 'sea-jax' }], ['/personal/note', { ...base, note: null }],
    ['/personal/note', { ...base, note: ['x'] }], ['/personal/note', { ...base, note: 'bell \u0007' }], ['/personal/note', { ...base, note: 'nul \u0000' }],
    ['/personal/note', { ...base, note: 'lone \uD800 surrogate' }], ['/personal/note', { ...base, note: 'lone \uDC00 surrogate' }],
  ];
  for (const [route, body] of refused) {
    await assert.rejects(() => invoke(route, JSON.parse(JSON.stringify(body))), error => error.status === 400, `${route} ${JSON.stringify(body)}`);
  }
  assert.equal(calls.length, 3, 'refused requests never reach the database');
});

test('notes errors are mapped before the SQL can raise them; a missing RPC reads as off, never as a database detail', async () => {
  assert.deepEqual(['GTL_NOTE_TOO_LONG', 'GTL_NOTE_CONFLICT', 'GTL_FEATURE_OFF'].map(code => [providerPersonalError(code).status, providerPersonalError(code).code]),
    [[400, 'GTL_NOTE_TOO_LONG'], [409, 'GTL_NOTE_CONFLICT'], [503, 'GTL_FEATURE_OFF']]);
  assert.equal(providerPersonalError('GTL_NOTE_CONFLICT').message, 'This note changed on another device. Refresh before saving again.');
  assert.equal(providerPersonalError('GTL_FEATURE_OFF').message, 'This feature is not available right now. Nothing you saved is lost.');
  // The Supabase adapter: PostgREST's PGRST202 (the function is not on the hosted project yet) is GTL_FEATURE_OFF.
  const answers = [
    Response.json({ code: 'PGRST202', message: 'Could not find the function public.gtl_read_game_notes(p_user) in the schema cache' }, { status: 404 }),
    Response.json({ code: 'P0001', message: 'GTL_NOTE_CONFLICT' }, { status: 400 }),
    Response.json({ code: 'PGRST202', message: 'secret detail' }, { status: 400 }),
    Response.json({ code: '42501', message: 'permission denied for function gtl_set_game_note' }, { status: 401 }),
  ];
  const { personal } = await import('../cloud/handler.mjs').then(({ createSupabaseAdapter }) => createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async () => answers.shift() }));
  await assert.rejects(() => personal.rpc('gtl_read_game_notes', {}), error => error.status === 503 && error.code === 'GTL_FEATURE_OFF');
  await assert.rejects(() => personal.rpc('gtl_set_game_note', {}), error => error.status === 409 && error.code === 'GTL_NOTE_CONFLICT');
  for (let i = 0; i < 2; i++) await assert.rejects(() => personal.rpc('gtl_set_game_note', {}), error => !error.status && error.message === 'Personal workspace unavailable.');
});

test('the GTL_FEATURE_OFF off switch stops note saves only; reads and every other personal route keep working', async () => {
  const calls = [];
  const request = (handler, path, body) => handler(new Request(`https://app.invalid/gtl-api/${path}`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const handlerWith = featureOff => createCloudHandler({ authenticate: async () => user, featureOff, personal: { rpc: async (name, args) => { calls.push(name); return { ok: true, name, args }; } } });
  const note = { requestId: id(41), season: 2026, week: 6, gameId: 'SEA-JAX', note: 'Kept.', revision: 0 };
  for (const value of [undefined, '', 'note', 'other,features', 42]) {
    const response = await request(handlerWith(value), 'personal/note', note);
    assert.equal(response.status, 200, `GTL_FEATURE_OFF=${value} leaves notes on`);
  }
  for (const value of ['notes', ' Notes ', 'other, notes']) {
    calls.length = 0;
    const handler = handlerWith(value);
    const off = await request(handler, 'personal/note', note);
    assert.deepEqual([off.status, await off.json()], [503, { error: 'This feature is not available right now. Nothing you saved is lost.' }]);
    assert.deepEqual(calls, [], 'the writer is never called while off');
    assert.equal((await request(handler, 'personal/notes', {})).status, 200, 'reads stay on');
    assert.equal((await request(handler, 'favorite/set', { requestId: id(42), revision: 0, season: 2026, week: 6, gameId: 'SEA-JAX', saved: true, notes: '' })).status, 200, 'the old Favorites route is not switched');
    assert.deepEqual(calls, ['gtl_read_game_notes', 'gtl_mutate_personal']);
  }
});
