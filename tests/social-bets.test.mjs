import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySocialState, applySocialMutation, findSocialReceipt, socialView, summarizeSocialBets, socialPotentialProfit, SocialError } from '../shared/social-bets.mjs';

const now = Date.parse('2026-10-08T18:00:00Z');
const games = [
  { id: 'TB-DAL', away: 'TB', home: 'DAL', kickoff: '2026-10-09T00:15:00Z' },
  { id: 'PHI-JAX', away: 'PHI', home: 'JAX', kickoff: '2026-10-11T17:00:00Z' },
];
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const leg = { gameId: 'TB-DAL', market: 'spread', side: 'home', line: -6.5, selection: 'Ignored client label' };
const create = (extra = {}) => ({ requestId: uid(), season: 2026, week: 5, kind: 'single', origin: 'tracked', legs: [leg], odds: -110, stakeUnits: 1, source: 'Saved ticket', quotedAt: '2026-10-08T17:50:00Z', placedAt: null, ...extra });
const mutate = (state, action, body, options = {}) => applySocialMutation(state, { actorId: 'sean', action, body, games, now, uuid: uid, ...options });
const settle = (state, index, outcome, extra = {}) => mutate(state, 'settle', { requestId: uid(), entryId: state.entries[index].id, revision: state.entries[index].revision, outcome, actualReturnUnits: null, reason: 'Ticket result reported', ...extra }, { actorId: state.entries[index].ownerId });

test('creation preserves incomplete ticket evidence, canonical selections and immutable input state', () => {
  const state = emptySocialState(), body = create({ odds: null, stakeUnits: null, source: '', quotedAt: null, placedAt: null });
  const next = mutate(state, 'create', body);
  assert.deepEqual(state, emptySocialState());
  assert.deepEqual(next.entries[0].legs[0], { ...leg, selection: 'DAL -6.5' });
  assert.equal(next.entries[0].ownerId, 'sean');
  assert.equal(next.entries[0].countsForRecord, true);
  assert.equal(next.entries[0].odds, null);
  assert.equal(next.entries[0].stakeUnits, null);
  assert.equal(next.entries[0].placedAt, null);
  assert.equal(next.entries[0].quotedAt, null);
  assert.equal(next.entries[0].outcome, 'pending');
  assert.equal(next.audit.length, 1);
  const view = socialView(next, { actorId: 'troy', games, now });
  assert.equal(view.summary.netUnits, null);
  assert.equal(view.summary.roiPercent, null);
  assert.equal(view.entries[0].potentialProfitUnits, null);
});

test('exact retries are idempotent and changed payload or action with reused key conflicts', () => {
  const body = create(), next = mutate(emptySocialState(), 'create', body);
  assert.deepEqual(mutate(next, 'create', body), next);
  assert.equal(findSocialReceipt(next, { actorId: 'sean', action: 'create', body }).entryId, next.entries[0].id);
  assert.throws(() => mutate(next, 'create', { ...body, odds: -120 }), /different content/);
  assert.throws(() => mutate(next, 'include', body), /different content/);
  assert.equal(mutate(next, 'create', body, { actorId: 'troy' }).entries.length, 2);
});

test('client identity, hidden notes, result and malformed request fields cannot enter public records', () => {
  for (const extra of [{ ownerId: 'troy' }, { privateNotes: 'private' }, { outcome: 'win' }, { verified: true }, { actualReturnUnits: 5 }, { requestId: 'bad' }]) {
    assert.throws(() => mutate(emptySocialState(), 'create', create(extra)), SocialError);
  }
  for (const extra of [{ odds: 0 }, { odds: -99 }, { odds: -110.005 }, { stakeUnits: -1 }, { stakeUnits: 1.00001 }, { season: 1 }, { week: 0 }, { source: 'bad\nsource' }, { notes: 'x'.repeat(501) }, { quotedAt: 'tomorrow' }, { quotedAt: '2026-10-08T19:00:00Z' }, { legs: [{ ...leg, line: -6.25 }] }]) {
    assert.throws(() => mutate(emptySocialState(), 'create', create(extra)), SocialError);
  }
});

