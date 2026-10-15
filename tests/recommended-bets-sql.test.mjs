import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { HOSTED } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql, storeLines, sendBallot } from './helpers/guess-week.mjs';

const MIGRATION = '20261015143006_gtl_recommended_virtual_pick.sql';
const FUNCTION = 'gtl_save_recommended_virtual_pick';
const EDIT_MIGRATION = '20261015190955_gtl_edit_recommended_virtual_pick.sql';
const EDIT_FUNCTION = 'gtl_edit_recommended_virtual_pick';
const roleCall = (db, role, sql, args=[]) => db.transaction(async tx => {
  await tx.exec(`set local role ${role}`); return tx.query(sql,args);
});

test('recommendation forecasts expose only the authenticated owner and selected week without opening draft markets', { skip: pgliteAvailable ? false : 'Local PGlite required.' }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: HOSTED });
  const { db, state } = world; t.after(() => db.close());
  const { season, week } = state.league, oldWeek = week - 1, gameId = state.games[0].id;
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  await db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, oldWeek, signature]);
  await storeLines(db, state, { spread: Object.fromEntries(state.games.map(g => [g.id, -3])), total: Object.fromEntries(state.games.map(g => [g.id, 47.5])) });
  const fixtures = [
    { account: 'luke', week, values: [-7.5, 44.5], revision: 3 },
    { account: 'sean', week, values: [-11.5, 57.5], revision: 4 },
    { account: 'luke', week: oldWeek, values: [-14.5, 62.5], revision: 5 },
    { account: 'sean', week: oldWeek, values: [-18.5, 69.5], revision: 6 },
  ];
  const savedAt = new Date(Date.now() - 2000).toISOString();
  for (const fixture of fixtures) for (const [index, market] of ['spread', 'total'].entries()) {
    await db.query('insert into public.gtl_personal_forecasts(user_id,season,week,game_id,market,value,saved_at,revision) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [ACCOUNTS[fixture.account].id, season, fixture.week, gameId, market, fixture.values[index], savedAt, fixture.revision]);
  }
  for (const account of ['luke', 'sean']) {
    await sendBallot(world, account, 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
    await sendBallot(world, account, 'guess_total', Object.fromEntries(state.games.map(g => [g.id, 50])), false);
    await db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,$2,$3,$4,true,$5)',
      [ACCOUNTS[account].id, season, week, gameId, `${account} private favorite sentinel`]);
    await db.query('insert into public.gtl_journal_entries(user_id,season,week,game_id,entry) values($1,$2,$3,$4,$5)',
      [ACCOUNTS[account].id, season, week, gameId, { market: 'spread', notes: `${account} private journal sentinel` }]);
  }
  const numbersIn = value => typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(numbersIn) : [];
  for (const fixture of fixtures) await t.test(`${fixture.account} reads only their ${fixture.week === week ? 'current' : 'historical'} forecasts`, async () => {
    const response = await world.api(fixture.account, 'bets/recommendations', fixture.week === week ? {} : { season, week: fixture.week });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { personal, virtual, current, publishedWeek } = response.body;
    assert.equal(personal.ownerId, ACCOUNTS[fixture.account].id);
    assert.deepEqual([personal.season, personal.week, virtual.week], [season, fixture.week, fixture.week]);
    assert.deepEqual(publishedWeek, { season, week }); assert.equal(current, fixture.week === week);
    assert.deepEqual(personal.forecasts.map(({ gameId: id, market, value, revision }) => ({ gameId: id, market, value, revision })),
      ['spread', 'total'].map((market, index) => ({ gameId, market, value: fixture.values[index], revision: fixture.revision })));
    for (const forecast of personal.forecasts) {
      assert.deepEqual(Object.keys(forecast).sort(), ['gameId', 'market', 'value', 'savedAt', 'revision'].sort());
      assert.equal(Date.parse(forecast.savedAt), Date.parse(savedAt));
    }
    const numericValues = numbersIn(response.body);
    for (const other of fixtures.filter(other => other !== fixture)) for (const value of other.values) {
      assert.ok(!numericValues.includes(value), `response contains ${other.account}'s Week ${other.week} forecast ${value}`);
    }
    assert.doesNotMatch(JSON.stringify(response.body), /private (?:favorite|journal) sentinel|"(?:favorites|journal|notes)"/);
    const game = virtual.games.find(item => item.id === gameId);
    assert.equal(game.locked.total, true);
    assert.equal(game.offers.total, undefined); assert.equal(game.consensus.total, undefined);
    assert.ok(!numericValues.includes(47.5), 'a saved forecast never opens the unsubmitted market line');
    if (fixture.week === week) {
      assert.equal(personal.ballots.guess_total.picks[gameId], 50, 'the owner still sees their exact draft');
      assert.equal(personal.ballots.guess_total.submittedAt, null);
      assert.equal(game.locked.spread, false); assert.equal(game.consensus.spread.value, -3);
    }
  });
});

