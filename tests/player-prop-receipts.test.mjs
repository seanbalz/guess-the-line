// D-82 Player Props quote and actual-result receipts (cloud/player-prop-receipts.mjs). Pure fixtures: no provider, no
// credits, no hosted read. Lines and stats are illustrative values, not bookmaker quotes or account records.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPropReferenceSource, propReferenceFromQuotes, propResultReceipt, retainedPropQuotes } from '../cloud/player-prop-receipts.mjs';
import { normalizeResearchEvent } from '../cloud/research-provider.mjs';

const NOW = Date.parse('2026-11-12T20:00:00Z'), KICK = '2026-11-15T21:25:00Z', PLAYER = '00-0036358';
const OFFER = { season: 2026, week: 10, eventId: '2026_10_DAL_PHI', playerId: PLAYER, stat: 'player_reception_yds', away: 'DAL', home: 'PHI', kickoff: KICK };
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const quote = (book, side, line, observedAt = at(5), patch = {}) => ({ gameId: 'DAL-PHI', kickoff: KICK, provider: 'the-odds-api', providerEventId: 'evt-1', book, source: book,
  odds: -110, observedAt, capturedAt: observedAt, selection: { market: 'prop', key: 'player_reception_yds', side, line, playerId: PLAYER, playerName: 'Fixture', unit: 'yards' }, ...patch });
const full = (lines = [66.5, 67.5, 68.5], times = [5, 6, 7]) => ['draftkings', 'fanduel', 'betmgm'].flatMap((book, i) => [quote(book, 'over', lines[i], at(times[i])), quote(book, 'under', lines[i], at(times[i]))]);
const build = (quotes, offer = OFFER, now = NOW) => propReferenceFromQuotes(quotes, { offer, now });

test('a qualifying reference: three permitted books, median line in native units, source times kept for the receipt', () => {
  const ref = build(full([66.5, 70.5, 67.5]));
  assert.equal(ref.status, 'qualified'); assert.equal(ref.line, 67.5);
  assert.deepEqual(ref.books.map(b => b.book), ['draftkings', 'fanduel', 'betmgm']);
  assert.equal(ref.observedTo, at(5)); assert.equal(ref.observedFrom, at(7)); assert.equal(ref.sourceAgeMs, 5 * 60_000, 'source age stays visible');
});

test('explicit unavailable outcomes; nothing is repaired with another player, stat, book or late quote', () => {
  const reason = quotes => build(quotes).reason;
  assert.equal(reason([]), 'no_retained_quotes');
  assert.equal(reason(full().filter(q => q.book !== 'betmgm')), 'missing_book');
  assert.equal(reason([...full(), quote('caesars', 'over', 67.5), quote('caesars', 'under', 67.5)].filter(q => q.book !== 'fanduel')), 'missing_book', 'an unpermitted book never substitutes');
  assert.equal(reason(full().map(q => (q.book === 'fanduel' && q.selection.side === 'under' ? { ...q, selection: { ...q.selection, line: 68.5 } } : q))), 'book_line_mismatch');
  assert.equal(reason(full([60.5, 67.5, 68.5])), 'books_disagree');
  assert.equal(reason(full(undefined, [5, 6, 50])), 'not_time_aligned');
  assert.equal(reason(full(undefined, [5, 6, 7 * 60])), 'stale_or_future_quote');
  assert.equal(reason(full(undefined, [-5, 6, 7])), 'stale_or_future_quote');
  assert.equal(reason(full().map(q => ({ ...q, selection: { ...q.selection, playerId: '00-0099999' } }))), 'no_retained_quotes', 'another player\'s line never joins');
  assert.equal(reason(full().map(q => ({ ...q, selection: { ...q.selection, key: 'player_receptions' } }))), 'no_retained_quotes');
  assert.equal(reason(full().map((q, i) => (i === 0 ? { ...q, providerEventId: 'evt-2' } : q))), 'event_mismatch');
  assert.equal(build(full(), OFFER, Date.parse(KICK)).reason, 'kicked_off');
  assert.equal(build(full(), { ...OFFER, playerId: 'Fixture' }).reason, 'invalid_offer');
});

