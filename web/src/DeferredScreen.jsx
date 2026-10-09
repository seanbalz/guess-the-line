import React, { Component, Suspense } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';

// Keep failures inside the selected screen so the surrounding navigation works.
// Reload is explicit: a missing deployment chunk must never reload an edited ballot.
class ScreenErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="panel" role="alert">
      <h2>This screen couldn’t load</h2>
      <p className="muted">Check your connection, then reload the page. Reloading won’t submit picks. Any unsaved edits may need to be restored from this tab.</p>
      <button className="secondary" onClick={() => window.location.reload()}><RefreshCw size={16}/>Reload page</button>
    </section>;
    return this.props.children;
  }
}

export default function DeferredScreen({ children, label = 'screen', resetKey }) {
  return <ScreenErrorBoundary key={resetKey}>
    <Suspense fallback={<div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/>Loading {label}…</div>}>
      {children}
    </Suspense>
  </ScreenErrorBoundary>;
}
