// D-69 step 1: every Play section is a nesting card (ui/Nest.jsx, D-66) under a "Play" lip. A section's deeper layers
// add their parents as lips, outermost first. The Play lip opens the landing with every layer key cleared, and a
// landing tile opens its section the same way (`openPlay`), so a section never reopens on a layer left open earlier.
import { Nest } from '../ui/index.js';
import { useShell } from '../shell/context.js';

export const PLAY_ROOT = Object.freeze({ key: 'play', label: 'Play' });
/** The generic layer keys (shell/router.js KEYS) plus Your score's game key, all closed. */
export const CLOSED_LAYER = Object.freeze({ layer: undefined, item: undefined, scoreGame: undefined });

/** Opens a Play section on its first layer. `view` adds that section's own keys (League's `view`, a market). */
export function openPlay(shell, section, view = {}) {
  shell.go('play', { section, ...CLOSED_LAYER, ...view });
}

/** Nest lips for a Play layer: the Play root, then each parent `{ key, label, open }`. */
export function playLips(shell, parents = []) {
  return [
    { key: PLAY_ROOT.key, label: PLAY_ROOT.label, onOpen: () => shell.go('play', { section: undefined, ...CLOSED_LAYER }) },
    ...parents.map(p => ({ key: p.key, label: p.label, onOpen: p.open })),
  ];
}

export function usePlayLips(parents = []) {
  return playLips(useShell(), parents);
}

/** One Play layer. `layer` names it uniquely ('score', 'score:game:SEA-DEN'); it drives entrance motion and focus. */
export function PlayLayer({ label, parents = [], layer, title, info, className, children }) {
  return <Nest label={label} lips={usePlayLips(parents)} layer={layer} title={title} info={info} className={className}>{children}</Nest>;
}
