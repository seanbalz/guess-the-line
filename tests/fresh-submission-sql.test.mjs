import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Report a skip, never hosted evidence. */ }
const skip = PGlite ? false : 'Local PGlite unavailable; no hosted database was contacted.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = n => new Date(n).toISOString();
const migration = '20261008232055_gtl_fresh_submission_odds.sql';
const base = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008224444_gtl_personal_workspace.sql', '20261008225401_gtl_submission_time_scoring.sql'];
function payload(games, captured = Date.now() - 1000, value = -3.5) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), games: games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries([['spread', value], ['total', 44.5]].map(([market, line]) => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line,
      timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 1000),
      unsafeExtra: 'must not enter the receipt',
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }])),
  })) };
}
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${base[0]}`, 'utf8'));
  const state = seed(); state.league.deadline = iso(Date.now() + 3 * 3600_000);
  state.games.forEach((g, i) => { g.kickoff = iso(Date.now() + (4 + i) * 3600_000); });
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [state]);
  await db.query('insert into auth.users values($1),($2),($3),($4)', [id(1), id(2), id(3), id(4)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(1), id(2), id(3)]);
  for (const f of base.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${f}`, 'utf8'));
  const beforeMigration = (await db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows;
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  for (let n = 1; n <= 4; n++) await rpc('gtl_save_profile', [id(n), `Test ${n}`]);
  const signature = (await db.query('select signature from public.gtl_weekly_slates')).rows[0].signature;
  const full = (value = -3) => Object.fromEntries(state.games.map(g => [g.id, value]));
  const intent = (patch = {}) => ({ leagueId: 'sean-troy-luke', mode: 'guess_spread', revision: 0, picks: full(), submit: true, ...patch });
  const check = (x = intent(), who = 2) => rpc('gtl_preflight_submission', [id(who), x]);
  const save = (x = intent(), who = 2) => rpc('gtl_save_weekly_ballot', [id(who), x.leagueId, x.mode, x.revision, x.picks, x.submit]);
  const begin = (request, x = intent(), who = 2, operation = 'collect') => rpc('gtl_begin_submission_odds_collection', [id(who), request, x, operation]);
  const finish = (job, data, { who = 2, quota = { remaining: 498, used: 2, last: 2 }, error = null } = {}) => rpc('gtl_finish_submission_odds_collection', [id(who), job.requestId, job.lease, data, quota, error]);
  const own = async (who = 2, mode = 'guess_spread') => (await db.query('select ballot,audit,provenance from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(who), mode])).rows[0];
  const budget = async () => (await db.query('select * from public.gtl_odds_budget')).rows[0];
  const enable = () => db.exec("update public.gtl_odds_budget set conservative_remaining=500,paused=false,last_successful_preflight_at=clock_timestamp(),last_preflight_at=null,last_collection_at=null,lease_token=null,lease_until=null");
  let serial = 500;
  const snapshot = async data => {
    const key = id(++serial);
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [key, id(1), id(serial + 1000), signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [key, signature, data, data.fetchedAt]);
    return key;
  };
  return { db, rpc, as, state, beforeMigration, signature, full, intent, check, save, begin, finish, own, budget, enable, snapshot };
}

test('availability audit: expired cache plus cooldown retains drafts, then a permitted collection allows each market', { skip }, async t => {
  for (const mode of ['guess_spread', 'guess_total']) await t.test(mode, async t => {
    const f = await fixture(t); await f.enable();
    const picks = f.full(mode === 'guess_total' ? 44.5 : -3);
    await f.save(f.intent({ mode, picks, submit: false }));
    const intent = f.intent({ mode, picks, revision: 1 });
    const before = await f.own(2, mode);
    // Synthetic prior collection: six minutes old, so it is outside D-17's
    // five-minute evidence window but inside the shared fifteen-minute cooldown.
    await f.snapshot(payload(f.state.games, Date.now() - 360_000));
    await f.db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '6 minutes'");
    const reservedBefore = await f.budget();
    assert.deepEqual(await f.check(intent), { requiresReferences: true, ready: false });
    await assert.rejects(() => f.begin(id(960), intent), /GTL_ODDS_COOLDOWN/);
    await assert.rejects(() => f.save(intent), /GTL_SUBMISSION_ODDS_REQUIRED/);
    assert.deepEqual(await f.own(2, mode), before);
    assert.deepEqual(await f.budget(), reservedBefore);
    // Move only the synthetic collection clock beyond cooldown; this is not a
    // sleep, provider call, production quota change or relaxed freshness rule.
    await f.db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '16 minutes'");
    const job = await f.begin(id(961), intent);
    assert.equal((await f.finish(job, payload(f.state.games))).status, 'succeeded');
    assert.deepEqual(await f.check(intent), { requiresReferences: true, ready: true });
    assert.equal(await f.save(intent), 2);
    const saved = await f.own(2, mode);
    assert.ok(saved.ballot.submittedAt);
    assert.deepEqual(saved.ballot.picks, picks);
    assert.equal(await f.own(2, mode === 'guess_total' ? 'guess_spread' : 'guess_total'), undefined);
  });
});

test('availability audit: failed collections exhaust the shared daily cap without submitting a saved draft', { skip }, async t => {
  const f = await fixture(t); await f.enable();
  await f.save(f.intent({ submit: false }));
  const intent = f.intent({ revision: 1 }), before = await f.own();
  for (let attempt = 0; attempt < 4; attempt++) {
    await f.db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '16 minutes'");
    const job = await f.begin(id(970 + attempt), intent);
    assert.equal((await f.finish(job, null, { quota: {}, error: 'ODDS_TIMEOUT' })).status, 'failed');
  }
  await f.db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '16 minutes'");
  const exhausted = await f.budget();
  assert.equal(exhausted.conservative_remaining, 492);
  await assert.rejects(() => f.begin(id(975), intent), /GTL_ODDS_DAILY_LIMIT/);
  assert.deepEqual(await f.budget(), exhausted);
  assert.deepEqual(await f.check(intent), { requiresReferences: true, ready: false });
  await assert.rejects(() => f.save(intent), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.deepEqual(await f.own(), before);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_market_snapshots')).rows[0].n, 0);
});

test('fresh submission migration preserves historical state and has no browser privileges', { skip }, async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows, f.beforeMigration);
  for (const role of ['anon', 'authenticated']) {
    for (const signature of ['gtl_submission_intent_context(uuid,jsonb)', 'gtl_preflight_submission(uuid,jsonb)', 'gtl_guard_fresh_submission()', 'gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text)', 'gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)']) {
      assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false);
    }
    await assert.rejects(() => f.as(role, 'select * from public.gtl_submission_odds_intents'), /permission denied/);
  }
  assert.equal((await f.db.query("select relrowsecurity from pg_class where relname='gtl_submission_odds_intents'")).rows[0].relrowsecurity, true);
  assert.equal((await f.db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and prosecdef")).rows[0].n, 0);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_submission_odds_intents set intent=intent'), /permission denied/);
});

test('preflight validates member, revision, whole ballot and deadline before spending or showing data', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const before = await f.budget();
  assert.deepEqual(await f.check(), { requiresReferences: true, ready: false });
  for (const patch of [{ mode: 'betting_challenge' }, { picks: {} }, { picks: { ...f.full(), madeup: -3 } }, { picks: f.full(-3.3) }, { revision: 1 }, { userId: id(1) }, { revision: null }, { submit: 'true' }]) {
    await assert.rejects(() => f.begin(id(900), f.intent(patch)), /GTL_/);
  }
  await assert.rejects(() => f.check(f.intent(), 4), /GTL_FORBIDDEN/);
  assert.deepEqual(await f.budget(), before);
  await f.db.exec("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb(extract(epoch from now()-interval '1 minute')))");
  await assert.rejects(() => f.check(), /GTL_SLATE_CONFLICT/);
  assert.deepEqual(await f.budget(), before);
});

test('reservation rechecks deadline and new references after initial preflight before spending', { skip }, async t => {
  // PGlite is one backend: inject the state transition immediately after the
  // real initial preflight. This tests the SQL race window, not lock scheduling.
  for (const transition of ['deadline', 'fresh references']) await t.test(transition, async t => {
    const f = await fixture(t); await f.enable();
    await f.db.exec('create table public.test_submission_transition(payload jsonb not null)');
    await f.db.query('insert into public.test_submission_transition values($1)', [payload(f.state.games)]);
    const effect = transition === 'deadline' ? `
      update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}',to_jsonb(clock_timestamp()-interval '1 minute'));
      update public.gtl_weekly_slates set signature=public.gtl_weekly_slate((select state from public.gtl_leagues where id='sean-troy-luke'));
    ` : `
      insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
        select v_request,'${id(1)}','collect','succeeded',gen_random_uuid(),clock_timestamp(),clock_timestamp()+interval '90 seconds',2,season,week,signature from public.gtl_weekly_slates;
      insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at)
        select v_request,s.season,s.week,s.signature,t.payload,(t.payload->>'fetchedAt')::timestamptz from public.gtl_weekly_slates s cross join public.test_submission_transition t;
    `;
    // Only the test hook is privileged, so production preflight still executes
    // with the original service role permissions.
    await f.db.exec(`
      create function public.test_after_submission_preflight() returns void language plpgsql security definer set search_path='' as $$
        declare v_request uuid:=gen_random_uuid(); begin ${effect} end $$;
      revoke all on function public.test_after_submission_preflight() from public,anon,authenticated;
      grant execute on function public.test_after_submission_preflight() to service_role;
      alter function public.gtl_preflight_submission(uuid,jsonb) rename to test_original_submission_preflight;
      create function public.gtl_preflight_submission(p_user uuid,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
        declare result jsonb; begin
          result:=public.test_original_submission_preflight(p_user,p_intent);
          if not (result->>'ready')::boolean then perform public.test_after_submission_preflight(); end if;
          return result;
        end $$;
      revoke all on function public.gtl_preflight_submission(uuid,jsonb) from public,anon,authenticated;
      grant execute on function public.gtl_preflight_submission(uuid,jsonb) to service_role;
    `);
    const before = await f.budget();
    await assert.rejects(() => f.begin(id(921)), transition === 'deadline' ? /GTL_PREDICTION_CLOSED/ : /GTL_ODDS_NOT_REQUIRED/);
    assert.deepEqual(await f.budget(), before);
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_odds_collections')).rows[0].n, 0);
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_submission_odds_intents')).rows[0].n, 0);
    assert.equal(await f.own(), undefined);
  });
});

test('failed full submission leaves saved draft, audit, revision and hidden market unchanged', { skip }, async t => {
  const f = await fixture(t);
  const draft = f.intent({ picks: { [f.state.games[0].id]: -4 }, submit: false });
  assert.deepEqual(await f.check(draft), { requiresReferences: false, ready: true });
  await assert.rejects(() => f.begin(id(901), draft), /GTL_ODDS_NOT_REQUIRED/);
  assert.equal(await f.save(draft), 1);
  const before = await f.own(); const x = f.intent({ revision: 1 });
  await assert.rejects(() => f.save(x), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.deepEqual(await f.own(), before);
  assert.equal((await f.rpc('gtl_read_weekly_state', [id(2), 'sean-troy-luke'])).revision, 1);
  await f.snapshot(payload(f.state.games, Date.now() - 600_000));
  assert.deepEqual(await f.check(x), { requiresReferences: true, ready: false });
  await assert.rejects(() => f.save(x), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.deepEqual(await f.own(), before);
});

test('available references pin sanitized book evidence; no-op and unchanged picks do not reanchor', { skip }, async t => {
  const f = await fixture(t); const first = f.state.games[0].id; const second = f.state.games[1].id;
  const snapshot = await f.snapshot(payload(f.state.games));
  assert.deepEqual(await f.check(), { requiresReferences: true, ready: true });
  await assert.rejects(() => f.begin(id(902)), /GTL_ODDS_NOT_REQUIRED/);
  assert.equal(await f.save(), 1);
  const original = (await f.own()).ballot;
  const ref = original.scoringReferences[first]; assert.equal(ref.snapshotId, snapshot);
  assert.equal(ref.value, -3.5); assert.equal(ref.quotes.length, 3);
  for (const quote of ref.quotes) assert.deepEqual(Object.keys(quote).sort(), ['book', 'collectedAt', 'observedAt', 'value']);
  assert.equal(JSON.stringify(ref).includes('unsafeExtra'), false);
  assert.deepEqual(await f.check(f.intent({ revision: 1 })), { requiresReferences: false, ready: true });
  assert.equal(await f.save(f.intent({ revision: 1 })), 2);
  assert.deepEqual((await f.own()).ballot.scoringReferences, original.scoringReferences);
  const newer = await f.snapshot(payload(f.state.games, Date.now() - 100, -7.5));
  const edit = f.intent({ revision: 2, picks: { ...f.full(), [first]: -7 }, submit: false });
  assert.equal(await f.save(edit), 3);
  const changed = (await f.own()).ballot;
  assert.equal(changed.submittedAt, original.submittedAt); assert.equal(changed.scoringReferences[first].snapshotId, newer);
  assert.deepEqual(changed.scoringReferences[second], original.scoringReferences[second]);
  assert.equal(await f.own(2, 'guess_total'), undefined);
});

test('partial fresh slate cannot submit partially or reveal; tampered receipts cannot write', { skip }, async t => {
  const f = await fixture(t); const data = payload(f.state.games);
  data.games[0].markets.spread.quotes = [];
  await f.snapshot(data);
  assert.deepEqual(await f.check(), { requiresReferences: true, ready: false });
  await assert.rejects(() => f.save(), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.equal(await f.own(), undefined);
  await f.snapshot(payload(f.state.games, Date.now() - 50)); await f.save();
  const before = await f.own(); const game = f.state.games[0].id;
  const tampered = structuredClone(before.ballot); tampered.scoringReferences[game].quotes[0].value = 99;
  await assert.rejects(() => f.as('service_role', 'update public.gtl_weekly_ballots set ballot=$1 where user_id=$2 and mode=$3', [tampered, id(2), 'guess_spread']), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.deepEqual(await f.own(), before);
});

test('ordinary member collection uses its own intent and global quota; no commissioner impersonation', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const request = id(903); const x = f.intent();
  await assert.rejects(() => f.rpc('gtl_begin_odds_collection', [id(2), id(950), 'collect']), /GTL_ODDS_FORBIDDEN/);
  const job = await f.begin(request, x); assert.equal(job.replay, false);
  assert.deepEqual(job.games, f.state.games.map(({ id, home, away, kickoff }) => ({ id, home, away, kickoff })));
  assert.equal((await f.budget()).conservative_remaining, 498);
  assert.equal((await f.begin(request, x)).replay, true);
  await assert.rejects(() => f.begin(request, f.intent({ picks: f.full(-4) })), /GTL_ODDS_REQUEST_CONFLICT/);
  await assert.rejects(() => f.begin(request, x, 3), /GTL_ODDS_REQUEST_CONFLICT/);
  await assert.rejects(() => f.begin(id(904), x, 3), /GTL_ODDS_BUSY/);
  await assert.rejects(() => f.finish(job, payload(f.state.games), { who: 3 }), /GTL_ODDS_REQUEST/);
  const done = await f.finish(job, payload(f.state.games)); assert.equal(done.status, 'succeeded'); assert.equal(done.availableQuotes, 90);
  assert.equal((await f.budget()).lease_token, null);
  assert.deepEqual(await f.check(), { requiresReferences: true, ready: true });
  assert.equal(await f.save(), 1);
  assert.equal((await f.begin(request, x)).replay, true);
  assert.deepEqual(await f.finish(job, null), done);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_market_snapshots')).rows[0].n, 1);
});

test('provider failure spends only its reservation, releases lease, and leaves ballots unsubmitted', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const job = await f.begin(id(905));
  const result = await f.finish(job, null, { quota: {}, error: 'ODDS_TIMEOUT' });
  assert.equal(result.status, 'failed'); assert.equal(result.snapshotId, null);
  assert.equal((await f.budget()).conservative_remaining, 498); assert.equal((await f.budget()).lease_token, null);
  assert.equal(await f.own(), undefined);
  await assert.rejects(() => f.save(), /GTL_SUBMISSION_ODDS_REQUIRED/);
  await assert.rejects(() => f.begin(id(906)), /GTL_ODDS_COOLDOWN/);
});

test('future source clocks cannot persist snapshots that projections must permanently reject', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const job = await f.begin(id(922));
  const reserved = await f.budget();
  const futureFetch = payload(f.state.games); futureFetch.fetchedAt = iso(Date.now() + 4000);
  await assert.rejects(() => f.finish(job, futureFetch), /GTL_ODDS_PAYLOAD/);
  const futureQuote = payload(f.state.games); futureQuote.games[0].markets.spread.quotes[0].collectedAt = iso(Date.now() + 4000);
  await assert.rejects(() => f.finish(job, futureQuote), /GTL_ODDS_PAYLOAD/);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_market_snapshots')).rows[0].n, 0);
  assert.deepEqual(await f.budget(), reserved);
  assert.equal(await f.own(), undefined);
  const failed = await f.finish(job, null, { quota: {}, error: 'ODDS_PAYLOAD' });
  assert.equal(failed.status, 'failed'); assert.equal(failed.snapshotId, null);
  assert.equal((await f.budget()).lease_token, null);
  assert.equal((await f.budget()).conservative_remaining, 498);
});

test('intent revision changing during provider work discards result without creating a snapshot', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const job = await f.begin(id(907));
  await f.save(f.intent({ submit: false, picks: { [f.state.games[0].id]: -6 } }));
  const before = await f.own(); const result = await f.finish(job, payload(f.state.games));
  assert.equal(result.status, 'failed'); assert.equal(result.errorCode, 'ODDS_SUBMISSION_CHANGED');
  assert.equal(result.snapshotId, null); assert.deepEqual(await f.own(), before); assert.equal((await f.budget()).lease_token, null);
  await assert.rejects(() => f.save(), /GTL_WEEKLY_CONFLICT/);
});

test('expired deadline blocks reservation and completion; removed member cannot publish collection', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const job = await f.begin(id(918));
  await f.db.query('update public.gtl_memberships set active=false where user_id=$1', [id(2)]);
  const result = await f.finish(job, payload(f.state.games));
  assert.equal(result.status, 'failed'); assert.equal(result.errorCode, 'ODDS_SUBMISSION_CHANGED');
  assert.equal(result.snapshotId, null); assert.equal((await f.budget()).lease_token, null);
  await f.db.exec("update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}',to_jsonb(now()-interval '1 minute')); update public.gtl_weekly_slates set signature=public.gtl_weekly_slate((select state from public.gtl_leagues where id='sean-troy-luke'))");
  const before = await f.budget();
  await assert.rejects(() => f.begin(id(919), f.intent(), 3), /GTL_PREDICTION_CLOSED/);
  assert.deepEqual(await f.budget(), before);
});

