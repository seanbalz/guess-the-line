// Time-of-day check for the cloud browser specs. With GTL_TEST_NOW set to an instant, loading this module through
// `node --import` starts Date in the Playwright runner and its workers at that instant and lets it run on in real time:
// the handler, the fixture deadline (fixture-deadline.mjs) and PGlite's now(), whose WebAssembly clock reads Date.now,
// all move together. shiftBrowserClock(page) moves the page's Date by the same offset. Unset, both do nothing.
//   GTL_TEST_NOW=2026-10-15T06:00:00Z NODE_OPTIONS="--import ./tests/cloud-browser/test-clock.mjs" \
//     npx playwright test --config playwright.cloud.config.js tests/cloud-browser/personas
// runs the personas as if it were 11:00 PM PT on Wednesday, October 14 (2026-10-19T06:00:00Z is Sunday 11:00 PM PT).
const shim = offset => {
  const RealDate = Date;
  function ShiftedDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString();
    return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + offset);
  }
  ShiftedDate.prototype = RealDate.prototype;
  ShiftedDate.now = () => RealDate.now() + offset;
  ShiftedDate.parse = RealDate.parse;
  ShiftedDate.UTC = RealDate.UTC;
  globalThis.Date = ShiftedDate;
};

const target = typeof process !== 'undefined' ? process.env.GTL_TEST_NOW : undefined;
if (target && globalThis.__gtlTestClockOffset === undefined) {
  const offset = Date.parse(target) - Date.now();
  if (!Number.isFinite(offset)) throw new Error(`GTL_TEST_NOW is not a date: ${target}`);
  globalThis.__gtlTestClockOffset = offset;
  shim(offset);
}

/** Moves the page's Date by the runner's GTL_TEST_NOW offset, from the next navigation on. */
export async function shiftBrowserClock(page) {
  if (globalThis.__gtlTestClockOffset !== undefined) await page.addInitScript(shim, globalThis.__gtlTestClockOffset);
}
