import { Button, Card } from '../ui/index.js';
import { displayUnits } from './route.js';
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
export function Bets({ data, route, onFilters, onEdit, refresh, loading, error }) {
  const filters = route.filters, summary = data?.summary;
  const field = (key, value) => onFilters({ ...filters, [key]: value || undefined });
  return <div className="gx-nba-stack">
    <h1 className="gx-t-title">{route.screen === 'history' ? 'NBA History' : 'My NBA Bets'}</h1>
    <p className="gx-c-2">Private tickets · Results confirmed by you</p>
    <div className="gx-nba-grid">
      <label className="gx-nba-field">Result<select value={filters.status || 'all'} onChange={event => field('status', event.target.value === 'all' ? '' : event.target.value)}>{['pending', 'all', 'settled', 'win', 'loss', 'push', 'void'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label className="gx-nba-field">Market<select value={filters.market || ''} onChange={event => field('market', event.target.value)}><option value="">All markets</option>{['moneyline', 'spread', 'total'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="gx-nba-field">From<input type="date" value={filters.from || ''} onChange={event => field('from', event.target.value)}/></label>
      <label className="gx-nba-field">To<input type="date" value={filters.to || ''} onChange={event => field('to', event.target.value)}/></label>
    </div>
    <Button onClick={() => onFilters({ ...filters, from: undefined, to: undefined })}>All dates</Button>
    {error && <p role="alert">{error.status === 401 ? 'Sign in again. ' : ''}Could not load tickets. {error.message}</p>}
    {loading && <p role="status">Loading tickets…</p>}
    <Button disabled={loading} onClick={() => refresh()}>Refresh tickets</Button>
    {summary && <Card className="gx-nba-stack" aria-label="Filtered totals"><h2 className="gx-t-section">Filtered totals · {countLabel(summary.count, 'ticket')}</h2><p>{countLabel(summary.wins, 'win')} · {countLabel(summary.losses, 'loss', 'losses')} · {countLabel(summary.pushes, 'push', 'pushes')} · {countLabel(summary.voids, 'void')}</p><p className="gx-nba-number">Net {displayUnits(summary.netUnits)} U</p><p>Pending stake {displayUnits(summary.pendingStakeUnits)} U · {summary.pending} pending</p><p>Settled risk {displayUnits(summary.riskUnits)} U · ROI {displayUnits(summary.roi)}%</p></Card>}
    {data && !data.tickets.length && !error && <Card>No tickets match these filters.</Card>}
    {data?.tickets.map(ticket => <Card key={ticket.id} className="gx-nba-stack"><div className="gx-nba-row"><strong>{ticket.label}</strong><span>{ticket.outcome}</span></div><p>{ticket.eventDate} · {ticket.kind} · {ticket.odds > 0 ? '+' : ''}{ticket.odds} · {ticket.stakeUnits} U</p><p>Net {displayUnits(ticket.netUnits)} U</p><details><summary>Ticket details and correction history</summary><ul>{ticket.legs.map((leg, index) => <li key={index}>{leg.matchup || 'Matchup unavailable'} · {leg.market} · {leg.team || leg.side} {leg.line ?? ''}</li>)}</ul><p>Original price: {ticket.priceInput ? `${ticket.priceInput.value}${ticket.priceInput.format === 'probability' ? '% probability' : ' American'}` : 'Imported terms'} · Revision {ticket.revision}</p>{ticket.audit.map(row => <div key={row.operationId} className="gx-nba-audit"><p>Revision {row.revision} · {row.updatedAt} · {row.reason || 'Original entry'}</p>{row.before && <p>Before: {row.before.outcome}, {row.before.odds}, {row.before.stakeUnits} U, net {displayUnits(row.before.netUnits)} U</p>}<p>After: {row.after.outcome}, {row.after.odds}, {row.after.stakeUnits} U, net {displayUnits(row.after.netUnits)} U</p></div>)}</details><Button onClick={() => onEdit(ticket)}>Edit terms or confirm result</Button></Card>)}
    {data?.nextCursor && <Button disabled={loading} onClick={() => refresh(data.nextCursor)}>Load more tickets</Button>}
  </div>;
}
