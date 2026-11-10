import { lazy, Suspense, useRef, useState } from 'react';
import { Boundary } from '../shell/Boundary.jsx';
import { Button, Skeleton } from '../ui/index.js';
import { retryViewImport } from '../ui/retryViewImport.js';
const importView = retryViewImport(() => import('./MatchupTeamPerformance.jsx'));
const loadView = () => lazy(importView);

/** Comparison code and observed-statistics reads wait for the actual Compare stats action. */
export function MatchupTeamPerformanceSlot(props) {
  const [View, setView] = useState(loadView), [attempt, setAttempt] = useState(0), region = useRef(null);
  const retry = () => { region.current?.focus({ preventScroll: true }); setView(loadView); setAttempt(value => value + 1); };
  return <div ref={region} role="group" aria-label="Team comparison" tabIndex={-1}>
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert"><p className="gx-t-body">Team comparison couldn’t load. Check your connection and try again.</p><Button variant="secondary" onClick={retry}>Try team comparison again</Button></div>}>
      <Suspense fallback={<Skeleton label="Loading team comparison…" shape="panels" count={2}/>}><View {...props}/></Suspense>
    </Boundary>
  </div>;
}
