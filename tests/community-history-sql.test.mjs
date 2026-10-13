import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { accuracy, round } from '../server/domain.mjs';
import { handleCommunity, providerCommunityError } from '../cloud/community.mjs';
import { buildRuledImport, RPC as RULED_RPC } from '../scripts/import-ruled-ballot.mjs';

// Community history (Sean's October 12, 2026 ruling) on the real migrations and local PGlite.
// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = n => new Date(n).toISOString();
const at = value => Date.parse(value);
const MIGRATION = '20261012223000_gtl_community_history.sql';
// Every repo migration in filename order except the two that install pg_cron/pg_net (hosted-only extensions).
const MIGRATIONS = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !/scheduler_extension/.test(f)).sort();
const SEAN = 30, TROY = 1, LUKE = 4, BEN = 2, NEW = 3;
const HOUR = 3_600_000;
const RPCS = ['gtl_pick_points(numeric,numeric)', 'gtl_history_reference(integer,integer,jsonb,jsonb,text,timestamptz)', 'gtl_read_community_history(uuid,integer,timestamptz)'];

/** A 3-book collection payload for the slate (the fresh-submission fixture shape), captured at `captured`. */
function payload(games, captured, spread = -3.5, total = 44.5) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), games: games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries([['spread', spread], ['total', total]].map(([market, line]) => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line,
      timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 1000),
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }])),
  })) };
}

