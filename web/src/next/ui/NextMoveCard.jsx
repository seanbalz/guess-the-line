// The next-move card every landing opens with (D-69, spec 5A): one glow card (the hero card) holding an eyebrow that
// names it, a title, one picture (a week meter, say), one meta line and the screen's one lime button. Play and
// Research draw it; Bets will. The screen keeps its own hooks as props: `className` and `lineProps` carry its classes
// and data attributes (data-play="hero-line", data-moment), `action` the button (`ref` too, for focus handed back),
// and any other prop (data-*) lands on the card. Draws only what it is given.
import { useId } from 'react';
import { Button } from './Button.jsx';
import { Card } from './Card.jsx';
import { cx } from './cx.js';
import './nextMoveCard.css';

/** `<NextMoveCard eyebrow="Week 9" title="3 games" picture={<Meter .../>} line="2 of 3 kicked off" action={{ label, onClick, id, ref }}/>` */
export function NextMoveCard({ eyebrow, title, picture = null, line, lineProps, action, className, ...rest }) {
  const eyebrowId = useId();
  return <Card as="section" variant="hero" className={cx('gx-next-move', className)} aria-labelledby={eyebrowId} {...rest}>
    <p className="gx-t-micro gx-next-move-eyebrow" id={eyebrowId}>{eyebrow}</p>
    <h2 className="gx-t-title">{title}</h2>
    {picture}
    <p className="gx-t-meta" {...lineProps}>{line}</p>
    <Button ref={action.ref} id={action.id} variant="primary" block onClick={action.onClick}>{action.label}</Button>
  </Card>;
}
