// A trend's recent and longer windows: W-L-P, games and the exact contributing dates, behind a disclosure.
import { lookup } from '../../../../shared/trends-view.mjs';
import { PLAYER_TREND_WINDOWS } from '../../../../shared/player-trends.mjs';
import { time } from './charts.jsx';

export function WindowRecords({ card, week, summary }) {
  // shortCard has already applied the independent game/market gate. Never inspect locked card payloads.
  if (card.locked) return null;
  const item = lookup(week, card.id)?.entry;
  if (!item?.windows) return <p className="gx-t-meta">Window evidence unavailable in this dated snapshot.</p>;
  const sides = item.market === 'total' ? ['Over','Under'] : item.market === 'home_ats' ? ['Home','Road'] : item.market === 'fav_ats' ? ['Favorite','Underdog'] : [card.team || 'Team with trait','Opponent'];
  return <details className="gx-tr-details"><summary className="gx-t-strong">{summary ?? 'Recent and longer evidence · ' + card.title}</summary><p className="gx-t-meta">Same qualifying historical situation. Registered cards keep their fixed side; two-sided rows show both. Dates are calendar dates.</p>
    <div className="gx-tr-table" role="region" aria-label={card.title + ' history windows'} tabIndex={0}><table><caption className="gx-t-meta">{item.sideLabel || sides.join(' / ')} · W-L-P and exact contributing dates</caption>
      <thead><tr><th scope="col">Window / side</th><th scope="col">W-L-P</th><th scope="col">Games</th><th scope="col">Dates</th></tr></thead>
      <tbody>{PLAYER_TREND_WINDOWS.flatMap(w => { const r = item.windows[w.id]; return !r ? [] : (r.A ? [[sides[0],r.A],[sides[1],r.B]] : [[item.sideLabel || 'Registered side',r]]).map(([label,v]) => <tr key={w.id+label}><th scope="row">{w.label} · {label}</th><td>{v.n ? v.W+'–'+v.L+'–'+v.P : 'No sample'}</td><td>{v.n}</td><td>{v.from ? time(v.from) + ' through ' + time(v.to) : '—'}</td></tr>); })}</tbody>
    </table></div>
  </details>;
}
