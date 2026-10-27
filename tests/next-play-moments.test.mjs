// Play's game feel (design upgrade): the pure rules behind the week progress strip, the lock-in moment and the reveal
// moment (web/src/next/play/moments.js). Fixture games and players only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_STATES, REVEAL_STAGGER_CAP, confirmedLockIns, gameState, landing, markSeen, progressLegend, readSeen, revealRows,
  revealScope, seenKey, staggerIndex, unseen, weekProgress, writeSeen,
} from '../web/src/next/play/moments.js';

const NOW = Date.parse('2026-10-25T18:00:00Z');
const at = minutes => new Date(NOW + minutes * 60_000).toISOString();
const games = [
  { id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: at(-90) },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: at(-30) },
  { id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX', kickoff: at(60) },
  { id: 'KC-LV', awayCode: 'KC', homeCode: 'LV', kickoff: at(120) },
  { id: 'NYJ-BUF', awayCode: 'NYJ', homeCode: 'BUF', kickoff: at(180) },
];
// TB-DAL locked before kickoff; SEA-DEN kicked off with only a draft; HOU-JAX locked; KC-LV a draft; NYJ-BUF open.
const ballot = { picks: { 'TB-DAL': -3, 'HOU-JAX': 2.5 }, lockedAt: { 'TB-DAL': at(-200), 'HOU-JAX': at(-10) } };
const picks = { 'TB-DAL': -3, 'SEA-DEN': -4, 'HOU-JAX': 2.5, 'KC-LV': -7, 'NYJ-BUF': '' };

test('contract: each game has exactly one state, a server lock outranks kickoff, and kickoff outranks a draft', () => {
  const state = game => gameState(game, { ballot, picks, now: NOW, openAt: NOW - 86_400_000 });
  assert.deepEqual(games.map(state), ['locked', 'kicked', 'locked', 'draft', 'open']);
  // A missing clock never offers a guess: everything unlocked reads as kicked off.
  assert.equal(gameState(games[4], { ballot, picks, now: NaN }), 'kicked');
  // Sat out and not open apply only to games still before kickoff without a lock.
  assert.equal(gameState(games[4], { ballot, picks, now: NOW, satOut: true }), 'skipped');
  assert.equal(gameState(games[2], { ballot, picks, now: NOW, satOut: true }), 'locked');
  assert.equal(gameState(games[4], { ballot, picks, now: NOW, openAt: NOW + 1 }), 'notopen');
  // A game closed at kickoff with a value is never a lock (closedAtKickoff overrides submittedAt).
  assert.equal(gameState(games[0], { ballot: { picks: { 'TB-DAL': -3 }, submittedAt: at(-300), closedAtKickoff: ['TB-DAL'] }, picks, now: NOW }), 'kicked');
});

test('contract: the week strip counts every game once, in the server order, and names the next game to lock', () => {
  const progress = weekProgress({ games, ballot, picks, now: NOW, openAt: NOW - 86_400_000 });
  assert.equal(progress.summary, '2 of 5 locked');
  assert.equal(progress.total, 5);
  assert.deepEqual(progress.games.map(row => row.id), games.map(game => game.id));
  assert.equal(Object.values(progress.counts).reduce((a, b) => a + b, 0), progress.total);
  assert.equal(progress.next.id, 'KC-LV');
  assert.deepEqual(progressLegend(progress), [
    { state: 'locked', count: 2, word: 'Locked' }, { state: 'draft', count: 1, word: 'Draft' },
    { state: 'open', count: 1, word: 'Open' }, { state: 'kicked', count: 1, word: 'Kicked off' },
  ]);
  assert.deepEqual(GAME_STATES, ['locked', 'draft', 'open', 'kicked', 'skipped', 'notopen']);
  const done = weekProgress({ games: games.slice(0, 1), ballot, picks, now: NOW });
  assert.equal(done.next, null);
  assert.equal(weekProgress().summary, '0 of 0 locked');
});

