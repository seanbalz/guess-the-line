import { Button, Card, Segmented } from '../../ui/index.js';
import { Crest } from '../DraftBoard.jsx';
import { clubName } from '../clubName.js';
import { fmtWhen } from '../../format.js';
import { MARKET_LABELS, boardMarkets, draftPick, guessMarket, isClosed, marketAware, parsePrice, priceText, validDraft, visibleGuesses } from './guessModel.js';
import PriceStepper from './PriceStepper.jsx';
import DistanceLine from './DistanceLine.jsx';

const MARKET_HELP = Object.freeze({
  draw_no_bet: 'Draw no bet · pick a club; a draw is a push.',
  three_way: '3-way · pick home, draw or away; a draw is its own result.',
});
/** A saved or revealed guess's pick in words: a club, or Draw, with the market when the server is market-aware. */
export function pickLabel(g, fixture, aware = true) {
  const market = guessMarket(g), name = market === 'three_way' && g.outcome === 'draw' ? 'Draw' : clubName(g.club ?? draftPick(g, fixture).club ?? '');
  return aware ? `${name} · ${MARKET_LABELS[market]}` : name;
}

export default function GuessCard({ fixture, data, saved, draft, hero, busy, pending, now, onEdit, onSave, id }) {
  const closed = isClosed(fixture, now), locked = saved?.status === 'locked';
  const canEdit = hero && data.available && data.ownerId && !closed && !locked;
  const markets = boardMarkets(data), aware = marketAware(data), pick = draftPick(draft, fixture);
  const valid = validDraft(draft, fixture, data) && (aware || pick.market === 'draw_no_bet');
  const others = visibleGuesses(data, fixture, now).filter(g => g.ownerId !== data.ownerId);
  const revealed = locked || fixture.kickedOff === true || Date.parse(fixture.commenceTime) <= now;
  const threeWay = pick.market === 'three_way';
  const outcomes = threeWay ? [['away', fixture.away], ['draw', null], ['home', fixture.home]] : [['away', fixture.away], ['home', fixture.home]];
  const chosen = outcome => threeWay ? pick.outcome === outcome : pick.club === (outcome === 'home' ? fixture.home : fixture.away);
  const choose = outcome => onEdit(threeWay ? { outcome } : { club: outcome === 'home' ? fixture.home : fixture.away });
  const switchMarket = market => onEdit(market === 'three_way' ? { market, outcome: pick.outcome ?? '' } : { market, club: pick.club ?? '' });
  return <Card as="section" variant={hero ? 'hero' : 'default'} className="gx-epl-guess-card" aria-labelledby={`${id}-title`}>
    <p data-epl-text="metadata" className="gx-t-meta">{fmtWhen(fixture.commenceTime)} · {locked ? 'Locked · final' : closed ? 'Entry closed' : 'Locks at kickoff'}</p>
    <h2 className="gx-epl-guess-match gx-t-section" id={`${id}-title`}><span><Crest code={fixture.away}/>{clubName(fixture.away)}</span><span className="gx-t-meta">at</span><span><Crest code={fixture.home}/>{clubName(fixture.home)}</span></h2>
    {canEdit ? <>
      <fieldset disabled={busy} className="gx-epl-favorite"><legend className="gx-t-strong">{threeWay ? 'Pick one result' : 'Who’s the favorite?'}</legend>
        {markets.includes('three_way') ? <Segmented className="gx-epl-guess-market" label="Moneyline market" value={pick.market} onChange={switchMarket}
          options={markets.map(value => ({ value, label: MARKET_LABELS[value] }))}/> : null}
        <div className={`gx-epl-guess-outcomes${threeWay ? ' gx-epl-guess-outcomes--three' : ''}`}>{outcomes.map(([outcome, club]) => <button className={`gx-epl-guess-club${chosen(outcome) ? ' gx-epl-guess-club--selected' : ''}`} key={outcome} type="button" aria-pressed={chosen(outcome)} onClick={() => choose(outcome)}>{club ? <><Crest code={club}/>{clubName(club)}</> : 'Draw'}</button>)}</div>
        {markets.includes('three_way') ? <p className="gx-t-body">{MARKET_HELP[pick.market]}</p> : null}
      </fieldset>
      <PriceStepper id={`${id}-price`} value={draft.price} onChange={price => onEdit({ price })} disabled={busy}/>
      <Button variant="primary" block disabled={busy || !valid} onClick={() => onSave(true)}>{pending ? 'Checking saved guess…' : busy ? 'Entry paused' : 'Lock in'}</Button>
      <p className="gx-t-body">Final once locked · market, pick and price lock together · measured vs the real price at lock-in</p>
      <Button variant="ghost" disabled={busy || !valid} onClick={() => onSave(false)}>Save draft</Button>
      {saved?.status === 'draft' ? <p className="gx-t-body">A saved draft is not locked or scored.</p> : null}
    </> : saved ? <><p className="gx-t-strong">{guessMarket(saved) === 'three_way' ? `Your pick: ${pickLabel(saved, fixture)}` : `Your club: ${aware ? pickLabel(saved, fixture) : clubName(saved.club)}`}</p><DistanceLine guess={saved}/></> : <p data-epl-text="metadata" className="gx-t-meta">{closed ? 'No locked guess' : 'Open'}</p>}
    {closed && draft.local && !locked ? <p className="gx-t-body">Your unsaved draft: {pick.market === 'three_way' ? (pick.outcome ? pickLabel({ ...pick }, fixture) : 'No result') : pick.club ? clubName(pick.club) : 'No club'} {priceText(parsePrice(draft.price))}. It was not locked.</p> : null}
    {others.length ? <details><summary>Revealed guesses · {others.length}</summary><ul className="gx-epl-revealed">{others.map(g => <li key={g.ownerId}><span>{g.name || data.ownerNames?.[g.ownerId] || g.ownerId} · {pickLabel(g, fixture, aware)} {priceText(g.price)}</span><span>{g.state === 'scored' ? `${g.distance} points off` : g.state === 'unscored' ? 'Unscored' : 'Reference pending'}</span></li>)}</ul></details> : <p className="gx-t-body">{revealed ? 'No other locked guesses available.' : 'Other guesses appear after you lock this match or it kicks off.'}</p>}
  </Card>;
}
