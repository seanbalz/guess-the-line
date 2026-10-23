// Play › Points (D-56 spec section 5; the D-56 addendum's ballot card, option D "Glow card"). Five slot cards in kickoff
// order; a tap opens a sheet with the chip rail (0 … 40, More for 45 … 60), −1 / +1, Save draft and the sheet's one lime
// "Lock in N" button with a confirm dialog, as PerGamePlay.jsx does. After lock-in the card shows faces first, with each
// member's guess and the House; after stats, You / Actual / Points tiles and one line naming the closest member.
//
// D-55: at most two glow cards in view. The next slot to pick is the screen's action card and glows (gx-card--hero, glass
// pills and tiles); the other four are plain cards with the same layout. The open sheet repeats the slot as one glow card.
// The server decides every gate (cloud/points.mjs): this screen only draws what /points/read returned. Until P-01 is
// applied the read answers 404 and the screen says "Points is coming soon".
import { useEffect, useRef, useState } from 'react';
import { pointsApi } from '../../../api.js';
import { useAppData } from '../../data/AppData.jsx';
import { useShell } from '../../shell/context.js';
import { LeagueFailure } from '../../league/useLeagueRead.jsx';
import { Avatar, AvatarStack, Button, Card, CardButton, Chip, ChipRail, Dialog, IconButton, InfoButton, Sheet } from '../../ui/index.js';
import { INFO } from '../../info.js';
import { MORE_GUESSES, QUICK_GUESSES, SLOT_NAMES, closestLine, comingSoon, editable, everyone, heroSlot, kickoffText, matchupText, pts, resultTiles, slotStatus, step, summaryLine } from './pointsModel.js';
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
  if (data.status !== 'open') return <div className="gx-screen gx-vstack gx-gap-16">{heading}<Card className="gx-vstack gx-gap-12" role="status"><h2 className="gx-t-section">No Points week is open</h2><p className="gx-t-body gx-c-2">A new week opens Tuesdays at 12:00 PM PT.</p></Card></div>;
  const hero = heroSlot(data), selected = data.slots.find(slot => slot.slot === open);
  return <div className="gx-screen gx-vstack gx-gap-16 gx-pt" data-screen="points">
    {heading}
    <p className="gx-t-strong gx-n-s" data-points-summary>{summaryLine(data)}</p>
    <ol className="gx-pt-slots" aria-label={`Week ${data.week} Points players`}>
      {data.slots.map(slot => <li key={slot.slot}><SlotCard slot={slot} viewer={app.accountId} glow={slot.slot === hero} onOpen={() => setOpen(slot.slot)}/></li>)}
    </ol>
    <Button variant="ghost" onClick={() => shell.go('league', { view: 'board', market: 'points' })}>Points board</Button>
    {selected && <SlotSheet key={selected.slot} data={data} slot={selected} viewer={app.accountId} setDirty={shell.setDirty} onClose={() => setOpen(null)} onSaved={read.retry} onSignInAgain={app.requestSignIn}/>}
  </div>;
}

function SlotHead({ slot }) {
  const status = slotStatus(slot);
  return <span className="gx-pt-head">
    <span className="gx-pt-pill gx-t-micro">{slot.slot}</span>
    <span className="gx-grow"></span>
    <span className={`gx-pt-pill gx-t-micro${status === 'Locked in' ? ' gx-pt-pill--on' : ''}`}>{status}</span>
  </span>;
}

function Tiles({ slot }) {
  return <span className="gx-pt-tiles" role="group" aria-label="Results">
    {resultTiles(slot).map(tile => <span key={tile.label} className="gx-pt-tile"><span className="gx-pt-tile-label">{tile.label}</span><span className="gx-pt-tile-value gx-n-m">{tile.value}</span></span>)}
  </span>;
}

/** Faces first: the viewer, then up to `max` members with their guesses, then the House. */
function Faces({ slot, viewer, max }) {
  const rows = everyone(slot, viewer), shown = rows.slice(0, max), more = rows.length - shown.length;
  return <span className="gx-pt-faces">
    {shown.map(row => <span key={row.userId} className="gx-pt-face"><Avatar id={row.userId} name={row.name === 'You' ? 'You' : row.name} size={24} you={row.you}/><span className="gx-t-meta">{row.you ? 'You' : row.name.split(' ')[0]}</span><span className="gx-n-s gx-t-strong">{pts(row.guess)}</span></span>)}
    {more > 0 && <span className="gx-t-meta">+{more} more</span>}
    <span className="gx-pt-face gx-pt-house"><span className="gx-t-meta">House</span><span className="gx-n-s gx-t-strong">{pts(slot.house?.estimate)}</span></span>
  </span>;
}

