// NBA in the Prism shell (milestone N1): the same account, frame, menu, tab bar and history machinery as NFL and EPL.
// The NBA mount reads no NFL week, roster or community data: AppData reads only /lobby for this sport, and the Menu
// reads the Community (commissioner access, the push guard) only when it is opened, as EPL's does.
import { useSharedRead } from '../data/AppData.jsx';
import { MenuSheet } from '../me/MenuSheet.jsx';
import { useShell } from '../shell/context.js';
import { LAYERS } from '../shell/registry.jsx';
import { nbaFrameContext } from '../shell/confirmedFrame.js';
import { Button, Card, Icon, List, Row, Sheet } from '../ui/index.js';
import { navigateSport } from './route.js';
import { NBA_TABS } from './route.js';
import { NBA_ROUTER } from './shellRoute.js';
import { NbaScreen } from './NbaScreens.jsx';
import { NbaConfirmSheet, NbaTrackSheet } from './NbaSheets.jsx';
import leagueMark from '../ui/brand-assets/nba.png';

function NbaMenu(props) {
  useSharedRead('community');
  return <MenuSheet {...props}/>;
}
function NbaLeagues() {
  const shell = useShell();
  return <Sheet title="Your leagues" onClose={shell.closeSheet}>
    <Card variant="flush" className="gx-nba-leagues"><List label="Leagues">
      <Row size={64} start={<span className="gx-team gx-team--48 gx-team--loaded gx-nba-league-mark"><img className="gx-team-img" src={leagueMark} alt="" width={48} height={48}/></span>}
        title="NBA" sub="Private tickets" end={<Icon icon="check" size={20} className="gx-c-accent"/>} aria-current="true" onClick={shell.closeSheet}/>
    </List></Card>
    <p className="gx-t-body">NBA tickets are private to you. Your leagues from the National Football League remain available when you switch sports.</p>
  </Sheet>;
}
function NbaHistory() {
  const shell = useShell();
  const toBets = () => { shell.closePage(); shell.tab('bets'); shell.setView('bets', { pane: 'history' }); };
  return <div className="gx-screen" data-page="history">
    <Button variant="ghost" onClick={shell.closePage}><Icon icon="chevronLeft" size={20}/>Back</Button>
    <h1 className="gx-t-title">History</h1>
    <section className="gx-empty"><Icon icon="clock" size={32} aria-hidden="true"/><p className="gx-t-body">Your settled NBA tickets are in Bets › History.</p></section>
    <Button variant="primary" block onClick={toBets}>Open NBA bet history</Button>
    <Button onClick={() => navigateSport('#history')}>View National Football League history</Button>
  </div>;
}
export const NBA_SHELL = Object.freeze({
  router: NBA_ROUTER,
  // The compact Prism frame (mockups 01 to 09) for the actual NBA screens; pages stay native, as EPL's do.
  frameContext: ({ state, Screen, router }) => router === NBA_ROUTER && Screen === NbaScreen ? nbaFrameContext(state) : null,
  className: 'gx-nba',
  league: { id: 'nba', name: 'NBA' },
  screens: Object.fromEntries(NBA_TABS.map(tab => [tab, NbaScreen])),
  layers: { ...LAYERS, 'sh.menu': NbaMenu, 'sh.switcher': NbaLeagues, 'page.history': NbaHistory, 'sh.nbaTrack': NbaTrackSheet, 'sh.nbaConfirm': NbaConfirmSheet },
});
