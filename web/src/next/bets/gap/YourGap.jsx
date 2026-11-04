// Bets › Your gap (D-69 step 4, spec 6 "rebuilt as tiles and rows on the same data", built for Sean's review): the old
// app's VirtualUnits.jsx Recommended view in the new app. D-77's hit-rate hero is its first card, then the market
// switch, four tiles, your gaps as picture rows (one opens as a layer at its own address: GapLayer.jsx), your card's
// unsaved selections and your saved virtual card. useGap.js holds the state, gapModel.js every rule. The old app keeps
// VirtualUnits.jsx.
import { useRef } from 'react';
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
import { GAP_COPY, GAP_FINE_PRINT, gapRow, gapTiles, noneForMarket, pendingRows, savedRows, showAllLabel, weekOptions } from './gapModel.js';
import { GapMessages, marks } from './GapParts.jsx';
import { GapHero } from './GapHero.jsx';
import './gap.css';

const MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];

export function GapList({ gap, market, messages = true, onMarket, onOpen }) {
  const root = useRef(null), group = useRef(null), enter = useEntrance();
  useLayerFocus(root);
  const { data, shown, ranked, historical, expanded } = gap;
  const visible = historical ? [] : shown.visible, shownKeys = new Set(visible.map(r => r.key));
  const actionable = shown.rows.filter(r => r.actionable).length, options = weekOptions(gap.info);
  const showAllMarkets = () => { onMarket('all'); group.current?.querySelector('button')?.focus(); };
  const pending = data && !historical ? pendingRows(gap.selections, shownKeys, data, gap.now) : [], saved = data ? savedRows(data) : [];
  return <section ref={root} className="gx-screen gx-bets" aria-labelledby="gx-b-gap-title" data-bets-section="gap">
    <header className="gx-bets-heading"><div className="gx-bets-titlebar">
      <h1 id="gx-b-gap-title" className="gx-t-title gx-grow" tabIndex={-1} data-route-focus>{BETS_NAMES.gap}</h1>
      <InfoButton title={INFO.recommended.title} body={[...INFO.recommended.body, GAP_FINE_PRINT.ranking]}/></div></header>
    {messages ? <GapMessages gap={gap}/> : null}
    {!data && gap.loading ? <Skeleton label={GAP_COPY.loading} shape="rows" count={4} className="gx-gap-skel"/> : null}
    {data ? <section className="gx-vstack gx-gap-16" aria-label={GAP_COPY.region} data-gap="list">
      {gap.gaps ? <GapHero record={gap.gaps} week={data.week}/> : null}
      {options.length > 1 ? <label className="gx-gap-week gx-t-body">Week<select aria-label={GAP_COPY.week} value={gap.selectedWeek ? `${gap.selectedWeek.season}:${gap.selectedWeek.week}` : 'current'}
        disabled={gap.busy || gap.loading} onChange={event => gap.changeWeek(event.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label> : null}
      {historical ? <p className="gx-t-body" role="status">{GAP_COPY.historical}</p>
        : ranked.status !== 'ready' ? <div className="gx-vstack gx-gap-8" role="status"><p className="gx-t-body">{GAP_COPY.mismatch}</p><Button onClick={gap.refresh}>{GAP_COPY.refreshRecs}</Button></div>
        : <>
          <div ref={group}><Segmented label="Recommendation market" value={market} onChange={onMarket} options={MARKETS}/></div>
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

/** Bets › Your gap: the state (useGap) for the list and the gap layer; the list stays mounted, hidden, under the layer. */
export default function YourGap({ onTrackTicket, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  // BETS-NEXT-01: All / Spreads / Totals is a Bets view preference: it survives a review and a return within Bets.
  const market = recommendationMarket(route.recommendedMarket);
  const gap = useGap({ accountId: app.accountId, market, onDirty, onSaved, onSignInAgain: app.requestSignIn, onTrackTicket, confirm: () => shell.confirmLeave() });
  const open = betsLayerOf(route);
  const layer = open ? <GapLayer gap={gap} item={open.item} onClose={() => closeGap(shell)}/> : null;
  return <KeptParent layer={layer}><GapList gap={gap} market={market} messages={!open} onMarket={value => shell.setView('bets', { recommendedMarket: value })} onOpen={item => openGap(shell, item)}/></KeptParent>;
}
