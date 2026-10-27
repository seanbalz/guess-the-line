import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, APPLIED, HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { addOlderRecords, createHistoryWorld, STEVEN, STEVEN_PICKS } from './cloud-browser/history-world.mjs';
import { createCommunityWorld } from './cloud-browser/community-world.mjs';
import { assertNoLeak, pickSecrets, READER_MIGRATIONS, readerReply, withoutTimes } from './helpers/leak-scan.mjs';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';

// Redesign build plan stage 75, M-28 (20261026231000_gtl_me_export.sql): POST /me/export, through the real gtl-api handler on
// ALL and local PGlite with the Week 5 replay and the stored older records. Contracts:
// - the export is the signed-in account's own rows only: every section is the owner's, and no other account's pick, note,
//   journal, slip or post is in it (identity comes from sign-in; no field can name another account);
// - nothing is redacted from the owner (D-23): every revision, saved line, archived journal record and the Late marker (D-30);
// - push reminder devices (endpoints and keys) are never exported (D-28);
// - the function is service-only and writes nothing; existing routes answer as today while M-28 is missing.
const MIGRATION = '20261026231000_gtl_me_export.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const SECTIONS = ['format', 'ownerId', 'exportedAt', 'excluded', 'profile', 'communityRemoval', 'preferences', 'leagueInterest', 'memberships', 'ballots', 'sitOuts',
  'forfeits', 'eligibilityRulings', 'challengeSelections', 'virtualUnits', 'nbaTickets', 'realSlips', 'realSlipChanges', 'following', 'savedGames', 'forecasts', 'journal',
  'personalChanges', 'personalRequests', 'pointsGuesses', 'pointsChanges', 'posts', 'comments', 'likes', 'accessLog'];

test('M-28 is an applied, additive repo migration after M-27: one new service-only function, nothing replaced', () => {
  // Hosted as 20261027160732 on October 27, 2026 (RELEASE_2026_10_27_FEED_MIGRATIONS.md).
  assert.ok(ALL.includes(MIGRATION) && APPLIED.includes(version(MIGRATION)) && HOSTED.includes(MIGRATION));
  assert.ok(ALL.indexOf('20261026230000_gtl_me_history.sql') < ALL.indexOf(MIGRATION), 'M-28 applies after M-27');
  const own = catalog(readMigrations(ALL)).files.find(f => f.file === MIGRATION);
  assert.deepEqual(own.functions.map(fn => [fn.name, fn.replace, !!fn.previous]), [['gtl_export_me', false, false]]);
  assert.equal(READER_MIGRATIONS['/me/export'], undefined, 'hosted: its reader runs in every HOSTED leak scan');
});

