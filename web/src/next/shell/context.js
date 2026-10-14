// The shell's context: the navigation state and the calls that change it, for every tab, page and layer of the new
// app (prototype CONTRACT section 6, "Navigation and layers"). Shell.jsx provides it.
import { createContext, useContext } from 'react';

export const ShellContext = createContext(null);

/**
 * `const shell = useShell()`: `shell.state` (state.js), `shell.go('play', { market: 'total' })`, `shell.openSheet('sh.menu')`,
 * `shell.setSheetArgs({ sub: 'appearance' })`, `shell.toast('Saved')`, `shell.toOldApp()` and the rest (Shell.jsx).
 */
export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useShell() is only for screens inside the new app’s Shell.');
  return shell;
}
