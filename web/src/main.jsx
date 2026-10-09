import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import GameHub from './GameHub.jsx';
import { cloudRequested } from './auth';
import { ThemeProvider } from './Theme';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider>{cloudRequested ? <AuthGate>{props => <GameHub key={props.session.user.id} {...props}/>}</AuthGate> : <App/>}</ThemeProvider></React.StrictMode>);