test('accepts exactly the shape research intake retains (normalizeResearchEvent output)', () => {
  const game = { id: 'DAL-PHI', home: 'Philadelphia Eagles', away: 'Dallas Cowboys', homeCode: 'PHI', awayCode: 'DAL', kickoff: KICK };
  const roster = [{ id: PLAYER, name: 'Fixture Receiver', team: 'DAL', gameId: 'DAL-PHI', current: true, availableAt: at(60) }];
  const event = { id: 'evt-1', sport_key: 'americanfootball_nfl', home_team: game.home, away_team: game.away, commence_time: KICK,
    bookmakers: ['draftkings', 'fanduel', 'betmgm'].map((key, i) => ({ key, markets: [{ key: 'player_reception_yds', last_update: at(2 + i),
      outcomes: ['Over', 'Under'].map(name => ({ name, description: 'Fixture Receiver', point: 66.5 + i, price: -110 })) }] })) };
  const quotes = normalizeResearchEvent(event, { game, roster, now: NOW });
  assert.equal(quotes.length, 6);
  assert.equal(build(retainedPropQuotes([{ status: 'finished', error: null, quote_payload: quotes }])).line, 67.5);
  assert.deepEqual(retainedPropQuotes([{ status: 'running', quote_payload: quotes }, { status: 'finished', error: 'provider_unavailable', quote_payload: quotes }]), []);
});

test('reference source reads retained rows only and records through the SQL writer; no provider call, no reservation', async () => {
  const reads = [], rpcs = [];
  const source = createPropReferenceSource({ clock: () => NOW,
    rows: async (table, query, max) => { reads.push([table, query, max]); return [{ status: 'finished', error: null, quote_payload: full() }]; },
    rpc: async (name, body) => { rpcs.push([name, body]); return {}; } });
  const ref = await source.referenceForLock(OFFER);
  assert.equal(ref.status, 'qualified');
  assert.equal(reads[0][0], 'gtl_research_quote_fetches'); assert.equal(reads[0][1].game_id, 'eq.DAL-PHI'); assert.equal(reads[0][2], 20);
  assert.deepEqual(rpcs.map(([name]) => name), ['gtl_props_record_reference']);
  assert.equal(rpcs[0][1].p_line, 67.5);
  const none = createPropReferenceSource({ clock: () => NOW, rows: async () => [], rpc: async () => assert.fail('nothing to record') });
  assert.deepEqual(await none.referenceForLock(OFFER), { status: 'unavailable', reason: 'no_retained_quotes' });
  const failing = createPropReferenceSource({ clock: () => NOW, rows: async () => { throw new Error('down'); }, rpc: async () => {} });
  assert.equal((await failing.referenceForLock(OFFER)).reason, 'source_unavailable');
  const source2 = fs.readFileSync('cloud/player-prop-receipts.mjs', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(source2, /collectResearchQuotes|gtl_begin_research_quotes\s*'|fetch\(|api\.the-odds-api\.com|apiKey/, 'never collects or reserves');
});

test('result receipts: exact identity, participation before a zero, ungraded statuses instead of invented outcomes', () => {
  const source = { name: 'nflverse stats_player_week_2026.csv', sha256: 'd'.repeat(64), observedAt: at(0) };
  const row = { player_id: PLAYER, game_id: '2026_10_DAL_PHI', receiving_yards: '0', receptions: 0 };
  const yes = { final: true, participated: true };
  assert.deepEqual(propResultReceipt({ offer: OFFER, row, source, evidence: yes }), { eventId: OFFER.eventId, playerId: PLAYER, stat: OFFER.stat,
    source: source.name, sourceSha256: source.sha256, observedAt: source.observedAt, status: 'final', actual: 0, participated: true });
  assert.equal(propResultReceipt({ offer: OFFER, row: undefined, source, evidence: yes }), null, 'a missing row is not a zero');
  assert.equal(propResultReceipt({ offer: OFFER, row, source, evidence: { final: true } }), null, 'unproven participation writes nothing');
  assert.equal(propResultReceipt({ offer: OFFER, row, source, evidence: { final: false, participated: true } }), null);
  assert.equal(propResultReceipt({ offer: OFFER, row, source, evidence: { participated: false } }).status, 'dnp');
  assert.equal(propResultReceipt({ offer: OFFER, row, source, evidence: { cancelled: true } }).status, 'cancelled');
  assert.equal(propResultReceipt({ offer: OFFER, row, source, evidence: { ...yes, correctionPending: true } }).status, 'correction_pending');
  assert.equal(propResultReceipt({ offer: OFFER, row: { ...row, player_id: '00-0000001' }, source, evidence: yes }).status, 'identity_unverified');
  assert.equal(propResultReceipt({ offer: { ...OFFER, stat: 'player_rush_yds' }, row: { ...row, rushing_yards: -4 }, source, evidence: yes }).actual, -4, 'signed yards');
  assert.equal(propResultReceipt({ offer: OFFER, row, source: { ...source, sha256: 'bad' }, evidence: yes }), null, 'an unverified source writes nothing');
});
