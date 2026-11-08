// Owner-selected generic payload. Never derive this from location, account or league state.
export const APP_INVITE = Object.freeze({
  title: 'Guess the Line',
  text: 'Join me on Guess the Line. Guess NFL spreads and totals, explore research, and compete with the Community.',
  url: 'https://guess-the-line.pages.dev/',
});
export async function shareApp(device = navigator) {
  if (typeof device.share !== 'function') return 'fallback';
  try { await device.share({ ...APP_INVITE }); return 'shared'; }
  catch (error) { return error?.name === 'AbortError' ? 'cancelled' : 'fallback'; }
}
