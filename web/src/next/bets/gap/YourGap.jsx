// Bets › Your gap (D-69 step 4, spec 6 "rebuilt as tiles and rows on the same data", built for Sean's review): the old
// app's VirtualUnits.jsx Recommended view in the new app. D-77's record is its first card, as main draws it in the new
// app (GapRecord.jsx: the hit-rate ring, the record period, the gap-size filter and each graded gap), then the market
// switch, four tiles, your gaps as picture rows ranked by D-81's historical gap size (one opens as a layer at its own
// address: GapLayer.jsx), your card's unsaved selections and your saved virtual card. With the D-82 flag on, the market
// switch adds Player Props, which draws the prop record in place of the gaps. useGap.js holds the state, gapModel.js
// every rule. The old app keeps VirtualUnits.jsx.
import { useLayoutEffect, useRef } from 'react';
import { Button, InfoButton, KeptParent, PictureRow, Segmented, Skeleton, useEntrance, useLayerFocus } from '../../ui/index.js';
import { INFO } from '../../info.js';
import { SEP, plural } from '../../format.js';
import { useAppData } from '../../data/AppData.jsx';
import { useShell } from '../../shell/context.js';
import { betsLayerOf } from '../../shell/state.js';
import { recommendationMarket } from '../../../../../shared/recommended-bets.mjs';
import { BETS_NAMES, closeGap, gapRowId, openGap } from '../betsNav.js';
import { useGap } from './useGap.js';
import { GapLayer } from './GapLayer.jsx';
import { GAP_COPY, gapRow, gapTiles, noneForMarket, pendingRows, savedRows, showAllLabel, weekOptions } from './gapModel.js';
import { GapMessages, marks } from './GapParts.jsx';
import { GapRecord } from '../GapRecord.jsx';
import { PROPS_GAP_MARKET, playerPropsEnabled, withPlayerProps } from '../../props/flag.js';
import './gap.css';

const MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];

/** The screen's title and its ⓘ (the ranking, D-81's scale and its source): the same over the gaps and Player Props. */
function GapHeading() {
  return <header className="gx-bets-heading"><div className="gx-bets-titlebar">
    <h1 id="gx-b-gap-title" className="gx-t-title gx-grow" tabIndex={-1} data-route-focus>{BETS_NAMES.gap}</h1>
    <InfoButton {...INFO.recommended}/></div></header>;
}

/**
 * Choosing Player Props (or leaving it) draws the other screen under the same title; the chosen market keeps focus there,
 * after the screen's own heading focus (useLayerFocus) has run. One Your gap shows at a time, so one flag serves it.
 */
const marketFocus = { pending: false };
function useMarketFocus(group) {
  useLayoutEffect(() => {
    if (!marketFocus.pending) return;
    marketFocus.pending = false;
    group.current?.querySelector('[aria-pressed="true"]')?.focus();
  }, []); // once per mount, after the heading's focus
}

