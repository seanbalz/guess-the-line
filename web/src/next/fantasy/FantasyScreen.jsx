import FantasyFootball from '../../FantasyFootball.jsx';
import { useShell } from '../shell/context.js';
import './fantasy.css';

export function FantasyScreen() {
  const shell = useShell();
  const backHome = event => {
    // This button leaves with the screen; keep keyboard focus on the persistent Home control.
    const home = event.currentTarget.closest('.gx-app')?.querySelector('[data-tab="home"]');
    shell.go('home');
    home?.focus();
  };
  return <FantasyFootball theme="next" onBack={backHome}/>;
}
