// All readouts share one grid cell for sizing. Only the current readout is visible;
// the plot keeps its position when labels wrap, without measuring or truncating text.
import { useMemo } from 'react';

export function ChartTooltip({ readouts, index, x }) {
  const now = readouts[index];
  const sizing = useMemo(() => <span className="gx-tc-tip-sizing">
    {readouts.map((item, i) => <span className="gx-tc-tip-measure" key={i}>
      <span className="gx-tc-tip-measure-value">{item.value}</span>
      <span className="gx-tc-tip-measure-label">{item.label}</span>
    </span>)}
  </span>, [readouts]);
  return <div className="gx-tc-tip" aria-hidden="true" style={{ left: `clamp(0px, calc(${x}% - 76px), calc(100% - 152px))` }}>
    <span className="gx-tc-tip-current">
      <span className="gx-tc-tip-value">{now.value}</span>
      <span className="gx-tc-tip-label">{now.label}</span>
    </span>
    {sizing}
  </div>;
}
