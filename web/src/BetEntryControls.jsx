import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';
import './betEntryControls.css';

const present = value => value !== '' && value !== null && value !== undefined;
const signedLine = value => value === 0 ? 'Pick’em' : value > 0 ? `+${value}` : `−${Math.abs(value)}`;
const matchupLabel = game => {
  // Older schedule projections keep the canonical AWAY-HOME id but omit code fields.
  const codes = /^([A-Z]{2,4})-([A-Z]{2,4})$/.exec(game.id || '');
  return `${game.awayCode || codes?.[1] || game.away} @ ${game.homeCode || codes?.[2] || game.home}`;
};
const matchupName = game => {
  const short = matchupLabel(game), full = `${game.away} @ ${game.home}`;
  return short === full ? short : `${short} · ${full}`;
};

export function ChoiceButtons({ label, options, value, onChange, disabled = false, className = '' }) {
  return <fieldset className="social-entry-field" disabled={disabled}><legend>{label}</legend><div className={`social-entry-options ${className}`}>
    {options.map(option => {
      const item = typeof option === 'object' ? option : { value: option, label: option };
      const selected = value === item.value;
      return <button className="social-entry-option" key={item.value} type="button" aria-label={item.accessibleLabel} aria-pressed={selected} disabled={disabled} onClick={() => onChange(item.value)}>{selected && <Check size={16} aria-hidden="true"/>}{item.label}</button>;
    })}
  </div></fieldset>;
}

export function NumberChoices({ label, value, onChange, presets, format = String, disabled = false, allowUnknown = false, required = false, step = '0.01', min, max, adjust, children }) {
  const id = useId(), [custom, setCustom] = useState(false);
  const hasValue = present(value), numeric = Number(value);
  const showCustom = custom || (hasValue && !presets.includes(numeric));
  const choose = next => { onChange(next); setCustom(false); };
  return <fieldset className="social-entry-field social-entry-numbers" disabled={disabled}><legend>{label}</legend>
    {children}
    <div className="social-entry-options">{presets.map(option => {
      const selected = hasValue && numeric === option;
      return <button className="social-entry-option" key={option} type="button" aria-pressed={selected} disabled={disabled} onClick={() => choose(option)}>{selected && <Check size={16} aria-hidden="true"/>}{format(option)}</button>;
    })}{allowUnknown && <button className="social-entry-option" type="button" aria-pressed={!hasValue} disabled={disabled} onClick={() => choose('')}>{!hasValue && <Check size={16} aria-hidden="true"/>}Unknown</button>}
      <button className="social-entry-option" type="button" aria-expanded={showCustom} aria-controls={id} disabled={disabled} onClick={() => setCustom(open => !open)}>Custom</button>
    </div>
    {adjust && <div className="social-entry-adjustment">
      <button className="social-entry-option" type="button" aria-label={`Decrease ${adjust} by 0.5`} disabled={disabled || !hasValue || !Number.isFinite(numeric) || numeric - 0.5 < min} onClick={() => onChange(Math.round((numeric - 0.5) * 2) / 2)}>−0.5</button>
      <output className="social-entry-value" aria-live="polite">{hasValue && Number.isFinite(numeric) ? format(numeric) : 'Choose a line'}</output>
      <button className="social-entry-option" type="button" aria-label={`Increase ${adjust} by 0.5`} disabled={disabled || !hasValue || !Number.isFinite(numeric) || numeric + 0.5 > max} onClick={() => onChange(Math.round((numeric + 0.5) * 2) / 2)}>+0.5</button>
    </div>}
    <div id={id} hidden={!showCustom}>{showCustom && <label className="social-entry-custom">{label}<input type="number" inputMode="decimal" value={value ?? ''} required={required} step={step} min={min} max={max} disabled={disabled} onChange={event => onChange(event.target.value)}/></label>}</div>
  </fieldset>;
}

export function SpreadChoices({ value, onChange, disabled }) {
  const [positive, setPositive] = useState(Number(value) > 0);
  const isPositive = present(value) && Number(value) !== 0 ? Number(value) > 0 : positive;
  const changeSign = next => { setPositive(next); if (present(value)) onChange((next ? 1 : -1) * Math.abs(Number(value))); };
  return <NumberChoices label="Exact signed spread" value={value} onChange={onChange} presets={[0, 1.5, 2.5, 3, 3.5, 4, 6, 6.5, 7, 7.5].map(number => isPositive ? number : -number)} format={signedLine} disabled={disabled} required step="0.5" min={-100} max={100} adjust="spread">
    <ChoiceButtons label="Spread direction" value={isPositive ? 'plus' : 'minus'} options={[{ value: 'minus', label: 'Favorite (−)' }, { value: 'plus', label: 'Underdog (+)' }]} disabled={disabled} onChange={next => changeSign(next === 'plus')}/>
  </NumberChoices>;
}

export function MatchupChoices({ games, value, onChange, disabled }) {
  const [changing, setChanging] = useState(false);
  const game = games.find(item => item.id === value);
  if (game && !changing) return <div className="social-matchup-current"><strong title={`${game.away} @ ${game.home}`}>{matchupLabel(game)}</strong><button className="social-entry-option" type="button" disabled={disabled} onClick={() => setChanging(true)}>Change matchup</button></div>;
  return <ChoiceButtons label="Matchup" className="social-matchup-grid" value={value} options={games.map(item => ({ value: item.id, label: matchupLabel(item), accessibleLabel: matchupName(item) }))} disabled={disabled} onChange={next => { onChange(next); setChanging(false); }}/>;
}

const books = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'BetRivers', 'Novig'];
export function BookChoices({ value, onChange, disabled, required }) {
  const [custom, setCustom] = useState(false), id = useId();
  const showCustom = custom || (Boolean(value) && !books.includes(value));
  return <fieldset className="social-entry-field" disabled={disabled}><legend>Sportsbook / quote source</legend>
    <div className="social-entry-options">{books.map(book => <button className="social-entry-option" key={book} type="button" aria-pressed={value === book} disabled={disabled} onClick={() => { onChange(book); setCustom(false); }}>{value === book && <Check size={16} aria-hidden="true"/>}{book}</button>)}
      {!required && <button className="social-entry-option" type="button" aria-pressed={!value} disabled={disabled} onClick={() => { onChange(''); setCustom(false); }}>{!value && <Check size={16} aria-hidden="true"/>}Unknown</button>}
      <button className="social-entry-option" type="button" aria-expanded={showCustom} aria-controls={id} disabled={disabled} onClick={() => setCustom(open => !open)}>Custom</button>
    </div>
    <div id={id} hidden={!showCustom}>{showCustom && <label className="social-entry-custom">Sportsbook / quote source<input required={required} minLength={required ? 2 : undefined} maxLength={120} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Book shown on your ticket"/></label>}</div>
  </fieldset>;
}
