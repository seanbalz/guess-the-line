// Play › Points (D-56 spec section 5; the D-56 addenda: ballot card option D "Glow card", and Sean's October 23 screen
// decisions 2A, 3B, 4A and 5B). Five full glow cards in kickoff order: a glass pill "POS · Player", a status word and the
// matchup and kickoff line; then "You N" once locked in, "Draft N" for a draft, or the You / Actual / Points tiles once
// scored. Before the gate opens, the faces of who locked in with no numbers; after it, a number line of everyone's guesses
// and the House. A tap opens a sheet with the big stepper (− / number / +, hold to move by 5), Save draft and the one lime
// "Lock in N" with a confirm dialog, as PerGamePlay.jsx does.
//
// Every slot card is a glow card (gx-card--hero, glass pills and tiles): Sean's D-56 addendum of October 23 lets any number
// of glow cards be on screen, replacing D-55's two-card limit. The open sheet repeats the slot as a glow card too.
// The server decides every gate (cloud/points.mjs): this screen only draws what /points/read returned. Until P-01 is
// applied the read answers 404 and the screen says "Points is coming soon".
import { useEffect, useRef, useState } from 'react';
import { pointsApi } from '../../../api.js';
import { useAppData } from '../../data/AppData.jsx';
import { useShell } from '../../shell/context.js';
import { LeagueFailure } from '../../league/useLeagueRead.jsx';
import { Avatar, AvatarStack, Button, Card, CardButton, Dialog, Icon, InfoButton, Sheet } from '../../ui/index.js';
import { INFO } from '../../info.js';
import { GUESS_MAX, GUESS_MIN, SLOT_NAMES, closestLine, comingSoon, editable, kickoffText, landingCard, lineWords, matchupText, numberLine, pts, resultTiles, slotStatus, step, summaryLine } from './pointsModel.js';
import './points.css';

/**
 * The week's read, shared by the ballot, the Play landing row and the League board: `{ loading, data, error, retry }`.
 * A refresh after a save keeps the last good reply on screen (an open sheet stays open); a new account or group starts
 * empty, so another scope's guesses never flash.
 */
export function usePointsRead(app, groupId = null) {
  const key = `${app.accountId}:${groupId ?? 'community'}`;
  const [state, setState] = useState({ key, loading: true, data: null, error: null });
  const [revision, setRevision] = useState(0);
  const signIn = useRef(app.requestSignIn);
  signIn.current = app.requestSignIn;
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => previous.key === key ? { ...previous, loading: !previous.data } : { key, loading: true, data: null, error: null });
    pointsApi('read', groupId ? { groupId } : {}, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, loading: false, data, error: null });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setState({ key, loading: false, data: null, error });
      if (error?.status === 401) signIn.current?.();
    });
    return () => controller.abort();
  }, [key, groupId, revision]);
  const current = state.key === key ? state : { loading: true, data: null, error: null };
  return { loading: current.loading, data: current.data, error: current.error, retry: () => setRevision(n => n + 1) };
}

/** Decision 1C: the Play landing's Points row, a glow card with a glass pill, a big "2/5" (locked of five) and one meta line. */
export function PointsLandingCard({ read, onOpen }) {
  const card = landingCard(read.data, read.error);
  return <CardButton variant="hero" className="gx-pt-landing gx-vstack gx-gap-8" aria-label={card.label} data-points-landing onClick={onOpen}>
    <span className="gx-pt-landing-top"><span className="gx-pt-pill gx-t-strong">Guess the Points</span>{card.progress && <span className="gx-n-l gx-t-strong">{card.progress}</span>}</span>
    <span className="gx-t-meta gx-pt-sub">{card.meta}</span>
  </CardButton>;
}

export function PointsComingSoon() {
  return <Card className="gx-vstack gx-gap-12 gx-pt-soon" role="status"><h2 className="gx-t-section">Points is coming soon</h2><p className="gx-t-body gx-c-2">Guess five players’ fantasy points each week. It opens here when it is ready; nothing is needed from you now.</p></Card>;
}

export function PointsBallot() {
  const app = useAppData(), shell = useShell();
  return <PointsBallotView app={app} shell={shell} read={usePointsRead(app)}/>;
}

