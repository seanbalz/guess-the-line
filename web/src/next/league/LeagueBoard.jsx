// The League boards (design lane, League pass; D-69 step 1, P6A): one row per member with the rank and a 40px face first, the
// leader highlighted (a "Leader" pill, the lead in words and a win-colored edge, never color alone), the season total on
// the right counting up from what this device last saw, the badges they earned in the newest badge week, and on your own
// row a rank chip with the last move, which pops when its engine moment plays (useRankMoment). The board shows 6 rows with
// your row in view, then "N more on the board". Under D-66 the old race strip is gone: the rows are the one picture. Ranks
// and points come only from the server's standings (shared/guess-board.mjs for the Community, the group's /state reply
// for a private league).
import { useState } from 'react';
import { MODE, show } from '../../communityFormat.js';
import { boardFor } from '../../../../shared/guess-board.mjs';
import { Avatar, Badge, Button, Card, List, Move, Pill, Rank, Row } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { boardFact } from '../features/model.js';
import { featuresView } from '../features/layers.js';
import { usePopped } from '../moments/MomentsProvider.jsx';
import { boardSlice } from './leagueModel.js';
import { ordinal } from './rankMoment.js';
import { useRankMoment } from './useRankMoment.js';
import { LeagueEmpty } from './useLeagueRead.jsx';
import { LeagueStanding } from './LeagueStanding.jsx';

