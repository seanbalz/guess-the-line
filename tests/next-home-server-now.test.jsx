// D-69 step 2 (H1A, carry-over 1): Home's clock is the server's `now` advanced by this device's elapsed monotonic time.
// Contract: each tick adds the time elapsed since the read, whatever the device's own date says; no usable `now`, no
// timer. Hooks run against a tiny state/effect stand-in (no DOM in this suite).
import { afterEach, describe, expect, it, vi } from 'vitest';

const rig = vi.hoisted(() => ({ value: undefined, effects: [] }));
vi.mock('react', () => ({
  useState: init => { if (rig.value === undefined) rig.value = init; return [rig.value, next => { rig.value = next; }]; },
  useEffect: effect => { rig.effects.push(effect); },
}));
const { useServerNow } = await import('../web/src/next/home/useServerNow.js');

afterEach(() => { vi.useRealTimers(); rig.value = undefined; rig.effects = []; });

describe('useServerNow', () => {
  it('advances by elapsed time each second and ignores the device date', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z')); // a device clock years off
    const base = Date.parse('2026-11-08T17:00:00.000Z');
    expect(useServerNow(base)).toBe(base);
    const stop = rig.effects.pop()();
    vi.advanceTimersByTime(3000);
    expect(rig.value).toBe(base + 3000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(rig.value, 'a stopped timer no longer moves it').toBe(base + 3000);
  });

  it('starts no timer without a usable server now', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    useServerNow(null);
    expect(rig.effects.pop()()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
