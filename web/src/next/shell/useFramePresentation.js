import { useContext, useLayoutEffect } from 'react';
import { ShellContext } from './context.js';

// A body can name a supplied composition when the route alone also names unseen
// variants. This signal contains no data and is bound to that exact live view and
// account. Unmount/failed render/navigation removes it; it never enters the router.
export function useFramePresentation(kind, enabled) {
  const shell = useContext(ShellContext);
  const publish = shell?.setFramePresentation;
  const view = shell?.state?.views?.[shell.state.tab];
  const account = shell?.you?.id;
  useLayoutEffect(() => {
    if (!publish || !enabled) return undefined;
    const marker = { kind, view, account };
    publish(marker);
    return () => publish(current => current === marker ? null : current);
  }, [publish, kind, enabled, view, account]);
}