/** The ballot for one read state; `initialSlot` opens that slot's sheet (tests render it statically). */
export function PointsBallotView({ app, shell, read, initialSlot = null }) {
  const [open, setOpen] = useState(initialSlot);
  const heading = <div className="gx-play-titlebar"><h1 className="gx-t-title gx-grow">{read.data?.status === 'open' ? `WEEK ${read.data.week} POINTS` : 'Guess the Points'}</h1><InfoButton title={INFO.points.title} body={INFO.points.body} links={INFO.points.links}/></div>;
  if (read.loading) return <div className="gx-screen gx-vstack gx-gap-16">{heading}<p className="gx-t-body" role="status">Loading Points…</p></div>;
  if (read.error) return <div className="gx-screen gx-vstack gx-gap-16">{heading}{comingSoon(read.error) ? <PointsComingSoon/> : <LeagueFailure error={read.error} onRetry={read.retry}/>}</div>;
  const data = read.data;
  if (data.status !== 'open') return <div className="gx-screen gx-vstack gx-gap-16">{heading}<Card className="gx-vstack gx-gap-12" role="status"><h2 className="gx-t-section">No Points week is open</h2><p className="gx-t-body gx-c-2">A new week opens Tuesdays at 12:00 AM PT.</p></Card></div>;
  const selected = data.slots.find(slot => slot.slot === open);
  return <div className="gx-screen gx-vstack gx-gap-16 gx-pt" data-screen="points">
    {heading}
    <p className="gx-t-strong gx-n-s" data-points-summary>{summaryLine(data)}</p>
    <ol className="gx-pt-slots" aria-label={`Week ${data.week} Points players`}>
      {data.slots.map(slot => <li key={slot.slot}><SlotCard slot={slot} viewer={app.accountId} weekStatus={data.result?.status} onOpen={() => setOpen(slot.slot)}/></li>)}
    </ol>
    <Button variant="ghost" onClick={() => shell.go('league', { view: 'board', market: 'points' })}>Points board</Button>
    {selected && <SlotSheet key={selected.slot} data={data} weekStatus={data.result?.status} slot={selected} viewer={app.accountId} setDirty={shell.setDirty} onClose={() => setOpen(null)} onSaved={read.retry} onSignInAgain={app.requestSignIn}/>}
  </div>;
}

/** Decision 2A: the glass pill "POS · Player" and the status word. */
function SlotHead({ slot, weekStatus }) {
  return <span className="gx-pt-head">
    <span className="gx-pt-pill gx-t-strong">{slot.slot} · {slot.name}</span>
    <span className="gx-pt-word gx-t-micro">{slotStatus(slot, weekStatus)}</span>
  </span>;
}

function Tiles({ slot }) {
  return <span className="gx-pt-tiles" role="group" aria-label="Results">
    {resultTiles(slot).map(tile => <span key={tile.label} className="gx-pt-tile"><span className="gx-pt-tile-label">{tile.label}</span><span className="gx-pt-tile-value gx-n-m">{tile.value}</span></span>)}
  </span>;
}

/** "You 18" or "Draft 14": one label and one number. */
const ValueRow = ({ label, value }) => <span className="gx-pt-value-row"><span className="gx-t-body">{label}</span><span className="gx-n-m gx-t-strong">{pts(value)}</span></span>;

/** Decision 4A: before the gate opens, faces of who locked in and no numbers. */
function LockedInFaces({ slot }) {
  if (!slot.lockedIn.length) return null;
  return <span className="gx-pt-locked-faces">
    <AvatarStack people={slot.lockedIn.map(row => ({ id: row.userId, name: row.displayName }))} max={4}/>
    <span className="gx-t-meta gx-pt-sub">{slot.lockedIn.length} locked in · guesses open at kickoff</span>
  </span>;
}

/**
 * Decision 5B: everyone's guesses on a number line with the House as a tick. `interactive` (the sheet) makes each face and the
 * tick a 44px button that shows its exact number on tap and names it for keyboard and screen readers; on a card (itself one
 * button) the line is a picture and the card's accessible name carries the exact values.
 */
