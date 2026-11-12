// NBA build-out N2: the odds adapter's sport parameter (cloud/odds-provider.mjs), both providers' team names
// (shared/nba-teams.mjs) and the slate linking and spread-line rules (shared/nba-slate.mjs). Local fetch doubles only; no
// request leaves this process. Every event, time and line is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOddsProvider, ODDS_SPORTS } from '../cloud/odds-provider.mjs';
import { NBA_TEAMS, nbaOddsApiName, nbaTeamFromBallDontLie, nbaTeamFromOddsApi } from '../shared/nba-teams.mjs';
import { linkNbaSlate, nbaSpreadLine, pacificDate, pacificMidnight } from '../shared/nba-slate.mjs';

const NOW = Date.parse('2026-11-12T00:00:00Z'), TIP = '2026-11-12T03:30:00Z', KEY = 'private-fixture-key-never-log';
const headers = last => ({ 'content-type': 'application/json', 'x-requests-remaining': '400', 'x-requests-used': '100', 'x-requests-last': String(last) });
const game = { id: 'nba-1', home: 'Boston Celtics', away: 'New York Knicks', kickoff: TIP };
const event = (sport = 'basketball_nba') => ({ id: 'evt1', sport_key: sport, home_team: game.home, away_team: game.away, commence_time: TIP });
const priced = (sport, books = ['draftkings', 'fanduel', 'betmgm']) => [{ ...event(sport), bookmakers: books.map(key => ({ key, last_update: '2026-11-11T23:59:30Z', markets: [
  { key: 'spreads', last_update: '2026-11-11T23:59:30Z', outcomes: [{ name: game.home, point: -6.5, price: -110 }, { name: game.away, point: 6.5, price: -110 }] },
  { key: 'totals', last_update: '2026-11-11T23:59:30Z', outcomes: [{ name: 'Over', point: 221.5, price: -110 }, { name: 'Under', point: 221.5, price: -110 }] }] })) }];
function provider(options = {}, { oddsCost = 1, sport = options.sport ?? 'americanfootball_nfl' } = {}) {
  const requests = [];
  const p = createOddsProvider({ apiKey: KEY, clock: () => NOW, ...options, fetchImpl: async url => {
    const u = new URL(url); requests.push(u);
    if (u.pathname.endsWith('/events')) return new Response(JSON.stringify([event(sport)]), { headers: headers(0) });
    return new Response(JSON.stringify(priced(sport)), { headers: headers(oddsCost) });
  } });
  return { p, requests };
}

test('the sport parameter is used: NBA requests name basketball_nba, and the NFL default sends exactly the requests it always has', async () => {
  assert.deepEqual(ODDS_SPORTS, ['americanfootball_nfl', 'basketball_nba']);
  const nba = provider({ sport: 'basketball_nba', markets: ['spreads'] });
  const reply = await nba.p.collect({ games: [game], remainingCredits: 400, reserveCredits: 100 });
  assert.deepEqual(nba.requests.map(u => u.pathname), ['/v4/sports/basketball_nba/events', '/v4/sports/basketball_nba/odds']);
  assert.equal(nba.requests[1].searchParams.get('markets'), 'spreads');
  assert.equal(reply.sport, 'basketball_nba');
  assert.deepEqual(Object.keys(reply.games[0].markets), ['spread'], 'only the requested market is normalized');
  assert.equal(reply.games[0].markets.spread.quotes[0].value, -6.5);
  // NFL: the default and the explicit NFL parameters send the same URLs (apiKey aside) and return the same reply.
  const nflGame = { ...game };
  const nflExplicit = provider({ sport: 'americanfootball_nfl', markets: ['totals', 'spreads'] }, { oddsCost: 2 });
  const nflDefaultCosted = provider({}, { oddsCost: 2 });
  const a = await nflDefaultCosted.p.collect({ games: [nflGame], remainingCredits: 400 }), b = await nflExplicit.p.collect({ games: [nflGame], remainingCredits: 400 });
  assert.deepEqual(a, b);
  const strip = u => { const c = new URL(u); c.searchParams.delete('apiKey'); return c.href; };
  assert.deepEqual(nflDefaultCosted.requests.map(strip), nflExplicit.requests.map(strip));
  assert.equal(strip(nflDefaultCosted.requests[1]), `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?dateFormat=iso&regions=us&bookmakers=draftkings%2Cfanduel%2Cbetmgm%2Cbetrivers&markets=spreads%2Ctotals&oddsFormat=american&eventIds=evt1`);
  assert.equal(a.sport, 'americanfootball_nfl'); assert.deepEqual(Object.keys(a.games[0].markets), ['spread', 'total']);
  assert.equal(a.quota.estimatedMaxCost, 2);
});

