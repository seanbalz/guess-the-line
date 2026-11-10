// EPL stage 3: candidate extraction from synthetic OCR words (tests/helpers/sleeper-ocr-fixture.mjs), multi-image merge
// and the reviewed order. No screenshot or real score is used; real-screenshot acceptance is a separate manual check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMatchups, findWeek, matchHandle, mergeExtractions, normalizeHandle, parseScoreInput, reviewOrder, scoreToken } from '../shared/epl-score-import.mjs';
import { pickOrder } from '../shared/epl-draft.mjs';
import { FIXTURE_MANAGERS as M, fullCards, sleeperWords } from './helpers/sleeper-ocr-fixture.mjs';

const ids = M.map(m => m.ownerId);
const byOwner = result => Object.fromEntries(result.sides.map(s => [s.ownerId, s]));

test('score tokens are decimals only: percentages, records, ranks, balances and integers are ignored', () => {
  assert.equal(scoreToken('61.20'), 61.2);
  assert.equal(scoreToken('48,75'), 48.75);
  assert.equal(scoreToken('−3.50'), -3.5);
  for (const text of ['62%', '5-3', '#2', '$12.50', '100', '1st', 'WEEK', '12.345', '', null]) assert.equal(scoreToken(text), null, String(text));
  assert.equal(parseScoreInput(' 48.75 '), 48.75);
  assert.equal(parseScoreInput('0'), 0, 'an explicit zero is a real value');
  for (const text of ['', ' ', '48.755', 'abc', '1e3', null, undefined]) assert.equal(parseScoreInput(text), null, String(text));
});

test('usernames resolve to the immutable owner id; one OCR slip is a flagged near match; short or unknown handles never match', () => {
  assert.equal(normalizeHandle('@SeanBalz,'), 'seanbalz');
  assert.deepEqual(matchHandle('@seanbalz', M), { owners: ['473955676301815808'], fuzzy: false });
  assert.deepEqual(matchHandle('aharrison', M), { owners: ['719745569895018496'], fuzzy: true });
  assert.deepEqual(matchHandle('Team 1', M), { owners: [], fuzzy: false });
  assert.deepEqual(matchHandle('LFC', M), { owners: [], fuzzy: false });
  // Two managers one edit apart from the same word are both returned: ambiguous, not guessed.
  const twins = [{ ownerId: '1', sleeperName: 'striker1' }, { ownerId: '2', sleeperName: 'striker2' }];
  assert.deepEqual(matchHandle('striker', twins).owners, ['1', '2']);
});

test('the week header is read once; two different weeks in one image or none are flagged', () => {
  assert.deepEqual(findWeek(sleeperWords({ cards: [] })), { week: 11, issue: null });
  assert.deepEqual(findWeek([{ text: 'Week12', x0: 0, y0: 0, x1: 50, y1: 20 }]), { week: 12, issue: null });
  assert.deepEqual(findWeek(sleeperWords({ week: null, cards: [] })), { week: null, issue: 'missing' });
  const two = [...sleeperWords({ cards: [] }), { text: 'Week', x0: 80, y0: 900, x1: 180, y1: 940 }, { text: '12', x0: 200, y0: 900, x1: 240, y1: 940 }];
  assert.deepEqual(findWeek(two), { week: null, issue: 'ambiguous' });
});

test('a complete synthetic screenshot gives all eight large upper scores, never the projection underneath', () => {
  const result = extractMatchups({ words: sleeperWords({ cards: fullCards() }), managers: M });
  assert.equal(result.week, 11);
  assert.deepEqual(result.issues, []);
  assert.equal(result.sides.length, 8);
  const got = byOwner(result);
  const expected = [61.2, 48.75, 90.1, 55.05, 72.4, 33.3, 80, 66.65];
  ids.forEach((id, i) => {
    assert.equal(got[id].score, expected[i], M[i].name);
    assert.equal(got[id].projection, Math.round((expected[i] + 7.5) * 100) / 100, `${M[i].name} projection kept apart`);
    assert.deepEqual(got[id].issues, []);
  });
  assert.deepEqual(result.unmatched, []);
});

