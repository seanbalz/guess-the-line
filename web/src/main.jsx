import React, { Component, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { LoaderCircle } from 'lucide-react';
import AuthGate from './AuthGate.jsx';
import DeferredScreen from './DeferredScreen.jsx';
import { cloudRequested } from './auth';
import { ThemeProvider } from './Theme';
import { SportEntry } from './next/nba/NbaApp.jsx';
import { clearAppView, noteAppFallback, startAppView } from './appView.js';
import './installPrompt.js';
import './styles.css';

// The Google Fonts stylesheet loads as media="print" so it never blocks the first paint (display=swap shows the system
// fallback until the webfont arrives); it applies to the screen as soon as the app starts.
document.querySelector('link[data-gtl-fonts]')?.setAttribute('media', 'all');
const App = lazy(() => import('./App.jsx'));
const GameHub = lazy(() => import('./GameHub.jsx'));
// D-38: the new app is one lazy chunk (with its own CSS). D-60: it is what every signed-in member opens; the old app's
// chunks load only on `?app=classic` ("Older records and tools") or as the fallback below.
const NextApp = lazy(() => import('./next/NextApp.jsx'));

// Read once per page load (appView.js): the new app, or the old one on `?app=classic`; moving between them loads a new page.
const appView = cloudRequested ? startAppView() : 'classic';

const Classic = props => <DeferredScreen label="your games"><GameHub {...props}/></DeferredScreen>;

// The outer fallback: when the new app's chunk cannot load (or the new app fails outside its own boundaries), the old
// app renders in its place on this page, unmounting the new one; the old footer says so. The next visit tries again.
class NextAppFallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { clearAppView(); noteAppFallback(); }
  render() { return this.state.failed ? <Classic {...this.props.app}/> : this.props.children; }
}

function NflSignedIn({ view, ...props }) {
  if (view !== 'next') return <Classic {...props}/>;
  return <NextAppFallback app={props}>
    <Suspense fallback={<div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/>Loading your games…</div>}><NextApp {...props}/></Suspense>
  </NextAppFallback>;
}

function SignedIn({ view, ...props }) {
  return <SportEntry {...props}><NflSignedIn view={view} {...props}/></SportEntry>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider>{cloudRequested ? <AuthGate>{props => <SignedIn key={props.session.user.id} view={appView} {...props}/>}</AuthGate> : <DeferredScreen label="your league"><App/></DeferredScreen>}</ThemeProvider></React.StrictMode>);
