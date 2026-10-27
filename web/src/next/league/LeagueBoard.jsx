// The League boards with visual weight (design lane, League pass): a season race strip (every ranked face along the
// points axis), then one row per member with a 40px face, the leader highlighted (a "Leader" pill, the lead in words
// and a win-colored edge, never color alone), the season total counting up from what this device last saw, the badges
// they earned in the newest badge week, and on your own row the last move of your rank beside it. When your rank
// differs from the one this device last saw, one toast says so (useRankMoment). Ranks and points come only from the
// server's standings (shared/guess-board.mjs for the Community, the group's /state reply for a private league).
import { MODE, show } from '../../communityFormat.js';
import { boardFor } from '../../../../shared/guess-board.mjs';
import { Avatar, Badge, Card, List, Move, Pill, Rank, Row, Strip } from '../ui/index.js';
import { CountUp } from '../home/CountUp.jsx';
import { boardFact } from '../features/model.js';
import { useRankMoment } from './useRankMoment.js';
import { LeagueEmpty } from './useLeagueRead.jsx';

export const BOARD_COPY = Object.freeze({
  leader: 'Leader',
  leadsBy: gap => `Leads by ${show(gap)}`,
  tiedLead: 'Tied for the lead',
  race: 'Season race',
  raceLabel: (market, rows) => `${market} season points: ${rows.map(row => `${row.you ? 'You' : row.name} ${show(row.points)}`).join(', ')}`,
  badgesWeek: week => `Week ${week}`,
  badgesGroup: (week, name, you) => (you ? `Your Week ${week} badges` : `${name}’s Week ${week} badges`),
  badge: (badge, week) => `${badge.name}${badge.count > 1 ? `, ${badge.count} times` : ''}, Week ${week}`,
  moreBadges: n => `and ${n} more`,
  noMembers: 'No members yet.',
  invite: 'Invite friends',
});
// Four 44px badge buttons fit beside a face at 320; more is "+N" (the badges screen has them all).
const BADGES_SHOWN = 4;

/** The lead in words for each rank-1 row: "Leads by 2.5" (or "Tied for the lead"); null for every other row. */
export function leadLine(rows, row) {
  if (row.rank !== 1) return null;
  const leaders = rows.filter(r => r.rank === 1);
  if (leaders.length > 1) return BOARD_COPY.tiedLead;
  const second = rows.find(r => r.rank !== null && r.rank > 1 && Number.isFinite(r.points));
  return second && Number.isFinite(row.points) ? BOARD_COPY.leadsBy(row.points - second.points) : null;
}

/** Strip positions for the ranked rows: lowest season total at the left, highest at the right (all at the middle when equal). */
export function raceItems(rows) {
  const ranked = rows.filter(r => r.rank !== null && Number.isFinite(r.points));
  if (ranked.length < 2) return null;
  const lo = Math.min(...ranked.map(r => r.points)), hi = Math.max(...ranked.map(r => r.points));
  return { lo, hi, ranked, items: ranked.map(r => ({ id: r.id, name: r.name, you: r.you, pct: hi === lo ? 50 : (100 * (r.points - lo)) / (hi - lo) })) };
}

function RaceStrip({ rows, market }) {
  const race = raceItems(rows);
  if (!race) return null;
  return (
    <div className="gx-l-race" data-board="race">
      <p className="gx-t-label gx-c-2">{BOARD_COPY.race}</p>
      <Strip items={race.items} lowLabel={`${show(race.lo)} pts`} highLabel={`${show(race.hi)} pts`} label={BOARD_COPY.raceLabel(market, race.ranked)}/>
    </div>
  );
}

/**
 * The newest badge week's badges on a row: the week, then one 44px button per badge (its tile and "×3" when earned more
 * than once) that opens the badge's detail for that player. The rarest come first.
 */
function RowBadges({ week, badges, name, you, onBadge }) {
  if (!badges?.length || week === null) return null;
  const shown = badges.slice(0, BADGES_SHOWN), more = badges.length - shown.length;
  return (
    <span className="gx-l-badges" role="group" aria-label={BOARD_COPY.badgesGroup(week, name, you)} data-badges="week">
      <span className="gx-t-meta gx-c-2" aria-hidden="true">{BOARD_COPY.badgesWeek(week)}</span>
      {shown.map(b => (
        <button key={b.id} type="button" className="gx-l-badge" aria-label={BOARD_COPY.badge(b, week)} data-badge={b.id} onClick={() => onBadge?.(b.id)}>
          <Badge iconPath={b.icon} size={24} rarity={b.rarity}/>
          {b.count > 1 ? <span className="gx-l-badge-count" aria-hidden="true">{`×${b.count}`}</span> : null}
        </button>
      ))}
      {more > 0 ? <span className="gx-t-meta gx-c-2"><span aria-hidden="true">{`+${more}`}</span><span className="gx-sr-only">{BOARD_COPY.moreBadges(more)}</span></span> : null}
    </span>
  );
}

