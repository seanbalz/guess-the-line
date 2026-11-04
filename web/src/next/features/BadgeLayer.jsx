// Play › Badges and awards › one badge (D-69 section 4.1: the `sh.badge` sheet becomes a layer with its own address):
// the 96 tile (dashed when not earned), its rarity in words, its rule, how often it was earned and when ("Week 6 · SEA @
// DEN · Total 41 exact", the game as marks), newest first. Another member's badge (from the League board) names them.
// FeaturesScreen draws it inside its one PlayLayer (the badge's name is the heading), so the card stays mounted and
// its heading takes focus when the layer opens.
import { Badge, Card, Skeleton } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { BadgeLine } from './BadgeLine.jsx';
import { FEATURES_COPY } from './layers.js';
import { badgeMeta, earnedText } from './model.js';

/** `features` is useFeatures' result; `member` another member's id or null; `nameOf(id)` a member's display name. */
export function BadgeLayer({ features, badge, member, viewer, nameOf }) {
  const meta = badgeMeta(badge);
  const who = member && member !== viewer ? member : viewer;
  const owner = who === viewer ? null : nameOf(who);
  const earned = features.model?.badgesOf(who).find(b => b.id === badge) ?? null;
  const count = earned?.count ?? 0;
  const state = features.model ? <p className="gx-t-strong">{owner ? `${owner}: ${earnedText(count).toLowerCase()}` : earnedText(count)}</p>
    : features.off ? <Card><p className="gx-t-body">{FEATURES_COPY.off}</p></Card>
    : features.error ? <LeagueFailure error={features.error} onRetry={features.retry}/>
    : <Skeleton label={FEATURES_COPY.loading} shape="lines" count={2}/>;
  return <>
    <div className="gx-fx-detail" data-features="badge">
      <Badge iconPath={meta.icon} size={96} rarity={meta.rarity} locked={!earned}/>
      <p className="gx-t-micro gx-c-2">{meta.rarityLabel}</p>
      <p className="gx-t-body">{meta.rule}</p>
      {state}
    </div>
    {earned?.lines.length ? <ul className="gx-fx-lines" aria-label={`When ${meta.name} was earned`}>{earned.lines.map((line, index) => <li key={line} className="gx-t-body gx-c-2"><BadgeLine parts={earned.parts[index]}/></li>)}</ul> : null}
  </>;
}
