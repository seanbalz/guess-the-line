// Redesign stage 10: a test-only harness for tests/cloud-browser/next-shell.spec.js. The spec bundles this file with
// Vite in memory and serves it from a fake origin; it never ships in the app. It mounts the real Shell (web/src/next/
// shell) inside the real ThemeProvider, with the real registry plus test screens and layers that exercise what the
// stage 10 tabs do not use yet: a dock bar, a tab that throws, layers that throw (on open, or later while hidden
// under another sheet), a dialog whose onClose may refuse, an in-place sub-view whose control removes itself, a
// popover, an overlay and a page. No account, data or network; fictional names only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../web/src/styles.css';
import '../../../web/src/next/styles/tokens.css';
import '../../../web/src/next/styles/base.css';
import '../../../web/src/next/styles/components.css';
import { ThemeProvider } from '../../../web/src/Theme.jsx';
import { Shell } from '../../../web/src/next/shell/Shell.jsx';
import { ComingNext, Dock } from '../../../web/src/next/shell/Frame.jsx';
import { useShell } from '../../../web/src/next/shell/context.js';
import { LAYERS, SCREENS } from '../../../web/src/next/shell/registry.jsx';
import { Button, Dialog, Overlay, Sheet } from '../../../web/src/next/ui/index.js';

// What the harness's handlers did, for the spec to read; the spec sets window.__allowClose and window.__failSignOut.
window.__events = [];
const record = name => window.__events.push(name);

function TestHome() {
  const shell = useShell();
  const [dock, setDock] = useState(false);
  return (
    <div className="gx-screen gx-screen--dock">
      <h1 className="gx-t-title">Shell harness</h1>
      <div className="gx-vstack gx-gap-8">
        <Button onClick={() => shell.openSheet('sh.test')}>Open the test sheet</Button>
        <Button onClick={() => shell.openSheet('sh.broken')}>Open a broken sheet</Button>
        <Button onClick={() => shell.openSheet('sh.fragile')}>Open a fragile sheet</Button>
        <Button onClick={() => shell.openDialog('dlg.busy')}>Open the busy dialog</Button>
        <Button onClick={() => shell.showOverlay('ov.test', { title: 'Bullseye' })}>Show an overlay</Button>
        <Button onClick={() => shell.openPopover('pop.test')}>Open a popover</Button>
        <Button onClick={() => shell.openPage('page.test', { from: 'home' })}>Open a page</Button>
        <Button onClick={() => shell.toast('Change saved · SEA @ DEN')}>Show a toast</Button>
        <Button onClick={() => shell.toast('Couldn’t save your reaction. Try again.', { tone: 'error' })}>Show an error toast</Button>
        <Button onClick={() => shell.toast('2 bets placed', { actionLabel: 'Show friends', action: () => record('toast-action') })}>Show a toast with an action</Button>
        <Button onClick={() => setDock(on => !on)}>{dock ? 'Hide the dock' : 'Show the dock'}</Button>
      </div>
      {dock ? (
        <Dock>
          <div className="gx-dock-bar">
            <p className="gx-grow gx-t-strong">Spread · 8 of 14</p>
            <Button variant="primary">Review</Button>
          </div>
        </Dock>
      ) : null}
    </div>
  );
}

function Thrower() {
  throw new Error('This tab failed on purpose.');
}
function TestPlay() {
  const [broken, setBroken] = useState(false);
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">Play</h1>
      <Button onClick={() => setBroken(true)}>Break this tab</Button>
      {broken ? <Thrower/> : null}
    </div>
  );
}

/** A sheet with a sub-view in place; the control that opens it removes itself, like a row that becomes a header. */
function TestSheet({ args }) {
  const shell = useShell();
  if (args.sub === 'detail') {
    return (
      <Sheet title="Detail" back={{ label: 'Test sheet', onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
        <p className="gx-t-body">The detail view.</p>
        <Button onClick={() => shell.openSheet('sh.test', { depth: (args.depth ?? 1) + 1 })}>Open another sheet</Button>
      </Sheet>
    );
  }
  return (
    <Sheet title={`Test sheet${args.depth ? ` ${args.depth}` : ''}`} onClose={shell.closeSheet}>
      <Button onClick={() => shell.setSheetArgs({ sub: 'detail' })}>Show the detail</Button>
      <Button onClick={() => shell.openDialog('dlg.busy')}>Open the busy dialog</Button>
    </Sheet>
  );
}
function BrokenSheet() {
  throw new Error('This sheet failed on purpose.');
}
/**
 * Draws until the spec sets window.__breakFragile, then throws the next time the shell draws it: every sheet in the
 * stack draws again on each change to the shell's state, so it can fail while hidden under another (a data refresh).
 */
function FragileSheet() {
  const shell = useShell();
  if (window.__breakFragile) throw new Error('This sheet failed on purpose, under another.');
  return (
    <Sheet title="Fragile sheet" onClose={shell.closeSheet}>
      <Button onClick={() => shell.openSheet('sh.test')}>Open the test sheet</Button>
    </Sheet>
  );
}

/** Its onClose refuses unless the spec allows it (a save still running), and counts every call. */
function BusyDialog({ open }) {
  const shell = useShell();
  const close = () => {
    record('dialog-onClose');
    if (window.__allowClose) shell.closeDialog();
  };
  return (
    <Dialog open={open} title="Skip Week 6?" text="It counts as sitting out." onClose={close}>
      <Button onClick={() => shell.closeDialog()}>Keep playing</Button>
      <Button variant="danger" onClick={() => { record('dialog-confirm'); shell.closeDialog(); }}>Skip this week</Button>
    </Dialog>
  );
}

function TestOverlay({ args }) {
  const shell = useShell();
  return (
    <Overlay label={args.title} onClose={() => shell.closeOverlay(args.key)}>
      <p className="gx-t-display">{args.title}</p>
      <Button variant="primary" onClick={() => shell.closeOverlay(args.key)}>Done</Button>
    </Overlay>
  );
}

function TestPopover() {
  const shell = useShell();
  return (
    <div className="gx-popover" role="group" aria-label="Reactions" style={{ left: 51, right: 51, bottom: 180 }}>
      <Button variant="ghost" onClick={() => { record('react'); shell.closePopover(); }}>Like</Button>
    </div>
  );
}

function TestPage({ args }) {
  const shell = useShell();
  return (
    <div className="gx-screen">
      <button type="button" className="gx-back-btn" onClick={shell.closePage}>Back</button>
      <h1 className="gx-t-title">Test page</h1>
      <p className="gx-t-body">{`Opened from ${args.from}.`}</p>
    </div>
  );
}

// Lines (stage 13) reads the app's data layer, which this harness does not mount; tests/cloud-browser/next-lines.spec.js covers it.
const screens = { ...SCREENS, home: TestHome, play: TestPlay, lines: () => <ComingNext tab="lines"/>, bets: () => <ComingNext tab="bets"/>, league: () => <ComingNext tab="league"/> };
const layers = { ...LAYERS, 'sh.test': TestSheet, 'sh.broken': BrokenSheet, 'sh.fragile': FragileSheet, 'dlg.busy': BusyDialog, 'ov.test': TestOverlay, 'pop.test': TestPopover, 'page.test': TestPage };
const session = { user: { id: 'acct-3', email: 'casey@example.test', user_metadata: { full_name: 'Casey Moore' } } };
async function onSignOut() {
  record('sign-out');
  if (window.__failSignOut) throw new Error('We could not sign you out. Please try again.');
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <Shell session={session} onSignOut={onSignOut} screens={screens} layers={layers}/>
  </ThemeProvider>,
);
