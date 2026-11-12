// NBA's two sheets (milestone N1; mockups 06 and 08). Track bet: the BetEditor as a shell sheet, its unsaved draft held
// by the shell's dirty registry (tab, Back, sport change and reload all ask before it is lost). Confirm result: one tap
// saves an ordinary audited correction through the existing /nba/save with the reason "Confirmed from final score";
// nothing is written automatically, and the stored price is sent back exactly as stored (D-23).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShell } from '../shell/context.js';
import { useSportGuard } from '../../sportNavigation.js';
import { Button, Card, Icon, Pill, Sheet } from '../ui/index.js';
import { formatNbaPrice, nbaConfirmReason, nbaOvertime } from '../../../../shared/nba-grade.mjs';
import { normalizeNbaTicket } from '../../../../shared/nba-bets.mjs';
import { BetEditor } from './BetEditor.jsx';
import { NbaMatchup } from './NbaMatchup.jsx';
import { nbaApi } from './api.js';
import { displayUnits, recoverOperation } from './route.js';
import { noteNbaSaved } from './useNbaData.js';
import { legSelection, resultWord, signedUnits } from './NbaScreens.jsx';

const DIRTY_KEY = 'nba-ticket';

/** The shell's dirty registry when there is a shell (one confirm for tab, Back, sport and reload); else the sport guard. */
function useDraftGuard(shell) {
  const [dirty, setDirtyState] = useState(false);
  useSportGuard(!shell && dirty);
  const set = useCallback(value => { setDirtyState(value); shell?.setDirty(DIRTY_KEY, value); }, [shell]);
  useEffect(() => () => shell?.setDirty(DIRTY_KEY, false), [shell]);
  return set;
}

export function NbaTrackSheet({ args, api = nbaApi }) {
  const shell = useShell();
  const setDirty = useDraftGuard(shell);
  const editing = Boolean(args.ticket);
  const key = useRef(args.ticket?.id ?? crypto.randomUUID()).current;
  return <Sheet title={editing ? 'Edit NBA ticket' : 'Track NBA bet'} tall onClose={shell.closeTop} className="gx-nba-sheet">
    <BetEditor key={key} ticket={args.ticket ?? null} game={args.game} selectedDate={args.selectedDate} api={api} onDirty={setDirty}
      onCancel={shell.closeTop}
      onSaved={() => { setDirty(false); noteNbaSaved(); shell.closeSheet(); shell.toast('NBA ticket saved.'); }}/>
  </Sheet>;
}

/** The ticket's terms as /nba/save takes them, with the stored price input unchanged (imported terms keep their odds). */
export function ticketTerms(ticket, outcome) {
  return { id: ticket.id, season: ticket.season, eventDate: ticket.eventDate, kind: ticket.kind, label: ticket.label,
    legs: ticket.legs.map(leg => Object.fromEntries(['gameId', 'matchup', 'market', 'team', 'side', 'line'].filter(name => leg[name] !== undefined && leg[name] !== null).map(name => [name, leg[name]]))),
    priceInput: ticket.priceInput ?? { format: 'american', value: ticket.odds }, stakeUnits: ticket.stakeUnits, outcome };
}

function FinalCard({ game }) {
  if (!game) return null;
  return <Card className="gx-nba-final">
    <div className="gx-nba-row"><NbaMatchup away={game.away.abbreviation} home={game.home.abbreviation} size={32}/><Pill>{nbaOvertime(game) ? 'Final · OT' : 'Final'}</Pill></div>
    <div className="gx-nba-score"><span><b>{game.away.abbreviation}</b> <strong>{game.awayScore}</strong></span><span><b>{game.home.abbreviation}</b> <strong>{game.homeScore}</strong></span></div>
    <p className="gx-nba-meta">Final · BALLDONTLIE (unofficial)</p>
  </Card>;
}