test('parlays use one combined price, one stake and one qualification bet', () => {
  const prop = { gameId: 'TB-DAL', market: 'prop', side: 'George Pickens', line: 5, selection: 'George Pickens 5+ receptions' };
  let state = mutate(emptySocialState(), 'create', create({ kind: 'parlay', legs: [leg, prop], odds: 337.24, stakeUnits: 0.5, notes: 'Public ticket transcription' }));
  assert.equal(socialPotentialProfit(state.entries[0]), 1.6862);
  state = settle(state, 0, 'win', { actualReturnUnits: 2.1862 });
  const view = socialView(state, { actorId: 'sean', games, now });
  assert.equal(view.summary.bets, 1);
  assert.equal(view.summary.qualificationBets, 1);
  assert.equal(view.summary.qualificationUnits, 0.5);
  assert.equal(view.summary.netUnits, 1.6862);
  assert.equal(view.summary.roiPercent, 337.24);
  assert.equal(view.entries[0].accountingBasis, 'reported_return');
  assert.equal(view.selectionBreakdown.reduce((sum, row) => sum + row.units, 0), 0.5);
  assert.throws(() => mutate(state, 'create', create({ kind: 'parlay', legs: [leg, leg] })), /repeat/);
});

test('tails demand own reviewed price and stake, preserve ancestry and never inherit results', () => {
  const initial = mutate(emptySocialState(), 'create', create());
  const source = initial.entries[0], body = { requestId: uid(), sourceEntryId: source.id, odds: -125, stakeUnits: 2, source: 'Own quote', quotedAt: '2026-10-08T17:55:00Z', placedAt: null, notes: 'My own ticket note' };
  assert.throws(() => mutate(initial, 'tail', { ...body, odds: null }, { actorId: 'troy' }), /Review your own/);
  assert.throws(() => mutate(initial, 'tail', body), /cannot be tailed/);
  const tailed = mutate(initial, 'tail', body, { actorId: 'troy' }), tail = tailed.entries[1];
  assert.equal(tail.odds, -125);
  assert.equal(tail.stakeUnits, 2);
  assert.equal(tail.outcome, 'pending');
  assert.equal(tail.sourceEntryId, source.id);
  assert.equal(tail.rootEntryId, source.id);
  assert.equal(tail.notes, 'My own ticket note');
  assert.deepEqual(tail.legs, source.legs);
  assert.throws(() => mutate(tailed, 'tail', { ...body, requestId: uid() }, { actorId: 'troy' }), /cannot be tailed/);
  assert.throws(() => mutate(initial, 'tail', body, { actorId: 'troy', now: Date.parse(games[0].kickoff) }), /started/);
  assert.throws(() => mutate(settle(initial, 0, 'win'), 'tail', body, { actorId: 'troy' }), /cannot be tailed/);
  const view = socialView(tailed, { actorId: 'troy', games, now, profiles: [{ id: 'sean', displayName: 'Sean' }] });
  assert.equal(view.entries.find(entry => entry.id === source.id).tailCount, 1);
  assert.equal(view.entries.find(entry => entry.id === source.id).canTail, false);
  assert.equal(view.entries.find(entry => entry.id === tail.id).sourceOwnerName, 'Sean');
  const tailedView = socialView(tailed, { actorId: 'troy', games, now, filters: { origin: 'tailed' } });
  assert.deepEqual(tailedView.entries.map(entry => entry.id), [tail.id]);
  assert.equal(view.summary.qualified, null); // two players cannot combine units to qualify
  assert.deepEqual(view.summary.weeklyQualifications.map(row => row.qualified), [false, false]);
});

test('virtual picks allow retained quotes without an age cutoff and enforce kickoff, uniqueness and automatic settlement', () => {
  const body = create({ origin: 'virtual' }), state = mutate(emptySocialState(), 'create', body);
  assert.throws(() => mutate(state, 'create', { ...body, requestId: uid() }), /already have/);
  assert.throws(() => settle(state, 0, 'win'), /automatic/);
  assert.throws(() => mutate(emptySocialState(), 'create', body, { now: Date.parse(games[0].kickoff) }), /started/);
  assert.doesNotThrow(() => mutate(emptySocialState(), 'create', create({ origin: 'virtual', quotedAt: '2026-10-01T23:59:59Z' })));
  assert.doesNotThrow(() => mutate(emptySocialState(), 'create', create({ origin: 'virtual', quotedAt: '2026-10-08T00:00:00Z' })));
  assert.throws(() => mutate(emptySocialState(), 'create', create({ origin: 'virtual', quotedAt: '2026-10-08T18:00:01Z' })), /future/);
  assert.throws(() => mutate(emptySocialState(), 'create', create({ origin: 'virtual', stakeUnits: 0.25 })), /half-unit/);
  const total = create({ origin: 'virtual', legs: [{ ...leg, market: 'total', side: 'over', line: 45.5 }] });
  assert.equal(mutate(state, 'create', total).entries.length, 2);
  assert.equal(mutate(state, 'create', body, { actorId: 'troy' }).entries.length, 2);
});

