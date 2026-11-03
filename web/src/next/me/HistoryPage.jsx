// `page.history`, Me › History (redesign build plan stages 73 and 74): drawn in place of the tab's screen. The page's
// code loads only when it opens, so the Menu and every tab stay as light as before.
import { lazy, Suspense } from 'react';
import { Skeleton } from '../ui/Skeleton.jsx';

const History = lazy(() => import('./History.jsx').then(module => ({ default: module.History })));

export function HistoryPage(props) {
  return (
    <Suspense fallback={<div className="gx-screen"><Skeleton label="Loading History…" shape="panels" count={2}/></div>}>
      <History {...props}/>
    </Suspense>
  );
}
