// One gap's review card (D-69 step 4; the old Virtual Units card's terms, D-18 and the #140 salvage): the side chosen with
// the exact quote reviewed (line, price, book and when it was seen), the units, and the one placement. A refresh that
// brings a newer quote for that side shows it apart; it applies only through "Use updated quote". Units change only the
// stake. At kickoff by the server's clock it closes and keeps the terms. A market locked in a newer read shows its lock
// sentence and no controls (D-36).
import { Button, Chip, ChipRail, IconButton, LockLine } from '../../ui/index.js';
import { SEP, fmtNum, fmtOdds, fmtU, fmtWhen } from '../../format.js';
import { lineLocked } from '../../copy.js';
import { UNIT_CHIPS, stepUnits } from '../place.js';
import { GAP_COPY, MARKET_NAME, closedLine, closedReason, lineText, sameQuote, termsText } from './gapModel.js';
import '../place.css';

export function GapReview({ gap, game, market, selection, pick }) {
  const key = `${selection.gameId}:${market}`, busy = gap.busy || gap.loading || Boolean(gap.uncertain);
  if (game?.locked?.[market]) return <div data-gap="review" data-locked="true"><LockLine as="p" className="gx-t-meta">{lineLocked(market, gap.data?.rules)}</LockLine></div>;
  const reason = closedReason(game, gap.now, gap.data?.results?.[selection.gameId]);
  const terms = `${termsText(selection.game ?? game, market, selection.side, selection.offer, selection.units)}${SEP}quoted ${fmtWhen(selection.offer.observedAt)}`;
  if (reason) return <div className="gx-vstack gx-gap-8" data-gap="review">
    <LockLine as="p" className="gx-t-body" role="status">{closedLine(reason)}</LockLine>
    <p className="gx-t-meta">Your selection: {terms}</p>
    <Button disabled={gap.busy || Boolean(gap.uncertain)} onClick={() => gap.remove(key)}>Remove from card</Button>
  </div>;
  const offers = game.offers?.[market] || {}, latest = offers[selection.side], updated = Boolean(latest) && !sameQuote(selection.offer, latest);
  const sides = market === 'spread' ? ['away', 'home'] : ['over', 'under'];
  return <div className="gx-vstack gx-gap-12" role="group" data-gap="review" aria-label={`Review ${game.awayCode} at ${game.homeCode} ${market} virtual pick`}>
    <p className="gx-t-label">{GAP_COPY.reviewLabel}</p>
    <p className="gx-t-body" data-gap="selected">Your selected quote: {terms}</p>
    {updated ? <><p className="gx-t-meta">Updated quote: {termsText(game, market, selection.side, latest)}{SEP}quoted {fmtWhen(latest.observedAt)}</p>
      <Button disabled={busy} onClick={() => gap.choose(game, market, selection.side, selection.units)}>Use updated quote</Button></> : null}
    <ChipRail label={`${MARKET_NAME[market]} sides`} className="gx-place-sides">{sides.map(side => { const offer = offers[side];
      return <Chip key={side} tall selected={selection.side === side} disabled={!offer || busy} onClick={() => gap.choose(game, market, side, selection.units)}
        label={offer ? `${lineText(game, market, side, offer.line)}, ${fmtOdds(offer.odds)}, ${offer.source}` : `${lineText(game, market, side)}, no saved quote`}>
        <span className="gx-place-chip"><span className="gx-n-s">{lineText(game, market, side, offer?.line)}</span>
          <span className="gx-t-meta gx-c-2">{offer ? `${fmtOdds(offer.odds)}${SEP}${offer.source}` : 'No saved quote'}</span></span></Chip>; })}</ChipRail>
    <ChipRail label={`${MARKET_NAME[market]} units`} className="gx-place-units">{UNIT_CHIPS.map(value => <Chip key={value} selected={selection.units === value} disabled={busy}
      label={`${fmtNum(value)} units`} onClick={() => gap.changeUnits(key, value)}>{fmtU(value)}</Chip>)}</ChipRail>
    <div className="gx-hstack gx-gap-8 gx-place-stepper">
      <IconButton icon="minus" label="Decrease units" onClick={() => gap.changeUnits(key, stepUnits(selection.units, -1))} disabled={busy || selection.units <= 0.5}/>
      <span className="gx-n-xs" aria-live="polite">{fmtU(selection.units)}</span>
      <IconButton icon="plus" label="Increase units" onClick={() => gap.changeUnits(key, stepUnits(selection.units, 1))} disabled={busy}/>
    </div>
    <Button variant="primary" block disabled={busy} onClick={() => gap.save(key)}>{gap.busy ? 'Saving…' : pick ? 'Save edit' : 'Place virtual pick'}</Button>
  </div>;
}
