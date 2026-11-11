// D-82 Play › Your guesses › Player Props (approved sheets 01 entry, 02 locked pick, 05 draft recovery and 06's "no
// verified props" state; design/player-props-review-2026-11-09). Built only from the shared Prism kit (Card, Button,
// Chip, Icon, TeamMark, Skeleton) and tokens: no second design system.
//
// Market numbers are hidden ONLY here, on the guess-entry screen, before lock-in: the board sends no line for an
// unlocked selection and this screen draws none. After lock-in the saved reference and the latest recorded line show
// separately (sheet 02). Drafts are the signed-in owner's only; the server keeps them through a failed lock (sheet 05).
// Loaded lazily, and only when the app flag is on (./flag.js), so a dark build carries none of this.
//
// The saved receipt is the approved Spread/Total receipt pattern (./PropReceipt.jsx). Other players' locked guesses
// open only under the reveal rules (./PropReveal.jsx): your own lock-in of that exact selection, or its kickoff.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { propsApi } from '../../api.js';
import { Button, Card, Chip, Icon, InfoButton, Skeleton, TeamMark, cx, teamName } from '../ui/index.js';
import { PROP_POSITIONS, PROP_STAT_KEYS, propGuessProblem, propStat, stepPropGuess } from '../../../../shared/player-props.mjs';
import { PropReceipt, propNumber } from './PropReceipt.jsx';
import { PropReveal, PropRevealFailure, sharedKey, usePropsShared } from './PropReveal.jsx';
import './props.css';

const selectionKey = s => (s ? `${s.eventId}/${s.playerId}/${s.stat}` : '');
const TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const when = value => (value && Number.isFinite(Date.parse(value)) ? `${TIME.format(Date.parse(value))} PT` : 'time not recorded');
const shown = propNumber;
/** The line under Your guesses for each state (approved sheets 01, 02 and 05). */
export const PROPS_STATUS = Object.freeze({ entry: 'Optional · choose as many props as you want', locked: 'Player Props · your saved pick', recovery: 'Your draft is safe · not locked in' });

