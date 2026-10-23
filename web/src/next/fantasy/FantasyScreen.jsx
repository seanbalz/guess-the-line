import FantasyFootball from '../../FantasyFootball.jsx';
import { fantasyWeekKey } from '../../fantasyData.js';
import { useShell } from '../shell/context.js';
import './fantasy.css';

export function FantasyScreen() {
  const shell = useShell();
  const view = shell.state.views.fantasy;
  const navigationState = { ...view, selection: view.season && view.week ? fantasyWeekKey(view.season, view.week) : view.selection };
  const remember = patch => {
    if (!patch.selection) { shell.setView('fantasy', patch); return; }
    const [season, week] = patch.selection.split('-').map(Number);
    shell.setView('fantasy', { ...patch, season, week });
  };
  return <FantasyFootball key={shell.state.nav} navigationState={navigationState} onNavigationState={remember} theme="next" onBack={shell.back} backLabel="Back to Research"/>;
}
