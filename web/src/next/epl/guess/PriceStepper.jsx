import { Button } from '../../ui/index.js';
import { parsePrice, priceText, stepPrice } from './guessModel.js';
import { validPrice } from '../../../../../shared/epl-moneyline.mjs';

export default function PriceStepper({ value, onChange, disabled = false, id }) {
  const valid = validPrice(parsePrice(value));
  return <div className="gx-epl-price">
    <label className="gx-t-strong" htmlFor={id}>Your moneyline price</label>
    <div className="gx-epl-price-controls">
      <Button aria-label="Decrease price by 5" disabled={disabled} onClick={() => onChange(String(stepPrice(value, -1)))}>−</Button>
      <input id={id} className="gx-epl-price-input" type="text" inputMode="text" value={value} disabled={disabled} autoComplete="off" spellCheck="false"
        aria-invalid={!valid} aria-describedby={`${id}-help`} onChange={event => onChange(event.target.value)}/>
      <Button aria-label="Increase price by 5" disabled={disabled} onClick={() => onChange(String(stepPrice(value, 1)))}>+</Button>
    </div>
    <p className="gx-t-meta" id={`${id}-help`}>{valid ? priceText(parsePrice(value)) : 'Enter a whole American price of +100 or higher, or −100 or lower.'}</p>
  </div>;
}
