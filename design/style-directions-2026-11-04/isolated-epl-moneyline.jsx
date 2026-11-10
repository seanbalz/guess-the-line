// Isolated native presentation; no actual moneyline controller/API/auth/polling/storage.
// Adaptations: haptics off, illustrative matchups, full club names/separate crests,
// retained-in-memory navigation, long-price font, math-only reference wording, owner styling hook.
import React from 'react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Card} from '../../web/src/next/ui/Card.jsx';
import {Skeleton} from '../../web/src/next/ui/Skeleton.jsx';
import {Crest} from '../../web/src/next/epl/DraftBoard.jsx';
import {fmtWhen} from '../../web/src/next/format.js';
import {isClosed,parsePrice,priceText,visibleGuesses,stepPrice,ownGuess,guessProblem} from '../../web/src/next/epl/guess/guessModel.js';
import {validGuessPrice,MAX_GUESS_PRICE,toLine,validPrice} from '../../shared/epl-moneyline.mjs';
import {EPL_CLUBS} from '../../shared/epl-clubs.mjs';
const clubName=code=>EPL_CLUBS.find(c=>c.code===code)?.name??code;
export function PriceStepper({ value, onChange, disabled = false, id }) {
  const valid = validGuessPrice(parsePrice(value));
  return <div className="gx-epl-price">
    <label className="gx-t-strong" htmlFor={id}>Your moneyline price</label>
    <div className="gx-epl-price-controls">
      <Button haptic={false} aria-label="Decrease price by 5" disabled={disabled || !validGuessPrice(stepPrice(value, -1))} onClick={() => onChange(String(stepPrice(value, -1)))}>−</Button>
      <input id={id} className="gx-epl-price-input" style={{fontSize:String(value).length>7?'16px':undefined}} type="text" inputMode="text" value={value} disabled={disabled} autoComplete="off" spellCheck="false"
        aria-invalid={!valid} aria-describedby={`${id}-help`} onChange={event => onChange(event.target.value)}/>
      <Button haptic={false} aria-label="Increase price by 5" disabled={disabled || !validGuessPrice(stepPrice(value, 1))} onClick={() => onChange(String(stepPrice(value, 1)))}>+</Button>
    </div>
    <p className="gx-t-meta" id={`${id}-help`}>{valid ? priceText(parsePrice(value)) : `Enter a whole American price of at least +100 or at most −100, with magnitude no greater than ${MAX_GUESS_PRICE.toLocaleString('en-US')} (storage limit).`}</p>
  </div>;
}

export function DistanceLine({ guess }) {
  const scored = guess.state === 'scored' && validPrice(guess.referencePrice) && Number.isFinite(guess.distance);
  const a = validPrice(guess.price) ? toLine(guess.price) : 0, b = scored ? toLine(guess.referencePrice) : a;
  return <div className="gx-epl-distance">
    <div className="gx-epl-guess-values"><span>Your guess <strong>{priceText(guess.price)}</strong></span><span>{guess.exampleMath?'Example reference':'Saved real price'} <strong>{scored ? priceText(guess.referencePrice) : '—'}</strong></span></div>
    {scored ? <>
      <svg role="img" aria-label={`Distance ${guess.distance} points; your guess ${priceText(guess.price)}, ${guess.exampleMath?'example reference':'saved real price'} ${priceText(guess.referencePrice)}`} viewBox="0 0 240 28" className="gx-epl-distance-chart">
        <line x1="16" y1="14" x2="224" y2="14"/>
        <circle cx={a <= b ? 16 : 224} cy="14" r="6" className="gx-epl-distance-guess"/>
        <circle cx={a === b ? 16 : a < b ? 224 : 16} cy="14" r="4" className="gx-epl-distance-real"/>
      </svg>
      <p className="gx-t-strong">{guess.distance} points off</p>
      <p className="gx-t-meta">{guess.exampleMath?'Rule-math example · no bookmaker quote or observation time':<>Saved median · {guess.referenceSource === 'first-after' ? 'first qualifying price after lock' : 'at lock'} · {guess.referenceObservedAt ? fmtWhen(guess.referenceObservedAt) : 'Time unavailable'}</>}</p>
    </> : <p className="gx-t-meta">{guess.status === 'draft' ? 'Draft · not locked or scored' : guess.state === 'unscored' ? 'No line before kickoff · unscored, excluded from average' : 'Reference pending · first qualifying price before kickoff will count'}</p>}
  </div>;
}

