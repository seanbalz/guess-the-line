// Native presentational bodies; callbacks affect preview memory only.
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Avatar} from '../../web/src/next/ui/Avatar.jsx';
import {Card} from '../../web/src/next/ui/Card.jsx';
import {APP_SCREENS_COPY,APP_RELOAD_COPY} from './continuity-example-copy.mjs';
import {SWITCHER_COPY} from './league-access-copy.mjs';
export function RemovedScreen({ hasGroups, onLeagues, onReload }) {
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">{APP_SCREENS_COPY.removedTitle}</h1>
      <section className="gx-empty" aria-label={APP_SCREENS_COPY.removedTitle}>
        <p className="gx-t-body">{APP_SCREENS_COPY.removedBody}</p>
        <p className="gx-t-body gx-c-2">{APP_SCREENS_COPY.removedHelp}</p>
        {hasGroups ? <Button haptic={false} variant="secondary" block onClick={onLeagues}>{APP_SCREENS_COPY.yourLeagues}</Button> : null}
        <Button haptic={false} variant="ghost" onClick={onReload}>{APP_RELOAD_COPY.reload}</Button>
      </section>
    </div>
  );
}
export function AccessPending({ name, onCommunity, onLeagues }) {
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">{APP_SCREENS_COPY.pendingTitle}</h1>
      <section className="gx-empty" aria-label={APP_SCREENS_COPY.pendingTitle}>
        <p className="gx-t-body">{APP_SCREENS_COPY.pendingBody(name)}</p>
        <Button haptic={false} variant="secondary" block onClick={onCommunity}>{APP_SCREENS_COPY.toCommunity}</Button>
        <Button haptic={false} variant="ghost" onClick={onLeagues}>{APP_SCREENS_COPY.yourLeagues}</Button>
      </section>
    </div>
  );
}
export function SavedInviteCard({ who, title, meta, primary, joinLabel, busy, problem, onJoin, onDismiss, dismissLabel }) {
  return (
    <Card variant="wait" className="gx-vstack gx-gap-12">
      <div className="gx-hstack gx-gap-12">
        <Avatar id={who} name={who} size={40}/>
        <div className="gx-vstack gx-grow">
          <p className="gx-t-strong">{title}</p>
          {meta ? <p className="gx-t-meta">{meta}</p> : null}
        </div>
      </div>
      <div role="alert">{problem ? <p className="gx-t-body gx-solo-problem">{problem}</p> : null}</div>
      <div className="gx-hstack gx-gap-8">
        <Button haptic={false} variant={primary ? 'primary' : 'secondary'} className="gx-grow" aria-label={joinLabel} aria-disabled={busy || undefined} onClick={onJoin}>
          {busy ? SWITCHER_COPY.joining : SWITCHER_COPY.join}
        </Button>
        {onDismiss ? <Button haptic={false} variant="ghost-2" aria-label={dismissLabel} onClick={onDismiss}>{SWITCHER_COPY.dismiss}</Button> : null}
      </div>
    </Card>
  );
}
