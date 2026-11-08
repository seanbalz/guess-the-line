// D-69 Play › Your score (spec section 6, mockup Q1-B) and its game layer (P2B): the pure view rules in
// web/src/next/play/yourScore.js. Each test names the contract it guards. Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameView, heroModel, layerMeta, numberLine, rankChip, rowView, scoreFinePrint, scoreTile } from '../web/src/next/play/yourScore.js';
import { scoreRows, scoreSummary } from '../web/src/next/play/scoring.js';

const SEA_DEN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const LAC_LV = { id: 'LAC-LV', awayCode: 'LAC', homeCode: 'LV', kickoff: '2026-10-25T20:25:00Z' };
const pick = (gameId, guess, points, line, extra = {}) => ({ gameId, guess, lockedIn: true, lockedAt: '2026-10-21T18:00:00Z', points, reference: { value: line, source: 'Fixture median' }, ...extra });
const entry = (picks, extra = {}) => ({ userId: 'u-me', mode: 'guess_spread', status: 'submitted', eligible: true, scoreTiming: 'immediate', weekPoints: 15, standingsPoints: 10, awaitingKickoffPoints: 5, picks, ...extra });
const week8 = { season: 2026, week: 8, games: [SEA_DEN, LAC_LV] };
const rowsOf = e => scoreRows(week8, e);

test('number line: a Spread is drawn as the favored team\'s margin, your dot and the saved line on one axis, the gap growing from the line', () => {
  const exact = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: -3, line: -3 });
  assert.equal(exact.caption, 'DEN wins by', 'a negative home spread favors the home team');
  assert.deepEqual(exact.ticks.map(t => t.label), ['1', '2', '3', '4', '5']);
  assert.deepEqual([exact.line.pct, exact.you.pct], [50, 50]);
  assert.equal(exact.gap, null, 'an exact guess has no gap');
  assert.equal(exact.aria, 'Line DEN −3, you DEN −3, exact');
  const away = numberLine({ mode: 'guess_spread', game: LAC_LV, guess: 4, line: 6.5 });
  assert.equal(away.caption, 'LAC wins by', 'a positive home spread favors the away team');
  assert.deepEqual([away.line.label, away.you.label], ['Line LAC −6.5', 'You LAC −4']);
  assert.deepEqual(away.gap, { left: 25, width: 31.3, origin: 'right' }, 'you are left of the line, so the gap grows leftward from it');
  assert.equal(away.aria, 'Line LAC −6.5, you LAC −4, off by 2.5');
  const flipped = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: 2, line: -3 });
  assert.equal(flipped.caption, 'DEN wins by', 'the saved line picks the team, never your guess');
  assert.deepEqual(flipped.ticks.map(t => t.label), ['−4', '−2', '0', '2', '4', '6'], 'your SEA −2 is DEN losing by 2');
  assert.equal(flipped.you.label, 'You SEA −2');
  const pickem = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: 0, line: 0 });
  assert.deepEqual([pickem.caption, pickem.line.label], ['DEN wins by', "Line Pick'em"]);
});

test('number line: a Total is the game\'s points; ticks stay whole and at most eight for any miss; edge labels stay on the card', () => {
  const total = numberLine({ mode: 'guess_total', game: SEA_DEN, guess: 46, line: 44.5 });
  assert.equal(total.caption, 'Total points');
  assert.deepEqual(total.ticks.map(t => t.label), ['42', '43', '44', '45', '46', '47', '48']);
  assert.deepEqual(total.gap, { left: 41.7, width: 25, origin: 'left' });
  const far = numberLine({ mode: 'guess_total', game: SEA_DEN, guess: 58, line: 40 });
  assert.deepEqual(far.ticks.map(t => t.label), ['35', '40', '45', '50', '55', '60']);
  assert.equal(far.you.align, 'end', 'a label near the right edge ends at its dot instead of leaving the card');
  for (let line = -30; line <= 80; line += 0.5) for (let guess = -30; guess <= 90; guess += 1.5) {
    const drawn = numberLine({ mode: line > 30 ? 'guess_total' : 'guess_spread', game: SEA_DEN, guess, line });
    assert.ok(drawn.ticks.length <= 8, `${guess} vs ${line}: ${drawn.ticks.length} ticks`);
    assert.ok(drawn.ticks.every(t => Number.isInteger(t.value)));
    for (const mark of [drawn.line, drawn.you]) assert.ok(mark.pct >= 0 && mark.pct <= 100);
  }
  assert.equal(numberLine({ mode: 'guess_total', game: SEA_DEN, guess: null, line: 44 }), null, 'no line is drawn without both numbers');
});

