import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import tokens from '../../design/tokens.json';
import { themeVariables } from './themeTokens';

const storageKey = 'gtl.theme';
const valid = value => ['dark', 'light', 'system'].includes(value);
function readPreference() { try { const value = localStorage.getItem(storageKey); return valid(value) ? value : 'dark'; } catch { return 'dark'; } }
function applyTheme(preference) {
  const resolved = preference === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : preference;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVariables(tokens, resolved))) root.style.setProperty(name, value);
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
}
const initialPreference = readPreference();
applyTheme(initialPreference);
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(initialPreference), [saved, setSaved] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const change = () => applyTheme(preference);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [preference]);
  useEffect(() => {
    const sync = event => { if (event.key === storageKey) setPreference(valid(event.newValue) ? event.newValue : 'dark'); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  function choose(value) {
    if (!valid(value)) return;
    applyTheme(value); setPreference(value);
    try { localStorage.setItem(storageKey, value); setSaved(true); } catch { setSaved(false); }
  }
  return <ThemeContext.Provider value={{ preference, choose, saved }}>{children}</ThemeContext.Provider>;
}

/** The device's Light/Dark/System choice for the new app's Appearance (redesign stage 10): `{ preference, choose,
 *  saved }`, the same state and `gtl.theme` key as the selector below, so both apps always agree. */
export function useThemePreference() { return useContext(ThemeContext); }

export default function ThemeSelector() {
  const { preference, choose, saved } = useContext(ThemeContext), id = useId();
  const Icon = preference === 'light' ? Sun : preference === 'system' ? Monitor : Moon;
  return <section className="theme-selector" aria-label="Appearance"><div><Icon size={20}/><label htmlFor={id}>Appearance</label></div><select id={id} aria-label="Color theme" value={preference} onChange={event => choose(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select><p>{saved ? 'Saved on this device, not your account.' : 'Browser storage is unavailable. Applied for this tab.'}</p></section>;
}