export function GuessCard({ fixture, data, saved, draft, hero, busy, pending, now, onEdit, onSave, id }) {
  const closed = isClosed(fixture, now), locked = saved?.status === 'locked';
  const canEdit = hero && data.available && data.ownerId && !closed && !locked;
  const valid = [fixture.home, fixture.away].includes(draft.club) && validGuessPrice(parsePrice(draft.price));
  const others = visibleGuesses(data, fixture, now).filter(g => g.ownerId !== data.ownerId);
  const revealed = locked || fixture.kickedOff === true || Date.parse(fixture.commenceTime) <= now;
  return <Card as="section" variant={hero ? 'hero' : 'default'} className="gx-epl-guess-card" aria-labelledby={`${id}-title`}>
    <p className="gx-t-meta">Illustrative matchup · no live kickoff · {locked ? 'Locked · final' : closed ? 'Entry closed' : 'Locks at kickoff'}</p>
    <h2 className="gx-epl-guess-match gx-t-section" id={`${id}-title`}><span><Crest code={fixture.away}/>{clubName(fixture.away)}</span><span className="gx-t-meta">at</span><span><Crest code={fixture.home}/>{clubName(fixture.home)}</span></h2>
    {canEdit ? <>
      <fieldset disabled={busy} className="gx-epl-favorite"><legend className="gx-t-strong">Who’s the favorite?</legend>
        <div>{[fixture.away, fixture.home].map(club => <button className={`gx-epl-guess-club${draft.club === club ? ' gx-epl-guess-club--selected' : ''}`} key={club} type="button" aria-pressed={draft.club === club} onClick={() => onEdit({ club })}><Crest code={club}/>{clubName(club)}</button>)}</div>
      </fieldset>
      <PriceStepper id={`${id}-price`} value={draft.price} onChange={price => onEdit({ price })} disabled={busy}/>
      <Button haptic={false} variant="primary" block disabled={busy || !valid} onClick={() => onSave(true)}>{pending ? 'Checking saved guess…' : busy ? 'Entry paused' : 'Lock in'}</Button>
      <p className="gx-t-meta">Final once locked · measured vs the real price at lock-in</p>
      <Button haptic={false} variant="ghost" disabled={busy || !valid} onClick={() => onSave(false)}>Save draft</Button>
      {saved?.status === 'draft' ? <p className="gx-t-meta">A saved draft is not locked or scored.</p> : null}
    </> : saved ? <><p className="gx-t-strong">Your club: {clubName(saved.club)}</p><DistanceLine guess={saved}/></> : <p className="gx-t-meta">{closed ? 'No locked guess' : 'Open'}</p>}
    {closed && draft.local && !locked ? <p className="gx-t-meta">Your unsaved draft: {draft.club ? clubName(draft.club) : 'No club'} {priceText(parsePrice(draft.price))}. It was not locked.</p> : null}
    {others.length ? <details><summary>Revealed guesses · {others.length}</summary><ul className="gx-epl-revealed">{others.map(g => <li key={g.ownerId}><span>{g.name || data.ownerNames?.[g.ownerId] || g.ownerId} · {clubName(g.club)} {priceText(g.price)}</span><span>{g.state === 'scored' ? `${g.distance} points off` : g.state === 'unscored' ? 'Unscored' : 'Reference pending'}</span></li>)}</ul></details> : <p className="gx-t-meta">{revealed ? 'No other locked guesses available.' : 'Other guesses appear after you lock this match or it kicks off.'}</p>}
  </Card>;
}

