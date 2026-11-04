// Bets (D-69 step 4, spec 5A, built for Sean's review): one next-move card (place your picks while any game is still to
// kick off; otherwise track a bet), then five tiles in two columns. It reads only the app's shared reads (/personal for
// the week, your own ballots and the server's clock; the Community read for faces and sit-outs) and the ticket summary
// Home's My bets tile reads; no Bets, line or research read happens until a section opens.
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { AvatarStack, Button, Card, Meter, NextMoveCard, Skeleton, StaleLine, Tile, useEntrance } from '../ui/index.js';
import { useServerNow } from '../home/useServerNow.js';
import { useTicketSummary } from './useTicketSummary.js';
import { BETS_COPY, betsClock, betsHero, betsTiles, clockUntil } from './betsModel.js';
import { BETS_NAMES, HERO_ACTION_ID, openSection, openView, tileId } from './betsNav.js';
import '../ui/focusLanding.css';
import './landing.css';

export function BetsLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
  const personal = useSharedRead('personal');
  const tickets = useTicketSummary(app);
  const { data = null, status, error, at } = personal ?? {};
  // A 404 is a week with nothing published: the track card, not a failure.
  const none = !data && status === 'error' && error?.status === 404;
  const failed = !data && status === 'error' && !none;
  const loading = !data && !none && !failed;
  // `at`: when /personal landed, so a return here on an older read counts from the server's time now.
  const now = useServerNow(data ? betsClock(data) : null, at, { until: clockUntil(data) });
  const hero = data || none ? betsHero({ personal: data, tickets, viewer: app.accountId, now }) : null;
  const retry = () => app.refresh({ only: ['personal'] });
  const tiles = betsTiles({ personal: data, community: app.community?.data ?? null, tickets, now, viewer: app.accountId, communityShowing: app.league?.community !== false });
  return <section className="gx-screen gx-b-landing" data-landing="bets">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{BETS_NAMES.title}</h1></div>
    {hero ? <NextMoveCard className="gx-b-hero" data-bets="hero" data-kind={hero.kind} eyebrow={hero.eyebrow} title={hero.title}
      picture={<Meter value={hero.meter.done} max={hero.meter.of}/>} line={hero.line} lineProps={{ 'data-bets': 'hero-line' }}
      action={{ id: HERO_ACTION_ID, label: hero.action, onClick: () => openView(shell, hero.target) }}/>
      : loading ? <Skeleton label={BETS_COPY.loading} shape="landing" hero="meter" count={5} className="gx-b-skel"/>
      : <Card variant="s2" role="alert" data-bets="failed"><p className="gx-t-body">{BETS_COPY.failed}</p><Button onClick={retry}>{BETS_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <StaleLine onRefresh={retry}/> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Bets sections" data-bets="tiles">
      {tiles.map(tile => <li key={tile.key} data-tile={tile.key}>
        <Tile id={tileId(tile.key)} label={tile.label} icon={tile.icon} big={tile.big} sub={tile.sub} isNew={tile.isNew} ariaLabel={tile.ariaLabel}
          picture={tile.faces?.length ? <AvatarStack people={tile.faces} max={3} size={24}/> : null} onClick={() => openSection(shell, tile.key)}/></li>)}
    </ul>}
  </section>;
}
