import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

// P-01 part 1 (20261026120000_gtl_points_core.sql, D-56): Guess the Points tables, guards, publish, lock-in and the
// reveal gate. Local PGlite only; fixture accounts and players, never real data. The guard trigger uses the real clock
// (defense in depth), so slate kickoffs are relative to Date.now().
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const TABLES = ['gtl_points_slates', 'gtl_points_guesses', 'gtl_points_guess_events', 'gtl_points_receipts'];
const FUNCTIONS = ['gtl_points_guess_guard()', 'gtl_points_publish_slate(uuid,integer,integer,jsonb,timestamptz,timestamptz)',
  'gtl_points_save(uuid,integer,integer,text,integer,boolean,uuid,timestamptz)', 'gtl_points_revealed(uuid,integer,integer,text,timestamptz)'];
const [LUKE, TROY, SEAN] = [id(1), id(2), id(3)];
const HOUR = 3_600_000, DAY = 24 * HOUR;

const slate = now => ({ selectionVersion: 'slate-1', provenance: { file: '2026-week-08.3f9c1a2b.json', sha256: 'f'.repeat(64), generatedAt: new Date(now).toISOString() },
  slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-000000${i + 1}`, pfrId: `Pf${i}`, name: `P${i}`, team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i],
    position: slot === 'FLEX' ? 'WR' : slot, gameId: ['SEA-DEN', 'KC-LV', 'BUF-NYJ', 'DAL-PHI', 'MIA-NE'][i],
    kickoff: new Date(now + (i < 2 ? 2 : 50) * HOUR).toISOString(), window: i < 2 ? 'Sun early' : 'Mon night', house: 10 + i })) });

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, call = serviceSql(db);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const now = Date.now(), at = ms => new Date(ms).toISOString();
  const publish = (over = {}, actor = SEAN, p = {}) => call('gtl_points_publish_slate', { p_actor: actor, p_season: p.season ?? 2026, p_week: p.week ?? 8,
    p_slate: over.slate ?? slate(now), p_finalize_at: p.finalize ?? at(now + 6 * DAY), p_now: p.now ?? at(now) });
  const save = (user, slot, guess, lock = false, request = randomUUID(), pNow = at(Date.now())) => call('gtl_points_save', { p_user: user, p_season: 2026, p_week: 8,
    p_slot: slot, p_guess: guess, p_lock: lock, p_request: request, p_now: pNow });
  const revealed = (viewer, slot, pNow) => call('gtl_points_revealed', { p_viewer: viewer, p_season: 2026, p_week: 8, p_slot: slot, p_now: pNow });
  const count = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
  return { db, call, as, now, at, publish, save, revealed, count };
}
const code = c => new RegExp(c);

test('privilege: anon and authenticated cannot touch any points table or function, and every function is security invoker', { skip }, async t => {
  const f = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    for (const table of TABLES) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) ok', [role, `public.${table}`, priv])).rows[0].ok, false, `${role} ${priv} ${table}`);
      }
      await assert.rejects(() => f.as(role, `delete from public.${table}`), /permission denied/, `${role}: delete ${table}`);
    }
    for (const fn of FUNCTIONS) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${fn}`);
  }
  const flags = (await f.db.query("select proname,prosecdef from pg_proc where proname like 'gtl_points_%'")).rows;
  assert.equal(flags.length, FUNCTIONS.length); assert(flags.every(row => row.prosecdef === false), 'all points functions are security invoker');
  const cfg = (await f.db.query("select proname,proconfig from pg_proc where proname like 'gtl_points_%'")).rows;
  for (const row of cfg) assert(row.proconfig?.includes('search_path=""'), `${row.proname} pins search_path`);
});

test('publish: only the commissioner publishes once per week, a malformed slate or window is refused, opensAt is p_now', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  await assert.rejects(() => f.publish({}, LUKE), code('GTL_POINTS_FORBIDDEN'));
  const bad = edit => { const s = slate(now); edit(s); return { slate: s }; };
  const cases = {
    'repeated game': bad(s => { s.slots[1].gameId = s.slots[0].gameId; }),
    'wrong position': bad(s => { s.slots[1].position = 'WR'; }),
    'flex as QB': bad(s => { s.slots[4].position = 'QB'; }),
    'one window': bad(s => { s.slots.forEach(x => { x.window = 'Sun early'; }); }),
    'kickoff before now': bad(s => { s.slots[0].kickoff = at(now - HOUR); }),
    'four slots': bad(s => { s.slots.pop(); }),
    'slot order': bad(s => { s.slots.reverse(); }),
    'repeated player': bad(s => { s.slots[1].playerId = s.slots[0].playerId; }),
    'bad player id': bad(s => { s.slots[0].playerId = 'x'; }),
    'bad provenance hash': bad(s => { s.provenance.sha256 = 'zz'; }),
    'no selection version': bad(s => { delete s.selectionVersion; }),
    'empty window': bad(s => { s.slots[0].window = ''; }),
    'relative kickoff text': bad(s => { s.slots[0].kickoff = 'tomorrow'; }),
    'kickoff without offset': bad(s => { s.slots[0].kickoff = at(now + 2 * HOUR).replace('Z', ''); }),
    'team not in game': bad(s => { s.slots[0].team = 'KC'; }),
  };
  for (const [name, c] of Object.entries(cases)) await assert.rejects(() => f.publish(c), code('GTL_POINTS_INVALID'), name);
  await assert.rejects(() => f.publish({}, SEAN, { finalize: at(now + 50 * HOUR) }), code('GTL_POINTS_INVALID'), 'finalize at last kickoff');
  for (const week of [0, 19]) await assert.rejects(() => f.publish({}, SEAN, { week }), code('GTL_POINTS_INVALID'), `week ${week}`);
  assert.equal(await f.count('gtl_points_slates'), 0, 'nothing stored by a refused publish');
  const out = await f.publish();
  assert.equal(new Date(out.opensAt).toISOString(), at(now)); assert.equal(out.season, 2026); assert.equal(out.week, 8);
  const row = (await f.db.query('select slots,audit from public.gtl_points_slates')).rows[0];
  row.slots.forEach((s, i) => assert.equal(new Date(s.kickoff).toISOString(), slate(now).slots[i].kickoff, `canonical kickoff ${i}`));
  assert(row.slots.every(s => /(Z|[+-]\d{2}(:\d{2})?)$/.test(s.kickoff)), 'stored kickoff carries an explicit offset');
  assert.equal(row.slots.length, 5); assert.equal(row.slots[0].void, null); assert.equal(row.audit[0].action, 'published');
  await assert.rejects(() => f.publish(), code('GTL_POINTS_PUBLISHED'));
});