export function GuessList({ state, now, selected, onSelect, onEdit, onSave, onReload, onWeek, onNavigate, guardNavigation = true, id = 'epl-guess' }) {
  const data = state.data;
  if (!data) return state.status === 'loading' ? <Skeleton label="Loading moneyline guesses" shape="panels" count={2}/> : <section className="gx-empty"><p>{guessProblem(state.error)}</p><Button haptic={false} onClick={onReload}>Try again</Button></section>;
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
    <Button haptic={false} variant="secondary" disabled={state.busy} onClick={onReload}>{state.busy ? 'Loading saved guesses…' : state.uncertain ? 'Check saved guesses' : 'Refresh saved guesses'}</Button>
    <Card><p className="gx-t-strong">{locked} of {ordered.length} locked</p><div className="gx-epl-guess-progress" role="img" aria-label={`${locked} of ${ordered.length} matches locked`}>{ordered.map(f => <i key={f.eventId} className={ownGuess(data, f.eventId)?.status === 'locked' ? 'gx-epl-guess-dot--locked' : undefined}/>)}</div><p className="gx-t-meta">2-way moneyline · draw = push</p></Card>
    {hero && data.available && data.ownerId ? <GuessCard key={hero.eventId} id={`${id}-hero`} hero fixture={hero} data={data} saved={ownGuess(data, hero.eventId)} now={now}
      draft={{ club: ownGuess(data, hero.eventId)?.club ?? '', price: String(ownGuess(data, hero.eventId)?.price ?? '+100'), ...state.drafts[hero.eventId] }}
      busy={state.busy || state.uncertain || state.status !== 'ready'} pending={state.busy} onEdit={patch => onEdit(hero.eventId, patch)} onSave={lock => onSave(hero.eventId, lock)}/> : null}
    {open.length > 1 && data.available && data.ownerId ? <Card><h3 className="gx-t-section">Other matches</h3><ul className="gx-epl-guess-later">{open.filter(f => f !== hero).map(f => <li key={f.eventId}><Button haptic={false} block disabled={state.busy || state.uncertain} onClick={() => onSelect(f.eventId)}><span className="real-moneyline-next-match"><Crest code={f.away}/><span>{clubName(f.away)}<small>at {clubName(f.home)}</small></span><Crest code={f.home}/></span>{state.drafts[f.eventId] ? ' · unsaved draft' : ownGuess(data, f.eventId) ? ' · draft saved' : ''}</Button></li>)}</ul></Card> : null}
    {ordered.filter(f => f !== hero || !data.available || !data.ownerId).filter(f => !data.ownerId || !data.available || ownGuess(data, f.eventId)?.status === 'locked' || isClosed(f, now)).map((f, index) => <GuessCard key={f.eventId} id={`${id}-result-${index}`} fixture={f} data={data} now={now} saved={ownGuess(data, f.eventId)} draft={{ ...state.drafts[f.eventId], local: Boolean(state.drafts[f.eventId]) }}/>) }
    {!ordered.length ? <p className="gx-t-body">No fixtures are available for this matchweek.</p> : null}
    {onNavigate ? <Button haptic={false} variant="ghost" disabled={state.busy || state.uncertain} onClick={() => { if (!guardNavigation || !Object.keys(state.drafts).length || true) onNavigate({ tab: 'play', section: 'leaderboard' }); }}>Moneyline leaderboard</Button> : null}
  </div>;
}

export function GuessLeaderboard({ data }) {
  const max = Math.max(1, ...data.rows.map(r => Number.isFinite(r.average) ? r.average : 0));
  return <Card as="section"><h2 className="gx-t-section"><span className="gx-t-n-m">{data.season}</span> moneyline leaderboard</h2><p className="gx-t-meta">Lowest average distance wins · ties favor more matches guessed. Only locked matches past kickoff count. Unscored matches are excluded.</p>
    {data.rows.length ? <ol className="gx-epl-moneyline-ranks">{data.rows.map((row, index) => <li key={row.ownerId} data-example-owner={row.ownerId}>
      <div className="gx-epl-moneyline-rank"><strong>{Number.isFinite(row.average) ? `${index + 1}.` : '—'} {row.name || row.ownerId}</strong><strong className="gx-t-n-m">{Number.isFinite(row.average) ? row.average.toFixed(1) : '—'}</strong></div>
      <meter min="0" max={max} value={Number.isFinite(row.average) ? row.average : 0} aria-label={`${row.name || row.ownerId} average distance`} hidden={!Number.isFinite(row.average)}/>
      <p className="gx-t-meta">{row.guessed} guessed · {row.unscored} unscored{!Number.isFinite(row.average) ? ' · not ranked' : ' · points off per match'}</p>
    </li>)}</ol> : <p>No scored guesses yet.</p>}
  </Card>;
}
