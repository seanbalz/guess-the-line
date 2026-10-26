// `sh.picks`: one player's Spread or Total picks for a week (redesign build plan stage 64; prototype sh.picks), read from
// /community/picks (M-08). The server withholds another player's guess until that game and market is open to you (your
// lock-in, a sit-out or kickoff; D-31 as amended by D-39); a withheld game is a lock row with a sentence. Your own scored
// games carry "Share" (stage 65), which posts the result to the league showing; the reader gates it again for each friend.
import { useEffect, useState } from 'react';
import { communityApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, LockLine, Pill, Sheet } from '../ui/index.js';
import { fmtLate, fmtNum } from '../format.js';
import { MARKET, gameName, guessText } from './feedModel.js';
import { shareResult } from './feedActions.js';

const MODES = ['guess_spread', 'guess_total'];

export function PicksSheet({ args }) {
  const app = useAppData(), shell = useShell();
  const mode = MODES.includes(args?.mode) ? args.mode : 'guess_spread', userId = args?.userId ?? app.accountId;
  const own = userId === app.accountId, market = MARKET[mode];
  const name = (app.community.data?.members ?? []).find(member => member.id === userId)?.displayName || 'Former member';
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [shared, setShared] = useState({}), [sharing, setSharing] = useState(''), [problem, setProblem] = useState('');
  const [requests] = useState(() => new Map());
  useEffect(() => {
    const controller = new AbortController();
    const body = { mode, userId, ...(Number.isInteger(args?.season) && Number.isInteger(args?.week) ? { season: args.season, week: args.week } : {}) };
    communityApi('picks', body, controller.signal).then(data => { if (!controller.signal.aborted) setState({ loading: false, data, error: null }); })
      .catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setState({ loading: false, data: null, error }); });
    return () => controller.abort();
  }, [mode, userId, args?.season, args?.week]);

  const leagueId = app.league?.community === true ? null : app.league?.id ?? null;
  async function share(gameId) {
    if (sharing) return;
    const key = `${mode}:${gameId}:${leagueId ?? 'community'}`;
    if (!requests.has(key)) requests.set(key, crypto.randomUUID());
    setSharing(gameId); setProblem('');
    const result = await shareResult({ requestId: requests.get(key), leagueId, season: state.data.season, week: state.data.week, mode, gameId });
    setSharing('');
    if (result.ok) { setShared(previous => ({ ...previous, [gameId]: true })); shell.toast(`Shared to ${app.league?.name ?? 'Community'}`); }
    else setProblem(result.kind === 'uncertain' ? 'We could not confirm the share. Check the feed before sharing again.' : result.message || 'The result was not shared. Try again.');
  }

  const games = state.data?.games ?? [];
  return <Sheet title={own ? `Your ${market} picks` : `${name}’s ${market} picks`} onClose={shell.closeSheet}>
    {state.data?.week ? <p className="gx-t-meta gx-c-2">Week {state.data.week}</p> : null}
    {state.loading ? <p className="gx-t-body gx-c-2" role="status">Loading picks…</p> : null}
    {state.error ? <p className="gx-t-body gx-c-loss" role="alert">{state.error.status ? state.error.message : 'No connection. Reconnect and try again.'}</p> : null}
    {games.length ? <Card variant="flush" className="gx-feed-picks"><ul className="gx-list" role="list" aria-label={`${market} picks by game`}>{games.map(game => {
      const row = game.rows.find(r => r.userId === userId);
      const pick = row?.pick ?? null, late = row?.late ? fmtLate(row.late.minutes) : '';
      const status = !row || row.status === 'not_yet' ? (own && pick !== null ? 'Draft · not locked in' : 'No pick yet') : row.status === 'sat_out' ? 'Sat out' : '';
      return <li key={game.gameId} className="gx-feed-pick">
        <div className="gx-grow gx-vstack gx-gap-2">
          <span className="gx-t-team">{gameName(game.gameId)}</span>
          {row?.hidden ? <LockLine>Hidden until you lock in this game or it kicks off.</LockLine>
            : <span className="gx-hstack gx-gap-8 gx-wrap">{pick !== null ? <span className="gx-n-s">{guessText(mode, game.gameId, pick)}</span> : null}{status ? <span className="gx-t-meta gx-c-2">{status}</span> : null}{late ? <Pill tone="pending">{late}</Pill> : null}</span>}
        </div>
        <div className="gx-none gx-vstack gx-gap-4 gx-feed-pick-end">
          {row?.points !== null && row?.points !== undefined ? <span className="gx-n-xs">{fmtNum(row.points)} pts</span> : null}
          {own && row?.lockedIn && row?.points !== null && row?.points !== undefined
            ? <Button variant="secondary" className="gx-feed-share" aria-label={`Share your ${market} result for ${gameName(game.gameId)}`} aria-disabled={Boolean(sharing) || shared[game.gameId] || undefined}
              onClick={() => { if (!shared[game.gameId]) share(game.gameId); }}>{shared[game.gameId] ? 'Shared' : sharing === game.gameId ? 'Sharing…' : 'Share'}</Button> : null}
        </div>
      </li>;
    })}</ul></Card> : null}
    {!state.loading && !state.error && !games.length ? <p className="gx-t-body gx-c-2">No games this week.</p> : null}
    {problem ? <p className="gx-t-body gx-c-loss" role="alert">{problem}</p> : null}
  </Sheet>;
}
