import { Button, Card, Icon, List, Row } from './index.js';
import './focusLanding.css';

/** Shared hierarchy for the four roots: one action, then quiet destinations. */
export function FocusAction({ title, eyebrow, description, action, onAction, children, ...rest }) {
  return <Card as="section" variant="hero" className="gx-focus-action" {...rest}>
    {eyebrow && <p className="gx-t-label gx-c-2">{eyebrow}</p>}
    <h2 className="gx-t-display">{title}</h2>
    {description && <p className="gx-t-body gx-c-2">{description}</p>}
    {children}
    <Button variant="primary" block iconEnd="chevronRight" onClick={onAction}>{action}</Button>
  </Card>;
}

export function FocusRows({ label, children }) {
  return <Card variant="flush" className="gx-focus-rows"><List label={label}>{children}</List></Card>;
}

export function FocusRow({ icon, title, sub, onClick, ...rest }) {
  return <Row className="gx-focus-row" aria-label={title} aria-description={sub} title={title} sub={sub} start={<span className="gx-focus-icon"><Icon icon={icon}/></span>} chevron onClick={onClick} {...rest}/>;
}