/** A slot card (option D). At most six numbers: before stats your guess, three members and the House; after, three tiles and the House. */
function SlotCard({ slot, viewer, glow, onOpen }) {
  // After kickoff the card turns to results: tiles with "—" until stats land, and "—" for a slot never locked in.
  const settled = slot.state === 'scored' || slot.closed && slot.state === 'pending';
  const closest = closestLine(slot, viewer);
  const label = `${SLOT_NAMES[slot.slot]}, ${slot.name}, ${matchupText(slot)}, ${kickoffText(slot.kickoff)}, ${slotStatus(slot)}`;
  return <CardButton variant={glow ? 'hero' : undefined} className="gx-pt-card gx-vstack gx-gap-12" aria-label={label} data-slot={slot.slot} onClick={onOpen}>
    <SlotHead slot={slot}/>
    <span className="gx-vstack gx-gap-4">
      <span className="gx-t-section">{slot.name}</span>
      <span className="gx-t-meta gx-pt-sub">{matchupText(slot)} · {kickoffText(slot.kickoff)}</span>
    </span>
    {slot.state === 'void' ? <span className="gx-t-body gx-pt-sub">Void for everyone · no points</span>
      : settled ? <><Tiles slot={slot}/>{closest && <span className="gx-t-body">{closest}</span>}{slot.revealed && <span className="gx-t-meta gx-pt-sub">House {pts(slot.house?.estimate)}</span>}</>
      : slot.revealed && (slot.own?.locked || slot.guesses.length) ? <Faces slot={slot} viewer={viewer} max={4}/>
      : slot.own ? <span className="gx-t-body">Your draft <span className="gx-n-s gx-t-strong">{pts(slot.own.guess)}</span></span>
      : null}
    {!slot.revealed && slot.lockedIn.length > 0 && <AvatarStack people={slot.lockedIn.map(row => ({ id: row.userId, name: row.displayName }))} label={`${slot.lockedIn.length} locked in`}/>}
  </CardButton>;
}