test('edits are owned, revision checked, audited, and virtual terms lock exactly at kickoff', () => {
  const body = create({ origin: 'virtual' }), state = mutate(emptySocialState(), 'create', body), entry = state.entries[0];
  const correction = { ...body, requestId: uid(), entryId: entry.id, revision: 1, reason: 'Reviewed a better quote', odds: -105 };
  assert.throws(() => mutate(state, 'correct', correction, { actorId: 'troy' }), /unavailable/);
  assert.throws(() => mutate(state, 'correct', { ...correction, revision: 2 }), /another device/);
  const corrected = mutate(state, 'correct', correction);
  assert.equal(corrected.entries[0].odds, -105);
  assert.equal(corrected.audit[1].before.odds, -110);
  assert.equal(state.entries[0].odds, -110);
  assert.throws(() => mutate(state, 'correct', correction, { now: Date.parse(games[0].kickoff) }), /started/);
  assert.throws(() => mutate(state, 'correct', { ...correction, origin: 'tracked' }), /origin/);
});

test('known saved price computes correct unit ROI while void, pending and unknown amounts stay excluded', () => {
  let state = emptySocialState();
  for (const row of [{}, { odds: 120, stakeUnits: 2 }, { stakeUnits: 0.5 }, { stakeUnits: 3 }, { odds: null }, { stakeUnits: null }]) state = mutate(state, 'create', create(row));
  state = settle(state, 0, 'win');
  state = settle(state, 1, 'loss');
  state = settle(state, 2, 'push');
  state = settle(state, 3, 'void');
  state = settle(state, 4, 'win');
  const summary = summarizeSocialBets(state.entries);
  assert.equal(summary.record, '2-1-1');
  assert.equal(summary.voids, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.roiSampleCount, 3);
  assert.equal(summary.settledStakeUnits, 3.5);
  assert.equal(summary.netUnits, -1.09090909);
  assert.equal(summary.roiPercent, -31.16883114);
  assert.equal(summary.incompleteCount, 2);
  assert.equal(summary.qualificationUnits, 7.5);
  assert.equal(summary.qualified, true);
  assert.equal(summarizeSocialBets(state.entries.slice(3, 4)).qualified, true); // one 3u void retains 3u credit
  assert.equal(summarizeSocialBets([{ ...state.entries[3], stakeUnits: 1 }]).qualified, false);
});

test('reported returns obey outcomes and settlement corrections retain prior evidence', () => {
  let state = mutate(emptySocialState(), 'create', create());
  for (const [outcome, actualReturnUnits] of [['win', 0.5], ['loss', 1], ['push', 0], ['void', 0], ['pending', 1]]) assert.throws(() => settle(state, 0, outcome, { actualReturnUnits }), SocialError);
  state = settle(state, 0, 'loss', { actualReturnUnits: 0 });
  state = settle(state, 0, 'win', { actualReturnUnits: 1.8 });
  assert.equal(state.audit[2].before.outcome, 'loss');
  assert.equal(state.entries[0].settlementSource, 'user_reported');
  assert.equal(summarizeSocialBets(state.entries).netUnits, 0.8);
  assert.throws(() => mutate(state, 'correct', { ...create(), entryId: state.entries[0].id, revision: 3, reason: 'Change old quote' }), /Settled terms/);
});

