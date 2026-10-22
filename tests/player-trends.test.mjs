import test from 'node:test';
import assert from 'node:assert/strict';
import { playerObservations, buildPlayerTrends, buildSentiment, PLAYER_TREND_WINDOWS, PLAYER_TREND_LABELS } from '../shared/player-trends.mjs';

const game = (id = 'ATL-CAR', homeCode = 'CAR', awayCode = 'ATL', kickoff = '2026-10-19T00:20:00Z') => ({ id, homeCode, awayCode, kickoff });
const reference = (value, extra = {}) => ({ basis: 'saved', value, source: 'saved consensus', observedAt: '2026-10-14T17:00:00Z', guessedAtKnown: true, ...extra });
const pick = (g, guess = -7, line = -3.5, extra = {}) => ({ gameId: g.id, guess, reference: reference(line), points: 0, scorable: true, lockedIn: true, ...extra });
const entry = (g, extra = {}, p = pick(g)) => ({ userId: 'me', mode: 'guess_spread', status: 'submitted', eligible: true, picks: [p], ...extra });
function historyOf(rows, extra = {}) {
  return { viewer: 'me', members: [{ id: 'me' }, { id: 'other' }], season: 2026, seasons: [2025, 2026], now: '2026-10-21T12:00:00Z',
    weeks: rows.map(({ g = game(), season = 2026, week = 6, result = { status: 'final', home: 25, away: 20 }, entries, gate = true }) => ({
      season, week, games: [g], results: result ? { [g.id]: result } : {}, gate: { [g.id]: { spread: gate, total: gate } },
      entries: entries ?? [entry(g)]
    })), ...extra };
}
const build = (history, extra = {}) => buildPlayerTrends({ observations: playerObservations(history, extra.market ?? 'spread'), playerId: 'me', market: 'spread', window: 'all', season: 2026, week: 7, ...extra });
const one = (extra = {}) => historyOf([{ ...extra }]);

test('exports stable window IDs and labels shared with the weekly UI', () => {
  assert.deepEqual(PLAYER_TREND_WINDOWS.map(w => w.id), ['last5', 'last10', 'season', 'years3', 'years5', 'all']);
  assert.equal(PLAYER_TREND_LABELS.spreadBias, 'Home-team strength gap');
  assert.ok(PLAYER_TREND_WINDOWS.every(w => typeof w.label === 'string'));
});

test('Panthers home: market cover, guessed loss and straight-up win remain separate', () => {
  const output = build(one(), { team: 'CAR' });
  assert.equal(output.sample, 1);
  assert.equal(output.games[0].strengthGap, 3.5);
  assert.equal(output.games[0].marketResult, 'W');
  assert.equal(output.games[0].guessedResult, 'L');
  assert.equal(output.games[0].straightUpResult, 'W');
  assert.equal(output.games[0].absoluteRealizedError, 2);
  assert.equal(output.metrics.meanAbsoluteMarketError, 3.5);
  assert.equal(output.metrics.meanPoints, 0);
  assert.equal(output.record.W, 1);
  assert.equal(output.againstRecord.L, 1);
  assert.equal(output.guessedRecord.L, 1);
  assert.deepEqual(output.straightUpRecord, { W: 1, L: 0, T: 0, n: 1 });
});

test('seven-point wins push the guessed spread; SU ties are distinct from ATS pushes', () => {
  const seven = build(one({ result: { status: 'final', home: 27, away: 20 } }), { team: 'CAR' });
  assert.equal(seven.games[0].guessedResult, 'P');
  assert.equal(seven.guessedRecord.P, 1);
  const tiedGame = game();
  const tied = build(one({ result: { status: 'final', home: 20, away: 20 }, entries: [entry(tiedGame, {}, pick(tiedGame, -3, 0))] }));
  assert.equal(tied.games[0].marketResult, 'P');
  assert.equal(tied.games[0].straightUpResult, 'T');
  assert.equal(tied.record.hitRate, null);
  assert.equal(tied.record.wilson95, null);
});

test('Panthers away uses signed-home +7/+3.5 and retains identical team meaning', () => {
  const g = game('CAR-ATL', 'ATL', 'CAR');
  const h = one({ g, result: { status: 'final', home: 20, away: 25 }, entries: [entry(g, {}, pick(g, 7, 3.5))] });
  const car = build(h, { team: 'CAR' });
  assert.equal(car.games[0].strengthGap, 3.5);
  assert.equal(car.games[0].marketResult, 'W');
  assert.equal(car.games[0].guessedResult, 'L');
  assert.equal(car.games[0].straightUpResult, 'W');
  assert.equal(build(h).metrics.meanSignedBias, -3.5);
  assert.equal(car.metrics.meanSignedBias, 3.5);
  assert.equal(car.metrics.meanAbsoluteRealizedError, 2);
  const opponent = build(h, { team: 'ATL' });
  assert.equal(opponent.games[0].strengthGap, -3.5);
  assert.equal(opponent.games[0].teamMarketResult, 'L');
  assert.equal(opponent.games[0].marketResult, 'W');
});

