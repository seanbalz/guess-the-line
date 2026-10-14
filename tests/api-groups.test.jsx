// The redesign's route-group wrappers in web/src/api.js (build plan, section 3.3; stage 4): linesApi, betsApi,
// leagueApi and meApi refuse any action their group does not list, before any request, and a listed write is
// sent as a save, so a lost reply is a SaveUncertainError and is never retried. The sign-in module is replaced
// by a fixture session; no real account, key or project is used.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../web/src/auth.js', () => ({
  cloudEnabled: true, configurationError: '', publishableKey: 'sb_publishable_fixture', supabaseUrl: 'https://fixture.invalid',
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) } },
}));

const { ApiError, GROUP_ACTIONS, betsApi, cloudApi, leagueApi, linesApi, meApi } = await import('../web/src/api.js');
const { SaveUncertainError } = await import('../web/src/apiResponse.js');

const wrappers = { lines: linesApi, bets: betsApi, league: leagueApi, me: meApi };
afterEach(() => vi.unstubAllGlobals());

describe('route-group wrappers', () => {
  it('cover the four groups, each with disjoint read and write action lists', () => {
    expect(Object.keys(GROUP_ACTIONS)).toEqual(['lines', 'bets', 'league', 'me']);
    for (const { reads, writes } of Object.values(GROUP_ACTIONS)) {
      for (const action of [...reads, ...writes]) expect(action).toMatch(/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/);
      expect(reads.filter(action => writes.includes(action))).toEqual([]);
      expect(Object.isFrozen(reads) && Object.isFrozen(writes)).toBe(true);
    }
  });

  it('refuse an action their group does not list, before any request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [group, call] of Object.entries(wrappers)) {
      for (const action of ['not-an-action', '../state', '', 'read?league=x']) {
        if ([...GROUP_ACTIONS[group].reads, ...GROUP_ACTIONS[group].writes].includes(action)) continue;
        const error = await call(action, {}).catch(caught => caught);
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(400);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('cloudApi save option', () => {
  const unavailable = () => new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });

  it('a group write sent as a save turns an unconfirmed reply into SaveUncertainError, once, without a retry', async () => {
    const fetch = vi.fn(async () => unavailable());
    vi.stubGlobal('fetch', fetch);
    const error = await cloudApi('bets/fixture-write', { requestId: 'fixture' }, { save: true }).catch(caught => caught);
    expect(error).toBeInstanceOf(SaveUncertainError);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://fixture.invalid/functions/v1/gtl-api/bets/fixture-write');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer fixture-token', apikey: 'sb_publishable_fixture', 'Content-Type': 'application/json' });
  });

  it('a read keeps today\'s behavior: the server\'s error, not an uncertain save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => unavailable()));
    const error = await cloudApi('lines/fixture-read', {}).catch(caught => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(SaveUncertainError);
    expect(error.message).toBe('Unavailable');
  });

  it('the existing game saves stay saves without the option', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => unavailable()));
    for (const route of ['ballot', 'bet', 'personal/ballot']) {
      expect(await cloudApi(route, { revision: 0 }).catch(caught => caught)).toBeInstanceOf(SaveUncertainError);
    }
  });
});
