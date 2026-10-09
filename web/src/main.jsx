import React, { lazy } from 'react';
import { createRoot } from 'react-dom/client';
import AuthGate from './AuthGate.jsx';
import DeferredScreen from './DeferredScreen.jsx';
import { cloudRequested } from './auth';
import { ThemeProvider } from './Theme';
import './installPrompt.js';
import './styles.css';
const App = lazy(() => import('./App.jsx'));
const GameHub = lazy(() => import('./GameHub.jsx'));

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider>{cloudRequested ? <AuthGate>{props => <DeferredScreen key={props.session.user.id} label="your games"><GameHub {...props}/></DeferredScreen>}</AuthGate> : <DeferredScreen label="your league"><App/></DeferredScreen>}</ThemeProvider></React.StrictMode>);