test('contract: the lock-in moment plays only for locks a fresh read confirms with the requested value', () => {
  const request = { season: 2026, week: 8, mode: 'guess_spread', picks: { 'HOU-JAX': 2.5 }, lockIn: ['HOU-JAX'] };
  const latest = { season: 2026, week: 8, ballots: { guess_spread: ballot } };
  assert.deepEqual(confirmedLockIns(latest, request), ['HOU-JAX']);
  // Another device locked a different value: nothing to celebrate.
  assert.deepEqual(confirmedLockIns({ ...latest, ballots: { guess_spread: { ...ballot, picks: { ...ballot.picks, 'HOU-JAX': 3 } } } }, request), []);
  // The read is still unlocked (a lost reply, a refusal): nothing.
  assert.deepEqual(confirmedLockIns({ ...latest, ballots: { guess_spread: { picks: { 'HOU-JAX': 2.5 }, lockedAt: {} } } }, request), []);
  // Another week, a draft save, or no read at all: nothing.
  assert.deepEqual(confirmedLockIns({ ...latest, week: 9 }, request), []);
  assert.deepEqual(confirmedLockIns(latest, { ...request, lockIn: undefined }), []);
  assert.deepEqual(confirmedLockIns(null, request), []);
});

const VIEWER = '00000000-0000-4000-8000-000000000001', TROY = '00000000-0000-4000-8000-000000000002', SEAN = '00000000-0000-4000-8000-000000000003', BEN = '00000000-0000-4000-8000-000000000004';
const members = [{ id: VIEWER, displayName: 'Luke Fixture' }, { id: TROY, displayName: 'Troy Fixture' }, { id: SEAN, displayName: 'Sean Fixture' }];
const reply = open => ({ viewer: VIEWER, season: 2026, week: 8, mode: 'guess_spread', games: [{ gameId: 'TB-DAL', open, started: open, rows: [
  { userId: VIEWER, status: 'in', lockedIn: true, pick: -3, hidden: false },
  { userId: TROY, status: 'in', lockedIn: true, pick: -2.5, hidden: false },
  { userId: SEAN, status: 'late', lockedIn: true, pick: 1, hidden: false, late: { minutes: 12 } },
  { userId: BEN, status: 'in', lockedIn: true, pick: null, hidden: true },
  { userId: '00000000-0000-4000-8000-000000000005', status: 'not_yet', lockedIn: false, pick: null },
  { userId: '00000000-0000-4000-8000-000000000006', status: 'sat_out', lockedIn: false, pick: null },
] }] });

test('security property: the reveal shows only guesses the server opened, never a hidden row, and never before the game opens', () => {
  const shown = revealRows(reply(true), VIEWER, members, 'TB-DAL');
  assert.equal(shown.open, true);
  assert.deepEqual(shown.rows.map(row => [row.name, row.pick]), [['Troy Fixture', -2.5], ['Sean Fixture', 1]]);
  assert.deepEqual(shown.rows[1].late, { minutes: 12 });
  assert.equal(shown.waiting, 1); assert.equal(shown.satOut, 1);
  // The viewer's own row stays on the card, not in the reveal.
  assert.ok(!shown.rows.some(row => row.id === VIEWER));
  // A game the server has not opened shows nothing, even if a malformed reply carried numbers.
  const closed = reply(false); closed.games[0].rows[1].pick = -2.5;
  assert.deepEqual(revealRows(closed, VIEWER, members, 'TB-DAL').rows, []);
  // A game missing from the reply is null (no reveal), and a row the server hid stays hidden even with a number.
  assert.equal(revealRows(reply(true), VIEWER, members, 'NOPE-GAME'), null);
  const sneaky = reply(true); sneaky.games[0].rows[3].pick = 4;
  assert.ok(!revealRows(sneaky, VIEWER, members, 'TB-DAL').rows.some(row => row.id === BEN));
  // An unknown member is a generic name, never another account's name.
  assert.equal(revealRows(reply(true), VIEWER, [], 'TB-DAL').rows[0].name, 'Community player');
});

test('contract: the landing strip places guesses from the lowest to the highest, with the tick only for a line passed in', () => {
  const rows = revealRows(reply(true), VIEWER, members, 'TB-DAL').rows;
  const strip = landing(rows, { id: VIEWER, name: 'You', pick: -3 }, -2);
  assert.deepEqual(strip.items.map(item => [item.name, Math.round(item.pct), item.you]), [['You', 0, true], ['Troy Fixture', 13, false], ['Sean Fixture', 100, false]]);
  assert.equal(Math.round(strip.linePct), 25);
  assert.equal(landing(rows, null, null).linePct, null);
  assert.equal(landing([], null, null), null);
  assert.equal(landing([{ id: TROY, name: 'Troy', pick: 3 }], null, null).items[0].pct, 50);
});

