// `page.history`, Me › History (redesign build plan stages 73 and 74): drawn in place of the tab's screen. The page's
// code loads only when it opens, so the Menu and every tab stay as light as before.
import { lazy, Suspense } from 'react';

const History = lazy(() => import('./History.jsx').then(module => ({ default: module.History })));

export function HistoryPage(props) {
  return (
    <Suspense fallback={<div className="gx-screen"><p className="gx-t-body gx-c-2" role="status">Loading History…</p></div>}>
      <History {...props}/>
    </Suspense>
  );
}
