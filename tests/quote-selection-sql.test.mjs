import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { buildQuoteReceipt } from '../cloud/quote-receipt.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { providerWeeklyError } from '../cloud/weekly.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Local runtime only. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const files = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql',
  '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008224735_gtl_reviewed_quote_selections.sql'];
test('provider selection SQL validates real stored evidence atomically and preserves weekly locks', { skip: PGlite ? false : 'Local PGlite missing; hosted database is never used.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${files[0]}`, 'utf8'));
  const original = seed(), now = Date.now(), at = new Date(now - 1000).toISOString();
  original.league.deadline = new Date(now + 3600000).toISOString();
  original.games.forEach((game, i) => { game.kickoff = new Date(now + 3600000 + i * 1000).toISOString(); });
  await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [original]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(1)]);
  for (const file of files.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const signature = (await db.query('select signature from public.gtl_weekly_slates')).rows[0].signature;
  const game = original.games[0], quote = { provider: 'the-odds-api', providerEventId: 'fixture-event', book: 'draftkings', market: 'spread', value: -3,
    providerObservedAt: at, collectedAt: at, outcomes: { home: { line: -3, odds: -110 }, away: { line: 3, odds: 100 } } };
  const snap = { id: id(100), createdAt: at, payload: { games: [{ gameId: game.id, ...game, matchStatus: 'matched', providerEventId: 'fixture-event', markets: { spread: { quotes: [quote] } } }] } };
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [snap.id, id(1), id(101), signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [snap.id, signature, snap.payload, at]);
  const receipt = buildQuoteReceipt(snap, game, 'spread', 'draftkings', 'away', now);
  assert(receipt);
  const selection = { gameId: game.id, market: 'spread', side: 'away', line: 3, odds: 100, source: 'DraftKings', quotedAt: at, quoteReceipt: receipt };
  const as = (role, sql, args) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const save = (value = selection, revision = 0, user = id(1), role = 'service_role') => as(role, "select public.gtl_save_weekly_selection($1,'sean-troy-luke',$2,$3) value", [user, revision, value]);
  const before = (await db.query('select * from public.gtl_weekly_ballots')).rows;
  await t.test('browser roles, strangers, hidden Total and receipt tampering are rejected without writes', async () => {
    for (const role of ['anon', 'authenticated']) await assert.rejects(() => save(selection, 0, id(1), role), /permission denied/);
    await assert.rejects(() => save(selection, 0, id(2)), /GTL_FORBIDDEN/);
    await assert.rejects(() => save({ ...selection, market: 'total', side: 'over', line: 44 }), /GTL_MATCHING_BALLOT_REQUIRED/);
    for (const patch of [{ line: 4 }, { odds: -120 }, { source: 'Invented' }, { quotedAt: new Date(now - 2000).toISOString() },
      { quoteReceipt: { ...receipt, snapshotId: id(999) } }, { quoteReceipt: { ...receipt, providerEventId: 'wrong' } }]) {
      await assert.rejects(() => save({ ...selection, ...patch }), /GTL_QUOTE_REVIEW_REQUIRED/);
    }
    assert.equal((await db.query('select count(*) from public.gtl_weekly_selections')).rows[0].count, 0);
  });
  await t.test('stale or unpaired source records require a new review', async () => {
    const invalid = structuredClone(snap.payload); invalid.games[0].markets.spread.quotes[0].outcomes.home.line = -4;
    await db.query('update public.gtl_market_snapshots set payload=$1 where id=$2', [invalid, snap.id]);
    await assert.rejects(() => save(), /GTL_QUOTE_REVIEW_REQUIRED/);
    invalid.games[0].markets.spread.quotes[0] = { ...quote, providerObservedAt: new Date(now - 600000).toISOString() };
    await db.query('update public.gtl_market_snapshots set payload=$1 where id=$2', [invalid, snap.id]);
    await assert.rejects(() => save(), /GTL_QUOTE_REVIEW_REQUIRED/);
    await db.query('update public.gtl_market_snapshots set payload=$1 where id=$2', [snap.payload, snap.id]);
  });
  await t.test('canonical recorded receipt persists once, keeps timestamps and never overwrites ballots', async () => {
    const handler = createCloudHandler({ clock: () => Date.now(),
      authenticate: async () => ({ id: id(1), email: 'fixture@example.invalid', emailConfirmed: true, is_anonymous: false }),
      storage: { membership: async () => ({ player_id: 'sean', role: 'commissioner', active: true }) },
      odds: { marketSnapshot: async () => snap },
      weekly: {
        load: async () => (await as('service_role', "select public.gtl_read_weekly_state($1,'sean-troy-luke') value", [id(1)])).rows[0].value,
        saveSelection: async (_user, _league, revision, body) => { try { return (await save(body, revision)).rows[0].value; } catch (error) { throw providerWeeklyError(error.message); } },
      },
    });
    const url = 'https://test.invalid/functions/v1/gtl-api';
    const state = await handler(new Request(`${url}/state?mode=betting_challenge`, { headers: { Authorization: 'Bearer fixture' } }));
    assert.equal(state.status, 200);
    const review = (await state.json()).games[0].quoteReceipts;
    assert.equal(review.length, 2); assert(review.every(row => row.market === 'spread'));
    const response = await handler(new Request(`${url}/bet`, { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selection, revision: 0 }) }));
    assert.equal(response.status, 200);
    const savedView = await response.json();
    assert.equal(savedView.games[0].bet.quoteReceipt.book, 'draftkings'); assert.equal(savedView.revision, 1);
    const saved = (await db.query('select selection,audit from public.gtl_weekly_selections')).rows[0];
    assert.equal(saved.selection.line, 3); assert.equal(saved.selection.quoteReceipt.snapshotId, snap.id);
    assert.equal(saved.selection.quoteReceipt.book, 'draftkings'); assert.equal(saved.selection.quoteReceipt.tradability, 'not_confirmed');
    assert.equal(saved.selection.verification, 'Recorded provider quote; tradability not confirmed');
    assert.equal(saved.selection.selectedAt, saved.selection.enteredAt); assert(Date.parse(saved.selection.selectedAt) >= now);
    assert.equal(Date.parse(saved.selection.quoteReceipt.quotedAt), Date.parse(at));
    assert.deepEqual(saved.audit[0].after, saved.selection);
    await assert.rejects(() => save(selection, 1), /GTL_SELECTION_LOCKED/);
    await assert.rejects(() => save(), /GTL_WEEKLY_CONFLICT/);
    assert.deepEqual((await db.query('select * from public.gtl_weekly_ballots')).rows, before);
    assert.equal((await db.query("select has_function_privilege('anon','public.gtl_save_weekly_selection(uuid,text,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
  });
});
