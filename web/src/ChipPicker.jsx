import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import './chipPicker.css';

const halves = (from, to) => Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => from + i / 2);
const SPREAD_CHIPS = halves(1, 10), SPREAD_MORE = halves(10.5, 20);
const show = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * D-21 button entry. Spread values are home-referenced: home favored by 3 is -3.
 * Totals use whole-number chips around a center plus ±0.5 fine tuning.
 */
export default function ChipPicker({ mode, value, onChange, away, home, disabled, label }) {
  const spread = mode === 'guess_spread';
  const has = value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const v = has ? Number(value) : null;
  const [favorite, setFavorite] = useState(() => (v === null ? null : v === 0 ? 'pickem' : v < 0 ? 'home' : 'away'));
  const [more, setMore] = useState(() => v !== null && Math.abs(v) > 10);
  const fav = spread ? (v === null ? favorite : v === 0 ? 'pickem' : v < 0 ? 'home' : 'away') : null;
  const size = v === null ? null : Math.abs(v);
  const setSpread = (side, n) => onChange(side === 'pickem' ? 0 : (side === 'home' ? -1 : 1) * n);
  function pickFavorite(side) {
    setFavorite(side);
    if (side === 'pickem') return onChange(0);
    if (size) setSpread(side, size);
  }
  const center = v === null ? 44 : Math.round(v);
  const totalChips = Array.from({ length: 11 }, (_, i) => Math.max(0, center - 5 + i));
  const step = delta => {
    if (spread) { const next = Math.min(20, Math.max(0.5, (size || 0) + delta)); if (fav && fav !== 'pickem') setSpread(fav, next); return; }
    onChange(Math.min(200, Math.max(0, (v ?? 44) + delta)));
  };
  const summary = !has ? 'No pick yet' : spread ? (v === 0 ? "Pick'em" : `${v < 0 ? home : away} −${show(Math.abs(v))}`) : `${show(v)} total points`;
  return <div className="chip-picker" role="group" aria-label={label}>
    {spread && <div className="chip-row chip-teams">{[['away', away], ['pickem', "Pick'em"], ['home', home]].map(([side, text]) =>
      <button type="button" key={side} className={`chip team-chip ${fav === side ? 'selected' : ''}`} aria-pressed={fav === side} disabled={disabled} onClick={() => pickFavorite(side)}>{text}</button>)}</div>}
    {(!spread || (fav && fav !== 'pickem')) && <>
      <div className="chip-row chip-numbers">{(spread ? (more ? SPREAD_MORE : SPREAD_CHIPS) : totalChips).map(n => {
        const selected = spread ? size === n : v === n;
        return <button type="button" key={n} className={`chip number-chip ${selected ? 'selected' : ''}`} aria-pressed={selected} disabled={disabled}
          onClick={() => (spread ? setSpread(fav, n) : onChange(n))}>{spread ? `−${show(n)}` : show(n)}</button>;
      })}
        {spread && <button type="button" className="chip more-chip" disabled={disabled} aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? '1–10' : 'More'}</button>}
      </div>
      <div className="chip-row chip-fine">
        <button type="button" className="chip icon-chip" aria-label="Lower by half a point" disabled={disabled || (spread ? !size : v === null)} onClick={() => step(-0.5)}><Minus size={16}/></button>
        <output className="chip-summary mono" aria-live="polite">{summary}</output>
        <button type="button" className="chip icon-chip" aria-label="Raise by half a point" disabled={disabled || (spread && !size)} onClick={() => step(0.5)}><Plus size={16}/></button>
      </div>
    </>}
    {spread && fav === 'pickem' && <p className="chip-summary mono">Pick'em</p>}
  </div>;
}