export function GapList({ gap, market, markets = MARKETS, messages = true, accountId = null, onSignInAgain, onMarket, onOpen }) {
  const root = useRef(null), group = useRef(null), enter = useEntrance();
  useLayerFocus(root);
  useMarketFocus(group);
  const { data, shown, ranked, historical, expanded } = gap;
  const visible = historical ? [] : shown.visible, shownKeys = new Set(visible.map(r => r.key));
  const actionable = shown.rows.filter(r => r.actionable).length, options = weekOptions(gap.info);
  const showAllMarkets = () => { onMarket('all'); group.current?.querySelector('button')?.focus(); };
  const pending = data && !historical ? pendingRows(gap.selections, shownKeys, data, gap.now) : [], saved = data ? savedRows(data) : [];
  return <section ref={root} className="gx-screen gx-bets" aria-labelledby="gx-b-gap-title" data-bets-section="gap">
    <GapHeading/>
    {messages ? <GapMessages gap={gap}/> : null}
    {!data && gap.loading ? <Skeleton label={GAP_COPY.loading} shape="rows" count={4} className="gx-gap-skel"/> : null}
    {data ? <section className="gx-vstack gx-gap-16" aria-label={GAP_COPY.region} data-gap="list">
      {/* D-77's record, as main draws it (GapRecord.jsx): its period (Week, This season, All time, Custom) is kept per
          account through a week change and a refresh (useGap); it remounts per account and week, as main's did. */}
      {gap.gaps ? <div data-gap="hero"><GapRecord key={`${accountId}:${gap.gapWeek}`} record={gap.gaps} board={gap.gapBoard} season={data.season} week={data.week}
        slates={gap.info?.slates} market={market} accountId={accountId || data.playerId} onSignInAgain={onSignInAgain}
        periodSelection={gap.period} onPeriodSelectionChange={gap.choosePeriod}/></div> : null}
      {options.length > 1 ? <label className="gx-gap-week gx-t-body">Week<select aria-label={GAP_COPY.week} value={gap.selectedWeek ? `${gap.selectedWeek.season}:${gap.selectedWeek.week}` : 'current'}
        disabled={gap.busy || gap.loading} onChange={event => gap.changeWeek(event.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label> : null}
      {historical ? <p className="gx-t-body" role="status">{GAP_COPY.historical}</p>
        : ranked.status !== 'ready' ? <div className="gx-vstack gx-gap-8" role="status"><p className="gx-t-body">{GAP_COPY.mismatch}</p><Button onClick={gap.refresh}>{GAP_COPY.refreshRecs}</Button></div>
        : <>
          <div ref={group}><Segmented label="Recommendation market" value={market} onChange={onMarket} options={markets}/></div>
          <ul className="gx-tiles" aria-label="Your gaps in numbers" data-gap="tiles">{gapTiles({ rows: shown.rows, picks: data.picks || [] }).map(t => <li key={t.key}>
            <div className="gx-nest-tile gx-gap-stat" data-gap-tile={t.key}><span className="gx-nest-tile-label">{t.label}</span><span className="gx-n-l gx-nest-num">{t.big}</span><span className="gx-t-meta gx-tile-sub">{t.sub}</span></div></li>)}</ul>
          <div className="gx-gap-head"><h2 className="gx-t-section">{expanded ? GAP_COPY.all : actionable ? GAP_COPY.top : GAP_COPY.topDiff}</h2><span className="gx-t-meta">{`${plural(shown.rows.length, 'gap')}${SEP}Week ${data.week}`}</span></div>
          {visible.length ? <ol className="gx-prows gx-stagger" data-enter={enter} aria-label="Gaps">{visible.map(row => { const r = gapRow(row, { selection: gap.selections[row.key], now: gap.now });
            return <li key={r.item}><PictureRow id={gapRowId(r.item)} data-gap-row={r.item} data-market={r.market} picture={marks(r.away, r.home)} title={r.title} meta={r.meta}
              value={r.value} word={r.word} tone={r.tone} ariaLabel={r.ariaLabel} onClick={() => onOpen(r.item)}/></li>; })}</ol>
            : market === 'all' ? <p className="gx-t-body" role="status">{GAP_COPY.none}</p>
            : <div className="gx-vstack gx-gap-8" role="status"><p className="gx-t-body">{noneForMarket(market)}</p><Button onClick={showAllMarkets}>{GAP_COPY.viewAll}</Button></div>}
          {shown.rows.length > 3 ? <Button aria-expanded={expanded} onClick={() => gap.setExpanded(value => !value)}>{expanded ? GAP_COPY.showTop : showAllLabel(shown.rows.length)}</Button> : null}
          {pending.length ? <section className="gx-vstack gx-gap-8" aria-label={GAP_COPY.yourCard} data-gap="your-card"><h2 className="gx-t-section">{GAP_COPY.yourCard}</h2>
            <ol className="gx-prows">{pending.map(r => <li key={r.item}><PictureRow id={`${gapRowId(r.item)}-card`} data-gap-card={r.item} picture={marks(r.away, r.home)} title={r.title} meta={r.meta}
              value={r.value} word={r.word} tone={r.tone} ariaLabel={r.ariaLabel} onClick={() => onOpen(r.item)}/></li>)}</ol></section> : null}
          {ranked.counts.locked > 0 || ranked.counts.missingReference > 0 ? <p className="gx-t-meta">{GAP_COPY.leftOut}</p> : null}
        </>}
      {saved.length ? <section className="gx-vstack gx-gap-8" aria-label={GAP_COPY.savedCard} data-gap="saved-card">
        <div className="gx-gap-head"><h2 className="gx-t-section">{GAP_COPY.savedCard}</h2><span className="gx-t-meta">{`${saved.length} saved${SEP}Week ${data.week}`}</span></div>
        <p className="gx-t-meta">{GAP_COPY.savedNote}</p>
        <ol className="gx-prows">{saved.map(r => <li key={r.key}><PictureRow data-saved={r.key} picture={marks(r.away, r.home)} title={r.title} meta={r.meta} value={r.value} word={r.word} tone={r.tone}/></li>)}</ol>
      </section> : null}
    </section> : null}
    <Button variant="ghost" onClick={gap.refresh} disabled={gap.loading || gap.busy} aria-busy={gap.loading}>{gap.loading ? GAP_COPY.refreshing : GAP_COPY.refresh}</Button>
  </section>;
}

/**
 * D-82, Player Props (flag on only): the market switch, then the prop record (accuracy per stat and its own paper record,
 * a lazy chunk inside GapRecord.jsx) for the Community's week. No recommendation read: as on main, the gaps' state is not
 * mounted while Player Props shows.
 */
export function PropsGap({ markets, season, week, accountId, onSignInAgain, onMarket }) {
  const root = useRef(null), group = useRef(null);
  useLayerFocus(root);
  useMarketFocus(group);
  return <section ref={root} className="gx-screen gx-bets" aria-labelledby="gx-b-gap-title" data-bets-section="gap" data-gap-market={PROPS_GAP_MARKET}>
    <GapHeading/>
    <div ref={group}><Segmented label="Recommendation market" value={PROPS_GAP_MARKET} onChange={onMarket} options={markets}/></div>
    <GapRecord market={PROPS_GAP_MARKET} accountId={accountId} season={season} week={week} onSignInAgain={onSignInAgain}/>
  </section>;
}

/** The gaps: the state (useGap) for the list and the gap layer; the list stays mounted, hidden, under the layer. */
function GameGap({ market, markets, onMarket, onTrackTicket, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  const gap = useGap({ accountId: app.accountId, market, onDirty, onSaved, onSignInAgain: app.requestSignIn, onTrackTicket, confirm: () => shell.confirmLeave() });
  const open = betsLayerOf(route);
  const layer = open ? <GapLayer gap={gap} item={open.item} onClose={() => closeGap(shell)}/> : null;
  return <KeptParent layer={layer}><GapList gap={gap} market={market} markets={markets} messages={!open} accountId={app.accountId} onSignInAgain={app.requestSignIn}
    onMarket={onMarket} onOpen={item => openGap(shell, item)}/></KeptParent>;
}

/** Bets › Your gap: the gaps, or Player Props while its flag is on and it is the chosen market. */
export default function YourGap({ onTrackTicket, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  // BETS-NEXT-01: All / Spreads / Totals is a Bets view preference: it survives a review and a return within Bets. The
  // gaps' own list reads 'props' as All; Player Props shows only while its flag is on (D-82).
  const market = recommendationMarket(route.recommendedMarket);
  const propsOn = playerPropsEnabled(), propsSelected = propsOn && route.recommendedMarket === PROPS_GAP_MARKET;
  const markets = withPlayerProps(MARKETS, PROPS_GAP_MARKET, propsOn);
  const onMarket = value => {
    marketFocus.pending = propsOn && (value === PROPS_GAP_MARKET) !== propsSelected;
    shell.setView('bets', { recommendedMarket: value });
  };
  const week = app.community?.data?.week;
  return propsSelected ? <PropsGap markets={markets} season={week?.season} week={week?.week} accountId={app.accountId} onSignInAgain={app.requestSignIn} onMarket={onMarket}/>
    : <GameGap market={market} markets={markets} onMarket={onMarket} onTrackTicket={onTrackTicket} onDirty={onDirty} onSaved={onSaved}/>;
}