export function NumberLine({ slot, viewer, interactive = false }) {
  const [shown, setShown] = useState(null);
  const line = numberLine(slot, viewer);
  const scored = slot.state === 'scored';
  const words = marker => `${marker.name}: ${pts(marker.guess)}${scored ? `, ${pts(marker.points)} points` : ''}`;
  const Marker = interactive ? 'button' : 'span';
  const toggle = key => setShown(current => current === key ? null : key);
  return <span className="gx-pt-line" style={{ height: `${line.lanes * 48 + 56}px` }} role={interactive ? 'group' : undefined}
    aria-label={interactive ? `Everyone’s guesses on a scale from 0 to ${line.max}` : undefined} aria-hidden={interactive ? undefined : 'true'} data-number-line>
    <span className="gx-pt-line-track"></span>
    {line.markers.map(marker => <Marker key={marker.userId} className="gx-pt-line-marker" style={{ left: `${marker.pct}%`, top: `${marker.lane * 48}px` }}
      {...(interactive ? { type: 'button', 'aria-label': words(marker), 'aria-pressed': shown === marker.userId, onClick: () => toggle(marker.userId) } : {})} data-guess={marker.guess}>
      {marker.you ? <span className="gx-pt-you-face">You</span> : <Avatar id={marker.userId} name={marker.name} size={32}/>}
      {interactive && shown === marker.userId && <span className="gx-pt-line-tip gx-n-s" aria-hidden="true">{pts(marker.guess)}</span>}
    </Marker>)}
    {line.house && <Marker className="gx-pt-line-house" style={{ left: `${line.house.pct}%` }}
      {...(interactive ? { type: 'button', 'aria-label': `House, unranked: ${pts(line.house.value)}${scored ? `, ${pts(line.house.points)} points` : ''}`, 'aria-pressed': shown === 'house', onClick: () => toggle('house') } : {})}>
      <span className="gx-pt-line-tick"></span>
      <span className="gx-pt-line-house-label gx-t-meta" aria-hidden={interactive ? 'true' : undefined}>House {pts(line.house.value)}</span>
    </Marker>}
    <span className="gx-pt-line-axis gx-t-meta" aria-hidden="true"><span>0</span><span>{line.max / 2}</span><span>{line.max}</span></span>
  </span>;
}

/** A slot card (decision 2A, every card a glow card). At most six data numbers: three tiles and the House label, or one value. */
function SlotCard({ slot, viewer, weekStatus, onOpen }) {
  // After kickoff the card turns to results: tiles with "—" until stats land, and "—" for a slot never locked in.
  const settled = slot.state === 'scored' || slot.closed && slot.state === 'pending';
  const closest = closestLine(slot, viewer);
  const line = slot.revealed && !settled && slot.state !== 'void' && (slot.own?.locked || slot.guesses.length) ? numberLine(slot, viewer) : null;
  const label = [`${SLOT_NAMES[slot.slot]}, ${slot.name}, ${matchupText(slot)}, ${kickoffText(slot.kickoff)}, ${slotStatus(slot, weekStatus)}`,
    ...(line ? [lineWords(line)] : !slot.revealed && slot.lockedIn.length ? [`${slot.lockedIn.length} locked in, guesses open at kickoff`] : [])].join('. ');
  return <CardButton variant="hero" className="gx-pt-card gx-vstack gx-gap-12" aria-label={label} data-slot={slot.slot} onClick={onOpen}>
    <SlotHead slot={slot} weekStatus={weekStatus}/>
    <span className="gx-t-meta gx-pt-sub">{matchupText(slot)} · {kickoffText(slot.kickoff)}</span>
    {slot.state === 'void' ? <span className="gx-t-body gx-pt-sub">Void for everyone · no points</span>
      : settled ? <><Tiles slot={slot}/>{closest && <span className="gx-t-body">{closest}</span>}{slot.revealed && slot.house && <span className="gx-t-meta gx-pt-sub">House {pts(slot.house.estimate)}</span>}</>
      : <>{slot.own?.locked ? <ValueRow label="You" value={slot.own.guess}/> : slot.own ? <ValueRow label="Draft" value={slot.own.guess}/> : null}
        {line ? <NumberLine slot={slot} viewer={viewer}/> : !slot.revealed ? <LockedInFaces slot={slot}/> : null}</>}
  </CardButton>;
}

