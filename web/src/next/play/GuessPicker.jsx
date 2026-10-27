// The new app's guess control (design upgrade, item 4): the classic ChipPicker's values, keyboard model and accessible
// names, drawn with the kit's Chip and IconButton under gx- classes. It only produces values; the editor that owns it
// (PerGameEditor) keeps every save, draft and lock rule. `onChange` receives exactly what ChipPicker sends: a
// home-referenced signed spread (home favored by 3 is −3; Pick'em is 0) or a total, or '' while a spread has a
// favorite but no number. Data attributes `data-side` and `data-value` mark the chips for tests and the phone checks.
// The keyboard model is ChipPicker's (web/src/ChipPicker.jsx, persona audit #9 and #23): each row is one Tab stop;
// arrows, Home/End, type-ahead and "=" for a typed value. Both stay until the old app retires (build plan stage 81).
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Chip, IconButton, cx } from '../ui/index.js';

const halves = (from, to) => Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => from + i / 2);
const SPREAD_CHIPS = halves(1, 10), SPREAD_MORE = halves(10.5, 20);
const show = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const SIDES = ['away', 'pickem', 'home'];
const TYPE_AHEAD_MS = 700;
const isHalf = n => Number.isFinite(n) && Number.isInteger(n * 2);
const nearest = (list, n) => list.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
// Spread magnitudes run 0.5–20 (the chips show 1–20; the − and + buttons reach 0.5); totals run 0–200.
const clampSpread = n => Math.min(20, Math.max(0.5, n)), clampTotal = n => Math.min(200, Math.max(0, n));
const HELP = {
  spread: 'Arrow keys change the number by half a point; Home and End jump to the ends of the row. Type a number, 3 or 12.5, to choose it, or press = to type one.',
  total: 'Arrow keys move by a point, − and + by half a point; Home and End jump to the ends of the row. Type one digit for the nearest total ending in it (from 44, 7 gives 47), two digits for an exact total, or press = to type one.',
  teams: 'Arrow keys move between the teams; Enter or Space chooses.',
};
const KEYS = { spread: 'Type 3 or 12.5 · arrows step half a point · = to type one', total: 'Type 7 or 47 · arrows step a point, − and + half · = to type one' };

/** The same sentence per market as ChipPicker's CHIP_HELP, so a player reads one explanation in both apps. */
export const GUESS_HELP = Object.freeze({
  guess_spread: 'Tap the team you think wins (the favorite), then how many points they win by. Pick’em means an even game with no favorite. The chips use the sportsbook sign: −3 means the favorite wins by 3.',
  guess_total: 'Total = both teams’ points combined. Tap the number you expect, then fine-tune by half a point with − and +.',
});

/**
 * `<GuessPicker mode value onChange away home teamLabels disabled label/>`: `away`/`home` are the short team names used
 * in accessible names and the "Your call" line; `teamLabels` the codes shown on the team chips. `ref` exposes focus()
 * (the row's Tab stop) and scrollIntoView().
 */