export function NbaConfirmSheet({ args, api = nbaApi }) {
  const shell = useShell();
  const setDirty = useDraftGuard(shell);
  const { suggestion } = args;
  const [ticket, setTicket] = useState(args.ticket);
  const [reason, setReason] = useState(() => nbaConfirmReason(suggestion));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [retry, setRetry] = useState(false);
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState(null);
  const operation = useRef(null), alive = useRef(true), request = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const outcome = suggestion?.outcome;
  let net = null;
  try { net = normalizeNbaTicket(ticketTerms(ticket, outcome)).netUnits; } catch { net = null; }
  const games = [...new Map((suggestion?.legs ?? []).map(leg => [leg.game?.id, leg.game])).values()].filter(Boolean);
  const done = saved => { setDirty(false); noteNbaSaved(); shell.closeSheet(); shell.toast(`Result saved · ${resultWord(saved?.outcome ?? outcome)}${saved?.netUnits ? ` · net ${displayUnits(saved.netUnits)} U` : ''}`); };
  async function save() {
    if (busy || !reason.trim() || (uncertain && !retry)) return;
    operation.current ||= { operationId: crypto.randomUUID(), ticket: ticketTerms(ticket, outcome), expectedRevision: ticket.revision, reason: reason.trim() };
    setBusy(true); setError(''); request.current = new AbortController();
    try { const result = await api('save', operation.current, { signal: request.current.signal }); if (alive.current) done(result.ticket); }
    catch (failure) {
      if (!alive.current) return;
      setUncertain(Boolean(failure.uncertain)); setRetry(false);
      if (failure.status === 409) { setConflict(true); setError('This ticket changed on another device. Your choice is kept.'); }
      else { setError(failure.uncertain ? 'We couldn’t confirm the save.' : `Couldn’t save. Your result and reason are kept. ${failure.message ?? ''}`.trim()); if (!failure.uncertain) operation.current = null; }
    } finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (busy) return; setBusy(true); setError(''); request.current = new AbortController();
    try {
      const saved = await recoverOperation(operation.current, api, { signal: request.current.signal });
      if (!alive.current) return;
      if (saved) done(saved);
      else { setRetry(true); setError('No matching receipt found. Retry sends the same result and operation ID.'); }
    } catch (failure) { if (alive.current) setError(`Could not check saved data. ${failure.message}`); }
    finally { if (alive.current) setBusy(false); }
  }
  async function loadLatest() {
    setBusy(true); request.current = new AbortController();
    try { const data = await api('read', { ticketId: ticket.id }, { signal: request.current.signal }); if (alive.current) setLatest(data.tickets[0] ?? null); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  const single = ticket.kind === 'single';
  return <Sheet title="Confirm result" onClose={shell.closeTop} className="gx-nba-sheet">
    <div className="gx-nba-stack gx-nba-confirm">
      <p className="gx-nba-strong">{ticket.label} · {formatNbaPrice(ticket.odds)} · {displayUnits(ticket.stakeUnits)} U</p>
      {games.map(game => <FinalCard key={game.id} game={game}/>)}
      {suggestion?.overtime ? <p className="gx-t-body">This game went to overtime. Most books count overtime for spreads and totals; check your ticket’s rules.</p> : null}
      <ul className="gx-nba-graded">{(suggestion?.legs ?? []).map((leg, index) => <li key={index}><span>{legSelection(ticket.legs[index])}{single && ticket.legs[index].market !== 'total' ? ` ${ticket.legs[index].market}` : ''}</span><Pill tone={leg.result === 'win' ? 'win' : leg.result === 'loss' ? 'loss' : 'neutral'}>{leg.result === 'win' ? 'Won' : leg.result === 'loss' ? 'Lost' : 'Push'}</Pill></li>)}</ul>
      <Card className="gx-nba-suggested"><p className="gx-nba-strong">Suggested: {resultWord(outcome)}{net ? ` · net ${signedUnits(net, 2)} U` : ''}</p><p className="gx-t-body">From the final score. Check it matches how your book settled the ticket.</p></Card>
      <label className="gx-nba-field">Reason<textarea maxLength={500} value={reason} disabled={busy || uncertain} onChange={event => { setReason(event.target.value); setDirty(true); }}/></label>
      {error ? <p role="alert" className="gx-nba-error">{error}</p> : null}
      {uncertain ? <Button icon="receipt" disabled={busy} onClick={recover}>Check saved ticket</Button> : null}
      {conflict ? <><Button disabled={busy} onClick={loadLatest}>Load latest saved ticket</Button>
        {latest ? <Card><p className="gx-t-body">Latest revision {latest.revision} · {resultWord(latest.outcome)}{latest.netUnits ? ` · net ${displayUnits(latest.netUnits)} U` : ''}</p>
          {latest.outcome === 'pending' ? <Button onClick={() => { setTicket(latest); operation.current = null; setConflict(false); setLatest(null); setError(''); }}>Reconcile my result with revision {latest.revision}</Button> : <p className="gx-t-body">This ticket already has a result.</p>}</Card> : null}</> : null}
      <Button variant="primary" block icon="check" disabled={busy || conflict || !reason.trim() || (uncertain && !retry)} onClick={save}>{busy ? 'Saving…' : retry ? 'Retry same save' : `Confirm ${resultWord(outcome)}`}</Button>
      <Button block disabled={busy} onClick={() => shell.replaceSheet('sh.nbaTrack', { ticket })}>Choose another result</Button>
    </div>
  </Sheet>;
}