test('inclusion is configurable after settlement and all projections use the same filtered records', () => {
  let state = mutate(emptySocialState(), 'create', create()), first = state.entries[0];
  state = mutate(state, 'create', create({ legs: [{ ...leg, gameId: 'PHI-JAX', side: 'away', line: 7.5 }] }), { actorId: 'troy' });
  state = settle(state, 0, 'win');
  state = settle(state, 1, 'loss');
  state = mutate(state, 'include', { requestId: uid(), entryId: first.id, revision: 2, countsForRecord: false, reason: 'Exclude this ticket from comparison' });
  const all = socialView(state, { actorId: 'sean', games, now });
  assert.equal(all.entries.length, 2);
  assert.equal(all.summary.excludedCount, 1);
  assert.equal(all.summary.record, '0-1-0');
  assert.equal(all.chart.length, 1);
  assert.equal(all.selectionBreakdown.length, 1);
  const filtered = socialView(state, { actorId: 'sean', games, now, following: ['troy'], filters: { following: true, team: 'PHI', market: 'spread', counts: 'included' } });
  assert.equal(filtered.entries.length, 1);
  assert.equal(filtered.summary.netUnits, -1);
  assert.equal(filtered.leaderboard.length, 1);
  assert.equal(filtered.leaderboard[0].ownerId, 'troy');
  assert.equal(filtered.chart[0].cumulativeNetUnits, -1);
});

test('history groups qualification by week and public projection cannot leak private state', () => {
  let state = mutate(emptySocialState(), 'create', create({ stakeUnits: 3 }));
  state = mutate(state, 'create', create({ week: 6 }));
  state.entries[0].privateNotes = 'never public';
  state.privateJournal = [{ notes: 'also never public' }];
  const view = socialView(state, { actorId: 'troy', games, now, profiles: [{ id: 'sean', displayName: 'Sean', email: 'private@example.com' }] });
  const serialized = JSON.stringify(view);
  for (const forbidden of ['never public', 'private@example.com', 'signature', 'requestId', 'receipts']) assert.equal(serialized.includes(forbidden), false);
  assert.equal(view.entries[0].audit.length, 1);
  assert.equal(view.leaderboard[0].qualified, null);
  assert.deepEqual(view.leaderboard[0].weeklyQualifications.map(row => row.qualified), [true, false]);
  assert.equal(socialView(state, { season: 2026, week: 5, games, now }).entries.length, 1);
  assert.equal(socialView(state, { season: 2026, week: 6, games, now }).entries.length, 1);
});

test('repeated matchup IDs use their own week schedule in history and discover profiles without bets', () => {
  let state = mutate(emptySocialState(), 'create', create());
  const oldGame = { ...games[0], season: 2026, week: 5, kickoff: '2026-10-08T17:00:00Z' };
  const nextGame = { ...games[0], season: 2026, week: 6, kickoff: '2026-10-15T17:00:00Z' };
  state = mutate(state, 'create', create({ week: 6 }));
  const view = socialView(state, { actorId: 'troy', games: [nextGame, oldGame], now, profiles: [{ id: 'sean', displayName: 'Sean' }, { id: 'luke', displayName: 'Luke' }] });
  assert.equal(view.entries.find(entry => entry.week === 5).canTail, false);
  assert.equal(view.entries.find(entry => entry.week === 5).lateEntry, true);
  assert.equal(view.entries.find(entry => entry.week === 6).canTail, true);
  assert.equal(view.entries.find(entry => entry.week === 6).lateEntry, false);
  assert.equal(view.profiles.some(profile => profile.id === 'luke'), true);
});

test('settled groups final outcomes and keeps summary and market scope identical', () => {
  let state = emptySocialState();
  for (const outcome of ['pending', 'win', 'loss', 'push', 'void']) {
    state = mutate(state, 'create', create());
    if (outcome !== 'pending')
      state = settle(state, state.entries.length - 1, outcome);
  }
  const view = socialView(state, { actorId: 'sean', games, now, filters: { outcome: 'settled', market: 'spread' } });
  assert.deepEqual(view.entries.map(e => e.outcome).sort(), ['loss', 'push', 'void', 'win']);
  assert.deepEqual(view.summary, summarizeSocialBets(state.entries.filter(e => e.outcome !== 'pending')));
  assert.equal(view.summary.roiPercent, summarizeSocialBets(state.entries.filter(e => ['win', 'loss', 'push'].includes(e.outcome))).roiPercent);
  assert.equal(socialView(state, { actorId: 'sean', games, now, filters: { outcome: 'settled', market: 'total' } }).entries.length, 0);
});
