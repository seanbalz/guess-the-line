import { useEffect, useState } from 'react';
import { Button, Card, Skeleton } from '../../ui/index.js';
import { eplApi } from '../api.js';
import { guessProblem } from './guessModel.js';
import './guess.css';

export function GuessLeaderboard({ data }) {
  const max = Math.max(1, ...data.rows.map(r => Number.isFinite(r.average) ? r.average : 0));
  return <Card as="section"><h2 className="gx-t-section"><span className="gx-t-n-m">{data.season}</span> moneyline leaderboard</h2><p className="gx-t-meta">Lowest average distance wins · ties favor more matches guessed. Only locked matches past kickoff count. Unscored matches are excluded.</p>
    {data.rows.length ? <ol className="gx-epl-moneyline-ranks">{data.rows.map((row, index) => <li key={row.ownerId}>
      <div className="gx-epl-moneyline-rank"><strong>{Number.isFinite(row.average) ? `${index + 1}.` : '—'} {row.name || row.ownerId}</strong><strong className="gx-t-n-m">{Number.isFinite(row.average) ? row.average.toFixed(1) : '—'}</strong></div>
      <meter min="0" max={max} value={Number.isFinite(row.average) ? row.average : 0} aria-label={`${row.name || row.ownerId} average distance`} hidden={!Number.isFinite(row.average)}/>
      <p className="gx-t-meta">{row.guessed} guessed · {row.unscored} unscored{!Number.isFinite(row.average) ? ' · not ranked' : ' · points off per match'}</p>
    </li>)}</ol> : <p>No scored guesses yet.</p>}
  </Card>;
}
export default function EplGuessLeaderboard({ api = eplApi, accountId, season }) {
  const [state, setState] = useState({ key: null, status: 'loading' }), [retry, setRetry] = useState(0);
  // Identity key in render prevents a previous account/season's rows flashing before effect cleanup.
  const key = `${accountId ?? ''}/${season ?? 'current'}`;
  const shown = state.key === key ? state : { status: 'loading' };
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setState({ key, status: 'loading' });
    Promise.resolve().then(() => api('guess/leaderboard', season ? { season } : {}, { signal: controller.signal })).then(data => {
      if (!data || !Number.isInteger(data.season) || !Array.isArray(data.rows)) throw new Error('Invalid leaderboard');
      if (active) setState({ key, status: 'ready', data });
    }).catch(error => { if (active) setState({ key, status: 'error', error }); });
    return () => { active = false; controller.abort(); };
  }, [api, accountId, season, key, retry]);
  if (shown.status === 'loading') return <Skeleton label="Loading moneyline leaderboard" shape="panels"/>;
  return shown.status === 'ready' ? <GuessLeaderboard data={shown.data}/> : <section className="gx-empty"><p>{guessProblem(shown.error)}</p><Button onClick={() => setRetry(n => n + 1)}>Try again</Button></section>;
}
