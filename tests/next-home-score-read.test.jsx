// Final fix wave F3: one home-score read. Home's score row, Home's score card and the Play landing's Your score and
// Compare tiles all read the season history through useHomeScoreRead: one key, one fetcher, one shared request, so
// "the landing adds no read beyond Home's" cannot drift. Contracts: the hook's key and options (shared), its fetcher
// (the current season's history), its sign-in on 401, and that it is the only place the key is written.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(() => Promise.resolve({ weeks: [] })) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: vi.fn(() => ({ loading: true, data: null, error: null })) }));
import { communityApi } from '../web/src/api.js';
import { useLeagueRead } from '../web/src/next/league/useLeagueRead.jsx';
import { useHomeScoreRead } from '../web/src/next/play/useHomeScoreRead.js';

const READERS = ['web/src/next/home/HomeSummaries.jsx', 'web/src/next/play/ScoreHomeTile.jsx', 'web/src/next/play/ScoreTile.jsx', 'web/src/next/play/CompareTile.jsx'];
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

describe('useHomeScoreRead', () => {
  it('reads the current season history on the shared home-score key, and asks for sign-in on 401', () => {
    const app = { accountId: 'u-me', community: { data: { week: { season: 2026, week: 9 } } }, requestSignIn: vi.fn() };
    useHomeScoreRead(app);
    const [key, read, onRefused, options] = useLeagueRead.mock.calls.at(-1);
    expect(key).toBe('u-me:home-score:2026:9');
    expect(options).toEqual({ shared: true });
    const signal = new AbortController().signal;
    read(signal);
    expect(communityApi).toHaveBeenLastCalledWith('history', { season: 2026 }, signal);
    onRefused({ status: 403 });
    expect(app.requestSignIn).not.toHaveBeenCalled();
    onRefused({ status: 401 });
    expect(app.requestSignIn).toHaveBeenCalledTimes(1);
    // Before the Community read names a week: the latest history, on its own key.
    useHomeScoreRead({ ...app, community: { data: null } });
    expect(useLeagueRead.mock.calls.at(-1)[0]).toBe('u-me:home-score:undefined:undefined');
    useLeagueRead.mock.calls.at(-1)[1](signal);
    expect(communityApi).toHaveBeenLastCalledWith('history', {}, signal);
  });

  it('is the one definition: the four readers call it, and no other file writes the home-score key', () => {
    for (const file of READERS) expect(fs.readFileSync(file, 'utf8'), file).toMatch(/useHomeScoreRead\(app\)/);
    const writers = files('web/src').filter(file => /\.(jsx?|mjs)$/.test(file) && fs.readFileSync(file, 'utf8').includes('home-score'));
    expect(writers.map(file => file.split(path.sep).join('/'))).toEqual(['web/src/next/play/useHomeScoreRead.js']);
  });
});
