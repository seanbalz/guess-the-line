// The redesign's route-group wrappers in web/src/api.js (build plan, section 3.3; stage 4): linesApi, betsApi,
// leagueApi and meApi refuse any action their group does not list, before any request, and a listed write is
// sent as a save, so a lost reply is a SaveUncertainError and is never retried. The sign-in module is replaced
// by a fixture session; no real account, key or project is used.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../web/src/auth.js', () => ({
  cloudEnabled: true, configurationError: '', publishableKey: 'sb_publishable_fixture', supabaseUrl: 'https://fixture.invalid',
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) } },
}));

const { ApiError, GROUP_ACTIONS, betsApi, cloudApi, leagueApi, linesApi, meApi, pointsApi, readTeams } = await import('../web/src/api.js');
const { SaveUncertainError } = await import('../web/src/apiResponse.js');

const wrappers = { lines: linesApi, bets: betsApi, league: leagueApi, me: meApi, points: pointsApi };
afterEach(() => vi.unstubAllGlobals());

describe('route-group wrappers', () => {
  it('cover the five groups, each with disjoint read and write action lists', () => {
    expect(Object.keys(GROUP_ACTIONS)).toEqual(['lines', 'bets', 'league', 'me', 'points']);
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

  it('lines distinguishes readers from durable source submissions, sent as POST to their routes', async () => {
    expect(GROUP_ACTIONS.lines).toEqual({ reads: ['read', 'game', 'research', 'teams', 'assessments', 'research-links'], writes: ['research-submit'] });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Lines are not available right now.' }), { status: 503, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    for (const [action, body] of [['read', {}], ['game', { gameId: 'SEA-DEN' }], ['research', { period: 'recent30' }]]) {
      const error = await linesApi(action, body).catch(caught => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).not.toBeInstanceOf(SaveUncertainError);
      expect(error.message).toBe('Lines are not available right now.');
    }
    // D-62: readTeams is the /lines/teams read, sent with an empty body for the current season.
    const teams = await readTeams().catch(caught => caught);
    expect(teams).toBeInstanceOf(ApiError);
    expect(teams).not.toBeInstanceOf(SaveUncertainError);
    expect(fetch.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['https://fixture.invalid/functions/v1/gtl-api/lines/read', 'POST', '{}'],
      ['https://fixture.invalid/functions/v1/gtl-api/lines/game', 'POST', '{"gameId":"SEA-DEN"}'],
      ['https://fixture.invalid/functions/v1/gtl-api/lines/research', 'POST', '{"period":"recent30"}'],
      ['https://fixture.invalid/functions/v1/gtl-api/lines/teams', 'POST', '{}'],
    ]);
  });
});

describe('Guess the Points wrapper', () => {
  it('reads the week as a read; drafts, lock-ins and slate changes are saves, never retried', async () => {
    expect(GROUP_ACTIONS.points).toEqual({ reads: ['read'], writes: ['draft', 'lock', 'slate'] });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const read = await pointsApi('read', {}).catch(caught => caught);
    expect(read).toBeInstanceOf(ApiError);
    expect(read).not.toBeInstanceOf(SaveUncertainError);
    for (const action of ['draft', 'lock', 'slate']) expect(await pointsApi(action, { requestId: 'fixture' }).catch(caught => caught)).toBeInstanceOf(SaveUncertainError);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['read', 'draft', 'lock', 'slate'].map(action => `https://fixture.invalid/functions/v1/gtl-api/points/${action}`));
  });

  it('keeps the coming-soon and lock refusal codes so the screen can act on them', async () => {
    for (const [status, code] of [[404, 'GTL_POINTS_OFF'], [409, 'GTL_POINTS_LOCKED'], [409, 'GTL_POINTS_CLOSED']]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Refused', code }), { status, headers: { 'content-type': 'application/json' } })));
      const error = await pointsApi(status === 404 ? 'read' : 'lock', {}).catch(caught => caught);
      expect([error.status, error.code, error.message]).toEqual([status, code, 'Refused']);
    }
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
