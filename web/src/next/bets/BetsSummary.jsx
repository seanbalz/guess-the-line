import { Card } from '../ui/Card.jsx';
import { InfoButton } from '../ui/InfoButton.jsx';
import { TrendLine } from '../charts/TrendLine.jsx';
import { LeagueFailure, LeagueLoading } from '../league/useLeagueRead.jsx';
import { fmtAmt, fmtMonthDay } from '../format.js';
import '../charts/charts.css';

/** Approved landing hierarchy, with the same owner-only accounting as the full overview. */
export function BetsSummary({ read }) {
  if (read.loading) return <LeagueLoading label="Loading your tracked bets…"/>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const { summary, chart } = read.model;
  const values = [0, ...chart.map(point => point.cumulativeNetUnits)];
  const net = summary.roiSampleCount ? summary.netUnits : null;
  const day = at => fmtMonthDay(at);
  return <Card as="section" className={`gx-bets-summary gx-tc-card${net < 0 ? ' gx-bets-summary--loss' : ''}`} aria-label="Your tracked bets">
    <div className="gx-bets-card-heading"><h2>Your tracked bets</h2><InfoButton title="About your tracked bets" body={[
      'All weeks. Only your tracked tickets contribute. Virtual Units and Guess accuracy points are separate.',
      'Net units use included settled tickets with complete returns. Unknown stakes and prices stay unknown; a reported full return can supply the return without a price.',
      'Settled and Open count included tickets. Tickets below also retain excluded entries. Results are player reported. Open Overview for records, ROI, filters and excluded or incomplete coverage.',
    ]}/></div>
    <p className={`gx-bets-summary-net${net < 0 ? ' gx-c-loss' : ''}`}>{net === null ? '—' : fmtAmt(net)}</p>
    <dl className="gx-bets-summary-counts"><div><dt>Settled</dt><dd>{summary.bets - summary.pending}</dd></div><div><dt>Open</dt><dd>{summary.pending}</dd></div></dl>
    {chart.length >= 2 ? <TrendLine values={values} height={88} contextLabel="Your tracked bets" start={day(chart[0].at)} end={day(chart.at(-1).at) === day(chart[0].at) ? '' : day(chart.at(-1).at)}
      label={`Cumulative net units over ${chart.length} settled tickets, ending at ${fmtAmt(values.at(-1))}`}
      tip={i => ({ value: fmtAmt(values[i]), label: i === 0 ? 'Start' : `Ticket ${i} · ${day(chart[i - 1].at)}` })}/>
      : <p className="gx-t-meta gx-c-2">{chart.length ? 'One settled ticket so far' : 'Your first settled ticket starts this chart'}</p>}
  </Card>;
}
