import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createEngine } from '../server/engine.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip when the local runtime is absent. */ }
const skip = PGlite ? false : 'Optional local PGlite absent; no hosted database tests.';
const migration = fs.readFileSync('supabase/migrations/20261008225401_gtl_submission_time_scoring.sql', 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = stamp => new Date(stamp).toISOString();
const base = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql'];
function payload(games, captured, spread = -3.5, total = 44.5) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(captured), games: games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries([['spread', spread], ['total', total]].map(([market, value]) => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value,
      timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 10_000),
      outcomes: market === 'spread' ? { home: { line: value, odds: -110 }, away: { line: -value, odds: -110 } }
        : { over: { line: value, odds: -110 }, under: { line: value, odds: -110 } },
    })) }])),
  })) };
}
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${base[0]}`, 'utf8'));
  const state = seed(); state.league.deadline = iso(Date.now() + 3600_000);
  state.games.forEach((game, i) => { game.kickoff = iso(Date.now() + 3600_000 + i * 3600_000); });
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [state]);
  await db.query('insert into auth.users values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(1), id(2), id(3)]);
  for (const file of base.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const original = (await db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows;
  await db.exec(migration);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const signature = (await db.query('select signature from public.gtl_weekly_slates')).rows[0].signature;
  let serial = 100;
  async function snapshot(data) {
    const key = id(++serial);
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [key, id(1), id(serial + 1000), signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [key, signature, data, data.fetchedAt]);
    return key;
  }
  const save = (who, mode, revision, picks, submit = true) => rpc('gtl_save_weekly_ballot', [id(who), 'sean-troy-luke', mode, revision, picks, submit]);
  const read = async who => (await rpc('gtl_read_weekly_state', [id(who), 'sean-troy-luke']));
  const own = async (who, mode) => (await db.query('select ballot,audit from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(who), mode])).rows[0];
  const full = value => Object.fromEntries(state.games.map(g => [g.id, value]));
  return { db, as, rpc, state, original, snapshot, save, read, own, full };
}

test('submission-time SQL captures source evidence atomically and preserves prior records', { skip }, async t => {
  const f = await fixture(t);
  const firstGame = f.state.games[0].id, secondGame = f.state.games[1].id;
  await t.test('migration leaves historical ballots unchanged and reference capture is service-only', async () => {
    assert.deepEqual((await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows, f.original);
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['gtl_submission_reference(jsonb,jsonb,text,timestamptz)', 'gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean)', 'gtl_read_weekly_state(uuid,text)']) {
        assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok, false);
      }
    }
    assert.equal((await f.own(1, 'guess_spread')).ballot.scoringReferences, undefined);
  });
  const firstSnapshot = await f.snapshot(payload(f.state.games, Date.now() - 90_000));
  let first;
  await t.test('draft save has no references; submitted spreads and totals capture real named-book medians', async () => {
    assert.equal(await f.save(2, 'guess_spread', 0, { [firstGame]: -4 }, false), 1);
    assert.deepEqual((await f.own(2, 'guess_spread')).ballot.scoringReferences, {});
    assert.equal(await f.save(2, 'guess_spread', 1, f.full(-4)), 2);
    first = (await f.own(2, 'guess_spread')).ballot;
    assert.equal(first.scoringPolicy, 'submission-time');
    assert.equal(first.scoringReferences[firstGame].status, 'available');
    assert.equal(first.scoringReferences[firstGame].value, -3.5);
    assert.equal(first.scoringReferences[firstGame].snapshotId, firstSnapshot);
    const engineView = createEngine((await f.read(2)).state).view('troy');
    assert.equal(engineView.score, 135);
    assert(engineView.games.every(game => game.scoringReference.status === 'available' && game.points === 9));
    assert.ok(Date.parse(first.scoringReferences[firstGame].observedAt) <= Date.parse(first.scoringReferences[firstGame].savedAt));
    assert.equal(await f.save(2, 'guess_total', 2, f.full(45)), 3);
    assert.equal((await f.own(2, 'guess_total')).ballot.scoringReferences[firstGame].value, 44.5);
  });
  const secondSnapshot = await f.snapshot(payload(f.state.games, Date.now() - 30_000, -6.5, 47.5));
  await t.test('later feed changes and reads do not re-anchor; explicit edits change only edited references', async () => {
    assert.deepEqual((await f.own(2, 'guess_spread')).ballot, first);
    const edited = { ...first.picks, [firstGame]: -6 };
    assert.equal(await f.save(2, 'guess_spread', 3, edited, false), 4);
    const after = await f.own(2, 'guess_spread');
    assert.equal(after.ballot.submittedAt, first.submittedAt);
    assert.equal(after.ballot.scoringReferences[firstGame].snapshotId, secondSnapshot);
    assert.equal(after.ballot.scoringReferences[firstGame].value, -6.5);
    assert.deepEqual(after.ballot.scoringReferences[secondGame], first.scoringReferences[secondGame]);
    assert.equal(after.audit.at(-1).type, 'ballot_edited');
    assert.deepEqual(after.audit.at(-1).changedGameIds, [firstGame]);
    assert.deepEqual(after.audit.at(-1).beforeScoringReferences, first.scoringReferences);
    assert.equal(await f.save(2, 'guess_spread', 4, edited), 5);
    assert.deepEqual((await f.own(2, 'guess_spread')).ballot.scoringReferences, after.ballot.scoringReferences);
  });
  await t.test('submitted ballots cannot be cleared, stale revision cannot edit, and opponent refs are projected without private audit', async () => {
    await assert.rejects(() => f.save(2, 'guess_spread', 5, {} , false), /GTL_BALLOT_INCOMPLETE/);
    await assert.rejects(() => f.save(2, 'guess_spread', 4, f.full(-2)), /GTL_WEEKLY_CONFLICT/);
    const view = await f.read(1);
    assert.equal(view.state.ballots.troy.guess_spread.scoringReferences[firstGame].value, -6.5);
    assert.equal(view.state.ballots.troy.guess_spread.origin, undefined);
    assert.ok(view.state.audit.every(row => row.player === 'sean'));
  });
  await t.test('editing an old submitted ballot never fabricates references for untouched guesses', async () => {
    const legacy = (await f.own(1, 'guess_spread')).ballot;
    const next = { ...legacy.picks, [firstGame]: legacy.picks[firstGame] + .5 };
    assert.equal(await f.save(1, 'guess_spread', 0, next), 1);
    const revised = (await f.own(1, 'guess_spread')).ballot;
    assert.equal(revised.submittedAt, legacy.submittedAt);
    assert.equal(revised.origin, legacy.origin);
    assert.equal(revised.scoringReferences[firstGame].status, 'available');
    assert.equal(revised.scoringReferences[secondGame], undefined);
  });
});

test('submission reference validation rejects malformed, future, divergent, and mismatched evidence', { skip }, async t => {
  const f = await fixture(t); const stamp = Date.now(); const raw = payload(f.state.games, stamp - 30_000);
  const candidate = (data, market = 'spread') => f.rpc('gtl_submission_reference', [data, f.state.games[0], market, iso(stamp)]);
  assert.equal((await candidate(raw)).value, -3.5);
  const changes = [
    data => { data.fetchedAt = iso(stamp + 1); },
    data => { data.games[0].home = 'Wrong event'; },
    data => { data.games.push(data.games[0]); },
    data => { data.games[0].markets.spread.quotes[2].book = 'draftkings'; },
    data => { data.games[0].markets.spread.quotes[2].outcomes.away.line = 3; },
    data => { data.games[0].markets.spread.quotes[2].value = 40; data.games[0].markets.spread.quotes[2].outcomes = { home: { line: 40 }, away: { line: -40 } }; },
    data => { data.games[0].markets.spread.quotes[0].providerObservedAt = iso(stamp + 1); },
  ];
  for (const change of changes) { const data = structuredClone(raw); change(data); assert.equal(await candidate(data), null); }
  const invalidTotal = structuredClone(raw); invalidTotal.games[0].markets.total.quotes[1].outcomes.under.line = 99;
  assert.equal(await candidate(invalidTotal, 'total'), null);
  const stale = await candidate(payload(f.state.games, stamp - 3600_000));
  assert.equal(stale.status, 'stale'); assert.equal(stale.value, null);
});

test('absent or stale submission evidence stays unscored and is never backfilled by later reads', { skip }, async t => {
  const f = await fixture(t); const key = f.state.games[0].id;
  await f.save(2, 'guess_spread', 0, f.full(-4));
  const missing = (await f.own(2, 'guess_spread')).ballot;
  assert.equal(missing.scoringReferences[key].status, 'unavailable'); assert.equal(missing.scoringReferences[key].value, null);
  await f.snapshot(payload(f.state.games, Date.now() - 3600_000));
  await f.save(3, 'guess_total', 0, f.full(45));
  const stale = (await f.own(3, 'guess_total')).ballot;
  assert.equal(stale.scoringReferences[key].status, 'stale'); assert.equal(stale.scoringReferences[key].value, null);
  await f.snapshot(payload(f.state.games, Date.now() - 20_000));
  await f.read(2);
  assert.deepEqual((await f.own(2, 'guess_spread')).ballot, missing);
  assert.deepEqual((await f.own(3, 'guess_total')).ballot, stale);
});

test('weekly references are reused across groups, stale revisions fail, and deadline closes submitted edits', { skip }, async t => {
  const f = await fixture(t); const key = f.state.games[0].id;
  const group = 'g_44444444444444448444444444444444';
  const groupPlayer = `u_${id(2).replaceAll('-', '')}`;
  const state = { ...structuredClone(f.state), league: { ...f.state.league, id: group, roster: [{ id: groupPlayer, name: 'Fixture member' }] }, ballots: {}, bets: {}, audit: [] };
  await f.db.query("insert into public.gtl_leagues(id,state,created_by,format,max_members) values($1,$2,$3,'group',20)", [group, state, id(1)]);
  await f.db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,'player')", [id(2), group, groupPlayer]);
  await f.snapshot(payload(f.state.games, Date.now() - 60_000));
  await f.save(2, 'guess_spread', 0, f.full(-4));
  const initial = (await f.own(2, 'guess_spread')).ballot;
  const otherGroup = await f.rpc('gtl_read_weekly_state', [id(2), group]);
  assert.deepEqual(otherGroup.state.ballots[groupPlayer].guess_spread, initial);
  await assert.rejects(() => f.rpc('gtl_save_weekly_ballot', [id(2), group, 'guess_spread', 0, f.full(-5), true]), /GTL_WEEKLY_CONFLICT/);
  const changed = { ...initial.picks, [key]: -5 };
  await f.rpc('gtl_save_weekly_ballot', [id(2), group, 'guess_spread', 1, changed, false]);
  assert.deepEqual((await f.read(2)).state.ballots.troy.guess_spread.picks, changed);
  const before = await f.own(2, 'guess_spread');
  const closed = structuredClone(f.state); closed.league.deadline = iso(Date.now() - 1000);
  await f.db.query("update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}',$1) where id='sean-troy-luke'", [JSON.stringify(closed.league.deadline)]);
  await f.db.query('update public.gtl_weekly_slates set signature=public.gtl_weekly_slate($1)', [closed]);
  await assert.rejects(() => f.save(2, 'guess_spread', 2, f.full(-2)), /GTL_PREDICTION_CLOSED/);
  assert.deepEqual(await f.own(2, 'guess_spread'), before);
});