test('rows (Q1-B): a scored game says Line · You · off by with its points pill and bar; a legitimate 0 is 0 / 10; other games say their state', () => {
  const rows = rowsOf(entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]));
  assert.deepEqual(rowView(rows[0], 'guess_spread'), { meta: 'Line DEN −3 · You DEN −3 · exact', pill: { text: '10 / 10', tier: 'exact', number: true }, bullseye: true, share: 1 });
  assert.deepEqual(rowView(rows[1], 'guess_spread'), { meta: 'Line LAC −6.5 · You LAC −4 · off by 2.5', pill: { text: '5 / 10', tier: 'low', number: true }, bullseye: false, share: 0.5 });
  const zero = rowView(rowsOf(entry([pick('SEA-DEN', -3, 0, -9)]))[0], 'guess_spread');
  assert.deepEqual([zero.pill.text, zero.share], ['0 / 10', 0]);
  assert.equal(rowView(rowsOf(entry([pick('SEA-DEN', -3, 8, -4)]))[0], 'guess_spread').pill.tier, 'good');
  const waiting = rowView(rowsOf(entry([pick('SEA-DEN', -3, null, null, { reference: { status: 'pending', value: null } })]))[0], 'guess_spread');
  assert.deepEqual(waiting, { meta: 'You DEN −3 · waiting for a line', pill: { text: 'Waiting', tier: 'none', number: false }, bullseye: false, share: null });
  const draft = rowView(rowsOf(entry([{ gameId: 'SEA-DEN', guess: -3, lockedIn: false }], { status: 'draft' }))[0], 'guess_spread');
  assert.deepEqual([draft.meta, draft.pill.text], ['Draft · not scored', 'Draft']);
  assert.deepEqual(rowView(rowsOf(entry([]))[1], 'guess_spread').pill.text, 'No pick');
});

test('hero: the server\'s week total, out of what the scored games could earn, with Bullseyes and the average miss; a filter says Selected games', () => {
  const e = entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  const hero = heroModel({ mode: 'guess_spread', week: 8, entry: e, rows: rowsOf(e) });
  assert.deepEqual(hero, { eyebrow: 'Week 8 · Spread', points: 15, count: true, scored: 2, exact: 1, share: 0.75, bar: 75, meterLabel: '15 of 20 possible points',
    line: '20 possible · 1 Bullseye · avg miss 1.3', note: null });
  const filtered = heroModel({ mode: 'guess_spread', week: 8, entry: e, rows: scoreRows(week8, e, { team: 'LV' }), filtered: true });
  assert.deepEqual([filtered.eyebrow, filtered.points, filtered.count], ['Selected games', 5, false], 'a filtered subtotal never counts up');
  assert.equal(heroModel({ mode: 'guess_total', week: 8, entry: null, rows: [] }).note, 'No saved Total guesses for this week.');
  const ineligible = heroModel({ mode: 'guess_spread', week: 8, entry: { ...e, eligible: false }, rows: rowsOf({ ...e, eligible: false }) });
  assert.deepEqual([ineligible.points, ineligible.note], [null, 'Not eligible for scoring this week.'], 'an ineligible ballot never shows points');
  assert.equal(layerMeta({ week: 8, known: true, summary: scoreSummary(rowsOf(e)) }), 'Week 8 · 2 of 2 scored');
  assert.equal(layerMeta({ week: 8, known: true, summary: scoreSummary(rowsOf(e)), final: true }), 'Week 8 · all games scored');
  assert.equal(layerMeta({ week: 7, known: false, summary: scoreSummary([]) }), 'Week 7 · no record');
});

