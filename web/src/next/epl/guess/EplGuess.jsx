import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Card, Skeleton } from '../../ui/index.js';
import { useSportGuard } from '../../../sportNavigation.js';
import { eplApi } from '../api.js';
import { createGuessController, guessProblem, isClosed, ownGuess } from './guessModel.js';
import GuessCard from './GuessCard.jsx';
import './guess.css';

export function GuessList({ state, now, selected, onSelect, onEdit, onSave, onReload, onWeek, onNavigate, guardNavigation = true, id = 'epl-guess' }) {
  const data = state.data;
  if (!data) return state.status === 'loading' ? <Skeleton label="Loading moneyline guesses" shape="panels" count={2}/> : <section className="gx-empty"><p>{guessProblem(state.error)}</p><Button onClick={onReload}>Try again</Button></section>;
  const ordered = [...data.fixtures].sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime) || a.eventId.localeCompare(b.eventId));
  const open = ordered.filter(f => !isClosed(f, now) && ownGuess(data, f.eventId)?.status !== 'locked');
  const hero = open.find(f => f.eventId === selected) ?? open[0];
  const locked = ordered.filter(f => ownGuess(data, f.eventId)?.status === 'locked').length;
  return <div className="gx-epl-guesses">
    <div className="gx-epl-guess-heading"><h2 className="gx-t-section">Matchweek <span className="gx-t-n-m">{data.week}</span></h2>
      {data.weeks?.length > 1 ? <label className="gx-t-meta">Matchweek <select aria-label="EPL matchweek" value={`${data.season}/${data.week}`} disabled={state.busy || state.uncertain || Object.keys(state.drafts).length > 0} onChange={event => { const [season, week] = event.target.value.split('/').map(Number); onWeek({ season, week }); }}>{data.weeks.map(w => <option key={`${w.season}/${w.week}`} value={`${w.season}/${w.week}`}>{w.season} · MW{w.week}{w.available ? '' : ' · read only'}</option>)}</select></label> : null}
    </div>
    {!data.available ? <Card><p className="gx-t-strong">Moneyline guessing isn’t available this week.</p><p className="gx-t-meta">{data.reason === 'schema_unavailable' ? 'This app version cannot load the moneyline game yet.' : 'Prices have not been verified. Existing permitted guesses remain below.'}</p></Card> : null}
    {!data.ownerId ? <p className="gx-t-body">You’re viewing read-only. Link an FEPL manager in Pick a Team to enter guesses.</p> : null}
    {state.status === 'stale' ? <p className="gx-t-body" role="status">Saved data could not be refreshed. Entry is paused until saved guesses load.</p> : null}
    {state.notice ? <p className="gx-t-body" role="status">{state.notice}</p> : null}
    <Button variant="secondary" disabled={state.busy} onClick={onReload}>{state.busy ? 'Loading saved guesses…' : state.uncertain ? 'Check saved guesses' : 'Refresh saved guesses'}</Button>
    <Card><p className="gx-t-strong">{locked} of {ordered.length} locked</p><div className="gx-epl-guess-progress" role="img" aria-label={`${locked} of ${ordered.length} matches locked`}>{ordered.map(f => <i key={f.eventId} className={ownGuess(data, f.eventId)?.status === 'locked' ? 'gx-epl-guess-dot--locked' : undefined}/>)}</div><p className="gx-t-meta">2-way moneyline · draw = push</p></Card>
    {hero && data.available && data.ownerId ? <GuessCard key={hero.eventId} id={`${id}-hero`} hero fixture={hero} data={data} saved={ownGuess(data, hero.eventId)} now={now}
      draft={{ club: ownGuess(data, hero.eventId)?.club ?? '', price: String(ownGuess(data, hero.eventId)?.price ?? '+100'), ...state.drafts[hero.eventId] }}
      busy={state.busy || state.uncertain || state.status !== 'ready'} pending={state.busy} onEdit={patch => onEdit(hero.eventId, patch)} onSave={lock => onSave(hero.eventId, lock)}/> : null}
    {open.length > 1 && data.available && data.ownerId ? <Card><h3 className="gx-t-section">Other matches</h3><ul className="gx-epl-guess-later">{open.filter(f => f !== hero).map(f => <li key={f.eventId}><Button block disabled={state.busy || state.uncertain} onClick={() => onSelect(f.eventId)}>{f.away} at {f.home}{state.drafts[f.eventId] ? ' · unsaved draft' : ownGuess(data, f.eventId) ? ' · draft saved' : ''}</Button></li>)}</ul></Card> : null}
    {ordered.filter(f => f !== hero || !data.available || !data.ownerId).filter(f => !data.ownerId || !data.available || ownGuess(data, f.eventId)?.status === 'locked' || isClosed(f, now)).map((f, index) => <GuessCard key={f.eventId} id={`${id}-result-${index}`} fixture={f} data={data} now={now} saved={ownGuess(data, f.eventId)} draft={{ ...state.drafts[f.eventId], local: Boolean(state.drafts[f.eventId]) }}/>) }
    {!ordered.length ? <p className="gx-t-body">No fixtures are available for this matchweek.</p> : null}
    {onNavigate ? <Button variant="ghost" disabled={state.busy || state.uncertain} onClick={() => { if (!guardNavigation || !Object.keys(state.drafts).length || window.confirm('Leave without saving your changes?')) onNavigate({ tab: 'play', section: 'leaderboard' }); }}>Moneyline leaderboard</Button> : null}
  </div>;
}

/** Shell contract: accountId is the authenticated GTL ID; week is independently read from EPL, never NFL. */
export default function EplGuess({ api = eplApi, accountId, onNavigate, onDirtyChange }) {
  const controller = useMemo(() => createGuessController(api), [api, accountId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [now, setNow] = useState(Date.now), [selected, setSelected] = useState(null);
  const checkedKickoffs = useMemo(() => new Set(), [controller]);
  const id = useId();
  const dirty = Object.keys(state.drafts).length > 0 || state.uncertain || state.busy && state.status === 'ready';
  const delegatedGuard = Boolean(onDirtyChange);
  const dirtyCallback = useRef(onDirtyChange); dirtyCallback.current = onDirtyChange;
  useSportGuard(delegatedGuard ? false : dirty);
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty, delegatedGuard]);
  useEffect(() => () => dirtyCallback.current?.(false), []);
  useEffect(() => {
    if (!dirty) return;
    const leave = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => { controller.activate(); controller.load(); return controller.dispose; }, [controller]);
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(tick); }, []);
  useEffect(() => {
    if (state.status !== 'ready' || state.busy || state.uncertain || !state.data) return;
    const due = state.data.fixtures.filter(f => !f.kickedOff && Date.parse(f.commenceTime) <= now && !checkedKickoffs.has(`${state.data.season}/${state.data.week}/${f.eventId}`));
    if (!due.length) return;
    for (const f of due) checkedKickoffs.add(`${state.data.season}/${state.data.week}/${f.eventId}`);
    // One shared read at each crossed kickoff updates pending/unscored/reveal state; no provider refresh or polling.
    controller.load({ pinned: true });
  }, [controller, checkedKickoffs, state, now]);
  useEffect(() => { setSelected(null); }, [accountId, state.data?.season, state.data?.week]);
  return <GuessList id={id} state={state} now={now} selected={selected} onSelect={setSelected} onEdit={controller.edit} onSave={controller.save}
    onReload={() => controller.load({ pinned: true })} onWeek={week => controller.load(week)} onNavigate={onNavigate} guardNavigation={!onDirtyChange}/>;
}
