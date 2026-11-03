import {PlayerPropEntry} from './PlayerPropEntry.jsx';
import {useFantasySnapshot,fantasyWeekKey} from './fantasyData.js';

// Load only public research for this ticket's exact week. Missing data leaves manual entry available.
// Keep the editor itself independent of authentication and network modules.
export function PlayerPropPicker({season,week,...props}) {
  const read=useFantasySnapshot(fantasyWeekKey(season,week));
  const players=read.status==='ready'&&read.snapshot?.season===season&&read.snapshot?.week===week?read.snapshot.players:[];
  return <PlayerPropEntry {...props} players={players}/>;
}