test('fine print (D-38, behind ⓘ): immediate own points stay apart from the started-game standings; a filter never makes a rank', () => {
  const e = entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  const lines = scoreFinePrint({ entry: e, summary: scoreSummary(rowsOf(e)) });
  assert.deepEqual(lines, ['2 scored · 2 locked · 0 not locked.', '0 waiting for a line · 0 ineligible.', 'Your eligible locked guesses count immediately.',
    '10 points in shared standings (games started).', '5 personal points waiting for kickoff.',
    'Every player, including you, uses the same games that have started. A week in progress is not a final weekly win.']);
  const filtered = scoreFinePrint({ entry: e, summary: scoreSummary([]), filtered: true });
  assert.ok(filtered.includes('A filtered subset. Filters do not change the whole-week standings or create a new rank.'));
  assert.ok(!filtered.some(line => line.includes('standings (games started)') || line.includes('waiting for kickoff')));
});

test('game layer (P2B): points, BULLSEYE, one sentence and the number line for a scored game; one sentence for a game not scored yet', () => {
  const [bull, miss] = rowsOf(entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5, { late: { minutes: 3 } })]));
  const exact = gameView({ row: bull, mode: 'guess_spread', week: 8 });
  assert.deepEqual([exact.meta, exact.points, exact.bullseye, exact.sentence], ['Week 8 · Guess the Spread', 10, true, 'Right on the line']);
  assert.equal(exact.line.aria, 'Line DEN −3, you DEN −3, exact');
  const off = gameView({ row: miss, mode: 'guess_spread', week: 8 });
  assert.deepEqual([off.sentence, off.bullseye, off.late], ['Off by 2.5', false, 'Late · 3 min']);
  const pending = gameView({ row: rowsOf(entry([pick('SEA-DEN', -3, null, null, { reference: { status: 'pending', value: null } })]))[0], mode: 'guess_spread', week: 8 });
  assert.deepEqual([pending.scored, pending.sentence, pending.line, pending.you], [false, 'Waiting for a scoring line.', null, 'DEN −3']);
  const ineligible = gameView({ row: rowsOf(entry([pick('SEA-DEN', -3, 10, -3)], { eligible: false }))[0], mode: 'guess_spread', week: 8 });
  assert.deepEqual([ineligible.scored, ineligible.sentence, ineligible.bullseye, ineligible.line], [false, 'Not eligible for scoring.', false, null]);
});

test('rank chip: ordinal or shared, the move as a number the symbol and the words both carry; unranked draws nothing', () => {
  assert.deepEqual(rankChip({ rank: 3, tied: false }, 2), { rank: 3, label: '3rd', move: 2, said: 'season rank 3rd, up 2' });
  assert.deepEqual(rankChip({ rank: 2, tied: true }, -1), { rank: 2, label: 'T-2', move: -1, said: 'season rank T-2, down 1' });
  assert.equal(rankChip({ rank: 1, tied: false }, 0).move, null, 'no change shows no arrow');
  assert.equal(rankChip({ rank: null, tied: false }, 2), null);
});

test('landing tile (P1B): the latest scored week of one market, "Week 8 · ▲ 2" with the good tone only for a rise, and the place it opens', () => {
  const data = { viewer: 'u-me', season: 2026, weeks: [
    { ...week8, week: 7, entries: [entry([pick('SEA-DEN', -3, 6, -1)], { weekPoints: 6 })] },
    { ...week8, entries: [entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)])] },
    { ...week8, week: 9, entries: [entry([{ gameId: 'SEA-DEN', guess: -3, lockedIn: false }], { status: 'draft', weekPoints: null })] },
  ] };
  const up = scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, 2) } });
  assert.deepEqual(up, { big: '15', sub: 'Week 8 · ▲ 2', tone: 'good', said: 'Your score, Week 8 Spread, 15 points, season rank 3rd, up 2', open: { season: 2026, week: 8, market: 'guess_spread' } });
  const down = scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, -1) } });
  assert.deepEqual([down.sub, down.tone], ['Week 8 · ▼ 1', 'plain'], 'a drop stays quiet: the symbol says it, no state color');
  assert.equal(scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, null) } }).sub, 'Week 8 · 3rd');
  const other = scoreTile({ data, mode: 'guess_total' });
  assert.deepEqual([other.big, other.open.market], ['15', 'guess_spread'], 'no Total scores: the tile shows Spread, never a Spread + Total sum');
  assert.deepEqual(scoreTile({ loading: true }).big, '—');
  assert.equal(scoreTile({ error: { status: 500 } }).sub, 'Open to retry');
  assert.equal(scoreTile({ data: { viewer: 'u-me', season: 2026, weeks: [] } }).sub, 'No scores yet');
});
