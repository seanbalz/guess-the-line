// Bets › Your gap › one gap (D-69 step 4): a nesting card under the Your gap lip with its own address
// (`#bets/recommended?layer=gap&item=SEA-DEN:total`). It holds what the old Recommended card opened to: your guess and the
// latest consensus, the gap's historical size (D-81), the market's historical trends, both sides against your guess
// (text-labelled traffic lights: D-81's historical top quarter),
// the suggested side and its saved quote, Track this bet and Play with Virtual Units, and the review card. A selection
// whose row has left the list (a filter, the top three, a kickoff) is still reviewed here.
import { useRef } from 'react';
import { Circle } from 'lucide-react';
import { Button, Icon, MetaLine, Nest, Skeleton, useLayerFocus } from '../../ui/index.js';
import { MINUS, SEP, fmtNum, fmtWhen } from '../../format.js';
import { BETS_NAMES, gapTitle } from '../betsNav.js';
import { gapSizeLabel } from '../../../../../shared/nfl-gap-scale.mjs';
import { GAP_COPY, gapSize, marketNumber, quoteAge, sideName, termsText } from './gapModel.js';
import { GapMessages } from './GapParts.jsx';
import { GapReview } from './GapReview.jsx';
import { GapTrends } from './GapTrends.jsx';

const GLYPH = Object.freeze({ green: 'plus', red: 'minus' });

function GapDetail({ gap, row, selection, pick }) {
  const { game, market, reference, evaluations } = row, home = game.homeCode || game.home;
  const busy = gap.busy || gap.loading || Boolean(gap.uncertain), sides = market === 'spread' ? ['away', 'home'] : ['over', 'under'];
  const current = gap.data.games.find(g => g.id === game.id) ?? game;
  return <>
    <MetaLine parts={[`Kickoff ${fmtWhen(game.kickoff)}`]}/>
    <MetaLine parts={[`Gap size ${gapSize(row)}`, gapSizeLabel(row.gapScore), `${fmtNum(row.gap)} pt gap`]}/>
    <dl className="gx-gap-compare">
      <div className="gx-nest-tile"><dt className="gx-nest-tile-label">{`Your guess${market === 'spread' ? `${SEP}${home}` : ''}`}</dt><dd className="gx-n-l">{marketNumber(market, row.guess)}</dd></div>
      <div className="gx-nest-tile"><dt className="gx-nest-tile-label">{`Latest consensus${market === 'spread' ? `${SEP}${home}` : ''}`}</dt><dd className="gx-n-l">{marketNumber(market, reference.value)}</dd></div>
    </dl>
    <p className="gx-t-meta">{[reference.source || 'Named-book median', `${reference.books} books`, fmtWhen(reference.observedAt), quoteAge(reference.observedAt, gap.now)].join(SEP)}</p>
    <GapTrends season={gap.data.season} week={gap.data.week} gameId={game.id} market={market} consensus={reference.value}/>
    <ul className="gx-gap-sides" aria-label="How each side compares with your guess">{sides.map(side => { const e = evaluations[side];
      return <li key={side} className="gx-gap-side" data-side={side} data-value-color={e.color}>
        <span className="gx-t-strong">{sideName(game, market, side)}</span>
        <span className="gx-gap-side-word"><Icon icon={GLYPH[e.color] ?? Circle} size={16}/>{e.label}</span>
        <span className="gx-t-meta">{`${e.advantage > 0 ? '+' : e.advantage < 0 ? MINUS : ''}${fmtNum(Math.abs(e.advantage))} pts vs your guess`}</span></li>; })}</ul>
    <div className="gx-vstack gx-gap-4">
      <p className="gx-t-strong">Suggested: {sideName(game, market, row.side)}</p>
      <p className="gx-t-meta">{row.offer ? `Saved quote: ${termsText(game, market, row.side, row.offer)}${SEP}${quoteAge(row.offer.observedAt, gap.now)}` : GAP_COPY.noQuote}</p>
    </div>
    <div className="gx-gap-layer-actions">
      {gap.canTrack ? <Button icon="plus" disabled={busy || !row.offer} onClick={() => gap.track(row)}>Track this bet</Button> : null}
      <Button icon={pick || selection ? 'check' : 'plus'} disabled={busy || !row.offer || Boolean(pick) || Boolean(selection)} onClick={() => gap.add(row)}>{pick ? 'Virtual pick saved' : selection ? 'Review below' : 'Play with Virtual Units'}</Button>
    </div>
    {pick ? <p className="gx-t-body" data-gap="saved">Saved: {termsText(game, market, pick.selection.side, pick.selection, pick.selection.units)}</p> : null}
    {selection ? <GapReview gap={gap} game={current} market={market} selection={selection} pick={pick}/> : null}
  </>;
}

export function GapLayer({ gap, item, onClose }) {
  const root = useRef(null);
  useLayerFocus(root);
  const row = gap.ranked.rows.find(r => r.key === item) ?? null, selection = gap.selections[item] ?? null, pick = gap.picks[item] ?? null;
  const title = gapTitle(item), game = selection ? gap.data?.games.find(g => g.id === selection.gameId) : undefined; // a game that left the read is Closed, as in the list
  return <section ref={root} className="gx-screen gx-bets" data-bets-layer="gap" data-gap-item={item}>
    <h1 className="gx-t-title">{BETS_NAMES.gap}</h1>
    <GapMessages gap={gap}/>
    <Nest label={title} lips={[{ key: 'gap', label: BETS_NAMES.gap, onOpen: onClose }]} layer={`gap:${item}`} title={title}>
      {!gap.data ? (gap.loading ? <Skeleton label={GAP_COPY.loading} shape="panels" count={2}/> : null)
        : row ? <GapDetail gap={gap} row={row} selection={selection} pick={pick}/>
        : selection ? <><p className="gx-t-meta">{GAP_COPY.unsavedStays}</p><GapReview gap={gap} game={game} market={selection.market} selection={selection} pick={pick}/></>
        : <p className="gx-t-body">{GAP_COPY.gone}</p>}
    </Nest>
  </section>;
}
