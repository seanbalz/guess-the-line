// Play › Guess the Points (D-56 spec section 5 and its addenda; D-69 step 1, Sean's P4A of November 3, 2026). Play
// layers (D-66 nesting cards):
// - The week card, "Week N Points": a five-part bar (one part per slot), one meta line, then five glow slot tiles in two
//   columns (position, status word, player, one value line) and a sixth tile, the Points board, which opens the League
//   board on the Points market.
// - A slot's layer (address `item` = the slot code): everything the slot sheet held (decisions 2A, 3B, 4A, 5B): the big
//   stepper, Save draft, the one lime "Lock in N" with its confirm dialog, Retry same save, the locked-in faces, the number
//   line with the House tick, the You / Actual / Points tiles and the closest line, then the player's context.
// - The player's profile (`layer` 'profile' on the slot's address, Board i63), in the same card so the guess being edited
//   stays.
// The server decides every gate (cloud/points.mjs): these layers draw only what /points/read returned. Until P-01 is
// applied the read answers 404 and the card says "Points is coming soon". A fresh read reports a slot guessed exactly as a
// big moment (pointsMoments.js); this card holds the Points moments' scope. The ballot is keyed by account, so an account
// switch starts it, and the context, empty.
import { useEffect, useRef, useState } from 'react';
import { pointsApi } from '../../../api.js';
import { fantasyWeekKey, useFantasySnapshot } from '../../../fantasyData.js';
import { useAppData } from '../../data/AppData.jsx';
import { useShell } from '../../shell/context.js';
import { useFramePresentation } from '../../shell/useFramePresentation.js';
import { useMomentScope, useMoments } from '../../moments/MomentsProvider.jsx';
import { SCOPES } from '../../moments/catalog.js';
import { PlayEmpty, PlayFailure, PlayLoading } from '../PlayStates.jsx';
import { PlayLayer } from '../PlayLayer.jsx';
import { PlayTile } from '../PlayTile.jsx';
import { Avatar, AvatarStack, Button, Card, CardButton, Dialog, Icon, InfoButton, Matchup, Pill, Skeleton, TeamMark, matchupWords } from '../../ui/index.js';
import { PointsObserved, PointsWeekContext } from './PointsObserved.jsx';
import { INFO } from '../../info.js';
import { GUESS_MAX, GUESS_MIN, SLOT_NAMES, boardTile, closestLine, comingSoon, editable, isExact, kickoffText, matchupCodes, matchupText, numberLine, publishTarget, pts, resultTiles, slotStatus, slotTile, step, weekBar, weekLine } from './pointsModel.js';
import { pointsMoments, pointsSource } from './pointsMoments.js';
import { PointsPublish } from './PointsPublish.jsx';
import { ProfileView, SlotContext } from './SlotContext.jsx';
import { CONTEXT_COPY, contextSettings } from './pointsContext.js';
import './points.css';

/** The slot's full matchup name in its metadata, or its team text when the game key has another form. */
function SlotGame({ codes, text }) {
  return codes ? matchupWords(codes.away, codes.home) : text;
}

/**
 * The week's read, shared by the ballot, the Play landing tile and the League board: `{ loading, data, error, retry }`.
 * A refresh after a save keeps the last good reply on screen (an open slot stays open); a new account or group starts
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

/**
 * D-69: each fresh /points/read reply reports the viewer's exact slots to the moments engine. It runs on a new reply only:
 * a refresh in flight keeps the last reply, and a save's own answer is not a read, so nothing pending ever plays.
 */
export function usePointsMoments(read, groupId = null) {
  const report = useMoments()?.report;
  const data = read.data;
  useEffect(() => { if (data && report) report(pointsMoments(data), { source: pointsSource(groupId) }); }, [data, report, groupId]);
}

export function PointsComingSoon() {
  return <Card className="gx-vstack gx-gap-12 gx-pt-soon" role="status"><h2 className="gx-t-section">Points is coming soon</h2><p className="gx-t-body gx-c-2">Guess five players’ fantasy points each week. It opens here when it is ready; nothing is needed from you now.</p></Card>;
}

