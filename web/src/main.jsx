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
const App = lazy(() => import('./App.jsx'));
const GameHub = lazy(() => import('./GameHub.jsx'));
// D-38: the new app is one lazy chunk (with its own CSS). A device that never chose it never downloads it.
const NextApp = lazy(() => import('./next/NextApp.jsx'));

// Redesign stage 9 (build plan section 3.2): the device's choice, read once; every switch reloads the page.
const appView = cloudRequested ? startAppView() : 'classic';

const Classic = props => <DeferredScreen label="your games"><GameHub {...props}/></DeferredScreen>;

// The outer fallback: when the new app's chunk cannot load (or the new app fails outside its own boundaries), this
// device forgets the choice and the old app renders in its place, unmounting the new one; the old footer says so.
class NextAppFallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { clearAppView(); noteAppFallback(); }
  render() { return this.state.failed ? <Classic {...this.props.app}/> : this.props.children; }
}

function NflSignedIn({ view, ...props }) {
  if (view !== 'next') return <Classic {...props}/>;
  return <NextAppFallback app={props}>
    <Suspense fallback={<div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/>Loading the new app…</div>}><NextApp {...props}/></Suspense>
  </NextAppFallback>;
}

function SignedIn({ view, ...props }) {
  return <SportEntry {...props} classic={view !== 'next'}><NflSignedIn view={view} {...props}/></SportEntry>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider>{cloudRequested ? <AuthGate>{props => <SignedIn key={props.session.user.id} view={appView} {...props}/>}</AuthGate> : <DeferredScreen label="your league"><App/></DeferredScreen>}</ThemeProvider></React.StrictMode>);
