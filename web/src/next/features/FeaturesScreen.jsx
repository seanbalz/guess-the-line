// Play › Badges and awards (redesign stage 71; D-35; Sean's P5A, D-69): a nesting layer with two tiles on top (your
// streaks; the newest week's awards and what you won), the badge grid (earned first, then the ones to earn, dashed, the
// rarity word under each, ×count, NEW while its moment waits) and the Season winners row. Each opens its own layer with
// its own address (layers.js): your streaks, the week's awards with the earlier weeks, the season winners and one badge
// (BadgeLayer.jsx). It reads POST /league/features for the league showing and draws only what the server sent: nothing
// before the job has run, no sample data, and a badge only from its game's kickoff. Fine print is behind ⓘ.
import { useId } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { INFO } from '../info.js';
import { useShell } from '../shell/context.js';
import { Badge, Button, Card, DriveMeter, InfoButton, Pill, Row, Skeleton } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { PlayLayer } from '../play/PlayLayer.jsx';
import { PlayTile } from '../play/PlayTile.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';
import { badgeMeta, earnedText } from './model.js';
import { AwardRows } from './AwardRows.jsx';
import { BadgeLayer } from './BadgeLayer.jsx';
import { FEATURES_COPY, awardsTile, earlierRange, featuresLayer, featuresView, seasonLine, streakLine, streakMeterLabel, streakTile } from './layers.js';
import { pickStreakMoment } from './streakMoment.js';
import { useFeatures } from './useFeatures.js';
import './features.css';

export { FEATURES_COPY };
// One award as a row lives in AwardRows.jsx (the League's recap post draws it too); it is re-exported here.
export { AwardRows };

// Task 1's `usePopped` is true only when the pop happens while this element is on screen, so going back to a tile
// never replays it.
const usePopOnce = id => usePopped(id ?? '');

/** Loading, coming soon (no features route) or the failure with Try again, in the layer's own card. */
function FeaturesState({ features, shape, count }) {
  if (features.off) return <Card><p className="gx-t-body">{FEATURES_COPY.off}</p></Card>;
  if (features.error) return <LeagueFailure error={features.error} onRetry={features.retry}/>;
  return <Skeleton label={FEATURES_COPY.loading} shape={shape} count={count}/>;
}

function BadgeTile({ badge, isNew, onOpen }) {
  const label = `${badge.name}, ${badge.rarityLabel}, ${badge.earned ? earnedText(badge.count).toLowerCase() : `not earned yet. ${badge.rule}`}${isNew ? ', new' : ''}`;
  return (
    <li>
      <button type="button" className="gx-fx-tile" aria-label={label} data-badge={badge.id} onClick={onOpen}>
        <Badge iconPath={badge.icon} rarity={badge.rarity} locked={!badge.earned}/>
        <span className="gx-t-label gx-fx-tile-name">{badge.name}</span>
        <span className="gx-t-meta gx-c-2">{badge.rarityLabel}{badge.count > 1 ? ` · ×${badge.count}` : ''}</span>
        {isNew ? <Pill tone="accent">New</Pill> : null}
      </button>
    </li>
  );
}

function TopLayer({ model, streakId, waiting, onOpen }) {
  const id = useId();
  const popped = usePopOnce(streakId);
  const streak = streakTile(model.streaks.find(s => s.id === 'pick')), awards = awardsTile(model.recap);
  const fresh = new Set(waiting.filter(m => m.kind === 'badge').map(m => m.badge));
  const { earned, toEarn, of } = model.shelf;
  return <>
    <div className="gx-fx-tiles">
      <div className="gx-fx-slot" data-features="streaks-tile" data-moment={popped ? 'pop' : undefined}>
        <PlayTile label={FEATURES_COPY.streaks} icon="flame" big={streak.big} sub={streak.sub} isNew={waiting.some(m => m.kind === 'streak')} ariaLabel={streak.ariaLabel} onClick={() => onOpen('streaks')}/>
      </div>
      <div className="gx-fx-slot" data-features="awards-tile">
        <PlayTile label={awards.label} icon="trophy" big={awards.big} sub={awards.sub} tone={awards.tone} isNew={waiting.some(m => m.kind === 'award')} ariaLabel={awards.ariaLabel} onClick={() => onOpen('awards')}/>
      </div>
    </div>
    <section className="gx-fx-badges" aria-labelledby={id} data-features="shelf">
      <div className="gx-fx-head"><h3 className="gx-t-section" id={id}>{FEATURES_COPY.badges}</h3><span className="gx-t-meta gx-c-2">{FEATURES_COPY.earnedOf(earned.length, of)}</span></div>
      {earned.length ? null : <p className="gx-t-body gx-c-2">{FEATURES_COPY.noBadges}</p>}
      <ul className="gx-fx-grid" aria-label={FEATURES_COPY.badges}>
        {[...earned, ...toEarn].map(b => <BadgeTile key={b.id} badge={b} isNew={fresh.has(b.id)} onOpen={() => onOpen('badge', { badge: b.id })}/>)}
      </ul>
    </section>
    <Row title={FEATURES_COPY.seasonTitle} sub={seasonLine(model.season)} chevron onClick={() => onOpen('season')} data-features="season-row"/>
  </>;
}

