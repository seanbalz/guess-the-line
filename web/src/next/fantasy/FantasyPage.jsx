// Keep Research's frame available while its optional Fantasy view and styles load on demand.
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Button, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { retryViewImport } from '../ui/retryViewImport.js';

const importScreen = retryViewImport(() => import('./FantasyScreen.jsx').then(module => ({ default: module.FantasyScreen })));
const loadScreen = () => lazy(importScreen);
const loading = <div className="gx-screen"><h1 className="gx-t-title">Fantasy</h1><Skeleton label="Loading Fantasy…" shape="panels" count={2}/></div>;

export function FantasyPage() {
  const [Screen, setScreen] = useState(loadScreen), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  // The loading heading is replaced on success. Keep navigation focus on a stable destination instead.
  useLayoutEffect(() => { region.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, []);
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setScreen(loadScreen); setAttempt(n => n + 1);
  };
  return <div ref={region} role="region" aria-label="Fantasy content" tabIndex={-1} data-route-focus="">
    <Boundary key={attempt} fallback={() => <div className="gx-screen">
      <h1 className="gx-t-title">Fantasy</h1>
      <div className="gx-vstack gx-gap-12" role="alert">
        <p className="gx-t-body">Fantasy couldn’t load. Check your connection and try again.</p>
        <Button variant="secondary" onClick={retry}>Try Fantasy again</Button>
      </div>
    </div>}>
      <Suspense fallback={loading}><Screen/></Suspense>
    </Boundary>
  </div>;
}