test('contract: "seen" is per account, game and market, survives bad storage and keeps only the current week', () => {
  const scope = revealScope({ season: 2026, week: 8, mode: 'guess_spread', gameId: 'TB-DAL' });
  assert.equal(scope, '2026-8-guess_spread-TB-DAL');
  assert.equal(seenKey(VIEWER), `gtl.play.reveal-seen.v1.${VIEWER}`);
  assert.ok(seenKey(VIEWER).startsWith('gtl.'));
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.deepEqual(readSeen(storage, seenKey(VIEWER)), {});
  assert.deepEqual(unseen({}, scope, [TROY, SEAN]), [TROY, SEAN]);
  const old = { '2026-7-guess_spread-TB-DAL': [TROY] };
  const next = markSeen(old, scope, [TROY], '2026-8-');
  assert.deepEqual(next, { [scope]: [TROY] });
  assert.ok(writeSeen(storage, seenKey(VIEWER), next));
  assert.deepEqual(unseen(readSeen(storage, seenKey(VIEWER)), scope, [TROY, SEAN]), [SEAN]);
  // Another account on the same device has its own map.
  assert.deepEqual(readSeen(storage, seenKey(TROY)), {});
  // Unreadable or blocked storage: the reveal still works and simply animates again.
  memory.set(seenKey(VIEWER), '{not json');
  assert.deepEqual(readSeen(storage, seenKey(VIEWER)), {});
  memory.set(seenKey(VIEWER), JSON.stringify({ [scope]: 'nope', other: [1] }));
  assert.deepEqual(readSeen(storage, seenKey(VIEWER)), {});
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(readSeen(blocked, 'k'), {});
  assert.equal(writeSeen(blocked, 'k', next), false);
  assert.deepEqual(readSeen(null, 'k'), {});
});

const tokens = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'design/tokens-next.json'), 'utf8'));
const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'web/src/next/play/moments.css'), 'utf8');
const ms = name => Number.parseFloat(tokens.dur[name]);

test('performance bound: the reveal stagger is capped so the whole reveal ends inside the "big" duration', () => {
  assert.deepEqual([0, 1, 5, 6, 7, 40, -1].map(staggerIndex), [0, 1, 5, 6, 6, 6, 0]);
  // The reveal rule: base for each row, then half a tap per stagger step.
  assert.match(css, /\.gx-play-reveal-in \{\s*animation: gx-rise-in var\(--gx-dur-base\) var\(--gx-ease-enter\) both;\s*animation-delay: calc\(var\(--gx-play-i\) \* var\(--gx-dur-tap\) \/ 2\);/);
  assert.ok(ms('base') + REVEAL_STAGGER_CAP * (ms('tap') / 2) <= ms('big'));
});

test('contract: every moment uses the dur and ease tokens, and each animated class has its reduced-motion stop', () => {
  for (const [, rule] of css.matchAll(/animation: ([^;]+);/g)) {
    if (rule === 'none') continue;
    assert.match(rule, /var\(--gx-dur-(tap|quick|base|exit|big)\) var\(--gx-ease-(standard|enter|exit|pop)\)/, rule);
    assert.doesNotMatch(rule, /infinite/, 'the LIVE dot is the only loop');
  }
  const animated = [...css.matchAll(/(\.gx [^{}]*?)\s*\{[^}]*animation: (?!none)/g)].map(([, selector]) => selector.trim().replace(/^\.gx\s+/, ''));
  const media = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of animated) {
    assert.ok(media.includes(`.gx ${selector}`), `${selector} stops under prefers-reduced-motion`);
    assert.ok(css.includes(`.gx[data-motion="reduce"] ${selector}`), `${selector} stops under the app's reduce setting`);
  }
  assert.deepEqual(animated, ['.gx-play-stamp', '.gx-play-stamp::after', '.gx-play-stamp-pill', '.gx-play-reveal-in']);
});