/**
 * One board row: `row` is `{ id, name, rank, tied, points, you }`; `figure` names its total for the count-up; `before` is
 * the row's words before the total ("Week: 12 · Season: "), `after` follows it (" · Won Week 4"), and `missing` stands in
 * for a total the server did not send ("—", or the group board's "Not scored yet"), never 0.
 */
export function BoardRow({ row, rows, account, figure, before, after, missing = '—', badges, badgeWeek, onBadge, move = null, fresh = false }) {
  const lead = leadLine(rows, row);
  return (
    <Row you={row.you} className={lead ? 'gx-l-row gx-l-row--lead' : 'gx-l-row'} data-board-row={row.id} data-leader={lead ? 'true' : undefined}
      start={<Avatar id={row.id} name={row.name} size={40} you={row.you}/>}
      title={<><span>{row.name}{row.you ? ' · You' : ''}</span>{lead ? <Pill tone="win" className="gx-l-lead-pill">{BOARD_COPY.leader}</Pill> : null}</>}
      sub={<>{before}{Number.isFinite(row.points) ? <CountUp value={row.points} account={account} figure={figure}/> : missing}{after}{lead ? ` · ${lead}` : ''}</>}
      end={<>{row.you && move ? <Move by={move} className={fresh ? 'gx-l-move gx-l-move--fresh' : 'gx-l-move'}/> : null}<Rank rank={row.rank} tied={row.tied}/></>}>
      <RowBadges week={badgeWeek} badges={badges} name={row.name} you={row.you} onBadge={badge => onBadge?.(badge, row.id)}/>
    </Row>
  );
}

/** The viewer's rank-change moment for one board: the toast once per change and the arrow on their row. */
export function useBoardMoment({ app, shell, league, mode, rows }) {
  const mine = rows.find(row => row.you) ?? null;
  return useRankMoment({ account: app?.accountId ?? null, league, mode, rank: mine?.rank ?? null, tied: mine?.tied === true, toast: shell?.toast });
}

/**
 * A board in its card: the race strip, then the rows. `rows` are in rank order (unranked last); `rowProps(row)` gives
 * each row's figure and words. Empty, it is one sentence and "Invite friends".
 */
export function BoardCard({ app, shell, league, mode, rows, label, features, rowProps }) {
  const moment = useBoardMoment({ app, shell, league, mode, rows });
  if (!rows.length) return <LeagueEmpty text={BOARD_COPY.noMembers} actionLabel={BOARD_COPY.invite} onAction={() => shell?.openSheet?.('sh.switcher')}/>;
  const badgeWeek = features?.badgeWeek ?? null;
  return (
    <Card variant="flush" className="gx-l-board" data-board={mode}>
      <RaceStrip rows={rows} market={MODE[mode]}/>
      <List label={label}>
        {rows.map(row => (
          <BoardRow key={row.id} row={row} rows={rows} account={app?.accountId ?? null} badgeWeek={badgeWeek}
            badges={features?.weekBadgesOf?.(row.id) ?? []} onBadge={(badge, userId) => shell?.openSheet?.('sh.badge', { badge, userId })}
            move={row.you ? moment.move : null} fresh={row.you && moment.fresh} {...rowProps(row)}/>
        ))}
      </List>
    </Card>
  );
}

/** The Community's rows for one market: the ranked rows in rank order, then every member without a ranked total. */
export function communityRows(feed, mode) {
  const ranked = boardFor({ ...feed, mode }), seen = new Set(ranked.map(row => row.id));
  return [...ranked, ...(feed.members || []).filter(member => !seen.has(member.id))
    .map(member => ({ id: member.id, name: member.displayName, rank: null, tied: false, points: null, you: member.id === feed.viewer }))];
}

/** The Community board for one market (Spread or Total), as LeagueScreen drew it, with the design lane's weight. */
export function CommunityBoard({ feed, mode, features = null, app, shell }) {
  const standings = feed.standings || [];
  const rows = communityRows(feed, mode);
  return (
    <section className="gx-vstack gx-gap-12" aria-label={`${MODE[mode]} leaderboard`}>
      <h2 className="gx-t-section">{MODE[mode]} standings</h2>
      <p className="gx-t-meta gx-c-2">Season ranking · {feed.week ? `Week ${feed.week.week} alongside` : 'No week published'}. Spread and Total score separately.</p>
      <BoardCard app={app} shell={shell} league="community" mode={mode} rows={rows} label={`${MODE[mode]} season standings`} features={features}
        rowProps={row => {
          const standing = standings.find(item => item.userId === row.id && item.mode === mode);
          const removed = feed.members?.find(member => member.id === row.id)?.removed;
          const fact = boardFact(features, row.id, mode);
          return {
            figure: `community.${mode}.season.${row.id}`,
            before: `${removed ? 'Removed · ' : ''}Week: ${standing?.satOut ? 'Sat out' : standing?.weekScored > 0 ? show(standing.weekPoints) : '—'} · Season: `,
            after: fact ? ` · ${fact}` : '',
          };
        }}/>
      <p className="gx-t-meta gx-c-2">— means no scored result. Tied scores share their rank. Removed members keep their records.</p>
    </section>
  );
}
