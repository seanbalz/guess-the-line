import { useId, useMemo, useState } from 'react';
import { Button, Card, Icon, InfoButton, Skeleton } from '../ui/index.js';
import { fmtNum, fmtOdds, fmtSide } from '../format.js';
import { INFO } from '../info.js';
import { bestRecordedBook, lineState, marketTime, marketValue, movementGeometry } from './marketDetails.js';
import { useGameLines } from './useGameLines.js';
import { useChartSelection } from '../charts/useChartSelection.js';
import './marketDetails.css';

export function MarketMovement({ rows, game, market }) {
  const geo = useMemo(() => movementGeometry(rows, game.kickoff), [rows, game.kickoff]);
  const chartId = useId();
  const evidenceKey = useMemo(() => JSON.stringify([game.id, market, rows.map(row => [row.capturedAt, row.value])]), [game.id, market, rows]);
  const { index: selected, onSelect: setSelected } = useChartSelection(evidenceKey, geo.points.length);
  const at = Math.min(selected, geo.points.length - 1), point = geo.points[at];
  // Plot indices exclude missing evidence; table indices retain every source row.
  const pointIndices = new Map(geo.points.map((p, i) => [p.index, i]));
  const label = `${market === 'spread' ? `${game.homeCode} spread` : 'Total'} movement`;
  const kickoffLabel = geo.kickoffX !== null ? `Kickoff · ${marketTime(game.kickoff)}` : null;
  const follow = event => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * 320;
    if (box.width && geo.points.length) setSelected(geo.points.reduce((best, p, i) => Math.abs(p.x - x) < Math.abs(geo.points[best].x - x) ? i : best, 0));
  };
  return <div className="gx-md-movement gx-vstack gx-gap-8">
    {!point ? <p className="gx-t-body">No recorded movement available.</p> : <>
      <p className="gx-t-strong" aria-hidden="true">{marketValue(game, market, point.value)}<span className="gx-md-date gx-t-meta">{marketTime(point.capturedAt)}</span></p>
      <div className="gx-md-plot" id={chartId} onPointerDown={event => { if (event.isPrimary && event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); follow(event); } }} onPointerMove={follow}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <svg viewBox="0 0 320 140" role="img" aria-label={`${label}: ${geo.points.length} recorded observations; ${marketValue(game, market, geo.low)} to ${marketValue(game, market, geo.high)}.${kickoffLabel ? ` Dashed marker: ${kickoffLabel}.` : ''}`}>
          {kickoffLabel && <line x1={geo.kickoffX} x2={geo.kickoffX} y1="0" y2="140" className="gx-md-kickoff" data-kickoff-marker="true"/>}
          <path d={geo.path} className="gx-md-path"/>
          {geo.points.map(p => <circle key={p.index} cx={p.x} cy={p.y} r={3} className="gx-md-point"/>)}
          {point.x !== geo.kickoffX && <line x1={point.x} x2={point.x} y1="0" y2="140" className="gx-md-cross"/>}
          <circle cx={point.x} cy={point.y} r={6} className="gx-md-point"/>
        </svg>
      </div>
      {kickoffLabel && <p className="gx-md-kickoff-key gx-t-meta"><span aria-hidden="true"/>{kickoffLabel}</p>}
      <div className="gx-md-axis gx-t-meta"><span>{marketTime(geo.points[0].capturedAt)}</span><span>{marketTime(geo.points.at(-1).capturedAt)}</span></div>
      {geo.points.length > 1 ? <input className="gx-md-scrub" type="range" min="0" max={geo.points.length - 1} step="1" value={at} aria-label={`Move along ${label.toLowerCase()}`} aria-valuetext={`${marketValue(game, market, point.value)}, ${marketTime(point.capturedAt)}`} onChange={event => setSelected(Number(event.target.value))}/> : <p className="gx-t-meta">One recorded observation; movement is not yet available.</p>}
      {geo.points.length !== rows.length ? <p className="gx-t-meta">Some observations have a missing line or time; gaps are not connected.</p> : null}
    </>}
    {rows.length ? <div className="gx-md-table-wrap"><table className="gx-md-table"><caption>Recorded consensus · {market === 'spread' ? `${game.homeCode} spread` : 'Total'}</caption><thead><tr><th scope="col">Collected (PT)</th><th scope="col">Line</th></tr></thead><tbody>{rows.map((row, i) => {
      const linked = geo.points.length > 1 && pointIndices.has(i), active = linked && point?.index === i;
      return <tr key={i} data-selected={linked ? active : undefined}>
        <th scope="row">{linked ? <button type="button" className="gx-md-observation-pick"
          aria-label={`Show observation ${i + 1}: ${marketTime(row.capturedAt)} on chart`} aria-controls={chartId} aria-pressed={active}
          onClick={() => setSelected(pointIndices.get(i))}>
          <span>{marketTime(row.capturedAt)}</span><Icon icon="check" size={12} className="gx-md-observation-check"/>
        </button> : marketTime(row.capturedAt)}</th><td>{marketValue(game, market, row.value)}</td>
      </tr>;
    })}</tbody></table></div> : null}
  </div>;
}

