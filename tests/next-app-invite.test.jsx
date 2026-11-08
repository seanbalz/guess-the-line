import { describe, expect, it } from 'vitest';
import { APP_INVITE, shareApp } from '../web/src/next/me/appInvite.js';
describe('public app invitation', () => {
  it('always shares only the approved public payload', async () => {
    const sent = [];
    const result = await shareApp({ share: async payload => { sent.push(payload); } });
    expect(result).toBe('shared');
    expect(sent).toEqual([{ title: 'Guess the Line', text: 'Join me on Guess the Line. Guess NFL spreads and totals, explore research, and compete with the Community.', url: 'https://guess-the-line.pages.dev/' }]);
    expect(Object.keys(APP_INVITE).sort()).toEqual(['text','title','url']);
  });
  it('supports manual fallback and treats device cancellation as cancellation', async () => {
    expect(await shareApp({})).toBe('fallback');
    expect(await shareApp({ share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } })).toBe('cancelled');
    expect(await shareApp({ share: async () => { throw new Error('not supported'); } })).toBe('fallback');
  });
});
