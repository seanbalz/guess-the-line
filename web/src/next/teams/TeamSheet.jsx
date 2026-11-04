// Keep the team's sheet frame and cached record read available while its detailed view loads on demand (the lazy
// view and its retry live in TeamViewSlot, shared with Research's team layer).
import { useShell } from '../shell/context.js';
import { Sheet, teamCode, teamName } from '../ui/index.js';
import { useTeamSeason } from './teamsData.js';
import { TeamViewSlot } from './TeamViewSlot.jsx';

export function TeamSheet({ args }) {
  const shell = useShell();
  const { status, data } = useTeamSeason();
  const code = teamCode(args?.team), name = code === '—' ? 'Team' : teamName(code);
  const back = typeof args?.from === 'string' && args.from ? { label: args.from, onBack: shell.closeSheet } : undefined;
  return (
    <Sheet title={name} back={back} onClose={shell.closeSheet} closeLabel={`Close ${name}`} tall className="gx-team-sheet">
      <TeamViewSlot status={status} season={data} code={code}/>
    </Sheet>
  );
}