export function MarketPanel({ game, market, cell, now }) {
  const sideId = useId(), title = market === 'spread' ? 'Spread' : 'Total';
  const [side, setSide] = useState(market === 'spread' ? 'home' : 'over');
  if (cell?.visible !== true) return <Card><p className="gx-t-body gx-md-lock"><Icon icon="lock" size={16}/>{title} lines are locked. Lock in your guess or wait for kickoff.</p></Card>;
  const books = cell.books ?? [], best = bestRecordedBook(books, market, side, now);
  const state = lineState(cell.line, now);
  return <Card className="gx-vstack gx-gap-12" data-market-details={market}>
    <div><h4 className="gx-t-strong">{title}</h4><p className="gx-t-meta">{game.started && state === 'Current line' ? 'Latest recorded line' : state}</p>
      <p className="gx-n-m">{marketValue(game, market, cell.line?.value)}</p>
      <p className="gx-t-meta">{cell.line?.source ?? 'Source unavailable'} · Observed {marketTime(cell.line?.observedAt)}</p>
      {cell.line?.bookCount != null ? <p className="gx-t-meta">Consensus from {fmtNum(cell.line.bookCount)} books</p> : null}
    </div>
    <details className="gx-md-disclosure"><summary><span>Book lines</span><Icon icon="chevronDown" size={16}/></summary>
      {!books.length ? <p className="gx-t-body">No book quotes available.</p> : <div className="gx-vstack gx-gap-12">
        <label className="gx-t-body" htmlFor={sideId}>Compare side</label><select id={sideId} className="gx-md-select gx-t-body" value={side} onChange={event => setSide(event.target.value)}>{(market === 'spread' ? [['home', game.homeCode], ['away', game.awayCode]] : [['over', 'Over'], ['under', 'Under']]).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
        <ul className="gx-md-books">{books.map(book => <li key={book.book} className="gx-vstack gx-gap-8"><div><strong className="gx-t-strong">{book.source}</strong>{best === book.book ? <span className="gx-md-best gx-t-meta">Best recorded</span> : null}</div><p className="gx-t-body">{fmtSide(game.awayCode, game.homeCode, side, book.line)} · {fmtOdds(book.prices?.[side])}</p><p className="gx-t-meta">Observed {marketTime(book.observedAt)}</p></li>)}</ul>
      </div>}
    </details>
    <details className="gx-md-disclosure"><summary><span>Line movement</span><Icon icon="chevronDown" size={16}/></summary><MarketMovement rows={cell.movement ?? []} game={game} market={market}/></details>
    {game.started && <p className="gx-t-meta">Kickoff line: {marketValue(game, market, cell.kickoffLine?.value)} · Observed {marketTime(cell.kickoffLine?.observedAt)}</p>}
  </Card>;
}

export function MarketDetails({ lines, gameId }) {
  const read = useGameLines(lines, gameId);
  return <section className="gx-vstack gx-gap-12" aria-label="Market lines">
    <div className="gx-l-sechead"><h3 className="gx-t-section gx-grow">Market lines</h3><InfoButton {...INFO.marketLines}/></div>
    {read.status === 'loading' ? <Skeleton label="Loading market lines…" shape="panels" count={2}/> : read.status === 'error' ? <><p className="gx-t-body" role="status">Market lines are unavailable.</p><Button onClick={read.reload}>Retry market lines</Button></> : <>
      {['spread', 'total'].map(market => <MarketPanel key={`${gameId}:${market}`} game={read.data.game} market={market} cell={read.data[market]} now={read.now}/>)}
      <Button variant="ghost" onClick={read.reload}>Refresh market lines</Button>
    </>}
  </section>;
}
