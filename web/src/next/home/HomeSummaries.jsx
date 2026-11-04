import { show } from '../../communityFormat.js';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { FocusRow } from '../ui/FocusLanding.jsx';
import { ownEntry, scoreRows, scoreSummary, SCORE_MARKETS } from '../play/scoring.js';
import { useHomeScoreRead } from '../play/useHomeScoreRead.js';

export function ScoreSummaryRow({ app, onClick }) {
  const current = app.community.data?.week;
  const read = useHomeScoreRead(app);
  const week = read.data?.weeks?.find(row => row.season === current?.season && row.week === current?.week);
  const sub = read.loading ? 'Loading your scores…' : read.error ? 'Scores unavailable · open to retry' : !week ? 'No scoring record this week yet' : SCORE_MARKETS.map(({ value, label }) => {
    const entry = ownEntry(week, read.data.viewer, value), summary = scoreSummary(scoreRows(week, entry));
    return `${label} ${entry?.eligible === false || !summary.scored ? '—' : `${show(summary.points)} pts`}`;
  }).join(' · ');
  return <FocusRow icon="target" title="Your scores" sub={sub} onClick={onClick}/>;
}

export function BetsSummaryRow({ app, onClick }) {
  const read = useTicketSummary(app);
  const sub = read.loading ? 'Loading your tickets…' : read.error ? 'Tickets unavailable · open to retry' : `${read.active} active ${read.active === 1 ? 'ticket' : 'tickets'} · placed elsewhere`;
  return <FocusRow icon="ticket" title="My bets" sub={sub} onClick={onClick}/>;
}
