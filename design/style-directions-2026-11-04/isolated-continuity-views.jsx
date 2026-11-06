// Exact native presentation bodies; callbacks supplied by the memory-only review.
import {useId} from 'react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Icon} from '../../web/src/next/ui/Icon.jsx';
import {SHELL_COPY,APP_RELOAD_COPY} from './continuity-example-copy.mjs';
export function OfflineBanner({ offline, onRetry }) {
  return (
    <div role="status">
      {offline ? (
        <div className="gx-offline">
          <Icon icon="alert" size={16}/>
          <p className="gx-grow">{SHELL_COPY.offline}</p>
          <Button haptic={false} variant="ghost-2" onClick={onRetry}>{SHELL_COPY.retry}</Button>
        </div>
      ) : null}
    </div>
  );
}
export function FailCard({ title, onRetry, onReload }) {
  const id = useId();
  return (
    <div className="gx-screen">
      <section className="gx-fail" role="alert" aria-labelledby={id}>
        <Icon icon="alert" size={20} className="gx-c-loss"/>
        <h1 className="gx-t-section" id={id}>{title}</h1>
        <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
        <div className="gx-hstack gx-wrap gx-gap-8">
          <Button haptic={false} variant="secondary" onClick={onRetry}>{SHELL_COPY.tryAgain}</Button>
          <Button haptic={false} variant="ghost" onClick={onReload}>{APP_RELOAD_COPY.reload}</Button>
        </div>
      </section>
    </div>
  );
}
