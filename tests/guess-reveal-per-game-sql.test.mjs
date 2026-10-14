import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets, READERS } from './helpers/leak-scan.mjs';
import { accuracy } from '../server/domain.mjs';
import { sendBallot, serviceSql, storeLines } from './helpers/guess-week.mjs';

// Redesign build plan stage 16, M-01 (20261014160000_gtl_guess_gate_per_game.sql): one Guess reveal gate per game and market
// (D-39 per-game lock-in, D-31 kickoff, D-23 sit-out). Runs on ALL (the hosted project does not have M-01 yet), through the
// real handler and on the raw readers, on local PGlite only. Fixture accounts and values only, never real player data.
//
// The week: four games; the first kicks off at the deadline (as Thursday's game does), the rest an hour apart. Troy sends
// Spread and Total, Luke sends Total only, Sean sits out Spread and keeps a Total draft. Every pick and line is an unusual
// half point, and no two share a size within a market (a spread matches either sign), so the leak scan can name each one.
const MIGRATION = '20261014160000_gtl_guess_gate_per_game.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const HOUR = 3_600_000;
const LINES = { spread: [-11.5, 13.5, 6.5, -9.5], total: [58.5, 31.5, 52.5, 36.5] };
const TROY = { spread: [-5.5, 2.5, 7.5, -12.5], total: [37.5, 61.5, 44.5, 49.5] };
const LUKE = { total: [33.5, 55.5, 47.5, 41.5] };
const SEAN = { total: [45.5, 39.5, 56.5, 29.5] };
const NEW_RPCS = ['gtl_guess_locked_in(uuid,integer,integer,text,text)', 'gtl_guess_revealed(uuid,integer,integer,text,text,timestamptz)',
  'gtl_markets_visible(uuid,integer,integer,timestamptz)', 'gtl_ballot_late(jsonb)'];
const REPLACED = ['gtl_week_revealed(uuid,integer,integer,text,timestamptz)', 'gtl_read_community(uuid,timestamptz,integer,timestamptz)',
  'gtl_read_community_history(uuid,integer,timestamptz)'];

test('M-01 is a repo file the hosted project does not have yet; its rollback restores the three bodies it replaces', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'listed in NOT_HOSTED until the apply record removes it (Gate M step 8)');
});

