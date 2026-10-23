import { beforeEach, describe, expect, it, vi } from 'vitest';

// No DOM library is installed, so React's hooks are replaced by a minimal runtime (state + dependency-aware effects)
// that re-renders the hook function. The contract under test is the hook's own logic, not React's scheduler.
const runtime = vi.hoisted(() => ({ slots: [], index: 0, effects: [], rerender: null }));
vi.mock('react', () => ({
  useState(initial) {
    const i = runtime.index++;
    if (!(i in runtime.slots)) runtime.slots[i] = initial;
    return [runtime.slots[i], value => { runtime.slots[i] = value; runtime.rerender(); }];
  },
  useEffect(fn, deps) {
    const i = runtime.index++, prev = runtime.slots[i];
    if (!prev || !deps || deps.some((dep, n) => !Object.is(dep, prev.deps[n]))) {
      prev?.cleanup?.();
      runtime.slots[i] = { deps, cleanup: null };
      runtime.effects.push(() => { runtime.slots[i].cleanup = fn(); });
    }
  },
}));

const auth = vi.hoisted(() => ({ callback: null }));
vi.mock('../web/src/auth', () => ({
  cloudEnabled: true,
  supabase: { auth: { onAuthStateChange: cb => { auth.callback = cb; } } },
}));
const reads = vi.hoisted(() => ({ account: 'a', pending: [], failNext: false }));
vi.mock('../web/src/api', () => ({
  linesApi: () => {
    const account = reads.account, fail = reads.failNext;
    reads.failNext = false;
    return new Promise((resolve, reject) => reads.pending.push(() => (fail ? reject(Object.assign(new Error('boom'), { status: 500 })) : resolve({ games: [{ id: 'g1', total: account }] }))));
  },
}));
vi.mock('../web/src/trendsLoaders.js', () => ({
  loadWind: () => Promise.resolve(null),
  watchTrendAccount: clear => {
    let account;
    return (_event, session) => { const id = session?.user?.id ?? null; if (account !== undefined && id !== account) clear(); account = id; };
  },
}));

import { loadFantasyLines, useFantasyGameContext } from '../web/src/fantasyContext.js';

let latest;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function render() {
  runtime.index = 0;
  latest = useFantasyGameContext(2026, 6);
  const effects = runtime.effects.splice(0);
  effects.forEach(run => run());
}
const mount = () => { runtime.rerender = render; render(); };
const settle = async () => { await flush(); reads.pending.splice(0).forEach(resolve => resolve()); await flush(); await flush(); };
const signIn = id => auth.callback('SIGNED_IN', { user: { id } });

beforeEach(() => { runtime.slots = []; runtime.effects = []; reads.pending = []; reads.account = 'a'; });

describe('Fantasy line context follows the signed-in account (D-39: lines are per viewer)', () => {
  it('shows no previous viewer lines after an account change, then only the new account lines', async () => {
    signIn('a');
    mount();
    await settle();
    expect(latest.lines.games.get('g1').total).toBe('a');

    reads.account = 'b';
    signIn('b');
    expect(latest.lines).toBeNull();
    await flush();
    expect(latest.lines).toBeNull();
    await settle();
    expect(latest.lines.games.get('g1').total).toBe('b');
  });
});

describe('failed line reads', () => {
  it('are not cached, so the next call asks again', async () => {
    signIn('c');
    reads.failNext = true;
    const first = loadFantasyLines(2026, 7);
    reads.pending.splice(0).forEach(resolve => resolve());
    expect((await first).status).toBe('unavailable');
    const second = loadFantasyLines(2026, 7);
    expect(reads.pending).toHaveLength(1);
    reads.pending.splice(0).forEach(resolve => resolve());
    expect((await second).status).toBe('ready');
  });
});
