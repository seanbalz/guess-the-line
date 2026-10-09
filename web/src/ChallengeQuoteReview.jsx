import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, LockKeyhole } from 'lucide-react';
import { date, fmt, signed } from './api';
import { validateChallengeQuote } from './challengeReview';

export default function ChallengeQuoteReview({ game, data, onClose, onSave, busy, error, Modal }) {
  const [market, setMarket] = useState(data.marketAccess.spread ? 'spread' : 'total'), [side, setSide] = useState(data.marketAccess.spread ? 'home' : 'over');
  const [fields, setFields] = useState({ line: '', odds: '', source: '', quotedAt: '' }), [receipt, setReceipt] = useState(null), [review, setReview] = useState(null), [localError, setLocalError] = useState(''), [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0), clock = useRef({ now: Date.parse(data.now), start: Date.now() }), lock = useRef(false);
  useEffect(() => { const timer = setInterval(() => setTick(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const now = () => clock.current.now + Date.now() - clock.current.start;
  const disabled = busy || pending;
  const receipts = (game.quoteReceipts || []).filter(item => data.marketAccess[item.market] && Date.parse(item.expiresAt) > now());
  const staleReceipt = receipt && Date.parse(receipt.expiresAt) <= now();
  const changedReceipt = receipt && !(game.quoteReceipts || []).some(item => item.snapshotId === receipt.snapshotId && item.book === receipt.book && item.market === receipt.market && item.side === receipt.side && item.line === receipt.line && item.odds === receipt.odds && item.quotedAt === receipt.quotedAt);
  function edit(name, value) { setFields(current => ({ ...current, [name]: value })); setReceipt(null); setLocalError(''); }
  function chooseReceipt(item) {
    const parsed = new Date(item.quotedAt);
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    setMarket(item.market); setSide(item.side); setFields({ line: String(item.line), odds: String(item.odds), source: item.source, quotedAt: local }); setReceipt(item); setLocalError('');
  }
  function openReview(event) {
    event.preventDefault(); if (disabled) return;
    const candidate = { market, side, line: Number(fields.line), odds: Number(fields.odds), source: fields.source.trim(), quotedAt: receipt?.quotedAt || (Number.isFinite(Date.parse(fields.quotedAt)) ? new Date(fields.quotedAt).toISOString() : '') };
    const failure = validateChallengeQuote(candidate, game.kickoff, now()) || (staleReceipt || changedReceipt ? 'This collected quote is now stale. Choose a fresh quote or edit and verify a new manual quote.' : null);
    if (failure) { setLocalError(failure); return; }
    setLocalError(''); setReview(candidate);
  }
  async function confirm() {
    if (disabled || lock.current || !review) return;
    const failure = validateChallengeQuote(review, game.kickoff, now()) || (staleReceipt || changedReceipt ? 'This collected quote changed age while you reviewed it. Return to the quote and choose a fresh reference.' : null);
    if (failure) { setLocalError(failure); return; }
    lock.current = true; setPending(true); setLocalError('');
    try { await onSave({ ...review, ...(receipt ? { quoteReceipt: receipt } : {}) }); } finally { lock.current = false; setPending(false); }
  }
  const sideLabel = value => value.market === 'spread' ? value.side === 'home' ? game.home : game.away : value.side === 'over' ? 'Over' : 'Under';
  const reviewError = review && (validateChallengeQuote(review, game.kickoff, now()) || (staleReceipt || changedReceipt ? 'The collected reference is stale. Return to the quote before confirming.' : null));
  return <Modal title={review ? `Review ${game.awayCode} at ${game.homeCode}` : `${game.awayCode} at ${game.homeCode}`} className="quote-review" onClose={() => { if (!disabled) onClose(); }}>
    {review ? <>
      <div className="callout"><LockKeyhole size={18}/><p>This records one immutable Challenge selection. {data.selectionScope === 'weekly' && 'It is reused in every group for this week. '}It cannot be edited or replaced. No wager is placed.</p></div>
      <dl><div><dt>Market and side</dt><dd>{review.market === 'spread' ? 'Spread' : 'Total'} · {sideLabel(review)}</dd></div><div><dt>Selected line</dt><dd className="mono">{review.market === 'total' ? fmt(review.line) : signed(review.line)}</dd></div><div><dt>American odds</dt><dd className="mono">{signed(review.odds)}</dd></div><div><dt>Named quote source</dt><dd>{review.source}</dd></div><div><dt>Quote observation</dt><dd>{date(review.quotedAt)} PT<br/>{review.quotedAt}</dd></div><div><dt>Scheduled kickoff / selection deadline</dt><dd>{date(game.kickoff)} PT</dd></div><div><dt>Save state</dt><dd>Not recorded until confirmation</dd></div></dl>
      {receipt && <p className="quote-review-source">Prefilled from {receipt.book} · collected {date(receipt.collectedAt)} PT. Provider observation is not a sportsbook execution guarantee. Confirmation checks the latest saved provider observation again and preserves its source receipt. A changed or expired quote requires another review.</p>}
      <p className="muted">Confirm these are the exact side and price you intend to record. A guess-to-market gap is not a betting recommendation.</p>
      {(localError || reviewError || error) && <p className="form-error" role="alert">{localError || reviewError || error}</p>}
      <div className="review-actions"><button type="button" className="secondary" data-initial-focus disabled={disabled} onClick={() => { setReview(null); setLocalError(''); }}><ArrowLeft size={16}/>Edit quote</button><button type="button" className="primary" disabled={disabled || !!reviewError} onClick={confirm}>{disabled ? 'Recording…' : 'Confirm immutable selection'}<Check size={17}/></button></div>
    </> : <>
      <p className="muted">Record the selected team’s spread or the total exactly as quoted. Review the source and price before the final confirmation. {data.selectionScope === 'weekly' && 'The selection is reused across all your groups for this week.'}</p>
      {receipts.length > 0 && <details className="collected-quote-options"><summary>Use a collected named-book quote</summary><p>Fresh saved observations only. These are not model suggestions or guaranteed executable prices.</p>{receipts.map(item => <button className="secondary" key={`${item.snapshotId}:${item.book}:${item.market}:${item.side}`} disabled={disabled} onClick={() => chooseReceipt(item)}>{item.source} · {sideLabel(item)} {item.market === 'spread' ? signed(item.line) : fmt(item.line)} ({signed(item.odds)})</button>)}</details>}
      <form className="bet-form" onSubmit={openReview}><div className="form-two"><label>Market<select value={market} disabled={disabled} onChange={event => { setMarket(event.target.value); setSide(event.target.value === 'spread' ? 'home' : 'over'); setReceipt(null); }}><option value="spread" disabled={!data.marketAccess.spread}>Point spread{!data.marketAccess.spread ? ' · ballot required' : ''}</option><option value="total" disabled={!data.marketAccess.total}>Game total{!data.marketAccess.total ? ' · ballot required' : ''}</option></select></label><label>Your side<select value={side} disabled={disabled} onChange={event => { setSide(event.target.value); setReceipt(null); }}>{market === 'spread' ? <><option value="home">{game.home}</option><option value="away">{game.away}</option></> : <><option value="over">Over</option><option value="under">Under</option></>}</select></label></div>
        <div className="form-two"><label>{market === 'spread' ? 'Selected team’s spread' : 'Quoted total'}<input name="line" type="number" inputMode="decimal" required step="0.5" min={market === 'total' ? 0 : -100} max={market === 'total' ? 200 : 100} value={fields.line} disabled={disabled} onChange={event => edit('line', event.target.value)} placeholder={market === 'spread' ? 'Signed line' : 'Combined points'}/></label><label>American odds<input name="odds" type="number" inputMode="decimal" required step="1" value={fields.odds} disabled={disabled} onChange={event => edit('odds', event.target.value)} placeholder="Enter quoted odds"/></label></div>
        <label>Quote source<input name="source" required minLength={2} maxLength={120} value={fields.source} disabled={disabled} onChange={event => edit('source', event.target.value)} placeholder="Name of sportsbook or authorized source"/></label><label>Quote timestamp · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input name="quotedAt" required type="datetime-local" step="1" value={fields.quotedAt} disabled={disabled} onChange={event => edit('quotedAt', event.target.value)}/></label>
        <div className="callout"><Clock3 size={17}/><p>Manual quotes must be from the last six hours and before kickoff. Collected quote prefills expire after their freshness window. Availability is checked again when you confirm.</p></div>
        {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}<button className="primary" disabled={disabled} type="submit">Review selection <ArrowLeft size={17} style={{transform:'rotate(180deg)'}}/></button>
      </form>
    </>}
  </Modal>;
}
