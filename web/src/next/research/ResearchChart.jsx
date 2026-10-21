import { useId } from 'react';

export function ChartGraphic({ series, label = 'Selected historical sample' }) {
  const id = useId(), points = series?.points ?? [];
  const values = [0, ...points.map(p => p.illustrativeUnits)], min = Math.min(...values), max = Math.max(...values);
  const y = value => 76 - (value - min) / (max - min || 1) * 68;
  const coords = [[0, y(0)], ...points.map((p, i) => [(i + 1) / points.length * 280, y(p.illustrativeUnits)])];
  return <svg className="gx-r-chart" viewBox="0 0 280 84" role="img" aria-labelledby={id}>
    <title id={id}>{`${label}. Illustrative units at minus one hundred ten; zero baseline shown.`}</title>
    <line x1="0" x2="280" y1={y(0)} y2={y(0)} className="gx-r-zero" data-zero-baseline="true"/>
    <polyline points={coords.map(p => p.join(',')).join(' ')} className="gx-r-series"/>
  </svg>;
}
export default function ResearchChart({ candidate }) {
  const series = candidate.series;
  if (!series) return <p className="gx-t-meta">Historical chart unavailable.</p>;
  return <div className="gx-vstack gx-gap-8">
    <p className="gx-t-label">Illustrative units at -110</p>
    <ChartGraphic series={series} label={candidate.title}/>
    <p className="gx-t-meta">{series.binned ? 'Chart and table use chronological bins of the same selected games; each point is a bin endpoint, not an individual result.' : 'Chart and table use the same selected games.'} Pushes return zero units.</p>
    <div className="gx-r-table-wrap" tabIndex={0} role="region" aria-label="Historical results table">
      <table className="gx-r-table">
        <caption>Selected sample: {series.selectedSample} games · cumulative illustrative units at -110</caption>
        <thead><tr><th scope="col">Dates</th><th scope="col">W-L-P</th><th scope="col">Games</th><th scope="col">Units</th></tr></thead>
        <tbody>{series.points.map((p, i) => <tr key={i}><th scope="row"><span className="gx-r-table-date">{p.from.slice(0, 10)}</span>{p.to !== p.from ? <span className="gx-r-table-date">to {p.to.slice(0, 10)}</span> : null}</th><td>{p.wins}-{p.losses}-{p.pushes}</td><td>{p.sample}</td><td>{p.illustrativeUnits}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
