import test from 'node:test';
import assert from 'node:assert/strict';
import { applySportsbookSources } from '../cloud/sportsbook-sources.mjs';

const now = Date.parse('2030-10-10T18:00:00Z');
const iso = n => new Date(n).toISOString();
const books = ['draftkings', 'fanduel', 'betmgm'];
const game = { id: 'one', home: 'Home Team', away: 'Away Team', kickoff: iso(now + 3600000) };
function snapshot(id, stamp, market = 'spread', values = [-3, -3.5, -3]) {
  return { id, createdAt: iso(stamp + 1000), payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(stamp),
    games: [{ gameId: game.id, home: game.home, away: game.away, kickoff: game.kickoff, providerEventId: 'event', matchStatus: 'matched',
      markets: { [market]: { quotes: books.map((book, i) => ({ provider: 'the-odds-api', providerEventId: 'event', book, market, value: values[i],
        timeBasis: 'provider_market_last_update', collectedAt: iso(stamp), providerObservedAt: iso(stamp - 10000),
        outcomes: market === 'spread' ? { home: { line: values[i] }, away: { line: -values[i] } }
          : { over: { line: values[i] }, under: { line: values[i] } },
      })), unavailable: [] } } }] } };
}
const view = (reference, mode = 'guess_spread') => ({ revealed: true, mode, games: [{ ...game, scoringReference: reference }] });
const saved = (stamp, id = 'original') => ({ status: 'available', value: -3, source: 'The Odds API · 3-book median', snapshotId: id,
  capturedAt: iso(stamp), observedAt: iso(stamp - 10000), savedAt: iso(stamp + 2000) });

