import { Button, Card, Pill } from '../ui/index.js';
import { today } from './route.js';
import { fmtWhen } from '../format.js';
const titles = { scheduled: 'Scheduled', in_progress: 'In progress', final: 'Final', other: 'Schedule updates' };
// The provider puts the raw ISO start time in the status field of games not yet started; show it as a Pacific label (same helper as the NFL kickoffs). Live and final labels pass through.
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const statusLabel = game => game.status === 'in_progress' ? 'LIVE' : game.status === 'scheduled' && ISO_TIME.test(game.statusText ?? '') ? fmtWhen(game.startTime || game.statusText) : game.statusText || game.status;
const shiftDate = (date, days) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
export function Games({ board, date, timeZone, onDate, onTrack, refresh, loading, error }) {
  const groups = Object.keys(titles).map(key => [key, (board?.games ?? []).filter(game => (['scheduled', 'in_progress', 'final'].includes(game.status) ? game.status : 'other') === key)]);
  return <div className="gx-nba-stack">
    <h1 className="gx-t-title">NBA Games</h1>
    <p className="gx-c-2">{date} · {timeZone}</p>
    <div className="gx-nba-actions"><Button onClick={() => onDate(shiftDate(date, -1))}>Yesterday</Button><Button onClick={() => onDate(today(timeZone))}>Today</Button><Button onClick={() => onDate(shiftDate(date, 1))}>Tomorrow</Button></div>
    <label className="gx-nba-field">Game date<input type="date" value={date} onChange={event => event.target.value && onDate(event.target.value)}/></label>
    <div role="status">{loading ? 'Loading games…' : error ? `${error.status === 401 ? 'Sign in again. ' : ''}Refresh failed. ${error.message}` : board?.unavailable ? 'Games are unavailable. Source connection or refresh is pending.' : null}</div>
    {board?.observedAt && <p className="gx-t-meta gx-c-2">{error || board.stale ? 'Cached' : 'Observed'} · {board.source} · {new Date(board.observedAt).toLocaleString()} · {Math.max(0, Math.floor((Date.now() - Date.parse(board.observedAt)) / 60000))} min ago</p>}
    <Button disabled={loading} onClick={() => refresh()}>Refresh games</Button>
    {board && !board.unavailable && !board.games.length && <Card>No games on this date.</Card>}
    {groups.map(([key, games]) => games.length ? <section className="gx-nba-stack" key={key} aria-label={titles[key]}><h2 className="gx-t-section">{titles[key]}</h2>{games.map(game => <Card key={game.id} className="gx-nba-stack">
      <div className="gx-nba-row"><strong>{game.away.abbreviation} at {game.home.abbreviation}</strong><Pill tone={game.status === 'in_progress' ? 'live' : 'neutral'}>{statusLabel(game)}</Pill></div>
      <p>{game.away.name} <span className="gx-t-n-s">{game.awayScore ?? '—'}</span> · {game.home.name} <span className="gx-t-n-s">{game.homeScore ?? '—'}</span></p>
      <p className="gx-t-meta gx-c-2">{game.startTime ? new Date(game.startTime).toLocaleString(undefined, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : `${game.sourceDate} · Time unavailable`}</p>
      <details><summary>Game details</summary><p>{game.status === 'scheduled' ? statusLabel(game) : game.statusText || game.status}</p><p className="gx-t-meta">{board.source} · {game.observedAt || board.observedAt || 'Observation unavailable'}</p></details>
      <Button onClick={() => onTrack(game)}>Track bet</Button>
    </Card>)}</section> : null)}
  </div>;
}
