// The player context strip in a Points slot's sheet (Board i63): last-3 and season Full PPR averages with their game
// counts, the opponent and what it allows to the position, the game or practice report with the snapshot's time, and
// "Open profile" into the Fantasy profile (shown in place as the sheet's sub-view). It draws only slotContext()
// (pointsContext.js): never GTL's weekly estimate, which is the House (D-56), and never an implied team total (D-57).
// The profile's code (FantasyTools and its stylesheet) loads on that tap, as Research › Fantasy loads its own on a visit.
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { Boundary } from '../../shell/Boundary.jsx';
import { Button, Card, Skeleton } from '../../ui/index.js';
import { retryViewImport } from '../../ui/retryViewImport.js';
import { CONTEXT_COPY, contextNumber, gamesText, slotContext } from './pointsContext.js';

const importProfile = retryViewImport(() => import('./PointsProfile.jsx'));
const loadProfile = () => lazy(importProfile);

/** The profile sub-view's body: the lazily loaded profile, with a local retry if its code cannot load. */
export function ProfileView(props) {
  const [Profile, setProfile] = useState(loadProfile), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => { region.current?.focus({ preventScroll: true }); setProfile(loadProfile); setAttempt(n => n + 1); };
  return <div ref={region} role="group" aria-label="Player profile" tabIndex={-1} className="gx-vstack gx-gap-16">
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
      <p className="gx-t-body">{CONTEXT_COPY.profileFailed}</p>
      <Button variant="secondary" onClick={retry}>{CONTEXT_COPY.profileRetry}</Button>
    </div>}>
      <Suspense fallback={<Skeleton label={CONTEXT_COPY.profileLoading} shape="lines" count={3}/>}><Profile {...props}/></Suspense>
    </Boundary>
  </div>;
}

/** A number, or "—" read out as `missing`. */
function Value({ value, missing }) {
  const text = contextNumber(value);
  return text === '—' ? <><span aria-hidden="true">—</span><span className="gx-sr-only">{missing}</span></> : text;
}

function Tile({ label, value, note, missing = 'no recorded games' }) {
  return <div className="gx-pt-context-tile">
    <dt className="gx-pt-tile-label">{label}</dt>
    <dd className="gx-pt-tile-value gx-n-m"><Value value={value} missing={missing}/></dd>
    <dd className="gx-t-meta gx-pt-sub">{note}</dd>
  </div>;
}

/** `snapshot` is useFantasySnapshot's state for the slot's week: `{ status, snapshot, retry }`. */
export function SlotContext({ week, slot, snapshot: state, settings, onProfile }) {
  const titleId = useId();
  const head = <><h3 className="gx-t-strong" id={titleId}>{CONTEXT_COPY.title}</h3><p className="gx-t-meta gx-pt-sub">{CONTEXT_COPY.scoring}</p></>;
  let body;
  if (!state || state.status === 'loading') body = <Skeleton label={CONTEXT_COPY.loading} shape="panels" count={2}/>;
  else if (state.status !== 'ready' || !state.snapshot) {
    body = <>
      <p className="gx-t-body">{state.status === 'error' ? CONTEXT_COPY.failed : CONTEXT_COPY.unavailable(week)}</p>
      {state.status === 'error' && state.retry ? <Button variant="ghost" onClick={state.retry}>{CONTEXT_COPY.retry}</Button> : null}
    </>;
  } else {
    const context = slotContext(state.snapshot, slot, settings);
    const report = [context.found ? context.status ?? 'No game or practice report' : CONTEXT_COPY.notInSnapshot, context.asOf ? `as of ${context.asOf}` : null].filter(Boolean).join(' · ');
    body = <>
      <dl className="gx-pt-context-tiles">
        <Tile label="Last 3" value={context.recent.value} note={gamesText(context.recent.games)}/>
        <Tile label="Season" value={context.season.value} note={gamesText(context.season.games)}/>
        <Tile label={context.opponent ? `${context.opponent} allows` : 'Opponent allows'} value={context.allowed?.value ?? null}
          note={context.allowed ? `to ${context.allowed.positions} · ${gamesText(context.allowed.games)}` : 'not in this data'} missing="not available"/>
      </dl>
      <p className="gx-t-meta gx-pt-sub" data-points-report>{report}</p>
      {context.found ? <Button variant="ghost" iconEnd="chevronRight" onClick={onProfile} aria-label={`${CONTEXT_COPY.profile}: ${slot.name}`}>{CONTEXT_COPY.profile}</Button> : null}
    </>;
  }
  return <Card as="section" className="gx-vstack gx-gap-12 gx-pt-context" aria-labelledby={titleId} data-points-context={slot.slot}>
    <div className="gx-vstack gx-gap-2">{head}</div>
    {body}
  </Card>;
}