/** The slot's sheet: the editor while it is open, and the full Everyone / House / results view after lock-in or kickoff. */
export function SlotSheet({ data, slot, viewer, setDirty, onClose, onSaved, onSignInAgain }) {
  const [value, setValue] = useState(Number.isInteger(slot.own?.guess) ? slot.own.guess : null);
  const [more, setMore] = useState(() => Number.isInteger(slot.own?.guess) && slot.own.guess > 40);
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
  const choose = guess => { setValue(guess); setNotice(''); };
  const title = `${slot.slot} · ${slot.name}`;
  const footer = can ? <Button variant="primary" block disabled={busy || value === null || Boolean(pending)} onClick={() => setConfirm(true)}>{value === null ? 'Choose a guess to lock in' : `Lock in ${value}`}</Button> : null;
  return <Sheet title={title} onClose={() => { if (!busy) onClose(); }} footer={footer} className="gx-pt-sheet">
    <Card variant="hero" className="gx-vstack gx-gap-12 gx-pt-card">
      <SlotHead slot={slot}/>
      <p className="gx-t-meta gx-pt-sub">{SLOT_NAMES[slot.slot]} · {slot.position} · {matchupText(slot)} · {kickoffText(slot.kickoff)}</p>
      {(slot.state === 'scored' || slot.closed) && slot.state !== 'void' && <><Tiles slot={slot}/>{closestLine(slot, viewer) && <p className="gx-t-body">{closestLine(slot, viewer)}</p>}</>}
      {slot.state === 'void' && <p className="gx-t-body">Void for everyone. This week’s maximum drops by 10.</p>}
    </Card>
    {can ? <section className="gx-vstack gx-gap-12" aria-label="Your guess">
      <p className="gx-t-body gx-c-2">Guess his Full PPR fantasy points, a whole number from 0 to 60. A locked guess is final.</p>
      <div className="gx-pt-stepper">
        <IconButton icon="minus" label="One point less" disabled={busy || value === 0} onClick={() => choose(step(value, -1))}/>
        <output className="gx-n-xl gx-pt-value" aria-live="polite" aria-label={value === null ? 'No guess yet' : `Your guess ${value} points`}>{value === null ? '—' : value}</output>
        <IconButton icon="plus" label="One point more" disabled={busy || value === 60} onClick={() => choose(step(value, 1))}/>
      </div>
      <ChipRail label="Quick guesses">
        {QUICK_GUESSES.map(guess => <Chip key={guess} selected={value === guess} label={`${guess} points`} disabled={busy} onClick={() => choose(guess)}>{guess}</Chip>)}
        {more ? MORE_GUESSES.map(guess => <Chip key={guess} selected={value === guess} label={`${guess} points`} disabled={busy} onClick={() => choose(guess)}>{guess}</Chip>)
          : <Chip text disabled={busy} aria-expanded="false" onClick={() => setMore(true)}>More</Chip>}
      </ChipRail>
      <Button disabled={busy || !dirty || Boolean(pending)} onClick={() => send('draft')}>{busy ? 'Saving…' : 'Save draft'}</Button>
      {slot.own && !slot.own.locked && <p className="gx-t-meta gx-c-2">Saved draft: {slot.own.guess}. A draft does not score unless you lock it in before kickoff.</p>}
    </section> : <Revealed slot={slot} viewer={viewer}/>}
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Your last save is unconfirmed.</p><Button disabled={busy} onClick={() => send(pending.action, true)}>Retry same save</Button></Card>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    <p className="gx-t-body" role="status">{notice}</p>
    <Dialog open={confirm} title={`Lock in ${value}?`} text={`${slot.name} (${slot.slot}): ${value} fantasy points. This guess is final. Other members’ guesses and the House for this player open to you once it is locked.`} onClose={() => { if (!busy) setConfirm(false); }}>
      <Button onClick={() => setConfirm(false)}>Keep editing</Button>
      <Button variant="primary" disabled={busy} onClick={() => send('lock')}>Confirm lock-in</Button>
    </Dialog>
  </Sheet>;
}

/** After lock-in or kickoff: Everyone (faces first, each guess) and the House; before the gate opens, faces only. */
function Revealed({ slot, viewer }) {
  if (!slot.revealed) {
    return <section className="gx-vstack gx-gap-8" aria-label="Who has locked in">
      <h3 className="gx-t-strong">Everyone</h3>
      <p className="gx-t-body gx-c-2">{slot.closed ? 'Closed at kickoff.' : 'Guesses and the House open when you lock in or at kickoff.'}</p>
      {slot.lockedIn.length > 0 && <AvatarStack people={slot.lockedIn.map(row => ({ id: row.userId, name: row.displayName }))} max={6} label={`${slot.lockedIn.length} locked in`}/>}
    </section>;
  }
  const rows = everyone(slot, viewer);
  return <section className="gx-vstack gx-gap-8" aria-label="Everyone’s guesses">
    <h3 className="gx-t-strong">Everyone</h3>
    {!slot.own?.locked && <p className="gx-t-body gx-c-2">You did not lock in this player. No points, shown as —.</p>}
    <ul className="gx-pt-everyone">
      {rows.map(row => <li key={row.userId} className="gx-pt-person"><Avatar id={row.userId} name={row.name} size={32} you={row.you}/><span className="gx-grow gx-t-body">{row.name}</span><span className="gx-n-s gx-t-strong">{pts(row.guess)}</span>{slot.state === 'scored' && <span className="gx-t-meta gx-c-2">{pts(row.points)} pts</span>}</li>)}
      <li className="gx-pt-person"><span className="gx-pt-house-mark" aria-hidden="true">H</span><span className="gx-grow gx-t-body">House · unranked</span><span className="gx-n-s gx-t-strong">{pts(slot.house?.estimate)}</span>{slot.state === 'scored' && <span className="gx-t-meta gx-c-2">{pts(slot.house?.points)} pts</span>}</li>
    </ul>
    {!rows.length && <p className="gx-t-body gx-c-2">No one else has locked in yet.</p>}
  </section>;
}

