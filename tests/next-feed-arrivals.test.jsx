// Final fix wave M2: the feed's rise-in plays once per arrival (D-58 "It never replays"). usePostArrivals keeps what a
// later read brought for the League layer that showed when it arrived; switching board <-> feed or another league
// spends it, so the cards that remount there carry no data-arrived. React's hooks are stood in for by a minimal runtime
// (state and refs kept by call order; effects run at commit when their deps changed; a state change repeats the render,
// and a render thrown away that way commits nothing), so the real hook runs as written. Fixture posts only.
import { describe, expect, it, vi } from 'vitest';

const rig = vi.hoisted(() => ({ slots: [], i: 0, effects: [], dirty: false }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal()),
  useRef: initial => { const i = rig.i++; rig.slots[i] ??= { current: initial }; return rig.slots[i]; },
  useState: initial => {
    const i = rig.i++;
    rig.slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    const slot = rig.slots[i];
    return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; rig.dirty = true; } }];
  },
  useEffect: (effect, deps) => {
    const i = rig.i++, prior = rig.slots[i];
    // Deps are recorded at commit (below), so a render thrown away by a state change during render runs nothing.
    if (!prior || deps.some((dep, k) => !Object.is(dep, prior.deps[k]))) rig.effects.push({ i, effect, deps });
  },
}));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn() }));
const { usePostArrivals } = await import('../web/src/next/feed/Feed.jsx');

/** One render of the hook as React would settle it: rerun after any state change, effects after each pass. */
function render(page, key, layer) {
  let ids;
  for (let pass = 0; pass < 10; pass += 1) {
    rig.dirty = false; rig.i = 0; rig.effects = [];
    ids = usePostArrivals(page, key, layer);
    if (rig.dirty) continue;
    for (const { i, effect, deps } of rig.effects) { rig.slots[i] = { deps }; effect(); }
    if (!rig.dirty) return [...ids];
  }
  throw new Error('the hook never settled');
}
const post = (id, hour) => ({ id, createdAt: `2026-11-02T${hour}:00:00Z` });
const page = (...posts) => ({ posts });

describe('usePostArrivals (M2)', () => {
  it('a post rises once per arrival: board <-> feed and another league never replay it', () => {
    rig.slots = [];
    const first = page(post('a', '10'), post('b', '09')), later = page(post('c', '11'), post('a', '10'), post('b', '09'));
    expect(render(first, 'me:community', 'board')).toEqual([]);
    expect(render(later, 'me:community', 'board')).toEqual(['c']);
    expect(render(later, 'me:community', 'board')).toEqual(['c']);
    expect(render(later, 'me:community', 'feed')).toEqual([]);
    expect(render(later, 'me:community', 'board')).toEqual([]);
    const third = page(post('d', '12'), ...later.posts);
    expect(render(third, 'me:community', 'feed')).toEqual(['d']);
    expect(render(third, 'me:g1', 'feed')).toEqual([]);
    expect(render(third, 'me:community', 'feed')).toEqual([]);
  });
});
