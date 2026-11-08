/** Hold only frames requested after the app is ready, so a navigation's pending handoff can be exercised exactly. */
export async function holdAnimationFrames(page) {
  await page.evaluate(() => {
    const request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
    const held = new Map();
    let next = -1;
    window.requestAnimationFrame = callback => { const id = next--; held.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { if (!held.delete(id)) cancel.call(window, id); };
    window.__heldFrameCount = () => held.size;
    window.__flushHeldFrames = () => {
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      delete window.__flushHeldFrames;
      delete window.__heldFrameCount;
      const callbacks = [...held.values()];
      held.clear();
      for (const callback of callbacks) callback(performance.now());
      return callbacks.length;
    };
  });
  return {
    pendingCount: () => page.evaluate(() => window.__heldFrameCount()),
    flush: () => page.evaluate(() => window.__flushHeldFrames()),
  };
}
