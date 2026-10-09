import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Check, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import Brand from './Brand';
import ThemeSelector from './Theme';
import { TeamMatchup } from './TeamIdentity';
import { cloudApi, date, signed } from './api';
import { JOURNAL_CURRENCIES, JOURNAL_OUTCOMES, decimalToMinor, minorToDecimal } from '../../shared/journal-performance.mjs';
import { soloDraftScope, soloSavedPicks, soloPicksDiffer, readSoloDraft, writeSoloDraft, removeSoloDraft, mergeSoloDraft } from './soloDraft';
import './personalWorkspace.css';

const modeName = mode => mode === 'guess_spread' ? 'Spread' : 'Total';
const asNumber = value => value === '' ? null : Number(value);
const localTime = value => {
  const d = new Date(value || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function GuessForm({ data, accountId, mode, save, busy, onDirty }) {
  const ballot = data.ballots[mode];
  const scope = soloDraftScope({ accountId, season: data.season, week: data.week, mode });
  const [base] = useState(() => soloSavedPicks(data.games, ballot));
  const [picks, setPicks] = useState(base);
  const [recovery, setRecovery] = useState(() => {
    const copy = readSoloDraft(scope, data.games);
    if (copy && !soloPicksDiffer(copy.draft, base)) { removeSoloDraft(scope); return null; }
    return copy;
  });
  const [conflicts, setConflicts] = useState({});
  const recoveryBase = useRef(base), inputRefs = useRef({});
  const [focusTarget, setFocusTarget] = useState(null);
  useEffect(() => { if (focusTarget && !recovery) { inputRefs.current[focusTarget]?.focus(); setFocusTarget(null); } }, [focusTarget, recovery]);
  const [recoveryStatus, setRecoveryStatus] = useState('');
  const [review, setReview] = useState(false);
  const [now, setNow] = useState(() => Date.parse(data.now));
  useEffect(() => {
    const started = performance.now(), serverNow = Date.parse(data.now), deadline = Date.parse(data.deadline);
    let timer;
    const tick = () => {
      const current = serverNow + performance.now() - started;
      setNow(current);
      if (current < deadline) timer = setTimeout(tick, Math.min(deadline - current, 60_000));
    };
    tick(); return () => clearTimeout(timer);
  }, [data.now, data.deadline]);
  const submitted = !!ballot?.submittedAt;
  const closed = !Number.isFinite(now) || !Number.isFinite(Date.parse(data.deadline)) || now >= Date.parse(data.deadline);
  const unresolved = Object.keys(conflicts).length > 0;
  const changed = soloPicksDiffer(picks, base) || unresolved;
  useEffect(() => { onDirty('guess', changed && !closed); return () => onDirty('guess', false); }, [changed, closed, onDirty]);
  useEffect(() => {
    if (recovery) return;
    if (!changed) { removeSoloDraft(scope); return; }
    const copy = { ...picks, ...Object.fromEntries(Object.entries(conflicts).map(([id, values]) => [id, values.recovered])) };
    setRecoveryStatus(writeSoloDraft(scope, copy, unresolved ? recoveryBase.current : base)
      ? 'Unsaved guesses kept in this tab only. Save to your account to use them on other devices.'
      : 'Tab recovery is unavailable. Keep this page open until your account save succeeds.');
  }, [picks, base, scope, changed, recovery, unresolved, conflicts]);
  const count = Object.values(picks).filter(value => value !== '').length;
  const blocked = busy || closed || !!recovery || unresolved;
  const body = submit => ({ season: data.season, week: data.week, mode, weeklyRevision: data.weeklyRevision, picks: Object.fromEntries(Object.entries(picks).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)])), submit });
  const resolve = (id, value) => {
    setReview(false); setPicks(previous => ({ ...previous, [id]: value }));
    setConflicts(previous => { const next = { ...previous }; delete next[id]; return next; });
  };
  return <form className="personal-form" onSubmit={event => { event.preventDefault(); if (!blocked) setReview(true); }}>
    <h2>Guess the {modeName(mode)}</h2>
    <p className="muted">These are your shared weekly competition guesses. {mode === 'guess_spread' ? 'Enter the sportsbook spread from the home team’s perspective.' : 'Enter the sportsbook combined points total.'}</p>
    <p>{closed ? 'The prediction deadline has passed.' : submitted ? `Submitted · editable until deadline · ${date(ballot.submittedAt)} PT` : `${count} of ${data.games.length} entered · Deadline ${date(data.deadline)} PT`}</p>
    {ballot?.originPractice && <p className="auth-notice">This ballot retains its original practice history.</p>}
    {recovery && <section className="personal-review" aria-label="Unsaved Solo recovery"><h3>Unsaved {modeName(mode)} guesses found</h3>
      <p>This copy is from this tab, saved {date(recovery.updatedAt)} PT. It has not been saved to your account or submitted.</p>
      {closed ? <p>The deadline has passed. You can read or discard this copy, but cannot restore it for editing or submission.</p> : <p>Restore your unsaved guesses or discard this copy to use the latest account values. Changes already saved to your account will be compared before anything is replaced.</p>}
      <details open={closed}><summary>View recovery copy</summary><ul>{data.games.filter(game => recovery.draft[game.id] !== '').map(game => <li key={game.id}>{game.awayCode} at {game.homeCode}: {mode === 'guess_spread' ? signed(Number(recovery.draft[game.id])) : recovery.draft[game.id]}</li>)}</ul></details>
      <div className="personal-actions">{!closed && <button type="button" className="primary" disabled={busy} onClick={() => { const restored = mergeSoloDraft(recovery.base, recovery.draft, base); recoveryBase.current = recovery.base; setPicks(restored.picks); setConflicts(restored.conflicts); setRecovery(null); setReview(false); setFocusTarget(Object.keys(restored.conflicts)[0] || data.games.find(game => recovery.draft[game.id] !== recovery.base[game.id])?.id || data.games[0]?.id); }}>Restore unsaved guesses</button>}<button type="button" className="secondary" disabled={busy} onClick={() => { removeSoloDraft(scope); setRecovery(null); setRecoveryStatus('Recovery copy discarded. Showing your account values.'); }}>Discard recovery copy</button></div>
    </section>}
    {!recovery && recoveryStatus && <p className="auth-notice">{recoveryStatus}</p>}
    {closed && changed && <p className="auth-notice">Your unsaved guesses remain in this tab for reference only. They were not submitted.</p>}
    {unresolved && <p role="alert">Some guesses were also changed in your account. Choose which value to keep for each highlighted matchup before saving.</p>}
    <div className="personal-matchups">{data.games.map(game => <div className="personal-matchup" key={game.id}>
      <div><TeamMatchup game={game} compact/><small>{date(game.kickoff)} PT</small>{submitted && <small>{ballot.scoringReferences?.[game.id]?.status === 'available' ? <>Saved scoring reference: {mode === 'guess_spread' ? signed(ballot.scoringReferences[game.id].value) : ballot.scoringReferences[game.id].value} · {Math.max(0, 10 - 2 * Math.abs(ballot.picks[game.id] - ballot.scoringReferences[game.id].value))}/10 saved accuracy<br/>{ballot.scoringReferences[game.id].source} · Observed {date(ballot.scoringReferences[game.id].observedAt)} PT · Saved {date(ballot.scoringReferences[game.id].savedAt)} PT</> : <>Unscored · {ballot.scoringReferences?.[game.id]?.reason || 'No saved submission-time reference.'}</>}</small>}</div>
      <div><label>Your {modeName(mode).toLowerCase()} guess for {game.id}<input ref={element => { inputRefs.current[game.id] = element; }} aria-label={`${game.id} ${modeName(mode)} guess`} type="number" inputMode="decimal" step="0.5" min={mode === 'guess_spread' ? -100 : 0} max={mode === 'guess_spread' ? 100 : 200} value={picks[game.id]} disabled={busy || closed || !!recovery} onChange={event => resolve(game.id, event.target.value)}/></label>
      {conflicts[game.id] && <div className="auth-notice" role="group" aria-label={`${game.id} recovery conflict`}><p>Recovered: {conflicts[game.id].recovered || 'Blank'} · Account: {conflicts[game.id].saved || 'Blank'}</p><div className="personal-actions"><button type="button" className="secondary" disabled={busy || closed} onClick={() => resolve(game.id, conflicts[game.id].recovered)}>Use recovered guess</button><button type="button" className="secondary" disabled={busy || closed} onClick={() => resolve(game.id, conflicts[game.id].saved)}>Keep account guess</button></div></div>}</div>
    </div>)}</div>
    {!closed && <div className="personal-actions">{!submitted && <button type="button" className="secondary" disabled={blocked} onClick={() => save('personal/ballot', body(false), 'Draft saved to your account.')}>Save draft</button>}<button className="primary" disabled={blocked || count !== data.games.length}>Review full ballot</button></div>}
    {review && !closed && <section className="personal-review" aria-label="Review full ballot"><h3>{submitted ? 'Save changed' : 'Submit'} {modeName(mode)} guesses?</h3><p>These {count} guesses are reused in every group you join. You may edit until the deadline. Each changed guess captures consensus when saved; unchanged guesses keep their reference. We check for fresh sportsbook quotes before saving. If a required quote is unavailable, your draft stays here and nothing is submitted.</p><div className="personal-actions"><button type="button" className="primary" disabled={blocked} onClick={() => save('personal/ballot', body(true), `${modeName(mode)} ballot saved with scoring references.`)}>{submitted ? 'Save changed' : 'Submit'} {modeName(mode)} guesses</button><button type="button" className="secondary" disabled={busy} onClick={() => setReview(false)}>Keep editing</button></div></section>}
  </form>;
}

