// D-69 step 2 (H1A, carry-over 1): Home's clock is the server's `now` advanced by this device's elapsed monotonic time.
// Contract: each tick adds the time elapsed since the read landed (the store's `at`), whatever the device's own date
// says, so a screen mounted on an older read starts at the server's time now, not when the read landed; no usable
// `now`, no timer; an `until` stops the ticks once nothing can change. Hooks run against a tiny state/effect stand-in
// (no DOM in this suite).
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
    expect(useServerNow(base, Date.now())).toBe(base);
    const stop = rig.effects.pop()();
    vi.advanceTimersByTime(3000);
    expect(rig.value).toBe(base + 3000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(rig.value, 'a stopped timer no longer moves it').toBe(base + 3000);
  });

  it('a read that landed 3 minutes before mount: the clock starts at the server now plus 3 minutes, then ticks on', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.setSystemTime(new Date('2031-01-01T00:03:00Z'));
    const base = Date.parse('2026-11-08T17:00:00.000Z'), landed = Date.now() - 180_000;
    expect(useServerNow(base, landed), 'at mount, before any tick').toBe(base + 180_000);
    const stop = rig.effects.pop()();
    expect(rig.value, 'the effect keeps the read’s age').toBe(base + 180_000);
    vi.advanceTimersByTime(2000);
    expect(rig.value).toBe(base + 182_000);
    stop();
  });

  it('a read time ahead of the device clock counts as no age, never as time going back', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
    const base = Date.parse('2026-11-08T17:00:00.000Z');
    expect(useServerNow(base, Date.now() + 60_000)).toBe(base);
    const stop = rig.effects.pop()();
    expect(rig.value).toBe(base);
    stop();
    rig.value = undefined;
    expect(useServerNow(base, undefined), 'no read time: no age').toBe(base);
  });

  it('until: the ticks stop once the server clock reaches it (nothing on screen can change after the last kickoff)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
    const base = Date.parse('2026-11-08T17:00:00.000Z');
    useServerNow(base, Date.now(), { until: base + 2000 });
    const stop = rig.effects.pop()();
    vi.advanceTimersByTime(2000);
    expect(rig.value).toBe(base + 2000);
    expect(vi.getTimerCount(), 'no timer once the clock is past the last change').toBe(0);
    vi.advanceTimersByTime(5000);
    expect(rig.value).toBe(base + 2000);
    stop();
    // Mounted already past it: one value, no timer at all.
    rig.value = undefined; rig.effects = [];
    expect(useServerNow(base + 10_000, Date.now(), { until: base + 2000 })).toBe(base + 10_000);
    rig.effects.pop()();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no timer without a usable server now', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    useServerNow(null, Date.now());
    expect(rig.effects.pop()()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('until 0 (a server clock with nothing timed): no interval is ever left running', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    const base = Date.parse('2026-11-08T17:00:00.000Z');
    useServerNow(base, Date.now(), { until: 0 });
    const stop = rig.effects.pop()();
    expect(stop, 'no cleanup to run: no timer was started').toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