function StreaksLayer({ model, account, streakId }) {
  const popped = usePopOnce(streakId);
  return (
    <ul className="gx-fx-streaks" aria-label={FEATURES_COPY.streaks} data-features="streaks">
      {model.streaks.map(s => (
        <li key={s.id} className="gx-fx-streak" data-streak={s.id} data-moment={s.id === 'pick' && popped ? 'pop' : undefined}>
          <span className="gx-fx-streak-head"><span className="gx-t-strong">{s.name}</span><CountUp className="gx-n-l" value={s.current} account={account} figure={`features.streak.${s.id}`}/></span>
          <DriveMeter value={s.current} label={streakMeterLabel(s)}/>
          <span className="gx-t-meta gx-c-2">{streakLine(s)}</span>
        </li>
      ))}
    </ul>
  );
}

function AwardsLayer({ model }) {
  if (!model.recap) return <p className="gx-t-body gx-c-2">{FEATURES_COPY.noRecap}</p>;
  return <div className="gx-vstack gx-gap-12" data-features="awards">
    <AwardRows rows={model.recap.rows} label={FEATURES_COPY.awards(model.recap.week)}/>
    {model.history.length ? (
      <details className="gx-fx-more">
        <summary className="gx-t-strong">{FEATURES_COPY.earlier}<span className="gx-t-meta gx-c-2">{earlierRange(model.history)}</span></summary>
        {model.history.map(w => <section key={w.week} className="gx-fx-week" aria-label={FEATURES_COPY.awards(w.week)}><h3 className="gx-t-strong gx-fx-head">Week {w.week}</h3><AwardRows rows={w.rows} label={FEATURES_COPY.awards(w.week)}/></section>)}
      </details>
    ) : null}
  </div>;
}

function SeasonLayer({ model }) {
  return <div data-features="season">{model.season ? <AwardRows rows={model.season} label={FEATURES_COPY.seasonTitle}/> : <p className="gx-t-body gx-c-2">{FEATURES_COPY.season}</p>}</div>;
}

export function FeaturesScreen() {
  useMomentScope(SCOPES.features);
  const app = useAppData(), shell = useShell();
  const features = useFeatures(app, shell);
  const waiting = useNewMoments(SCOPES.features);
  const { model } = features;
  const open = (layer, options) => shell.setView('play', featuresView(layer, options));
  const parents = [{ key: 'features', label: FEATURES_COPY.title, open: () => open(null) }];
  const streakId = pickStreakMoment(features.data, app.accountId)?.id ?? null;
  const members = Array.isArray(app.community?.data?.members) ? app.community.data.members : [];
  const nameOf = id => members.find(m => m.id === id)?.displayName ?? 'Former member';
  // Another member's badge opens only for a member on the roster the board shows (the community members); an unknown
  // member, or one not on the board, is the grid, so a made-up link shows no stranger.
  const asked = featuresLayer(shell.state.views.play);
  const place = asked.layer === 'badge' && asked.member && asked.member !== app.accountId && !members.some(m => m.id === asked.member) ? featuresLayer(null) : asked;
  // One PlayLayer for every layer, so its card stays mounted: a new layer rises in and its heading takes focus (Nest).
  let title, body;
  if (place.layer === 'top') {
    title = FEATURES_COPY.title;
    body = <>
      <p className="gx-t-meta gx-c-2">{app.league?.name ?? 'Community'}</p>
      {model ? <TopLayer model={model} streakId={streakId} waiting={waiting} onOpen={open}/> : <FeaturesState features={features} shape="panels" count={2}/>}
      {!features.loading && !features.off ? <Button variant="ghost" onClick={features.retry}>Refresh</Button> : null}
    </>;
  } else if (place.layer === 'badge') {
    title = badgeMeta(place.badge).name;
    body = <BadgeLayer features={features} badge={place.badge} member={place.member} viewer={app.accountId} nameOf={nameOf}/>;
  } else {
    title = place.layer === 'streaks' ? FEATURES_COPY.streaks : place.layer === 'season' ? FEATURES_COPY.seasonTitle : model?.recap ? FEATURES_COPY.awards(model.recap.week) : FEATURES_COPY.weekly;
    body = !model ? <FeaturesState features={features} shape="rows" count={3}/>
      : place.layer === 'streaks' ? <StreaksLayer model={model} account={app.accountId} streakId={streakId}/>
      : place.layer === 'season' ? <SeasonLayer model={model}/> : <AwardsLayer model={model}/>;
  }
  const top = place.layer === 'top';
  return (
    <div className="gx-screen" data-landing="features" data-features-layer={place.layer}>
      <PlayLayer label={FEATURES_COPY.title} parents={top ? [] : parents} layer={top ? 'features' : `features:${place.layer}${place.badge ? `:${place.badge}@${place.member ?? ''}` : ''}`} title={title}
        info={top ? <InfoButton title={INFO.features.title} body={INFO.features.body}/> : undefined}>{body}</PlayLayer>
    </div>
  );
}