test('NBA spreads cost 1: a reported 2 stops the adapter, and the budget check spends at most 1 above the reserve', async () => {
  const one = provider({ sport: 'basketball_nba', markets: ['spreads'] });
  const reply = await one.p.collect({ games: [game], remainingCredits: 101, reserveCredits: 100 });
  assert.deepEqual([reply.quota.last, reply.quota.estimatedMaxCost], [1, 1]);
  const two = provider({ sport: 'basketball_nba', markets: ['spreads'] }, { oddsCost: 2 });
  await assert.rejects(two.p.collect({ games: [game], remainingCredits: 400, reserveCredits: 100 }), error => error.code === 'ODDS_QUOTA_COST' && error.quota.last === 2);
  const tight = provider({ sport: 'basketball_nba', markets: ['spreads'] });
  await assert.rejects(tight.p.collect({ games: [game], remainingCredits: 100, reserveCredits: 100 }), error => error.code === 'ODDS_BUDGET');
  assert.equal(tight.requests.length, 0, 'refused before any request');
});

test('an unknown sport or market is a configuration error before any request', () => {
  for (const options of [{ sport: 'soccer_epl' }, { sport: 'basketball_ncaab' }, { markets: [] }, { markets: ['h2h'] }, { markets: ['spreads', 'spreads'] }, { markets: 'spreads' }])
    assert.throws(() => createOddsProvider({ apiKey: KEY, ...options }), error => error.code === 'ODDS_CONFIG', JSON.stringify(options));
});

