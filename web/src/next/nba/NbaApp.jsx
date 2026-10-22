import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import './nba.css';
import { useEffect, useRef, useState } from 'react';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { noteSportRoute, useSportGuard } from '../../sportNavigation.js';
import { Button, FieldMark, Segmented } from '../ui/index.js';
import { Games } from './Games.jsx';
import { Bets } from './Bets.jsx';
import { BetEditor } from './BetEditor.jsx';
import { useNbaData } from './useNbaData.js';
import { nbaApi } from './api.js';
import { addNextFontLinks } from '../styles/fonts.js';
import { confirmSportLeave, nbaHash, nbaRoute, today } from './route.js';

export default function NbaApp(props) { return <NbaOwner key={props.session.user.id} {...props}/>; }
function NbaOwner({ session, onSignOut, onSportChange, api = nbaApi }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [route, setRoute] = useState(() => nbaRoute(window.location.hash) || { screen: 'games' });
  const [editor, setEditor] = useState(null), [dirty, setDirty] = useState(false), [notice, setNotice] = useState('');
  const current = useRef(route); current.current = route;
  const date = route.date || today(timeZone);
  const theme = useThemePreference();
  const [preferences] = useDashboardPreferences();
  useEffect(() => { addNextFontLinks(); }, []);
  useSportGuard(dirty);
  useEffect(() => {
    const changed = () => {
      const next = nbaRoute(window.location.hash); if (!next || nbaHash(next) === nbaHash(current.current)) return;
      if (dirty && !window.confirm('Leave without saving your changes?')) { window.history.pushState(null, '', nbaHash(current.current)); return; }
      setDirty(false); setEditor(null); setRoute(next);
    };
    const before = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', changed); window.addEventListener('hashchange', changed); window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener('hashchange', changed); window.removeEventListener('beforeunload', before); };
  }, [dirty]);
  function go(next, saved = false) {
    if (!saved && !confirmSportLeave()) return;
    setDirty(false); setEditor(null); setNotice(''); setRoute(next); window.history.pushState(null, '', nbaHash(next)); noteSportRoute();
  }
  const body = route.screen === 'games' ? { date, timeZone } : { filters: route.filters };
  const data = useNbaData(route.screen === 'games' ? 'games' : 'read', body, { api, poll: route.screen === 'games' });
  async function signOut() { if (!confirmSportLeave()) return; try { await onSignOut(); } catch (error) { setNotice(error.message); } }
  return <div className="gx gx-nba" data-motion={preferences.motion === 'reduced' ? 'reduce' : undefined}><a className="gx-sr-only gx-nba-skip" href="#nba-main">Skip to main content</a><div className="gx-nba-shell">
    <header className="gx-nba-header"><FieldMark size={32}/><Segmented label="Sport" value="nba" options={[{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }]} onChange={() => onSportChange()}/></header>
    <details className="gx-card gx-nba-account"><summary>Account and appearance</summary><p>{session.user.email}</p><label className="gx-nba-field">Color theme<select value={theme?.preference || 'dark'} onChange={event => theme?.choose(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><p className="gx-t-meta">Saved on this device.</p><Button onClick={signOut}>Sign out</Button></details>
    <nav className="gx-nba-nav" aria-label="NBA navigation">{[['games', 'Games'], ['bets', 'My Bets'], ['history', 'History']].map(([screen, label]) => <Button key={screen} aria-current={screen === route.screen ? 'page' : undefined} onClick={() => go(screen === 'games' ? { screen, ...(route.date ? { date: route.date } : {}) } : { screen, filters: { status: screen === 'bets' ? 'pending' : 'settled' } })}>{label}</Button>)}</nav>
    <main id="nba-main" className="gx-nba-main"><p role="status">{notice}</p>{editor ? <BetEditor key={editor.key} {...editor} api={api} onDirty={setDirty} onCancel={() => { if (confirmSportLeave()) { setDirty(false); setEditor(null); } }} onSaved={() => { if (route.screen === 'bets' && !Object.keys(route.filters).length) data.refresh(); go({ screen: 'bets', filters: {} }, true); setNotice('NBA ticket saved.'); }}/>
      : route.screen === 'games' ? <Games {...data} board={data.data} date={date} timeZone={timeZone} onDate={date => go({ screen: 'games', date })} onTrack={game => { setEditor({ key: crypto.randomUUID(), game, selectedDate: date }); setDirty(false); }}/>
      : <><Button variant="primary" onClick={() => setEditor({ key: crypto.randomUUID() })}>Track a bet</Button><Bets {...data} route={route} onFilters={filters => go({ ...route, filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) })} onEdit={ticket => { setEditor({ key: ticket.id, ticket }); setDirty(false); }}/></>}
    </main><footer className="gx-t-meta gx-c-2">NBA tickets are private. NBA totals are separate from NFL and Virtual Units.</footer>
  </div></div>;
}

/** Mount above all NFL eligibility providers; cold NBA links issue no NFL reads. */
export function SportEntry({ session, onSignOut, children, classic = false }) {
  const [nba, setNba] = useState(() => Boolean(nbaRoute(window.location.hash)));
  const state = useRef(nba); state.current = nba;
  const previousNfl = useRef(nba ? '#home' : window.location.hash || '#home');
  const accepted = useRef(window.location.hash);
  useEffect(() => {
    const changed = event => {
      const next = Boolean(nbaRoute(window.location.hash));
      if (next === state.current) { queueMicrotask(() => { accepted.current = window.location.hash; }); return; }
      event.stopImmediatePropagation();
      if (!event.gtlSportApproved && !confirmSportLeave()) { window.history.pushState(null, '', accepted.current); return; }
      if (!state.current) previousNfl.current = event.gtlSportFrom || accepted.current || '#home';
      accepted.current = window.location.hash; state.current = next; setNba(next);
    };
    window.addEventListener('popstate', changed, true); window.addEventListener('hashchange', changed, true);
    const remember = () => { accepted.current = window.location.hash; };
    window.addEventListener('gtl:route-accepted', remember);
    return () => { window.removeEventListener('popstate', changed, true); window.removeEventListener('hashchange', changed, true); window.removeEventListener('gtl:route-accepted', remember); };
  }, []);
  function navigate(hash) {
    if (!confirmSportLeave()) return;
    const from = window.location.hash;
    if (!nba) previousNfl.current = from || '#home';
    window.history.pushState(null, '', hash);
    const event = new PopStateEvent('popstate'); event.gtlSportApproved = true; event.gtlSportFrom = from; window.dispatchEvent(event);
  }
  return nba ? <NbaApp session={session} onSignOut={onSignOut} onSportChange={() => navigate(previousNfl.current)}/> : <>{classic && <div className="gx gx-nba-sport-entry"><Segmented label="Sport" value="nfl" options={[{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }]} onChange={() => navigate('#nba/games')}/></div>}{children}</>;
}
