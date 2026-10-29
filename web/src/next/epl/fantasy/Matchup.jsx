// Research › Fantasy › Matchup (mockups v3 "Research · Fantasy"): the hero card with both projected totals in glass
// bubbles, the gradient win-chance bar and "Win chance N%" (the ⓘ explains the 18-point estimate); your starters with
// a position tag, crest, name, projection bar and value ("No projection" when Sleeper has none); and projected vs actual
// for the last 4 matchweeks as paired bars, a missing week an em dash. Sleeper lists no matchups for this league, so the
// opponent is inferred from the repeating schedule once a full repeat has been scored and agrees
// (cloud/epl-fantasy-view.mjs); otherwise "Matchup unavailable this week" and the reason's sentence.
import { useId } from 'react';
import { Card, InfoButton } from '../../ui/index.js';
import { Crest } from '../DraftBoard.jsx';
import { DASH, FANTASY_COPY, fmtPts, pct } from './fantasyModel.js';

const finite = x => typeof x === 'number' && Number.isFinite(x);

export function ClubMark({ club, clubText }) {
  if (club) return <Crest code={club} size="sm" named/>;
  return clubText ? <span className="gx-epl-crest gx-epl-crest--sm gx-epl-crest--code">{clubText}</span> : <span className="gx-epl-fx-noclub" aria-hidden="true"></span>;
}

function Bubble({ name, value, me = false }) {
  return <div className={me ? 'gx-epl-fx-bubble gx-epl-fx-bubble--me' : 'gx-epl-fx-bubble'}>
    <span className="gx-epl-fx-bubble-name">{name ?? DASH}</span>
    <span className="gx-epl-fx-bubble-num">{fmtPts(value)}</span>
  </div>;
}

function StarterList({ starters }) {
  const widest = Math.max(1, ...starters.map(s => s.proj).filter(finite));
  return <ul className="gx-epl-fx-players">
    {starters.map(s => <li key={s.playerId} className="gx-epl-fx-player">
      <span className="gx-epl-fx-pos">{s.pos ?? DASH}</span>
      <ClubMark club={s.club} clubText={s.clubText}/>
      <span className="gx-epl-fx-player-name">{s.name ?? FANTASY_COPY.unknownPlayer}</span>
      {finite(s.proj)
        ? <><span className="gx-tc-bar gx-epl-fx-player-bar" aria-hidden="true"><span className="gx-tc-bar-fill" style={{ width: `${Math.round((Math.max(0, s.proj) / widest) * 100)}%` }}></span></span>
          <span className="gx-epl-fx-num">{fmtPts(s.proj)}</span></>
        : <span className="gx-epl-fx-none">{FANTASY_COPY.noProjection}</span>}
    </li>)}
  </ul>;
}

function RecentBars({ recent }) {
  const widest = Math.max(1, ...recent.flatMap(r => [r.projected, r.actual]).filter(finite));
  const bar = (value, kind) => (finite(value)
    ? <span className={`gx-epl-fx-pair gx-epl-fx-pair--${kind}`}><span className="gx-epl-fx-pair-fill" style={{ width: `${Math.round((Math.max(0, value) / widest) * 100)}%` }}></span></span>
    : <span className={`gx-epl-fx-pair gx-epl-fx-pair--${kind} gx-epl-fx-pair--gap`}></span>);
  return <>
    <ul className="gx-epl-fx-recent">
      {recent.map(r => <li key={r.week} className="gx-epl-fx-recent-row">
        <span className="gx-epl-fx-recent-week">MW{r.week}</span>
        <span className="gx-epl-fx-num">{fmtPts(r.projected)}</span>
        <span className="gx-epl-fx-num">{fmtPts(r.actual)}</span>
        <span className="gx-epl-fx-pairs" aria-hidden="true">{bar(r.projected, 'proj')}{bar(r.actual, 'actual')}</span>
      </li>)}
    </ul>
    <p className="gx-epl-fx-legend">
      <span className="gx-epl-fx-key gx-epl-fx-key--proj">{FANTASY_COPY.projected}</span>
      <span className="gx-epl-fx-key gx-epl-fx-key--actual">{FANTASY_COPY.actual}</span>
    </p>
    {recent.some(r => !finite(r.projected) || !finite(r.actual)) ? <p className="gx-t-meta gx-c-2">{FANTASY_COPY.gapNote}</p> : null}
  </>;
}

export function MatchupPanel({ view }) {
  const base = useId();
  const m = view.matchup ?? { unavailable: true, starters: [], recent: [] };
  const chance = pct(m.winChance);
  return <div className="gx-epl-fx-stack">
    <Card as="section" variant="hero" className="gx-epl-hero" aria-labelledby={`${base}-hero`}>
      <h2 className="gx-t-micro gx-epl-kicker" id={`${base}-hero`}>{FANTASY_COPY.kicker(m.week ?? view.week)}</h2>
      {m.unavailable
        ? <>
          <p className="gx-epl-headline">{FANTASY_COPY.unavailable}</p>
          <p className="gx-t-meta gx-epl-hero-meta">{FANTASY_COPY.unavailableBody(m.reason)}</p>
          {m.me ? <div className="gx-epl-fx-vs"><Bubble name={`${FANTASY_COPY.yourProjection} · ${m.me.name}`} value={m.myProj} me/></div> : null}
        </>
        : <>
          <div className="gx-epl-fx-vs">
            <Bubble name={m.me.name} value={m.myProj} me/>
            <span className="gx-epl-fx-vs-word">{FANTASY_COPY.vs}</span>
            <Bubble name={m.opp.name} value={m.oppProj}/>
          </div>
          {chance === null ? null : <>
            <span className="gx-epl-fx-chance" aria-hidden="true"><span className="gx-epl-fx-chance-fill" style={{ width: `${chance}%` }}></span></span>
            <div className="gx-epl-fx-chance-line">
              <p className="gx-epl-fx-chance-text">{FANTASY_COPY.winChance(chance)}</p>
              <InfoButton title={FANTASY_COPY.winInfoTitle} body={FANTASY_COPY.winInfo}/>
            </div>
          </>}
          {Array.isArray(m.matched) && m.matched.length === 2 ? <p className="gx-t-meta gx-epl-hero-meta">{FANTASY_COPY.basis(m.matched[0], m.matched[1])}</p> : null}
        </>}
    </Card>
    {m.starters?.length ? <Card as="section" aria-labelledby={`${base}-starters`}>
      <h2 className="gx-t-micro gx-c-2" id={`${base}-starters`}>{FANTASY_COPY.starters}</h2>
      <StarterList starters={m.starters}/>
    </Card> : null}
    {m.recent?.length ? <Card as="section" aria-labelledby={`${base}-recent`}>
      <h2 className="gx-t-micro gx-c-2" id={`${base}-recent`}>{FANTASY_COPY.recent}</h2>
      <RecentBars recent={m.recent}/>
    </Card> : null}
  </div>;
}