test('two saves with one expected revision commit only one ballot and its matching audit', { skip }, async t => {
  const f = await fixture(t); await f.snapshot(payload(f.state.games));
  const results = await Promise.allSettled([f.save(), f.save(f.intent({ picks: f.full(-4) }))]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.match(results.find(x => x.status === 'rejected').reason.message, /GTL_WEEKLY_CONFLICT/);
  const saved = await f.own(); assert.equal(saved.audit.length, 1);
  assert.deepEqual(saved.audit[0].after, saved.ballot.picks);
  assert.deepEqual(saved.audit[0].afterScoringReferences, saved.ballot.scoringReferences);
});

test('shared reserve and daily cap remain enforced; serialized conflicting calls reserve once', { skip }, async t => {
  const f = await fixture(t); await f.enable();
  await f.db.exec('update public.gtl_odds_budget set conservative_remaining=51');
  await assert.rejects(() => f.begin(id(908)), /GTL_ODDS_BUDGET/);
  await f.enable();
  const calls = await Promise.allSettled([f.begin(id(909)), f.begin(id(910), f.intent(), 3)]);
  assert.equal(calls.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await f.budget()).conservative_remaining, 498);
  await f.finish(calls.find(x => x.status === 'fulfilled').value, null, { who: calls[0].status === 'fulfilled' ? 2 : 3, error: 'ODDS_TIMEOUT', quota: {} });
  for (let n = 0; n < 3; n++) await f.snapshot(payload(f.state.games, Date.now() - 600_000));
  await f.db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '20 minutes'");
  await assert.rejects(() => f.begin(id(911)), /GTL_ODDS_DAILY_LIMIT/);
  assert.equal((await f.budget()).conservative_remaining, 498);
});

