// Keep the sheet frame available while its full Research controls and charts load on request.
import { lazy, Suspense, useRef, useState } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Sheet, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { retryViewImport } from '../ui/retryViewImport.js';
// Keep shared presentation styles eager so failed game-detail preloads cannot strand this view unstyled.
import './research.css';

const importView = retryViewImport(() => import('./ResearchView.jsx'));
const loadView = () => lazy(importView);
const loading = <Skeleton label="Loading research details…" shape="panels" count={3}/>;

export function ResearchSheet({ args = {} }) {
  const shell = useShell();
  const [View, setView] = useState(loadView), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setView(loadView); setAttempt(n => n + 1);
  };
  return <Sheet title={args.game ? `Trends · ${args.game.replace('-', ' at ')}` : 'Trends'} onClose={close} tall className="gx-r-sheet">
    <div ref={region} role="group" aria-label="Research details" tabIndex={-1} className="gx-vstack gx-gap-16">
      <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
        <p className="gx-t-body">Research details couldn’t load. Check your connection and try again.</p>
        <Button variant="secondary" onClick={retry}>Try research details again</Button>
      </div>}>
        <Suspense fallback={loading}><View args={args}/></Suspense>
      </Boundary>
    </div>
  </Sheet>;
}
