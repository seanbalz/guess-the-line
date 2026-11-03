// D-69 moments: useNewMoments(scope) reads the real engine's waiting list for one card. The list changes when a moment
// arrives and when it plays, other cards' moments never show, and the engine's own fields never leak. Effects run
// during a static render here (no browser), and the store is read as a browser reads it: the provider's engine-making effect runs once per render, other effects
// run inline. Fixture moments only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rig = vi.hoisted(() => ({ engine: null, made: false }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal()),
  // A browser reads the live snapshot; the server renderer would read the empty server one.
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useEffect: effect => {
    // The provider's effect (it sets the engine) would loop a static render; run it once. Any other effect runs inline.
    if (String(effect).includes('setEngine')) { if (!rig.made) { rig.made = true; effect(); } } else effect();
  },
}));
// The provider makes its engine through createMomentsEngine: hand it one real engine with a memory record, kept across renders.
vi.mock('../web/src/next/moments/engine.js', async importOriginal => {
  const actual = await importOriginal();
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
  return { ...actual, createMomentsEngine: options => (rig.engine ??= actual.createMomentsEngine({ ...options, storage, isSettled: () => true, hasNavigated: () => true })) };
});
const { MomentsProvider, useNewMoments } = await import('../web/src/next/moments/MomentsProvider.jsx');

const badge = (id, scopes) => ({ id, kind: 'badge', scopes, title: id });
const Waiting = ({ scope }) => <span data-ids={useNewMoments(scope).map(m => m.id).join('|')} data-keys={Object.keys(useNewMoments(scope)[0] ?? {}).sort().join(',')}>x</span>;
const draw = scope => { rig.made = false; return renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}><Waiting scope={scope}/></MomentsProvider>); };
const ids = html => /data-ids="([^"]*)"/.exec(html)[1];

describe('useNewMoments with a real engine', () => {
  beforeEach(() => { rig.engine = null; });
  it('lists the waiting moments of its scope only, as reported (no engine fields), and changes on arrival and on play', () => {
    expect(ids(draw('features'))).toBe('');
    rig.engine.report([], { source: 'features:community' }); // this device's first read seeds
    rig.engine.report([badge('b1', ['features']), badge('elsewhere', ['league'])], { source: 'features:community' });
    const html = draw('features');
    expect(ids(html)).toBe('b1');
    expect(html).toContain('data-keys="id,kind,scopes,title"');
    expect(ids(draw('league'))).toBe('elsewhere');
    rig.engine.report([badge('b1', ['features']), badge('b2', ['features']), badge('elsewhere', ['league'])], { source: 'features:community' });
    expect(ids(draw('features'))).toBe('b1|b2');
    rig.engine.open('features'); // the card opens: the moments play and leave the list
    expect(ids(draw('features'))).toBe('');
    expect(ids(draw('league'))).toBe('elsewhere');
  });
});
