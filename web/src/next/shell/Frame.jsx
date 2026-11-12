// The new app's fixed frame pieces (prototype shell, CONTRACT section 2; spec 1.2 and 1.3): the top bar, the tab bar,
// the offline banner, the dock host and the "coming next" card each tab shows until its own stage replaces it.
import { createPortal } from 'react-dom';
import { useContext, useId } from 'react';
import { Avatar, Button, Icon } from '../ui/index.js';
import { cx } from '../ui/cx.js';
import { APP_RELOAD_COPY } from '../../appView.js';
import { useShell } from './context.js';
import { navigateSport } from '../nba/route.js';
import { EplAccessContext, NBA_ON_SWITCH, sportOptions } from '../epl/route.js';
import { SportNavigationContext, sportSwitchHash } from '../sportSwitch.js';
import { SHELL_COPY, TABS, TAB_INFO, leagueLabel, tabBadge } from './tabs.js';
import { PrismBrand } from '../ui/PrismBrand.jsx';
import { HomeBrand } from '../home/HomeBrand.jsx';
import homeNfl from '../ui/brand-assets/nfl.png';
import homePremierDark from '../ui/brand-assets/premier-league-white.svg';
import homePremierLight from '../ui/brand-assets/premier-league-purple.svg';
import homeNba from '../ui/brand-assets/nba.png';

// Four primary destinations, using the shared original icon language.
const TAB_ICONS = { home: 'house', play: 'target', bets: 'ticket', research: 'chart' };

/** Top bar (spec 1.3): the Field monogram (to Home), the league pill (the switcher) and your avatar (the menu). */
export function TopBar({ leagueName, you, onHome, onLeague, onMenu, compact = false }) {
  return (
    <header className="gx-topbar">
      <div className="gx-topbar-inner">
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.home} onClick={onHome}>
          {compact?<HomeBrand/>:<PrismBrand/>}
        </button>
        {compact?<SportControls marks/>:<button type="button" className="gx-league-btn" aria-label={leagueLabel(leagueName)} onClick={onLeague}>
          <span className="gx-league-pill">
            <span className="gx-league-name gx-truncate">{leagueName}</span>
            <Icon icon="chevronDown" size={16}/>
          </span>
        </button>}
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.menu} onClick={onMenu}>
          <Avatar id={you.id} name={you.name} size={32}/>
        </button>
      </div>
    </header>
  );
}

export const SPORT_NAMES = Object.freeze({ nfl: 'National Football League', epl: 'Premier League', nba: 'National Basketball Association' });
/** One league's official mark (each in its own circle); the Premier League lion has a dark and a light file. */
function LeagueMark({ sport, dark, light }) {
  if (sport === 'epl') return <><img className={dark} src={homePremierDark} alt=""/><img className={light} src={homePremierLight} alt=""/></>;
  return <img src={sport === 'nba' ? homeNba : homeNfl} alt=""/>;
}

/**
 * The sport selector, a plain row right after the top bar (or the compact header's marks). NBA joins it only with
 * NBA_ON_SWITCH, except that while NBA shows its circle is drawn selected. It stays out of the sticky bar so the bar keeps
 * its --gx-size-topbar height, which sticky headings and focus scroll margins rely on.
 */
export function SportControls({ marks = false }) {
  const epl = useContext(EplAccessContext);
  const { sport, change } = useContext(SportNavigationContext);
  const choose=value=>change?change(value):navigateSport(sportSwitchHash(value,window.location.hash));
  const options=sportOptions(epl,NBA_ON_SWITCH||sport==='nba');
  if(marks)return <nav className="gx-home-sports" aria-label="Sports"><div className="gx-hstack gx-gap-8" role="group" aria-label="Sport" data-count={options.length}>{options.map(option=><button key={option.value} type="button" className="gx-home-sport" aria-label={SPORT_NAMES[option.value]} aria-pressed={sport===option.value} onClick={()=>choose(option.value)}><LeagueMark sport={option.value} dark="gx-home-pl-dark" light="gx-home-pl-light"/></button>)}</div></nav>;
  return <nav className="gx-sport-controls" aria-label="Sports"><div className="gx-hstack gx-gap-8" role="group" aria-label="Sport" data-count={options.length}>{options.map(option=><button key={option.value} type="button" className="gx-sport-mark" aria-label={SPORT_NAMES[option.value]} title={SPORT_NAMES[option.value]} aria-pressed={sport===option.value} onClick={()=>choose(option.value)}><LeagueMark sport={option.value} dark="gx-prism-dark" light="gx-prism-light"/></button>)}</div></nav>;
}

/** Shared detail navigation stays above the destination's own title. */
export function DetailBack({ onBack }) {
  return <div className="gx-detail-nav"><Button variant="ghost" onClick={onBack}><Icon icon="chevronLeft" size={20}/>Back</Button></div>;
}

/**
 * Four-tab bar: the one showing marked with aria-current and the selected tint; a counter or dot
 * from each tab's slot file, in its name too ("Play, 1 ballot due").
 */
export function TabBar({ current, data, onTab, barRef }) {
  return (
    <nav ref={barRef} className="gx-tabbar" aria-label={SHELL_COPY.tabs}>
      <div className="gx-tabbar-inner">
        {TABS.map(tab => {
          const on = tab === current;
          const badge = tabBadge(tab, data);
          return (
            <button
              key={tab}
              type="button"
              className={cx('gx-tab', on && 'gx-tab--on')}
              data-tab={tab}
              aria-current={on ? 'page' : undefined}
              aria-label={badge.name}
              onClick={() => onTab(tab)}
            >
              <span className="gx-tab-icon">
                <Icon icon={TAB_ICONS[tab]}/>
                {badge.count ? <span className="gx-counter" aria-hidden="true">{badge.count}</span> : null}
                {badge.dot ? <span className="gx-tab-dot" aria-hidden="true"></span> : null}
              </span>
              <span className="gx-tab-label" aria-hidden="true">{badge.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The offline banner at the top of the page (prototype shell). Its status region stays in place, so the words are
 * announced when the connection drops; Retry checks again.
 */
export function OfflineBanner({ offline, onRetry }) {
  return (
    <div role="status">
      {offline ? (
        <div className="gx-offline">
          <Icon icon="alert" size={16}/>
          <p className="gx-grow">{SHELL_COPY.offline}</p>
          <Button variant="ghost-2" onClick={onRetry}>{SHELL_COPY.retry}</Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A tab's dock bar (Play's submit bar, Bets' slip bar), drawn in the frame's dock 8 above the tab bar so toasts sit
 * above it: `<Dock><div className="gx-dock-bar">...</div></Dock>` inside a tab's screen.
 */
export function Dock({ children }) {
  const { dockHost } = useShell();
  return dockHost ? createPortal(children, dockHost) : null;
}

/** The card each tab shows until its own stage arrives: its job, and a reload. */
export function ComingNext({ tab }) {
  const shell = useShell();
  const id = useId();
  const info = TAB_INFO[tab];
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">{info.label}</h1>
      <section className="gx-empty" aria-labelledby={id}>
        <h2 className="gx-t-section" id={id}>{SHELL_COPY.comingNext}</h2>
        <p className="gx-t-body">{info.job}</p>
        <p className="gx-t-body gx-c-2">{SHELL_COPY.sameData}</p>
        <Button variant="primary" block onClick={shell.reload}>{APP_RELOAD_COPY.reload}</Button>
      </section>
    </div>
  );
}
