import test from 'node:test';
import assert from 'node:assert/strict';
import { row, registry, venues, corrections, T } from './trends-fixture.mjs';
import { handleLines } from '../cloud/lines.mjs';
import { createSupabaseAdapter, createCloudHandler } from '../cloud/handler.mjs';
import { parseFeatureOff } from '../cloud/feature-off.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const candidateModule = await import('../shared/trends-research-candidates.mjs').catch(() => null);
const sourceModule = await import('../shared/trends-research-sources.mjs').catch(() => null);
const providerModule = await import('../cloud/trends-research.mjs').catch(() => null);
const now = '2026-10-21T19:00:00.000Z';
const user = { id: '11111111-1111-4111-8111-111111111111' };
const history = Array.from({ length: 50 }, (_, i) => row({ season: 2025, week: i + 1, gameday: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), away_team: 'DAL', home_team: 'NYG', home_score: 30, away_score: 10, spread_line: 3, total_line: 39 }));
const upcoming = row({ season: 2026, week: 7, gameday: '2026-10-25', away_team: 'DAL', home_team: 'NYG', spread_line: 99, total_line: 999 });
const csv = T.writeCompactCsv([...history, upcoming]);
let fixtureSnapshot;
const getFixtureSnapshot = () => fixtureSnapshot ??= candidateModule.createResearchSnapshot({ csv, now, season: 2026, registry, venues, corrections });
const board = (open = true) => ({ season: 2026, week: 7, games: [{ id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', kickoff: '2026-10-25T17:00:00Z', spread: { visible: open, value: -3, observedAt: now, source: 'Synthetic' }, total: { visible: false, value: 999 }, mine: { spread: { guess: -5, lineAtGuess: { value: -4 } } } }] });
const getProvider = async (options = {}) => {
  assert.ok(providerModule, 'research provider module exists');
  const snapshot = await getFixtureSnapshot();
  return providerModule.createResearchProvider({ loadSchedule: async () => csv, loadSnapshot: async () => snapshot, venues, corrections, clock: () => Date.parse(now), ...options });
};

test('candidate adapter preserves registered sides and registers both new sides without future finals', () => {
  assert.ok(candidateModule, 'candidate adapter exists');
  const candidates = candidateModule.registerResearchCandidates(registry);
  assert.ok(candidates.length > registry.presets.length);
  const fixed = registry.presets.find(p => p.side && p.market === 'home_ats');
  assert.deepEqual(candidates.filter(c => c.preset.id === fixed.id).map(c => c.direction), [fixed.side]);
  assert.ok(candidates.filter(c => !c.preset.side).every(c => c.historicalTier === 3));
  const rows = [...history, row({ ...upcoming, home_score: 90, away_score: 0 })];
  const prepared = candidateModule.prepareResearchHistory(T.writeCompactCsv(rows), { now, venues, corrections });
  assert.equal(prepared.games.find(g => g.season === 2026).played, false);
  assert.ok(prepared.games.filter(g => g.played).every(g => g.availableAt <= now));
});

test('provider coalesces source reads and rebuilds two viewer projections with no hidden metadata', async () => {
  let loads = 0;
  const provider = await getProvider({ loadSchedule: async () => { loads++; return csv; } });
  const [open, closed] = await Promise.all([provider.read({ board: board(), now }), provider.read({ board: board(false), now })]);
  assert.equal(loads, 1);
  assert.deepEqual(closed.games[0].spread, { visible: false });
  assert.deepEqual(closed.games[0].total, { visible: false });
  assert.deepEqual(closed.candidates, []);
  assert.deepEqual(closed.shortlist, []);
  assert.equal(open.games[0].spread.ownGuess, -5);
  assert.equal(open.games[0].spread.savedReference.value, -4);
  assert.equal(open.games[0].spread.guessGap.value, 2);
  assert.equal(open.games[0].spread.guessGap.label, 'Difference from your expected market line');
  assert.ok(!JSON.stringify(open).includes('999'));
  assert.ok(open.candidates.every(c => !JSON.stringify(c).includes('matchedGameIds')));
  assert.equal(open.sources.length, 5);
  assert.equal(open.trent.status, 'unavailable');
});

test('current applicability uses app spread sign and never unknown cross-market or observed weather', async () => {
  const provider = await getProvider();
  const result = await provider.read({ board: board(), now });
  const cards = result.candidates;
  assert.ok(cards.some(c => c.conditions.includes('g:g_home_fav')));
  assert.ok(!cards.some(c => c.conditions.includes('g:g_road_fav')));
  assert.ok(!cards.some(c => c.conditions.some(a => /g_t_|wind|temp|ref:/.test(a))));
  const applied = cards.flatMap(c => c.applications);
  assert.ok(applied.some(a => a.direction === 'home'));
});

test('freshness detects overdue missing finals, absent season and refresh failure with backoff', async () => {
  let time = Date.parse(now), loads = 0, fail = false;
  const provider = await getProvider({ clock: () => time, loadSchedule: async () => { loads++; if (fail) throw Error('private provider detail'); return csv; } });
  const first = await provider.read({ board: board() });
  assert.equal(first.history.status, 'fresh');
  fail = true; time += 301000;
  const stale = await provider.read({ board: board() });
  assert.equal(stale.history.status, 'stale');
  assert.ok(stale.games[0].spread.lean.reasons.includes('history_not_fresh'));
  await provider.read({ board: board() });
  assert.equal(loads, 2);
  const absent = await (await getProvider({ loadSchedule: async () => T.writeCompactCsv(history) })).read({ board: board() });
  assert.equal(absent.history.status, 'stale');
  const overdue = await (await getProvider({ loadSchedule: async () => T.writeCompactCsv([...history, { ...upcoming, gameday: '2026-10-19' }]) })).read({ board: board() });
  assert.equal(overdue.history.status, 'stale');
});

const feed = () => ({ version: 1, checkedAt: now, availability: { bookitwithtrent: 'available' }, entries: [{ id: 'synthetic-1', version: 1, previousRevision: null, sourceId: 'bookitwithtrent', sourceUrl: 'https://x.com/bookitwithtrent/status/123', postedAt: '2026-10-21T18:00:00Z', capturedAt: now, status: 'available', review: { primaryPost: true, reusePermitted: true, nflDependenciesComplete: true }, event: 'Synthetic event', selection: 'Synthetic original play', market: 'parlay', postedLine: null, price: null, originalTerms: 'Synthetic terms', dependencies: [{ season: 2026, week: 7, gameId: 'DAL-NYG', market: 'spread' }, { season: 2026, week: 7, gameId: 'DAL-NYG', market: 'total' }] }] });

test('reviewed feeds enforce primary accounts, dates, corrections and all parlay dependencies', async () => {
  assert.ok(sourceModule, 'reviewed source validator exists');
  const valid = feed();
  assert.equal(sourceModule.validateReviewedFeed(valid).entries.length, 1);
  const wrong = feed(); wrong.entries[0].sourceUrl = 'https://x.com/other/status/123';
  assert.throws(() => sourceModule.validateReviewedFeed(wrong));
  const undeclared = feed(); undeclared.entries[0].review.nflDependenciesComplete = false;
  assert.throws(() => sourceModule.validateReviewedFeed(undeclared));
  const revised = feed(); revised.entries.push({ ...revised.entries[0], id: 'synthetic-2', version: 2, previousRevision: 'synthetic-1', status: 'corrected' });
  assert.equal(sourceModule.validateReviewedFeed(revised).entries.length, 2);
  const provider = await getProvider({ reviewedFeed: revised });
  assert.deepEqual((await provider.read({ board: board() })).trent.plays, []);
  const both = board(); both.games[0].total = { visible: true, value: 42, observedAt: now };
  const visible = await provider.read({ board: both });
  assert.equal(visible.trent.plays.length, 2);
  assert.equal(visible.trent.plays[1].previousRevision, 'synthetic-1');
  assert.equal(visible.trent.plays[1].selection, 'Synthetic original play');
});

test('research route strictly validates body and authenticates before reading authoritative lines', async () => {
  const calls = [];
  const provider = await getProvider();
  const service = { rpc: async (name, args) => { calls.push({ name, args }); return board(); }, research: provider };
  await assert.rejects(handleLines({ route: '/lines/research', body: { userId: user.id }, user, service }), /Unexpected/);
  await assert.rejects(handleLines({ route: '/lines/research', body: { period: 'best' }, user, service }), /Check/);
  await assert.rejects(handleLines({ route: '/lines/research', body: {}, user: null, service }), /Sign in/);
  const result = await handleLines({ route: '/lines/research', body: { season: 2026, week: 7 }, user, service, clock: () => Date.parse(now) });
  assert.equal(result.now, now);
  assert.equal(calls[0].name, 'gtl_read_lines');
  assert.equal(calls[0].args.p_user, user.id);
  assert.equal(calls[0].args.p_now, now);
  await assert.rejects(handleLines({ route: '/lines/research', body: { candidateId: 'unknown' }, user, service }), /candidate/i);
});

test('prepared snapshot contains completed evidence only and line patch matches frozen predicates', async () => {
  assert.ok(candidateModule?.createResearchSnapshot, 'offline snapshot builder exists');
  const snapshot = await candidateModule.createResearchSnapshot({ csv, now, season: 2026, registry, venues, corrections });
  assert.equal(snapshot.version, 'research-2026-10-21-v1');
  assert.ok(snapshot.candidates.every(c => !Object.hasOwn(c, 'records')));
  const target = snapshot.targets.find(g => g.id === upcoming.game_id);
  assert.equal(target.spread, null);
  assert.equal(target.total, null);
  assert.equal(target.homeScore, null);
  const patched = candidateModule.applyAccessibleLines(target, board().games[0], { venues, corrections });
  assert.equal(patched.spread, 3);
  assert.equal(patched.gf.g_home_fav, true);
  assert.equal(patched.gf.g_t_51p, null);
  const single = T.buildFeatures([{ ...structuredClone(target), spread: 3 }], { venues, corrections })[0];
  for (const a of Object.values(T.ATOMS).filter(a => a.kind === 'game' && a.needs === 'spread' && !a.state)) assert.equal(patched.gf[a.name], single.gf[a.name]);
});

test('native adapter wires lazy research without letting invalid reviewed config break other routes', async () => {
  const adapter = createSupabaseAdapter({ url: 'https://example.supabase.co', anonKey: 'public', serviceRoleKey: 'private', reviewedResearchFeed: '{bad', fetchImpl: async () => new Response('{}') });
  assert.equal(typeof adapter.lines.research?.read, 'function');
  assert.equal(typeof adapter.lines.rpc, 'function');
  assert.equal(typeof adapter.bets.rpc, 'function');
});

test('HTTP route requires confirmation, forbids queries and sets no-store', async () => {
  let reads = 0;
  const handler = createCloudHandler({ authenticate: async token => token === 'confirmed' ? { ...user, email: 'synthetic@example.test', emailConfirmed: true } : { ...user, email: 'synthetic@example.test', emailConfirmed: false },
    lines: { rpc: async () => { reads++; return board(); }, research: await getProvider() }, clock: () => Date.parse(now) });
  const call = (token, suffix = '') => handler(new Request(`https://example.test/lines/research${suffix}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal((await call('other')).status, 403);
  assert.equal((await call('confirmed', '?period=all')).status, 400);
  const response = await call('confirmed');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(reads, 1);
});

test('CLI validates ignored private feed paths without printing source terms', () => {
  mkdirSync(new URL('../.local/trends-research/', import.meta.url), { recursive: true });
  const path = new URL('../.local/trends-research/synthetic-cli-feed.json', import.meta.url);
  writeFileSync(path, JSON.stringify(feed()));
  const output = execFileSync(process.execPath, ['scripts/trends-research.mjs', 'validate', '--file', '.local/trends-research/synthetic-cli-feed.json'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(output, /entries.*1/);
  assert.ok(!output.includes('Synthetic terms'));
  assert.throws(() => execFileSync(process.execPath, ['scripts/trends-research.mjs', 'validate', '--file', 'shared/trends-registry.json'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: 'pipe' }));
});

test('changed completed content and postponed kickoff fail applicability closed', async () => {
  const changed = T.writeCompactCsv([{ ...history[0], home_score: '31' }, ...history.slice(1), upcoming]);
  const provider = await getProvider({ loadSchedule: async () => changed });
  const result = await provider.read({ board: board() });
  assert.equal(result.history.status, 'stale');
  assert.ok(result.history.reasons.includes('completed_source_changed'));
  const changedTime = T.writeCompactCsv([...history, { ...upcoming, gametime: '16:00' }]);
  const postponed = board(); postponed.games[0].kickoff = '2026-10-25T20:00:00Z';
  const schedule = await (await getProvider({ loadSchedule: async () => changedTime })).read({ board: postponed });
  assert.deepEqual(schedule.candidates, []);
  assert.ok(schedule.games[0].spread.lean.reasons.includes('schedule_context_unavailable'));
});

test('display filters preserve leans and weekly shortlist, details are gated and bounded', async () => {
  const provider = await getProvider();
  const first = await provider.read({ board: board() });
  const filtered = await provider.read({ board: board(), family: 'not_a_family', period: 'all', market: 'total' });
  assert.deepEqual(first.shortlist, filtered.shortlist);
  assert.deepEqual(first.games[0].spread.lean, filtered.games[0].spread.lean);
  assert.deepEqual(filtered.explore, []);
  assert.ok(first.candidates.length > 0);
  const id = first.candidates[0].id;
  const detail = await provider.read({ board: board(), candidateId: id, period: 'all' });
  const card = detail.candidates.find(c => c.id === id);
  assert.ok(card.series.points.length <= 48);
  assert.equal(card.series.points.reduce((sum, b) => sum + b.sample, 0), card.record.sample);
  assert.equal(card.series.points.at(-1)?.illustrativeUnits ?? 0, card.record.illustrativeUnits);
  await assert.rejects(provider.read({ board: board(false), candidateId: id }), /candidate/);
});

test('server clock rechecks quote age inside source cache and own expected gap never votes', async () => {
  let time = Date.parse(now), loads = 0;
  const provider = await getProvider({ clock: () => time, loadSchedule: async () => { loads++; return csv; } });
  const sample = board(); sample.games[0].spread.observedAt = new Date(time - 12 * 3600000 + 1000).toISOString();
  const first = await provider.read({ board: sample });
  time += 2000;
  const stale = await provider.read({ board: sample });
  assert.equal(loads, 1);
  assert.ok(stale.games[0].spread.lean.reasons.includes('reference_stale'));
  sample.games[0].mine.spread.guess = 99;
  const otherGuess = await provider.read({ board: sample });
  assert.deepEqual(otherGuess.games[0].spread.lean, stale.games[0].spread.lean);
  assert.equal(first.games[0].spread.currentReference.value, stale.games[0].spread.currentReference.value);
});

test('research has a dedicated rollback switch before source and lines reads', async () => {
  assert.ok(parseFeatureOff('research').has('research'));
  const service = { rpc: async () => assert.fail('no lines read'), research: { read: async () => assert.fail('no source read') } };
  await assert.rejects(handleLines({ route: '/lines/research', body: {}, user, service, featureOff: parseFeatureOff('research') }), e => e.status === 503);
});

test('missing total preserves spread sample and upstream exclusions remain visible', () => {
  const input = T.writeCompactCsv([...history.map(r => ({ ...r, total_line: '' })), upcoming]);
  const candidates = candidateModule.buildResearchCandidates({ csv: input, now, registry, venues, corrections });
  const spread = candidates.find(c => c.preset.market === 'home_ats' && c.conditions.includes('g:g_all'));
  assert.equal(spread.records.length, 50);
  assert.equal(spread.inputCoverage.missingRequiredLine, 0);
  const total = candidates.find(c => c.preset.market === 'total' && c.conditions.includes('g:g_all'));
  assert.equal(total.records.length, 0);
  assert.equal(total.inputCoverage.missingRequiredLine, 50);
  const weather = candidateModule.buildResearchCandidates({ csv, now, registry, venues, corrections }).find(c => c.conditions.includes('g:g_wind10'));
  assert.equal(weather.records.length, 0);
  assert.equal(weather.inputCoverage.unknownConditions, 50);
});

test('a final present in source is unavailable at kickoff and becomes observable only at conservative boundary', () => {
  const rows = T.writeCompactCsv([row({ ...upcoming, gameday: '2026-10-21', home_score: 30, away_score: 10 })]);
  const atKickoff = candidateModule.prepareResearchHistory(rows, { now: '2026-10-21T17:00:00Z', venues, corrections });
  assert.equal(atKickoff.games[0].played, false);
  assert.equal(atKickoff.games[0].homeScore, null);
  assert.equal(atKickoff.games[0].spread, null);
  const available = candidateModule.prepareResearchHistory(rows, { now: '2026-10-22T12:00:00Z', venues, corrections });
  assert.equal(available.games[0].played, true);
});

test('reviewed feed rejects future capture, ambiguous dates, unknown bypass fields and excessive secret size', () => {
  const future = feed(); future.entries[0].capturedAt = '2026-10-22T19:00:00Z';
  assert.throws(() => sourceModule.validateReviewedFeed(future));
  const impossible = feed(); impossible.checkedAt = '2026-02-30T19:00:00Z';
  assert.throws(() => sourceModule.validateReviewedFeed(impossible));
  const bypass = feed(); bypass.entries[0].visible = true;
  assert.throws(() => sourceModule.validateReviewedFeed(bypass));
  assert.throws(() => sourceModule.validateReviewedFeed(' '.repeat(24001)));
});

test('prepared loader receives each selected period without pinning the previous period', async () => {
  const snapshot = await getFixtureSnapshot(), requests = [];
  const provider = await getProvider({ loadSnapshot: async period => {
    requests.push(period);
    return { ...snapshot, candidates: snapshot.candidates.map(c => ({ ...c, periods: { [period]: c.periods[period] } })) };
  } });
  const recent = await provider.read({ board: board() });
  const all = await provider.read({ board: board(), period: 'all' });
  assert.deepEqual(requests, ['recent30', 'all']);
  const id = recent.candidates.find(c => c.record.sample === 30)?.id;
  assert.ok(id);
  assert.equal(all.candidates.find(c => c.id === id).record.sample, 50);
});

test('concrete sides reject pickem, ambiguous team matches and unknown opposition; reversion retains registered side', async () => {
  const snapshot = await getFixtureSnapshot();
  const target = snapshot.targets[0];
  const game = candidateModule.applyAccessibleLines(target, board().games[0], { venues, corrections });
  const make = (market, direction, atoms = ['g:g_all']) => ({ direction, preset: { market, atoms } });
  assert.equal(candidateModule.applyResearchCandidate(make('fav_ats', 'A'), { ...game, spread: 0 }), null);
  assert.equal(candidateModule.applyResearchCandidate(make('team_ats', 'A'), game), null);
  const unknown = structuredClone(game); unknown.tf[0].t_road = true; unknown.tf[1].t_road = null;
  assert.equal(candidateModule.applyResearchCandidate(make('team_ats', 'A', ['t:t_road']), unknown), null);
  assert.equal(candidateModule.applyResearchCandidate(make('fav_ats', 'B'), { ...game, spread: -3 }).direction, 'home');
  game.meta.totrevX = 8;
  assert.equal(candidateModule.applyResearchCandidate(make('total_rev', 'A'), game).direction, 'under');
  assert.equal(candidateModule.applyResearchCandidate(make('total_rev', 'B'), game).direction, 'over');
});

test('malformed public source rows close research without throwing provider details', async () => {
  const invalid = T.writeCompactCsv([...history, { ...upcoming, gameday: '2026-99-19' }]);
  const result = await (await getProvider({ loadSchedule: async () => invalid })).read({ board: board() });
  assert.equal(result.history.status, 'unavailable');
  assert.deepEqual(result.candidates, []);
});

test('reviewed revision chains cannot expose a hidden predecessor ID or branch into separate plays', async () => {
  const revised = feed();
  revised.entries.push({ ...structuredClone(revised.entries[0]), id: 'open-correction', version: 2, previousRevision: 'synthetic-1', dependencies: [{ season: 2026, week: 7, gameId: 'DAL-NYG', market: 'spread' }] });
  const result = await (await getProvider({ reviewedFeed: revised })).read({ board: board() });
  assert.ok(!JSON.stringify(result).includes('synthetic-1'));
  revised.entries.push({ ...structuredClone(revised.entries[1]), id: 'branched-correction' });
  assert.throws(() => sourceModule.validateReviewedFeed(revised));
});
