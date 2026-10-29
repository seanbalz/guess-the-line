import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import './nba.css';
import { useEffect, useRef, useState } from 'react';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { noteSportRoute, SportSlotContext, useSportGuard } from '../../sportNavigation.js';
import { Button, Segmented } from '../ui/index.js';
import { NbaHeader } from './NbaHeader.jsx';
import { Games } from './Games.jsx';
import { Bets } from './Bets.jsx';
import { BetEditor } from './BetEditor.jsx';
import { useNbaData } from './useNbaData.js';
import { nbaApi } from './api.js';
import { addNextFontLinks } from '../styles/fonts.js';
import { confirmSportLeave, nbaHash, nbaRoute, today } from './route.js';
import EplApp from '../epl/EplApp.jsx';
import { useEplAccess } from '../epl/api.js';
import { EplAccessContext, eplGate, primeLobby, SPORT_HOME, sportOptions } from '../epl/route.js';
import { cloudApi } from '../../api.js';
import { sportAt } from '../sportAt.js';

export { sportAt, NbaHeader };

export default function NbaApp(props) { return <NbaOwner key={props.session.user.id} {...props}/>; }
function NbaOwner({ session, onSignOut, onSportChange, epl = false, api = nbaApi }) {
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
  // The skip link moves focus without touching the address: a #nba-main fragment would read as a sport change.
  const mainRef = useRef(null);
  function skipToMain(event) { event.preventDefault(); mainRef.current?.focus(); }
  async function signOut() { if (!confirmSportLeave()) return; try { await onSignOut(); } catch (error) { setNotice(error.message); } }
  return <div className="gx gx-nba" data-motion={preferences.motion === 'reduced' ? 'reduce' : undefined}><a className="gx-sr-only gx-nba-skip" href="#nba-main" onClick={skipToMain}>Skip to main content</a><div className="gx-nba-shell">
    <NbaHeader epl={epl} onSportChange={onSportChange}/>
    <details className="gx-card gx-nba-account"><summary>Account and appearance</summary><p>{session.user.email}</p><label className="gx-nba-field">Color theme<select value={theme?.preference || 'dark'} onChange={event => theme?.choose(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><p className="gx-t-meta">Saved on this device.</p><Button onClick={signOut}>Sign out</Button></details>
    <nav className="gx-nba-nav" aria-label="NBA navigation">{[['games', 'Games'], ['bets', 'My Bets'], ['history', 'History']].map(([screen, label]) => <Button key={screen} aria-current={screen === route.screen ? 'page' : undefined} onClick={() => go(screen === 'games' ? { screen, ...(route.date ? { date: route.date } : {}) } : { screen, filters: { status: screen === 'bets' ? 'pending' : 'settled' } })}>{label}</Button>)}</nav>
    <main id="nba-main" className="gx-nba-main" tabIndex={-1} ref={mainRef}><p role="status">{notice}</p>{editor ? <BetEditor key={editor.key} {...editor} api={api} onDirty={setDirty} onCancel={() => { if (confirmSportLeave()) { setDirty(false); setEditor(null); } }} onSaved={() => { if (route.screen === 'bets' && !Object.keys(route.filters).length) data.refresh(); go({ screen: 'bets', filters: {} }, true); setNotice('NBA ticket saved.'); }}/>
      : route.screen === 'games' ? <Games {...data} board={data.data} date={date} timeZone={timeZone} onDate={date => go({ screen: 'games', date })} onTrack={game => { setEditor({ key: crypto.randomUUID(), game, selectedDate: date }); setDirty(false); }}/>
      : <><Button variant="primary" onClick={() => setEditor({ key: crypto.randomUUID() })}>Track a bet</Button><Bets {...data} route={route} onFilters={filters => go({ ...route, filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) })} onEdit={ticket => { setEditor({ key: ticket.id, ticket }); setDirty(false); }}/></>}
    </main><footer className="gx-t-meta gx-c-2">NBA tickets are private. NBA totals are separate from NFL and Virtual Units.</footer>
  </div></div>;
}

/** Mount above all NFL eligibility providers; cold NBA and EPL links issue no NFL reads. */
export function SportEntry({ session, onSignOut, children }) {
  const [sport, setSport] = useState(() => sportAt(window.location.hash));
  const state = useRef(sport); state.current = sport;
  const previousNfl = useRef(sport !== 'nfl' ? '#home' : window.location.hash || '#home');
  const accepted = useRef(window.location.hash);
  // EPL access is the lobby reply's `epl` (no request of its own): the EPL option shows only for FEPL members (and the
  // commissioner). null until a lobby reply says; a cold #epl link reads the lobby once, which the NFL app then reuses.
  const access = useEplAccess(session.user.id), epl = access === true;
  const gate = eplGate(sport, access);
  useEffect(() => {
    if (gate === 'wait') primeLobby(session.user.id, () => cloudApi('lobby')).catch(() => { /* Read as no EPL: leaves for NFL. */ });
  }, [gate, session.user.id]);
  // A cold #epl/... link for an account without EPL: leave for NFL in place (replace, so Back does not return to it).
  useEffect(() => {
    if (gate !== 'leave') return;
    const hash = previousNfl.current || '#home';
    window.history.replaceState(null, '', hash);
    accepted.current = hash; state.current = 'nfl'; setSport('nfl');
  }, [gate]);
  useEffect(() => {
    const changed = event => {
      // While NBA or EPL shows, a non-route #nba… / #epl… fragment (an in-page anchor) keeps it; only another sport's address leaves it.
      const hash = window.location.hash, next = sportAt(hash, state.current);
      if (next === state.current) { queueMicrotask(() => { accepted.current = window.location.hash; }); return; }
      event.stopImmediatePropagation();
      if (!event.gtlSportApproved && !confirmSportLeave()) { window.history.pushState(null, '', accepted.current); return; }
      if (state.current === 'nfl') previousNfl.current = event.gtlSportFrom || accepted.current || '#home';
      accepted.current = window.location.hash; state.current = next; setSport(next);
    };
    window.addEventListener('popstate', changed, true); window.addEventListener('hashchange', changed, true);
    const remember = () => { accepted.current = window.location.hash; };
    window.addEventListener('gtl:route-accepted', remember);
    return () => { window.removeEventListener('popstate', changed, true); window.removeEventListener('hashchange', changed, true); window.removeEventListener('gtl:route-accepted', remember); };
  }, []);
  function navigate(hash) {
    if (!confirmSportLeave()) return;
    const from = window.location.hash;
    if (sport === 'nfl') previousNfl.current = from || '#home';
    window.history.pushState(null, '', hash);
    const event = new PopStateEvent('popstate'); event.gtlSportApproved = true; event.gtlSportFrom = from; window.dispatchEvent(event);
  }
  const change = value => { if (value !== sport) navigate(value === 'nfl' ? previousNfl.current : SPORT_HOME[value]); };
  // The old app's shells (including the new app's crash fallback) place this after their skip link; the new app has its own in the top bar.
  const selector = <div className="gx gx-nba-sport-entry"><Segmented label="Sport" value="nfl" options={sportOptions(epl)} onChange={change}/></div>;
  if (sport === 'nba') return <NbaApp session={session} onSignOut={onSignOut} epl={epl} onSportChange={change}/>;
  if (gate === 'show') return <EplApp key={session.user.id} onSportChange={change}/>;
  // While the lobby has not answered, or until the effect above leaves for NFL, nothing EPL-specific (and no NFL read) renders.
  if (gate !== 'other') return null;
  return <EplAccessContext.Provider value={epl}><SportSlotContext.Provider value={selector}>{children}</SportSlotContext.Provider></EplAccessContext.Provider>;
}
