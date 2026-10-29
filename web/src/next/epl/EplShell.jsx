import { useSharedRead } from '../data/AppData.jsx';
import { MenuSheet } from '../me/MenuSheet.jsx';
import { useShell } from '../shell/context.js';
import { LAYERS } from '../shell/registry.jsx';
import { Avatar, Button, Card, Icon, List, Row, Sheet } from '../ui/index.js';
import { navigateSport } from '../nba/route.js';
import { EPL_TABS } from './route.js';
import { EPL_ROUTER } from './shellRoute.js';
import { EplScreen } from './EplApp.jsx';

function EplMenu(props) {
  // Account-wide commissioner access is checked only when the menu is opened. EPL entry does
  // not need an NFL week, roster or pick read, and NFL tab counters never appear on EPL.
  useSharedRead('community');
  return <MenuSheet {...props}/>;
}
function EplLeagues() {
  const shell = useShell();
  return <Sheet title="Your leagues" onClose={shell.closeSheet}>
    <Card variant="flush"><List label="Leagues">
      <Row size={64} start={<Avatar id="fepl" name="FEPL" size={40}/>} title="FEPL" sub="Premier League"
        end={<Icon icon="check" size={20} className="gx-c-accent"/>} aria-current="true" onClick={shell.closeSheet}/>
    </List></Card>
    <p className="gx-t-meta">Pick a Team and Fantasy use FEPL. Your NFL leagues remain available when you switch to NFL.</p>
  </Sheet>;
}
function EplHistory() {
  const shell = useShell();
  return <div className="gx-screen" data-page="history">
    <Button variant="ghost" onClick={shell.closePage}><Icon icon="chevronLeft" size={20}/>Back</Button>
    <h1 className="gx-t-title">History</h1>
    <section className="gx-empty"><p className="gx-t-body">EPL history is not available here yet. Your saved picks and records are kept.</p></section>
    <Button onClick={() => navigateSport('#history')}>View NFL history</Button>
  </div>;
}
export const EPL_SHELL = Object.freeze({
  router: EPL_ROUTER,
  className: 'gx-epl',
  league: { id: 'fepl', name: 'FEPL' },
  screens: Object.fromEntries(EPL_TABS.map(tab => [tab, EplScreen])),
  layers: { ...LAYERS, 'sh.menu': EplMenu, 'sh.switcher': EplLeagues, 'page.history': EplHistory },
});
