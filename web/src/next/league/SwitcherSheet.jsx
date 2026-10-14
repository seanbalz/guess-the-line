// `sh.switcher`, "Your leagues" (prototype spec 3.6; the league pill and #groups open it). Stage 10 has no data yet,
// so it shows the league the pill names and sends groups and invites to the old app; stage 11 (the data layer)
// replaces this with the real switcher: Community, your groups, invites with Join, and the saved choice.
import { Card, Icon, List, Row, Sheet, Button } from '../ui/index.js';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useShell } from '../shell/context.js';

export const SWITCHER_COPY = Object.freeze({
  title: 'Your leagues',
  showing: 'Showing now',
  later: 'Your groups and invites aren’t in the new app yet. Open them in the old app.',
});

export function SwitcherSheet() {
  const shell = useShell();
  return (
    <Sheet title={SWITCHER_COPY.title} onClose={shell.closeSheet}>
      <Card variant="flush">
        <List>
          <Row key="current" title={shell.league.name} sub={SWITCHER_COPY.showing} end={<Icon icon="check" size={20} className="gx-c-accent"/>}/>
        </List>
      </Card>
      <p className="gx-t-body gx-c-2">{SWITCHER_COPY.later}</p>
      <Button variant="secondary" block onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</Button>
    </Sheet>
  );
}
