// Error boundaries for the new app's frame (redesign build plan stage 10): a tab, a page or a layer that throws while
// it draws takes only itself down. A tab or page shows a card with "Try again" and "Reload the app" (the old
// app is gone, so nothing ever mounts it); a layer closes and says so in a toast (LayerHosts.jsx). The outer
// boundary in main.jsx stays the last resort.
import { Component, useId } from 'react';
import { Button, Icon } from '../ui/index.js';
import { APP_RELOAD_COPY } from '../../appView.js';
import { SHELL_COPY } from './tabs.js';

/** `<Boundary fallback={reset => ...} onError={error => ...}>`; it starts over when `resetKey` changes. */
export class Boundary extends Component {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  componentDidCatch(error) { this.props.onError?.(error); }
  reset = () => this.setState({ failed: false });
  render() {
    if (!this.state.failed) return this.props.children;
    return typeof this.props.fallback === 'function' ? this.props.fallback(this.reset) : null;
  }
}

/** The card a failed tab or page shows. It names what failed, offers a fresh try and a reload, and is announced. */
export function FailCard({ title, onRetry, onReload }) {
  const id = useId();
  return (
    <div className="gx-screen">
      <section className="gx-fail" role="alert" aria-labelledby={id}>
        <Icon icon="alert" size={20} className="gx-c-loss"/>
        <h1 className="gx-t-section" id={id}>{title}</h1>
        <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
        <div className="gx-hstack gx-wrap gx-gap-8">
          <Button variant="secondary" onClick={onRetry}>{SHELL_COPY.tryAgain}</Button>
          <Button variant="ghost" onClick={onReload}>{APP_RELOAD_COPY.reload}</Button>
        </div>
      </section>
    </div>
  );
}