test('total 47 versus 43.5 and realized 45 is market Over but guessed-line Under', () => {
  const g = game();
  const h = one({ result: { status: 'final', home: 25, away: 20 }, entries: [entry(g, { mode: 'guess_total' }, pick(g, 47, 43.5))] });
  const output = build(h, { market: 'total' });
  assert.equal(output.games[0].direction, 'over');
  assert.equal(output.games[0].strengthGap, 3.5);
  assert.equal(output.games[0].marketResult, 'W');
  assert.equal(output.games[0].guessedResult, 'L');
  assert.equal(output.games[0].straightUpResult, null);
  assert.equal(output.metrics.meanAbsoluteRealizedError, 2);
  assert.equal(build(h).sample, 0);
});

test('hidden sentinels cannot change metrics, callouts, chart metadata, sentiment or exclusions', () => {
  const g = game();
  const baseline = one({ gate: false });
  const sentinel = structuredClone(baseline);
  sentinel.weeks[0].entries.push(entry(g, { userId: 'other' }, pick(g, -999999, -888888)));
  sentinel.weeks[0].entries.push(entry(g, { userId: 'outsider' }, pick(g, -444444, -333333)));
  assert.deepEqual(build(sentinel), build(baseline));
  assert.deepEqual(buildSentiment({ history: sentinel, market: 'spread', season: 2026, week: 6 }),
    buildSentiment({ history: baseline, market: 'spread', season: 2026, week: 6 }));
  for (const patch of [{ hiddenGames: [g.id] }, { picksHidden: true, hiddenGames: null }]) {
    const open = one();
    const before = build(open);
    open.weeks[0].entries.push(entry(g, { userId: 'other', ...patch }, pick(g, -999999, -888888)));
    assert.deepEqual(build(open), before);
  }
});

test('drafts, explicit unscorable, ineligible, missing lines, and untrusted reference bases never count', () => {
  const g = game();
  const cases = [
    entry(g, { status: 'draft' }, pick(g, -7, -3.5, { lockedIn: false })),
    entry(g, { eligible: false }),
    entry(g, {}, pick(g, -7, -3.5, { hidden: true })),
    entry(g, {}, pick(g, -7, -3.5, { scorable: false })),
    entry(g, {}, pick(g, -7, -3.5, { points: null })),
    entry(g, {}, pick(g, -7, -3.5, { closedAtKickoff: true })),
    entry(g, {}, pick(g, -7, -3.5, { reference: reference(null) })),
    entry(g, {}, pick(g, -7, -3.5, { reference: reference(-3.5, { basis: 'nearest-snapshot' }) })),
  ];
  for (const e of cases) {
    const output = build(one({ entries: [e] }));
    assert.equal(output.sample, 0);
    assert.equal(output.metrics.meanSignedBias, null);
    assert.equal(output.metrics.meanAbsoluteRealizedError, null);
    assert.equal(output.record.n, 0);
    assert.deepEqual(output.weekly, []);
    const sentiment = buildSentiment({ history: one({ entries: [e] }), market: 'spread', season: 2026, week: 6 });
    assert.equal(sentiment.games[0].count, 0);
    assert.equal(sentiment.games[0].median, null);
  }
  assert.equal(playerObservations({ ...one(), members: [] }, 'spread').length, 0);
});

test('own locked current guesses count with closed gates and retain reference provenance without mutation', () => {
  const g = game();
  const h = one({ gate: false, result: null, entries: [entry(g, { status: 'draft' }, pick(g, -7, -3.5, {
    reference: reference(-3.5, { basis: 'line-at-guess', guessedAtKnown: false, guessedAt: '2026-10-14T17:05:00Z', label: 'Original guess time unavailable' })
  }))] });
  const before = structuredClone(h);
  const observations = playerObservations(h, 'guess_spread');
  assert.equal(observations.length, 1);
  assert.equal(observations[0].reference.basis, 'line-at-guess');
  assert.equal(observations[0].reference.guessedAtKnown, false);
  const output = build(h, { week: 6 });
  assert.equal(output.sample, 1);
  assert.equal(output.record.n, 0);
  assert.equal(output.current[0].sourceTime, '2026-10-14T17:00:00Z');
  assert.equal(output.current[0].reference.label, 'Original guess time unavailable');
  assert.deepEqual(h, before);
  assert.equal(buildSentiment({ history: h, market: 'spread', season: 2026, week: 6 }).games[0].count, 1);
});