test('an unknown username leaves its side unmatched and that manager missing, never assigned by position', () => {
  const cards = fullCards();
  cards[1][0] = { ...cards[1][0], user: 'renamed_user' }; // Steven changed his display name
  const result = extractMatchups({ words: sleeperWords({ cards }), managers: M });
  const got = byOwner(result);
  assert.equal(got['702644837370929152'], undefined, 'the renamed manager is not guessed');
  assert.deepEqual(result.unmatched, [{ score: 90.1, projection: 97.6 }]);
  assert.equal(got['1259267898757611520'].score, 55.05, 'the other side of the card still reads');
  const merged = mergeExtractions([{ sha256: 'a', result }], ids);
  assert.equal(merged.rows.find(r => r.ownerId === '702644837370929152').status, 'missing');
  assert.equal(merged.rows.find(r => r.ownerId === '702644837370929152').score, null, 'missing is null, not zero');
});

test('a duplicate username in one image is flagged and no score is taken for it', () => {
  const cards = fullCards();
  cards[2][1] = { ...cards[2][1], user: 'seanbalz' }; // Mark's side shows Sean's handle
  const result = extractMatchups({ words: sleeperWords({ cards }), managers: M });
  const sean = byOwner(result)['473955676301815808'];
  assert.ok(sean.issues.includes('duplicate_username'));
  assert.equal(sean.score, null);
  const merged = mergeExtractions([{ sha256: 'a', result }], ids);
  assert.equal(merged.rows.find(r => r.ownerId === '473955676301815808').status, 'missing');
  assert.equal(merged.rows.find(r => r.ownerId === '1257180071064510465').status, 'missing');
});

test('a missing score and a near-match username are flagged for review', () => {
  const cards = fullCards();
  cards[3][1] = { ...cards[3][1], score: null };
  cards[0][1] = { ...cards[0][1], user: 'seanbaltz' };
  const result = extractMatchups({ words: sleeperWords({ cards }), managers: M });
  const got = byOwner(result);
  assert.ok(got['719745569895018496'].issues.includes('missing_score'));
  assert.equal(got['719745569895018496'].score, null);
  assert.ok(got['473955676301815808'].issues.includes('fuzzy_username'));
  assert.equal(got['473955676301815808'].score, 48.75);
  const merged = mergeExtractions([{ sha256: 'a', result }], ids);
  assert.equal(merged.rows.find(r => r.ownerId === '473955676301815808').status, 'check');
  assert.equal(merged.rows.find(r => r.ownerId === '719745569895018496').status, 'missing');
});

test('equal-size numbers are paired by position only when the layout is unambiguous', () => {
  const words = sleeperWords({ cards: fullCards() }).map(w => (/^-?\d+\.\d{2}$/.test(w.text) ? { ...w, y1: w.y0 + 30 } : w));
  const result = extractMatchups({ words, managers: M });
  assert.ok(result.issues.includes('size_unclear'));
  assert.equal(byOwner(result)['719658248843632640'].score, 61.2, 'upper value of each stacked pair');
  assert.ok(byOwner(result)['719658248843632640'].issues.includes('size_unclear'));
  // One stray number line breaks the pairing: nothing is guessed.
  const stray = [...words, { text: '10.00', x0: 500, y0: 2000, x1: 560, y1: 2030 }];
  const unclear = extractMatchups({ words: stray, managers: M });
  assert.ok(unclear.sides.every(s => s.score === null && s.issues.includes('size_unclear')));
});