function FavoriteCard({ game, favorite, data, save, busy, onDirty }) {
  const [notes, setNotes] = useState(favorite?.notes || '');
  const [market, setMarket] = useState('spread'), [value, setValue] = useState('');
  useEffect(() => { onDirty(`favorite-${game.id}`, notes !== (favorite?.notes || '') || value !== ''); return () => onDirty(`favorite-${game.id}`, false); }, [game.id, notes, value, favorite?.notes, onDirty]);
  const savedForecast = data.forecasts.find(f => f.gameId === game.id && f.market === market);
  const target = { season: data.season, week: data.week, gameId: game.id };
  return <article className="panel personal-favorite">
    <TeamMatchup game={game} compact/><p className="muted">{date(game.kickoff)} PT</p>
    <button className={favorite ? 'secondary' : 'primary'} aria-pressed={!!favorite} aria-label={`${favorite ? 'Remove' : 'Save'} ${game.id} ${favorite ? 'from' : 'to'} Favorites`} disabled={busy} onClick={() => save('favorite/set', { ...target, saved: !favorite, notes }, favorite ? 'Removed from Favorites.' : 'Saved to Favorites.')}><Bookmark size={17}/>{favorite ? 'Saved · Remove' : 'Save to Favorites'}</button>
    {favorite && <form className="personal-form" onSubmit={event => { event.preventDefault(); save('favorite/set', { ...target, saved: true, notes }, 'Private note saved.'); }}>
      <label>Private note for {game.id}<textarea maxLength={2000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)}/></label>
      <button className="secondary" disabled={busy || notes === favorite.notes}>Save private note</button>
    </form>}
    <details><summary>Your outcome forecast</summary><p className="muted">Optional personal opinion about the outcome. This does not replace your sportsbook guess or enter a contest.</p>
      <form className="personal-form" onSubmit={event => { event.preventDefault(); save('personal/forecast', { ...target, market, value: asNumber(value) }, 'Personal forecast saved with history.').then(ok => { if (ok) setValue(''); }); }}>
        <label>Forecast market for {game.id}<select value={market} onChange={event => { setMarket(event.target.value); setValue(''); }} disabled={busy}><option value="spread">Home-team spread</option><option value="total">Combined points</option></select></label>
        {savedForecast && <p>Your saved forecast: <strong>{market === 'spread' ? signed(savedForecast.value) : savedForecast.value}</strong> · {date(savedForecast.savedAt)} PT · Revision {savedForecast.revision}</p>}
        <label>New forecast for {game.id}<input type="number" step="0.5" required min={market === 'spread' ? -100 : 0} max={market === 'spread' ? 100 : 200} value={value} onChange={event => setValue(event.target.value)} disabled={busy}/></label>
        <button className="secondary" disabled={busy || value === ''}>Save personal forecast</button>
      </form>
    </details>
  </article>;
}