test('expired lease is not refunded; a later caller can reserve within the existing guards', { skip }, async t => {
  const f = await fixture(t); await f.enable(); const job = await f.begin(id(912));
  await f.db.exec("update public.gtl_odds_budget set lease_until=now()-interval '1 second',last_collection_at=now()-interval '20 minutes'; update public.gtl_odds_collections set expires_at=now()-interval '1 second'");
  await assert.rejects(() => f.finish(job, payload(f.state.games)), /GTL_ODDS_LEASE/);
  await f.begin(id(913), f.intent(), 3);
  assert.equal((await f.budget()).conservative_remaining, 496);
  assert.equal((await f.db.query('select status from public.gtl_odds_collections where id=$1', [job.requestId])).rows[0].status, 'failed');
});

test('personal full submission has identical atomic guard and dedicated collection without league membership', { skip }, async t => {
  const f = await fixture(t); await f.enable();
  const intent = { season: 2026, week: 5, mode: 'guess_spread', revision: 0, picks: f.full(), submit: true, personalRevision: 0, requestId: id(914) };
  const body = ({ personalRevision, revision, ...x }) => ({ ...x, revision: personalRevision, weeklyRevision: revision });
  assert.deepEqual(await f.check(intent, 4), { requiresReferences: true, ready: false });
  await assert.rejects(() => f.rpc('gtl_mutate_personal', [id(4), 'personal/ballot', body(intent)]), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.equal(await f.own(4), undefined);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_personal_events where user_id=$1', [id(4)])).rows[0].n, 0);
  const job = await f.begin(id(915), intent, 4);
  assert.equal((await f.finish(job, payload(f.state.games), { who: 4 })).status, 'succeeded');
  const result = await f.rpc('gtl_mutate_personal', [id(4), 'personal/ballot', body(intent)]);
  assert.equal(result.saved, true); assert.equal((await f.own(4)).ballot.scoringReferences[f.state.games[0].id].quotes.length, 3);
  assert.deepEqual(await f.check(intent, 4), { requiresReferences: false, ready: true });
  assert.deepEqual(await f.rpc('gtl_mutate_personal', [id(4), 'personal/ballot', body(intent)]), result);
  await assert.rejects(() => f.check({ ...intent, picks: f.full(-5) }, 4), /GTL_PERSONAL_RETRY_CONFLICT/);
});

test('preflight operation has zero reservation and can bootstrap measured quota for the same valid intent', { skip }, async t => {
  const f = await fixture(t); const job = await f.begin(id(916), f.intent(), 2, 'preflight');
  assert.equal((await f.budget()).conservative_remaining, null);
  const data = payload(f.state.games); data.games.forEach(g => { delete g.markets; });
  const result = await f.finish(job, data, { quota: { remaining: 496, used: 4, last: 0 } });
  assert.equal(result.status, 'succeeded'); assert.equal(result.snapshotId, null);
  assert.equal((await f.budget()).conservative_remaining, 496);
  const collect = await f.begin(id(917)); assert.equal(collect.operation, 'collect');
  assert.equal((await f.budget()).conservative_remaining, 494);
});