test('save and lock: drafts change, a lock is final, the table refuses edits and deletes of a locked row, every save is an event', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const a = await f.save(LUKE, 'QB', 20);
  assert.deepEqual([a.guess, a.lockedAt, a.slot], [20, null, 'QB']);
  assert.equal((await f.save(LUKE, 'QB', 22)).guess, 22);
  const lockNow = new Date(Date.now()).toISOString();
  const locked = await f.save(LUKE, 'QB', 25, true, randomUUID(), lockNow);
  assert.equal(new Date(locked.lockedAt).toISOString(), lockNow); assert.equal(locked.guess, 25);
  await assert.rejects(() => f.save(LUKE, 'QB', 1), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.save(LUKE, 'QB', 1, true), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.as('service_role', "update public.gtl_points_guesses set guess=1 where slot='QB'"), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.db.query('delete from public.gtl_points_guesses'), code('GTL_POINTS_DELETE'));
  await assert.rejects(() => f.as('service_role', 'delete from public.gtl_points_guesses'), /permission denied/);
  assert.equal((await f.db.query("select guess from public.gtl_points_guesses where slot='QB'")).rows[0].guess, 25);
  const events = (await f.db.query('select kind,guess from public.gtl_points_guess_events order by id')).rows;
  assert.deepEqual(events, [{ kind: 'draft', guess: 20 }, { kind: 'draft', guess: 22 }, { kind: 'lock', guess: 25 }]);
  assert.equal(await f.count('gtl_points_receipts'), 3);
});

test('windows: no slate, closed after kickoff (function and real-clock trigger), invalid guess, non-member', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  await assert.rejects(() => f.save(LUKE, 'QB', 10), code('GTL_POINTS_NO_SLATE'));
  await f.publish();
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now + 3 * HOUR)), code('GTL_POINTS_CLOSED'));
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now + 2 * HOUR)), code('GTL_POINTS_CLOSED'), 'at the kickoff instant');
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now - HOUR)), code('GTL_POINTS_NOT_OPEN'));
  for (const guess of [61, -1, null]) await assert.rejects(() => f.save(LUKE, 'QB', guess), code('GTL_POINTS_INVALID'), String(guess));
  await assert.rejects(() => f.save(LUKE, 'XX', 10), code('GTL_POINTS_INVALID'));
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, null), code('GTL_POINTS_INVALID'));
  await assert.rejects(() => f.save(randomUUID(), 'QB', 10), code('GTL_POINTS_MEMBER'));
  assert.equal(await f.count('gtl_points_guesses'), 0, 'refused saves store nothing');
  // The trigger refuses on the real clock even if a caller bypasses the function: make QB's kickoff past.
  await f.db.query("update public.gtl_points_slates set slots=jsonb_set(slots,'{0,kickoff}',to_jsonb((now()-interval '1 hour')::text))");
  await assert.rejects(() => f.as('service_role', `insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values('${LUKE}',2026,8,'QB',5)`), code('GTL_POINTS_CLOSED'));
});

test('idempotent retries: the same request and payload replays, another guess under that request conflicts', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const request = randomUUID();
  const first = await f.save(LUKE, 'RB', 12, false, request);
  const again = await f.save(LUKE, 'RB', 12, false, request);
  assert.deepEqual(again, first);
  assert.equal(await f.count('gtl_points_guess_events'), 1, 'no second event');
  await assert.rejects(() => f.save(LUKE, 'RB', 13, false, request), code('GTL_POINTS_RETRY_CONFLICT'));
  assert.equal(await f.count('gtl_points_guess_events'), 1);
});

test('gate: another player sees a slot only after locking it or at kickoff', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'QB', 20, true);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), false, 'troy has not locked');
  await f.save(TROY, 'QB', 17, false);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), false, 'a draft does not reveal');
  await f.save(TROY, 'QB', 18, true);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), true, 'troy locked QB');
  assert.equal(await f.revealed(TROY, 'RB', at(now + HOUR)), false, 'other slot still hidden');
  assert.equal(await f.revealed(SEAN, 'RB', at(now + 2 * HOUR)), true, 'everyone at kickoff');
  assert.equal(await f.revealed(SEAN, 'TE', at(now + 2 * HOUR)), false, 'later kickoff still hidden');
});