test('multiple crops merge by manager: agreeing values read once, repeated hashes are dropped, conflicts stay visible', () => {
  const top = sleeperWords({ cards: fullCards().slice(0, 2) });
  const bottom = sleeperWords({ cards: fullCards().slice(2), week: 11 });
  const a = extractMatchups({ words: top, managers: M }), b = extractMatchups({ words: bottom, managers: M });
  const merged = mergeExtractions([{ sha256: 'a', result: a }, { sha256: 'b', result: b }, { sha256: 'a', result: a }], ids);
  assert.equal(merged.week, 11);
  assert.equal(merged.weekIssue, null);
  assert.deepEqual(merged.duplicates, ['a']);
  assert.ok(merged.rows.every(r => r.status === 'read'), JSON.stringify(merged.rows.map(r => r.status)));
  const conflicting = fullCards(); conflicting[0][0] = { ...conflicting[0][0], score: '16.20' };
  const c = extractMatchups({ words: sleeperWords({ cards: conflicting }), managers: M });
  const both = mergeExtractions([{ sha256: 'a', result: a }, { sha256: 'c', result: c }], ids);
  const evan = both.rows.find(r => r.ownerId === '719658248843632640');
  assert.equal(evan.status, 'conflict');
  assert.equal(evan.score, null);
  assert.deepEqual(evan.candidates.map(x => x.score).sort(), [16.2, 61.2]);
});

test('a batch spanning two weeks is mixed and has no week', () => {
  const a = extractMatchups({ words: sleeperWords({ cards: fullCards(), week: 11 }), managers: M });
  const b = extractMatchups({ words: sleeperWords({ cards: fullCards(), week: 12 }), managers: M });
  const merged = mergeExtractions([{ sha256: 'a', result: a }, { sha256: 'b', result: b }], ids);
  assert.equal(merged.weekIssue, 'mixed');
  assert.equal(merged.week, null);
  assert.deepEqual(merged.weeks, [11, 12]);
});

test('the reviewed order is ascending score, then the lower season total, matching pickOrder; incomplete rows give no order', () => {
  const rows = ids.map((ownerId, i) => ({ ownerId, score: [61.2, 48.75, 90.1, 55.05, 72.4, 33.3, 80, 66.65][i], seasonTotal: null }));
  const { order, ties } = reviewOrder(rows);
  assert.deepEqual(ties, []);
  assert.deepEqual(order, pickOrder(rows.map(r => ({ id: r.ownerId, weekScore: r.score, weekBonus: 0, seasonTotal: 0 }))));
  const tied = rows.map((r, i) => (i === 1 ? { ...r, score: 61.2 } : r));
  const pending = reviewOrder(tied);
  assert.equal(pending.order, null);
  assert.deepEqual(pending.ties, [[ids[0], ids[1]]]);
  assert.deepEqual(pending.needTotals, [ids[0], ids[1]]);
  const withTotals = tied.map((r, i) => (i === 0 ? { ...r, seasonTotal: 700.5 } : i === 1 ? { ...r, seasonTotal: 650.25 } : r));
  const settled = reviewOrder(withTotals).order;
  assert.ok(settled.indexOf(ids[1]) < settled.indexOf(ids[0]));
  assert.deepEqual(settled, pickOrder(withTotals.map(r => ({ id: r.ownerId, weekScore: r.score, weekBonus: 0, seasonTotal: r.seasonTotal ?? 0 }))));
  const missing = reviewOrder(rows.map((r, i) => (i === 4 ? { ...r, score: null } : r)));
  assert.equal(missing.order, null);
  assert.deepEqual(missing.missing, [ids[4]]);
});

test('an unreadable card never borrows a neighbouring card\'s scores; common OCR confusions in a username are a flagged match', () => {
  const cards = fullCards();
  cards[1] = [{ ...cards[1][0], user: 'sthomaslll', score: null, projection: null }, { ...cards[1][1], score: null, projection: null }];
  const words = [...sleeperWords({ cards }), { text: '290', x0: 423, y0: 765, x1: 502, y1: 833 }, { text: 'U', x0: 511, y0: 803, x1: 522, y1: 815 }];
  const result = extractMatchups({ words, managers: M });
  const got = byOwner(result);
  assert.ok(got['702644837370929152'].issues.includes('fuzzy_username'), 'sthomaslll is a near match for sthomas111');
  for (const id of ['702644837370929152', '1259267898757611520']) {
    assert.equal(got[id].score, null);
    assert.ok(got[id].issues.includes('missing_score'));
  }
  assert.equal(got['1395236217460633600'].score, 72.4, 'the next card keeps its own scores');
  assert.equal(got['719658248843632640'].score, 61.2);
});