/**
 * Decision 3B: − and + at 56px with hold to move by 5 (a short press moves by 1). The number between them is a spin button, so
 * the keyboard has the same moves: arrows ±1, Page Up / Page Down ±5, Home 0 and End 60.
 */
function Stepper({ value, onChange, disabled }) {
  const timers = useRef({ delay: null, repeat: null }), held = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;
  const stop = () => { clearTimeout(timers.current.delay); clearInterval(timers.current.repeat); };
  useEffect(() => stop, []);
  const start = by => {
    if (disabled) return;
    stop(); held.current = false;
    timers.current.delay = setTimeout(() => {
      held.current = true; latest.current(v => step(v, 5 * by));
      timers.current.repeat = setInterval(() => latest.current(v => step(v, 5 * by)), 300);
    }, 450);
  };
  const button = (by, icon, label) => <button type="button" className="gx-pt-step" aria-label={label} disabled={disabled || value === (by < 0 ? GUESS_MIN : GUESS_MAX)}
    onPointerDown={() => start(by)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onClick={() => { if (held.current) { held.current = false; return; } onChange(v => step(v, by)); }}>
    <Icon icon={icon} size={24}/>
  </button>;
  const keys = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
  return <div className="gx-vstack gx-gap-8">
    <div className="gx-pt-stepper">
      {button(-1, 'minus', 'One point less, hold for 5')}
      <span className="gx-pt-big gx-n-xl" role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label="Your guess" aria-valuemin={GUESS_MIN} aria-valuemax={GUESS_MAX}
        aria-valuenow={value ?? undefined} aria-valuetext={value === null ? 'No guess yet' : `${value} points`} aria-disabled={disabled || undefined}
        onKeyDown={event => {
          if (disabled) return;
          if (Object.hasOwn(keys, event.key)) { event.preventDefault(); onChange(v => step(v, keys[event.key])); }
          else if (event.key === 'Home') { event.preventDefault(); onChange(() => GUESS_MIN); }
          else if (event.key === 'End') { event.preventDefault(); onChange(() => GUESS_MAX); }
        }}>{value === null ? '—' : value}</span>
      {button(1, 'plus', 'One point more, hold for 5')}
    </div>
    <p className="gx-t-meta gx-pt-sub gx-pt-center">Hold to move by 5</p>
  </div>;
}

/** The slot's sheet: the stepper while it is open, and the number line or the locked-in faces after lock-in or kickoff. */
export function SlotSheet({ data, slot, viewer, weekStatus, setDirty, onClose, onSaved, onSignInAgain }) {
  const [value, setValue] = useState(Number.isInteger(slot.own?.guess) ? slot.own.guess : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const alive = useRef(true), running = useRef(false);
  const can = editable(data, slot);
  const dirty = can && value !== null && value !== slot.own?.guess;
  const dirtyKey = `points.${data.season}.${data.week}.${slot.slot}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDirty?.(dirtyKey, dirty || busy || Boolean(pending)); return () => setDirty?.(dirtyKey, false); }, [dirtyKey, dirty, busy, pending, setDirty]);
  async function send(action, retry = false) {
    if (running.current || (!retry && (!can || value === null))) return;
    const request = retry ? pending : { action, body: { season: data.season, week: data.week, slot: slot.slot, guess: value, requestId: crypto.randomUUID() } };
    running.current = true; setBusy(true); setConfirm(false); setError(''); setNotice(''); setPending(request);
    try {
      const saved = await pointsApi(request.action, request.body);
      if (!alive.current) return;
      setPending(null);
      setNotice(saved.locked ? `Locked in ${saved.guess}. Everyone’s guesses and the House for this player are open to you.` : `Draft saved: ${saved.guess}.`);
      onSaved?.();
    } catch (failure) {
      if (!alive.current) return;
      if (failure.uncertain) { setError('We could not confirm the save. Your guess is kept here. Retry sends the same request, so it cannot count twice.'); return; }
      setPending(null);
      setError(failure.status ? failure.message : 'No connection. Your guess is kept here; reconnect and try again.');
      if (failure.status === 401) onSignInAgain?.();
      if (['GTL_POINTS_LOCKED', 'GTL_POINTS_CLOSED', 'GTL_POINTS_NOT_OPEN'].includes(failure.code)) onSaved?.();
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const choose = update => { setValue(update); setNotice(''); };
  const title = `${slot.slot} · ${slot.name}`;
  const footer = can ? <Button variant="primary" block disabled={busy || value === null || Boolean(pending)} onClick={() => setConfirm(true)}>{value === null ? 'Choose a guess to lock in' : `Lock in ${value}`}</Button> : null;
  return <Sheet title={title} onClose={() => { if (!busy) onClose(); }} footer={footer} className="gx-pt-sheet">
    <Card variant="hero" className="gx-vstack gx-gap-12 gx-pt-card">
      <SlotHead slot={slot} weekStatus={weekStatus}/>
      <p className="gx-t-meta gx-pt-sub">{SLOT_NAMES[slot.slot]} · {matchupText(slot)} · {can ? 'locks ' : ''}{kickoffText(slot.kickoff)}</p>
      {(slot.state === 'scored' || slot.closed) && slot.state !== 'void' && <><Tiles slot={slot}/>{closestLine(slot, viewer) && <p className="gx-t-body">{closestLine(slot, viewer)}</p>}</>}
      {slot.state === 'void' && <p className="gx-t-body">Void for everyone. This week’s maximum drops by 10.</p>}
      {can ? <section className="gx-vstack gx-gap-12" aria-label="Your guess">
        <Stepper value={value} onChange={choose} disabled={busy || Boolean(pending)}/>
        <Button disabled={busy || !dirty || Boolean(pending)} onClick={() => send('draft')}>{busy ? 'Saving…' : 'Save draft'}</Button>
      </section> : <Revealed slot={slot} viewer={viewer}/>}
    </Card>
    {can && <p className="gx-t-body gx-c-2">Guess his Full PPR fantasy points, a whole number from 0 to 60. A locked guess is final.</p>}
    {can && slot.own && !slot.own.locked && <p className="gx-t-meta gx-c-2">Saved draft: {slot.own.guess}. A draft does not score unless you lock it in before kickoff.</p>}
    {can && <LockedInFaces slot={slot}/>}
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Your last save is unconfirmed.</p><Button disabled={busy} onClick={() => send(pending.action, true)}>Retry same save</Button></Card>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    <p className="gx-t-body" role="status">{notice}</p>
    <Dialog open={confirm} title={`Lock in ${value}?`} text={`${slot.name} (${slot.slot}): ${value} fantasy points. This guess is final. Other members’ guesses and the House for this player open to you once it is locked.`} onClose={() => { if (!busy) setConfirm(false); }}>
      <Button onClick={() => setConfirm(false)}>Keep editing</Button>
      <Button variant="primary" disabled={busy} onClick={() => send('lock')}>Confirm lock-in</Button>
    </Dialog>
  </Sheet>;
}

/** After lock-in or kickoff: the number line (5B) once the gate opens; before it, the faces of who locked in (4A). */
function Revealed({ slot, viewer }) {
  if (!slot.revealed) {
    return <section className="gx-vstack gx-gap-8" aria-label="Who has locked in">
      {slot.lockedIn.length ? <LockedInFaces slot={slot}/> : <p className="gx-t-body gx-pt-sub">No one has locked in yet · guesses open at kickoff</p>}
    </section>;
  }
  const line = numberLine(slot, viewer);
  return <section className="gx-vstack gx-gap-8" aria-label="Everyone’s guesses">
    {!slot.own?.locked && <p className="gx-t-body gx-pt-sub">You did not lock in this player. No points, shown as —.</p>}
    {line.markers.length || line.house ? <NumberLine slot={slot} viewer={viewer} interactive/> : <p className="gx-t-body gx-pt-sub">No one locked in this player.</p>}
    <p className="gx-t-meta gx-pt-sub">Tap a face or the House for the exact number.</p>
  </section>;
}