test('duplicates count once and conflicting duplicate picks, entries, games or results fail closed in either order', () => {
  const g = game();
  const h = one();
  h.weeks[0].entries.push(structuredClone(h.weeks[0].entries[0]));
  h.weeks.push(structuredClone(h.weeks[0]));
  assert.equal(build(h).sample, 1);
  for (const change of [
    w => { w.entries[0].picks.push(pick(g, -6, -3.5)); },
    w => { w.entries.push(entry(g, {}, pick(g, -6, -3.5))); },
    w => { w.games.push({ ...g, homeCode: 'BUF' }); }
  ]) {
    const bad = one(); change(bad.weeks[0]);
    assert.equal(build(bad).sample, 0);
    bad.weeks[0].entries.reverse(); bad.weeks[0].games.reverse();
    assert.equal(build(bad).sample, 0);
  }
  const badResults = one();
  badResults.weeks.push({ ...structuredClone(badResults.weeks[0]), results: { [g.id]: { status: 'final', home: 99, away: 20 } } });
  assert.equal(build(badResults).sample, 0);
  assert.equal(build({ ...badResults, weeks: badResults.weeks.toReversed() }).sample, 0);
});

test('last 5 and 10 select games before filtering direction or covers, with exact bounds', () => {
  const rows = Array.from({ length: 12 }, (_, i) => {
    const g = game('G' + i, 'CAR', 'ATL', new Date(Date.UTC(2026, 8, 1 + i)).toISOString());
    return { g, week: 1 + i, entries: [entry(g, {}, pick(g, i < 8 ? -7 : -3.5, -3.5))] };
  });
  const output = build(historyOf(rows), { week: 18, window: 'last5' });
  assert.equal(output.sample, 5);
  assert.equal(output.record.n, 1);
  assert.deepEqual(output.games.map(g => g.week), [8, 9, 10, 11, 12]);
  assert.equal(output.from.week, 8);
  assert.equal(output.to.week, 12);
  assert.equal(output.windows.last10.sample, 10);
  assert.equal(output.windows.last10.record.n, 6);
  assert.equal(output.exclusions.noDirection, 4);
});

test('original competition weeks and seasons survive Monday and cross-season charts and windows', () => {
  const rows = [
    { g: game('OLD'), season: 2022, week: 18 },
    { g: game('S25'), season: 2025, week: 18 },
    { g: game('MONDAY', 'CAR', 'ATL', '2026-10-20T00:30:00Z'), season: 2026, week: 6 },
    { g: game('FUTURE'), season: 2026, week: 9 }
  ];
  const output = build(historyOf(rows));
  assert.deepEqual(output.weekly.map(w => [w.season, w.week]), [[2022, 18], [2025, 18], [2026, 6]]);
  assert.equal(output.windows.season.sample, 1);
  assert.equal(output.windows.years3.sample, 2);
  assert.equal(output.windows.years5.sample, 3);
  assert.equal(build(historyOf(rows), { season: 2025, week: 18 }).sample, 2);
  assert.throws(() => build(historyOf(rows), { window: 'unknown' }), /window/i);
});

test('directional W-L-P denominator excludes pushes and zero gap; Wilson is descriptive 95 percent', () => {
  const rows = [5, 0, 3, 5].map((margin, i) => {
    const g = game('R' + i);
    return { g, week: i + 1, result: { status: 'final', home: 20 + margin, away: 20 },
      entries: [entry(g, {}, pick(g, i === 3 ? -3.5 : -7, i === 2 ? -3 : -3.5))] };
  });
  const output = build(historyOf(rows));
  assert.deepEqual([output.record.W, output.record.L, output.record.P, output.record.n, output.record.decided], [1, 1, 1, 3, 2]);
  assert.equal(output.record.hitRate, 0.5);
  assert.ok(Math.abs(output.record.wilson95[0] - 0.0945312057) < 1e-8);
  assert.ok(Math.abs(output.record.wilson95[1] - 0.9054687943) < 1e-8);
  assert.deepEqual([output.againstRecord.W, output.againstRecord.L, output.againstRecord.P], [1, 1, 1]);
});

