// The new app's frame for a lazy screen (D-69 section 4.5): while its code loads it shows Skeleton blocks (the words
// stay for screen readers); if it fails, the tab's own failure card offers Try again and an explicit reload, so a
// missing deployment chunk never reloads an edited ballot by itself. Replaces the old app's deferred-screen frame here.
import { Suspense } from 'react';
import { reloadApp } from '../../appView.js';
import { Boundary, FailCard } from '../shell/Boundary.jsx';
import { Skeleton } from './Skeleton.jsx';

export function Deferred({ resetKey, label = 'screen', children }) {
  return (
    <Boundary resetKey={resetKey} fallback={reset => <FailCard title="This screen couldn’t load" onRetry={reset} onReload={reloadApp}/>}>
      <Suspense fallback={<Skeleton label={`Loading ${label}…`} shape="panels" count={2}/>}>{children}</Suspense>
    </Boundary>
  );
}