const PointsInfo = () => <InfoButton title={INFO.points.title} body={INFO.points.body} links={INFO.points.links}/>;

export function PointsBallot() {
  const app = useAppData(), shell = useShell();
  return <PointsBallotView key={app.accountId} app={app} shell={shell} read={usePointsRead(app)}/>;
}

/**
 * The ballot for one read state, as one Play layer whose card is the week, one slot, or that slot's profile, as the
 * address says (`item`, `layer`). Every state draws in the same layer, so a change of card moves focus to its heading.
 */
export function PointsBallotView({ app, shell, read }) {
  useMomentScope(SCOPES.points);
  usePointsMoments(read);
  const place = shell.state?.views?.play ?? {};
  const data = read.data;
  const open = !read.loading && !read.error && data?.status === 'open';
  const selected = open ? data.slots.find(slot => slot.slot === place.item) ?? null : null;
  const profile = Boolean(selected) && place.layer === 'profile';
  useFramePresentation('play-points', open && !selected);
  const week = open ? `Week ${data.week} Points` : 'Guess the Points';
  const toWeek = { key: 'points', label: week, open: () => shell.setView('play', { item: undefined, layer: undefined }) };
  const named = selected ? `${selected.slot} · ${selected.name}` : null;
  const frame = !selected ? { layer: 'points', title: week, parents: [], info: <PointsInfo/> }
    : profile ? { layer: `points:${selected.slot}`, title: selected.name, parents: [toWeek, { key: 'slot', label: named, open: () => shell.setView('play', { item: selected.slot, layer: undefined }) }], info: null }
    : { layer: `points:${selected.slot}`, title: named, parents: [toWeek], info: <PointsInfo/> };
  let body;
  if (read.loading) body = <PlayLoading>Loading Points…</PlayLoading>;
  else if (read.error) body = comingSoon(read.error) ? <PointsComingSoon/> : <PlayFailure what="Points" error={read.error} onRetry={read.retry}/>;
  else {
    // The commissioner alone sees a drafted week's preview and Publish now; gtl-api checks the grant again.
    const target = shell.communityAdmin === true ? publishTarget(data, app.community?.data?.week) : null;
    const published = n => { shell.toast?.(`Week ${n} is open for everyone.`); read.retry(); };
    const publish = target && <PointsPublish key={`${target.season}:${target.week}`} target={target} quiet={open} onPublished={published}/>;
    body = !open ? <><PlayEmpty>No Points week is open. A new week opens Tuesdays at 12:00 AM PT.</PlayEmpty>{publish}</>
      : selected ? <SlotLayer key={selected.slot} data={data} slot={selected} viewer={app.accountId} profile={profile} setDirty={shell.setDirty}
        onProfile={() => shell.setView('play', { item: selected.slot, layer: 'profile' })} onSaved={read.retry} onSignInAgain={app.requestSignIn}/>
      : <><WeekCard data={data} viewer={app.accountId} onSlot={code => shell.setView('play', { item: code })} onBoard={() => shell.go('league', { view: 'board', market: 'points' })}/>{publish}</>;
  }
  return <div className="gx-screen" data-screen="points">
    <PlayLayer label="Guess the Points" parents={frame.parents} layer={frame.layer} title={frame.title} info={frame.info} className="gx-pt">{body}</PlayLayer>
  </div>;
}

/** P4A: the bar and the meta line, then the five slot tiles and the board tile, two columns (one under 360px). */
function WeekCard({ data, viewer, onSlot, onBoard }) {
  const bar = weekBar(data), board = boardTile(data, viewer);
  return <>
    <div className="gx-pt-week-heading"><p className="gx-t-micro gx-c-accent">Five players · Full PPR</p><h3 className="gx-t-section">Your weekly lineup</h3></div>
    <span className="gx-pt-bar" role="img" aria-label={bar.label} data-points-bar>
      {bar.parts.map(part => <span key={part.slot} className={`gx-pt-bar-part gx-pt-bar-part--${part.state}`} aria-hidden="true">{part.state === 'locked' ? <Icon icon="check" size={13}/> : part.slot}</span>)}
    </span>
    <p className="gx-t-meta" data-points-summary>{weekLine(data)}</p>
    <PointsWeekContext data={data}>{fantasy => <ul className="gx-nest-grid gx-pt-grid" aria-label={`Week ${data.week} Points players`}>
      {data.slots.map(slot => <li key={slot.slot}><SlotTile slot={slot} fantasy={fantasy} settings={contextSettings(data)} weekStatus={data.result?.status} onOpen={() => onSlot(slot.slot)}/></li>)}
      <li><PlayTile label="Points board" icon="trophy" big={board.big} sub={board.sub} ariaLabel={board.label} onClick={onBoard}/></li>
    </ul>}</PointsWeekContext>
  </>;
}