test('recurring needs five decided games over three weeks and attaches permitted next-week evidence separately', () => {
  const rows = Array.from({ length: 6 }, (_, i) => {
    const g = game('CAR' + i);
    return { g, week: Math.floor(i / 2) + 1 };
  });
  const currentGame = game('NEXT');
  rows.push({ g: currentGame, week: 4, result: null, gate: false });
  const h = historyOf(rows);
  const output = build(h, { team: 'CAR', week: 4 });
  const callout = output.callouts.find(c => c.team === 'CAR' && c.direction === 'for');
  assert.equal(callout.status, 'recurring');
  assert.equal(callout.record.n, 6);
  assert.equal(callout.competitionWeeks, 3);
  assert.equal(callout.games.length, 6);
  assert.equal(callout.current.length, 1);
  assert.equal(callout.current[0].guess, -7);
  assert.equal(callout.current[0].reference.value, -3.5);
  assert.equal(callout.current[0].strengthGap, 3.5);
  assert.equal(output.record.n, 6);
  assert.equal(output.current.length, 1);
  assert.equal(build(h).sample, 7);
  assert.equal(build(h).callouts.filter(c => c.team === 'ATL').length, 1);
  const hidden = structuredClone(h);
  hidden.viewer = 'other';
  assert.equal(build(hidden, { team: 'CAR', week: 4 }).callouts[0].current.length, 0);
  assert.equal(build(historyOf(rows.slice(0, 4)), { team: 'CAR' }).callouts[0].status, 'small-sample');
  const twoWeeks = historyOf(rows.slice(0, 6).map((r, i) => ({ ...r, week: i % 2 + 1 })));
  assert.equal(build(twoWeeks, { team: 'CAR' }).callouts[0].status, 'small-sample');
});

test('recent and earlier callout records are non-overlapping and qualify opposite outcomes', () => {
  const rows = Array.from({ length: 10 }, (_, i) => {
    const g = game('C' + i, 'CAR', 'ATL', new Date(Date.UTC(2026, 8, i + 1)).toISOString());
    return { g, week: i + 1, result: { status: 'final', home: i < 5 ? 20 : 25, away: 20 } };
  });
  const output = build(historyOf(rows), { team: 'CAR', week: 18 });
  const c = output.callouts[0];
  assert.equal(c.recent.record.W, 5);
  assert.equal(c.earlier.record.L, 5);
  assert.equal(c.conflictingWindows, true);
  assert.equal(c.recent.games.some(g => c.earlier.games.some(e => e.key === g.key)), false);
  assert.match(c.text, /descriptive|historical/i);
});

test('sentiment groups only permitted locked guesses, compares own saved references and reports time coverage', () => {
  const g = game();
  const h = one({ result: null, entries: [
    entry(g),
    entry(g, { userId: 'other' }, pick(g, -2, -4, { reference: reference(-4, { observedAt: null, capturedAt: null }) })),
    entry(g, { mode: 'guess_total' }, pick(g, 999, 888))
  ] });
  const sentiment = buildSentiment({ history: h, market: 'guess_spread', season: 2026, week: 6 });
  assert.equal(sentiment.games.length, 1);
  const s = sentiment.games[0];
  assert.equal(s.count, 2);
  assert.equal(s.median, -4.5);
  assert.deepEqual(s.savedReferenceCounts, { above: 1, equal: 0, below: 1 });
  assert.equal(s.sourceTimes.known, 1);
  assert.equal(s.sourceTimes.missing, 1);
  assert.equal(s.sourceTimes.from, '2026-10-14T17:00:00Z');
  assert.match(sentiment.label, /GTL guesses/);
  assert.match(sentiment.referenceNote, /own saved reference/);
  const closed = one({ gate: false, entries: [entry(g, { userId: 'other' })] });
  assert.deepEqual(buildSentiment({ history: closed, market: 'spread', season: 2026, week: 6 }).games, []);
  const emptyOpen = one({ entries: [] });
  const empty = buildSentiment({ history: emptyOpen, market: 'spread', season: 2026, week: 6 }).games[0];
  assert.equal(empty.count, 0);
  assert.equal(empty.median, null);
});

test('legacy reveal fallback is market-specific; a present gate always overrides whole-market reveal', () => {
  const g = game();
  const h = one({ gate: false, entries: [entry(g, { userId: 'other' })] });
  h.weeks[0].gate = null;
  h.weeks[0].revealed = { guess_spread: true, guess_total: false };
  assert.equal(playerObservations(h, 'spread').length, 1);
  h.weeks[0].gate = {};
  assert.equal(playerObservations(h, 'spread').length, 0);
});

