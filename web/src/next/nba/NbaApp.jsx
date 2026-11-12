// Sport entry above the shared account provider (main.jsx). Since milestone N1 NBA mounts the same new app as NFL and
// EPL, in the Prism shell (NbaShell.jsx, chosen by NextApp); the v1 NbaApp with its own header, account panel and
// three-button nav is retired. Its old addresses land on their new place (nba/route.js).
import './nba.css';
import { useEffect, useRef, useState } from 'react';
import { SportSlotContext } from '../../sportNavigation.js';
import { Segmented } from '../ui/index.js';
import { confirmSportLeave } from './route.js';
import { SportNavigationContext, sportSwitchHash } from '../sportSwitch.js';
import { useEplAccess } from '../epl/api.js';
import { EplAccessContext, eplGate, primeLobby, sportOptions } from '../epl/route.js';
import { cloudApi } from '../../api.js';
import { sportAt } from '../sportAt.js';

export { sportAt };

/** Resolve sport access above the shared account provider; cold NBA/EPL links issue no NFL gameplay reads. */
export function SportEntry({ session, children }) {
  const [sport, setSport] = useState(() => sportAt(window.location.hash));
  const state = useRef(sport); state.current = sport;
  const previousNfl = useRef(sport !== 'nfl' ? '#home' : window.location.hash || '#home');
  const accepted = useRef(window.location.hash);
  // EPL is open to every confirmed account once M-30 is available. NBA and EPL mount no NFL app, so both must prime
  // the lobby when this account's access is unknown (including after an account switch on a saved NBA address).
  const access = useEplAccess(session.user.id), epl = access === true;
  const gate = eplGate(sport, access);
  useEffect(() => {
    if (gate === 'wait' || (sport === 'nba' && access === null)) primeLobby(session.user.id, () => cloudApi('lobby')).catch(() => { /* Read as no EPL; a cold EPL address leaves for NFL. */ });
  }, [gate, sport, access, session.user.id]);
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
  const change = value => { if (value !== sport) navigate(sport === 'nba' && value === 'nfl' ? previousNfl.current : sportSwitchHash(value, window.location.hash)); };
  // The old app's shells (including the new app's crash fallback) place this after their skip link; the new app has its own in the top bar.
  const selector = <div className="gx gx-nba-sport-entry"><Segmented label="Sport" value="nfl" options={sportOptions(epl)} onChange={change}/></div>;
  // While the lobby has not answered, or until the effect above leaves for NFL, nothing EPL-specific (and no NFL read) renders.
  if (gate === 'wait' || gate === 'leave') return null;
  return <EplAccessContext.Provider value={epl}><SportNavigationContext.Provider value={{ sport, change }}><SportSlotContext.Provider value={selector}>{children}</SportSlotContext.Provider></SportNavigationContext.Provider></EplAccessContext.Provider>;
}