test('/me/export: your own rows only, every revision and the Late marker kept, no push device, nothing written', { skip }, async t => {
  const world = await createHistoryWorld();
  t.after(() => world.db.close());
  await addOlderRecords(world);
  const { db } = world, luke = ACCOUNTS.luke.id, sean = ACCOUNTS.sean.id;
  // A push device for Luke: its endpoint and keys must never leave the server.
  await db.query("insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values('https://fcm.googleapis.com/fcm/send/luke-device-secret',$1,$2,$3)", [luke, `B${'L'.repeat(86)}`, 'K'.repeat(22)]);
  // Luke comments on Sean's post and likes it; Sean comments too.
  const post = (await db.query("select id from public.gtl_feed_posts where actor_id=$1 order by created_at limit 1", [sean])).rows[0]?.id
    ?? (await db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key) values($1,'joined',$2) returning id", [sean, `joined-fixture:${sean}`])).rows[0].id;
  await db.query("insert into public.gtl_feed_comments(post_id,user_id,request_id,body) values($1,$2,$3,'Luke fixture comment'),($1,$4,$5,'Sean fixture comment')", [post, luke, randomUUID(), sean, randomUUID()]);
  await db.query('insert into public.gtl_feed_likes(post_id,user_id) values($1,$2)', [post, luke]);
  const before = (await db.query("select string_agg(to_jsonb(b)::text,'|' order by b.user_id,b.mode) t from public.gtl_weekly_ballots b")).rows[0].t;

  const exported = async who => { const r = await world.api(who, 'me/export', {}); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
  const lukes = await exported('luke');

  await t.test('the sections, the owner and the format', () => {
    assert.deepEqual(Object.keys(lukes).sort(), [...SECTIONS].sort());
    assert.deepEqual([lukes.format, lukes.ownerId, lukes.profile.displayName], ['gtl-account-export-v1', luke, 'Luke Fixture']);
    assert.match(lukes.excluded.join(' '), /Push reminder devices/);
  });

  await t.test('your own ballots in full: every revision, the saved lines and the Late marker (D-30)', () => {
    assert.deepEqual(lukes.ballots.map(b => [b.season, b.week, b.mode]), [[2026, 5, 'guess_total']]);
    const total = lukes.ballots[0];
    assert.deepEqual(total.late, { deadline: total.ballot.late.deadline, minutes: 12 });
    assert.deepEqual(total.ballot.lockedLate['PHI-JAX'].minutes, 12);
    assert.equal(total.audit.length, 3, 'every stored revision');
    assert.equal(total.ballot.scoringReferences['PHI-JAX'].value, 46.5);
    assert.deepEqual(lukes.forfeits.map(f => [f.week, f.reason]), [[5, 'reveal']]);
    assert.deepEqual(lukes.sitOuts.map(o => o.mode), ['guess_spread']);
    assert.deepEqual(lukes.challengeSelections.map(s => s.gameId), ['TB-DAL']);
    assert.deepEqual(lukes.virtualUnits.map(v => [v.gameId, v.status]), [['SF-SEA', 'loss']]);
    assert.deepEqual(lukes.comments.map(c => c.body), ['Luke fixture comment']);
    assert.deepEqual(lukes.likes.map(l => l.postId), [post]);
  });

  await t.test('nothing of another account: no other pick, note, journal, slip, comment or ruling approver', () => {
    const text = withoutTimes(JSON.stringify(lukes));
    for (const secret of ['Dallas at home after the bye.', 'Wind check before kickoff.', 'Small play.', 'Lean the road side.', 'Took it early.', 'Sean fixture comment', 'luke-device-secret', 'KKKKKKKK']) {
      assert.ok(!text.includes(secret), secret);
    }
    // The reply's root names its owner; strip it so the scan reads every section (readerReply), not the whole reply as own.
    assertNoLeak(readerReply(lukes), { viewer: luke, secrets: pickSecrets(STEVEN_PICKS, { market: 'spread', owner: STEVEN.name }).filter(s => !Number.isInteger(s.value)) }, '/me/export luke');
    assert.deepEqual(lukes.realSlips, [], 'Troy\'s slip is his');
    assert.deepEqual(lukes.savedGames, []);
  });

  await t.test('Sean\'s export holds his own private records, archived journal record included, with every change', async () => {
    const seans = await exported('sean');
    assert.deepEqual(seans.savedGames.map(f => [f.gameId, f.saved, f.note]), [['SF-SEA', false, 'Wind check before kickoff.'], ['TB-DAL', true, 'Dallas at home after the bye.']]);
    assert.deepEqual(seans.forecasts.map(f => [f.gameId, f.value, f.revision]), [['BUF-LAR', 49.5, 2]]);
    assert.deepEqual(seans.journal.map(j => [j.gameId, j.archived]).sort(), [['SF-SEA', false], ['TB-DAL', true]]);
    assert.ok(seans.personalChanges.some(e => e.action === 'journal/archive' && e.reason === 'Recorded twice by mistake'));
    assert.deepEqual(seans.ballots.map(b => b.mode), ['guess_spread']);
    assert.deepEqual(seans.eligibilityRulings.map(r => [r.week, r.mode, r.eligible]), [[5, 'guess_spread', true]]);
    assert.ok(seans.eligibilityRulings.every(r => !('approvedBy' in r) && !('approved_by' in r)));
    assert.deepEqual(seans.comments.map(c => c.body), ['Sean fixture comment']);
    const troy = await exported('troy');
    assert.deepEqual(troy.realSlips.map(s => s.entry.legs[0].selection), ['DAL -8.5']);
    assert.ok(troy.realSlipChanges.length >= 2, 'the slip and its settlement');
    assert.ok(!withoutTimes(JSON.stringify(troy)).includes('Dallas at home'), 'Troy reads none of Sean\'s notes');
  });

  await t.test('no request can name another account; the function is service-only; reading writes nothing', async () => {
    for (const body of [{ userId: sean }, { ownerId: sean }, { season: 2026 }]) assert.equal((await world.api('luke', 'me/export', body)).status, 400, JSON.stringify(body));
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query(`select has_function_privilege('${role}','public.gtl_export_me(uuid,timestamptz)','execute') ok`)).rows[0].ok, false, role);
    assert.equal((await db.query("select count(*)::int n from pg_proc where proname='gtl_export_me'")).rows[0].n, 1);
    assert.equal((await db.query("select string_agg(to_jsonb(b)::text,'|' order by b.user_id,b.mode) t from public.gtl_weekly_ballots b")).rows[0].t, before);
  });
});

test('while M-28 is missing (the hosted schema before its October 27 apply), the old group-week /export and every other route answer as today; /me/export is unavailable', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED.filter(file => file < MIGRATION), groupScreens: true });
  t.after(() => world.db.close());
  assert.equal((await world.api('luke', 'export')).status, 200);
  assert.equal((await world.api('luke', 'me/preferences', {})).status, 200);
  assert.equal((await world.api('luke', 'me/export', {})).status, 503);
});
