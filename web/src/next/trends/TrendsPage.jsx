// The optional Trends page loads only when visited; the frame's navigation stays available during loading/retry.
import { lazy, Suspense, useRef, useState } from 'react';
import { Button, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';

const loadScreen = () => lazy(() => import('./TrendsScreen.jsx'));
const loading = <div className="gx-screen"><h1 className="gx-t-title">Trends</h1><Skeleton label="Loading trends…" shape="panels" count={2}/></div>;

export function TrendsPage() {
  const [Screen, setScreen] = useState(loadScreen), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setScreen(loadScreen); setAttempt(n => n + 1);
  };
  return <div ref={region} role="region" aria-label="Trends content" tabIndex={-1}>
    <Boundary key={attempt} fallback={() => <div className="gx-screen">
      <h1 className="gx-t-title">Trends</h1>
      <div className="gx-vstack gx-gap-12" role="alert">
        <p className="gx-t-body">Trends couldn’t load. Check your connection and try again.</p>
        <Button variant="secondary" onClick={retry}>Try trends again</Button>
      </div>
    </div>}>
      <Suspense fallback={loading}><Screen/></Suspense>
    </Boundary>
  </div>;
}
