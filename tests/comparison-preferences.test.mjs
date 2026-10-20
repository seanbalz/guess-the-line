import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, HOSTED } from './migrations.mjs';
import { createCommunityWorld, ACCOUNTS, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { buildComparison, comparisonRows } from '../shared/score-comparison.mjs';
import { handleLeague } from '../cloud/league.mjs';
import { handleMe } from '../cloud/me.mjs';
const user = ACCOUNTS.luke;
const game = { id: 'AAA-BBB',awayCode: 'AAA',homeCode: 'BBB',kickoff: '2026-10-20T00:30:00Z' };
const p = (userId, points) => ({ userId,points,guess: -3,reference: { value: -3.5 } });
const rows = [
  { season: 2026,week: 6,game,players: [p('me',10),p('a',6)] },
  { season: 2026,week: 7,game,players: [p('me',8),p('a',4),p('b',0)] },
  { season: 2026,week: 8,game,players: [p('me',2)] },
];
test('All comparisons need me plus one; benchmark includes me, each game equally weighted, zero scores count', () => {
  const value = buildComparison({ rows,selection: { viewer: 'me',kind: 'all' } });
  assert.equal(value.games.length,2); assert.equal(value.excluded,1);
  assert.deepEqual(value.games.map(g => g.contributors),[2,3]);
  assert.equal(value.benchmark,6); assert.deepEqual(value.trend.map(t => t.week),[6,7]);
  assert.equal(value.players.find(p => p.userId === 'b').average,0);
});
test('selected comparisons use a strict intersection, keep Monday in its original week, apply season/team/range filters', () => {
  const selection = { viewer: 'me',kind: 'selected',players: ['a','b','a'] };
  assert.equal(buildComparison({ rows,selection }).games.length,1);
  assert.equal(buildComparison({ rows,selection,filters: { from: 6,to: 6 } }).games.length,0);
  assert.equal(buildComparison({ rows,selection: { ...selection,players: ['a'] },filters: { from: 6,to: 6,team: 'AAA',season: 2026 } }).games[0].week,6);
  assert.equal(buildComparison({ rows,selection,filters: { season: 2025 } }).games.length,0);
  assert.equal(buildComparison({ rows,selection,filters: { team: 'CCC' } }).games.length,0);
  assert.equal(buildComparison({ rows,selection: { ...selection,players: [] } }).games.length,0);
});
test('hidden, pending, ineligible and unlocked guesses cannot contribute; markets are separate', () => {
  const entry = (userId, patch = {}) => ({ userId,mode: 'guess_spread',status: 'submitted',eligible: true,picks: [{ gameId: game.id,guess: -3,points: 8,lockedIn: true,reference: { value: -4 } }],...patch });
  const history = { viewer: 'me',members: ['me','a'].map(id => ({ id })),weeks: [{ season: 2026,week: 6,games: [game],gate: { [game.id]: { spread: false,total: false } },entries: [entry('me'),entry('a')] }] };
  assert.equal(comparisonRows(history,'guess_spread')[0].players.length,1);
  history.weeks[0].gate[game.id].spread=true;
  for (const patch of [{ eligible: false },{ hiddenGames: [game.id] },{ picks: [{ gameId: game.id,guess: -3,points: 8,lockedIn: false,reference: { value: -4 } }] },{ picks: [{ gameId: game.id,guess: -3,points: null,lockedIn: true,reference: { value: -4 } }] }]) {
    history.weeks[0].entries[1]=entry('a',patch); assert.equal(comparisonRows(history,'guess_spread')[0].players.length,1);
  }
  assert.equal(comparisonRows(history,'guess_total')[0].players.length,0);
});
test('route bodies cannot select another owner, malformed identifiers or unbounded season', async () => {
  const service = { rpc: () => { throw new Error('must not call'); } };
  for (const body of [{ viewer: user.id },{ season: 2300 },{ leagueId: '../bad' },{ leagueId: ['sean-troy-luke'] }]) await assert.rejects(handleLeague({ route: '/league/comparison',body,user,service }),{ status: 400 });
  for (const body of [{ ownerId: user.id },{ revision: 0,sportsbooks: ['fake'],guidanceCollapsed: false }]) await assert.rejects(handleMe({ route: '/me/preferences/save',body,user,service }),{ status: 400 });
  await assert.rejects(handleLeague({ route: '/league/comparison',body: {},user,service,featureOff: new Set(['comparisons']) }),{ status: 503 });
});
test('real SQL: membership and reveal boundaries; settings CAS, idempotency and browser-role denial', { skip: !pgliteAvailable }, async t => {
  const world = await createCommunityWorld({ migrations: ALL,optionalRpc: true,groupScreens: true });
  t.after(() => world.db.close());
  const { db } = world;
  const call = async (account,path,body = {}) => world.api(account,path,body);
  let result = await call('luke','league/comparison');
  assert.equal(result.status,200,JSON.stringify(result));
  const before = JSON.stringify((await db.query('select user_id,ballot from public.gtl_weekly_ballots order by user_id,mode')).rows);
  const other = result.body?.weeks ?? result.data?.weeks;
  // world.api returns its JSON as body (checked below with the actual shape).
  const reply = result.body ?? result.data;
  assert.ok(reply && other);
  const troy = reply.weeks.flatMap(w => w.entries).filter(e => e.userId === ACCOUNTS.troy.id);
  assert.ok(troy.length); assert.ok(troy.every(e => e.picks === null || e.picks.every(p => p.points === null && p.guess === null)));
  await db.query("update public.gtl_memberships set active=false where user_id=$1",[ACCOUNTS.luke.id]);
  assert.equal((await call('luke','league/comparison',{ leagueId: 'sean-troy-luke' })).status,403);
  assert.equal((await call('luke','league/comparison')).status,200);
  await db.query("delete from public.gtl_memberships where user_id=$1",[ACCOUNTS.troy.id]);
  result = await call('sean','league/comparison',{ leagueId: 'sean-troy-luke' });
  const scoped = result.body ?? result.data;
  assert.equal(scoped.members.some(m => m.id === ACCOUNTS.troy.id),false);
  assert.equal(scoped.weeks.some(w => w.entries.some(e => e.userId === ACCOUNTS.troy.id)),false);
  assert.equal(JSON.stringify((await db.query('select user_id,ballot from public.gtl_weekly_ballots order by user_id,mode')).rows),before);
  const saved = { revision: 0,sportsbooks: [],guidanceCollapsed: true };
  const [a,b] = await Promise.all([call('luke','me/preferences/save',saved),call('luke','me/preferences/save',saved)]);
  assert.equal(a.status,200); assert.equal(b.status,200);
  assert.equal((await db.query('select count(*)::integer n from public.gtl_account_preferences')).rows[0].n,1);
  assert.equal((await call('luke','me/preferences/save',{ ...saved,guidanceCollapsed: false })).status,409);
  assert.equal((await call('luke','me/preferences/save',{ ...saved,revision: 1,sportsbooks: ['draftkings'] })).status,409);
  assert.equal((await call('sean','me/preferences')).body.guidanceCollapsed,false);
  for (const role of ['anon','authenticated']) {
    await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select * from public.gtl_account_preferences'); }),/permission denied/);
    for (const signature of ['gtl_read_score_comparison(uuid,integer,text,timestamptz)','gtl_read_account_preferences(uuid)','gtl_save_account_preferences(uuid,bigint,jsonb)']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,`public.${signature}`])).rows[0].ok,false);
    }
  }
});
test('comparisons fail closed before M-07 instead of changing scoring timing', { skip: !pgliteAvailable }, async t => {
  const migration = ALL.find(file => file.startsWith('20261016010000'));
  const world = await createCommunityWorld({ migrations: [...HOSTED.filter(file => !file.startsWith('20261015190710')),migration],optionalRpc: true });
  t.after(() => world.db.close());
  assert.equal((await world.api('luke','league/comparison',{})).status,503);
});
