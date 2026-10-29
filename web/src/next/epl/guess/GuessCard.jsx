import { Button, Card } from '../../ui/index.js';
import { Crest } from '../DraftBoard.jsx';
import { fmtWhen } from '../../format.js';
import { isClosed, parsePrice, priceText, visibleGuesses } from './guessModel.js';
import { validPrice } from '../../../../../shared/epl-moneyline.mjs';
import PriceStepper from './PriceStepper.jsx';
import DistanceLine from './DistanceLine.jsx';

export default function GuessCard({ fixture, data, saved, draft, hero, busy, pending, now, onEdit, onSave, id }) {
  const closed = isClosed(fixture, now), locked = saved?.status === 'locked';
  const canEdit = hero && data.available && data.ownerId && !closed && !locked;
  const valid = [fixture.home, fixture.away].includes(draft.club) && validPrice(parsePrice(draft.price));
  const others = visibleGuesses(data, fixture, now).filter(g => g.ownerId !== data.ownerId);
  const revealed = locked || fixture.kickedOff === true || Date.parse(fixture.commenceTime) <= now;
  return <Card as="section" variant={hero ? 'hero' : 'default'} className="gx-epl-guess-card" aria-labelledby={`${id}-title`}>
    <p className="gx-t-meta">{fmtWhen(fixture.commenceTime)} · {locked ? 'Locked · final' : closed ? 'Entry closed' : 'Locks at kickoff'}</p>
    <h2 className="gx-epl-guess-match gx-t-section" id={`${id}-title`}><span><Crest code={fixture.away}/>{fixture.away}</span><span className="gx-t-meta">at</span><span><Crest code={fixture.home}/>{fixture.home}</span></h2>
    {canEdit ? <>
      <fieldset disabled={busy} className="gx-epl-favorite"><legend className="gx-t-strong">Who’s the favorite?</legend>
        <div>{[fixture.away, fixture.home].map(club => <button className={`gx-epl-guess-club${draft.club === club ? ' gx-epl-guess-club--selected' : ''}`} key={club} type="button" aria-pressed={draft.club === club} onClick={() => onEdit({ club })}>{club}</button>)}</div>
      </fieldset>
      <PriceStepper id={`${id}-price`} value={draft.price} onChange={price => onEdit({ price })} disabled={busy}/>
      <Button variant="primary" block disabled={busy || !valid} onClick={() => onSave(true)}>{pending ? 'Checking saved guess…' : busy ? 'Entry paused' : 'Lock in'}</Button>
      <p className="gx-t-meta">Final once locked · measured vs the real price at lock-in</p>
      <Button variant="ghost" disabled={busy || !valid} onClick={() => onSave(false)}>Save draft</Button>
      {saved?.status === 'draft' ? <p className="gx-t-meta">A saved draft is not locked or scored.</p> : null}
    </> : saved ? <><p className="gx-t-strong">Your club: {saved.club}</p><DistanceLine guess={saved}/></> : <p className="gx-t-meta">{closed ? 'No locked guess' : 'Open'}</p>}
    {closed && draft.local && !locked ? <p className="gx-t-meta">Your unsaved draft: {draft.club || 'No club'} {priceText(parsePrice(draft.price))}. It was not locked.</p> : null}
    {others.length ? <details><summary>Revealed guesses · {others.length}</summary><ul className="gx-epl-revealed">{others.map(g => <li key={g.ownerId}><span>{g.name || data.ownerNames?.[g.ownerId] || g.ownerId} · {g.club} {priceText(g.price)}</span><span>{g.state === 'scored' ? `${g.distance} points off` : g.state === 'unscored' ? 'Unscored' : 'Reference pending'}</span></li>)}</ul></details> : <p className="gx-t-meta">{revealed ? 'No other locked guesses available.' : 'Other guesses appear after you lock this match or it kicks off.'}</p>}
  </Card>;
}
