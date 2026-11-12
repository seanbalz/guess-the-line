// Local PGlite only. The shared budget and quote ledger hold fixture reservations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

const refresh = 'gtl_props_begin_refresh';
const reserve = 'gtl_begin_research_quotes';
const finish = 'gtl_finish_research_quotes';
const migration = '20261112031000_gtl_player_props_refresh.sql';

test('Player Props refresh shares the game/stat cooldown and weekly credit ceiling with existing quote reservations', { skip: !pgliteAvailable }, async t => {
  const { db, state } = await createCommunityWorld({ games: 2, troyBallots: false, migrations: ALL });
  t.after(() => db.close());
  const rpc = serviceSql(db);
  const { season, week } = state.league;
  const [first, second] = state.games;
  const args = { p_season: season, p_week: week };
  const passing = 'player_pass_yds', rushing = 'player_rush_yds';
  const quoteRequest = (game, markets) => ({ ...args, p_request: randomUUID(), p_game: game.id, p_markets: markets });
  const complete = (request, lease, error = null) => rpc(finish, { p_request: request.p_request, p_lease: lease.lease, p_quota: {}, p_error: error });
  const budget = () => db.query('select conservative_remaining from public.gtl_odds_budget').then(r => r.rows[0].conservative_remaining);
  await db.exec("update public.gtl_odds_budget set conservative_remaining=100,paused=false,last_successful_preflight_at=clock_timestamp(),lease_token=null");

  // The cap counts only prop markets in a mixed request, includes failed/empty
  // attempts and applies to the existing intake path before the new path can run.
  const failed = quoteRequest(first, [passing, rushing, 'player_reception_yds', 'player_pass_tds',
    'player_receptions', 'player_rush_attempts', 'h2h', 'alternate_spreads']);
  await complete(failed, await rpc(reserve, failed), 'provider_unavailable');
  const empty = quoteRequest(second, [passing, rushing, 'player_reception_yds', 'player_pass_tds', 'player_receptions']);
  await complete(empty, await rpc(reserve, empty));
  const tooMany = quoteRequest(second, [passing, rushing]);
  await assert.rejects(rpc(reserve, tooMany), /GTL_PROPS_WEEKLY_BUDGET/);
  assert.equal(await budget(), 87);

  const eventId = `${season}_${String(week).padStart(2, '0')}_${first.awayCode}_${first.homeCode}`;
  const player = '00-0000001', teammate = '00-0000002';
  const selection = { ...args, p_event_id: eventId, p_player_id: player, p_stat: passing };
  const request = (changes = {}) => ({ ...selection, p_request: randomUUID(), ...changes });
  const offer = (playerId, stat, kickoff = first.kickoff) => rpc('gtl_props_record_offer', { p_offer: {
    season, week, eventId, playerId, stat, playerName: 'Fixture Athlete', position: 'QB',
    team: first.awayCode, away: first.awayCode, home: first.homeCode, kickoff, source: 'fixture schedule',
  } });
  await offer(player, passing);
  await offer(teammate, passing);
  await offer(player, rushing);
  await offer(player, 'player_receptions');

  await assert.rejects(rpc(refresh, request()), /GTL_PROPS_OFF/);
  await db.exec('update public.gtl_prop_capability set live_lock_in=true');
  await assert.rejects(rpc(refresh, request({ p_player_id: '00-0000003' })), /GTL_PROPS_INVALID/);
  await assert.rejects(rpc(refresh, request({ p_stat: 'player_receptions' })), /GTL_PROPS_INVALID/);
  await assert.rejects(rpc(refresh, request()), /GTL_PROPS_REFRESH_COOLDOWN/);

  const observedAt = new Date(Date.now() - 60_000).toISOString();
  await rpc('gtl_props_record_reference', { p_event_id: eventId, p_player_id: player, p_stat: rushing, p_line: 20.5,
    p_books: ['draftkings', 'fanduel', 'betmgm'].map(book => ({ book, line: 20.5, observedAt })) });
  await assert.rejects(rpc(refresh, request({ p_stat: rushing })), /GTL_PROPS_REFERENCE_FRESH/);
  assert.equal(await budget(), 87);

  await db.query("update public.gtl_research_quote_fetches set started_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '4 minutes 30 seconds' where request_id=$1",
    [failed.p_request]);
  const finalRequest = request();
  const lease = await rpc(refresh, finalRequest);
  assert.equal(lease.replay, false);
  assert.equal(await budget(), 86, 'only the twelfth prop credit was reserved');
  assert.deepEqual(await rpc(refresh, finalRequest), { replay: true, status: 'running' });
  await assert.rejects(rpc(refresh, { ...finalRequest, p_stat: rushing }), /GTL_RESEARCH_REPLAY/);
  await complete(finalRequest, lease);
  assert.deepEqual(await rpc(refresh, finalRequest), { replay: true, status: 'finished' });
  await assert.rejects(rpc(refresh, request({ p_player_id: teammate })), /GTL_PROPS_REFRESH_COOLDOWN/, 'an empty response cools down that game and stat for every athlete');
  await assert.rejects(rpc(reserve, quoteRequest(second, [passing, 'h2h'])), /GTL_PROPS_WEEKLY_BUDGET/, 'manual intake cannot spend a thirteenth credit either');
  const nonProp = quoteRequest(first, ['h2h']);
  await complete(nonProp, await rpc(reserve, nonProp));
  assert.equal(await budget(), 85, 'the weekly prop ceiling leaves unrelated markets available');

  await offer(player, passing, new Date(Date.now() - 1_000).toISOString());
  await assert.rejects(rpc(refresh, request()), /GTL_PROPS_CLOSED/);
  assert.deepEqual(await rpc(refresh, finalRequest), { replay: true, status: 'finished' }, 'a replay after kickoff acquires no lease');
  await db.query("insert into public.gtl_weekly_slates select season,week+1,jsonb_set(signature,'{week}',to_jsonb(week+1)) from public.gtl_weekly_slates where season=$1 and week=$2", [season, week]);
  await assert.rejects(rpc(refresh, request({ p_player_id: teammate })), /GTL_PROPS_INVALID/, 'a new request may only use the latest slate');
  const nextWeek = { ...quoteRequest(first, [passing]), p_week: week + 1 };
  await complete(nextWeek, await rpc(reserve, nextWeek));
  assert.equal(await budget(), 84, 'the prop ceiling starts over for the next NFL week');

  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query('select public.gtl_props_begin_refresh($1,$2,$3,$4,$5,$6)',
        [randomUUID(), season, week, eventId, player, passing]);
    }), /permission denied/);
  }
  const reservations = () => db.query('select count(*) n, md5(jsonb_agg(to_jsonb(q) order by request_id)::text) digest from public.gtl_research_quote_fetches q').then(r => r.rows[0]);
  const beforeRollback = await reservations();
  assert.equal(beforeRollback.n, 5);
  await db.exec(readFileSync(new URL(`../supabase/rollback/${migration}`, import.meta.url), 'utf8'));
  assert.deepEqual(await reservations(), beforeRollback, 'rollback preserves every reservation and its evidence');
  await assert.rejects(rpc(refresh, request()), /permission denied/);
  const afterRollback = quoteRequest(second, [passing]);
  await complete(afterRollback, await rpc(reserve, afterRollback));
});
