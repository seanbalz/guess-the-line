import React, { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import './chipPicker.css';

const halves = (from, to) => Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => from + i / 2);
const SPREAD_CHIPS = halves(1, 10), SPREAD_MORE = halves(10.5, 20);
const show = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const SIDES = ['away', 'pickem', 'home'];
const TYPE_AHEAD_MS = 700;
const isHalf = n => Number.isFinite(n) && Number.isInteger(n * 2);
const nearest = (list, n) => list.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
// Spread magnitudes run 0.5–20 (the chips show 1–20; the −/+ buttons reach 0.5); totals run 0–200.
const clampSpread = n => Math.min(20, Math.max(0.5, n)), clampTotal = n => Math.min(200, Math.max(0, n));
const HELP = {
  spread: 'Arrow keys change the number by half a point; Home and End jump to the ends of the row. Type a number, 3 or 12.5, to choose it, or press = to type one.',
  total: 'Arrow keys move by a point, − and + by half a point; Home and End jump to the ends of the row. Type one digit for the nearest total ending in it (from 44, 7 gives 47), two digits for an exact total, or press = to type one.',
  teams: 'Arrow keys move between the teams; Enter or Space chooses.',
};

/**
 * D-21 button entry. Spread values are home-referenced: home favored by 3 is -3.
 * Totals use whole-number chips around a center plus ±0.5 fine tuning.
 * `ref` exposes focus() (the row's Tab stop) and scrollIntoView() for "Next game" navigation;
 * `compact` tightens the chips for table rows.
 * Persona audit quick wins: the number row is labelled "<Favorite> win by" / "Combined points"
 * (visible and as the group's aria-label, with each chip described by it), a selected chip
 * carries a check icon as well as its fill, and a plain-language "Your call" line sits beside
 * the signed mono token.
 *
 * Keyboard model (persona audit #9 and #23). Each chip row is one Tab stop:
 * - Team row: toggle buttons with a roving tabindex. Left/Right/Up/Down move focus, Home/End jump to the ends,
 *   Enter or Space chooses; the toggle semantics are unchanged.
 * - Number row: a radiogroup. Left/Right/Up/Down select the adjacent value and move focus with the check. Spread
 *   rows step half a point with the same 0.5 floor and 20 ceiling as the − / + buttons and cross onto the More page
 *   at 10.5; total rows step to the next whole chip (0–200), and − / + step half a point. Home/End select the first
 *   or last chip of the page shown. Enter or Space checks the focused chip.
 * - Type-ahead: digits and "." typed within 700 ms form one number. Spread: the magnitude 1–20 in half points
 *   ("3" is −3 for the favorite, "12" flips to More, "3.5" after "3"). Total: a single digit picks the total ending in
 *   that digit nearest the current pick (or the row's centre, 44, with no pick; a tie goes to the higher total), two
 *   or three digits set that exact total (0–200), and "44.5" sets a half point. Text that can never become valid
 *   restarts with the last key.
 * - "=" opens a typed field for the same half-point values. Enter commits the same signed value the chips produce
 *   (the sign comes from the favorite row), Escape cancels, and focus returns to the row's checked chip.
 * More, − and + stay 44px pointer targets but are not Tab stops (their functions live on the row's keys), so a
 * 14-game spread ballot costs six presses a game instead of 27. The help text that documents the keys is visually
 * hidden and shown while a chip in the row has keyboard focus.
 */
