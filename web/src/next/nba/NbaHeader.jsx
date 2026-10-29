import { FieldMark, Segmented } from '../ui/index.js';
import { sportOptions } from '../epl/route.js';

/** The NBA section's header: the sport switch with NBA selected, offering EPL only when `epl` is true. */
export function NbaHeader({ epl = false, onSportChange }) {
  return <header className="gx-nba-header"><FieldMark size={32}/><Segmented label="Sport" value="nba" options={[...sportOptions(epl === true), { value: 'nba', label: 'NBA' }]} onChange={value => onSportChange(value)}/></header>;
}
