/**
 * D-60: everyone lands in the new app; the old app opens only at `?app=classic` (Menu › "Older records and tools").
 * Specs that cover the old app call this once: every page the test opens on an http(s) origin gets `app=classic`
 * before the app reads its address, as the Menu link's page would. An address that already names an `app` is left alone.
 */
export async function useOldApp(page) {
  await page.addInitScript(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    const url = new URL(location.href);
    if (url.searchParams.has('app')) return;
    url.searchParams.set('app', 'classic');
    history.replaceState(history.state, '', url.href);
  });
}
