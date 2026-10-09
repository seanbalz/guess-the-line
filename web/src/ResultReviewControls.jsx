import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { cloudApi, date } from './api';
import './resultReview.css';

const emptyFields = result => ({ home: result?.home == null ? '' : String(result.home), away: result?.away == null ? '' : String(result.away), source: result?.source || '', sourceURL: result?.sourceURL || '', observedAt: '', reason: '' });
function sourceURL(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/\s/.test(value) ? url.href : null; } catch { return null; } }
function validate(fields, game, now) {
  if (!game || !Number.isFinite(Date.parse(game.kickoff)) || now <= Date.parse(game.kickoff)) return 'Final-result review opens after this matchup’s scheduled kickoff. A kickoff time is not evidence that the game is final.';
  if (![fields.home, fields.away].every(value => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 200)) return 'Enter integer final scores from 0 to 200 for both teams.';
  if (!sourceURL(fields.sourceURL) || fields.sourceURL.length > 2048) return 'Use an HTTPS source URL without a username, password or spaces.';
  if (fields.source.trim().length < 2 || fields.source.length > 120) return 'Name the source of the final score.';
  const observed = Date.parse(fields.observedAt);
  if (!Number.isFinite(observed) || observed <= Date.parse(game.kickoff) || observed > now) return 'The final score observation must be after scheduled kickoff and no later than now.';
  if (fields.reason.trim().length < 5 || fields.reason.length > 500) return 'Describe what you reviewed, or why the prior result needs correcting, in 5 to 500 characters.';
  return null;
}
function FinalReview({ game, review, currentVersion, busy, error, onBack, onConfirm }) {
  const ref = useRef(null), title = useId();
  const changed = currentVersion !== review.body.expectedVersion || game.kickoff !== review.kickoff;
  useEffect(() => { const previous = document.activeElement; ref.current.showModal(); ref.current.querySelector('[data-initial-focus]')?.focus(); return () => previous?.focus(); }, []);
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const targets = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const first = targets[0], last = targets.at(-1);
    if (!first) { event.preventDefault(); ref.current.focus(); }
    else if (!targets.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={ref} className="modal result-final-dialog" aria-labelledby={title} onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); if (!busy) onBack(); }}>
    <div className="modal-heading"><h2 id={title} tabIndex={-1} data-initial-focus>{review.body.expectedVersion ? 'Confirm corrected final result' : 'Confirm final result'}</h2><button type="button" className="icon-button" aria-label="Close final-result review" disabled={busy} onClick={onBack}><X size={20}/></button></div>
    <div className="callout"><ShieldCheck size={19}/><p>This records a commissioner-reported ordinary final score. It is not independently verified. Eligible immutable Challenge selections will be graded against this result. No cancellation, void, postponement or pending-game ruling is made.</p></div>
    <dl className="result-review-details"><div><dt>Away · {game.away}</dt><dd>{review.body.away}</dd></div><div><dt>Home · {game.home}</dt><dd>{review.body.home}</dd></div><div><dt>Result version</dt><dd>{review.body.expectedVersion ? `${review.body.expectedVersion} → ${review.body.expectedVersion + 1} · Prior version retained in the audit` : 'First recorded final'}</dd></div><div><dt>Source</dt><dd>{review.body.source}<br/>{review.body.sourceURL}</dd></div><div><dt>Final observed</dt><dd>{date(review.body.observedAt)} PT<br/>{review.body.observedAt}</dd></div><div><dt>Review reason</dt><dd>{review.body.reason}</dd></div></dl>
    {(error || changed) && <p className="form-error" role="alert">{changed ? 'This result or its schedule changed while the review was open. Return to the form and review the latest version.' : error}</p>}
    <div className="review-actions"><button type="button" className="secondary" disabled={busy} onClick={onBack}>Keep editing</button><button type="button" className="primary" disabled={busy || changed} onClick={onConfirm}>{busy ? 'Recording final…' : 'Confirm commissioner-reported final'}<Check size={17}/></button></div>
  </dialog>;
}
export default function ResultReviewControls({ data, onReviewed }) {
  if (!data?.resultReview) return null;
  return <ResultForm key={`${data.league.season}/${data.league.week}`} data={data} onReviewed={onReviewed}/>;
}
function ResultForm({ data, onReviewed }) {
  const first = data.games[0]?.id || '', [gameId, setGameId] = useState(first);
  const game = data.games.find(item => item.id === gameId), existing = data.resultReview.games?.[gameId], version = existing?.version || 0;
  const [fields, setFields] = useState(() => emptyFields(data.resultReview.games?.[first])), [confirmed, setConfirmed] = useState(false), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(null), [success, setSuccess] = useState(null), [refreshNote, setRefreshNote] = useState('');
  const [tick, setTick] = useState(0), id = useId(), request = useRef(null), inFlight = useRef(false), clock = useRef({ at:Date.parse(data.now), start:Date.now() });
  useEffect(() => { clock.current={at:Date.parse(data.now),start:Date.now()}; }, [data.now]);
  useEffect(() => { const timer=setInterval(()=>setTick(value=>value+1),30000); return ()=>clearInterval(timer); }, []);
  const now = () => clock.current.at + Date.now() - clock.current.start;
  const available = data.resultReview.available === true, afterKickoff = game && Number.isFinite(now()) && now() > Date.parse(game.kickoff);
  const currentVersion = success?.gameId === gameId ? Math.max(version, success.version) : version;
  // A concurrency failure never silently rebases a correction on a new result.
  const conflictResolved = conflict && version !== conflict.expectedVersion && available;
  function change(name, value) { if(inFlight.current)return; setFields(current=>({...current,[name]:value})); setConfirmed(false); setError(''); request.current=null; }
  function choose(value) { if(inFlight.current)return; setGameId(value); setFields(emptyFields(data.resultReview.games?.[value])); setConfirmed(false); setReview(null); setConflict(null); setError(''); request.current=null; setRefreshNote(''); }
  function prepare(event) {
    event.preventDefault(); if(busy || !available || !confirmed || conflict || !afterKickoff)return;
    const invalid=validate(fields,game,now()); if(invalid){setError(invalid);return;}
    const body={season:data.league.season,week:data.league.week,gameId:game.id,home:Number(fields.home),away:Number(fields.away),source:fields.source.trim(),sourceURL:sourceURL(fields.sourceURL),observedAt:new Date(fields.observedAt).toISOString(),expectedVersion:currentVersion,reason:fields.reason.trim()};
    const signature=JSON.stringify(body);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
    setError('');setReview({body:{...body,requestId:request.current.id},kickoff:game.kickoff});
  }
  async function refresh() {
    if(refreshing || busy)return;setRefreshing(true);setRefreshNote('');
    try{const result=await onReviewed?.();if(result===false)throw Error();setRefreshNote('Refresh requested. Check the current result and version below before making a correction.');}
    catch{setRefreshNote(success?'Your final result was saved. The result display could not refresh; try Refresh results.':'The latest results could not be loaded. Try Refresh results again.');}
    finally{setRefreshing(false);}
  }
  async function submit() {
    if(inFlight.current || !review || !available || currentVersion!==review.body.expectedVersion || game.kickoff!==review.kickoff)return;
    const invalid=validate({...review.body,home:String(review.body.home),away:String(review.body.away)},game,now());if(invalid){setError(invalid);return;}
    inFlight.current=true;setBusy(true);setError('');
    try {
      const result=await cloudApi('results/review',review.body);
      if(result?.status!=='final' || result.season!==review.body.season || result.week!==review.body.week || result.gameId!==review.body.gameId || result.version!==review.body.expectedVersion+1)throw Error('The service did not confirm this exact result. Retry to check the same review request.');
      setSuccess(result);setReview(null);setConfirmed(false);setConflict(null);request.current=null;
      // This second operation cannot turn an acknowledged write into a failure.
      try { const refreshed=await onReviewed?.();if(refreshed===false)throw Error();setRefreshNote('Refresh requested. The saved result receipt above confirms the write.'); }
      catch { setRefreshNote('Your final result was saved. The result display could not refresh; try Refresh results.'); }
    } catch(failure) {
      setError(failure.message || 'The result could not be confirmed. Retry this review request.');
      if(failure.status===409){setConflict({expectedVersion:review.body.expectedVersion});setReview(null);}
    } finally {inFlight.current=false;setBusy(false);}
  }
  return <section className="panel result-review-controls" aria-labelledby={`${id}-title`}><div className="panel-heading"><div><h2 id={`${id}-title`}>Commissioner final-result review</h2><p>Week {data.league.week} · Canonical slate · Ordinary final scores only</p></div><ShieldCheck size={20}/></div><div className="result-review-body">
    <p>Record a sourced final score or correct an earlier version. This is commissioner-reported evidence, not independently verified results. Earlier versions and selections remain in the audit.</p>
    {success && <div className="result-save-success" role="status"><strong>Final result saved · Version {success.version}</strong><p>{success.gameId} · {date(success.reviewedAt)} PT · Commissioner-reported, not independently verified.</p></div>}
    {!available ? <div className="callout" role="status"><TriangleAlert size={18}/><p>The reviewed-results service is unavailable. Result entry is disabled until a current read succeeds.</p></div> : <>
      <label className="result-game-select" htmlFor={`${id}-game`}>Matchup<select id={`${id}-game`} value={gameId} disabled={busy} onChange={event=>choose(event.target.value)}>{data.games.map(item=><option key={item.id} value={item.id}>{item.awayCode} at {item.homeCode}</option>)}</select></label>
      {existing && <div className="current-reviewed-result"><h3>Currently recorded · Version {version}</h3><p>{game?.awayCode} {existing.away} · {game?.homeCode} {existing.home}</p><p>{existing.source} · Observed {date(existing.observedAt)} PT · Reviewed {date(existing.reviewedAt)} PT</p>{sourceURL(existing.sourceURL)&&<a href={existing.sourceURL} target="_blank" rel="noreferrer">Open recorded final-score source</a>}</div>}
      {!afterKickoff && <p className="result-review-warning">Review opens after scheduled kickoff: {date(game?.kickoff)} PT. You must separately confirm the game finished.</p>}
      {conflict && <div className="result-review-conflict" role="alert"><p>{error || 'This result changed. Refresh the current version before correcting it.'}</p>{conflictResolved ? <button className="secondary" onClick={()=>{setConflict(null);setError('');setConfirmed(false);request.current=null;}}>Use version {version} for a new review</button> : <p>Refresh results to load the changed version. Your proposed scores remain in the form.</p>}</div>}
      <form className="result-review-form" onSubmit={prepare}><fieldset disabled={busy || !afterKickoff}><legend>Proposed final score</legend><div className="result-score-fields"><label htmlFor={`${id}-away`}>Away · {game?.away}<input id={`${id}-away`} type="number" inputMode="numeric" min="0" max="200" step="1" required value={fields.away} onChange={event=>change('away',event.target.value)}/></label><label htmlFor={`${id}-home`}>Home · {game?.home}<input id={`${id}-home`} type="number" inputMode="numeric" min="0" max="200" step="1" required value={fields.home} onChange={event=>change('home',event.target.value)}/></label></div>
      <label htmlFor={`${id}-source`}>Final-score source name<input id={`${id}-source`} required minLength="2" maxLength="120" value={fields.source} onChange={event=>change('source',event.target.value)} placeholder="Source you checked"/></label><label htmlFor={`${id}-url`}>Final-score source URL · HTTPS<input id={`${id}-url`} type="url" required maxLength="2048" value={fields.sourceURL} onChange={event=>change('sourceURL',event.target.value)} placeholder="https://…"/></label><label htmlFor={`${id}-observed`}>Final observed · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input id={`${id}-observed`} type="datetime-local" required step="1" value={fields.observedAt} onChange={event=>change('observedAt',event.target.value)}/></label><label htmlFor={`${id}-reason`}>Review or correction reason<textarea id={`${id}-reason`} required minLength="5" maxLength="500" rows="3" value={fields.reason} onChange={event=>change('reason',event.target.value)} placeholder="Describe the final-score evidence or correction"/></label>
      <label className="result-final-assertion"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>I checked the named source and confirm this is the completed game’s ordinary final score, not a live, cancelled, postponed or unresolved result.</span></label>
      </fieldset>{error&&!conflict&&!review&&<p className="form-error" role="alert">{error}</p>}<button type="submit" className="primary" disabled={busy || !afterKickoff || !confirmed || !!conflict}>Review {currentVersion ? 'corrected ' : ''}final result</button></form>
    </>}
    <div className="result-refresh"><button type="button" className="secondary" disabled={busy||refreshing} onClick={refresh}><RefreshCw size={16}/>{refreshing?'Refreshing…':'Refresh results'}</button>{refreshNote&&<p role="status">{refreshNote}</p>}</div>
    {review&&<FinalReview game={game} review={review} currentVersion={currentVersion} busy={busy} error={error} onBack={()=>{if(!busy)setReview(null)}} onConfirm={submit}/>}
  </div></section>;
}
