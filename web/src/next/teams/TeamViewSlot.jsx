// The team view's lazy chunk (TeamView-*.js) behind one boundary with a local retry, shared by the team sheet (Play's
// picks) and Research's team layer (D-69 step 3), so both keep loading the details only on opening.
import { lazy, Suspense, useRef, useState } from 'react';
import { Button, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { retryViewImport } from '../ui/retryViewImport.js';

const importView = retryViewImport(() => import('./TeamView.jsx'));
const loadView = () => lazy(importView);
const loading = <Skeleton label="Loading team record…" shape="panels" count={3}/>;

export function TeamViewSlot({ status, season, code }) {
  const [View, setView] = useState(loadView), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setView(loadView); setAttempt(n => n + 1);
  };
  return <div ref={region} role="group" aria-label="Team details" tabIndex={-1}>
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
      <p className="gx-t-body">Team details couldn’t load. Check your connection and try again.</p>
      <Button variant="secondary" onClick={retry}>Try team details again</Button>
    </div>}>
      {status === 'loading' ? loading : <Suspense fallback={loading}><View season={season} code={code}/></Suspense>}
    </Boundary>
  </div>;
}
