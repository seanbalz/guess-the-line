// Approved Prism Research: one native matchup notebook, four destinations and a sourced historical chart.
// The shared personal read and server clock select the game; historical scoring is the existing fingerprinted
// public subset. No player guesses, invented quotes or fixture series enter the landing.
import { useId } from 'react';
import { teamOf } from '../../../../shared/lines-view.mjs';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, CardButton, Icon, InfoButton, Meter, NextMoveCard, Skeleton, StaleLine, TeamMark, useEntrance } from '../ui/index.js';
import { MiniArea } from '../charts/TrendRow.jsx';
import scoringTrend from '../home/scoring-trend.json';
import { fmtWhen } from '../format.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useServerNow } from '../home/useServerNow.js';
import { LANDING_COPY, clockUntil, researchClock, researchHero, researchTiles } from './researchModel.js';
import { HERO_ACTION_ID, RESEARCH_NAMES, gameView, openSection, tileId } from './researchNav.js';
import '../ui/focusLanding.css';
import '../ui/tile.css';
import './landing.css';

/** This area's destination cards consume the shared card material/gloss without changing the shared Tile primitive. */
function ResearchDestination({ tile, next, onOpen }) {
  const matchup = tile.next ?? (tile.key === 'teams' ? next : null);
  const picture = matchup ? <><TeamMark code={matchup.awayCode} size={32} decorative/><TeamMark code={matchup.homeCode} size={32} decorative/></>
    : tile.key === 'trends' ? <MiniArea values={scoringTrend.values}/> : null;
  return <CardButton id={tileId(tile.key)} className="gx-nest-tile gx-tile" aria-label={tile.ariaLabel} onClick={onOpen}>
    <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">{tile.label}</span><Icon icon={tile.icon} size={20}/></span>
    {picture ? <span className="gx-tile-pic" aria-hidden="true">{picture}</span> : null}
    <span className="gx-n-l gx-nest-num">{tile.big}</span><span className="gx-tile-foot"><span className="gx-t-meta gx-tile-sub gx-tile-sub--plain">{tile.sub}</span></span>
  </CardButton>;
}

export function ResearchLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
  const titleId = useId();
  const personal = useSharedRead('personal');
  const { data, status, error, at } = personal ?? {};
  const saved = useSavedTrends().items;
  // A 404 is a week with nothing published: the no-week card, not a failure.
  const none = !data && status === 'error' && error?.status === 404;
  const failed = !data && status === 'error' && !none;
  const loading = !data && !none && !failed;
  // `at`: when the /personal read landed, so a return here on an older read counts from the server's time now.
  const now = useServerNow(data ? researchClock(data) : null, at, { until: clockUntil(data) });
  const hero = data ? researchHero(data, now) : none ? researchHero(null, null) : null;
  const tiles = researchTiles({ personal: data, now, saved, failed }), next = tiles.find(tile => tile.key === 'games')?.next;
  const retry = () => app.refresh({ only: ['personal'] });
  return <section className="gx-screen gx-r-landing" data-landing="research">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{RESEARCH_NAMES.title}</h1></div>
    {hero && next ? <Card className="gx-r-notebook gx-r-hero" data-research="hero" data-kind={hero.kind} aria-labelledby={titleId}>
      <p id={titleId} className="gx-t-label gx-c-2">Matchup notebook · Week {hero.week}</p><h2 className="gx-t-title">Know the matchup.</h2>
      <div className="gx-r-hero-matchup"><span><TeamMark code={next.awayCode} size={48} decorative/><strong>{teamOf(next.awayCode).nick}</strong></span><span className="gx-t-meta gx-c-2">at</span><span><TeamMark code={next.homeCode} size={48} decorative/><strong>{teamOf(next.homeCode).nick}</strong></span></div>
      <p className="gx-t-meta gx-c-2" data-research="hero-line">{fmtWhen(next.kickoff)} · {hero.line}</p>
      <Button id={HERO_ACTION_ID} variant="primary" block onClick={() => openSection(shell, 'games', gameView(next.id))}>Open game</Button>
    </Card> : hero ? <NextMoveCard className="gx-r-hero" data-research="hero" data-kind={hero.kind} eyebrow={hero.eyebrow} title={hero.title}
      picture={hero.meter ? <Meter value={hero.meter.done} max={hero.meter.of}/> : null} line={hero.line} lineProps={{ 'data-research': 'hero-line' }}
      action={{ id: HERO_ACTION_ID, label: hero.action, onClick: () => openSection(shell, hero.target) }}/>
      : loading ? <Skeleton label={LANDING_COPY.loading} shape="landing" hero="meter" count={4} className="gx-r-skel"/>
      : <Card variant="s2" role="alert" data-research="failed"><p className="gx-t-body">{LANDING_COPY.failed}</p><Button onClick={retry}>{LANDING_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <StaleLine onRefresh={retry}/> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Research sections" data-research="tiles">
      {tiles.map(tile => <li key={tile.key} data-tile={tile.key}>
        <ResearchDestination tile={tile} next={next} onOpen={() => openSection(shell, tile.open.section, tile.open)}/></li>)}
    </ul>}
    {!loading ? <Card as="section" className="gx-r-recent" aria-label="Recent historical scoring">
      <div className="gx-r-context"><h2 className="gx-t-section gx-grow">Historical scoring</h2><InfoButton title="About historical league scoring" body={[scoringTrend.meaning, `${scoringTrend.season}, weeks ${scoringTrend.weeks.join(', ')}. Average combined points per completed game: ${scoringTrend.values.join(', ')}.`, scoringTrend.source.credit, scoringTrend.source.modified]} links={[{ text: 'nflverse schedules', url: scoringTrend.source.url }, { text: scoringTrend.source.license, url: scoringTrend.source.licenseUrl }]}/></div>
      <p className="gx-t-meta gx-c-2">{scoringTrend.season} · Weeks {scoringTrend.weeks[0]}–{scoringTrend.weeks.at(-1)} · average combined points</p>
      <MiniArea values={scoringTrend.values}/><Button variant="secondary" onClick={() => openSection(shell, 'trends')}>Read the trends</Button>
    </Card> : null}
  </section>;
}