test('explicit recommendation edits preserve saved terms and use guarded, audited current-week updates only', { skip: pgliteAvailable ? false : 'Local PGlite required.' }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: HOSTED });
  const { db, state } = world; t.after(() => db.close());
  const { season, week } = state.league, game = state.games[0], rpc = serviceSql(db);
  const functionState = async () => (await db.query("select oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) body,proacl::text grants from pg_proc where pronamespace='public'::regnamespace and proname like 'gtl_%' and proname<>$1 order by 1", [EDIT_FUNCTION])).rows;
  const functionsBefore = await functionState();
  await db.exec(fs.readFileSync(`supabase/migrations/${EDIT_MIGRATION}`, 'utf8'));
  assert.deepEqual(await functionState(), functionsBefore, 'the new function must not change any hosted function or grants');
  const lines = { spread: Object.fromEntries(state.games.map(g => [g.id, -3])), total: Object.fromEntries(state.games.map(g => [g.id, 45])) };
  await storeLines(db, state, lines);
  await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
  await sendBallot(world, 'sean', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
  const row = async () => (await db.query('select * from public.gtl_virtual_units_picks where user_id=$1 and season=$2 and week=$3 and game_id=$4 and market=$5', [ACCOUNTS.luke.id, season, week, game.id, 'spread'])).rows[0];
  const revision = async () => (await db.query('select revision from public.gtl_weekly_versions where user_id=$1 and season=$2 and week=$3', [ACCOUNTS.luke.id, season, week])).rows[0]?.revision ?? 0;
  const write = async (body = {}, { user = ACCOUNTS.luke.id, selectedWeek = week, rev = null } = {}) => rpc(EDIT_FUNCTION, {
    p_user: user, p_season: season, p_week: selectedWeek, p_revision: rev ?? await revision(), p_body: { gameId: game.id, market: 'spread', units: 2, ...body },
  });
  async function place(account) {
    const read = await world.api(account, 'bets/recommendations', {});
    assert.equal(read.status, 200);
    const offer = read.body.virtual.games.find(g => g.id === game.id).offers.spread.home;
    const result = await world.api(account, 'bets/recommendations/place', { season, week, revision: read.body.virtual.revision,
      gameId: game.id, market: 'spread', side: 'home', line: offer.line, odds: offer.odds, units: 1, source: offer.book, quotedAt: offer.observedAt });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  await place('luke'); await place('sean');
  const ballotsBefore = (await db.query('select * from public.gtl_weekly_ballots order by user_id,season,week,mode')).rows;
  const otherPickBefore = (await db.query('select * from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.sean.id])).rows;

  await t.test('service-only invoker privileges and community membership are enforced', async () => {
    assert.equal((await db.query('select prosecdef from pg_proc where proname=$1', [EDIT_FUNCTION])).rows[0].prosecdef, false);
    for (const role of ['anon', 'authenticated']) await assert.rejects(() => roleCall(db, role, `select public.${EDIT_FUNCTION}($1,$2,$3,0,$4)`, [ACCOUNTS.luke.id, season, week, { gameId: game.id, market: 'spread', units: 2 }]), /permission denied/);
    await assert.rejects(() => write({}, { user: null }), /GTL_COMMUNITY_MEMBER/);
  });
  await t.test('a units-only edit works without current quotes and preserves every other saved term', async () => {
    const before = await row(), rev = await revision();
    await db.exec('delete from public.gtl_market_snapshots');
    assert.equal(await write(), rev + 1);
    const after = await row();
    assert.deepEqual(after.selection, { ...before.selection, units: 2, riskDollars: 200 });
    assert.deepEqual(after.created_at, before.created_at);
    assert.equal(after.status, before.status); assert.deepEqual(after.result, before.result);
    assert.equal(after.audit.length, before.audit.length + 1);
    assert.deepEqual(after.audit.at(-1).before, before.selection);
    assert.deepEqual(after.audit.at(-1).after, after.selection);
    assert.equal(after.audit.at(-1).type, 'edited'); assert.equal(after.audit.at(-1).quoteUpdated, false);
    await storeLines(db, state, lines);
  });
  await t.test('stale retries, implicit quote changes and malformed amounts leave the saved row untouched', async () => {
    const before = await row(), rev = await revision();
    await assert.rejects(() => write({ units: 3 }, { rev: rev - 1 }), /GTL_WEEKLY_CONFLICT/);
    for (const patch of [{ side: 'away' }, { line: -2 }, { updateQuote: null }, { units: '2' }, { units: 0 }, { units: -1 }, { units: 0.25 }, { userId: ACCOUNTS.sean.id }]) {
      await assert.rejects(() => write(patch), /GTL_VIRTUAL_INVALID/);
    }
    assert.deepEqual(await row(), before); assert.equal(await revision(), rev);
  });
  await t.test('an explicit side and quote update must match retained named-book terms and appends its before/after audit', async () => {
    const read = await world.api('luke', 'bets/recommendations', {});
    const offer = read.body.virtual.games.find(g => g.id === game.id).offers.spread.away;
    const quote = { updateQuote: true, side: 'away', line: offer.line, odds: offer.odds, source: offer.source, quotedAt: offer.observedAt };
    const before = await row();
    for (const change of [{ line: offer.line + 0.5 }, { odds: -115 }, { quotedAt: new Date(Date.parse(offer.observedAt) - 1000).toISOString() }]) {
      await assert.rejects(() => write({ ...quote, ...change }), /GTL_VIRTUAL_QUOTE/);
    }
    assert.deepEqual(await row(), before);
    await write(quote);
    const after = await row();
    for (const key of ['side', 'line', 'odds', 'source']) assert.equal(after.selection[key], quote[key]);
    assert.equal(Date.parse(after.selection.quotedAt), Date.parse(quote.quotedAt));
    assert.equal(after.selection.selectedAt, before.selection.selectedAt);
    assert.deepEqual(after.audit.at(-1).before, before.selection);
    assert.deepEqual(after.audit.at(-1).after, after.selection);
    assert.equal(after.audit.at(-1).quoteUpdated, true);
  });
  await t.test('edit never inserts a missing pick, uses another account guess, or edits a settled pick', async () => {
    const before = await row();
    await assert.rejects(() => write({ gameId: state.games[1].id }), /GTL_VIRTUAL_MISSING/);
    await assert.rejects(() => write({ market: 'total' }), /GTL_LINE_LOCKED/);
    await assert.rejects(() => write({}, { user: ACCOUNTS.troy.id, rev: 0 }), /GTL_LINE_LOCKED/);
    await db.query("update public.gtl_virtual_units_picks set status='win',result=$2 where user_id=$1", [ACCOUNTS.luke.id, { netUnits: 1 }]);
    await assert.rejects(() => write(), /GTL_VIRTUAL_SETTLED/);
    await db.query("update public.gtl_virtual_units_picks set status='pending',result=null where user_id=$1", [ACCOUNTS.luke.id]);
    assert.deepEqual(await row(), before);
    assert.equal((await db.query('select count(*)::int n from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n, 1);
  });
  await t.test('kickoff and published-week changes close edits without changing saved rows', async () => {
    const before = await row();
    const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
    const closed = structuredClone(signature); closed.games.find(g => g.id === game.id).kickoff = Date.now() / 1000 - 1;
    await db.query('update public.gtl_weekly_slates set signature=$3 where season=$1 and week=$2', [season, week, closed]);
    await assert.rejects(() => write(), /GTL_VIRTUAL_CLOSED/);
    await db.query('update public.gtl_weekly_slates set signature=$3 where season=$1 and week=$2', [season, week, signature]);
    await assert.rejects(() => write({}, { selectedWeek: week - 1 }), /GTL_BETS_WEEK/);
    await db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week + 1, signature]);
    await assert.rejects(() => write(), /GTL_BETS_WEEK/);
    await db.query('delete from public.gtl_weekly_slates where season=$1 and week=$2', [season, week + 1]);
    assert.deepEqual(await row(), before);
  });
  await t.test('pre-kickoff cancellation settles saved units and cannot be reopened by an edit', async () => {
    const before = (await db.query('select * from public.gtl_virtual_units_picks order by user_id')).rows;
    await rpc('gtl_settle_virtual_units', { p_season: season, p_week: week,
      p_results: { source: 'Fictional cancellation fixture', games: [{ gameId: game.id, status: 'cancelled' }] } });
    const voided = await row();
    assert.equal(voided.status, 'void'); assert.equal(voided.result.reason, 'cancelled');
    await assert.rejects(() => write(), /GTL_VIRTUAL_SETTLED/);
    assert.deepEqual(await row(), voided);
    // Even a legacy writer re-saving pending terms cannot evade the retained result.
    await db.query("update public.gtl_virtual_units_picks set status='pending',result=null where user_id=$1", [ACCOUNTS.luke.id]);
    await assert.rejects(() => write(), /GTL_VIRTUAL_SETTLED/);
    for (const pick of before) await db.query('update public.gtl_virtual_units_picks set status=$2,result=$3,audit=$4 where user_id=$1', [pick.user_id, pick.status, pick.result, pick.audit]);
    await db.query('delete from public.gtl_virtual_units_settlements where season=$1 and week=$2 and game_id=$3', [season, week, game.id]);
  });
  await t.test('the edit-only off switch preserves all picks, ballots and prior writer grants', async () => {
    const before = await row();
    await db.exec(fs.readFileSync('supabase/admin/disable_recommended_virtual_pick_edit.sql', 'utf8'));
    await assert.rejects(() => write(), /permission denied/);
    assert.deepEqual(await row(), before);
    assert.deepEqual(await functionState(), functionsBefore);
    assert.deepEqual((await db.query('select * from public.gtl_weekly_ballots order by user_id,season,week,mode')).rows, ballotsBefore);
    assert.deepEqual((await db.query('select * from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.sean.id])).rows, otherPickBefore);
  });
});

test('recommendation writer accepts the same retained named-book quote as its account reader', { skip: pgliteAvailable ? false : 'Local PGlite required.' }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: [...new Set([...HOSTED, MIGRATION])].sort() });
  const { db, state } = world; t.after(() => db.close());
  const { season, week } = state.league, game = state.games[0], rpc = serviceSql(db);
  await storeLines(db, state, { spread: Object.fromEntries(state.games.map(g => [g.id, -3])), total: Object.fromEntries(state.games.map(g => [g.id, 45])) });
  await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
  await sendBallot(world, 'troy', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
  await sendBallot(world, 'sean', 'guess_spread', Object.fromEntries(state.games.map(g => [g.id, -7])), true);
  const original = (await db.query('select * from public.gtl_market_snapshots order by created_at desc limit 1')).rows[0];
  const capture = new Date(original.created_at).getTime(), iso = ms => new Date(ms).toISOString();
  const template = original.payload.games.find(g => g.gameId === game.id).markets.spread.quotes[0];
  const quote = (book, line, observed, changes = {}) => ({ ...structuredClone(template), book, value: line, providerObservedAt: iso(observed), collectedAt: iso(observed),
    outcomes: { home: { line, odds: -110 }, away: { line: -line, odds: -110 } }, ...changes });
  async function snapshot(at, quotes, key = randomUUID()) {
    const payload = structuredClone(original.payload);
    payload.fetchedAt = iso(at);
    payload.games.find(g => g.gameId === game.id).markets.spread.quotes = quotes;
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)", [key, ACCOUNTS.sean.id, randomUUID(), season, week, original.slate_signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, original.slate_signature, payload, iso(at)]);
  }
  async function offered(account) {
    const read = await world.api(account, 'bets/recommendations', {});
    assert.equal(read.status, 200, JSON.stringify(read.body));
    return { read: read.body, offer: read.body.virtual.games.find(g => g.id === game.id).offers.spread.home };
  }
  async function place(account, expectedBook) {
    const { read, offer } = await offered(account);
    assert.equal(offer.book, expectedBook);
    const result = await world.api(account, 'bets/recommendations/place', { season, week, revision: read.virtual.revision, gameId: game.id, market: 'spread', side: 'home',
      line: offer.line, odds: offer.odds, units: 1, source: offer.book, quotedAt: offer.observedAt });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return offer;
  }

  await t.test('a retained book beyond the three primary collectors is accepted without adding a fetch', async () => {
    await snapshot(capture + 100, [quote('bovada', -2.5, capture + 50)]);
    const chosen = await place('luke', 'bovada');
    assert.equal(chosen.source, 'Bovada');
  });
  await t.test('a malformed later base quote is skipped and the older valid book quote still saves', async () => {
    await snapshot(capture + 200, [quote('draftkings', -2, capture + 150)]);
    await snapshot(capture + 300, [
      quote('draftkings', -1, capture + 250, { value: 'broken' }),
      quote('draftkings', -1, capture + 250, { outcomes: { home: { line: -1, odds: 50 }, away: { line: 1, odds: -110 } } }),
      quote('draftkings', -1, capture + 250, { providerObservedAt: 'not a date' }),
      quote('draftkings', -1, capture + 250, { collectedAt: 'not a date' }),
      quote('draftkings', -1, capture + 350),
    ]);
    const chosen = await place('troy', 'draftkings');
    assert.equal(chosen.line, -2);
    assert.equal(chosen.observedAt, iso(capture + 150));
  });
  await t.test('at equal capture times observation wins before snapshot id; stale matching terms are refused', async () => {
    const highId = 'ffffffff-ffff-4fff-8fff-ffffffffffff', lowId = '00000000-0000-4000-8000-000000009999';
    await snapshot(capture + 400, [quote('draftkings', -1, capture + 350)], lowId);
    await snapshot(capture + 400, [quote('draftkings', -1.5, capture + 300)], highId);
    const { read, offer } = await offered('sean');
    assert.equal(offer.line, -1);
    await assert.rejects(() => rpc(FUNCTION, { p_user: ACCOUNTS.sean.id, p_season: season, p_week: week, p_revision: read.virtual.revision,
      p_body: { gameId: game.id, market: 'spread', side: 'home', line: -1.5, odds: -110, units: 1, source: 'DraftKings', quotedAt: iso(capture + 300) } }), /GTL_VIRTUAL_QUOTE/);
    await place('sean', 'draftkings');
  });
});

test('recommendation writer adds a current-week virtual pick without private membership or changing guesses', { skip: pgliteAvailable ? false : 'Local PGlite required.' }, async t => {
  const world = await createCommunityWorld({ games: 2, troyBallots: false, migrations: [...new Set([...HOSTED, MIGRATION])].sort() });
  const { db, state } = world; t.after(() => db.close());
  const rpc = serviceSql(db), { season, week } = state.league, game = state.games[0];
  await storeLines(db,state,{spread:Object.fromEntries(state.games.map(g=>[g.id,-3])),total:Object.fromEntries(state.games.map(g=>[g.id,45]))});
  const quote = (await db.query('select payload from public.gtl_market_snapshots order by created_at desc limit 1')).rows[0].payload.games[0].markets.spread.quotes[0];
  const pick = { gameId:game.id,market:'spread',side:'home',line:-3,odds:-110,units:1,source:'DraftKings',quotedAt:quote.providerObservedAt };
  const revision = async () => (await db.query('select revision from public.gtl_weekly_versions where user_id=$1 and season=$2 and week=$3',[ACCOUNTS.luke.id,season,week])).rows[0]?.revision ?? 0;
  const save = async (patch={}, identity=ACCOUNTS.luke.id, selectedWeek=week, rev=null) => rpc(FUNCTION,{p_user:identity,p_season:season,p_week:selectedWeek,p_revision:rev??await revision(),p_body:{...pick,...patch}});
  const baseline = async () => (await db.query('select md5(coalesce(jsonb_agg(to_jsonb(b) order by user_id,season,week,mode)::text,\'[]\')) hash from public.gtl_weekly_ballots b')).rows[0].hash;

  await t.test('new RPC is invoker and cannot be called by browser roles',async()=>{
    assert.equal((await db.query('select prosecdef from pg_proc where proname=$1',[FUNCTION])).rows[0].prosecdef,false);
    for(const role of ['anon','authenticated']) await assert.rejects(()=>roleCall(db,role,`select public.${FUNCTION}($1,$2,$3,0,$4)`,[ACCOUNTS.luke.id,season,week,pick]),/permission denied/);
    await assert.rejects(()=>save({},null),/GTL_COMMUNITY_MEMBER/);
  });
  await t.test('a draft cannot place or infer a hidden line',async()=>{
    await sendBallot(world,'luke','guess_spread',Object.fromEntries(state.games.map(g=>[g.id,-7])),false);
    await assert.rejects(()=>save(),/GTL_LINE_LOCKED/);
    await assert.rejects(()=>save({line:-99}),/GTL_LINE_LOCKED/);
  });
  await sendBallot(world,'luke','guess_spread',Object.fromEntries(state.games.map(g=>[g.id,-7])),true);
  const before = await baseline();
  await db.query('delete from public.gtl_memberships where user_id=$1',[ACCOUNTS.luke.id]);
  await t.test('wrong week, bad side, malformed amount and fabricated quote fail before insert',async()=>{
    await assert.rejects(()=>save({},ACCOUNTS.luke.id,week+1),/GTL_BETS_WEEK/);
    await assert.rejects(()=>save({},ACCOUNTS.luke.id,week,-1),/GTL_WEEKLY_CONFLICT/);
    for(const patch of [{side:null},{market:null},{gameId:'NOT-A-GAME'},{line:'-3'},{odds:null},{units:-1},{units:0.25},{source:'Invented book'},{quotedAt:'Infinity'},{extra:'spoof'}]) await assert.rejects(()=>save(patch),/GTL_VIRTUAL_INVALID/);
    for(const patch of [{line:-3.5},{odds:-115},{quotedAt:new Date(Date.parse(pick.quotedAt)-1000).toISOString()}]) await assert.rejects(()=>save(patch),/GTL_VIRTUAL_QUOTE/);
    assert.equal((await db.query('select count(*)::int n from public.gtl_virtual_units_picks where user_id=$1',[ACCOUNTS.luke.id])).rows[0].n,0);
  });
  await t.test('successful explicit placement retains exact terms in existing settlement table',async()=>{
    const oldRevision=await revision();
    assert.equal(await save(),oldRevision+1);
    const saved=(await db.query('select * from public.gtl_virtual_units_picks where user_id=$1',[ACCOUNTS.luke.id])).rows[0];
    assert.equal(saved.season,season);assert.equal(saved.week,week);assert.equal(saved.status,'pending');
    for(const key of ['side','line','odds','units','source']) assert.equal(saved.selection[key],pick[key]);
    assert.equal(Date.parse(saved.selection.quotedAt),Date.parse(pick.quotedAt));
    assert.equal(saved.audit.length,1);assert.equal(saved.audit[0].type,'placed');
    assert.equal(await baseline(),before);
  });
  await t.test('double-clicks and uncertain retries never replace an existing pick',async()=>{
    const old=JSON.stringify((await db.query('select * from public.gtl_virtual_units_picks where user_id=$1',[ACCOUNTS.luke.id])).rows);
    await assert.rejects(()=>save({units:3}),/GTL_VIRTUAL_EXISTS/);
    assert.equal(JSON.stringify((await db.query('select * from public.gtl_virtual_units_picks where user_id=$1',[ACCOUNTS.luke.id])).rows),old);
  });
  await t.test('other market stays locked and other accounts cannot use this guess',async()=>{
    await assert.rejects(()=>save({market:'total',side:'over',line:45}),/GTL_LINE_LOCKED/);
    await assert.rejects(()=>save({},ACCOUNTS.troy.id,week,0),/GTL_LINE_LOCKED/);
  });
  await t.test('kickoff blocks an otherwise valid new pick',async()=>{
    const sig=(await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2',[season,week])).rows[0].signature;
    sig.games.find(g=>g.id===state.games[1].id).kickoff=Date.now()/1000-1;
    await db.query('update public.gtl_weekly_slates set signature=$3 where season=$1 and week=$2',[season,week,sig]);
    await assert.rejects(()=>save({gameId:state.games[1].id}),/GTL_VIRTUAL_CLOSED/);
  });
  await t.test('the optional administrative disable stops only this additive writer and preserves rows',async()=>{
    const old=JSON.stringify((await db.query('select * from public.gtl_virtual_units_picks')).rows);
    await db.exec(fs.readFileSync('supabase/admin/disable_recommended_virtual_pick.sql','utf8'));
    await assert.rejects(()=>save(),/permission denied/);
    assert.equal(JSON.stringify((await db.query('select * from public.gtl_virtual_units_picks')).rows),old);
    assert.equal(await baseline(),before);
  });
});
