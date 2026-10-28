// The layer hosts (prototype CONTRACT sections 9 and 10; spec 1.4): each draws the layer the shell's state names, by
// looking its id up in the layer registry (layers.js). The owner's component draws the layer itself with the UI kit
// (Sheet, Dialog, Overlay, a popover box, a page) and reads its args.
//
// - Sheets: the whole stack stays mounted, only the top one shows (the others are hidden and inert), so a sheet keeps
//   its place under another and focus goes back to the control in it that opened the next one. Each is drawn by its
//   own key (state.js), so one leaving the stack never redraws the others. A sub-view changes the top sheet's args in
//   place (the kit's Sheet keeps focus inside).
// - Dialog: one, on the native <dialog>. The last one stays mounted after it closes, so the browser closes it (and
//   returns focus) instead of the element vanishing while open.
// - Popover: one, over a clear scrim that closes it; Escape closes it too. Each opening is drawn afresh.
// - Overlay: the first in the queue, never over a dialog.
// - Page: replaces the tab's screen; Escape closes it.
// A layer whose component throws, or whose id has none, closes and says so in a toast with "Reload the app". It closes
// itself, by its key, never whichever layer is on top: every sheet in the stack draws again on each change to the
// shell's state, so one hidden under another can be the one that fails.
import { useEffect, useRef } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { Boundary, FailCard } from './Boundary.jsx';
import { useShell } from './context.js';
import { visibleOverlay } from './state.js';
import { SHELL_COPY } from './tabs.js';

function Missing({ id }) {
  throw new Error(`No component is registered for the layer ${id}.`);
}

/** Draws one layer in a boundary; a failure closes that layer (by its key) and tells the member. */
function LayerSlot({ layer, layers, ...props }) {
  const shell = useShell();
  const Component = layers[layer.id] ?? Missing;
  const failed = () => {
    shell.closeLayer(layer.id, layer.key);
    shell.toast(SHELL_COPY.layerFailed, { tone: 'error', actionLabel: APP_RELOAD_COPY.reload, action: shell.reload });
  };
  return (
    <Boundary resetKey={layer.id} onError={failed} fallback={() => null}>
      <Component id={layer.id} args={layer} {...props}/>
    </Boundary>
  );
}

export function SheetHost({ state, layers, inert }) {
  const last = state.sheets.length - 1;
  return (
    <>
      {state.sheets.map((sheet, index) => (
        <div key={sheet.key} hidden={index !== last} inert={index !== last || inert}>
          <LayerSlot layer={sheet} layers={layers}/>
        </div>
      ))}
    </>
  );
}

export function DialogHost({ state, layers }) {
  const shown = useRef(null);
  if (state.dialog) shown.current = state.dialog;
  const dialog = shown.current;
  if (!dialog) return null;
  return <LayerSlot key={dialog.key} layer={dialog} layers={layers} open={state.dialog?.key === dialog.key}/>;
}

export function PopoverHost({ state, layers }) {
  const shell = useShell();
  if (!state.popover) return null;
  const onKeyDown = event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    shell.closePopover();
  };
  return (
    <div className="gx-layer gx-layer--popover" onKeyDown={onKeyDown}>
      <button type="button" className="gx-scrim gx-scrim--clear" aria-hidden="true" tabIndex={-1} onClick={shell.closePopover}></button>
      <LayerSlot key={state.popover.key} layer={state.popover} layers={layers}/>
    </div>
  );
}

export function OverlayHost({ state, layers }) {
  const overlay = visibleOverlay(state);
  if (!overlay) return null;
  return <LayerSlot key={overlay.key} layer={overlay} layers={layers}/>;
}

/** A page in place of the tab's screen; a failure shows the error card there, like a tab's. */
export function PageHost({ page, layers }) {
  const shell = useShell();
  const Component = layers[page.id] ?? Missing;
  const box = useRef(null);
  // A page opens at its top, with focus on it, like a new screen.
  useEffect(() => {
    globalThis.scrollTo?.(0, 0);
    box.current?.focus({ preventScroll: true });
  }, [page.id]);
  const onKeyDown = event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.stopPropagation();
    shell.closePage();
  };
  return (
    <div ref={box} className="gx-vstack" tabIndex={-1} onKeyDown={onKeyDown}>
      <Boundary resetKey={page.id} fallback={reset => <FailCard title={SHELL_COPY.pageFailed} onRetry={reset} onReload={shell.reload}/>}>
        <Component id={page.id} args={page}/>
      </Boundary>
    </div>
  );
}