/** Offers grouped by athlete (stable player ID), in board order; each lists its offered stats in catalog order. */
export function athletesOf(offers) {
  const byPlayer = new Map();
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!propStat(offer.stat)) continue;
    const entry = byPlayer.get(offer.playerId) ?? { playerId: offer.playerId, playerName: offer.playerName, team: offer.team, position: offer.position,
      eventId: offer.eventId, away: offer.away, home: offer.home, kickoff: offer.kickoff, closed: offer.closed === true, stats: [] };
    entry.stats.push(offer.stat);
    byPlayer.set(offer.playerId, entry);
  }
  // The board arrives in storage order; each athlete's stats are shown in the catalog's order (yards, then counts, then TDs).
  for (const entry of byPlayer.values()) entry.stats.sort((a, b) => PROP_STAT_KEYS.indexOf(a) - PROP_STAT_KEYS.indexOf(b));
  return [...byPlayer.values()];
}
/** Position and name filters help discovery; a position never removes a valid cross-position stat. */
export function filterAthletes(athletes, { position = 'all', query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return athletes.filter(a => (position === 'all' || a.position === position) && (!needle || a.playerName.toLowerCase().includes(needle)));
}

function AthleteRow({ athlete }) {
  return <div className="gx-props-athlete">
    <span className="gx-props-avatar" aria-hidden="true"><Icon icon="circleUser" size={24}/></span>
    <span className="gx-props-athlete-name">
      <strong className="gx-t-strong">{athlete.playerName}</strong>
      <span className="gx-t-meta gx-c-2">{[athlete.team ? teamName(athlete.team) : null, athlete.position, athlete.away && athlete.home ? `${athlete.away} at ${athlete.home}` : null].filter(Boolean).join(' · ')}</span>
    </span>
    {athlete.team ? <TeamMark code={athlete.team} size={48} decorative/> : null}
  </div>;
}

/** Sheet 06 (first card): no verified selection, or the mode is not enabled on this server. Never a false zero. */
export function PropsUnavailable({ onRetry, busy = false }) {
  return <Card as="section" className="gx-props-card gx-props-state" aria-label="No verified props available yet">
    <span className="gx-props-state-icon" aria-hidden="true"><Icon icon="eye" size={20}/></span>
    <div className="gx-vstack gx-gap-4"><h3 className="gx-t-strong">No verified props available yet</h3>
      <p className="gx-t-body gx-c-2">Only eligible athlete and stat pairs appear. Other Guess modes remain available.</p></div>
    {onRetry ? <Button icon="refresh" block disabled={busy} onClick={onRetry}>Check available props</Button> : null}
  </Card>;
}

/** Sheet 01: the hidden-market guess card with half-point plus/minus and a direct numeric editor. */
export function PropGuessCard({ stat, value, editing, problem, disabled, onStep, onEdit, onType, onDone }) {
  const s = propStat(stat), inputId = useId(), problemId = useId();
  if (!s) return null;
  return <Card as="section" className="gx-props-card gx-props-guess" aria-label="Guess the sportsbook line">
    <div className="gx-between gx-hstack gx-gap-8"><h3 className="gx-t-strong">Guess the sportsbook line</h3>
      <InfoButton title="About prop guesses" body={[`Guess the sportsbook line for ${s.label.toLowerCase()}, in ${s.unit}. The market number stays hidden on this screen until you lock in.`, 'Each prop locks on its own and is final. Your accuracy is the miss from the line saved at lock-in.']}/></div>
    <p className="gx-t-meta gx-c-2 gx-props-hidden"><Icon icon="lock" size={16}/>Market hidden on this screen</p>
    <div className="gx-props-stepper">
      <button type="button" className="gx-props-step" aria-label={`Lower ${s.label.toLowerCase()} guess by 0.5`} disabled={disabled} onClick={() => onStep(-1)}><Icon icon="minus" size={20}/></button>
      <output className="gx-props-value" aria-live="polite" htmlFor={inputId}>{shown(value)}</output>
      <button type="button" className="gx-props-step" aria-label={`Raise ${s.label.toLowerCase()} guess by 0.5`} disabled={disabled} onClick={() => onStep(1)}><Icon icon="plus" size={20}/></button>
    </div>
    <p className="gx-t-body gx-c-2 gx-props-center">Your guess · {s.unit}</p>
    {editing ? <div className="gx-props-field">
      <label htmlFor={inputId}>Your {s.label.toLowerCase()} guess</label>
      <input id={inputId} autoFocus type="number" inputMode="decimal" step="0.5" min={s.guessMin} max={s.guessMax} defaultValue={Number.isFinite(value) ? value : ''}
        aria-invalid={problem ? true : undefined} aria-describedby={problem ? problemId : undefined} disabled={disabled}
        onChange={event => onType(event.target.value)} onBlur={() => { if (!problem) onDone?.(); }}
        onKeyDown={event => { if (event.key === 'Enter' && !problem) { event.preventDefault(); onDone?.(); } }}/>
      {problem ? <p id={problemId} role="alert" className="gx-t-meta gx-c-loss">{problem}</p> : null}
    </div> : <Button variant="ghost" icon="pencil" disabled={disabled} onClick={onEdit}>Edit number</Button>}
    <p className="gx-t-meta gx-c-2 gx-props-center">Buttons change the guess by 0.5</p>
  </Card>;
}

/** Sheet 02: the final guess, saved-reference receipt access and the latest market kept separate. */
export function LockedProp({ athlete, guess, onAnother, shared = null, sharedFailed = false, onSharedRetry }) {
  const s = propStat(guess.stat);
  const [receipt, setReceipt] = useState(false), [latest, setLatest] = useState(false);
  return <div className="gx-vstack gx-gap-16">
    <Card as="section" variant="tint" className="gx-props-card" aria-label={`Locked in · ${athlete.playerName} ${s.label}`}>
      <div className="gx-between gx-hstack"><span className="gx-c-accent gx-props-pill"><Icon icon="shieldCheck" size={16}/>Locked in</span><Icon icon="check" size={20}/></div>
      <AthleteRow athlete={athlete}/>
      <p className="gx-t-body gx-c-2">{s.label} · your final guess</p>
      <p className="gx-props-final"><span className="gx-n-xl gx-c-accent">{shown(guess.guess)}</span> <span className="gx-t-strong">{s.short}</span></p>
      <p className="gx-t-strong">This guess and its scoring reference stay fixed.</p>
    </Card>
    <Card as="section" className="gx-props-card" aria-label="Your saved reference">
      <div className="gx-hstack gx-gap-12"><Icon icon="receipt" size={20} className="gx-c-accent"/><div className="gx-vstack"><h3 className="gx-t-strong">Your saved reference</h3><span className="gx-t-meta gx-c-2">Consensus, books and source times</span></div></div>
      <p className="gx-t-body gx-c-2">Your accuracy uses the market saved at lock-in.</p>
      <Button icon="receipt" iconEnd={receipt ? 'chevronDown' : 'chevronRight'} block aria-expanded={receipt} onClick={() => setReceipt(v => !v)}>{receipt ? 'Hide saved receipt' : 'Open saved receipt'}</Button>
      {receipt ? <PropReceipt athlete={athlete} guess={guess}/> : null}
    </Card>
    <Card as="section" className="gx-props-card" aria-label="Latest market">
      <div className="gx-hstack gx-gap-12"><Icon icon="trendingUp" size={20} className="gx-c-accent"/><div className="gx-vstack"><h3 className="gx-t-strong">Latest market</h3><span className="gx-t-meta gx-c-2">Separate from your saved reference</span></div></div>
      <p className="gx-t-body gx-c-2">Later line moves can change the current gap. They do not change your accuracy.</p>
      <Button variant="ghost" iconEnd="chevronRight" aria-expanded={latest} onClick={() => setLatest(v => !v)}>View latest recorded line</Button>
      {latest ? <p className="gx-t-body" role="status">{guess.latest ? `${shown(guess.latest.line)} ${s.unit} · recorded ${when(guess.latest.observedAt)}` : 'No later line is recorded.'}</p> : null}
    </Card>
    {shared ? <PropReveal selection={shared} own={guess.guess}/> : sharedFailed ? <PropRevealFailure onRetry={onSharedRetry}/> : null}
    {onAnother ? <Button variant="primary" icon="plus" block onClick={onAnother}>Choose another prop</Button> : null}
  </div>;
}

/** Sheet 05: a failed lock-in keeps the editable draft and offers a retry before kickoff. */
export function DraftRecovery({ athlete, stat, value, busy, onRetry, onEdit, onBack }) {
  const s = propStat(stat);
  return <div className="gx-vstack gx-gap-16">
    <Card as="section" className="gx-props-card" aria-label={`Saved draft · ${athlete.playerName} ${s.label}`}>
      <AthleteRow athlete={athlete}/>
      <p className="gx-t-body gx-c-2">{s.label} · saved draft</p>
      <p className="gx-props-final"><span className="gx-n-xl gx-c-accent">{shown(value)}</span> <span className="gx-t-strong">{s.short}</span></p>
      <span className="gx-c-accent gx-props-pill"><Icon icon="pencil" size={16}/>Editable draft</span>
    </Card>
    <Card as="section" className="gx-props-card" role="alert">
      <div className="gx-hstack gx-gap-12"><Icon icon="alert" size={20} className="gx-c-pending"/><h3 className="gx-t-strong">We couldn’t verify the market reference</h3></div>
      <p className="gx-t-body">Your guess was not locked in. We kept your draft so you can try again before kickoff.</p>
      <Button variant="primary" icon="refresh" block disabled={busy} onClick={onRetry}>Try lock-in again</Button>
      <Button icon="pencil" block disabled={busy} onClick={onEdit}>Keep editing draft</Button>
    </Card>
    <Card as="section" className="gx-props-card">
      <div className="gx-hstack gx-gap-12"><Icon icon="shieldCheck" size={20} className="gx-c-accent"/><div className="gx-vstack"><h3 className="gx-t-strong">A failed save changes nothing</h3><span className="gx-t-body gx-c-2">No score, no reveal and no lost guess.</span></div></div>
    </Card>
    <Button variant="ghost" icon="chevronLeft" onClick={onBack}>Back to Player Props</Button>
  </div>;
}

/**
 * The entry screen, drawn from what it is given (static-render tested). `read` is `{ status, data, error }` for
 * /props/read; `state` is the screen's local state; `on` the handlers.
 */
export function PropsEntryScreen({ read, state, on, shared = { status: 'idle', selections: new Map() } }) {
  if (read.status === 'loading') return <Skeleton label="Loading Player Props…" shape="panels" count={2}/>;
  if (read.status === 'error') return <Card as="section" className="gx-props-card" role="alert"><h3 className="gx-t-strong">Player Props couldn’t load</h3>
    <p className="gx-t-body gx-c-2">Your saved guesses are safe.</p><Button icon="refresh" block onClick={on.retry}>Try again</Button></Card>;
  const data = read.data;
  if (!data?.available) return <PropsUnavailable onRetry={on.retry}/>;
  const athletes = athletesOf(data.offers);
  const own = new Map((data.own ?? []).map(g => [selectionKey(g), g]));
  // An athlete's first stat you have not locked in yet (all locked: the first), so choosing them again opens a new prop.
  const firstOpen = athlete => athlete.stats.find(stat => own.get(selectionKey({ ...athlete, stat }))?.status !== 'locked') ?? athlete.stats[0];
  const athlete = athletes.find(a => a.playerId === state.pick?.playerId) ?? null;
  const saved = state.pick ? own.get(selectionKey(state.pick)) : null;
  const opened = state.pick ? shared.selections.get(sharedKey(state.pick)) ?? null : null;
  if (athlete && saved?.status === 'locked') return <LockedProp athlete={athlete} guess={saved} onAnother={on.another} shared={opened} sharedFailed={shared.status === 'error'} onSharedRetry={on.sharedRetry}/>;
  if (athlete && state.phase === 'recovery') return <DraftRecovery athlete={athlete} stat={state.pick.stat} value={state.value} busy={state.busy} onRetry={on.lock} onEdit={on.keepEditing} onBack={on.another}/>;
  if (!athletes.length) return <PropsUnavailable onRetry={on.retry}/>;
  const list = filterAthletes(athletes, state.filter);
  const s = propStat(state.pick?.stat);
  const problem = s && state.typed !== null ? propGuessProblem(s.key, state.typed) : null;
  return <div className="gx-vstack gx-gap-16 gx-props-entry">
    <div className="gx-props-positions" role="group" aria-label="Position">
      {['all', ...PROP_POSITIONS].map(p => <Chip key={p} text selected={state.filter.position === p} onClick={() => on.filter({ ...state.filter, position: p })}>{p === 'all' ? 'All' : p}</Chip>)}
    </div>
    <div className="gx-props-field gx-props-search"><label className="gx-sr-only" htmlFor="gx-props-search">Find an athlete with verified lines</label>
      <Icon icon="circleUser" size={20} className="gx-props-search-icon"/>
      <input id="gx-props-search" type="search" autoComplete="off" placeholder="Find an athlete" value={state.filter.query} onChange={event => on.filter({ ...state.filter, query: event.target.value })}/></div>
    {athlete ? <Card as="section" className="gx-props-card" aria-label={`${athlete.playerName} stats`}>
      <AthleteRow athlete={athlete}/>
      <div className="gx-props-stats" role="group" aria-label="Stat">
        {athlete.stats.map(stat => {
          const mine = own.get(selectionKey({ ...athlete, stat }));
          return <Chip key={stat} text selected={state.pick.stat === stat} onClick={() => on.pick({ eventId: athlete.eventId, playerId: athlete.playerId, stat })}>
            {propStat(stat).label}{mine?.status === 'locked' ? ' · locked' : mine ? ' · draft' : ''}</Chip>;
        })}
      </div>
    </Card> : <ul className="gx-props-list" aria-label="Athletes with verified lines">
      {list.map(a => <li key={a.playerId}><button type="button" className="gx-card gx-card-btn gx-props-pick" onClick={() => on.pick({ eventId: a.eventId, playerId: a.playerId, stat: firstOpen(a) })}><AthleteRow athlete={a}/></button></li>)}
      {!list.length ? <li className="gx-t-body gx-c-2">No athlete matches this filter.</li> : null}
    </ul>}
    {athlete && s ? <>
      <PropGuessCard stat={s.key} value={state.value} editing={state.editing} problem={problem} disabled={state.busy || athlete.closed}
        onStep={direction => on.value(stepPropGuess(s.key, state.value, direction))} onEdit={on.edit} onType={on.type} onDone={on.doneEditing}/>
      {state.notice ? <p className="gx-t-body" role="status">{state.notice}</p> : null}
      <Button variant="primary" icon="lock" block disabled={state.busy || athlete.closed || !Number.isFinite(state.value) || Boolean(problem)} onClick={on.lock}>Lock in {s.label.toLowerCase()}</Button>
      <p className="gx-t-meta gx-c-2 gx-props-center">{athlete.closed ? 'Closed at kickoff · your saved draft is kept' : 'Final once locked in · other props stay optional'}</p>
      {athlete.closed && opened ? <PropReveal selection={opened}/> : null}
    </> : null}
  </div>;
}

/** The stateful screen: reads the owner's board for one week and sends draft saves and lock-ins. */
export default function PlayerPropsEntry({ season, week, onSignInAgain, onStatus }) {
  const [read, setRead] = useState({ status: 'loading', data: null }), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ filter: { position: 'all', query: '' }, pick: null, value: null, typed: null, editing: false, phase: 'entry', busy: false, notice: '' });
  const auth = useRef(onSignInAgain); auth.current = onSignInAgain;
  useEffect(() => {
    if (!Number.isInteger(season) || !Number.isInteger(week)) { setRead({ status: 'ready', data: { available: false } }); return undefined; }
    const controller = new AbortController();
    setRead(current => ({ ...current, status: current.data ? current.status : 'loading' }));
    propsApi('read', { season, week }, controller.signal).then(data => { if (!controller.signal.aborted) setRead({ status: 'ready', data }); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error?.status === 401) auth.current?.();
        // A dark or unapplied server answers 404 (GTL_PROPS_OFF or "Not found."): no verified props, never an error.
        setRead(error?.status === 404 ? { status: 'ready', data: { available: false } } : { status: 'error', data: null });
      });
    return () => controller.abort();
  }, [season, week, attempt]);
  const own = useMemo(() => new Map((read.data?.own ?? []).map(g => [selectionKey(g), g])), [read.data]);
  // Other players' guesses are read only once something can be open to you: one of your locks, or a kicked-off offer.
  const locks = (read.data?.own ?? []).filter(g => g.status === 'locked').map(selectionKey).sort().join(',');
  const anyClosed = (read.data?.offers ?? []).some(o => o.closed);
  const shared = usePropsShared({ season, week, enabled: read.data?.available === true && (Boolean(locks) || anyClosed), version: locks, onSignInAgain });
  const status = useRef(onStatus); status.current = onStatus;
  const pickedLock = state.pick ? own.get(selectionKey(state.pick))?.status === 'locked' : false;
  const phrase = pickedLock ? PROPS_STATUS.locked : state.phase === 'recovery' && state.pick ? PROPS_STATUS.recovery : PROPS_STATUS.entry;
  useEffect(() => { status.current?.(phrase); }, [phrase]);
  const patch = next => setState(current => ({ ...current, ...next }));
  function pick(selection) {
    const mine = own.get(selectionKey(selection));
    patch({ pick: selection, value: mine ? mine.guess : null, typed: null, editing: false, phase: 'entry', notice: '' });
  }
  async function lock() {
    const s = propStat(state.pick?.stat);
    if (!s || state.busy || !Number.isFinite(state.value) || propGuessProblem(s.key, state.value)) return;
    patch({ busy: true, notice: '' });
    try {
      const saved = await propsApi('lock', { ...state.pick, guess: state.value, requestId: crypto.randomUUID() });
      setRead(current => ({ ...current, data: { ...current.data, own: [...(current.data?.own ?? []).filter(g => selectionKey(g) !== selectionKey(saved)), saved] } }));
      patch({ busy: false, phase: 'entry' });
    } catch (error) {
      if (error?.status === 401) auth.current?.();
      if (error?.code === 'GTL_PROPS_REFERENCE_UNAVAILABLE') { patch({ busy: false, phase: 'recovery' }); return; }
      if (error?.code === 'GTL_PROPS_LOCKED') { patch({ busy: false }); setAttempt(n => n + 1); return; }
      patch({ busy: false, notice: error?.message || 'Your guess was not locked in. Your draft is kept; try again.' });
    }
  }
  const on = {
    retry: () => setAttempt(n => n + 1),
    // Changing the position or search goes back to the athlete list (sheet 01 keeps the filters above the chosen athlete).
    filter: filter => patch({ filter, pick: null, value: null, typed: null, editing: false, phase: 'entry', notice: '' }),
    pick,
    another: () => patch({ pick: null, value: null, typed: null, editing: false, phase: 'entry', notice: '' }),
    value: value => patch({ value, typed: null }),
    edit: () => patch({ editing: true }),
    // The direct editor closes once a valid number is entered (Enter or leaving the field); the value stays.
    doneEditing: () => patch({ editing: false }),
    type: raw => {
      const value = raw.trim() === '' ? NaN : Number(raw);
      patch(propGuessProblem(state.pick?.stat, value) ? { typed: value } : { value, typed: null });
    },
    lock,
    keepEditing: () => patch({ phase: 'entry', editing: true }),
    sharedRetry: shared.retry,
  };
  return <div className={cx('gx-props')}><PropsEntryScreen read={read} state={state} on={on} shared={shared}/></div>;
}
