import { useState } from 'react';
import FantasyFootball from '../../FantasyFootball.jsx';
import { fantasyWeekKey } from '../../fantasyData.js';
import { useShell } from '../shell/context.js';
import { MAX_COMPARE } from '../../../../shared/fantasy-tools.mjs';
import { FantasyTools, PlayerToolButtons } from './FantasyTools.jsx';
import './fantasy.css';

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
  return <FantasyFootball key={shell.state.nav} navigationState={navigationState} onNavigationState={remember} theme="next" onBack={shell.back} backLabel="Back to Research"
    renderPlayerTools={player => <PlayerToolButtons player={player} compared={compareIds.includes(player.id)} full={compareIds.length >= MAX_COMPARE} onProfile={setProfileId} onCompare={toggle}/>}
    renderTools={({ snapshot, filters }) => <FantasyTools snapshot={snapshot} filters={filters} profileId={profileId} onProfile={setProfileId} onCloseProfile={() => setProfileId(null)}
      compareIds={compareIds.filter(id => snapshot.players.some(player => player.id === id))} onCompareChange={setCompareIds} onCompare={toggle}/>}/>;
}
