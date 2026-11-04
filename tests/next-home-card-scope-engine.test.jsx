// D-69 step 2 (spec 4.2, 6 "Step 2 · Home"): Home opens SCOPES.home only from its next-move card, and only while that
// card is drawn with the Community read. Contract: a Whole week locked or Pick streak moment that waits is never spent
// while Home is loading or showing a failed read (nothing drawn to pop), and plays once the read lands and the card
// appears; a waiting award or rank move is never spent on Home at all. The real MomentsProvider and the real engine
// (memory record, sync timer, a member who has navigated); effects run in place in a static render: the provider's own
// engine-making effect once, and the scope holders' effects (as in tests/next-score-rank-chip-engine.test.jsx).
// Fixture accounts and numbers only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rig = vi.hoisted(() => ({ engine: null, made: false, small: [], big: [], home: null, features: { model: null } }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal()),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useEffect: effect => { if (String(effect).includes('setEngine')) { if (!rig.made) { rig.made = true; effect(); } } else if (String(effect).includes('ctx?.engine')) effect(); },
}));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => rig.home }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => ({ loading: true, error: null, active: null }) }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => rig.features }));
vi.mock('../web/src/next/moments/engine.js', async importOriginal => {
  const actual = await importOriginal();
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
  return { ...actual, createMomentsEngine: options => (rig.engine ??= actual.createMomentsEngine({ ...options, storage, isSettled: () => true, hasNavigated: () => true, setTimer: fn => { fn(); },
    onSmall: m => rig.small.push(m.id), onBig: ms => rig.big.push(ms.map(m => m.id)) })) };
});
const { MomentsProvider } = await import('../web/src/next/moments/MomentsProvider.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');
const { SCOPES, scoreScope } = await import('../web/src/next/moments/catalog.js');
const { WEEK_LOCKED_SOURCE, weekLockedMoments } = await import('../web/src/next/play/landing.js');
const { streakMoments } = await import('../web/src/next/features/streakMoment.js');
const { featureMoments, featuresModel } = await import('../web/src/next/features/model.js');
const { rankCandidate, rankSource } = await import('../web/src/next/league/rankMoment.js');

const YOU = 'u-you';
const DEADLINE = '2026-11-06T01:15:00.000Z';
/** The normalized Community reply under per-game rules: Spread has `locked` of 14 games locked in, Total none. */
const community = locked => ({ viewer: YOU, members: [{ id: YOU, displayName: 'Casey Moore', removed: false }], submissions: [], standings: [], optOuts: [],
  rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 }, picksDue: { state: 'due', week: 9, deadline: DEADLINE, now: '2026-11-03T20:00:00.000Z', modes: [] },
  due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: locked, games: 14, openGames: 14 - locked, locked, nextKickoff: locked < 14 ? DEADLINE : null },
    { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 14, openGames: 14, locked: 0, nextKickoff: DEADLINE }] });
const AWARD = { week: 8, version: 1, createdAt: '2026-11-03T16:00:00Z', awards: [{ id: 'total_winner', winners: [YOU], entries: [], value: { points: 18 } }] };
const features = (streak, award) => ({ leagueId: null, season: 2026, ran: true, seasonWinners: null, badges: [], awards: award ? [AWARD] : [],
  streaks: [{ userId: YOU, pick: { current: streak, best: streak }, bets: { current: 0, best: 0 } }] });
const rankUp = n => rankCandidate({ league: 'community', mode: 'guess_spread', saved: { rank: 2, from: 3, n }, market: 'Spread' });
/** One read of each source Home's hooks report: Whole week locked, the features read (awards and streak), the Spread rank. */
function readAll({ locked = 13, streak = 4, award = false, rank = null } = {}) {
  rig.engine.report(weekLockedMoments(community(locked)), { source: WEEK_LOCKED_SOURCE });
  const reply = features(streak, award);
  rig.engine.report([...featureMoments(reply, YOU), ...streakMoments(reply, YOU)], { source: 'features:community' });
  rig.engine.report(rank === null ? [] : [rankUp(rank)], { source: rankSource('community', 'guess_spread') });
}
const WEEK = 'weekLocked:2026:9:guess_spread', STREAK = 'streak:pick:2026:5:5', AWARD_ID = 'award:community:2026:8:total_winner';

const app = { accountId: YOU, refresh: vi.fn() };
const shell = { state: { tab: 'home', views: { home: {} }, sheets: [] }, go: vi.fn(), setView: vi.fn(), tab: vi.fn(), reload: vi.fn() };
/** Draws Home with the Community read in `read` (`{ status, data, error }`) and the features read showing `reply`. */
function draw(read, reply = null) {
  rig.made = false;
  rig.home = { app, viewer: YOU, community: { loading: read.status === 'loading', ...read } };
  rig.features = reply ? { model: featuresModel(reply, { viewer: YOU, nameOf: () => 'Casey Moore' }), data: reply } : { model: null };
  return renderToStaticMarkup(<MomentsProvider account={YOU} showOverlay={() => {}}><ShellContext.Provider value={shell}><div className="gx"><Home/></div></ShellContext.Provider></MomentsProvider>);
}

describe('Home’s card holds Home’s moments, with the real engine', () => {
  beforeEach(() => { rig.engine = null; rig.small = []; rig.big = []; });

  it('a waiting Whole week locked and Pick streak are not spent while Home loads or fails, and pop once the card draws', () => {
    draw({ status: 'loading', data: null, error: null }); // the provider makes the engine; the Community read has not landed
    readAll(); // this device's first read of each source seeds it silently
    readAll({ locked: 14, streak: 5, award: true, rank: 1 }); // a later read: the week locks, the streak grows, an award and a rank move arrive
    expect(rig.engine.newCount(SCOPES.home), 'Whole week locked and the streak wait for Home’s card').toBe(2);

    const loading = draw({ status: 'loading', data: null, error: null }); // Home mounted, its read still loading
    expect(loading).toContain('data-skeleton="landing"');
    const failed = draw({ status: 'error', data: null, error: { status: 503 } }, features(5, true)); // the read failed with nothing to show
    expect(failed).not.toContain('data-home="hero"');
    expect([rig.small, rig.big], 'nothing is spent on a placeholder or a failed read').toEqual([[], []]);
    expect(rig.engine.newCount(SCOPES.home)).toBe(2);

    const html = draw({ status: 'ready', data: community(14), error: null }, features(5, true)); // the read lands: the card draws
    expect(html).toContain('data-home="hero"');
    expect(html).toContain('data-market="guess_spread"'); // the meter column that pops
    expect(html).toContain('data-home="streak"'); // the streak pill that pops
    expect(rig.small.toSorted(), 'both small moments play in place on the card').toEqual([STREAK, WEEK].toSorted());
    expect(rig.big, 'nothing big plays on Home').toEqual([]);
    expect(rig.engine.newCount(SCOPES.home)).toBe(0);
    expect(rig.engine.newMoments(SCOPES.features).filter(m => m.kind === 'award').map(m => m.id), 'the award still waits for Badges and awards').toEqual([AWARD_ID]);
    expect(rig.engine.newCount(scoreScope('guess_spread')), 'the rank move still waits for Your score').toBe(1);
  });
});
