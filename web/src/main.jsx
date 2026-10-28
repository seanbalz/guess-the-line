import React, { Component, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import AuthGate from './AuthGate.jsx';
import DeferredScreen from './DeferredScreen.jsx';
import { cloudRequested } from './auth';
import { ThemeProvider } from './Theme';
import { SportEntry } from './next/nba/NbaApp.jsx';
import { APP_RELOAD_COPY, reloadApp, startAppView } from './appView.js';
import './installPrompt.js';
import './styles.css';

// The Google Fonts stylesheet loads as media="print" so it never blocks the first paint (display=swap shows the system
// fallback until the webfont arrives); it applies to the screen as soon as the app starts.
document.querySelector('link[data-gtl-fonts]')?.setAttribute('media', 'all');
const App = lazy(() => import('./App.jsx'));
// D-38: the new app is one lazy chunk (with its own CSS). It is the only app a signed-in member can open (appView.js).
const NextApp = lazy(() => import('./next/NextApp.jsx'));

// Once per page load: forgets a saved old-app choice and drops a stale `app` parameter (appView.js).
if (cloudRequested) startAppView();

// The outer fallback: when the new app's chunk cannot load (or the new app fails outside its own boundaries), this
// screen offers a reload. It never mounts the old app.
class NextAppFallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="loading" id="main" role="alert">
      <p>{APP_RELOAD_COPY.failed}</p>
      <button type="button" className="secondary" onClick={() => reloadApp()}><RefreshCw size={16} aria-hidden="true"/>{APP_RELOAD_COPY.reload}</button>
    </main>;
  }
}

function SignedIn(props) {
  return <SportEntry {...props}>
    <NextAppFallback>
      <Suspense fallback={<div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/>Loading your games…</div>}><NextApp {...props}/></Suspense>
    </NextAppFallback>
  </SportEntry>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider>{cloudRequested ? <AuthGate>{props => <SignedIn key={props.session.user.id} {...props}/>}</AuthGate> : <DeferredScreen label="your league"><App/></DeferredScreen>}</ThemeProvider></React.StrictMode>);
