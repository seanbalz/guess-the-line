import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { seed } from '../server/store.mjs';
import { accuracy, round } from '../server/domain.mjs';
import { handleCommunity, providerCommunityError } from '../cloud/community.mjs';
import { buildRuledImport, executeRuledImport, sqlStatement, sqlTemplate, verifySql, PICKS_FILE, PICKS_SHA256, RPC } from '../scripts/import-ruled-ballot.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Every repo migration in filename order except the two that install pg_cron/pg_net (hosted-only extensions).
const MIGRATIONS = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !/scheduler_extension/.test(f)).sort();
const SEAN = 30, TROY = 1, LUKE = 4, BEN = 2, NEW = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const at = value => Date.parse(value);

test('the committed picks file is byte-identical and the dry run carries counts and hashes, never picks', () => {
  assert.equal(createHash('sha256').update(fs.readFileSync(PICKS_FILE)).digest('hex'), PICKS_SHA256);
  assert.ok(MIGRATIONS.includes('20261009160000_gtl_ruled_ballot_import.sql'));
  const { payload, summary } = buildRuledImport({ user: id(BEN) });
  const doc = JSON.parse(fs.readFileSync(PICKS_FILE, 'utf8'));
  const expected = round(doc.picks.reduce((sum, p) => sum + accuracy(p.predicted_home_spread, p.consensus_home_spread), 0));
  assert.equal(expected, doc.scoring.total_points);
  assert.deepEqual([summary.games, summary.picks, summary.references, summary.expectedPoints, summary.maxPoints, summary.decision], [15, 15, 15, expected, 150, 'D-25']);
  assert.deepEqual([summary.submittedAt, summary.deadline], ['2026-10-08T19:00:00.000Z', '2026-10-09T00:15:00.000Z'], '12:00 PM PT on October 8, before the 5:15 PM PT deadline');
  assert.ok(at(summary.capturedAt) < at(summary.submittedAt) && at(summary.observedAt) <= at(summary.capturedAt), 'the ruled eDraft reference predates the submission');
  assert.ok(!Object.keys(summary).some(k => /pick|value/i.test(k) && typeof summary[k] === 'object'));
  const text = JSON.stringify(summary);
  for (const game of Object.keys(payload.p_picks)) assert.ok(!text.includes(game), 'no game id (and so no pick) in the summary');
  assert.ok(!text.includes('"p_picks"') && !text.includes('TB-DAL'));
  assert.equal(summary.user, `${id(BEN).slice(0, 8)}…`);
  assert.deepEqual(Object.keys(payload).sort(), ['p_actor', 'p_mode', 'p_picks', 'p_reference', 'p_ruling', 'p_season', 'p_submitted_at', 'p_user', 'p_week']);
  assert.deepEqual([payload.p_season, payload.p_week, payload.p_mode, payload.p_actor, payload.p_user], [2026, 5, 'guess_spread', null, id(BEN)]);
  assert.deepEqual(Object.keys(payload.p_picks).sort(), seed().games.map(g => g.id).sort());
  assert.deepEqual(Object.keys(payload.p_reference.values).sort(), Object.keys(payload.p_picks).sort());
  assert.match(payload.p_reference.sourceUrl, /^https:\/\//);
  assert.throws(() => buildRuledImport({ user: 'not-a-uuid' }), /--user/);
  assert.throws(() => buildRuledImport({ user: id(BEN), actor: 'x' }), /--actor/);
  assert.match(sqlStatement(payload), new RegExp(`^select public\\.${RPC}\\('<commissioner auth\\.users id>'::uuid, '${id(BEN)}'::uuid, 2026, 5, 'guess_spread', '.*'::jsonb, '2026-10-08T19:00:00\\.000Z'::timestamptz, '.*', '.*'::jsonb\\) as result;\\n$`));
  assert.ok(!sqlTemplate().includes('TB-DAL') && !verifySql().includes('picks->') && verifySql().includes('gtl_ruled_ballot_imports'));
  const dry = spawnSync(process.execPath, ['scripts/import-ruled-ballot.mjs', '--user', id(BEN)], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(!dry.stdout.includes('TB-DAL') && dry.stdout.includes('"dryRun": true') && dry.stdout.includes(sqlTemplate()) && dry.stdout.includes('"expectedPoints": 37.6'));
  const execute = spawnSync(process.execPath, ['scripts/import-ruled-ballot.mjs', '--user', id(BEN), '--execute'], { encoding: 'utf8', env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } });
  assert.equal(execute.status, 1); assert.match(execute.stderr, /SUPABASE_URL/);
  assert.equal(spawnSync(process.execPath, ['scripts/import-ruled-ballot.mjs', '--user', id(BEN), '--bogus'], { encoding: 'utf8' }).status, 1);
  const sqlNoActor = spawnSync(process.execPath, ['scripts/import-ruled-ballot.mjs', '--user', id(BEN), '--sql'], { encoding: 'utf8' });
  assert.equal(sqlNoActor.status, 1); assert.match(sqlNoActor.stderr, /--actor <commissioner uuid>/);
  assert.ok(!sqlNoActor.stdout.includes('dryRun'), 'without the commissioner id nothing is written or printed: a placeholder statement never reaches execute_sql');
});

test('--execute posts the payload to the service-role RPC and resolves the commissioner from memberships', async () => {
  const { payload } = buildRuledImport({ user: id(BEN) });
  const calls = [];
  process.env.SUPABASE_URL = 'https://abc123.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture-key-not-real';
  try {
    const fetchImpl = async (url, request) => {
      calls.push({ url: String(url), request });
      if (String(url).includes('/rest/v1/gtl_memberships?')) return new Response(JSON.stringify([{ user_id: id(SEAN) }]), { status: 200 });
      if (String(url).endsWith(`/rest/v1/rpc/${RPC}`)) return new Response(JSON.stringify({ imported: true, replayed: false, games: 15 }), { status: 200 });
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
    };
    assert.deepEqual(await executeRuledImport(payload, { fetchImpl }), { imported: true, replayed: false, games: 15 });
    assert.deepEqual(calls.map(c => [c.request.method, new URL(c.url).pathname]), [['GET', '/rest/v1/gtl_memberships'], ['POST', `/rest/v1/rpc/${RPC}`]]);
    assert.ok(calls.every(c => c.request.headers.Authorization === 'Bearer service-role-fixture-key-not-real' && c.request.redirect === 'error'));
    const body = JSON.parse(calls[1].request.body);
    assert.deepEqual(body, { ...payload, p_actor: id(SEAN) });
    await assert.rejects(() => executeRuledImport(payload, { fetchImpl: async () => new Response(JSON.stringify({ message: 'GTL_COMMUNITY_FORBIDDEN' }), { status: 400 }) }), /GTL_COMMUNITY_FORBIDDEN/);
    await assert.rejects(() => executeRuledImport({ ...payload, p_actor: id(SEAN) }, { fetchImpl: async () => new Response('{}', { status: 200 }) }), /Unexpected RPC result/);
    process.env.SUPABASE_URL = 'http://evil.example/';
    await assert.rejects(() => executeRuledImport(payload, { fetchImpl }), /SUPABASE_URL/);
  } finally { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test('commissioner-ruled ballot import: service-only RPC, guard bypass scoped to the function, community-only effect', { skip }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const original = seed();
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', original]);
      for (const n of [SEAN, TROY, LUKE, BEN, NEW]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(SEAN), id(TROY), id(LUKE)]);
    }
    if (file === MIGRATIONS[1]) {
      await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy'),($3,'Luke'),($4,'Ben 🫘')", [id(SEAN), id(TROY), id(LUKE), id(BEN)]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const call = async (tx, name, args) => (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  const rpc = (name, args) => db.transaction(async tx => { await tx.exec('set local role service_role'); return call(tx, name, args); });
  const service = { rpc: async (name, args) => { try { return await rpc(name, args); } catch (error) { throw providerCommunityError(error.message); } } };
  const user = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const read = (n, now = Date.now(), body = {}) => handleCommunity({ route: '/community/read', body, user: user(n), service, clock: () => now });
  const { payload, summary } = buildRuledImport({ user: id(BEN), actor: id(SEAN) });
  const gameIds = Object.keys(payload.p_picks).sort();
  const dedupe = `ballot:${id(BEN)}:2026:5:guess_spread`;
  const count = async (sql, args = []) => (await db.query(`select count(*)::int n from ${sql}`, args)).rows[0].n;
  const state = async () => ({
    ballot: (await db.query('select ballot,audit,origin_practice,provenance from public.gtl_weekly_ballots where user_id=$1', [id(BEN)])).rows,
    revision: (await db.query('select revision from public.gtl_weekly_versions where user_id=$1', [id(BEN)])).rows,
    posts: (await db.query("select id,actor_id,kind,season,week,mode,dedupe_key,created_at from public.gtl_feed_posts where kind='ballot_submitted' order by created_at,id")).rows,
    imports: (await db.query('select * from public.gtl_ruled_ballot_imports')).rows,
    audit: (await db.query("select actor_id,event from public.gtl_access_audit where event like 'ruled_ballot_import:%' order by created_at")).rows,
    memberships: (await db.query('select user_id,league_id,player_id,role,active from public.gtl_memberships order by player_id')).rows,
    league: (await db.query("select state,revision from public.gtl_leagues where id='sean-troy-luke'")).rows[0],
    rulings: await count('public.gtl_weekly_eligibility_rulings'),
  });
  const slate = (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
  assert.ok(Date.now() > slate.deadline * 1000, 'Week 5 closed on October 8 at 5:15 PM PT; every test below runs after the deadline');
  const submittedBallot = (picks = payload.p_picks) => ({ picks, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), scoringPolicy: 'submission-time', scoringReferences: {} });

  await t.test('browser roles cannot call the RPC or read the ruling table; nothing is security definer', async () => {
    const signature = `public.${RPC}(uuid,uuid,integer,integer,text,jsonb,timestamptz,text,jsonb)`;
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, signature, 'EXECUTE'])).rows[0].ok, false);
      await assert.rejects(() => as(role, `select public.${RPC}($1,$2,2026,5,'guess_spread',$3,$4,$5,$6)`, [id(SEAN), id(BEN), payload.p_picks, payload.p_submitted_at, payload.p_ruling, payload.p_reference]), /permission denied/);
      await assert.rejects(() => as(role, 'select * from public.gtl_ruled_ballot_imports'), /permission denied/);
      await assert.rejects(() => as(role, "insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread','{}')", [id(BEN)]), /permission denied/);
    }
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', signature, 'EXECUTE'])).rows[0].ok, true);
    assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and prosecdef")).rows[0].n, 0);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.gtl_ruled_ballot_imports'::regclass")).rows[0].relrowsecurity, true);
    assert.deepEqual((await db.query("select privilege_type from information_schema.role_table_grants where table_name='gtl_ruled_ballot_imports' and grantee='service_role' order by 1")).rows.map(r => r.privilege_type), ['INSERT', 'SELECT'], 'a ruling record is final');
    assert.deepEqual((await db.query("select privilege_type from information_schema.role_table_grants where table_name='gtl_weekly_eligibility_rulings' and grantee='service_role' order by 1")).rows.map(r => r.privilege_type), ['SELECT'], 'the eligibility rulings table keeps its read-only runtime grant');
    assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename in ('gtl_ruled_ballot_imports','gtl_weekly_ballots','gtl_weekly_versions')")).rows[0].n, 0, 'no RLS policy opens a browser path');
  });

  await t.test('a direct insert after the deadline still fails at the guard, even with the flag set by hand', async () => {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [id(TROY)]);
    const insert = tx => tx.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread',$2)", [id(TROY), submittedBallot()]);
    await assert.rejects(() => insert(db), /GTL_PREDICTION_CLOSED/);
    await assert.rejects(() => db.transaction(async tx => { await tx.exec("select set_config('gtl.ruled_ballot_import','commissioner',true)"); await insert(tx); }), /GTL_PREDICTION_CLOSED/, 'the flag alone never bypasses the guard: the import function must be on the stack');
    await assert.rejects(() => db.transaction(async tx => { await tx.exec("set local role service_role; select set_config('gtl.ruled_ballot_import','commissioner',true)"); await insert(tx); }), /GTL_PREDICTION_CLOSED/);
    assert.equal(await count('public.gtl_weekly_ballots where user_id=$1', [id(TROY)]), 0);
  });

  const before = await state();
  await t.test('a non-commissioner actor or an account without a profile fails closed and writes nothing', async () => {
    await assert.rejects(() => rpc(RPC, { ...payload, p_actor: id(TROY) }), /GTL_COMMUNITY_FORBIDDEN/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_actor: id(NEW) }), /GTL_COMMUNITY_FORBIDDEN/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_user: id(NEW) }), /GTL_COMMUNITY_MEMBER/, 'no profile means no community and no import');
    await assert.rejects(() => rpc(RPC, { ...payload, p_week: 6 }), /GTL_SLATE_CONFLICT/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_picks: Object.fromEntries(Object.entries(payload.p_picks).slice(1)) }), /GTL_BALLOT_INCOMPLETE/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_picks: { ...payload.p_picks, [gameIds[0]]: -3.25 } }), /GTL_BALLOT_INVALID/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_submitted_at: '2026-10-09T00:15:00Z' }), /GTL_RULED_IMPORT_INVALID/, 'at or after the deadline is not on time');
    await assert.rejects(() => rpc(RPC, { ...payload, p_submitted_at: '2026-10-04T12:00:00Z' }), /GTL_RULED_IMPORT_INVALID/, 'before the D-24 Monday open is not inside the window');
    await assert.rejects(() => rpc(RPC, { ...payload, p_reference: { ...payload.p_reference, capturedAt: '2026-10-08T20:00:00Z' } }), /GTL_RULED_IMPORT_INVALID/, 'a reference captured after the submission is not a submission-time reference');
    await assert.rejects(() => rpc(RPC, { ...payload, p_reference: { ...payload.p_reference, decision: 'ruling' } }), /GTL_RULED_IMPORT_INVALID/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_ruling: 'short' }), /GTL_RULED_IMPORT_INVALID/);
    assert.deepEqual(await state(), before);
  });

  let result;
  await t.test('the commissioner import succeeds after the deadline through the RPC with the ruled references', async () => {
    // One transaction around the call, so what the function leaves behind is observable after it returns:
    // the flag is cleared, and a direct insert in that same transaction is refused again. The guard's
    // PG_CONTEXT check, not the flag, is what scopes the bypass.
    result = await db.transaction(async tx => {
      await tx.exec('set local role service_role');
      const r = await call(tx, RPC, payload);
      assert.equal((await tx.query("select current_setting('gtl.ruled_ballot_import',true) v")).rows[0].v, '', 'the function clears its flag before returning');
      await tx.exec('savepoint after_import');
      await assert.rejects(() => tx.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread',$2)", [id(TROY), submittedBallot()]), /GTL_PREDICTION_CLOSED/, 'same transaction, function returned: the guard is back in force');
      await tx.exec('rollback to savepoint after_import');
      return r;
    });
    assert.deepEqual([result.imported, result.replayed, result.userId, result.season, result.week, result.mode, result.games, result.references, result.revision, result.decision], [true, false, id(BEN), 2026, 5, 'guess_spread', 15, 15, 1, 'D-25']);
    assert.equal(at(result.submittedAt), at(payload.p_submitted_at));
    assert.match(result.postId, UUID); assert.match(result.payloadSha256, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(result).includes(gameIds[0]), 'the result carries no pick');
    const after = await state();
    assert.equal(after.ballot.length, 1);
    const { ballot, audit, origin_practice, provenance } = after.ballot[0];
    assert.deepEqual(ballot.picks, payload.p_picks);
    assert.equal(at(ballot.submittedAt), at(payload.p_submitted_at)); assert.equal(ballot.updatedAt, ballot.submittedAt);
    assert.equal(ballot.scoringPolicy, 'submission-time');
    assert.deepEqual(Object.keys(ballot.scoringReferences).sort(), gameIds);
    for (const g of gameIds) {
      const ref = ballot.scoringReferences[g];
      assert.deepEqual([ref.status, ref.value, ref.basis, ref.decision, ref.snapshotId, ref.officialVerified, ref.snapshotFile, ref.source, ref.sourceUrl],
        ['available', payload.p_reference.values[g], 'commissioner-ruled', 'D-25', null, false, summary.snapshot, payload.p_reference.source, payload.p_reference.sourceUrl]);
      assert.equal(at(ref.savedAt), at(payload.p_submitted_at)); assert.equal(at(ref.capturedAt), at(summary.capturedAt)); assert.equal(at(ref.observedAt), at(summary.observedAt));
    }
    assert.deepEqual(ballot.ruling, { decision: 'D-25', basis: 'commissioner-ruled', approvedBy: id(SEAN) });
    assert.equal(origin_practice, false);
    assert.deepEqual(provenance, [{ scope: 'community', import: 'commissioner_ruled', decision: 'D-25', approvedBy: id(SEAN) }]);
    assert.equal(audit.length, 1);
    assert.deepEqual([audit[0].type, audit[0].origin, audit[0].decision, audit[0].actor, audit[0].mode, audit[0].before, audit[0].after, audit[0].changedGameIds], ['ballot_submitted', 'commissioner_ruled_import', 'D-25', id(SEAN), 'guess_spread', {}, payload.p_picks, gameIds]);
    assert.equal(at(audit[0].timestamp), at(payload.p_submitted_at)); assert.equal(audit[0].ruling, payload.p_ruling);
    assert.deepEqual(after.revision, [{ revision: 1 }]);
    assert.equal(after.posts.length, 1);
    assert.deepEqual([after.posts[0].actor_id, after.posts[0].kind, after.posts[0].season, after.posts[0].week, after.posts[0].mode, after.posts[0].dedupe_key, after.posts[0].id], [id(BEN), 'ballot_submitted', 2026, 5, 'guess_spread', dedupe, result.postId]);
    assert.equal(at(after.posts[0].created_at), at(payload.p_submitted_at), 'the feed post is dated at the ruled submission time');
    assert.equal(after.imports.length, 1);
    const row = after.imports[0];
    assert.deepEqual([row.user_id, row.season, row.week, row.mode, row.decision, row.approved_by, row.context_league_id, row.ruling, row.payload_sha256], [id(BEN), 2026, 5, 'guess_spread', 'D-25', id(SEAN), 'sean-troy-luke', payload.p_ruling, result.payloadSha256]);
    assert.equal(at(row.submitted_at), at(payload.p_submitted_at));
    assert.deepEqual(row.evidence, payload.p_reference);
    assert.deepEqual(after.audit, [{ actor_id: id(SEAN), event: `ruled_ballot_import:D-25:${id(BEN)}:2026:5:guess_spread` }]);
    assert.equal(after.rulings, 0, 'the eligibility rulings table is untouched');
  });

  await t.test('replaying the import through the RPC or the MCP statement changes nothing; a different ballot fails closed', async () => {
    const after = await state();
    const replay = await rpc(RPC, payload);
    assert.deepEqual(replay, { ...result, imported: false, replayed: true });
    const mcp = (await db.query(sqlStatement(payload))).rows[0].result;
    assert.deepEqual(mcp, replay, 'the statement the cloud session runs through the Supabase MCP is the same call');
    await assert.rejects(() => rpc(RPC, { ...payload, p_picks: { ...payload.p_picks, [gameIds[0]]: payload.p_picks[gameIds[0]] + 0.5 } }), /GTL_RULED_IMPORT_CONFLICT/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_submitted_at: '2026-10-08T18:00:00Z' }), /GTL_RULED_IMPORT_CONFLICT/);
    await assert.rejects(() => rpc(RPC, { ...payload, p_reference: { ...payload.p_reference, values: { ...payload.p_reference.values, [gameIds[0]]: 0 } } }), /GTL_RULED_IMPORT_CONFLICT/);
    assert.deepEqual(await state(), after);
    await assert.rejects(() => db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread',$2)", [id(TROY), submittedBallot()]), /GTL_PREDICTION_CLOSED/, 'the guard still refuses everyone else');
  });

  await t.test('community standings and feed carry Ben with the ruled points and submission time; the D-23 reveal gate is unchanged', async () => {
    const feed = await read(SEAN);
    assert.deepEqual(feed.members.map(m => m.displayName), ['Ben 🫘', 'Luke', 'Sean', 'Troy']);
    const ben = feed.standings.find(x => x.userId === id(BEN) && x.mode === 'guess_spread');
    assert.deepEqual([ben.weekPoints, ben.weekScored, ben.seasonPoints, ben.seasonScored, ben.weeksSubmitted, ben.satOut], [summary.expectedPoints, 15, summary.expectedPoints, 15, 1, false], 'scored against the ruled eDraft reference, not a later snapshot');
    assert.equal(ben.weekPoints, 37.6);
    const submission = feed.submissions.find(s => s.userId === id(BEN));
    assert.deepEqual([submission.mode, at(submission.submittedAt), submission.satOut], ['guess_spread', at(payload.p_submitted_at), false]);
    const post = feed.posts.find(p => p.kind === 'ballot_submitted' && p.actorId === id(BEN));
    assert.deepEqual([post.id, post.mode, at(post.createdAt), post.picksHidden, post.picks], [result.postId, 'guess_spread', at(payload.p_submitted_at), false, payload.p_picks], 'after the deadline everyone sees the picks');
    assert.deepEqual((await read(BEN)).due.map(d => [d.mode, d.submitted, d.filled]), [['guess_spread', true, 15], ['guess_total', false, 0]]);
    const open = at('2026-10-08T20:00:00Z');
    const troy = (await read(TROY, open)).posts.find(p => p.id === result.postId);
    assert.deepEqual([troy.picksHidden, troy.picks], [true, null], 'before the deadline a viewer without a spread ballot does not see the picks');
    const sean = (await read(SEAN, open)).posts.find(p => p.id === result.postId);
    assert.deepEqual([sean.picksHidden, sean.picks], [false, payload.p_picks], 'Sean submitted spreads, so he sees them');
    assert.deepEqual((await read(BEN, open)).posts.find(p => p.id === result.postId).picks, payload.p_picks, 'own picks are always visible');
  });

  await t.test('the Triple Threat roster and group standings are unchanged', async () => {
    const after = await state();
    assert.deepEqual(after.memberships, before.memberships);
    assert.deepEqual(after.memberships.map(m => [m.player_id, m.role, m.active]), [['luke', 'player', true], ['sean', 'commissioner', true], ['troy', 'player', true]]);
    assert.deepEqual(after.league, before.league);
    assert.deepEqual(after.league.state.league.roster.map(r => r.id), ['sean', 'troy', 'luke']);
    assert.equal(await count('public.gtl_memberships where user_id=$1', [id(BEN)]), 0);
    const weekly = await rpc('gtl_read_weekly_state', { p_user: id(SEAN), p_league: 'sean-troy-luke' });
    assert.deepEqual(weekly.state.league.roster.map(r => r.id), ['sean', 'troy', 'luke']);
    assert.deepEqual(Object.keys(weekly.state.ballots), ['sean'], 'no group ballot, standings or eligibility entry for Ben');
    assert.deepEqual(Object.keys(weekly.eligibility), ['sean']);
    assert.ok(!JSON.stringify(weekly).includes(id(BEN)));
  });

  await t.test('the ruled path opens only once the normal path has closed: a week whose deadline is still ahead refuses the import', async () => {
    const snapshot = await state();
    const ms = v => new Date(v).getTime(), iso = v => new Date(v).toISOString();
    // An instant inside the Week 6 window whatever the wall clock: the later of the D-24 open and an hour before the deadline.
    const window = async tx => (await tx.query("select to_timestamp((signature->>'deadline')::double precision) as deadline, greatest(public.gtl_week_open_at(2026,6),to_timestamp((signature->>'deadline')::double precision)-interval '1 hour') as submitted, clock_timestamp() as now from public.gtl_weekly_slates where season=2026 and week=6")).rows[0];
    // Everything happens inside one transaction that is rolled back at the end, so no Week 6 slate, ballot or post persists.
    await assert.rejects(() => db.transaction(async tx => {
      await tx.query("insert into public.gtl_weekly_slates(season,week,signature) select 2026,6,jsonb_set(jsonb_set(signature,'{week}','6'),'{deadline}',to_jsonb(extract(epoch from clock_timestamp()+interval '1 day'))) from public.gtl_weekly_slates where season=2026 and week=5");
      let w = await window(tx);
      assert.ok(ms(w.deadline) > ms(w.now) && ms(w.submitted) < ms(w.deadline) && ms(w.submitted) > at(summary.capturedAt), 'a submission instant inside a window that is still open, after the ruled reference');
      await tx.exec('savepoint open_week; set local role service_role');
      await assert.rejects(() => call(tx, RPC, { ...payload, p_week: 6, p_submitted_at: iso(w.submitted) }), /GTL_RULED_IMPORT_INVALID/, 'before the deadline the normal save path with a fresh D-16 reference is the only way in, whoever calls');
      await tx.exec('rollback to savepoint open_week');
      // The same ballot once that week has closed: the refusal above was the deadline check and nothing else.
      await tx.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb(extract(epoch from clock_timestamp()-interval '1 minute'))) where season=2026 and week=6");
      w = await window(tx);
      assert.ok(ms(w.deadline) < ms(w.now) && ms(w.submitted) < ms(w.deadline));
      await tx.exec('set local role service_role');
      const closed = await call(tx, RPC, { ...payload, p_week: 6, p_submitted_at: iso(w.submitted) });
      assert.deepEqual([closed.imported, closed.replayed, closed.week, closed.games], [true, false, 6, 15]);
      throw new Error('rollback');
    }), /^Error: rollback$/);
    assert.deepEqual(await state(), snapshot);
    assert.equal(await count('public.gtl_weekly_slates where week=6'), 0, 'nothing from the rehearsal persists');
  });
});
