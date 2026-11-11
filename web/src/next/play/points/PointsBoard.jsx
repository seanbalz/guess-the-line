// League › board › Points (D-56 spec sections 3.7 and 5): rank, face and name, week points and season points, with the
// House as an unranked row at the bottom whose tap opens "Beat the House ›" (decision 6A, D-56 addendum of October 23). The Community board reads every member; a private group's
// board is the same read filtered to that group's roster on the server. Points never adds to Spread or Total.
import { useId, useState } from 'react';
import { Avatar, Button, Card, List, Rank, Row } from '../../ui/index.js';
import { PlayEmpty, PlayFailure, PlayLoading } from '../PlayStates.jsx';
import { PointsComingSoon, usePointsRead } from './PointsBallot.jsx';
import { boardRows, comingSoon, pts } from './pointsModel.js';
import './points.css';
import { LeagueStanding } from '../../league/LeagueStanding.jsx';
import { boardSlice } from '../../league/leagueModel.js';

export function PointsBoard({ app, groupId = null }) {
  return <PointsBoardView app={app} read={usePointsRead(app, groupId)}/>;
}

export function PointsBoardView({ app, read, initialBeat = false }) {
  const [beat, setBeat] = useState(initialBeat), [all, setAll] = useState(false), beatId = useId();
  if (read.loading) return <PlayLoading>Loading the Points board…</PlayLoading>;
  if (read.error) return comingSoon(read.error) ? <PointsComingSoon/> : <PlayFailure what="The Points board" error={read.error} onRetry={read.retry}/>;
  const data = read.data;
  if (data.status !== 'open') return <PlayEmpty>No Points week has opened yet. The board starts with the first lock-in.</PlayEmpty>;
  const { members, house } = boardRows(data, app.accountId);
  const status = data.result?.status, mine = members.find(row => row.you);
  const { shown, more } = boardSlice(members, all);
  return <section className="gx-vstack gx-gap-12" aria-label="Points leaderboard">
    <LeagueStanding mode="guess_points" row={mine ? { ...mine, points: mine.season } : null} scope={app.league?.name || 'Community'} period="season" detail={`Week ${data.week} · ${pts(mine?.week)} points`}/>
    <h2 className="gx-t-section">Points standings</h2>
    <p className="gx-t-meta gx-c-2">Season ranking · Week {data.week}{status ? ` ${status}` : ''}. Points scores separately from Spread and Total.</p>
    <Card variant="flush" className="gx-l-board"><List label="Points season standings">
      {shown.map(row => <Row key={row.userId} you={row.you} className="gx-l-row" start={<span className="gx-lg-start"><Rank rank={row.rank} tied={row.tied}/><Avatar id={row.userId} name={row.name}/></span>} title={<>{row.name}{row.you ? ' · You' : ''}</>}
        sub={`Week: ${pts(row.week)} · Season: ${pts(row.season)}${row.provisional ? ' · PROVISIONAL' : ''}`} end={<span className="gx-lg-total gx-n-s">{pts(row.season)}</span>}/>)}
    </List></Card>
    {more > 0 || all ? <Button variant="ghost" className="gx-lg-more" aria-expanded={all} onClick={() => setAll(open => !open)}>{all ? 'Show fewer' : `${more} more on the board`}</Button> : null}
    <Card variant="flush" className="gx-league-house">
      <Row key="house" className="gx-pt-board-house" start={<span className="gx-pt-house-mark" aria-hidden="true">H</span>} title="House · unranked"
        sub={`Week: ${pts(house.week)} · Beat the House ›`} end={<span className="gx-n-s">{pts(house.week)}</span>} aria-expanded={beat} aria-controls={beatId}
        onClick={members.length ? () => setBeat(open => !open) : undefined}/>
    </Card>
    {!members.length && <p className="gx-t-body gx-c-2">No one has locked in a Points guess this season yet.</p>}
    {members.length > 0 && <Card id={beatId} className="gx-vstack gx-gap-8" hidden={!beat} aria-label="Beat the House">
      <h3 className="gx-t-strong">Beat the House</h3>
      <ul className="gx-vstack gx-gap-8">{members.map(row => <li key={row.userId} className="gx-t-body">{row.name}: {row.beatHouse === null ? '—' : `${row.beatHouse} of ${row.weeksPlayed ?? 0} weeks`}</li>)}</ul>
      <p className="gx-t-meta gx-c-2">The House is GTL’s own estimate, unranked. Counts only weeks where it had an estimate for every player.</p>
    </Card>}
    <p className="gx-t-meta gx-c-2">— means no scored result. Tied scores share their rank. Members appear from their first lock-in of the season.</p>
  </section>;
}
