// League › board › Points (D-56 spec sections 3.7 and 5): rank, face and name, week points and season points, with the
// House as an unranked row and "beat the House" one tap away. The Community board reads every member; a private group's
// board is the same read filtered to that group's roster on the server. Points never adds to Spread or Total.
import { Avatar, Card, List, Rank, Row } from '../../ui/index.js';
import { LeagueFailure } from '../../league/useLeagueRead.jsx';
import { PointsComingSoon, usePointsRead } from './PointsBallot.jsx';
import { boardRows, comingSoon, pts } from './pointsModel.js';
import './points.css';

export function PointsBoard({ app, groupId = null }) {
  return <PointsBoardView app={app} read={usePointsRead(app, groupId)}/>;
}

export function PointsBoardView({ app, read }) {
  if (read.loading) return <p className="gx-t-body gx-c-2" role="status">Loading the Points board…</p>;
  if (read.error) return comingSoon(read.error) ? <PointsComingSoon/> : <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data;
  if (data.status !== 'open') return <Card role="status"><p className="gx-t-body">No Points week has opened yet. The board starts with the first lock-in.</p></Card>;
  const { members, house } = boardRows(data, app.accountId);
  const status = data.result?.status;
  return <section className="gx-vstack gx-gap-12" aria-label="Points leaderboard">
    <h2 className="gx-t-section">Points standings</h2>
    <p className="gx-t-meta gx-c-2">Season ranking · Week {data.week}{status ? ` ${status}` : ''}. Points scores separately from Spread and Total.</p>
    <Card variant="flush"><List label="Points season standings">
      {members.map(row => <Row key={row.userId} you={row.you} start={<Avatar id={row.userId} name={row.name}/>} title={<>{row.name}{row.you ? ' · You' : ''}</>}
        sub={`Week: ${pts(row.week)} · Season: ${pts(row.season)}${row.provisional ? ' · PROVISIONAL' : ''}`} end={<Rank rank={row.rank} tied={row.tied}/>}/>)}
      <Row key="house" className="gx-pt-board-house" start={<span className="gx-pt-house-mark" aria-hidden="true">H</span>} title="House · unranked"
        sub={`Week: ${pts(house.week)} · GTL’s own estimate`} end={<span className="gx-t-meta">Unranked</span>}/>
    </List></Card>
    {!members.length && <p className="gx-t-body gx-c-2">No one has locked in a Points guess this season yet.</p>}
    {members.length > 0 && <details className="gx-score-detail">
      <summary className="gx-t-strong">Beat the House</summary>
      <ul className="gx-vstack gx-gap-8">{members.map(row => <li key={row.userId} className="gx-t-body">{row.name}: {row.beatHouse === null ? '—' : `${row.beatHouse} of ${row.weeksPlayed ?? 0} weeks`}</li>)}</ul>
      <p className="gx-t-meta gx-c-2">Counts only weeks where the House had an estimate for every player.</p>
    </details>}
    <p className="gx-t-meta gx-c-2">— means no scored result. Tied scores share their rank. Members appear from their first lock-in of the season.</p>
  </section>;
}
