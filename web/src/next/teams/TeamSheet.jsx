// Keep the team's sheet frame and cached record read available while its detailed view loads on demand.
import { lazy, Suspense, useRef, useState } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Sheet, Skeleton, teamCode, teamName } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { useTeamSeason } from './teamsData.js';

const loadView = () => lazy(() => import('./TeamView.jsx'));
const loading = <Skeleton label="Loading team record…" shape="panels" count={3}/>;

export function TeamSheet({ args }) {
  const shell = useShell();
  const { status, data } = useTeamSeason();
  const [View, setView] = useState(loadView), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const code = teamCode(args?.team), name = code === '—' ? 'Team' : teamName(code);
  const back = typeof args?.from === 'string' && args.from ? { label: args.from, onBack: shell.closeSheet } : undefined;
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setView(loadView); setAttempt(n => n + 1);
  };
  return (
    <Sheet title={name} back={back} onClose={shell.closeSheet} closeLabel={`Close ${name}`} tall className="gx-team-sheet">
      <div ref={region} role="group" aria-label="Team details" tabIndex={-1}>
        <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
          <p className="gx-t-body">Team details couldn’t load. Check your connection and try again.</p>
          <Button variant="secondary" onClick={retry}>Try team details again</Button>
        </div>}>
          {status === 'loading' ? loading : <Suspense fallback={loading}><View season={data} code={code}/></Suspense>}
        </Boundary>
      </div>
    </Sheet>
  );
}