test('the per-game gate (M-01): a lock-in opens that game and market, a kickoff opens one game, a sit-out opens the market; drafts never show', { skip }, async t => {
  let clock = null;
  const world = await createCommunityWorld({ migrations: ALL, games: 4, troyBallots: false, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), sorted = [...ids].sort();
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const deadline = Date.parse(state.league.deadline), { season, week } = state.league;
  assert.equal(kickoff[0], deadline, 'the first game kicks off at the deadline');
  const id = name => ACCOUNTS[name].id;
  const iso = ms => new Date(ms).toISOString();
  const sql = serviceSql(db);
  const feed = (who, now) => sql('gtl_read_community', { p_user: id(who), p_before: null, p_limit: 100, p_now: iso(now) });
  const history = (who, now) => sql('gtl_read_community_history', { p_user: id(who), p_season: season, p_now: iso(now) });
  const revealed = (who, mode, game, now) => sql('gtl_guess_revealed', { p_user: id(who), p_season: season, p_week: week, p_mode: mode, p_game: game, p_now: iso(now) });
  const weekRevealed = (who, mode, now) => sql('gtl_week_revealed', { p_user: id(who), p_season: season, p_week: week, p_mode: mode, p_now: iso(now) });
  const visible = (who, now) => sql('gtl_markets_visible', { p_user: id(who), p_season: season, p_week: week, p_now: iso(now) });
  const post = (reply, who, mode) => reply.posts.find(p => p.kind === 'ballot_submitted' && p.actorId === id(who) && p.mode === mode);
  const entry = (reply, who, mode) => reply.weeks.find(w => w.season === season && w.week === week).entries.find(e => e.userId === id(who) && e.mode === mode);
  const standing = (reply, who, mode) => reply.standings.find(s => s.userId === id(who) && s.mode === mode);
  const send = (account, mode, picks, submit) => sendBallot(world, account, mode, picks, submit);
  const FIRST = kickoff[0], LAST = kickoff[3];
  assert.ok(Date.now() < deadline, 'the fixture week is open');

  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await send('troy', 'guess_spread', map(TROY.spread));
  await send('troy', 'guess_total', map(TROY.total));
  await send('luke', 'guess_total', map(LUKE.total));
  await send('sean', 'guess_total', map(SEAN.total), false);
  const satOut = await world.api('sean', 'community/sit-out', { season, week, mode: 'guess_spread' });
  assert.equal(satOut.status, 200, JSON.stringify(satOut.body));
  // "Now" for the reads: after every send (a post is dated at its submission), before the deadline.
  const NOW = Date.now();
  assert.ok(NOW < deadline);

  await t.test('the new functions are service-only and security invoker; the replaced ones keep their argument lists and grants', async () => {
    for (const signature of [...NEW_RPCS, ...REPLACED]) {
      for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
      const name = signature.split('(')[0];
      assert.deepEqual((await db.query('select prosecdef from pg_proc where proname=$1', [name])).rows, [{ prosecdef: false }], `${name}: one invoker function`);
    }
    await assert.rejects(() => db.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.query("select public.gtl_markets_visible($1,2026,5,null)", [id('luke')]); }), /permission denied/);
  });

  await t.test('gtl_guess_revealed and gtl_markets_visible: per game and market, for each viewer', async () => {
    for (const g of ids) {
      assert.equal(await revealed('luke', 'guess_spread', g, NOW), false, `Luke has not locked in Spread ${g}`);
      assert.equal(await revealed('luke', 'guess_total', g, NOW), true, `Luke locked in Total ${g}`);
      assert.equal(await revealed('sean', 'guess_spread', g, NOW), true, 'a sit-out opens the market');
      assert.equal(await revealed('sean', 'guess_total', g, NOW), false, 'a draft is not a lock-in');
    }
    assert.deepEqual(await visible('luke', NOW), Object.fromEntries(ids.map(g => [g, { spread: false, total: true }])));
    assert.deepEqual(await visible('sean', NOW), Object.fromEntries(ids.map(g => [g, { spread: true, total: false }])));
    // One kickoff opens one game, both markets, for everyone.
    assert.deepEqual(await visible('sean', FIRST), Object.fromEntries(ids.map((g, i) => [g, { spread: true, total: i === 0 }])));
    assert.deepEqual(await visible('luke', FIRST), Object.fromEntries(ids.map((g, i) => [g, { spread: i === 0, total: true }])));
    assert.deepEqual(await visible('luke', LAST), Object.fromEntries(ids.map(g => [g, { spread: true, total: true }])));
    // Unknown game, unknown mode, unknown week: closed.
    assert.equal(await revealed('luke', 'guess_total', 'XX-YY', NOW), false);
    assert.equal(await revealed('troy', 'betting_challenge', ids[0], LAST), false);
    assert.deepEqual(await sql('gtl_markets_visible', { p_user: id('luke'), p_season: 1999, p_week: 1, p_now: iso(NOW) }), {});
    // The lock-in itself: a pick in a submitted ballot.
    const locked = (who, mode, g) => sql('gtl_guess_locked_in', { p_user: id(who), p_season: season, p_week: week, p_mode: mode, p_game: g });
    assert.deepEqual([await locked('troy', 'guess_spread', ids[1]), await locked('luke', 'guess_spread', ids[1]), await locked('sean', 'guess_total', ids[1]), await locked('troy', 'guess_spread', 'XX-YY')],
      [true, false, false, false]);
  });

  await t.test('gtl_week_revealed: a sit-out or every game open; the deadline alone no longer opens the week', async () => {
    assert.deepEqual([await weekRevealed('luke', 'guess_spread', NOW), await weekRevealed('luke', 'guess_total', NOW)], [false, true], 'a full ballot locks in every game');
    assert.deepEqual([await weekRevealed('sean', 'guess_spread', NOW), await weekRevealed('sean', 'guess_total', NOW)], [true, false]);
    assert.deepEqual([await weekRevealed('troy', 'guess_spread', NOW), await weekRevealed('troy', 'guess_total', NOW)], [true, true]);
    assert.equal(await weekRevealed('luke', 'guess_spread', deadline), false, 'at the deadline only the first game has kicked off');
    assert.equal(await weekRevealed('luke', 'guess_spread', kickoff[2]), false);
    assert.equal(await weekRevealed('luke', 'guess_spread', LAST), true, 'the last kickoff opens the week');
    assert.equal(await weekRevealed('luke', 'betting_challenge', LAST), false);
  });

  await t.test('feed posts: another member\'s picks per game; picksHidden while any is hidden, with hiddenGames; own posts never redacted', async () => {
    const luke = await feed('luke', NOW);
    assert.deepEqual([post(luke, 'troy', 'guess_spread').picks, post(luke, 'troy', 'guess_spread').picksHidden, post(luke, 'troy', 'guess_spread').hiddenGames], [null, true, sorted]);
    assert.deepEqual([post(luke, 'troy', 'guess_total').picks, post(luke, 'troy', 'guess_total').picksHidden, post(luke, 'troy', 'guess_total').hiddenGames], [map(TROY.total), false, []]);
    assert.deepEqual([post(luke, 'luke', 'guess_total').picks, post(luke, 'luke', 'guess_total').picksHidden], [map(LUKE.total), false], 'own post');
    const sean = await feed('sean', NOW);
    assert.deepEqual([post(sean, 'troy', 'guess_spread').picks, post(sean, 'troy', 'guess_spread').picksHidden], [map(TROY.spread), false], 'the sit-out opens Spread');
    assert.deepEqual([post(sean, 'troy', 'guess_total').picks, post(sean, 'luke', 'guess_total').picks], [null, null], 'Sean\'s Total is a draft: nothing opens');
    assert.equal(sean.posts.filter(p => p.kind === 'ballot_submitted' && p.actorId === id('sean')).length, 0, 'a draft never posts');
    // The first kickoff opens the first game only.
    const first = await feed('luke', FIRST);
    assert.deepEqual([post(first, 'troy', 'guess_spread').picks, post(first, 'troy', 'guess_spread').picksHidden, post(first, 'troy', 'guess_spread').hiddenGames],
      [{ [ids[0]]: TROY.spread[0] }, true, sorted.filter(g => g !== ids[0])]);
    const last = await feed('luke', LAST);
    assert.deepEqual([post(last, 'troy', 'guess_spread').picks, post(last, 'troy', 'guess_spread').picksHidden, post(last, 'troy', 'guess_spread').hiddenGames], [map(TROY.spread), false, []]);
    for (const p of luke.posts.filter(p => p.kind !== 'ballot_submitted')) assert.deepEqual([p.picks, p.picksHidden, p.hiddenGames, p.late], [null, false, null, null], p.kind);
  });

  await t.test('the deployed handler keeps working on the new shape: a partly open post stays hidden until stage 17; null points read as 0', async () => {
    clock = FIRST;
    const read = await world.api('luke', 'community/read', {});
    clock = null;
    assert.equal(read.status, 200, JSON.stringify(read.body));
    const spread = post(read.body, 'troy', 'guess_spread');
    assert.deepEqual([spread.picksHidden, spread.picks, 'hiddenGames' in spread, 'late' in spread], [true, null, false, false], 'the old handler drops every pick of a hidden post');
    assert.equal(standing(read.body, 'sean', 'guess_spread').weekPoints, 0, 'the old handler still maps null to 0');
    const raw = await feed('sean', FIRST);
    assert.equal(standing(raw, 'sean', 'guess_spread').weekPoints, null);
  });

  await t.test('standings: points count from each game\'s kickoff; no ballot is null, never 0; ordered nulls last', async () => {
    const points = (picks, lines, n) => Math.round(picks.slice(0, n).reduce((sum, v, i) => sum + accuracy(v, lines[i]), 0) * 100) / 100;
    const at = async now => feed('luke', now);
    const before = await at(NOW), first = await at(FIRST), last = await at(LAST);
    assert.deepEqual([standing(before, 'troy', 'guess_spread').weekPoints, standing(before, 'troy', 'guess_spread').weekScored], [0, 0], 'a ballot before any kickoff is 0 of 0, not hidden points');
    assert.deepEqual([Number(standing(first, 'troy', 'guess_spread').weekPoints), standing(first, 'troy', 'guess_spread').weekScored], [points(TROY.spread, LINES.spread, 1), 1]);
    assert.deepEqual([Number(standing(last, 'troy', 'guess_spread').weekPoints), standing(last, 'troy', 'guess_spread').weekScored, Number(standing(last, 'troy', 'guess_spread').seasonPoints)],
      [points(TROY.spread, LINES.spread, 4), 4, points(TROY.spread, LINES.spread, 4)]);
    assert.deepEqual([Number(standing(last, 'luke', 'guess_total').weekPoints), standing(last, 'luke', 'guess_total').weekScored], [points(LUKE.total, LINES.total, 4), 4]);
    const sat = standing(last, 'sean', 'guess_spread');
    assert.deepEqual([sat.satOut, sat.weekPoints, sat.weekScored, sat.seasonPoints, sat.seasonScored, sat.weeksSubmitted], [true, null, 0, null, 0, 0], 'a sit-out has no ballot: null, never 0');
    assert.equal(standing(last, 'sean', 'guess_total'), undefined, 'a draft is not on the board');
    assert.deepEqual(last.standings.filter(s => s.mode === 'guess_spread').map(s => s.userId), [id('troy'), id('sean')], 'no ballot sorts last');
    // A Spread ballot in an earlier week only (written the way the group-league migration wrote rows, before the save guards):
    // no ballot this week is null, never 0; the season counts the earlier week's kicked-off points.
    const earlier = week - 1, kicked = Math.floor((deadline - 7 * 24 * HOUR) / 1000);
    await db.transaction(async tx => {
      await tx.exec('set local session_replication_role = replica');
      await tx.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, earlier, { season, week: earlier, deadline: kicked, games: [{ id: 'AAA-BBB', away: 'AAA', home: 'BBB', kickoff: kicked }] }]);
      await tx.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3)', [id('luke'), season, earlier]);
      await tx.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,'guess_spread',$4)",
        [id('luke'), season, earlier, { picks: { 'AAA-BBB': -3 }, submittedAt: iso(kicked * 1000 - HOUR), scoringReferences: { 'AAA-BBB': { status: 'available', value: -3.5 } } }]);
    });
    const now = await at(NOW), lukeSpread = standing(now, 'luke', 'guess_spread');
    assert.deepEqual([lukeSpread.weekPoints, lukeSpread.weekScored, Number(lukeSpread.seasonPoints), lukeSpread.seasonScored, lukeSpread.weeksSubmitted, lukeSpread.satOut],
      [null, 0, accuracy(-3, -3.5), 1, 1, false]);
    assert.deepEqual(now.standings.filter(s => s.mode === 'guess_spread').map(s => s.userId), [id('luke'), id('troy'), id('sean')], 'Troy has no kicked-off point yet; Sean has no ballot');
  });

  await t.test('History: per game and market for another member; own guesses always, own lines once open; points from kickoff', async () => {
    const before = await history('luke', NOW);
    const week5 = before.weeks.find(w => w.week === week);
    assert.deepEqual(week5.gate, await visible('luke', NOW));
    assert.deepEqual(week5.revealed, { guess_spread: false, guess_total: true });
    const hidden = entry(before, 'troy', 'guess_spread');
    assert.deepEqual([hidden.picksHidden, hidden.picks, hidden.hiddenGames, hidden.weekPoints, hidden.weekScored, hidden.status], [true, null, sorted, 0, 0, 'submitted']);
    const open = entry(before, 'troy', 'guess_total');
    assert.deepEqual([open.picksHidden, open.hiddenGames, open.weekPoints, open.weekScored], [false, [], 0, 0]);
    assert.deepEqual(open.picks.map(p => [p.gameId, p.guess, p.reference.value, p.points, p.hidden]), ids.map((g, i) => [g, TROY.total[i], LINES.total[i], null, false]), 'guesses and lines once locked in; points at kickoff');
    const own = entry(before, 'luke', 'guess_total');
    assert.deepEqual(own.picks.map(p => [p.guess, p.reference.value, p.points]), ids.map((g, i) => [LUKE.total[i], LINES.total[i], null]));
    assert.equal(entry(before, 'sean', 'guess_total'), undefined, 'another member never sees a draft');
    const sat = entry(before, 'sean', 'guess_spread');
    assert.deepEqual([sat.status, sat.weekPoints, sat.weekScored, sat.picks, sat.hiddenGames], ['sat_out', null, 0, null, []], 'sat out: no ballot, null');

    const first = await history('luke', FIRST);
    const partly = entry(first, 'troy', 'guess_spread');
    assert.deepEqual([partly.picksHidden, partly.hiddenGames, Number(partly.weekPoints), partly.weekScored], [true, sorted.filter(g => g !== ids[0]), accuracy(TROY.spread[0], LINES.spread[0]), 1]);
    assert.deepEqual(partly.picks.map(p => [p.gameId, p.guess, p.reference?.value ?? null, p.points === null ? null : Number(p.points), p.hidden]),
      ids.map((g, i) => (i === 0 ? [g, TROY.spread[0], LINES.spread[0], accuracy(TROY.spread[0], LINES.spread[0]), false] : [g, null, null, null, true])));
    const totals = entry(first, 'troy', 'guess_total');
    assert.deepEqual(totals.picks.map(p => (p.points === null ? null : Number(p.points))), ids.map((g, i) => (i === 0 ? accuracy(TROY.total[0], LINES.total[0]) : null)), 'only the kicked-off game scores');
    const standings = await feed('luke', FIRST);
    assert.equal(Number(partly.weekPoints), Number(standing(standings, 'troy', 'guess_spread').weekPoints), 'the history total is the board total');

    const last = await history('luke', LAST);
    assert.deepEqual([entry(last, 'troy', 'guess_spread').picksHidden, entry(last, 'troy', 'guess_spread').picks.length, last.weeks.find(w => w.week === week).revealed], [false, 4, { guess_spread: true, guess_total: true }]);
  });

  await t.test('the deployed handler drops a partly open History entry until stage 17', async () => {
    clock = FIRST;
    const reply = await world.api('luke', 'community/history', {});
    clock = null;
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const troy = entry(reply.body, 'troy', 'guess_spread');
    assert.deepEqual([troy.picksHidden, troy.picks, 'hiddenGames' in troy], [true, null, false]);
  });

  await t.test('leak scan: no hidden pick and no locked line in any reader, raw or through the handler, before and after the first kickoff', async () => {
    const hiddenSpread = (from = 0) => [
      ...pickSecrets(Object.fromEntries(ids.slice(from).map(g => [g, TROY.spread[ids.indexOf(g)]])), { market: 'spread', owner: 'troy' }),
      ...lineSecrets(Object.fromEntries(ids.slice(from).map(g => [g, LINES.spread[ids.indexOf(g)]])), { market: 'spread' }),
    ];
    const seanTotals = pickSecrets(map(SEAN.total), { market: 'total', owner: 'sean' });
    for (const [now, from] of [[NOW, 0], [FIRST, 1]]) {
      for (const reply of [await feed('luke', now), await history('luke', now)]) assertNoLeak(reply, { viewer: id('luke'), secrets: [...hiddenSpread(from), ...seanTotals] }, `raw at ${iso(now)}`);
      clock = now;
      try {
        for (const reader of READERS.filter(([route]) => route.startsWith('/community/'))) {
          const reply = await world.api('luke', reader[0].slice(1), reader[2]);
          assert.equal(reply.status, 200, JSON.stringify(reply.body));
          assertNoLeak(reply.body, { viewer: id('luke'), secrets: [...hiddenSpread(from), ...seanTotals] }, `${reader[0]} at ${iso(now)}`);
        }
      } finally { clock = null; }
    }
    // Not vacuous: the first kickoff puts the first game's Spread pick and line into Luke's raw replies.
    const first = [...pickSecrets({ [ids[0]]: TROY.spread[0] }, { market: 'spread', owner: 'troy' }), ...lineSecrets({ [ids[0]]: LINES.spread[0] }, { market: 'spread' })];
    assert.ok(leakScan(await feed('luke', FIRST), { viewer: id('luke'), secrets: first }).length >= 1, 'the opened pick is in the feed');
    assert.ok(leakScan(await history('luke', FIRST), { viewer: id('luke'), secrets: first }).length >= 2, 'the opened pick and its line are in History');
    // Sean's draft never reaches anyone, even after every kickoff.
    for (const who of ['troy', 'luke']) {
      assertNoLeak(await feed(who, LAST), { viewer: id(who), secrets: seanTotals }, `${who} feed after the last kickoff`);
      assertNoLeak(await history(who, LAST), { viewer: id(who), secrets: seanTotals }, `${who} history after the last kickoff`);
    }
  });

  await t.test('the Late marker is read from the ballot: only { deadline, minutes }, null until written', async () => {
    const before = await feed('luke', NOW);
    assert.equal(post(before, 'troy', 'guess_spread').late, null);
    assert.deepEqual(before.submissions.filter(s => s.userId === id('troy')).map(s => s.late), [null, null]);
    const late = { deadline: iso(deadline), minutes: 12 };
    await db.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('late',$1::jsonb) where user_id=$2 and season=$3 and week=$4 and mode='guess_total'",
      [{ ...late, note: 'never shown' }, id('troy'), season, week]);
    const after = await feed('luke', NOW);
    assert.deepEqual([post(after, 'troy', 'guess_total').late, after.submissions.find(s => s.userId === id('troy') && s.mode === 'guess_total').late], [late, late]);
    assert.deepEqual(entry(await history('luke', NOW), 'troy', 'guess_total').late, late);
    assert.deepEqual(await sql('gtl_ballot_late', { p_ballot: { late: { minutes: 'x' } } }), null);
    assert.deepEqual(await sql('gtl_ballot_late', { p_ballot: { late: 12 } }), null);
    assert.deepEqual(await sql('gtl_ballot_late', { p_ballot: {} }), null);
  });

  await t.test('posts dated after now are left out; paging is unchanged', async () => {
    const later = NOW + HOUR;
    await db.query("insert into public.gtl_feed_posts(actor_id,kind,season,week,payload,dedupe_key,created_at) values($1,'week_published',$2,$3,'{}',$4,$5)", [id('sean'), season, week, `future:${randomUUID()}`, iso(later)]);
    const kinds = async now => (await feed('luke', now)).posts.filter(p => p.kind === 'week_published' && Date.parse(p.createdAt) === later).length;
    assert.deepEqual([await kinds(NOW), await kinds(later), await kinds(LAST)], [0, 1, 1]);
    const all = (await feed('luke', LAST)).posts;
    const page = await sql('gtl_read_community', { p_user: id('luke'), p_before: null, p_limit: 2, p_now: iso(LAST) });
    assert.deepEqual(page.posts.map(p => p.id), all.slice(0, 2).map(p => p.id));
    const older = await sql('gtl_read_community', { p_user: id('luke'), p_before: page.posts[1].createdAt, p_limit: 100, p_now: iso(LAST) });
    assert.ok(older.posts.every(p => Date.parse(p.createdAt) < Date.parse(page.posts[1].createdAt)));
  });
});
