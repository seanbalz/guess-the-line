// Research (D-69 step 3, spec 5A, built for Sean's review): one next-move card, this week's games and lines (the week
// meter its one picture, one meta line, the screen's one lime button), or the latest week's results once every game has
// kicked off; then four tiles in two columns. It reads only the shared Community read and this device's saved trends;
// the server's clock, never the device's, says which games have kicked off.
import { useId } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Meter, Skeleton, TeamMark, Tile, useEntrance } from '../ui/index.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useServerNow } from '../home/useServerNow.js';
import { LANDING_COPY, lastKickoffOf, researchClock, researchHero, researchTiles } from './researchModel.js';
import { RESEARCH_NAMES, openSection, tileId } from './researchNav.js';
import '../ui/focusLanding.css';
import './landing.css';

function NextMove({ hero, onOpen }) {
  const id = useId();
  return <Card as="section" variant="hero" className="gx-r-hero" aria-labelledby={id} data-research="hero" data-kind={hero.kind}>
    <p className="gx-t-micro gx-r-hero-eyebrow" id={id}>{hero.eyebrow}</p>
    <h2 className="gx-t-title">{hero.title}</h2>
    {hero.meter ? <Meter value={hero.meter.done} max={hero.meter.of} className="gx-r-hero-meter"/> : null}
    <p className="gx-t-meta" data-research="hero-line">{hero.line}</p>
    <Button variant="primary" block onClick={onOpen}>{hero.action}</Button>
  </Card>;
}

export function ResearchLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
  const { data, status, error, at } = app.community;
  const saved = useSavedTrends().items;
  // `at`: when the Community read landed, so a return here on an older read counts from the server's time now.
  const now = useServerNow(data ? researchClock(data) : null, at, { until: lastKickoffOf(data) });
  const hero = data ? researchHero(data, now) : null;
  const loading = !data && status !== 'error';
  const retry = () => app.refresh({ only: ['community'] });
  return <section className="gx-screen gx-r-landing" data-landing="research">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{RESEARCH_NAMES.title}</h1></div>
    {hero ? <NextMove hero={hero} onOpen={() => openSection(shell, hero.target)}/>
      : loading ? <Skeleton label={LANDING_COPY.loading} shape="landing" hero="meter" count={4} className="gx-r-skel"/>
      : <Card variant="s2" role="alert" data-research="failed"><p className="gx-t-body">{LANDING_COPY.failed}</p><Button onClick={retry}>{LANDING_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <p className="gx-t-body" role="status">{LANDING_COPY.refreshFailed} <Button variant="ghost" onClick={retry}>{LANDING_COPY.refresh}</Button></p> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Research sections" data-research="tiles">
      {researchTiles({ community: data, now, saved }).map(tile => <li key={tile.key} data-tile={tile.key}>
        <Tile id={tileId(tile.key)} label={tile.label} icon={tile.icon} big={tile.big} sub={tile.sub} ariaLabel={tile.ariaLabel}
          picture={tile.next ? <><TeamMark code={tile.next.awayCode} size={24} decorative/><TeamMark code={tile.next.homeCode} size={24} decorative/></> : null}
          onClick={() => openSection(shell, tile.open.section, tile.open)}/></li>)}
    </ul>}
  </section>;
}
