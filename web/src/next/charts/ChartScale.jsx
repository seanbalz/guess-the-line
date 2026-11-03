// Describe the geometry's own domain so independently scaled charts are readable.
const units = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4, signDisplay: 'exceptZero' });
const number = value => units.format(value).replace('-', '−');

export function ChartScale({ extent, id, formatValue }) {
  return <p className="gx-tc-scale" id={id}>
    <span>Scale: </span>
    <span className="gx-tc-scale-values">{!extent ? 'Unavailable' : extent.low === extent.high
      ? `${formatValue?formatValue(0):'0 U'} · break-even` : formatValue?`${formatValue(extent.low)} to ${formatValue(extent.high)}`:`${number(extent.low)} to ${number(extent.high)} U`}</span>
  </p>;
}
