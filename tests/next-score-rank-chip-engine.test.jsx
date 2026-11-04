// D-69 step 2: Your score's season rank chip opens its market's score scope only while the chip is drawn. A Community rank
// move that waits must not be spent while the history read is still loading (nothing drawn to pop), and plays when the
// chip appears. The real MomentsProvider and the real engine (memory record, sync timer); effects run in place in a static
// render, the provider's own engine-making effect once. Fixture data only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rig = vi.hoisted(() => ({ engine: null, made: false, small: [] }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal()),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useEffect: effect => { if (String(effect).includes('setEngine')) { if (!rig.made) { rig.made = true; effect(); } } else if (String(effect).includes('ctx?.engine')) effect(); },
}));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/moments/engine.js', async importOriginal => {
  const actual = await importOriginal();
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
  return { ...actual, createMomentsEngine: options => (rig.engine ??= actual.createMomentsEngine({ ...options, storage, isSettled: () => true, hasNavigated: () => true, setTimer: fn => { fn(); }, onSmall: m => rig.small.push(m.id) })) };
});
const { MomentsProvider } = await import('../web/src/next/moments/MomentsProvider.jsx');
const { WeeklyScoreContent } = await import('../web/src/next/play/WeeklyScore.jsx');
const { rankCandidate, rankSource } = await import('../web/src/next/league/rankMoment.js');
const { scoreScope } = await import('../web/src/next/moments/catalog.js');

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8,
  picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026], now: '2026-10-19T00:00:00Z', weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const ID = 'rank:community:guess_spread:1';
const rank = { rank: 2, label: '2nd', move: 1, said: 'season rank 2nd, up 1', momentId: ID };
const draw = (rankProp, dataProp = data) => { rig.made = false; return renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}>
  <WeeklyScoreContent data={dataProp} view={{}} rank={rankProp} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}}/></MomentsProvider>); };
const SOURCE = rankSource('community', 'guess_spread');
const candidate = () => rankCandidate({ league: 'community', mode: 'guess_spread', saved: { rank: 2, from: 3, n: 1 }, market: 'Spread' });

describe('Your score’s season rank chip with the real engine', () => {
  beforeEach(() => { rig.engine = null; rig.small = []; });
  it('does not spend the waiting rank move while the chip is absent, and plays it when the chip appears', () => {
    draw(null, null); // the provider makes the engine; the history read has not landed
    rig.engine.report([], { source: SOURCE }); // this device's first read of the source seeds
    rig.engine.report([candidate()], { source: SOURCE }); // the rank move arrives and waits
    expect(rig.engine.newCount(scoreScope('guess_spread'))).toBe(1);
    draw(null, null); // Your score mounted, read still loading: no chip
    draw(null); // read landed, but no season rank for this view: still no chip
    expect(rig.small).toEqual([]);
    expect(rig.engine.newCount(scoreScope('guess_spread'))).toBe(1);
    expect(draw(rank)).toContain('data-play="score"'); // the read landed with a rank: the chip draws and opens its scope
    expect(rig.small).toEqual([ID]);
    expect(rig.engine.newCount(scoreScope('guess_spread'))).toBe(0);
  });
});