test('all-team callouts keep exact matchup slices and attach current evidence only to its matching direction', () => {
  const car = game('CAR-HISTORY');
  const buf = game('BUF-HISTORY', 'BUF', 'NYJ');
  const current = game('CAR-CURRENT');
  const h = historyOf([
    { g: car, week: 1 },
    { g: buf, week: 2 },
    { g: current, week: 7, result: null, entries: [entry(current, {}, pick(current, -1, -3.5))] }
  ]);
  const output = build(h);
  const carFor = output.callouts.find(c => c.team === 'CAR' && c.direction === 'for');
  assert.deepEqual(carFor.games.map(g => g.game.id), ['CAR-HISTORY']);
  assert.deepEqual(carFor.current, []);
  assert.equal(output.callouts.find(c => c.team === 'BUF').games.length, 1);
  assert.deepEqual(output.directionCounts, { positive: 2, equal: 0, negative: 1 });
});

test('last five team games precede each direction subset; unrelated matchups do not consume a team window', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ g: game('CAR-T' + i), week: i + 1 }));
  for (let i = 0; i < 6; i++) rows.push({ g: game('BUF-T' + i, 'BUF', 'NYJ'), week: i + 7 });
  const output = build(historyOf(rows), { week: 18 });
  const car = output.callouts.find(c => c.team === 'CAR' && c.direction === 'for');
  assert.equal(car.recent.sample, 5);
  assert.equal(car.earlier.sample, 1);
});

test('a visible conflicting duplicate cannot rescue invalid eligibility or reference data', () => {
  const g = game();
  for (const duplicate of [
    entry(g, { eligible: false }),
    entry(g, {}, pick(g, -7, -3.5, { points: null })),
    entry(g, {}, pick(g, -7, -3.5, { reference: reference(-3.5, { basis: 'none' }) }))
  ]) {
    const h = one({ entries: [entry(g), duplicate] });
    assert.equal(build(h).sample, 0);
    assert.equal(build({ ...h, weeks: [{ ...h.weeks[0], entries: h.weeks[0].entries.toReversed() }] }).sample, 0);
  }
});

test('mean errors use every eligible guess and only finalized realized errors; team totals stay independent', () => {
  const g1 = game('ERROR1'), g2 = game('ERROR2');
  const h = historyOf([
    { g: g1, week: 1 },
    { g: g2, week: 2, result: null, entries: [entry(g2, {}, pick(g2, -2.5, -3.5))] }
  ]);
  const output = build(h);
  assert.equal(output.metrics.meanSignedBias, 1.25);
  assert.equal(output.metrics.meanAbsoluteMarketError, 2.25);
  assert.equal(output.metrics.meanAbsoluteRealizedError, 2);
  assert.equal(output.metrics.realizedSample, 1);
  const total = one({ entries: [entry(g1, { mode: 'guess_total' }, pick(g1, 40, 43.5))], g: g1 });
  const under = build(total, { market: 'total', team: 'CAR' });
  assert.equal(under.games[0].direction, 'under');
  assert.equal(under.games[0].marketResult, 'L');
  assert.equal(under.againstRecord.W, 1);
  assert.equal(under.callouts[0].direction, 'under');
  assert.equal(under.callouts[0].team, 'CAR');
});

test('Panthers away seven-point win also pushes the guessed line', () => {
  const g = game('CAR-ATL-PUSH', 'ATL', 'CAR');
  const h = one({ g, result: { status: 'final', home: 20, away: 27 }, entries: [entry(g, {}, pick(g, 7, 3.5))] });
  assert.equal(build(h, { team: 'CAR' }).games[0].guessedResult, 'P');
});

test('five decided directional games qualify across three weeks; pushes cannot satisfy the threshold', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ g: game('THRESHOLD' + i), week: Math.floor(i / 2) + 1 }));
  const qualified = build(historyOf(rows), { team: 'CAR' }).callouts[0];
  assert.equal(qualified.status, 'recurring');
  assert.equal(qualified.record.decided, 5);
  const pushes = structuredClone(rows);
  pushes[4].result = { status: 'final', home: 23, away: 20 };
  pushes[4].entries = [entry(pushes[4].g, {}, pick(pushes[4].g, -7, -3))];
  const small = build(historyOf(pushes), { team: 'CAR' }).callouts[0];
  assert.equal(small.record.P, 1);
  assert.equal(small.record.decided, 4);
  assert.equal(small.status, 'small-sample');
});