test('listEvents is one free /events read for the window: it keeps only this sport\'s well-formed events and stops on any cost', async () => {
  const requests = [];
  const free = createOddsProvider({ apiKey: KEY, sport: 'basketball_nba', markets: ['spreads'], clock: () => NOW, fetchImpl: async url => {
    requests.push(new URL(url));
    return new Response(JSON.stringify([event(), event('americanfootball_nfl'), { id: 'bad id', sport_key: 'basketball_nba' }, { ...event(), id: 'evt2', home_team: game.away, away_team: game.away }]), { headers: headers(0) });
  } });
  const reply = await free.listEvents({ commenceTimeFrom: '2026-11-11T08:00:00Z', commenceTimeTo: '2026-11-14T08:00:00Z' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, '/v4/sports/basketball_nba/events');
  assert.deepEqual([requests[0].searchParams.get('commenceTimeFrom'), requests[0].searchParams.get('commenceTimeTo')], ['2026-11-11T08:00:00Z', '2026-11-14T08:00:00Z']);
  assert.deepEqual(reply.events, [{ id: 'evt1', home: game.home, away: game.away, commenceTime: '2026-11-12T03:30:00.000Z' }]);
  assert.equal(reply.invalid, 3);
  const costly = createOddsProvider({ apiKey: KEY, sport: 'basketball_nba', markets: ['spreads'], fetchImpl: async () => new Response('[]', { headers: headers(1) }) });
  await assert.rejects(costly.listEvents({ commenceTimeFrom: '2026-11-11T08:00:00Z', commenceTimeTo: '2026-11-12T08:00:00Z' }), error => error.code === 'ODDS_QUOTA_COST');
  await assert.rejects(costly.listEvents({ commenceTimeFrom: '2026-11-11T08:00:00Z', commenceTimeTo: '2026-11-12T08:00:00Z' }), error => error.code === 'ODDS_BUDGET', 'a stopped adapter makes no further request');
  await assert.rejects(free.listEvents({ commenceTimeFrom: '2026-11-11T08:00:00Z', commenceTimeTo: '2026-11-20T08:00:00Z' }), error => error.code === 'ODDS_SLATE', 'at most a week');
});

test('all 30 teams map across both providers: every Odds API name and BALLDONTLIE abbreviation is one NBA team, and no NFL name is', () => {
  assert.equal(NBA_TEAMS.length, 30);
  const names = NBA_TEAMS.map(team => nbaOddsApiName(team.code));
  assert.equal(names.length, 30); assert.equal(new Set(names).size, 30);
  for (const team of NBA_TEAMS) {
    assert.equal(nbaTeamFromOddsApi(nbaOddsApiName(team.code))?.code, team.code, team.code);
    assert.equal(nbaTeamFromBallDontLie({ abbreviation: team.code, name: team.name })?.code, team.code, team.code);
  }
  assert.equal(nbaOddsApiName('LAC'), 'Los Angeles Clippers', 'the one name the two providers spell differently');
  assert.equal(nbaOddsApiName('LAR'), null, 'an NFL code is no NBA team');
  assert.equal(NBA_TEAMS.find(t => t.code === 'LAC').name, 'LA Clippers');
  for (const name of ['LA Clippers', 'Los Angeles Chargers', 'Philadelphia Eagles', 'boston celtics', ' Boston Celtics', 'Team LeBron', '', null]) assert.equal(nbaTeamFromOddsApi(name), null, String(name));
  for (const abbreviation of ['LAR', 'KC', 'XXX', '', null]) assert.equal(nbaTeamFromBallDontLie({ abbreviation }), null, String(abbreviation));
});

const bdl = (id, home, away, startTime, extra = {}) => ({ id: `NBA:balldontlie:${id}`, startTime, sourceDate: startTime ? startTime.slice(0, 10) : '2026-11-11', status: 'scheduled',
  home: { id: id * 2, name: home, abbreviation: home }, away: { id: id * 2 + 1, name: away, abbreviation: away }, homeScore: null, awayScore: null, ...extra });
const odds = (id, home, away, commenceTime) => ({ id, home: nbaOddsApiName(home) ?? home, away: nbaOddsApiName(away) ?? away, commenceTime });

test('linking: one event per game by both teams and start time; unmatched events are counted by why', () => {
  const games = [bdl(1, 'LAC', 'DEN', '2026-11-12T03:30:00.000Z'), bdl(2, 'PHI', 'MIA', '2026-11-12T00:00:00.000Z'), bdl(3, 'BOS', 'NYK', '2026-11-12T00:30:00.000Z'),
    bdl(4, 'CHI', 'DET', '2026-11-12T01:00:00.000Z'), bdl(5, 'XXX', 'DET', '2026-11-12T01:00:00.000Z')];
  const events = [
    odds('e1', 'LAC', 'DEN', '2026-11-12T03:40:00Z'),          // links (ten minutes apart)
    odds('e2', 'MIA', 'PHI', '2026-11-12T00:00:00Z'),          // teams reversed: never links
    odds('e3a', 'BOS', 'NYK', '2026-11-12T00:30:00Z'), odds('e3b', 'BOS', 'NYK', '2026-11-12T02:30:00Z'), // two candidates: ambiguous
    odds('e4', 'CHI', 'DET', '2026-11-14T01:00:00Z'),          // two days away: another game
    odds('e5', 'Team LeBron', 'Team Giannis', '2026-11-12T01:00:00Z'), // not an NBA team pair
  ];
  const { rows, counts } = linkNbaSlate({ games, events });
  assert.deepEqual(rows.map(r => [r.gameId, r.oddsEventId]), [['NBA:balldontlie:1', 'e1'], ['NBA:balldontlie:2', null], ['NBA:balldontlie:3', null], ['NBA:balldontlie:4', null]]);
  assert.equal(rows[0].oddsCommenceTime, '2026-11-12T03:40:00.000Z');
  assert.deepEqual(counts, { games: 4, unknownGames: 1, events: 6, linkedGames: 1, unlinkedGames: 3, ambiguousGames: 1, linkedEvents: 1, unmatchedEvents: 5, unknownTeamEvents: 1, reversedEvents: 1 });
  // An event two games both claim links neither.
  const twice = linkNbaSlate({ games: [bdl(7, 'OKC', 'SAS', '2026-11-12T01:00:00.000Z'), bdl(8, 'OKC', 'SAS', '2026-11-12T02:00:00.000Z')], events: [odds('e7', 'OKC', 'SAS', '2026-11-12T01:30:00Z')] });
  assert.deepEqual(twice.rows.map(r => r.oddsEventId), [null, null]); assert.equal(twice.counts.unmatchedEvents, 1);
  // Without a BALLDONTLIE start, only an event on the same Pacific date links.
  const undated = linkNbaSlate({ games: [bdl(9, 'SAC', 'POR', null, { sourceDate: '2026-11-11' })], events: [odds('e9', 'SAC', 'POR', '2026-11-12T03:00:00Z')] });
  assert.equal(undated.rows[0].oddsEventId, 'e9', '7:00 PM Pacific on November 11');
  assert.equal(linkNbaSlate({ games: [], events: [] }).counts.unmatchedEvents, 0);
});

const quote = (book, value, observed = '2026-11-11T23:59:00.000Z') => ({ book, value, outcomes: { home: { line: value, odds: -110 }, away: { line: -value, odds: -110 } }, providerObservedAt: observed });
const market = (quotes, matchStatus = 'matched') => ({ matchStatus, markets: { spread: { quotes } } });
const when = { lockAt: TIP, collectedAt: '2026-11-12T00:00:00.000Z' };

test('a spread line qualifies only with three books within 5 points of their median, fresh and before the lock', () => {
  const three = nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7), quote('betmgm', -6)]), when);
  assert.deepEqual([three.qualified, three.line, three.reason, three.books.length], [true, -6.5, null, 3]);
  assert.equal(three.observedAt, '2026-11-11T23:59:00.000Z');
  const standIn = nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7), quote('betrivers', -6)]), when);
  assert.equal(standIn.qualified, true, 'BetRivers stands in for a missing book (D-74)');
  assert.deepEqual(nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7)]), when).reason, 'too_few_books');
  assert.equal(nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7), quote('betmgm', 0)]), when).reason, 'books_disagree');
  assert.equal(nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7), quote('betmgm', -6, '2026-11-11T23:50:00.000Z')]), when).reason, 'too_few_books', 'a stale book does not count');
  assert.equal(nbaSpreadLine(market([quote('draftkings', -6.5), quote('fanduel', -7), quote('betmgm', -6)]), { lockAt: '2026-11-12T00:00:00.000Z', collectedAt: when.collectedAt }).reason, 'kickoff_passed');
  assert.equal(nbaSpreadLine(market([], 'schedule_mismatch'), when).reason, 'schedule_mismatch');
  assert.equal(nbaSpreadLine(null, { lockAt: TIP, collectedAt: null }).reason, 'not_returned');
  assert.deepEqual(nbaSpreadLine(market([quote('draftkings', 0), quote('fanduel', -0.5), quote('betmgm', 0.5)]), when).line, 0);
});

test('Pacific dates and midnights hold across daylight saving time', () => {
  assert.equal(pacificDate(Date.parse('2026-11-12T07:59:00Z')), '2026-11-11');
  assert.equal(pacificDate(Date.parse('2026-11-12T08:00:00Z')), '2026-11-12');
  assert.equal(new Date(pacificMidnight('2026-11-12')).toISOString(), '2026-11-12T08:00:00.000Z', 'standard time');
  assert.equal(new Date(pacificMidnight('2026-07-01')).toISOString(), '2026-07-01T07:00:00.000Z', 'daylight time');
  assert.equal(new Date(pacificMidnight('2026-11-01')).toISOString(), '2026-11-01T07:00:00.000Z', 'the day daylight time ends');
});
