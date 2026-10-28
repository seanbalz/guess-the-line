// A code-only boundary keeps the existing game sheet usable while its optional content downloads.
import { lazy, Suspense, useRef, useState } from 'react';
import { Button, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { retryViewImport } from '../ui/retryViewImport.js';

const importDetails = retryViewImport(() => import('./GameDetails.jsx'));
const loadDetails = () => lazy(importDetails);
const loading = <Skeleton label="Loading game details…" shape="panels" count={3}/>;

export function GameDetailsSlot(props) {
  const [Details, setDetails] = useState(loadDetails), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setDetails(loadDetails); setAttempt(n => n + 1);
  };
  return <div ref={region} role="group" aria-label="Game details" tabIndex={-1} className="gx-vstack gx-gap-16">
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
      <p className="gx-t-body">Game details couldn’t load. Check your connection and try again.</p>
      <Button variant="secondary" onClick={retry}>Try game details again</Button>
    </div>}>
      <Suspense fallback={loading}><Details {...props}/></Suspense>
    </Boundary>
  </div>;
}