export default function ChipPicker({ mode, value, onChange, away, home, disabled, label, compact, ref }) {
  const spread = mode === 'guess_spread';
  const has = value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const v = has ? Number(value) : null;
  const [favorite, setFavorite] = useState(() => (v === null ? null : v === 0 ? 'pickem' : v < 0 ? 'home' : 'away'));
  const [more, setMore] = useState(() => v !== null && Math.abs(v) > 10);
  const [teamCursor, setTeamCursor] = useState(null);
  const [typing, setTyping] = useState(false), [typed, setTyped] = useState(''), [typedError, setTypedError] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const fav = spread ? (v === null ? favorite : v === 0 ? 'pickem' : v < 0 ? 'home' : 'away') : null;
  const size = v === null ? null : Math.abs(v);
  const root = useRef(null), typedField = useRef(null), typeAhead = useRef({ text: '', timer: 0 }), typedClosed = useRef(false);
  const rowLabelId = useId(), helpId = useId(), teamHelpId = useId(), typedHintId = useId();
  useImperativeHandle(ref, () => ({
    focus: () => (root.current?.querySelector('[tabindex="0"]:not(:disabled)') || root.current?.querySelector('button:not(:disabled)'))?.focus(),
    scrollIntoView: options => root.current?.scrollIntoView(options),
  }), []);
  // A value restored from a saved ballot or a tab draft may sit on the More page.
  useEffect(() => { if (spread && size > 10) setMore(true); }, [spread, size]);
  // Keyboard selection re-renders the row (a page flip, a re-centred total); focus follows the row's Tab stop afterwards.
  useEffect(() => { if (focusTick) root.current?.querySelector('.chip-numbers [tabindex="0"]')?.focus(); }, [focusTick]);
  useEffect(() => { if (typing) typedField.current?.focus(); }, [typing]);
  useEffect(() => () => clearTimeout(typeAhead.current.timer), []);
  const setSpread = (side, n) => onChange(side === 'pickem' ? 0 : (side === 'home' ? -1 : 1) * n);
  function pickFavorite(side) {
    setFavorite(side); setTeamCursor(side);
    if (side === 'pickem') return onChange(0);
    if (size) return setSpread(side, size);
    if (v === 0) onChange(''); // Leaving Pick'em: the pick is incomplete until a number is chosen.
  }
  const center = v === null ? 44 : Math.round(v), low = Math.max(0, Math.min(190, center - 5));
  const totalChips = Array.from({ length: 11 }, (_, i) => low + i); // Shifts rather than clamps at the 0–200 edges, so chips stay distinct.
  const chips = spread ? (more ? SPREAD_MORE : SPREAD_CHIPS) : totalChips;
  const current = spread ? size : v;
  // The row's one Tab stop: the checked chip, else the chip nearest the value (a −0.5 or 44.5 has no chip; the lower on a tie), else the first.
  const tabbable = current === null ? chips[0] : nearest(chips, current);
  const step = delta => {
    if (spread) { const next = clampSpread((size || 0) + delta); if (fav && fav !== 'pickem') setSpread(fav, next); return; }
    onChange(clampTotal((v ?? 44) + delta));
  };
  /** Keyboard selection: the same values the chips and the − / + buttons produce, then focus on the row's Tab stop. */
  function select(n) {
    if (spread) { setMore(n > 10); setSpread(fav, n); } else onChange(n);
    setFocusTick(t => t + 1);
  }
  function onTeamKey(event) {
    const i = SIDES.indexOf(event.target.dataset.side); if (i < 0 || disabled) return;
    const to = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: SIDES.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const side = SIDES[Math.max(0, Math.min(SIDES.length - 1, to))];
    setTeamCursor(side);
    event.currentTarget.querySelector(`[data-side="${side}"]`)?.focus();
  }
  function onNumberKey(event) {
    if (disabled || !event.target.classList.contains('number-chip')) return;
    const { key } = event;
    if (key === '=') { event.preventDefault(); setTyped(''); setTypedError(false); typedClosed.current = false; setTyping(true); return; }
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); typeAheadKey(key); return; }
    const from = current ?? Number(event.target.dataset.value); // Nothing chosen yet: the focused chip is the reference.
    const next = key === 'ArrowRight' || key === 'ArrowDown' ? (spread ? from + 0.5 : Math.floor(from) + 1)
      : key === 'ArrowLeft' || key === 'ArrowUp' ? (spread ? from - 0.5 : Math.ceil(from) - 1)
      : key === 'Home' ? chips[0] : key === 'End' ? chips[chips.length - 1]
      : key === '-' ? from - 0.5 : key === '+' ? from + 0.5 : null;
    if (next === null) return;
    event.preventDefault();
    select(spread ? clampSpread(next) : clampTotal(next));
  }
  /** The value a type-ahead buffer stands for: a number to select, 'partial' while it ends in ".", or null when it can never be valid. */
  function typedValue(text) {
    if (!/^\d{1,3}(\.\d?)?$/.test(text)) return null;
    if (text.endsWith('.')) return 'partial';
    const n = Number(text);
    if (spread) return n >= 1 && n <= 20 && isHalf(n) ? n : null;
    if (!(n >= 0 && n <= 200 && isHalf(n))) return null;
    if (text.length > 1) return n;
    // One digit: the total ending in it nearest the current pick (or the centre, 44); a tie goes to the higher total.
    const ref = v ?? center, base = Math.floor(ref / 10) * 10 + n;
    return [base - 10, base, base + 10].filter(c => c >= 0 && c <= 200).reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) || (Math.abs(b - ref) === Math.abs(a - ref) && b > a) ? b : a));
  }
  function typeAheadKey(key) {
    const buffer = typeAhead.current; clearTimeout(buffer.timer);
    const attempt = text => { const n = typedValue(text); if (n === null) return false; buffer.text = text; if (n !== 'partial') select(n); return true; };
    if (!attempt(buffer.text + key) && !attempt(key)) buffer.text = '';
    buffer.timer = setTimeout(() => { buffer.text = ''; }, TYPE_AHEAD_MS);
  }
  /** The typed field accepts what the chips and − / + produce: half points, 0.5–20 for a spread (sign from the favorite) or 0–200 for a total. */
  const parseTyped = text => { const n = Math.abs(Number(text.replace('−', '-').trim())); return text.trim() && isHalf(n) && (spread ? n >= 0.5 && n <= 20 : n <= 200) ? n : null; };
  // Closing the field unmounts it, which can fire its blur; the guard keeps that blur from committing a second time.
  function commitTyped(returnFocus) {
    const n = parseTyped(typed);
    if (n === null) { setTypedError(true); return; }
    typedClosed.current = true; setTyping(false);
    if (spread) { setMore(n > 10); setSpread(fav, n); } else onChange(n);
    if (returnFocus) setFocusTick(t => t + 1);
  }
  function cancelTyped(returnFocus) { typedClosed.current = true; setTyping(false); if (returnFocus) setFocusTick(t => t + 1); }
  function onTypedKey(event) {
    if (event.key === 'Enter') { event.preventDefault(); commitTyped(true); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelTyped(true); }
  }
  const favoriteName = fav === 'home' ? home : away;
  const summary = !has ? 'No pick yet' : spread ? (v === 0 ? "Pick'em" : `${v < 0 ? home : away} −${show(Math.abs(v))}`) : `${show(v)} total points`;
  // The sign is sportsbook notation (the favorite gives points); the call line says the same thing in plain words.
  const call = !has ? '' : spread ? (v === 0 ? "Even (pick'em)" : `${v < 0 ? home : away} by ${show(Math.abs(v))}`) : `${show(v)} combined points`;
  const rowLabel = spread ? `${favoriteName} win by` : 'Combined points';
  const range = spread ? '0.5 to 20' : '0 to 200';
  const teamTab = teamCursor ?? fav ?? 'away';
  const check = <Check className="chip-check" size={14} aria-hidden="true"/>;
  return <div ref={root} className={`chip-picker${compact ? ' compact' : ''}`} role="group" aria-label={label}>
    {spread && <div className="chip-row chip-teams" role="group" aria-label="Favorite" onKeyDown={onTeamKey}>{[['away', away], ['pickem', "Pick'em"], ['home', home]].map(([side, text]) =>
      <button type="button" key={side} data-side={side} className={`chip team-chip ${fav === side ? 'selected' : ''}`} aria-pressed={fav === side} aria-describedby={teamHelpId} tabIndex={teamTab === side ? 0 : -1} disabled={disabled} onClick={() => pickFavorite(side)}>{fav === side && check}{text}</button>)}
      <span id={teamHelpId} className="sr-only">{HELP.teams}</span>
    </div>}
    {(!spread || (fav && fav !== 'pickem')) && <>
      <div className="chip-row chip-numbers" role="radiogroup" aria-label={rowLabel} onKeyDown={onNumberKey}>
        <span className="chip-row-label" id={rowLabelId}>{spread ? `${rowLabel}…` : rowLabel}</span>
        <span className="sr-only chip-row-help" id={helpId}>{spread ? HELP.spread : HELP.total}</span>
        {typing && <span className="chip-typed-wrap">
          <input ref={typedField} className="chip-typed mono" type="text" inputMode="decimal" autoComplete="off" aria-label={`${rowLabel} (type a number)`} aria-describedby={typedHintId} aria-invalid={typedError || undefined}
            value={typed} onChange={event => { setTyped(event.target.value); setTypedError(false); }} onKeyDown={onTypedKey} onBlur={() => { if (typedClosed.current) return; if (parseTyped(typed) === null) cancelTyped(false); else commitTyped(false); }}/>
          <span id={typedHintId} className="chip-typed-hint" aria-live="polite">{typedError ? `Use half points from ${range}.` : `Half points from ${range}. Enter sets it, Escape cancels.`}</span>
        </span>}
        {chips.map(n => {
          const selected = spread ? size === n : v === n;
          return <button type="button" key={n} role="radio" data-value={n} className={`chip number-chip ${selected ? 'selected' : ''}`} aria-checked={selected} aria-describedby={`${rowLabelId} ${helpId}`} tabIndex={n === tabbable ? 0 : -1} disabled={disabled}
            onClick={() => (spread ? setSpread(fav, n) : onChange(n))}>{selected && check}{spread ? `−${show(n)}` : show(n)}</button>;
        })}
        {spread && <button type="button" className="chip more-chip" tabIndex={-1} disabled={disabled} aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? '1–10' : 'More'}</button>}
      </div>
      {has && <p className="chip-call">Your call: <strong>{call}</strong></p>}
      <div className="chip-row chip-fine">
        <button type="button" className="chip icon-chip" tabIndex={-1} aria-label="Lower by half a point" disabled={disabled || (spread ? !size : v === null)} onClick={() => step(-0.5)}><Minus size={16}/></button>
        <span className="chip-summary mono" aria-live="polite">{summary}</span>
        <button type="button" className="chip icon-chip" tabIndex={-1} aria-label="Raise by half a point" disabled={disabled || (spread && !size)} onClick={() => step(0.5)}><Plus size={16}/></button>
      </div>
    </>}
    {spread && fav === 'pickem' && <><p className="chip-call">Your call: <strong>{call}</strong></p><p className="chip-summary mono">Pick'em</p></>}
  </div>;
}
