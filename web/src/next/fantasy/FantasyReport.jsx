// D-69 step 3: the week's report card (fantasyReport.js) as four tiles, one picture row per position under "Off by, by
// position", and the biggest misses one tap away. The status pill stays (PROVISIONAL or FINAL, from the review); the fine
// print sits behind the layer's ⓘ (FantasyNest.jsx).
import { Card, PictureRow, Pill, TeamMark } from '../ui/index.js';
import { formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';

/** One list of the biggest misses; its h3 sits beside "Off by, by position" (the disclosure's summary is not one). */
function MissRows({ label, rows }) {
  return <section className="gx-vstack gx-gap-8" aria-label={label}><h3 className="gx-t-label gx-c-2">{label}</h3>
    {rows.length ? <ol className="gx-prows">{rows.map(row => <li key={row.id}><PictureRow className="gx-card" picture={<TeamMark code={row.team} size={32} decorative/>} title={row.title} meta={row.meta} value={row.value} word={row.word}/></li>)}</ol>
      : <p className="gx-t-meta">None.</p>}
  </section>;
}

export function FantasyReport({ report }) {
  const paired = report.positions.filter(p => Number.isFinite(p.pairedMae) && Number.isFinite(p.baselineMae));
  const scale = Math.max(5, Math.ceil(Math.max(0, ...paired.flatMap(p => [p.pairedMae, p.baselineMae])) / 5) * 5);
  return <section className="gx-vstack gx-gap-16 gx-fantasy-report" aria-label={`Week ${report.week} accuracy`}>
    <div className="gx-nest-tags"><Pill tone={report.status === 'FINAL' ? 'neutral' : 'pending'}>{report.status}</Pill></div>
    {report.graded ? <>
      <ul className="gx-nest-grid" aria-label="How close the estimates were">{report.tiles.map(tile => <li key={tile.key}><div className="gx-card gx-nest-tile" data-report={tile.key}>
        <span className="gx-nest-tile-label">{tile.label}</span><span className="gx-n-m gx-nest-num">{tile.big}</span><span className="gx-t-meta">{tile.sub}</span>
      </div></li>)}</ul>
      <section className="gx-vstack gx-gap-8" aria-label="Off by, by position"><h3 className="gx-t-label gx-c-2">Off by, by position</h3>
        <ol className="gx-prows">{report.positions.map(p => <li key={p.position} data-report-position={p.position}>
          <PictureRow className="gx-card" title={p.position} meta={p.meta} value={p.value} word={p.word} tone={p.tone}/></li>)}</ol>
      </section>
      <details className="gx-tr-details" data-fantasy="misses"><summary className="gx-t-strong">Biggest misses</summary>
        <div className="gx-vstack gx-gap-12"><MissRows label="Estimated too high" rows={report.overs}/><MissRows label="Estimated too low" rows={report.unders}/></div>
      </details>
      {paired.length ? <Card className="gx-fantasy-error-chart" as="section" aria-label="Paired error by position">
        <h3 className="gx-t-section">GTL vs season average</h3><p className="gx-t-meta gx-c-2">Mean absolute error · lower is closer<br/>Same players with a baseline · 0–{scale} points</p>
        <div className="gx-fantasy-error-legend gx-t-meta"><span>GTL</span><span>Season average</span></div>
        {paired.map(p => <div className="gx-fantasy-error-position" key={p.position} data-error-position={p.position}>
          <div className="gx-fantasy-error-label gx-t-meta"><strong>{p.position}</strong><span>{p.graded} graded</span></div>
          {[['GTL', p.pairedMae], ['Season average', p.baselineMae]].map(([label, value]) => <div className="gx-fantasy-error-bar" data-method={label} key={label}><span className="gx-sr-only">{label}</span><span className="gx-fantasy-error-track" aria-hidden="true"><span style={{ width: `${100 * value / scale}%` }}/></span><b className="gx-t-body">{number(value)}</b></div>)}
        </div>)}
      </Card> : null}
    </> : <p className="gx-t-body">{report.none}</p>}
  </section>;
}
