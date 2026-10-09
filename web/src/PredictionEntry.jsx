import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, LockKeyhole, Search, LoaderCircle } from 'lucide-react';
import { date, fmt, signed } from './api';
import { ReferenceValue, CurrentConsensus } from './ScoringReference';
import { submissionTimeScoring } from './scoringReferences';
import { TeamMatchup } from './TeamIdentity';
import ChipPicker from './ChipPicker';
import TeamFacts from './TeamFacts';
import { draftFromGames, draftScope, mergeDraft, readDraft, writeDraft, removeDraft } from './predictionDraft';
import './predictionReview.css';

export default function PredictionEntry({ data, save, busy, conflict, onDirty, error, go, Modal, SourceNote, benchmark }) {
  const scope = draftScope(data), total = data.mode === 'guess_total', submitted = !!data.submittedAt, timestamped = submissionTimeScoring(data), closed = !!data.locked;
  const [draft, setDraft] = useState(() => draftFromGames(data.games)), [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const [dirty, setDirty] = useState(false), [review, setReview] = useState(false), [saving, setSaving] = useState(false), [fieldConflicts, setFieldConflicts] = useState({});
  const [activeRow, setActiveRow] = useState(null), [navigationMessage, setNavigationMessage] = useState('');
  const [recovery, setRecovery] = useState(() => !closed && readDraft(scope, data.games)), [storageAvailable, setStorageAvailable] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine), [savedAt, setSavedAt] = useState(data.audit?.[0]?.timestamp || data.submittedAt || null);
  const baseline = useRef(draftFromGames(data.games)), current = useRef(draft), pickers = useRef({}), savingRef = useRef(false), reviewButton = useRef(null);
  current.current = draft;
  const valid = value => value !== '' && Number.isFinite(Number(value)) && Number(value) * 2 === Math.round(Number(value) * 2) && Number(value) >= (total ? 0 : -100) && Number(value) <= (total ? 200 : 100);
  const filled = data.games.filter(game => valid(draft[game.id])).length, complete = filled === data.games.length && filled > 0;
  const invalid = Object.values(draft).some(value => value !== '' && !valid(value));
  const conflicts = Object.keys(fieldConflicts).length;
  useEffect(() => {
    const saved = draftFromGames(data.games);
    const merged = closed ? { draft: saved, conflicts: {} } : mergeDraft(baseline.current, current.current, saved);
    setDraft(merged.draft); setFieldConflicts(old => ({ ...old, ...merged.conflicts })); baseline.current = saved;
    if (closed) { setDirty(false); setReview(false); setRecovery(null); setFieldConflicts({}); removeDraft(scope); }
    if (data.audit?.[0]?.timestamp) setSavedAt(data.audit[0].timestamp);
  }, [data.games, closed, scope]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change); window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    const handler = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function update(next) { setDraft(next); setDirty(true); setRecovery(null); setNavigationMessage(''); setStorageAvailable(writeDraft(scope, next, baseline.current)); }
  function change(id, value) { if (!closed && !savingRef.current) update({ ...current.current, [id]: value }); }
  function resolve(id, value) { update({ ...current.current, [id]: value }); setFieldConflicts(old => { const next = { ...old }; delete next[id]; return next; }); }
  function restore() { const next = mergeDraft(recovery.base, recovery.draft, baseline.current); setFieldConflicts(next.conflicts); update(next.draft); }
  async function persist(submit) {
    if (savingRef.current || busy || closed || conflicts || conflict || !online || invalid || submit && !complete) return;
    savingRef.current = true; setSaving(true);
    try {
      const picks = Object.fromEntries(Object.entries(current.current).filter(([, value]) => value !== '').map(([id, value]) => [id, Number(value)]));
      if (await save('ballot', { picks, submit })) { baseline.current = { ...current.current }; setDirty(false); setReview(false); setSavedAt(new Date().toISOString()); removeDraft(scope); }
    } finally { savingRef.current = false; setSaving(false); }
  }
  const rows = data.games.filter(game => (!search || game.matchup.toLowerCase().includes(search.toLowerCase())) && (filter !== 'missing' || !valid(draft[game.id]) || activeRow === game.id));
  function nextGame(id) {
    const index = data.games.findIndex(game => game.id === id);
    const ordered = [...data.games.slice(index + 1), ...data.games.slice(0, index + 1)];
    const target = ordered.find(game => !valid(draft[game.id]));
    setSearch('');
    if (target) { setActiveRow(target.id); setNavigationMessage(''); setTimeout(() => { pickers.current[target.id]?.focus(); pickers.current[target.id]?.scrollIntoView({ block: 'center' }); }, 0); }
    else { setActiveRow(null); setNavigationMessage(`All ${data.games.length} predictions are ready. Review your ballot before saving.`); setTimeout(() => { if (!reviewButton.current?.disabled) reviewButton.current?.focus(); }, 0); }
  }
  const disabled = closed || busy || saving;
  const state = closed ? 'Ballot closed' : saving ? 'Saving…' : conflict || conflicts ? 'Conflict · review saved changes' : !online ? 'Offline · changes are not saved' : dirty ? 'You have unsaved changes' : savedAt ? submitted ? 'Submitted · editable until deadline' : 'Saved' : 'Build your ballot';
  return <>
    <section className="ballot-header panel"><div><span className="badge cyan">{closed ? 'BALLOT CLOSED' : submitted ? 'SUBMITTED · EDITABLE' : 'BLIND PREDICTIONS'}</span><h2>{total ? 'Where would you set the total?' : 'Where would you set the line?'}</h2><p>{total ? 'Guess the sportsbook’s total for both teams’ combined points. This is a line-guessing game, separate from your own score forecast or an Over/Under pick.' : 'Tap the favorite or Pick’em, then tap a half-point chip. More covers 10.5–20 and −/+ fine-tunes by half a point. Tap the other team to switch sides. Negative favors home; positive favors away.'}</p></div><div className="ballot-count"><strong>{filled}<span>/{data.games.length}</span></strong><small>VALID PREDICTIONS</small></div></section>
    {submitted && <div className="ballot-analysis-entry"><button className="primary" onClick={() => go('edges')}>Open {total ? 'total' : 'spread'} analysis <ArrowRight size={18}/></button><button className="secondary" onClick={() => go('comparison')}>Compare picks</button></div>}
    {data.ballotScope === 'weekly' && <p className="weekly-ballot-note">One weekly {total ? 'total' : 'spread'} ballot across all groups. Saved guesses and their scoring references are reused everywhere.</p>}
    <div className="callout"><LockKeyhole size={18}/><p>{closed ? 'The prediction deadline has passed. Extensions require commissioner review.' : submitted ? 'Edit and review your guesses before saving. Each changed guess gets the consensus at the time you save; unchanged guesses keep their scoring reference.' : 'Save draft stores your edits. Submit the full ballot to capture scoring references and open this mode’s analysis. You may edit before the deadline.'} Deadline: {date(data.league.deadline)} PT.</p></div>
    {recovery && <section className="draft-recovery panel" aria-label="Recover unsaved predictions"><h3>Unsaved predictions found in this tab</h3><p>Recovery copy from {date(recovery.updatedAt)} PT. Review it against the latest saved account data before saving.</p><div><button className="primary" onClick={restore}>Restore tab draft</button><button className="secondary" onClick={() => { removeDraft(scope); setRecovery(null); }}>Discard recovery copy</button></div></section>}
    <section className="panel prediction-entry"><div className="table-toolbar"><div className="search-field"><Search size={16}/><input aria-label="Search matchups" placeholder="Find a team or matchup…" value={search} onChange={event => { setSearch(event.target.value); setActiveRow(null); setNavigationMessage(''); }}/></div><label className="filter-select"><select aria-label="Filter predictions" value={filter} onChange={event => { setFilter(event.target.value); setActiveRow(null); setNavigationMessage(''); }}><option value="all">All matchups</option><option value="missing">Missing predictions</option></select></label></div>
      <div className="table-scroll"><table className="picks-table"><caption className="sr-only">Week {data.league.week} {total ? 'total' : 'spread'} ballot</caption><thead><tr><th scope="col">MATCHUP / KICKOFF PT</th><th scope="col">{total ? 'YOUR TOTAL' : 'YOUR HOME SPREAD'}</th><th scope="col">{timestamped ? 'SCORING REFERENCE' : 'MARKET REFERENCE'}</th><th scope="col">POINTS</th><th scope="col">STATUS</th></tr></thead><tbody>{rows.map(game => <tr key={game.id}>
        <th scope="row" className="prediction-matchup"><div className="matchup"><TeamMatchup game={game}/></div><small className="game-date">{date(game.kickoff)} PT</small><TeamFacts week={data.league.week} awayCode={game.awayCode} homeCode={game.homeCode}/>{data.revealed && <div className="opponent-picks">{game.opponents.map(player => <span key={player.id}>{player.name.split(' ')[0]}: {total ? fmt(player.value) : signed(player.value)}</span>)}</div>}{timestamped && data.revealed && <CurrentConsensus data={data} game={game}/>} {benchmark && <div className="benchmark-mobile-data"><span>{benchmark.status === 'frozen' ? 'Frozen' : 'Provisional'} benchmark: {game.homeCode} {signed(game.market)}</span><strong>Your score: {fmt(game.points)} / 10 pts</strong></div>}</th>
        <td className="prediction-entry-controls" onFocus={() => setActiveRow(game.id)}><ChipPicker ref={node => { pickers.current[game.id] = node; }} compact mode={data.mode} value={draft[game.id]} away={game.awayCode} home={game.homeCode} label={`${game.awayCode} at ${game.homeCode} ${total ? 'combined points' : 'home spread'}`} disabled={disabled} onChange={value => change(game.id, String(value))}/>
          {!closed && <button className="text-button next-prediction" onClick={() => nextGame(game.id)}>Next game <ArrowRight size={16}/></button>}
          {fieldConflicts[game.id] && <div className="prediction-conflict" role="alert"><strong>Changed on another device</strong><p>Saved: {fieldConflicts[game.id].saved || 'empty'} · Yours: {fieldConflicts[game.id].local || 'empty'}</p><button className="secondary" onClick={() => resolve(game.id, fieldConflicts[game.id].saved)}>Use saved</button><button className="secondary" onClick={() => resolve(game.id, current.current[game.id])}>Keep my edit</button></div>}
        </td><td data-label={timestamped ? "Scoring reference" : "Market reference"}>{!data.revealed ? <span className="hidden-value"><LockKeyhole size={13}/>Hidden</span> : timestamped ? <ReferenceValue reference={game.scoringReference} total={total}/> : <><strong className="mono">{total ? fmt(game.market) : signed(game.market)}</strong><small className="cell-detail">{game.market === null ? total ? 'Awaiting total quotes' : 'Awaiting spread quotes' : benchmark ? `${benchmark.status === 'frozen' ? 'Frozen' : 'Provisional'} · Three-book median` : data.provisionalAnalysis ? 'Provisional analysis · Three-book median' : 'Historical · unofficial'}</small></>}</td><td data-label="Points"><strong className="mono">{fmt(game.points)}</strong><small className="cell-detail">{game.points === null ? 'Unscored' : '/ 10 pts'}</small></td><td data-label="Status"><span className="badge">{draft[game.id] === '' ? 'Not entered' : !valid(draft[game.id]) ? 'Check number' : dirty && draft[game.id] !== baseline.current[game.id] ? 'Unsaved' : closed ? 'Closed' : submitted ? 'Submitted' : 'Recorded'}</span></td>
      </tr>)}</tbody></table></div>{!rows.length && <div className="table-note"><p>{filter === 'missing' && !search && complete ? 'Every matchup has a valid prediction. Review your full ballot when you are ready.' : 'No matchups found. Try another team or return to all matchups.'}</p><button className="text-button" onClick={() => { setSearch(''); setFilter('all'); setActiveRow(null); }}>Show all matchups</button></div>}
    </section>
    {navigationMessage && <p className="table-note" aria-live="polite">{navigationMessage}</p>}
    {invalid && !closed && <p className="form-error" role="alert">Use half-point increments {total ? 'from 0 to 200' : 'from −100 to 100'} for every prediction.</p>}
    <div className="draft-save-state" aria-live="polite"><strong>{state}</strong><p>{savedAt && <>Last saved {date(savedAt)} PT. </>}{dirty ? storageAvailable ? 'Recovery copy kept in this tab for up to 24 hours. Review and save to make it available on another device.' : 'Tab recovery is unavailable. Keep this page open until you save.' : 'Manual save is used. Unsaved edits are not account data.'}</p></div>
    <div className="save-bar"><div><strong>{closed ? 'Ballot closed' : submitted ? 'Submitted · editable until deadline' : `${filled}/${data.games.length} ready`}</strong><small>{data.revisionCount} saved revisions · {total ? 'Total' : 'Spread'} {data.ballotScope === 'weekly' ? 'weekly ballot · All groups' : 'competition'}</small></div><div>{closed ? <button className="primary" onClick={() => go('edges')}>View analysis <ArrowRight size={17}/></button> : <>{!submitted && <button className="secondary" disabled={disabled || !dirty || invalid || conflicts > 0 || conflict || !online} onClick={() => persist(false)}>{saving && <LoaderCircle className="spin" size={16}/>}Save draft</button>}<button ref={reviewButton} className="primary" disabled={disabled || !complete || submitted && !dirty || conflicts > 0 || conflict || !online} onClick={() => setReview(true)}>{submitted ? 'Review & save changes' : 'Review & submit'} <ArrowRight size={17}/></button></>}</div></div>
    {data.revealed && <SourceNote data={data}/>}
    {review && <Modal title={`${submitted ? 'Save changes to' : 'Submit'} your ${total ? 'total' : 'spread'} ballot?`} className="submit-review prediction-review" onClose={() => { if (!saving) setReview(false); }}>
      <div className="callout"><LockKeyhole size={19}/><p>{submitted ? 'Save fresh scoring references for changed guesses only.' : `Save scoring references and reveal your ${total ? 'total' : 'spread'} analysis.`}</p></div>
      <p className="review-description">Review all {data.games.length} guesses. If fresh quotes are unavailable, your ballot stays unchanged and your edits stay here.</p>
      <div className="review-picks" role="list" aria-label="Predictions to submit">{data.games.map(game => <div key={game.id} role="listitem"><span>{game.awayCode} at {game.homeCode}</span><strong className="mono">{total ? fmt(Number(draft[game.id])) : signed(Number(draft[game.id]))}</strong></div>)}</div>
      <details className="prediction-review-details"><summary>Scoring & editing details</summary>
        <p>Deadline: {date(data.league.deadline)} PT. You can edit until the deadline.</p>
        <p>{submitted ? 'Saving changes captures the consensus at save time for changed guesses only. Unchanged guesses keep their existing scoring references.' : 'Submitting captures fresh scoring references for every guess and opens this mode’s analysis.'} We check for fresh sportsbook quotes before saving.</p>
        <p>{total ? 'Each number is your guess of the sportsbook’s total for both teams.' : 'Each signed spread is from the home team’s perspective.'} {data.ballotScope === 'weekly' && <>Your Week {data.league.week} ballot is shared across every group. </>}{total ? 'Spread' : 'Total'} predictions stay separate.</p>
        <p>{dirty ? 'Your reviewed edits will be saved and submitted together.' : 'You are reviewing your saved draft.'}</p>
      </details>
      {error && <p className="form-error" role="alert">{error} {conflict || conflicts ? 'Choose Keep editing, then refresh saved data and resolve the highlighted changes. Your draft stays on this page.' : !online ? 'Reconnect to retry. Your entries stay here.' : 'Your entries are still here. Retry from this review, or choose Keep editing.'}</p>}
      <div className="review-actions"><button className="secondary" data-initial-focus disabled={saving} onClick={() => setReview(false)}>Keep editing</button><button className="primary" disabled={disabled || !complete || conflicts > 0 || conflict || !online} onClick={() => persist(true)}>{saving ? 'Saving…' : submitted ? 'Save changed guesses' : 'Submit & reveal analysis'}<LockKeyhole size={17}/></button></div>
    </Modal>}
  </>;
}
