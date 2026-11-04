// D-69 step 3: the week's report card (fantasyReport.js) as four tiles, one picture row per position under "Off by, by
// position", and the biggest misses one tap away. The status pill stays (PROVISIONAL or FINAL, from the review); the fine
// print sits behind the layer's ⓘ (FantasyNest.jsx).
import { PictureRow, Pill } from '../ui/index.js';

/** One list of the biggest misses; its h3 sits beside "Off by, by position" (the disclosure's summary is not one). */
function MissRows({ label, rows }) {
  return <section className="gx-vstack gx-gap-8" aria-label={label}><h3 className="gx-t-label gx-c-2">{label}</h3>
    {rows.length ? <ol className="gx-prows">{rows.map(row => <li key={row.id}><PictureRow title={row.title} meta={row.meta} value={row.value} word={row.word}/></li>)}</ol>
      : <p className="gx-t-meta">None.</p>}
  </section>;
}

export function FantasyReport({ report }) {
  return <section className="gx-vstack gx-gap-16 gx-fantasy-report" aria-label={`Week ${report.week} accuracy`}>
    <div className="gx-nest-tags"><Pill tone={report.status === 'FINAL' ? 'neutral' : 'pending'}>{report.status}</Pill></div>
    {report.graded ? <>
      <ul className="gx-nest-grid" aria-label="How close the estimates were">{report.tiles.map(tile => <li key={tile.key}><div className="gx-nest-tile" data-report={tile.key}>
        <span className="gx-nest-tile-label">{tile.label}</span><span className="gx-n-m gx-nest-num">{tile.big}</span><span className="gx-t-meta">{tile.sub}</span>
      </div></li>)}</ul>
      <section className="gx-vstack gx-gap-8" aria-label="Off by, by position"><h3 className="gx-t-label gx-c-2">Off by, by position</h3>
        <ol className="gx-prows">{report.positions.map(p => <li key={p.position} data-report-position={p.position}>
          <PictureRow title={p.position} meta={p.meta} value={p.value} word={p.word} tone={p.tone}/></li>)}</ol>
      </section>
      <details className="gx-tr-details" data-fantasy="misses"><summary className="gx-t-strong">Biggest misses</summary>
        <div className="gx-vstack gx-gap-12"><MissRows label="Estimated too high" rows={report.overs}/><MissRows label="Estimated too low" rows={report.unders}/></div>
      </details>
    </> : <p className="gx-t-body">{report.none}</p>}
  </section>;
}