export const BOARD_COPY = Object.freeze({
  leader: 'Leader',
  leadsBy: gap => `Leads by ${show(gap)}`,
  tiedLead: 'Tied for the lead',
  more: n => `${n} more on the board`,
  fewer: 'Show fewer',
  badgesWeek: week => `Week ${week}`,
  badgesGroup: (week, name, you) => (you ? `Your Week ${week} badges` : `${name}’s Week ${week} badges`),
  badge: (badge, week) => `${badge.name}${badge.count > 1 ? `, ${badge.count} times` : ''}, Week ${week}`,
  moreBadges: n => `and ${n} more`,
  noMembers: 'No members yet.',
  invite: 'Invite friends',
});
/** The board's fine print, behind the landing's ⓘ (D-38). */
export const BOARD_NOTES = Object.freeze({
  community: Object.freeze(['Season ranking. Spread and Total score separately.', '— means no scored result. Tied scores share their rank. Removed members keep their records.']),
  group: Object.freeze(['Only this group’s members appear here.', '— means no scored result. Tied scores share their rank.', 'Weekly guesses are reused across groups; each group keeps its own roster.']),
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

/** One row: `sub` is its words ("Week: 12 · Won Week 4"); `missing` stands in for a total the server did not send ("—"). */
export function BoardRow({ row, rows, account, figure, sub = '', missing = '—', badges, badgeWeek, onBadge, move = null, momentId = null }) {
  const lead = leadLine(rows, row), popped = usePopped(momentId ?? '');
  return (
    <Row you={row.you} className={lead ? 'gx-l-row gx-l-row--lead' : 'gx-l-row'} data-board-row={row.id} data-leader={lead ? 'true' : undefined}
      start={<span className="gx-lg-start"><Rank rank={row.rank} tied={row.tied}/><Avatar id={row.id} name={row.name} size={40} you={row.you}/></span>}
      title={<><span>{row.name}{row.you ? ' · You' : ''}</span>{lead ? <Pill tone="win" className="gx-l-lead-pill">{BOARD_COPY.leader}</Pill> : null}</>}
      sub={[sub, lead].filter(Boolean).join(' · ') || null}
      end={<>
        {row.you && row.rank ? <span className="gx-lg-chip" data-board="chip" data-moment={popped ? 'pop' : undefined}>{ordinal(row.rank)}{move ? <Move by={move} className="gx-l-move"/> : null}</span> : null}
        <span className="gx-n-m gx-lg-total" data-board="total">{Number.isFinite(row.points) ? <CountUp value={row.points} account={account} figure={figure}/> : missing}</span>
      </>}>
      <RowBadges week={badgeWeek} badges={badges} name={row.name} you={row.you} onBadge={badge => onBadge?.(badge, row.id)}/>
    </Row>
  );
}

/** A board: the first rows (yours in view), "N more on the board", and your rank's moment from `read` when it is `fresh`. */
export function BoardCard({ app, shell, league, mode, rows, label, features, rowProps, read = null, fresh = false, scope = 'Community', period = 'season', week = null }) {
  const [all, setAll] = useState(false), mine = rows.find(row => row.you) ?? null;
  const moment = useRankMoment({ account: app?.accountId ?? null, league, mode, rank: mine?.rank ?? null, tied: mine?.tied === true, read, fresh, market: MODE[mode] });
  if (!rows.length) return <LeagueEmpty text={BOARD_COPY.noMembers} actionLabel={BOARD_COPY.invite} onAction={() => shell?.openSheet?.('sh.switcher')}/>;
  const { shown, more } = boardSlice(rows, all), badgeWeek = features?.badgeWeek ?? null;
  return <>
    <LeagueStanding row={mine} rows={rows} mode={mode} scope={scope} period={period} week={week}/>
    <div className="gx-league-section-title"><h2 className="gx-t-section">{period === 'week' ? `Week ${week ?? '—'} standings` : 'Season standings'}</h2><p className="gx-t-meta gx-c-2">{period === 'week' ? 'This group’s weekly points' : week ? `Week ${week} beneath each name` : 'Weekly points beneath each name'}</p></div>
    <Card variant="flush" className="gx-l-board" data-board={mode}>
      <List label={label}>
        {shown.map(row => <BoardRow key={row.id} row={row} rows={rows} account={app?.accountId ?? null} badgeWeek={badgeWeek}
          badges={features?.weekBadgesOf?.(row.id) ?? []} onBadge={(badge, userId) => shell?.go?.('play', featuresView('badge', { badge, member: userId === app?.accountId ? null : userId }))}
          move={row.you ? moment.move : null} momentId={row.you ? moment.id : null} {...rowProps(row)}/>)}
      </List>
    </Card>
    {more > 0 || all ? <Button variant="ghost" className="gx-lg-more" aria-expanded={all} onClick={() => setAll(open => !open)}>{all ? BOARD_COPY.fewer : BOARD_COPY.more(more)}</Button> : null}
  </>;
}

/** The Community's rows for one market: the ranked rows in rank order, then every member without a ranked total. */
export function communityRows(feed, mode) {
  const ranked = boardFor({ ...feed, mode }), seen = new Set(ranked.map(row => row.id));
  return [...ranked, ...(feed.members || []).filter(member => !seen.has(member.id))
    .map(member => ({ id: member.id, name: member.displayName, rank: null, tied: false, points: null, you: member.id === feed.viewer }))];
}

/** The Community board for one market (Spread or Total); its fine print is BOARD_NOTES.community. */
export function CommunityBoard({ feed, mode, features = null, app, shell, fresh = false }) {
  const standings = feed.standings || [];
  return <section className="gx-vstack gx-gap-12" aria-label={`${MODE[mode]} leaderboard`}>
    <BoardCard app={app} shell={shell} league="community" mode={mode} rows={communityRows(feed, mode)} label={`${MODE[mode]} season standings`} features={features} read={feed} fresh={fresh} scope="Community" period="season" week={feed.week?.week}
      rowProps={row => {
        const standing = standings.find(item => item.userId === row.id && item.mode === mode);
        const removed = feed.members?.find(member => member.id === row.id)?.removed, fact = boardFact(features, row.id, mode);
        return { figure: `community.${mode}.season.${row.id}`, sub: `${removed ? 'Removed · ' : ''}Week: ${standing?.satOut ? 'Sat out' : standing?.weekScored > 0 ? show(standing.weekPoints) : '—'}${fact ? ` · ${fact}` : ''}` };
      }}/>
  </section>;
}