/** One glow tile (P4A): the position, its status word, the player and one value line. Its id lets Back return focus to it. */
function SlotTile({ slot, fantasy, settings, weekStatus, onOpen }) {
  const tile = slotTile(slot, weekStatus);
  return <CardButton variant="hero" id={`gx-pt-slot-${slot.slot}`} className="gx-pt-slot gx-vstack gx-gap-8" aria-label={tile.label} data-slot={slot.slot} onClick={onOpen}>
    <span className="gx-pt-slot-top"><span className="gx-t-section">{tile.code}</span><span className="gx-pt-word gx-t-micro">{tile.word}</span></span>
    <TeamMark code={slot.team} size={48} decorative/>
    <span className="gx-t-strong gx-pt-slot-name">{tile.name}</span>
    <span className={tile.number ? 'gx-n-s' : 'gx-t-meta gx-pt-sub'}>{tile.value}</span>
    <PointsObserved snapshot={fantasy} slot={slot} settings={settings} compact/>
  </CardButton>;
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
 * Decision 5B: everyone's guesses on a number line with the House as a tick. `interactive` (the slot layer) makes each face and the
 * tick a 44px button that shows its exact number on tap and names it for keyboard and screen readers; otherwise the line is a
 * picture whose holder names the exact values.
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

/**
 * One slot's card: the stepper, Save draft and the one lime "Lock in N" while it is open; the number line or the locked-in
 * faces after lock-in or kickoff; the results once scored (an exact guess says so); then the player's context. With
 * `profile` it shows his Fantasy profile instead, and the guess being edited stays (this card stays mounted). Leaving
 * the slot with an unsaved guess asks first (setDirty; the profile keeps it, so it does not ask).
 */
export function SlotLayer({ data, slot, viewer, profile = false, setDirty, onProfile, onSaved, onSignInAgain }) {
  const fantasy = useFantasySnapshot(fantasyWeekKey(data.season, data.week));
  const settings = contextSettings(data);
  const [value, setValue] = useState(Number.isInteger(slot.own?.guess) ? slot.own.guess : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const alive = useRef(true), running = useRef(false), wasProfile = useRef(profile);
  const can = editable(data, slot);
  useFramePresentation('play-points', !profile && can && !busy && !pending && !error);
  const dirty = can && value !== null && value !== slot.own?.guess;
  const dirtyKey = `points.${data.season}.${data.week}.${slot.slot}`;
  const code = slot.slot;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const keeps = next => next.tab === 'play' && next.views.play.section === 'points' && next.views.play.item === code;
    setDirty?.(dirtyKey, dirty || busy || Boolean(pending), keeps);
    return () => setDirty?.(dirtyKey, false);
  }, [dirtyKey, dirty, busy, pending, setDirty, code]);
  // The profile takes focus when it opens here (not on a page load at its address); Back returns focus to "Open profile".
  const focusProfile = profile && !wasProfile.current;
  useEffect(() => { wasProfile.current = profile; });
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
  if (profile) return <SlotProfile fantasy={fantasy} slot={slot} settings={settings} week={data.week} focus={focusProfile}/>;
  const status = slotStatus(slot, data.result?.status);
  const settled = (slot.state === 'scored' || slot.closed) && slot.state !== 'void';
  const closest = closestLine(slot, viewer);
  return <>
    <Card as="header" className="gx-pt-player gx-vstack gx-gap-16">
      <p className="gx-t-meta gx-pt-sub">{SLOT_NAMES[slot.slot]} · <SlotGame codes={matchupCodes(slot)} text={matchupText(slot)}/> · {can ? 'locks ' : ''}{kickoffText(slot.kickoff)}</p>
      <h3 className="gx-t-section">{slot.name}</h3>
      {matchupCodes(slot) ? <Matchup away={matchupCodes(slot).away} home={matchupCodes(slot).home} size={48} layout="stack"/> : <TeamMark code={slot.team} size={48} decorative/>}
    </Card>
    <Card variant="hero" className="gx-vstack gx-gap-12 gx-pt-card">
      <span className="gx-pt-word gx-t-micro">{status}</span>
      {settled && <><Tiles slot={slot}/>{isExact(slot) && <Pill tone="win" className="gx-pt-exact">Exact · 10 points</Pill>}{closest && <p className="gx-t-body">{closest}</p>}</>}
      {slot.state === 'void' && <p className="gx-t-body">Void for everyone. This week’s maximum drops by 10.</p>}
      {!can && !settled && slot.own?.locked && slot.state !== 'void' && <ValueRow label="You" value={slot.own.guess}/>}
      {can ? <section className="gx-vstack gx-gap-12" aria-label="Your guess">
        <p className="gx-t-micro gx-c-accent">Your fantasy points guess</p>
        <Stepper value={value} onChange={choose} disabled={busy || Boolean(pending)}/>
        <Button block disabled={busy || !dirty || Boolean(pending)} onClick={() => send('draft')}>{busy ? 'Saving…' : 'Save draft'}</Button>
        <Button variant="primary" block disabled={busy || value === null || Boolean(pending)} onClick={() => setConfirm(true)}>{value === null ? 'Choose a guess to lock in' : `Lock in ${value}`}</Button>
        <p className="gx-t-meta gx-pt-sub gx-pt-center">Final for this player. Other slots stay separate.</p>
        <LockedInFaces slot={slot}/>
      </section> : <Revealed slot={slot} viewer={viewer}/>}
    </Card>
    <SlotContext week={data.week} slot={slot} snapshot={fantasy} settings={settings} onProfile={onProfile}/>
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Your last save is unconfirmed.</p><Button disabled={busy} onClick={() => send(pending.action, true)}>Retry same save</Button></Card>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    <p className="gx-t-body" role="status">{notice}</p>
    {can && <Dialog className="gx-play-confirm" open={confirm} title={`Lock in ${value}?`} text={`${slot.name} (${slot.slot}): ${value} fantasy points. This guess is final. Everyone’s guesses and the House open to you.`} onClose={() => { if (!busy) setConfirm(false); }}>
      <div className="gx-play-confirm-call"><span className="gx-t-micro gx-c-accent">{slot.slot} · Your guess</span><strong className="gx-n-l">{value} fantasy points</strong><small className="gx-t-meta gx-pt-sub">{slot.name}</small></div>
      <Button onClick={() => setConfirm(false)}>Keep editing</Button>
      <Button variant="primary" disabled={busy} onClick={() => send('lock')}>Confirm lock-in</Button>
    </Dialog>}
  </>;
}

/** The profile card (Board i63): its code loads on the first visit; until the week's player data is ready, its state. */
function SlotProfile({ fantasy, slot, settings, week, focus }) {
  if (fantasy?.status === 'ready' && fantasy.snapshot) return <ProfileView snapshot={fantasy.snapshot} slot={slot} settings={settings} focus={focus}/>;
  if (!fantasy || fantasy.status === 'loading') return <Skeleton label={CONTEXT_COPY.profileLoading} shape="lines" count={3}/>;
  return <div className="gx-vstack gx-gap-8" role="alert">
    <p className="gx-t-body">{fantasy.status === 'error' ? CONTEXT_COPY.failed : CONTEXT_COPY.unavailable(week)}</p>
    {fantasy.status === 'error' && fantasy.retry ? <Button variant="ghost" onClick={fantasy.retry}>{CONTEXT_COPY.retry}</Button> : null}
  </div>;
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
