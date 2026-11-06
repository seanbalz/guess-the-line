// Exact native BetEditor body except its ordinary save label. Local Modal adds a preview banner; matchup display adds marks.
// Imports are isolated from SocialBetTracker's authenticated readers/actions. No network or storage writes.
import React,{useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,Lock,Plus,Trash2,Users,X} from 'lucide-react';
import {BookChoices,ChoiceButtons,MatchupChoices as NativeMatchupChoices,NumberChoices,SpreadChoices} from '../../web/src/BetEntryControls.jsx';
import {PlayerPropEntry as PlayerPropEntry} from '../../web/src/PlayerPropEntry.jsx';
import {Matchup} from '../../web/src/next/ui/Matchup.jsx';
import {cashToUnits,cashText,validUnitCash} from '../../web/src/trackedBetTerms.js';
const signed=value=>value>0?`+${value}`:value<0?`−${Math.abs(value)}`:'0';
const date=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
// Retain the native matchup change/search control, with full-name text options and separate logo tiles.
function MatchupChoices(props){const game=props.games.find(g=>g.id===props.value);return <div className="real-bets-editor-matchup">{game?<Matchup away={game.awayCode} home={game.homeCode} codes={false}/>:null}<NativeMatchupChoices {...props} games={props.games.map(g=>({...g,awayCode:g.away,homeCode:g.home}))}/></div>;}
const units = value => Number.isFinite(value) ? `${Number(value.toFixed(4))}u` : 'Unknown';
const number = value => Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString('en-US') : '—';
const american = value => Number.isFinite(value) ? (value > 0 ? `+${value}` : `−${Math.abs(value)}`) : 'Odds unknown';
const percent = value => Number.isFinite(value) ? `${number(value)}%` : '—';
const nullable = value => value === '' || value === undefined || value === null ? null : Number(value);
const iso = value => value ? new Date(value).toISOString() : null;
const localTime = value => { const parsed = value ? new Date(value) : new Date(); return Number.isNaN(parsed.valueOf()) ? '' : new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const emptyLeg = () => ({ gameId: '', market: 'spread', side: '', line: '', selection: '' });
const defaultFilters = { playerId: '', kind: '', market: '', outcome: '', origin: '', team: '', following: false, counts: 'all', includeParlays: true, includeTailed: true, includeTracked: true };

function Alert({ children }) { return children ? <p className="social-alert" role="alert">{children}</p> : null; }
// Redesign stage 21 (M-04; D-36 as amended by D-39): the server sends another player's spread or total leg without its line
// (`locked: true`) until this player locks in their Guess the Line pick for that game and market, sits it out, or the game
// kicks off. A locked leg shows a lock, never "—" or a number. The player's own slips always come back whole.
const legLabel = leg => leg.locked ? `${leg.selection || 'Line'} · line locked` : leg.selection || `${leg.side} ${leg.line ?? ''}`;
function Selection({ leg, games }) {
  const game = games.find(item => item.id === leg.gameId);
  const side = leg.side === 'home' ? game?.home : leg.side === 'away' ? game?.away : leg.side;
  const label = leg.selection || (leg.market === 'spread' ? `${side || 'Team'} ${signed(leg.line)}` : leg.market === 'total' ? `${side || 'Total'} ${leg.line ?? '—'}` : 'Player prop');
  const where = <small>{game ? `${game.away} @ ${game.home}` : `Matchup ${leg.gameId}`} · {leg.market}{game?.kickoff ? ` · ${date(game.kickoff)} PT` : ''}</small>;
  if (leg.locked) return <span className="social-selection social-selection-locked" data-locked="true"><strong><Lock size={16} aria-hidden="true"/>{leg.selection || side || 'Line'}<span className="social-locked-tag">Line locked</span></strong>{where}</span>;
  return <span className="social-selection"><strong>{label}</strong>{where}</span>;
}

function Modal({ title, onClose, busy, children }) {
  const ref = useRef(null), id = useId();
  useEffect(() => { const previous = document.activeElement; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="social-modal" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="social-modal-head"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Close editor" onClick={onClose} disabled={busy}><X size={22}/></button></div><p className="real-bets-editor-notice" role="status">VISUAL PREVIEW · NOTHING IS SAVED</p>{children}</dialog>;
}

function BetEditor({ unitCash, onUnitCash, entry, action, fromRecommendation, games, season, week, busy, error, recovery, unconfirmed, onSave, onClose, onDirty }) {
  const isTail = action === 'tail', isCorrect = action === 'correct';
  const selectionLocked = isTail || (isCorrect && Boolean(entry?.sourceEntryId));
  const [draft, setDraft] = useState(() => ({ kind: entry?.kind || 'single', origin: 'tracked', legs: entry?.legs?.map(leg => ({ ...leg, line: leg.line ?? '' })) || [emptyLeg()], odds: isTail ? '' : entry?.odds ?? '', stakeUnits: entry && !isTail ? entry.stakeUnits ?? '' : '', source: isTail ? '' : entry?.source || '', quotedAt: isTail ? '' : entry?.quotedAt ? localTime(entry.quotedAt) : '', placedAt: isTail ? localTime() : entry?.placedAt ? localTime(entry.placedAt) : '', countsForRecord: entry?.countsForRecord !== false, notes: isTail ? '' : entry?.notes || '', reason: '' }));
  const [cashMode,setCashMode]=useState(false), [cashStake,setCashStake]=useState(''), [cashUnit,setCashUnit]=useState(unitCash??'');
  const cashReady=!cashMode||cashToUnits(cashStake,cashUnit)!==null;
  const cashNote=cashMode?`${draft.notes.trim()} Cash tracking: ${cashText(Number(cashStake))} risked; 1U=${cashText(Number(cashUnit))}.`.trim():draft.notes.trim();
  const [confirmed, setConfirmed] = useState(false), [dirty, setDirty] = useState(false), [quoteTimeEdited, setQuoteTimeEdited] = useState(false);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const change = patch => { setDraft(value => ({ ...value, ...patch })); if (Object.hasOwn(patch, 'quotedAt')) setQuoteTimeEdited(true); setDirty(true); };
  const legChange = (index, patch) => change({ legs: draft.legs.map((leg, i) => i === index ? { ...leg, ...patch } : leg) });
  const close = () => { if (unconfirmed || !dirty || window.confirm('Discard your unsaved bet draft?')) onClose(); };
  const sourceLabel = typeof draft.source === 'string' ? draft.source : draft.source?.name || '';
  const selectionReady = selectionLocked || draft.legs.every(leg => games.some(game => game.id === leg.gameId) && (leg.market === 'prop'
    ? leg.side.trim() && leg.selection.trim().length >= 2
    : leg.side && leg.line !== '' && Number.isFinite(Number(leg.line))));
  const tailReady = !isTail || (draft.odds !== '' && draft.stakeUnits !== '' && sourceLabel.trim().length >= 2 && draft.quotedAt && draft.placedAt && confirmed);
  const ticketReady = !fromRecommendation || confirmed;
  const ticketDetails = <div className="social-ticket-detail-fields">
    <label>Quote observed (your local time)<input type="datetime-local" required={isTail} value={draft.quotedAt} disabled={busy} onChange={event => change({ quotedAt: event.target.value })}/><button className="social-entry-option" type="button" disabled={busy} onClick={() => change({ quotedAt: localTime() })}>Quote observed now</button></label>
    <label>Bet placed (your local time)<input type="datetime-local" required={isTail} value={draft.placedAt} disabled={busy} onChange={event => change({ placedAt: event.target.value })}/><button className="social-entry-option" type="button" disabled={busy} onClick={() => change({ placedAt: localTime() })}>Bet placed now</button></label>
    <label className="social-wide">Ticket notes (optional)<input maxLength={500} placeholder="Cash stake, payout, boost or missing details" value={draft.notes} disabled={busy} onChange={event => change({ notes: event.target.value })}/></label>
  </div>;
  async function submit(event) {
    event.preventDefault();
    if (busy || !selectionReady || !tailReady || !ticketReady || !cashReady) return;
    const body = { season, week, kind: draft.kind, origin: draft.origin, legs: draft.legs.map(({gameId,market,side,line,selection}) => ({gameId,market,side,line:nullable(line),selection})), odds: nullable(draft.odds), stakeUnits: nullable(draft.stakeUnits), source: sourceLabel.trim(), quotedAt: !isTail && entry?.quotedAt && !quoteTimeEdited ? entry.quotedAt : iso(draft.quotedAt), placedAt: iso(draft.placedAt), countsForRecord: draft.countsForRecord, notes: cashNote, ...(isCorrect ? { reason: draft.reason.trim() } : {}) };
    if (isTail) { delete body.kind; delete body.legs; }
    const saved=await onSave(body);
    if(saved&&cashMode)onUnitCash?.(Number(cashUnit));
  }
  return <Modal title={isTail ? `Tail ${entry.ownerName || 'this player'}` : isCorrect ? 'Correct saved bet' : fromRecommendation ? 'Review recommended bet' : 'Add a tracked bet'} onClose={close} busy={busy && !unconfirmed}>
    <form className="social-form" onSubmit={submit}>
      <p className="social-audience"><Users size={18}/>Visible to all signed-in players. Counts toward records by default.</p>
      <p className="social-help">Save a bet you placed elsewhere. This records your selection; it does not place a wager or move money.</p>
      {fromRecommendation && <p className="social-help">The recommendation’s quote is filled in for review. Check the selection, price and book against your actual ticket. Your stake and placement time are not assumed.</p>}
      <Alert>{error}</Alert>{recovery}
      {selectionLocked ? <div className="social-tail-source"><strong>{isTail ? 'Original selection' : 'Saved tailed selections'}</strong>{draft.legs.map((leg, index) => <Selection key={index} leg={leg} games={games}/>)}<p>{isTail ? `Original price: ${american(entry.odds)}. Choose your own confirmed price and stake below. Original terms are not copied into your return.` : 'A tailed ticket keeps its original selections. You can correct your own saved stake, price and source below.'}</p>{entry.notes && <p>Original ticket note: {entry.notes}</p>}</div> : <>
        <ChoiceButtons label="Bet type" options={[{ value: 'single', label: 'Single' }, { value: 'parlay', label: 'Parlay' }]} value={draft.kind} disabled={busy || isCorrect} onChange={kind => change({ kind, legs: kind === 'single' ? draft.legs.slice(0, 1) : draft.legs.length > 1 ? draft.legs : [...draft.legs, emptyLeg()] })}/>
        {draft.legs.map((leg, index) => {
          const game = games.find(item => item.id === leg.gameId);
          return <fieldset className="social-leg-editor" key={index}><legend>{draft.kind === 'parlay' ? `Leg ${index + 1}` : 'Selection'}</legend><div className="social-ticket-detail-fields">
            <MatchupChoices games={games} value={leg.gameId} disabled={busy} onChange={gameId => legChange(index, { gameId, side: '', line: '', selection: '', propFields: undefined, customProp: false })}/>
            {game && <>
              <ChoiceButtons label="Market" options={[{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }, { value: 'prop', label: 'Player prop' }]} value={leg.market} disabled={busy} onChange={market => legChange(index, { market, side: '', selection: '', line: '', propFields: undefined, customProp: false })}/>
              {leg.market !== 'prop' && <ChoiceButtons label={leg.market === 'spread' ? 'Team' : 'Direction'} options={leg.market === 'spread' ? [{ value: 'away', label: game.away }, { value: 'home', label: game.home }] : [{ value: 'over', label: 'Over' }, { value: 'under', label: 'Under' }]} value={leg.side} disabled={busy} onChange={side => legChange(index, { side })}/>}
              {leg.market === 'spread' ? <SpreadChoices value={leg.line} disabled={busy} onChange={line => legChange(index, { line })}/> : leg.market === 'total' ? <NumberChoices label="Exact total" value={leg.line} onChange={line => legChange(index, { line })} presets={[37.5, 40.5, 42.5, 44.5, 47.5, 49.5, 51.5, 54.5]} disabled={busy} required step="0.5" min={0} max={200} adjust="total"/> : <PlayerPropEntry leg={leg} game={game} season={season} week={week} disabled={busy} onChange={next=>legChange(index,next)}/>}
            </>}
          </div>{draft.kind === 'parlay' && draft.legs.length > 2 && <button type="button" className="text-button" disabled={busy} onClick={() => change({ legs: draft.legs.filter((_, i) => i !== index) })}><Trash2 size={16}/>Remove leg {index + 1}</button>}</fieldset>;
        })}
        {draft.kind === 'parlay' && <button type="button" className="secondary" disabled={busy || draft.legs.length >= 20} onClick={() => change({ legs: [...draft.legs, emptyLeg()] })}><Plus size={18}/>Add parlay leg</button>}
      </>}
      <p className="social-help">Choose the exact terms on your ticket. These shortcuts are not sportsbook quotes.</p>
      <NumberChoices label={draft.kind === 'parlay' ? 'Combined American odds' : 'American odds'} presets={draft.kind === 'parlay' ? [150, 200, 300, 400, 500, 1000, 1400, 2100] : [-120, -115, -110, -105, 100, 110, 120, 150, 200]} format={american} value={draft.odds} onChange={odds => change({ odds })} disabled={busy} required={isTail} allowUnknown={!isTail}/>
      <ChoiceButtons label="Stake entry" value={cashMode?'cash':'units'} options={[{value:'units',label:'Units'},{value:'cash',label:'Cash ($)'}]} disabled={busy} onChange={value=>{setCashMode(value==='cash');if(value==='cash'&&draft.stakeUnits!==''&&validUnitCash(cashUnit)){setCashStake(String(Math.round(Number(draft.stakeUnits)*Number(cashUnit)*100)/100));}setDirty(true);}}/>
      {cashMode?<div className="social-cash-entry"><label>Cash stake ($)<input type="number" inputMode="decimal" min="0.01" step="0.01" required value={cashStake} disabled={busy} onChange={e=>{setCashStake(e.target.value);change({stakeUnits:cashToUnits(e.target.value,cashUnit)??''});}}/></label><label>Cash value of 1U ($)<input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={cashUnit} disabled={busy} onChange={e=>{setCashUnit(e.target.value);change({stakeUnits:cashToUnits(cashStake,e.target.value)??''});}}/></label><output aria-live="polite">{cashReady?`${units(Number(draft.stakeUnits))} risked`:'Enter cash and your unit value. The conversion must preserve the cash amount to the cent.'}</output></div>:<NumberChoices label="Units risked" presets={[0.5, 1, 1.5, 2, 2.5, 3]} format={units} value={draft.stakeUnits} onChange={stakeUnits => change({ stakeUnits })} disabled={busy} required={isTail} allowUnknown={!isTail} step="0.0001" min={0.0001} max={10000}/>}
      {cashMode&&cashNote.length>500&&<p className="social-help">Shorten the note to leave room for the cash conversion.</p>}
      <BookChoices value={sourceLabel} onChange={source => change({ source })} disabled={busy} required={isTail}/>
      {isTail ? ticketDetails : <details className="social-ticket-details" open={isCorrect || undefined}><summary>Ticket details (optional)</summary>{ticketDetails}</details>}
      {!isTail && <p className="social-help">Leave unavailable odds, units and times blank. Unknown prices never become −110, and incomplete returns stay out of ROI. A parlay is one bet and one stake.</p>}
      {isCorrect && <label>Reason for correction<input required minLength={3} maxLength={300} value={draft.reason} disabled={busy} onChange={event => change({ reason: event.target.value })}/></label>}
      <label className="social-check"><input type="checkbox" checked={draft.countsForRecord} disabled={busy} onChange={event => change({ countsForRecord: event.target.checked })}/><span>Include in my records and Unit Betting qualification</span></label>
      {isTail && <label className="social-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }}/><span>I reviewed my own price, source, quote time and stake. These terms may differ from the original bet.</span></label>}
      {fromRecommendation && <label className="social-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }}/><span>I placed this bet elsewhere and checked these ticket terms.</span></label>}
      {!selectionReady && <p className="social-help">Choose a matchup and complete each selection.</p>}
      <div className="social-form-footer"><button className="primary" disabled={busy || !games.length || !selectionReady || !tailReady || !ticketReady || !cashReady || (cashMode&&cashNote.length>500)}><Check size={18}/>{unconfirmed ? 'Save awaiting confirmation' : busy ? 'Saving…' : isTail ? 'Save my tailed bet' : isCorrect ? 'Save correction' : 'Preview tracked ticket'}</button><button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button></div>
    </form>
  </Modal>;
}

export {BetEditor};