test('community history: every player, week and market with the line at each guess and its points; nothing invented, nothing hidden beyond the D-23 gate', { skip }, async t => {
  // Membership and order only: later files (D-27's 20261012230000, the line-at-guess reads 20261013010000, other branches') follow it.
  assert.ok(MIGRATIONS.includes(MIGRATION), 'the history migration is a repo file');
  for (const later of ['20261012230000_gtl_submit_with_line_at_guess.sql', '20261013010000_gtl_line_at_guess_reads.sql']) {
    assert.ok(MIGRATIONS.indexOf(MIGRATION) < MIGRATIONS.indexOf(later), `${later} applies after the history migration`);
  }
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  // The Week 5 slate from the seed with an open window (deadline two hours ahead, kickoffs after it) so a D-16 save can run;
  // Sean's seed Spread ballot is migrated by 20261008182836 exactly as the hosted group-league rows were (picks, submittedAt,
  // no scoringReferences, provenance {leagueId, playerId, migration: true}).
  const state = seed(), now = Date.now();
  state.league.deadline = iso(now + 2 * HOUR); state.games.forEach((g, i) => { g.kickoff = iso(now + (3 + i) * HOUR); });
  const gameIds = state.games.map(g => g.id);
  const full = value => Object.fromEntries(gameIds.map(g => [g, value]));
  const troyTotalAt = iso(now - HOUR);
  let before;
  for (const file of MIGRATIONS) {
    if (file === MIGRATION) before = (await db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows;
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
      for (const n of [SEAN, TROY, LUKE, BEN, NEW]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(SEAN), id(TROY), id(LUKE)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy'),($3,'Luke'),($4,'Ben 🫘')", [id(SEAN), id(TROY), id(LUKE), id(BEN)]);
    if (file === '20261008182836_gtl_canonical_weekly_entries.sql') {
      // Troy's migrated-shape Total ballot, written before the fresh-submission guard exists, the way the hosted Week 5 rows predate it.
      await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [id(TROY)]);
      await db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,provenance) values($1,2026,5,$2,$3::jsonb,$4::jsonb,$5::jsonb)', [id(TROY), 'guess_total',
        JSON.stringify({ picks: full(44), submittedAt: troyTotalAt }),
        JSON.stringify([{ id: 'legacy-1', player: 'troy', mode: 'guess_total', type: 'ballot_submitted', timestamp: troyTotalAt, before: {}, after: full(44) }]),
        JSON.stringify([{ leagueId: 'sean-troy-luke', playerId: 'troy', migration: true }])]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const call = async (tx, name, args) => (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  const rpc = (name, args) => db.transaction(async tx => { await tx.exec('set local role service_role'); return call(tx, name, args); });
  const service = { rpc: async (name, args) => { try { return await rpc(name, args); } catch (error) { throw providerCommunityError(error.message); } } };
  const user = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const history = (n, clock = now, body = {}) => handleCommunity({ route: '/community/history', body, user: user(n), service, clock: () => clock });
  const read = (n, clock = now) => handleCommunity({ route: '/community/read', body: {}, user: user(n), service, clock: () => clock });
  const week5 = h => h.weeks.find(w => w.season === 2026 && w.week === 5);
  const entry = (h, n, mode) => week5(h).entries.find(e => e.userId === id(n) && e.mode === mode);
  const signature = async () => (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
  let serial = 500;
  const snapshot = async (captured, spread = -3.5, total = 44.5) => {
    const key = id(++serial), data = payload(state.games, captured, spread, total), sig = await signature();
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [key, id(SEAN), id(serial + 1000), sig]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [key, sig, data, iso(captured)]);
    return key;
  };

  await t.test('the migration leaves every ballot row as it was; browser roles cannot call the readers and nothing is security definer', async () => {
    assert.deepEqual((await db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows, before);
    assert.equal(before.length, 2, 'Sean\'s migrated Spread ballot and Troy\'s migrated Total ballot');
    for (const role of ['anon', 'authenticated']) {
      for (const signature of RPCS) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
      await assert.rejects(() => as(role, 'select public.gtl_read_community_history($1,null,null)', [id(TROY)]), /permission denied/);
      await assert.rejects(() => as(role, 'select public.gtl_pick_points(-3,-3.5)'), /permission denied/);
    }
    for (const signature of RPCS) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true);
    assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and prosecdef")).rows[0].n, 0);
    // The standings expression, rounded per pick like accuracy().
    const points = (await db.query('select public.gtl_pick_points(-3,-3.5) a,public.gtl_pick_points(-9.5,-9.3) b,public.gtl_pick_points(0,10) c,public.gtl_pick_points(44,null) d,public.gtl_pick_points(47.5,44.5) e')).rows[0];
    assert.deepEqual([Number(points.a), Number(points.b), Number(points.c), points.d, Number(points.e)], [accuracy(-3, -3.5), accuracy(-9.5, -9.3), 0, null, accuracy(47.5, 44.5)]);
  });

  await t.test('membership gate and strict bodies', async () => {
    await assert.rejects(() => history(NEW), error => error.status === 403, 'no profile means no community and no history');
    for (const body of [{ week: 5 }, { season: '2026' }, { season: 1999 }, { season: 2026, extra: 1 }]) await assert.rejects(() => history(TROY, now, body), error => error.status === 400, JSON.stringify(body));
    const h = await history(TROY, now, { season: 2026 });
    assert.deepEqual([h.viewer, h.season, h.seasons, h.weeks.map(w => w.week)], [id(TROY), 2026, [2026], [5]]);
    assert.deepEqual((await history(TROY, now, { season: 2025 })).weeks, [], 'a season without slates is an empty list, not an error');
    assert.deepEqual(h.members.map(m => [m.displayName, m.removed]), [['Ben 🫘', false], ['Luke', false], ['Sean', false], ['Troy', false]]);
    const w = week5(h);
    assert.deepEqual([w.closed, at(w.deadline), w.games.length, w.games[0].id, w.games[0].away, w.games[0].home, w.games[0].awayCode, w.games[0].homeCode, at(w.games[0].kickoff)],
      [false, at(state.league.deadline), 15, 'TB-DAL', 'Tampa Bay Buccaneers', 'Dallas Cowboys', 'TB', 'DAL', at(state.games[0].kickoff)], 'full names from the schedule template, kickoff order');
    assert.deepEqual(w.results, {}, 'no final recorded yet');
  });

  let early, late, troyRow;
  await t.test('a migrated ballot without a saved line is scored against the line at its guess (D-27 order); a ballot without its original submission time is compared at its stored submittedAt, labelled', async () => {
    troyRow = (await db.query('select ballot,audit,provenance,origin_practice from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(TROY), 'guess_total'])).rows[0];
    early = await snapshot(now - 2 * HOUR, -4, 44.5);
    late = await snapshot(now - HOUR / 2, -6, 41);
    const troy = entry(await history(TROY), TROY, 'guess_total');
    assert.deepEqual([troy.status, at(troy.submittedAt), troy.submittedAtKnown, troy.updatedAt, troy.revisions, troy.provenance, troy.scoringPolicy, troy.ruling, troy.picksHidden, troy.eligible, troy.eligibility, troy.weekPoints, troy.weekScored, troy.games],
      ['submitted', at(troyTotalAt), true, null, 0, 'migrated-league', null, null, false, true, 'standard', 15 * accuracy(44, 44.5), 15, 15], 'the legacy ballot_submitted event is the submission, not a revision');
    assert.equal(troy.picks.length, 15);
    for (const pick of troy.picks) {
      assert.deepEqual([pick.guess, pick.points, pick.scorable], [44, accuracy(44, 44.5), true], 'the line at the guess scores');
      const ref = pick.reference;
      assert.deepEqual([ref.basis, ref.label, ref.rule, ref.origin, ref.status, ref.value, ref.source, ref.bookCount, ref.snapshotId, ref.sourceFile, ref.gapSeconds, at(ref.capturedAt), at(ref.observedAt), at(ref.guessedAt)],
        ['line-at-guess', 'line at guess', 'newest-at-or-before', 'hosted-snapshot', 'available', 44.5, 'The Odds API · 3-book median', 3, early, null, 3601, now - 2 * HOUR, now - 2 * HOUR - 1000, at(troyTotalAt)],
        'the newest line stored at or before the guess, not the one collected after it');
    }
    const standings = (await read(TROY)).standings.find(x => x.userId === id(TROY) && x.mode === 'guess_total');
    assert.deepEqual([standings.weekPoints, standings.weekScored, standings.seasonPoints, standings.weeksSubmitted], [troy.weekPoints, 15, troy.weekPoints, 1], 'the leaderboard reads the same rows');
    // Sean's seed Spread ballot records that its original submission time is unavailable (its submittedAt is the eDraft page time it
    // was seeded with). It is compared at that stored submittedAt, kept as stored (D-16), and each line says so: nothing was stored
    // before it, so the first line stored after it (the early collection) is the line at the guess.
    const seanBallot = state.ballots.sean.guess_spread;
    const sean = entry(await history(SEAN), SEAN, 'guess_spread');
    assert.deepEqual([sean.status, at(sean.submittedAt), sean.submittedAtKnown, sean.revisions, sean.provenance, sean.scoringPolicy, sean.weekPoints, sean.weekScored],
      ['submitted', at(seanBallot.submittedAt), false, 0, 'migrated-league', null, round(gameIds.reduce((sum, g) => sum + accuracy(seanBallot.picks[g], -4), 0)), 15]);
    assert.deepEqual(sean.picks.map(p => p.gameId), gameIds, 'every slate game, in kickoff order');
    assert.equal(sean.picks[0].guess, seanBallot.picks['TB-DAL']);
    for (const pick of sean.picks) {
      const ref = pick.reference;
      assert.deepEqual([pick.points, pick.scorable, ref.basis, ref.rule, ref.origin, ref.snapshotId, ref.value, at(ref.guessedAt), ref.guessedAtKnown, ref.gapSeconds],
        [accuracy(pick.guess, -4), true, 'line-at-guess', 'first-after-submission', 'hosted-snapshot', early, -4, at(seanBallot.submittedAt), false, Math.floor((at(seanBallot.submittedAt) - (now - 2 * HOUR - 1000)) / 1000)],
        'the line at the stored submission time, labelled; no other instant is invented');
    }
    // Snapshots existed before the guess but none carried a usable line for the game: the newest of them is named, not the next collection.
    const sig = await signature(), stray = { id: 'XX-YY', home: 'Nowhere', away: 'Elsewhere', homeCode: 'YY', awayCode: 'XX', kickoff: iso(now + 9 * HOUR) };
    const reference = submitted => rpc('gtl_history_reference', { p_season: 2026, p_week: 5, p_signature: sig, p_game: stray, p_market: 'spread', p_submitted: iso(submitted) });
    const notQualifying = await reference(now - HOUR);
    assert.deepEqual([notQualifying.basis, notQualifying.label, notQualifying.status, notQualifying.value, notQualifying.reason, notQualifying.detail, at(notQualifying.priorSnapshotAt), notQualifying.nextSnapshotAt],
      ['none', 'no line stored', 'unavailable', null, 'snapshot-not-qualifying', 'no complete 3-book line for this game', now - 2 * HOUR, null], 'the earlier snapshot is named with why it did not qualify');
    const beforeAny = await reference(now - 3 * HOUR);
    assert.deepEqual([beforeAny.reason, beforeAny.detail, beforeAny.priorSnapshotAt, at(beforeAny.nextSnapshotAt)], ['no-prior-snapshot', null, null, now - 2 * HOUR], 'no earlier snapshot: the first later one is the context');
    assert.equal(entry(await history(SEAN), SEAN, 'guess_total'), undefined, 'no Total ballot is simply no entry');
  });

  await t.test('a D-16 submission scores against the line saved with each guess; per-pick points match accuracy() and the leaderboard', async () => {
    const fresh = await snapshot(now - 1000);
    assert.equal(await rpc('gtl_save_weekly_ballot', { p_user: id(TROY), p_league: 'sean-troy-luke', p_mode: 'guess_spread', p_revision: 0, p_picks: full(-3), p_submit: true }), 1);
    const troy = entry(await history(TROY), TROY, 'guess_spread');
    assert.deepEqual([troy.status, troy.provenance, troy.scoringPolicy, troy.revisions, troy.picksHidden, troy.weekScored, troy.games], ['submitted', 'group', 'submission-time', 0, false, 15, 15], 'submitting is not a revision');
    assert.ok(troy.submittedAt && at(troy.submittedAt) > now - HOUR);
    assert.equal(at(troy.updatedAt), at(troy.submittedAt), 'the owner sees the last change');
    for (const pick of troy.picks) {
      assert.deepEqual([pick.guess, pick.points, pick.scorable], [-3, accuracy(-3, -3.5), true]);
      const ref = pick.reference;
      assert.deepEqual([ref.basis, ref.label, ref.status, ref.value, ref.source, ref.snapshotId, ref.decision, at(ref.observedAt)], ['saved', 'line saved with guess', 'available', -3.5, 'The Odds API · 3-book median', fresh, null, now - 2000]);
      assert.equal(at(ref.savedAt), at(troy.submittedAt), 'the reference is the one saved with the guess');
    }
    const expected = round(troy.picks.reduce((sum, p) => sum + accuracy(p.guess, p.reference.value), 0));
    assert.equal(troy.weekPoints, expected);
    const standings = (await read(TROY)).standings.find(x => x.userId === id(TROY) && x.mode === 'guess_spread');
    assert.deepEqual([standings.weekPoints, standings.weekScored], [troy.weekPoints, troy.weekScored], 'the history total is the leaderboard total');
  });

  await t.test('D-23 reveal gate: another member sees no guesses, lines or per-pick points for an open market until they submit it or sit out; totals are shared as on the leaderboard', async () => {
    let luke = await history(LUKE);
    assert.deepEqual(week5(luke).revealed, { guess_spread: false, guess_total: false });
    const spread = entry(luke, TROY, 'guess_spread'), total = entry(luke, TROY, 'guess_total');
    assert.deepEqual([spread.picksHidden, spread.picks, spread.weekPoints, spread.weekScored, spread.status, at(spread.submittedAt) > 0], [true, null, 135, 15, 'submitted', true]);
    assert.deepEqual([total.picksHidden, total.picks], [true, null]);
    assert.ok(!JSON.stringify(luke).includes('"guess":'), 'no guess value anywhere in the hidden payload');
    assert.equal(entry(luke, LUKE, 'guess_spread'), undefined, 'nothing of Luke\'s yet');
    const satOut = await handleCommunity({ route: '/community/sit-out', body: { season: 2026, week: 5, mode: 'guess_total' }, user: user(LUKE), service, clock: () => now });
    assert.equal(satOut.satOut, true);
    luke = await history(LUKE);
    assert.deepEqual(week5(luke).revealed, { guess_spread: false, guess_total: true });
    assert.deepEqual([entry(luke, TROY, 'guess_spread').picksHidden, entry(luke, TROY, 'guess_spread').picks], [true, null], 'sitting out Total reveals Total only');
    const revealed = entry(luke, TROY, 'guess_total');
    assert.deepEqual([revealed.picksHidden, revealed.picks.length, revealed.picks[0].guess, revealed.picks[0].reference.basis, revealed.picks[0].reference.value, revealed.picks[0].points], [false, 15, 44, 'line-at-guess', 44.5, accuracy(44, 44.5)]);
    const own = entry(luke, LUKE, 'guess_total');
    assert.deepEqual([own.status, own.picksHidden, own.picks, own.weekPoints, own.weekScored, at(own.satOutAt)], ['sat_out', false, null, 0, 0, now], 'a sat-out week is recorded as sat out, not zero');
    const troy = await history(TROY);
    assert.deepEqual([entry(troy, TROY, 'guess_spread').picksHidden, entry(troy, SEAN, 'guess_spread').picksHidden, entry(troy, TROY, 'guess_total').picksHidden], [false, false, false], 'own submission reveals that market for everyone');
    const closed = await history(LUKE, at(state.league.deadline));
    assert.deepEqual([week5(closed).closed, week5(closed).revealed, entry(closed, TROY, 'guess_spread').picksHidden, entry(closed, TROY, 'guess_spread').picks.length], [true, { guess_spread: true, guess_total: true }, false, 15], 'the deadline reveals every market');
    // A draft is the owner's alone and never scores.
    await rpc('gtl_save_weekly_ballot', { p_user: id(LUKE), p_league: 'sean-troy-luke', p_mode: 'guess_spread', p_revision: 0, p_picks: { 'TB-DAL': -7 }, p_submit: false });
    const draft = entry(await history(LUKE), LUKE, 'guess_spread');
    assert.deepEqual([draft.status, draft.picksHidden, draft.picks.length, draft.picks[0].guess, draft.picks[0].reference, draft.picks[0].points, draft.picks[1].guess, draft.weekPoints, draft.weekScored], ['draft', false, 15, -7, null, null, null, 0, 0]);
    assert.equal(entry(await history(TROY), LUKE, 'guess_spread'), undefined, 'another member never sees a draft');
    assert.deepEqual((await read(TROY)).submissions.filter(s => s.userId === id(LUKE)).map(s => s.mode), ['guess_total'], 'the feed still lists only the opt-out');
  });

  await t.test('revisions are the edits after submitting, never draft saves or the submission; the count, the last change and the origin are the owner\'s alone', async () => {
    const before = entry(await history(TROY), TROY, 'guess_spread');
    assert.deepEqual([before.revisions, at(before.updatedAt)], [0, at(before.submittedAt)]);
    // Troy re-submits with one pick changed: the original submission time is kept (D-16) and the change is one ballot_edited event.
    assert.equal(await rpc('gtl_save_weekly_ballot', { p_user: id(TROY), p_league: 'sean-troy-luke', p_mode: 'guess_spread', p_revision: 1, p_picks: { ...full(-3), [gameIds[0]]: -4 }, p_submit: true }), 2);
    const audit = (await db.query('select audit from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(TROY), 'guess_spread'])).rows[0].audit;
    assert.deepEqual(audit.map(e => e.type), ['ballot_submitted', 'ballot_edited']);
    const troy = entry(await history(TROY), TROY, 'guess_spread');
    assert.deepEqual([troy.revisions, troy.provenance, at(troy.submittedAt), at(troy.updatedAt) > at(troy.submittedAt), troy.picks[0].guess, troy.picks[0].points, troy.weekPoints],
      [1, 'group', at(before.submittedAt), true, -4, accuracy(-4, -3.5), 135]);
    // Luke has neither submitted Spread nor sat out, so Troy's Spread stays hidden; Troy's Total is revealed. Either way the fields
    // derived from the private audit and provenance columns are null for another member, as the group reader and the feed keep them.
    const luke = await history(LUKE);
    const hidden = entry(luke, TROY, 'guess_spread'), revealed = entry(luke, TROY, 'guess_total');
    assert.deepEqual([hidden.picksHidden, hidden.status, at(hidden.submittedAt), hidden.revisions, hidden.provenance, hidden.updatedAt], [true, 'submitted', at(troy.submittedAt), null, null, null], 'the submission time is shared as on the feed; nothing else');
    assert.deepEqual([revealed.picksHidden, revealed.picks.length, revealed.revisions, revealed.provenance, revealed.updatedAt], [false, 15, null, null, null]);
    for (const e of week5(luke).entries.filter(e => e.userId !== id(LUKE))) assert.deepEqual([e.revisions, e.provenance, e.updatedAt], [null, null, null], `${e.userId} ${e.mode}`);
    assert.ok(!JSON.stringify(week5(luke).entries.filter(e => e.userId !== id(LUKE))).includes('migrated-league'), 'no provenance reaches another member');
  });

  await t.test('a draft that is then sat out reads sat out, once, for its owner and everyone else; the draft row is untouched (D-23)', async () => {
    const row = async () => (await db.query('select ballot,audit,provenance from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(LUKE), 'guess_spread'])).rows[0];
    const draftRow = await row();
    assert.equal(draftRow.ballot.submittedAt ?? null, null, 'Luke\'s Spread is a draft');
    assert.deepEqual(week5(await history(LUKE)).entries.filter(e => e.userId === id(LUKE) && e.mode === 'guess_spread').map(e => e.status), ['draft']);
    const satOut = await handleCommunity({ route: '/community/sit-out', body: { season: 2026, week: 5, mode: 'guess_spread' }, user: user(LUKE), service, clock: () => now + 1000 });
    assert.deepEqual([satOut.satOut, satOut.replayed], [true, false], 'a draft does not block sitting out');
    const luke = await history(LUKE);
    const own = week5(luke).entries.filter(e => e.userId === id(LUKE) && e.mode === 'guess_spread');
    assert.equal(own.length, 1, 'one entry per member and market');
    assert.deepEqual([own[0].status, own[0].picks, own[0].weekPoints, own[0].weekScored, at(own[0].satOutAt)], ['sat_out', null, 0, 0, now + 1000], 'the final sit-out wins over the draft saved before it');
    assert.deepEqual(await row(), draftRow, 'the draft stays stored exactly as it was');
    assert.deepEqual(week5(luke).revealed, { guess_spread: true, guess_total: true });
    assert.deepEqual([entry(luke, TROY, 'guess_spread').picksHidden, entry(luke, TROY, 'guess_spread').revisions], [false, null], 'sitting out reveals Troy\'s Spread guesses; the revision count stays Troy\'s own');
    assert.deepEqual((await read(LUKE)).submissions.filter(s => s.userId === id(LUKE)).map(s => [s.mode, s.satOut]), [['guess_spread', true], ['guess_total', true]], 'the feed agrees');
    assert.deepEqual(week5(await history(TROY)).entries.filter(e => e.userId === id(LUKE) && e.mode === 'guess_spread').map(e => e.status), ['sat_out'], 'another member sees the sat-out status, never the draft');
  });

  await t.test('results: the latest settlement version per game, a commissioner-reported final as the fallback, each labelled; absent otherwise', async () => {
    await db.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,source_url,observed_at,settled_at) values(2026,5,$1,1,'final',24,20,'test finals (nflverse games.csv)','https://example.invalid/games.csv',$2,$2),(2026,5,$1,2,'final',27,24,'test finals (nflverse games.csv)','https://example.invalid/games.csv',$3,$3)", [gameIds[0], iso(now - 600_000), iso(now - 300_000)]);
    await db.query("insert into public.gtl_reviewed_result_events(season,week,game_id,version,actor_id,request_id,payload,result,reviewed_at) values(2026,5,$1,1,$2,$3,'{}',$4::jsonb,$5)",
      [gameIds[1], id(SEAN), id(777), JSON.stringify({ status: 'final', home: 30, away: 20, source: 'Commissioner', sourceURL: 'https://example.invalid/final', observedAt: iso(now - 200_000), reviewedAt: iso(now - 100_000), reviewType: 'commissioner_reported' }), iso(now - 100_000)]);
    const { results } = week5(await history(LUKE));
    assert.deepEqual(Object.keys(results).sort(), [gameIds[0], gameIds[1]].sort());
    assert.deepEqual(results[gameIds[0]], { status: 'final', home: 27, away: 24, source: 'test finals (nflverse games.csv)', observedAt: results[gameIds[0]].observedAt, settledAt: results[gameIds[0]].settledAt, origin: 'settlement' }, 'the latest version wins');
    assert.equal(at(results[gameIds[0]].settledAt), now - 300_000);
    assert.deepEqual([results[gameIds[1]].status, results[gameIds[1]].home, results[gameIds[1]].away, results[gameIds[1]].source, results[gameIds[1]].origin, at(results[gameIds[1]].settledAt)], ['final', 30, 20, 'Commissioner', 'commissioner_reported', now - 100_000]);
  });

  await t.test('a commissioner-ruled ballot (D-25) shows the ruled line, its decision and the ruled points; a missing Total ballot is simply absent', async () => {
    // Close the week so the ruled path opens (the import refuses an open week), keeping the snapshots on the slate.
    const original = seed();
    await db.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb($1::double precision)) where season=2026 and week=5", [at(original.league.deadline) / 1000]);
    await db.query('update public.gtl_market_snapshots set slate_signature=(select signature from public.gtl_weekly_slates where season=2026 and week=5)');
    const { payload: ruled, summary } = buildRuledImport({ user: id(BEN), actor: id(SEAN) });
    const imported = await rpc(RULED_RPC, ruled);
    assert.deepEqual([imported.imported, imported.references], [true, 15]);
    const luke = await history(LUKE);
    assert.equal(week5(luke).closed, true);
    const ben = entry(luke, BEN, 'guess_spread');
    assert.deepEqual([ben.status, ben.provenance, ben.scoringPolicy, ben.ruling, ben.revisions, ben.updatedAt, ben.picksHidden, at(ben.submittedAt), ben.weekPoints, ben.weekScored],
      ['submitted', null, 'submission-time', { decision: 'D-25', basis: 'commissioner-ruled' }, null, null, false, at(ruled.p_submitted_at), summary.expectedPoints, 15], 'the ruling is shared; the origin and revisions are Ben\'s own');
    assert.equal(ben.weekPoints, 37.6);
    const bensOwn = entry(await history(BEN), BEN, 'guess_spread');
    assert.deepEqual([bensOwn.provenance, bensOwn.revisions, bensOwn.ruling], ['community-import', 0, ben.ruling], 'written once by the import (one ballot_submitted event): never revised');
    for (const pick of ben.picks) {
      const ruledValue = ruled.p_reference.values[pick.gameId];
      assert.deepEqual([pick.guess, pick.reference.basis, pick.reference.label, pick.reference.status, pick.reference.value, pick.reference.decision, pick.reference.snapshotId, pick.reference.source, pick.points, pick.scorable],
        [ruled.p_picks[pick.gameId], 'commissioner-ruled', 'commissioner-ruled line', 'available', ruledValue, 'D-25', null, ruled.p_reference.source, accuracy(ruled.p_picks[pick.gameId], ruledValue), true]);
    }
    assert.equal(round(ben.picks.reduce((sum, p) => sum + p.points, 0)), ben.weekPoints, 'per-pick points, rounded like accuracy(), sum to the week total');
    assert.equal(entry(luke, BEN, 'guess_total'), undefined, 'Ben has no Week 5 Total ballot: no entry, no error');
    const standings = (await read(LUKE)).standings.find(x => x.userId === id(BEN) && x.mode === 'guess_spread');
    assert.deepEqual([standings.weekPoints, standings.weekScored], [37.6, 15]);
    // The migrated ballot still reads the line at its guess after the ruling, and its row is exactly as stored: nothing was backfilled.
    const troy = entry(luke, TROY, 'guess_total');
    assert.deepEqual([troy.weekPoints, troy.weekScored, troy.picks[0].reference.basis, troy.picks[0].reference.snapshotId, troy.picks[0].points], [15 * accuracy(44, 44.5), 15, 'line-at-guess', early, accuracy(44, 44.5)]);
    assert.ok(late && troy.picks.every(p => p.reference.snapshotId !== late), 'the later snapshot was never chosen');
    assert.deepEqual((await db.query('select ballot,audit,provenance,origin_practice from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [id(TROY), 'guess_total'])).rows[0], troyRow);
  });
});
