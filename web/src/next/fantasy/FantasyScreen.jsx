import { useState } from 'react';
import { fantasyWeekKey } from '../../fantasyData.js';
import { useShell } from '../shell/context.js';
import { MAX_COMPARE } from '../../../../shared/fantasy-tools.mjs';
import { FantasyNest } from './FantasyNest.jsx';
import './fantasy.css';

// D-66: Research › Fantasy is nesting cards. The week, filters and page size live in the shell's Fantasy view (restored
// after a reload by season and week); the open layer and player are its route keys, so back closes one layer.
export function FantasyScreen() {
  const shell = useShell();
  const view = shell.state.views.fantasy;
  const [profileId, setProfileId] = useState(null), [compareIds, setCompareIds] = useState([]);
  const navigationState = { ...view, selection: view.season && view.week ? fantasyWeekKey(view.season, view.week) : view.selection };
  const remember = patch => {
    if (!patch.selection) { shell.setView('fantasy', patch); return; }
    const [season, week] = patch.selection.split('-').map(Number);
    shell.setView('fantasy', { ...patch, season, week });
  };
  const toggle = id => setCompareIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : ids.length < MAX_COMPARE ? [...ids, id] : ids);
  return <FantasyNest navigationState={navigationState} onNavigationState={remember} view={view} onLayer={patch => shell.setView('fantasy', patch)}
    profileId={profileId} onProfile={setProfileId} compareIds={compareIds} onCompareChange={setCompareIds} onCompare={toggle}/>;
}
