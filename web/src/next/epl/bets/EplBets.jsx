// EPL Bets (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 3): automatic recommendations from this account's own
// locked moneyline guesses versus the latest stored same-market odds. One read of stored evidence per visit or refresh;
// opening the screen never asks a sportsbook provider for prices. Favorable gap alone orders the cards (the server's
// order is kept as it arrives); the trend line and concern pills explain or flag, never reorder or hide a card.
import { useEffect, useState } from 'react';
import { Button, Card, Pill, Skeleton } from '../../ui/index.js';
import { eplApi } from '../api.js';
import { Crest } from '../DraftBoard.jsx';
import { clubName } from '../clubName.js';
import { fmtWhen } from '../../format.js';
import { priceText } from '../guess/guessModel.js';
import './bets.css';

export const MARKET_NAMES = Object.freeze({ draw_no_bet: 'Draw no bet', three_way: '3-way moneyline' });
export const CONCERN_COPY = Object.freeze({
  stale_price: 'Latest price is over 12 hours old',
  few_books: 'Only two books priced this',
  large_gap: 'Unusually large gap · check the price',
  shortening: 'Price has shortened since first stored',
  reference_pending: 'Your scoring reference is still pending',
  kickoff_soon: 'Kicks off within an hour',
});
export const BETS_EXPLANATION = 'Your guess is your estimate of the sportsbook price, not an estimated chance that the result happens. A favorable gap means the latest price pays more than you guessed; it is not proof that a bet is profitable.';

const UNAVAILABLE = Object.freeze({
  no_week: 'No Premier League matchweek is stored yet.',
  schema_unavailable: 'EPL Bets recommendations aren’t available in this app version yet.',
  other: 'EPL Bets recommendations aren’t available right now.',
});
const pickName = item => item.outcome === 'draw' ? 'Draw' : clubName(item.club);
const trendText = trend => !trend ? null : trend.direction === 'flat'
  ? `Unchanged at ${priceText(trend.to)} across ${trend.observations} stored ${trend.observations === 1 ? 'price' : 'prices'}`
  : `${priceText(trend.from)} first stored → ${priceText(trend.to)} latest · ${Math.abs(trend.change)} points ${trend.direction} across ${trend.observations} stored prices`;

export function RecommendationCard({ item, id }) {
  return <Card as="article" className="gx-epl-bet" aria-labelledby={`${id}-title`}>
    <p data-epl-text="metadata" className="gx-t-meta">{fmtWhen(item.commenceTime)} · {MARKET_NAMES[item.market]}</p>
    <h2 className="gx-epl-guess-match gx-t-section" id={`${id}-title`}><span><Crest code={item.away}/>{clubName(item.away)}</span><span className="gx-t-meta">at</span><span><Crest code={item.home}/>{clubName(item.home)}</span></h2>
    <p className="gx-t-strong">Pick: {pickName(item)} · {MARKET_NAMES[item.market]}</p>
    <div className="gx-epl-guess-values"><span>Your locked guess <strong>{priceText(item.price)}</strong></span><span>Latest price <strong>{priceText(item.latestPrice)}</strong></span></div>
    <p className="gx-epl-bet-gap"><strong className="gx-t-n-m">{item.gap}</strong> points in your favor</p>
    <p data-epl-text="metadata" className="gx-t-meta">{item.source} · {item.books} books · {fmtWhen(item.latestObservedAt)}</p>
    {trendText(item.trend) ? <p className="gx-t-body">{trendText(item.trend)}</p> : null}
    {item.concerns.length ? <ul className="gx-epl-bet-concerns" aria-label="Things to check">{item.concerns.map(c => <li key={c}><Pill tone="pending">{CONCERN_COPY[c] ?? c}</Pill></li>)}</ul> : null}
  </Card>;
}

export function BetsList({ data, onReload, busy, onOpenGuess, onOpenPick }) {
  if (!data.available) return <section className="gx-empty gx-epl-shell-notice"><p className="gx-t-body">{UNAVAILABLE[data.reason] ?? UNAVAILABLE.other}</p></section>;
  return <div className="gx-epl-bets">
    <Card as="section" aria-labelledby="epl-bets-about"><h2 className="gx-t-section" id="epl-bets-about">From your locked guesses · Matchweek <span className="gx-t-n-m">{data.week}</span></h2>
      <p className="gx-t-body">Each card compares the price you locked with the latest stored median for the same market. Cards are ordered by favorable gap only.</p>
      <p className="gx-t-body">{BETS_EXPLANATION}</p>
    </Card>
    {!data.ownerId ? <p className="gx-t-body">Link an FEPL manager in Pick a Team to get recommendations from your own guesses.</p>
      : data.items.length ? <ol className="gx-epl-bet-list">{data.items.map((item, index) => <li key={item.eventId}><RecommendationCard item={item} id={`epl-bet-${index}`}/></li>)}</ol>
      : <p className="gx-t-body">{!data.locked ? 'Lock moneyline guesses on upcoming matches to see recommendations.' : data.unpriced === data.locked ? 'Waiting for verified prices for your locked guesses.' : 'No favorable gaps right now.'}</p>}
    {!data.items.length && data.ownerId && onOpenGuess ? <Button onClick={onOpenGuess}>Go to Guess the Line</Button> : null}
    {!data.ownerId && onOpenPick ? <Button onClick={onOpenPick}>Open Pick a Team</Button> : null}
    {data.ownerId && (data.withoutGap || data.unpriced) ? <p data-epl-text="metadata" className="gx-t-meta">{data.withoutGap} locked {data.withoutGap === 1 ? 'guess has' : 'guesses have'} no favorable gap · {data.unpriced} without a stored price yet</p> : null}
    <Button variant="secondary" disabled={busy} onClick={onReload}>{busy ? 'Loading…' : 'Refresh saved prices'}</Button>
  </div>;
}

/** Account-scoped: `accountId` keys the read, so a previous account's recommendations never flash. */
export default function EplBets({ api = eplApi, accountId, onOpenGuess, onOpenPick }) {
  const key = accountId ?? '';
  const [state, setState] = useState({ key: null, status: 'loading' }), [retry, setRetry] = useState(0);
  const shown = state.key === key ? state : { status: 'loading' };
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setState(previous => previous.key === key && previous.data ? { ...previous, busy: true } : { key, status: 'loading' });
    Promise.resolve().then(() => api('bets/read', {}, { signal: controller.signal })).then(data => {
      if (!data || typeof data.available !== 'boolean' || (data.available && !Array.isArray(data.items))) throw new Error('Invalid bets reply');
      if (active) setState({ key, status: 'ready', data, busy: false });
    }).catch(error => { if (active) setState({ key, status: 'error', error }); });
    return () => { active = false; controller.abort(); };
  }, [api, key, retry]);
  if (shown.status === 'loading') return <Skeleton label="Loading EPL Bets" shape="panels" count={2}/>;
  if (shown.status === 'error') return <section className="gx-empty"><p>{shown.error?.status === 401 ? 'Sign in again to read your recommendations.' : 'Could not load recommendations. Try again.'}</p><Button onClick={() => setRetry(n => n + 1)}>Try again</Button></section>;
  return <BetsList data={shown.data} busy={shown.busy} onReload={() => setRetry(n => n + 1)} onOpenGuess={onOpenGuess} onOpenPick={onOpenPick}/>;
}
