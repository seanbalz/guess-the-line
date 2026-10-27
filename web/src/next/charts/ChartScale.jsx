// Describe the geometry's own domain so independently scaled charts are readable.
const units = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4, signDisplay: 'exceptZero' });
const number = value => units.format(value).replace('-', '−');

export function ChartScale({ extent, id }) {
  return <p className="gx-tc-scale" id={id}>
    <span>Scale: </span>
    <span className="gx-tc-scale-values">{!extent ? 'Unavailable' : extent.low === extent.high
      ? '0 U · break-even' : `${number(extent.low)} to ${number(extent.high)} U`}</span>
  </p>;
}
