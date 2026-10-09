import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createEngine } from '../server/engine.mjs';
import { applyReviewedResults, handleResultReview, providerResultError } from '../cloud/results.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Disposable local runtime only. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const files = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql',
  '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008225607_gtl_reviewed_final_results.sql'];
test('reviewed final results persist with commissioner authorization, immutable corrections and canonical Challenge grading', { skip: PGlite ? false : 'Local PGlite absent; never contacts hosted database.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${files[0]}`, 'utf8'));
  const original = seed(), now = Date.now(), iso = stamp => new Date(stamp).toISOString();
  original.league.deadline = iso(now - 5 * 3600000);
  original.games.forEach((game, i) => { game.kickoff = iso(now + (i ? 3600000 : -4 * 3600000)); });
  const game = original.games[0];
  original.bets.sean = { [game.id]: { id: 'fixture-selection', gameId: game.id, market: 'spread', side: 'home', line: -3, odds: -110,
    source: 'Fixture', quotedAt: iso(now - 5 * 3600000), selectedAt: iso(now - 5 * 3600000 + 1000), verification: 'Fixture only' } };
  await db.query('insert into auth.users values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [original]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')", [id(1), id(2)]);
  for (const file of files.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const body = { requestId: id(100), season: 2026, week: 5, gameId: game.id, home: 27, away: 24, source: 'NFL final scoreboard fixture',
    sourceURL: 'https://example.com/final-score-fixture', observedAt: iso(now - 60000), expectedVersion: 0, reason: 'Commissioner reviewed final score receipt' };
  const review = (value = body, actor = id(1), role = 'service_role') => as(role, 'select public.gtl_review_final_result($1,$2) value', [actor, value]).then(result => result.rows[0].value);
  const read = (actor = id(1), role = 'service_role') => as(role, "select public.gtl_read_reviewed_results($1,'sean-troy-luke') value", [actor]).then(result => result.rows[0].value);
  let resultsOffline = false;
  const handler = createCloudHandler({ clock: Date.now,
    authenticate: async token => ({ id: token === 'member' ? id(2) : token === 'outsider' ? id(3) : id(1), email: 'fixture@example.invalid', emailConfirmed: true, is_anonymous: false }),
    storage: { membership: async actor => (await db.query("select player_id,role,active from public.gtl_memberships where user_id=$1 and league_id='sean-troy-luke'", [actor])).rows[0] || null },
    weekly: { load: async actor => (await as('service_role', "select public.gtl_read_weekly_state($1,'sean-troy-luke') value", [actor])).rows[0].value },
    results: {
      review: async (actor, value) => { try { return await review(value, actor); } catch (error) { throw providerResultError(error.message); } },
      read: async actor => { if (resultsOffline) throw new Error('private unavailable fixture'); return read(actor); },
    },
  });
  const request = (path, body, token = 'commissioner') => handler(new Request(`https://fixture.invalid${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const before = { ballots: (await db.query('select * from public.gtl_weekly_ballots')).rows, selections: (await db.query('select * from public.gtl_weekly_selections')).rows };
  await t.test('only original commissioner and canonical final inputs can persist a result', async () => {
    for (const role of ['anon', 'authenticated']) { await assert.rejects(() => review(body, id(1), role), /permission denied/); await assert.rejects(() => read(id(1), role), /permission denied/); }
    for (const actor of [id(2), id(3)]) await assert.rejects(() => review(body, actor), /GTL_ODDS_FORBIDDEN/);
    for (const token of ['member', 'outsider']) assert.equal((await request('/results/review', body, token)).status, 403);
    await assert.rejects(() => read(id(3)), /GTL_FORBIDDEN/);
    for (const patch of [{ home: -1 }, { away: 2.5 }, { sourceURL: 'http://example.com' }, { expectedVersion: null }, { status: 'void' },
      { observedAt: iso(now + 100000) }, { gameId: original.games[1].id }, { gameId: 'NO-GAME' }]) await assert.rejects(() => review({ ...body, ...patch }), /GTL_RESULT_INPUT/);
    await assert.rejects(() => review({ ...body, week: 6 }), /GTL_SLATE_CONFLICT/);
    assert.deepEqual((await read()).games, {});
  });
  await t.test('explicit reviewed ordinary final grades the existing exact selection and preserves picks', async () => {
    const response = await request('/results/review', body); assert.equal(response.status, 200);
    const output = await response.json();
    assert.equal(output.version, 1); assert.equal(output.replayed, false); assert.equal(output.status, 'final');
    const document = await read(); assert.equal(document.games[game.id].reviewType, 'commissioner_reported');
    const hydrated = applyReviewedResults(original, document, Date.now());
    const view = createEngine(hydrated).view('sean', 'betting_challenge');
    assert.equal(view.games[0].bet.result, 'P'); assert.deepEqual(view.standings.find(row => row.id === 'sean').betRecord, { W: 0, L: 0, P: 1 });
    const ownView = await (await request('/state?mode=betting_challenge')).json();
    assert.equal(ownView.resultServiceStatus, 'available'); assert.equal(ownView.resultReview.games[game.id].version, 1);
    assert.equal(ownView.games[0].bet.result, 'P');
    const memberView = await (await request('/state?mode=betting_challenge', undefined, 'member')).json();
    assert.equal(memberView.resultReview, undefined); assert.equal(memberView.games[0].bet, null);
    assert.equal(memberView.standings.find(row => row.id === 'sean').betRecord.P, 1);
    assert.deepEqual(original.results, {}); assert.deepEqual(hydrated.ballots, original.ballots);
    assert.equal((await review()).replayed, true);
    await assert.rejects(() => review({ ...body, home: 28 }), /GTL_RESULT_REQUEST_CONFLICT/);
  });
  await t.test('corrections append a new version, regrade once, and service cannot rewrite audit history', async () => {
    await assert.rejects(() => review({ ...body, requestId: id(101), home: 28 }), /GTL_RESULT_CONFLICT/);
    const correction = { ...body, requestId: id(102), expectedVersion: 1, home: 28, reason: 'Publisher corrected its reported final score' };
    const response = await request('/results/review', correction); assert.equal(response.status, 200); assert.equal((await response.json()).version, 2);
    const history = (await db.query('select version,result,previous_result from public.gtl_reviewed_result_events order by version')).rows;
    assert.equal(history.length, 2); assert.equal(history[0].result.home, 27); assert.equal(history[1].previous_result.home, 27);
    const view = createEngine(applyReviewedResults(original, await read(), Date.now())).view('sean', 'betting_challenge');
    assert.equal(view.games[0].bet.result, 'W'); assert.deepEqual(view.standings.find(row => row.id === 'sean').betRecord, { W: 1, L: 0, P: 0 });
    for (const command of ['update public.gtl_reviewed_result_events set version=99', 'delete from public.gtl_reviewed_result_events']) await assert.rejects(() => as('service_role', command), /permission denied/);
    assert.deepEqual((await db.query('select * from public.gtl_weekly_ballots')).rows, before.ballots);
    assert.deepEqual((await db.query('select * from public.gtl_weekly_selections')).rows, before.selections);
    assert.equal(providerResultError('GTL_RESULT_CONFLICT').status, 409);
  });
  await t.test('failed result reads suppress obsolete grades without modifying versioned ledger or selections', async () => {
    const savedLedger = (await db.query('select * from public.gtl_reviewed_result_events order by version')).rows;
    resultsOffline = true;
    const response = await request('/state?mode=betting_challenge'); assert.equal(response.status, 200);
    const pending = await response.json(); assert.equal(pending.resultServiceStatus, 'unavailable');
    assert.equal(pending.games[0].bet.result, null); assert.deepEqual(pending.resultReview.games, {}); assert.equal(pending.resultReview.available, false);
    assert.deepEqual(pending.standings.find(row => row.id === 'sean').betRecord, { W: 0, L: 0, P: 0 });
    assert.deepEqual((await db.query('select * from public.gtl_reviewed_result_events order by version')).rows, savedLedger);
    resultsOffline = false;
    const restored = await (await request('/state?mode=betting_challenge')).json(); assert.equal(restored.games[0].bet.result, 'W'); assert.equal(restored.resultReview.games[game.id].version, 2);
  });
  await t.test('projection rejects wrong scope, reschedules, non-finals and future reviews', async () => {
    const good = await read();
    for (const patch of [{ reviewType: 'automatic' }, { status: 'void' }, { homeTeam: 'Wrong' }, { scheduledKickoff: iso(now - 1) }, { reviewedAt: iso(now + 100000) }]) {
      const bad = structuredClone(good); Object.assign(bad.games[game.id], patch);
      assert.deepEqual(applyReviewedResults(original, bad, Date.now()).results, {});
    }
    assert.equal(applyReviewedResults(original, { ...good, week: 6 }, now), original);
  });
});
