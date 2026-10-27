// Play › Badges and awards (redesign build plan stage 71; D-35): the week's recap (the newest week's awards), your
// streaks, your badge shelf and the badges still to earn, earlier weeks and the season winners. It reads
// POST /league/features for the league showing and draws only what the server sent: nothing before the job has run,
// no sample data, and a badge only from its game's kickoff. Fine print is behind ⓘ (rule 10).
import { useId } from 'react';
import { SEASON_FINAL_WEEK } from '../../../../shared/game-features/catalog.mjs';
import { useAppData } from '../data/AppData.jsx';
import { INFO } from '../info.js';
import { useShell } from '../shell/context.js';
import { Badge, Button, Card, DriveMeter, InfoButton } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { earnedText } from './model.js';
import { AwardRows } from './AwardRows.jsx';
import { useFeatures } from './useFeatures.js';
import './features.css';

export const FEATURES_COPY = Object.freeze({
  title: 'Badges and awards',
  loading: 'Loading badges and awards…',
  off: 'Badges and awards are coming soon.',
  noRecap: 'Weekly awards post here once every game of the week is final.',
  noBadges: 'No badges yet. Your first one is a guess away.',
  season: `Decided after Week ${SEASON_FINAL_WEEK}.`,
});

// One award as a row lives in AwardRows.jsx (the League's recap post draws it too); it is re-exported here.
export { AwardRows };

function RecapCard({ recap }) {
  const id = useId();
  if (!recap) return <Card as="section" aria-labelledby={id}><h2 className="gx-t-section" id={id}>This week’s awards</h2><p className="gx-t-body gx-c-2">{FEATURES_COPY.noRecap}</p></Card>;
  return (
    <Card as="section" variant="flush" aria-labelledby={id} data-features="recap">
      <div className="gx-fx-head"><h2 className="gx-t-section" id={id}>Week {recap.week} awards</h2>{recap.mine ? <span className="gx-t-meta gx-c-accent">You won {recap.mine.name}</span> : null}</div>
      <AwardRows rows={recap.rows} label={`Week ${recap.week} awards`}/>
    </Card>
  );
}

function Streaks({ streaks }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} data-features="streaks">
      <h2 className="gx-t-section" id={id}>Your streaks</h2>
      <ul className="gx-fx-streaks">
        {streaks.map(s => (
          <li key={s.id} className="gx-fx-streak">
            <span className="gx-t-strong gx-grow">{s.name}</span>
            <DriveMeter value={s.current}/>
            <span className="gx-n-s">{s.current}</span>
            <span className="gx-t-meta gx-c-2">{s.current === 1 ? s.unit.replace(/s$/, '') : s.unit} · Best {s.best}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BadgeTile({ badge, onOpen }) {
  const label = `${badge.name}, ${badge.rarityLabel}, ${badge.earned ? earnedText(badge.count).toLowerCase() : `not earned yet. ${badge.rule}`}`;
  return (
    <li>
      <button type="button" className="gx-fx-tile" aria-label={label} onClick={() => onOpen(badge.id)}>
        <Badge iconPath={badge.icon} rarity={badge.rarity} locked={!badge.earned}/>
        <span className="gx-t-label gx-fx-tile-name">{badge.name}</span>
        <span className="gx-t-meta gx-c-2">{badge.rarityLabel}{badge.count > 1 ? ` · ×${badge.count}` : ''}</span>
      </button>
    </li>
  );
}

function Shelf({ shelf, onOpen }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} data-features="shelf">
      <h2 className="gx-t-section" id={id}>Badges · {shelf.earned.length} of {shelf.of}</h2>
      {shelf.earned.length ? <ul className="gx-fx-shelf" aria-label="Earned badges">{shelf.earned.map(b => <BadgeTile key={b.id} badge={b} onOpen={onOpen}/>)}</ul>
        : <p className="gx-t-body gx-c-2">{FEATURES_COPY.noBadges}</p>}
      {shelf.toEarn.length ? <>
        <h3 className="gx-t-strong">To earn · {shelf.toEarn.length}</h3>
        <ul className="gx-fx-shelf" aria-label="Badges to earn">{shelf.toEarn.map(b => <BadgeTile key={b.id} badge={b} onOpen={onOpen}/>)}</ul>
      </> : null}
    </Card>
  );
}

export function FeaturesScreen() {
  const app = useAppData(), shell = useShell();
  const features = useFeatures(app, shell);
  const { model } = features;
  const open = badge => shell.openSheet('sh.badge', { badge, userId: app.accountId });
  return (
    <div className="gx-screen gx-vstack gx-gap-16" data-landing="features">
      <div className="gx-play-titlebar"><h1 className="gx-t-title gx-grow">{FEATURES_COPY.title}</h1><InfoButton title={INFO.features.title} body={INFO.features.body}/></div>
      <p className="gx-t-meta gx-c-2">{app.league?.name ?? 'Community'}</p>
      {features.loading ? <p className="gx-t-body gx-c-2" role="status">{FEATURES_COPY.loading}</p>
        : features.off ? <Card><p className="gx-t-body">{FEATURES_COPY.off}</p></Card>
        : features.error ? <LeagueFailure error={features.error} onRetry={features.retry}/>
        : model ? <>
          <RecapCard recap={model.recap}/>
          <Streaks streaks={model.streaks}/>
          <Shelf shelf={model.shelf} onOpen={open}/>
          {model.history.length ? (
            <details className="gx-fx-more">
              <summary className="gx-t-strong">Earlier weeks</summary>
              {model.history.map(w => <Card key={w.week} variant="flush" className="gx-fx-week"><h3 className="gx-t-strong gx-fx-head">Week {w.week}</h3><AwardRows rows={w.rows} label={`Week ${w.week} awards`}/></Card>)}
            </details>
          ) : null}
          <Card as="section" variant={model.season ? 'flush' : undefined} aria-label="Season winners" data-features="season">
            <h2 className="gx-t-section gx-fx-head">Season winners</h2>
            {model.season ? <AwardRows rows={model.season} label="Season winners"/> : <p className="gx-t-body gx-c-2">{FEATURES_COPY.season}</p>}
          </Card>
        </> : null}
      {!features.loading && !features.off ? <Button variant="ghost" onClick={features.retry}>Refresh</Button> : null}
    </div>
  );
}