function JournalForm({ data, entry, save, busy, onClose, onDirty }) {
  const unlocked = ['spread', 'total'].filter(market => data.ballots[market === 'spread' ? 'guess_spread' : 'guess_total']?.submittedAt);
  const [fields, setFields] = useState(() => ({ gameId: entry?.gameId || data.games[0]?.id || '', market: entry?.market || unlocked[0] || 'spread', kind: entry?.kind || 'research_note', side: entry?.side || (unlocked[0] === 'total' ? 'over' : 'home'), line: entry?.line ?? '', odds: entry?.odds ?? '', source: entry?.source || '', quotedAt: localTime(entry?.quotedAt), placedAt: localTime(entry?.placedAt), notes: entry?.notes || '', outcome: entry?.outcome || 'pending', currency: entry?.currency || 'USD', stake: minorToDecimal(entry?.stakeMinor), returned: minorToDecimal(entry?.returnedMinor), reason: '' }));
  const baseline = useRef(JSON.stringify(fields));
  useEffect(() => { onDirty('journal', JSON.stringify(fields) !== baseline.current); return () => onDirty('journal', false); }, [fields, onDirty]);
  const [formError, setFormError] = useState('');
  const change = (key, value) => setFields({ ...fields, [key]: value, ...(key === 'market' ? { side: value === 'spread' ? 'home' : 'over', line: '' } : {}), ...(key === 'outcome' && value === 'pending' ? { returned: '' } : {}) });
  if (!unlocked.length) return <section className="panel"><h2>Your private journal</h2><p>Submit the matching Spread or Total ballot before recording market selections. You can save neutral Favorites and personal notes now.</p></section>;
  return <form className="panel personal-form" onSubmit={event => {
    event.preventDefault();
    let stakeMinor, returnedMinor;
    try { stakeMinor = fields.kind === 'research_note' ? null : decimalToMinor(fields.stake); returnedMinor = fields.kind === 'research_note' || fields.outcome === 'pending' ? null : decimalToMinor(fields.returned); } catch (e) { setFormError(e.message); return; }
    setFormError('');
    const body = { season: data.season, week: data.week, gameId: fields.gameId, market: fields.market, kind: fields.kind, side: fields.side, line: asNumber(fields.line), odds: asNumber(fields.odds), source: fields.source, quotedAt: entry?.quotedAt && fields.quotedAt === localTime(entry.quotedAt) ? entry.quotedAt : new Date(fields.quotedAt).toISOString(), placedAt: fields.kind === 'user_reported_placed_bet' ? entry?.placedAt && fields.placedAt === localTime(entry.placedAt) ? entry.placedAt : new Date(fields.placedAt).toISOString() : null, notes: fields.notes, outcome: fields.outcome, currency: stakeMinor === null ? null : fields.currency, stakeMinor, returnedMinor, ...(entry ? { entryId: entry.id, reason: fields.reason } : {}) };
    save(entry ? 'journal/correct' : 'journal/create', body, entry ? 'Correction saved; the original remains in history.' : 'Private journal record saved.').then(ok => { if (ok) onClose(); });
  }}>
    {formError && <p className="error-banner" role="alert">{formError}</p>}
    <h2>{entry ? 'Correct private record' : 'Add a private record'}</h2>
    <p className="muted">Manual, user-reported information. This records your research or a bet you report placing elsewhere. No wager or contest entry is created.</p>
    <div className="personal-form-grid">
      <label>Matchup<select value={fields.gameId} disabled={busy || !!entry} onChange={e => change('gameId', e.target.value)}>{data.games.map(g => <option value={g.id} key={g.id}>{g.awayCode} at {g.homeCode}</option>)}</select></label>
      <label>Record type<select value={fields.kind} disabled={busy} onChange={e => change('kind', e.target.value)}><option value="research_note">Research selection</option><option value="user_reported_placed_bet">Bet I placed elsewhere</option></select></label>
      <label>Market<select value={fields.market} disabled={busy || !!entry} onChange={e => change('market', e.target.value)}>{unlocked.map(m => <option key={m} value={m}>{m === 'spread' ? 'Spread' : 'Total'}</option>)}</select></label>
      <label>Side<select value={fields.side} disabled={busy} onChange={e => change('side', e.target.value)}>{(fields.market === 'spread' ? ['home','away'] : ['over','under']).map(side => <option key={side} value={side}>{side}</option>)}</select></label>
      <label>{fields.market === 'spread' ? 'Selected-side spread' : 'Total line'}<input type="number" required step="0.5" min={fields.market === 'spread' ? -100 : 0} max={fields.market === 'spread' ? 100 : 200} value={fields.line} disabled={busy} onChange={e => change('line', e.target.value)}/></label>
      <label>American odds<input type="number" required step="1" min="-10000" max="10000" placeholder="For example, -110" value={fields.odds} disabled={busy} onChange={e => change('odds', e.target.value)}/></label>
      <label>Named quote source<input required minLength={2} maxLength={120} value={fields.source} disabled={busy} onChange={e => change('source', e.target.value)}/></label>
      <label>Quote observed at (your device time)<input type="datetime-local" required value={fields.quotedAt} disabled={busy} onChange={e => change('quotedAt', e.target.value)}/></label>
      {fields.kind === 'user_reported_placed_bet' && <label>Reported placed at (your device time)<input type="datetime-local" required value={fields.placedAt} disabled={busy} onChange={e => change('placedAt', e.target.value)}/></label>}
    </div>
    <div className="personal-form-grid"><label>Reported outcome<select value={fields.outcome} disabled={busy} onChange={e => change('outcome', e.target.value)}>{JOURNAL_OUTCOMES.map(outcome => <option key={outcome} value={outcome}>{outcome}</option>)}</select></label>
      {fields.kind === 'user_reported_placed_bet' && <><label>Currency<select value={fields.currency} disabled={busy} onChange={e => change('currency', e.target.value)}>{JOURNAL_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label><label>Stake (optional)<input inputMode="decimal" value={fields.stake} placeholder="0.00" disabled={busy} onChange={e => change('stake', e.target.value)}/></label><label>Actual returned, including stake<input inputMode="decimal" value={fields.returned} placeholder="0.00" disabled={busy || fields.outcome === 'pending'} onChange={e => change('returned', e.target.value)}/></label></>}
    </div>
    <label>Private rationale<textarea maxLength={2000} value={fields.notes} disabled={busy} onChange={e => change('notes', e.target.value)}/></label>
    {entry && <label>Reason for correction<input required minLength={3} maxLength={300} value={fields.reason} disabled={busy} onChange={e => change('reason', e.target.value)}/></label>}
    <p className="muted">Recording time is saved automatically. Entries after kickoff are labeled retrospective. Amounts and outcomes are your report. Enter the total actually returned, including any returned stake; no payout is inferred from odds.</p>
    <div className="personal-actions"><button className="primary" disabled={busy}><Check size={17}/>{entry ? 'Save correction' : 'Save private record'}</button><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

export default function PersonalWorkspace({ accountId, onBack, onSignOut }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('favorites'), [mode, setMode] = useState('guess_spread'), [onlySaved, setOnlySaved] = useState(false), [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState(null), [history, setHistory] = useState(null);
  const [uncertainSave, setUncertainSave] = useState(false), [readVersion, setReadVersion] = useState(0);
  const request = useRef(null), dirtyForms = useRef(new Set());
  const [dirty, setDirty] = useState(false);
  const onDirty = useCallback((key, changed) => { if (changed) dirtyForms.current.add(key); else dirtyForms.current.delete(key); setDirty(dirtyForms.current.size > 0); }, []);
  const discard = () => !dirtyForms.current.size || window.confirm(dirtyForms.current.size === 1 && dirtyForms.current.has('guess') ? 'Leave this form? Unsaved guesses are kept only in this tab when recovery is available.' : 'You have unsaved changes. Discard them and continue?');
  useEffect(() => { if (!dirty) return; const preventLoss = event => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', preventLoss); return () => window.removeEventListener('beforeunload', preventLoss); }, [dirty]);
  const load = useCallback(async (body, signal) => {
    const result = await cloudApi(body ? 'personal/read' : 'personal', body, { signal }); setData(result); return result;
  }, []);
  useEffect(() => { const controller = new AbortController(); load(undefined, controller.signal).catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => controller.abort(); }, [load]);
  const selection = () => ({ season: data.season, week: data.week, includeArchived });
  async function refresh(body) { if (!discard()) return; setBusy(true); setError(''); try { await load(body || (data ? selection() : undefined)); setUncertainSave(false); setReadVersion(version => version + 1); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function save(route, body, message) {
    if (busy || uncertainSave) return false;
    setBusy(true); setError(''); setNotice('');
    const serialized = JSON.stringify({ route, body, revision: data.revision });
    if (request.current?.serialized !== serialized) request.current = { serialized, requestId: crypto.randomUUID() };
    let acknowledged = false;
    try {
      await cloudApi(route, { ...body, requestId: request.current.requestId, revision: data.revision });
      acknowledged = true;
      await load(selection());
      if (route === 'personal/ballot') removeSoloDraft(soloDraftScope({ accountId, ...body }));
      request.current = null; setNotice(message); return true;
    } catch (e) {
      if (route === 'personal/ballot' && (e.uncertain || acknowledged)) {
        setUncertainSave(acknowledged ? 'acknowledged' : 'unknown');
        setError(acknowledged ? 'Your guesses were saved, but the latest account view could not load. Check saved guesses before editing again.' : e.message);
      } else setError(e.message);
      return false;
    }
    finally { setBusy(false); }
  }
  async function openHistory(entryId) { setBusy(true); setError(''); try { setHistory(await cloudApi('journal/history', { entryId })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const archive = entry => save('journal/archive', { entryId: entry.id, archived: !entry.archived, reason: entry.archived ? 'Restored by account owner' : 'Archived by account owner' }, entry.archived ? 'Record restored.' : 'Record archived; its history is preserved.');
  return <div className="hub-shell personal-workspace">
    <a className="skip-link" href="#main">Skip to main content</a>
    <header className="hub-header"><Brand/><button className="secondary" disabled={busy} onClick={() => { if (discard()) onBack(); }}><ArrowLeft size={17}/>My games</button></header>
    <main id="main" className="hub-main"><ThemeSelector/>
      <div className="hub-heading"><div><p className="eyebrow">PRIVATE TO YOUR ACCOUNT</p><h1>Solo</h1><p>Your weekly guesses, Favorites and private journal. No group needed.</p></div><ShieldCheck size={28} aria-hidden="true"/></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {uncertainSave && <section className="auth-notice" aria-label="Check Solo save"><p>{uncertainSave === 'acknowledged' ? 'Your account save succeeded. The latest saved view still needs to be checked.' : 'We could not confirm whether your guesses were saved.'} Your tab copy is kept. Check saved data before making another change.</p><button type="button" className="secondary" disabled={busy} onClick={() => refresh()}>Check saved guesses</button></section>}
      {!data ? <div className="panel">{error ? <button className="secondary" onClick={() => refresh(undefined)} disabled={busy}>Try again</button> : <p role="status"><LoaderCircle className="spin"/>Loading your private workspace…</p>}</div> : <>
        <div className="personal-toolbar"><label>Season and week<select value={`${data.season}/${data.week}`} disabled={busy} onChange={event => { if (!discard()) return; const [season,week] = event.target.value.split('/').map(Number); dirtyForms.current.clear(); setDirty(false); setEditing(null); setHistory(null); refresh({ season, week, includeArchived }); }}>{data.slates.map(s => <option key={`${s.season}/${s.week}`} value={`${s.season}/${s.week}`}>{s.season} · Week {s.week}</option>)}</select></label><button className="secondary" disabled={busy} onClick={() => { if (!discard()) return; dirtyForms.current.clear(); setDirty(false); setEditing(null); setHistory(null); refresh(); }}><RefreshCw size={17}/>Refresh saved data</button></div>
        <nav className="personal-tabs" aria-label="Personal activities">{[['favorites','Favorites'],['guesses','Guesses'],['journal','Journal']].map(([key,label]) => <button key={key} className={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => { if (tab === key || !discard()) return; setTab(key); setEditing(null); setHistory(null); }} disabled={busy}>{label}</button>)}</nav>
        {tab === 'guesses' && <section className="panel"><div className="personal-actions" aria-label="Guess market">{['guess_spread','guess_total'].map(m => <button key={m} className={mode === m ? 'primary' : 'secondary'} aria-pressed={mode === m} disabled={busy} onClick={() => { if (mode !== m && !discard()) return; setMode(m); }}>{modeName(m)}</button>)}</div><GuessForm key={`${accountId}/${data.season}/${data.week}/${mode}/${data.weeklyRevision}/${readVersion}`} data={data} accountId={accountId} mode={mode} busy={busy || uncertainSave} save={save} onDirty={onDirty}/></section>}
        {tab === 'favorites' && <section><div className="personal-toolbar"><div><h2>Favorites and private notes</h2><p className="muted">Neutral matchups stay available before you submit. Saving never enters a contest.</p></div><label className="personal-check"><input type="checkbox" checked={onlySaved} onChange={e => { if (discard()) setOnlySaved(e.target.checked); }}/>Saved only ({data.favorites.length})</label></div><div className="personal-cards">{data.games.filter(g => !onlySaved || data.favorites.some(f => f.gameId === g.id)).map(game => <FavoriteCard key={`${data.season}/${data.week}/${game.id}/${data.favorites.find(f => f.gameId === game.id)?.updatedAt || ''}`} game={game} favorite={data.favorites.find(f => f.gameId === game.id)} data={data} save={save} busy={busy} onDirty={onDirty}/>)}</div>{onlySaved && !data.favorites.length && <p className="panel">No Favorites yet. Turn off Saved only to browse the slate.</p>}</section>}
        {tab === 'journal' && <section>
          <div className="personal-toolbar"><div><h2>Private journal</h2><p className="muted">Manual records with an audit history. Results are not independently settled.</p></div><button className="primary" disabled={busy} onClick={() => { if (!discard()) return; setHistory(null); setEditing({}); }}>Add record</button></div>
          {data.performance && <section className="panel personal-performance" aria-label="Journal performance"><h3>Reported results · {data.performance.recordCount} active placed-bet records</h3><p>Win rate: {data.performance.winRatePercent === null ? '—' : `${data.performance.winRatePercent.toFixed(1)}%`} · {data.performance.decidedCount} win/loss decisions; pushes, voids and pending excluded.</p><p>{Object.entries(data.performance.outcomes).map(([outcome,count]) => `${count} ${outcome}`).join(' · ')}</p>{data.performance.currencies.map(row => <div key={row.currency}><h3>{row.currency} · {row.sampleCount} records with complete returns</h3><p>Net: {row.netMinor === null ? '—' : minorToDecimal(row.netMinor)} · ROI: {row.roiPercent === null ? '—' : `${row.roiPercent.toFixed(1)}%`}</p><p className="muted">Pending stake: {minorToDecimal(row.pendingStakeMinor)} · {row.excludedCount} excluded from ROI</p></div>)}<p className="muted">{data.performance.formula} Based on all active records for this week, including other journal pages. All results are user-reported.</p></section>}
          <label className="personal-check"><input type="checkbox" checked={includeArchived} disabled={busy} onChange={e => { if (!discard()) return; dirtyForms.current.clear(); setDirty(false); setIncludeArchived(e.target.checked); refresh({ season: data.season, week: data.week, includeArchived: e.target.checked }); }}/>Include archived records</label>
          {editing && <JournalForm key={`${editing.id || 'new'}/${data.season}/${data.week}`} data={data} entry={editing.id ? editing : null} save={save} busy={busy} onDirty={onDirty} onClose={() => setEditing(null)}/>}
          {!data.journal.length && !editing && <p className="panel">No journal records for this week.</p>}
          <div className="personal-journal">{data.journal.map(entry => <article className="panel" key={entry.id}>
            <h3>{entry.gameId} · {entry.market} · {entry.side} {entry.market === 'spread' ? signed(entry.line) : entry.line}</h3>
            <p>{entry.kind === 'research_note' ? 'Research selection' : 'Reported placed elsewhere'} · {entry.outcome || 'pending'} · {signed(entry.odds)} odds{entry.archived ? ' · Archived' : ''}</p><p className="muted">{entry.verification}{entry.retrospective ? ' · Retrospective entry' : ''}</p>
            {entry.stakeMinor !== null && entry.stakeMinor !== undefined && <p>{entry.currency} stake {minorToDecimal(entry.stakeMinor)} · Actual returned {entry.returnedMinor === null ? 'not recorded' : minorToDecimal(entry.returnedMinor)}</p>}<p>{entry.source} · Quote {date(entry.quotedAt)} PT</p>{entry.placedAt && <p>Reported placed {date(entry.placedAt)} PT</p>}<p className="muted">Recorded {date(entry.createdAt)} PT · Revision {entry.revision}</p><p className="personal-note">{entry.notes || 'No rationale recorded.'}</p>
            {entry.context && <details className="personal-context"><summary>Original context and outcome review</summary><p className="muted">Snapshot when recorded {date(entry.context.recordedAt)} PT. For retrospective entries this does not prove what was known when the bet was placed. Later corrections preserve this original snapshot.</p><dl><dt>Sportsbook guess</dt><dd>{entry.context.sportsbookGuess?.value ?? 'Not available'}</dd><dt>Personal outcome forecast</dt><dd>{entry.context.personalForecast?.value ?? 'Not recorded'}{entry.context.personalForecast?.savedAt && ` · Saved ${date(entry.context.personalForecast.savedAt)} PT`}</dd><dt>Original selected-side quote</dt><dd>{entry.context.quote?.side} {entry.context.quote?.line} · {entry.context.quote?.odds} odds · {entry.context.quote?.source}</dd><dt>Current reported outcome</dt><dd>{entry.outcome || 'pending'}</dd><dt>Model evidence</dt><dd>Not recorded</dd></dl><p className="muted">A forecast-to-quote difference is disagreement, not proven expected value. Review your original rationale alongside the reported result.</p></details>}
            <div className="personal-actions"><button className="secondary" disabled={busy} onClick={() => { if (!discard()) return; setHistory(null); setEditing(entry); }}>Correct record</button><button className="secondary" disabled={busy} onClick={() => openHistory(entry.id)}>View history</button><button className="secondary" disabled={busy} onClick={() => archive(entry)}>{entry.archived ? 'Restore record' : 'Archive record'}</button></div>
          </article>)}</div>
          {data.nextCursor && <button className="secondary" disabled={busy} onClick={() => refresh({ ...selection(), cursor: data.nextCursor })}>Older records</button>}
          {history && <section className="panel personal-history" aria-label="Record history"><h2>Record history</h2><p className="muted">{history.olderEventsAvailable ? 'Showing the latest 100 events; older events remain stored.' : 'Original records and corrections are retained.'}</p>{history.events.map(event => <article key={event.revision}><h3>{event.action.replace('journal/','')} · {date(event.recordedAt)} PT</h3>{event.reason && <p>{event.reason}</p>}<p>Original rationale: {event.before?.notes ?? 'No prior record'}</p><p>Saved rationale: {event.after?.notes ?? 'No rationale'}</p><p>Outcome: {event.before?.outcome || 'none'} → {event.after?.outcome || 'pending'}</p>{event.after?.stakeMinor !== null && event.after?.stakeMinor !== undefined && <p>{event.after.currency} stake {minorToDecimal(event.after.stakeMinor)} · Actual returned {minorToDecimal(event.after.returnedMinor) || 'not recorded'}</p>}{event.after?.line !== undefined && <p>Saved selection: {event.after.side} {event.after.line} · {event.after.odds} odds · {event.after.source}</p>}</article>)}<button className="secondary" onClick={() => setHistory(null)}>Close history</button></section>}
        </section>}
      </>}
      <div className="hub-bottom"><span>Only you can read this workspace. Group hosts cannot see your journal or Favorites.</span><button className="secondary" disabled={busy} onClick={async () => { if (!discard()) return; setBusy(true); try { await onSignOut(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Sign out</button></div>
    </main>
  </div>;
}
