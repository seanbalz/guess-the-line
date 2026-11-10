// Exact native number-line presentation, isolated from authenticated score readers.
// Source: web/src/next/play/WeeklyScore.jsx. The caller labels historical examples.
function NumberLine({ line }) {
  const at = value => `${value}%`;
  return <figure className="gx-ys-line">
    <div className="gx-ys-axis" role="img" aria-label={line.aria}>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--line" data-align={line.line.align} style={{ left: at(line.line.pct) }}>{line.line.label}</span>
      <span className="gx-ys-axis-track"></span>
      {line.gap ? <span className="gx-ys-axis-gap" style={{ left: at(line.gap.left), width: at(line.gap.width), transformOrigin: `${line.gap.origin} center` }}></span> : null}
      <span className="gx-ys-axis-tick" style={{ left: at(line.line.pct) }}></span>
      <span className="gx-ys-axis-you" style={{ left: at(line.you.pct) }}></span>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--you" data-align={line.you.align} style={{ left: at(line.you.pct) }}>{line.you.label}</span>
      {line.ticks.map(tick => <span key={tick.value} className="gx-t-meta gx-tnum gx-c-3 gx-ys-axis-num" style={{ left: at(tick.pct) }}>{tick.label}</span>)}
    </div>
    <figcaption className="gx-t-meta gx-c-3 gx-ys-caption">{line.caption}</figcaption>
  </figure>;
}
export {NumberLine};
