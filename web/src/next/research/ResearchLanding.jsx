// Research (D-69 step 3, spec 5A, built for Sean's review): one next-move card, this week's games and lines (the week
// meter its one picture, one meta line, the screen's one lime button), or the latest week's results once every game has
// kicked off; then four tiles in two columns. It reads only the shared /personal read (the week, its games and the server's clock, as Home's This week does) and this
// device's saved trends;
// the server's clock, never the device's, says which games have kicked off.
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Meter, NextMoveCard, Skeleton, StaleLine, TeamMark, Tile, useEntrance } from '../ui/index.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useServerNow } from '../home/useServerNow.js';
import { LANDING_COPY, clockUntil, researchClock, researchHero, researchTiles } from './researchModel.js';
import { HERO_ACTION_ID, RESEARCH_NAMES, openSection, tileId } from './researchNav.js';
import '../ui/focusLanding.css';
import './landing.css';

export function ResearchLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
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
  const retry = () => app.refresh({ only: ['personal'] });
  return <section className="gx-screen gx-r-landing" data-landing="research">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{RESEARCH_NAMES.title}</h1></div>
    {hero ? <NextMoveCard className="gx-r-hero" data-research="hero" data-kind={hero.kind} eyebrow={hero.eyebrow} title={hero.title}
      picture={hero.meter ? <Meter value={hero.meter.done} max={hero.meter.of}/> : null} line={hero.line} lineProps={{ 'data-research': 'hero-line' }}
      action={{ id: HERO_ACTION_ID, label: hero.action, onClick: () => openSection(shell, hero.target) }}/>
      : loading ? <Skeleton label={LANDING_COPY.loading} shape="landing" hero="meter" count={4} className="gx-r-skel"/>
      : <Card variant="s2" role="alert" data-research="failed"><p className="gx-t-body">{LANDING_COPY.failed}</p><Button onClick={retry}>{LANDING_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <StaleLine onRefresh={retry}/> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Research sections" data-research="tiles">
      {researchTiles({ personal: data, now, saved, failed }).map(tile => <li key={tile.key} data-tile={tile.key}>
        <Tile id={tileId(tile.key)} label={tile.label} icon={tile.icon} big={tile.big} sub={tile.sub} ariaLabel={tile.ariaLabel}
          picture={tile.next ? <><TeamMark code={tile.next.awayCode} size={24} decorative/><TeamMark code={tile.next.homeCode} size={24} decorative/></> : null}
          onClick={() => openSection(shell, tile.open.section, tile.open)}/></li>)}
    </ul>}
  </section>;
}