export function GuessPicker({ mode, value, onChange, away, home, disabled, label, teamLabels, ref }) {
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
  useEffect(() => { if (focusTick) root.current?.querySelector('.gx-guess-nums [tabindex="0"]')?.focus(); }, [focusTick]);
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
  const totalChips = Array.from({ length: 11 }, (_, i) => low + i); // Shifts rather than clamps at the 0–200 edges.
  const chips = spread ? (more ? SPREAD_MORE : SPREAD_CHIPS) : totalChips;
  const current = spread ? size : v;
  // The row's one Tab stop: the checked chip, else the chip nearest the value (the lower on a tie), else the first.
  const tabbable = current === null ? chips[0] : nearest(chips, current);
  const step = delta => {
    if (spread) { const next = clampSpread((size || 0) + delta); if (fav && fav !== 'pickem') setSpread(fav, next); return; }
    onChange(clampTotal((v ?? 44) + delta));
  };
  /** Keyboard selection: the same values the chips and the − and + buttons produce, then focus on the row's Tab stop. */
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
    if (disabled || event.target.dataset.value === undefined) return;
    const { key } = event;
    if (key === '=') { event.preventDefault(); setTyped(''); setTypedError(false); typedClosed.current = false; setTyping(true); return; }
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); typeAheadKey(key); return; }
    if ((key === '-' || key === '+') && current === null) return; // Nothing chosen yet: − and + wait, like the disabled button.
    const from = current ?? Number(event.target.dataset.value); // Nothing chosen yet: the focused chip is the reference.
    const next = key === 'ArrowRight' || key === 'ArrowDown' ? (spread ? from + 0.5 : Math.floor(from) + 1)
      : key === 'ArrowLeft' || key === 'ArrowUp' ? (spread ? from - 0.5 : Math.ceil(from) - 1)
      : key === 'Home' ? chips[0] : key === 'End' ? chips[chips.length - 1]
      : key === '-' ? from - 0.5 : key === '+' ? from + 0.5 : null;
    if (next === null) return;
    event.preventDefault();
    select(spread ? clampSpread(next) : clampTotal(next));
  }
  /** What a type-ahead buffer stands for: a number to select, 'partial' while it ends in ".", or null when it can never be valid. */
  function typedValue(text) {
    if (!/^\d{1,3}(\.\d?)?$/.test(text)) return null;
    if (text.endsWith('.')) return 'partial';
    const n = Number(text);
    if (spread) return n >= 1 && n <= 20 && isHalf(n) ? n : null;
    if (!(n >= 0 && n <= 200 && isHalf(n))) return null;
    if (text.length > 1) return n;
    // One digit: the total ending in it nearest the current pick (or the centre, 44); a tie goes to the higher total.
    const reference = v ?? center, base = Math.floor(reference / 10) * 10 + n;
    return [base - 10, base, base + 10].filter(c => c >= 0 && c <= 200).reduce((a, b) => (Math.abs(b - reference) < Math.abs(a - reference) || (Math.abs(b - reference) === Math.abs(a - reference) && b > a) ? b : a));
  }
  function typeAheadKey(key) {
    const buffer = typeAhead.current; clearTimeout(buffer.timer);
    const attempt = text => { const n = typedValue(text); if (n === null) return false; buffer.text = text; if (n !== 'partial') select(n); return true; };
    if (!attempt(buffer.text + key) && !attempt(key)) buffer.text = '';
    buffer.timer = setTimeout(() => { buffer.text = ''; }, TYPE_AHEAD_MS);
  }
  /** The typed field accepts what the chips and − and + produce: half points, 0.5–20 for a spread or 0–200 for a total. */
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
  return <div ref={root} className="gx-guess" role="group" aria-label={label}>
    {spread && <div className="gx-guess-teams" role="group" aria-label="Favorite" onKeyDown={onTeamKey}>
      {[['away', away], ['pickem', "Pick'em"], ['home', home]].map(([side, text]) =>
        <Chip key={side} data-side={side} selected={fav === side} text={side === 'pickem'} className={cx('gx-guess-team', side === 'pickem' && 'gx-guess-pickem')}
          label={teamLabels?.[side] ? `${text} (${teamLabels[side]})` : undefined} aria-describedby={teamHelpId} tabIndex={teamTab === side ? 0 : -1} disabled={disabled}
          onClick={() => pickFavorite(side)}>{teamLabels?.[side] || text}</Chip>)}
      <span id={teamHelpId} className="gx-sr-only">{HELP.teams}</span>
    </div>}
    {(!spread || (fav && fav !== 'pickem')) && <>
      <div className="gx-guess-nums" role="radiogroup" aria-label={rowLabel} onKeyDown={onNumberKey}>
        <div className="gx-guess-head">
          <span className="gx-guess-label" id={rowLabelId}>{spread ? `${rowLabel}…` : rowLabel}</span>
          <span className="gx-guess-keys" aria-hidden="true">{spread ? KEYS.spread : KEYS.total}</span>
        </div>
        <span className="gx-sr-only" id={helpId}>{spread ? HELP.spread : HELP.total}</span>
        {chips.map(n => {
          const selected = spread ? size === n : v === n;
          // A radio, not a toggle: aria-pressed is left off and aria-checked carries the state.
          return <Chip key={n} role="radio" data-value={n} selected={selected} className="gx-guess-num" aria-pressed={undefined} aria-checked={selected} aria-describedby={`${rowLabelId} ${helpId}`}
            tabIndex={n === tabbable ? 0 : -1} disabled={disabled} onClick={() => (spread ? setSpread(fav, n) : onChange(n))}>{spread ? `−${show(n)}` : show(n)}</Chip>;
        })}
        {spread && <Chip text className="gx-guess-more" tabIndex={-1} disabled={disabled} aria-pressed={undefined} aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? '1–10' : 'More'}</Chip>}
        {typing && <span className="gx-guess-typed">
          <input ref={typedField} className="gx-input gx-guess-input" type="text" inputMode="decimal" autoComplete="off" aria-label={`${rowLabel} (type a number)`} aria-describedby={typedHintId} aria-invalid={typedError || undefined}
            value={typed} onChange={event => { setTyped(event.target.value); setTypedError(false); }} onKeyDown={onTypedKey} onBlur={() => { if (typedClosed.current) return; if (parseTyped(typed) === null) cancelTyped(false); else commitTyped(false); }}/>
          <span id={typedHintId} className={cx('gx-t-meta', typedError ? 'gx-c-loss' : 'gx-c-2')} aria-live="polite">{typedError ? `Use half points from ${range}.` : `Half points from ${range}. Enter sets it, Escape cancels.`}</span>
        </span>}
      </div>
      {has && <p className="gx-guess-call">Your call: <strong>{call}</strong></p>}
      <div className="gx-guess-fine">
        <IconButton icon={Minus} size={20} className="gx-guess-step" tabIndex={-1} label="Lower by half a point" disabled={disabled || (spread ? !size : v === null)} onClick={() => step(-0.5)}/>
        <span className="gx-guess-summary" aria-live="polite">{summary}</span>
        <IconButton icon={Plus} size={20} className="gx-guess-step" tabIndex={-1} label="Raise by half a point" disabled={disabled || (spread && !size)} onClick={() => step(0.5)}/>
      </div>
    </>}
    {spread && fav === 'pickem' && <><p className="gx-guess-call">Your call: <strong>{call}</strong></p><p className="gx-guess-summary">Pick'em</p></>}
  </div>;
}