test('sportsbook source breakdown is absent before reveal and across unrelated modes', () => {
  for (const state of [{ ...view(), revealed: false }, { ...view(), mode: 'betting_challenge' }, { ...view(), revealed: undefined }]) {
    assert.equal(applySportsbookSources(state, snapshot('current', now - 60000), now), state);
  }
});
test('saved scoring books remain fixed while latest books and consensus change', () => {
  const prior = snapshot('original', now - 3600000), latest = snapshot('latest', now - 60000, 'spread', [-6, -6.5, -6]);
  latest.history = [prior];
  const result = applySportsbookSources(view(saved(now - 3600000)), latest, now).games[0].sportsbookSources;
  assert.equal(result.scoring.value, -3); assert.equal(result.scoring.status, 'available');
  assert.deepEqual(result.scoring.quotes.slice(0, 3).map(q => q.status), ['included', 'included', 'included']);
  assert.equal(result.latest.value, -6); assert.equal(result.latest.status, 'available');
  assert.equal(result.latest.quotes[1].source, 'FanDuel');
  assert.equal(result.latest.quotes.at(-1).source, 'Caesars');
  assert.equal(result.latest.quotes.at(-1).value, null);
  assert.equal(result.actionNetwork.status, 'unavailable');
});
test('persisted receipt keeps original source breakdown beyond bounded collection history', () => {
  const stamp = now - 3600000, ref = saved(stamp);
  ref.quotes = books.map((book, i) => ({ book, value: [-3, -3.5, -3][i], observedAt: iso(stamp - 10000), collectedAt: iso(stamp) }));
  const result = applySportsbookSources(view(ref), snapshot('new', now - 60000), now).games[0].sportsbookSources;
  assert.equal(result.scoring.quotes[1].value, -3.5);
  assert.equal(result.scoring.quotes[1].status, 'included');
  ref.quotes[1].collectedAt = iso(now);
  assert(applySportsbookSources(view(ref), null, now).games[0].sportsbookSources.scoring.quotes.every(q => q.value === null));
});
test('stale latest observations remain timestamped while excluded from a fresh reference', () => {
  const result = applySportsbookSources(view(), snapshot('old', now - 600000), now).games[0].sportsbookSources;
  assert.equal(result.latest.status, 'stale'); assert.equal(result.latest.value, -3);
  assert.equal(result.latest.quotes[0].status, 'excluded');
  assert.equal(result.scoring.value, null);
});
test('duplicates, future data, mismatched events and partial books cannot form consensus', () => {
  for (const mutate of [s => { s.payload.games[0].markets.spread.quotes[1].book = 'draftkings'; },
    s => { s.createdAt = iso(now + 1); }, s => { s.payload.games[0].away = 'Wrong'; },
    s => { s.payload.games[0].markets.spread.quotes.pop(); },
    s => { s.payload.games[0].markets.spread.quotes[0].providerObservedAt = iso(now + 1000); }]) {
    const input = snapshot('bad', now - 60000); mutate(input);
    const result = applySportsbookSources(view(), input, now).games[0].sportsbookSources;
    assert.equal(result.latest.status, 'unavailable'); assert.equal(result.latest.value, null);
  }
});
test('total sources expose totals only and scoring breakdown must match stored median', () => {
  const input = snapshot('total', now - 60000, 'total', [43.5, 44, 44.5]);
  const result = applySportsbookSources(view(null, 'guess_total'), input, now).games[0].sportsbookSources;
  assert.equal(result.market, 'total'); assert.equal(result.latest.value, 44);
  const ref = saved(now - 60000, 'total'); ref.value = 43;
  const bad = applySportsbookSources(view(ref, 'guess_total'), input, now).games[0].sportsbookSources;
  assert(bad.scoring.quotes.every(q => q.value === null));
});
test('a first line after submission shows when collected after the save, also with a book observed before it; a pending guess shows its pending state', () => {
  const stamp = now - 60000, line = snapshot('first-after', stamp);
  const firstAfter = savedAt => ({ status: 'available', basis: 'first_line_after_submission', value: -3, source: 'The Odds API · 3-book median',
    snapshotId: 'first-after', capturedAt: iso(stamp), observedAt: iso(stamp - 10000), savedAt: iso(savedAt) });
  const shown = applySportsbookSources(view(firstAfter(stamp - 20000)), line, now).games[0].sportsbookSources.scoring;
  assert.equal(shown.status, 'available'); assert.equal(shown.basis, 'first_line_after_submission'); assert.equal(shown.value, -3);
  assert.deepEqual(shown.quotes.slice(0, 3).map(q => q.status), ['included', 'included', 'included']);
  // Collected 5 s after the save, every book observed 10 s before the collection (5 s before the save): still its line.
  const observedBefore = applySportsbookSources(view(firstAfter(stamp - 5000)), line, now).games[0].sportsbookSources.scoring;
  assert.equal(observedBefore.status, 'available'); assert.equal(observedBefore.value, -3); assert.equal(observedBefore.basis, 'first_line_after_submission');
  assert.equal(observedBefore.observedAt, iso(stamp - 10000)); assert.equal(observedBefore.savedAt, iso(stamp - 5000));
  assert.deepEqual(observedBefore.quotes.slice(0, 3).map(q => q.status), ['included', 'included', 'included']);
  // A collection made at or before the save is never a first line after it.
  for (const savedAt of [stamp, stamp + 1000]) {
    const collectedBefore = applySportsbookSources(view(firstAfter(savedAt)), line, now).games[0].sportsbookSources.scoring;
    assert.equal(collectedBefore.status, 'unavailable'); assert.equal(collectedBefore.value, null);
  }
  const atGuess = applySportsbookSources(view(saved(stamp)), snapshot('original', stamp), now).games[0].sportsbookSources.scoring;
  assert.equal(atGuess.basis, 'line_at_guess');
  const pending = applySportsbookSources(view({ status: 'pending', basis: 'first_line_after_submission', value: null, savedAt: iso(stamp), reason: 'Waiting.' }), line, now).games[0].sportsbookSources.scoring;
  assert.equal(pending.status, 'pending'); assert.equal(pending.value, null); assert.equal(pending.basis, 'first_line_after_submission');
  assert(pending.quotes.slice(0, 3).every(q => q.reason === 'Waiting for the first line collected after this guess.'));
});
