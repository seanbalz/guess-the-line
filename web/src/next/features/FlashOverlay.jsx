// `ov.flash`: the celebration for a new badge or award of your own (design system 7.16, "stadium flash"; the prototype's
// Bullseye flash and New results). Brand Motion: verified outcomes only, one big moment at a time (one overlay however
// many arrived) and never on page load (useFeatures queues it only on a later read). Only transform and opacity move,
// for at most 600 ms, once; reduced motion (the device or the app's setting) stops it and the words stay.
import { useId } from 'react';
import { useShell } from '../shell/context.js';
import { Badge, Button, Overlay } from '../ui/index.js';
import './features.css';

export function FlashOverlay({ args }) {
  const shell = useShell(), titleId = useId();
  const items = Array.isArray(args?.items) ? args.items.filter(i => i && typeof i.title === 'string') : [];
  if (!items.length) throw new Error('Nothing to celebrate.');
  const close = () => shell.closeOverlay(args.key);
  // At most three lines, so the card stays one screen; the rest wait on the badges screen.
  const first = items[0], many = items.length > 1, shown = items.slice(0, 3), more = items.length - shown.length;
  return (
    <Overlay labelledBy={titleId} onClose={close} className="gx-fx-flash">
      <span className="gx-fx-burst" aria-hidden="true"></span>
      <Badge iconPath={first.icon} size={96} rarity={first.rarity}/>
      <h2 className="gx-t-display" id={titleId}>{many ? 'New results' : first.title}</h2>
      {many
        ? <><ul className="gx-fx-lines">{shown.map(item => <li key={item.key} className="gx-t-body">{item.title} · {item.meta}</li>)}</ul>
          {more > 0 ? <p className="gx-t-meta gx-c-2">and {more} more</p> : null}</>
        : <p className="gx-t-body gx-c-2">{first.meta}</p>}
      <Button variant="primary" block onClick={close}>Nice</Button>
      <Button variant="ghost" onClick={() => { close(); shell.go('play', { section: 'features' }); }}>See badges</Button>
    </Overlay>
  );
}
