import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { accuracy, round } from './domain.mjs';
import { createEngine } from './engine.mjs';
import { createSocialStore, LOCAL_SOCIAL_IDS } from './social-store.mjs';
const root = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const teamCodes = ['TB DAL','PHI JAX','CIN MIA','LV NE','MIN NO','CLE NYJ','IND PIT','HOU TEN','NYG WAS','CHI GB','DEN LAC','SF SEA','BAL ATL','DET ARI','BUF LAR'];
const kickoffs = ['2026-10-09T00:15:00Z','2026-10-11T13:30:00Z',...Array(8).fill('2026-10-11T17:00:00Z'),'2026-10-11T20:05:00Z','2026-10-11T20:25:00Z','2026-10-12T00:20:00Z','2026-10-11T20:25:00Z','2026-10-13T00:15:00Z'];
export function seed() {
  const originals = read('data/picks/2026-week-05.json');
  const roster = read('data/games/sean-troy-luke.json').roster.map((name, i) => ({ id: ['sean','troy','luke'][i], name, role: i ? 'Player' : 'Commissioner' }));
  const eligible = originals.picks.filter(p => p.eligible_for_scoring);
  const games = eligible.map((p, i) => { const [away, home] = p.matchup.split(' @ '), [awayCode, homeCode] = teamCodes[i].split(' '); return { id: `${awayCode}-${homeCode}`, away, home, awayCode, homeCode, matchup: p.matchup, kickoff: kickoffs[i] }; });
  const history = fs.readdirSync(path.join(root, 'data/snapshots')).filter(f => f !== 'latest.json' && f.endsWith('.json')).map(file => {
    const s = read(`data/snapshots/${file}`);
    const observedAt = s.snapshot_at || s.source_published_at;
    const quoteAt = s.source_page_updated_at || s.source_published_at;
    if (!Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(quoteAt)) || Date.parse(quoteAt) > Date.parse(observedAt) || !s.source || !/^https:\/\//.test(s.source_url || '') || s.season !== originals.season || s.week !== originals.week) throw new Error(`Invalid source metadata in ${file}.`);
    if (!Array.isArray(s.games) || s.games.length !== games.length || new Set(s.games.map(g => g.matchup)).size !== games.length) throw new Error(`Incomplete or duplicate matchup data in ${file}.`);
    for (const g of s.games) {
      const original = eligible.find(p => p.matchup === g.matchup);
      const game = games.find(item => item.matchup === g.matchup);
      if (!original || !game || !Number.isFinite(g.consensus_home_spread) || !Number.isFinite(g.points) || g.predicted_home_spread !== (original.favorite === game.home ? original.spread : -original.spread) || Math.abs(accuracy(g.predicted_home_spread, g.consensus_home_spread) - g.points) > .001) throw new Error(`Snapshot integrity failed in ${file}. Preserve the file and reconcile its evidence.`);
    }
    if (Math.abs(round(s.games.reduce((sum,g)=>sum+g.points,0)) - s.total_points) > .001) throw new Error(`Snapshot total mismatch in ${file}.`);
    return { id: file, capturedAt: observedAt, timeBasis: s.snapshot_at ? 'capture' : 'publication', quotedAt: quoteAt, source: s.source, sourceUrl: s.source_url, verified: false,
      games: Object.fromEntries(s.games.map(g => [games.find(x => x.matchup === g.matchup)?.id, { value: g.consensus_home_spread, originalPick: g.predicted_home_spread, points: accuracy(g.predicted_home_spread, g.consensus_home_spread) }]).filter(([id]) => id)),
      total: round(s.games.reduce((a, g) => a + accuracy(g.predicted_home_spread, g.consensus_home_spread), 0)) };
  }).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  return { version: 1, league: { id: 'sean-troy-luke', name: 'Triple Threat', season: 2026, week: 5, roster, format: 'Triple Threat', perGameLimit: 1, deadline: kickoffs[0], actualKickoff: null, scheduleSource: originals.schedule_source }, games,
    ballots: { sean: { guess_spread: { submittedAt: history[0].capturedAt, origin: 'Imported complete ballot; original submission time unavailable', picks: Object.fromEntries(eligible.map((p, i) => [games[i].id, p.favorite === games[i].home ? p.spread : -p.spread])) }, guess_total: { submittedAt: null, picks: {} } } },
    bets: {}, results: {}, history, audit: [], archivedCount: originals.picks.filter(p => !p.eligible_for_scoring).length, frozen: {} };
}
export function createStore(file = path.join(root, '.local/state.json'), clock = Date.now) {
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : seed();
  if (state.version !== 1) throw new Error('Unsupported local data version. Preserve the file before migrating.');
  let social;
  function socialAction(player, action, body) {
    if (!social) {
      const intakeFile = path.join(root, 'data/bets/2026-week-05-social-intake.json');
      social = createSocialStore(`${file}.social.json`, {
        clock, slates: [{ season: state.league.season, week: state.league.week, games: state.games }],
        profiles: state.league.roster.map(p => ({ id: LOCAL_SOCIAL_IDS[p.id], displayName: p.name })),
        intake: path.resolve(file) === path.join(root, '.local/state.json') && fs.existsSync(intakeFile) ? JSON.parse(fs.readFileSync(intakeFile, 'utf8')).entries : [],
      });
    }
    return social.action(player, action, body);
  }
  function persist(next) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const tmp = `${file}.${randomUUID()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); state = next; }
  function engine(refreshHistory = false) {
    // Read new historical evidence without replacing saved ballots or revisions.
    const current = refreshHistory ? { ...state, history: seed().history } : state;
    return createEngine(current, { clock, uuid: randomUUID, requireFreshReferences: true });
  }
  const localView = result => ({ ...result, localOnly: true });
  function view(id, mode = 'guess_spread') {
    const current = engine(true);
    const result = current.view(id, mode);
    state = current.snapshot();
    return localView(result);
  }
  function save(method, ...args) {
    const candidate = engine(true);
    const result = candidate[method](...args);
    // Only accept the candidate in memory after its atomic file write succeeds.
    persist(candidate.snapshot());
    return localView(result);
  }
  return {
    socialAction,
    view,
    saveBallot: (...args) => save('saveBallot', ...args),
    sitOut: (...args) => save('sitOut', ...args),
    saveBet: (...args) => save('saveBet', ...args),
    export: id => engine().export(id),
  };
}
