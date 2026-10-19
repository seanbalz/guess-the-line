// The new app's fixed frame pieces (prototype shell, CONTRACT section 2; spec 1.2 and 1.3): the top bar, the tab bar,
// the offline banner, the dock host and the "coming next" card each tab shows until its own stage replaces it.
import { createPortal } from 'react-dom';
import { useId } from 'react';
import { Avatar, Button, FieldMark, Icon } from '../ui/index.js';
import { cx } from '../ui/cx.js';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useShell } from './context.js';
import { SHELL_COPY, TABS, TAB_INFO, leagueLabel, tabBadge } from './tabs.js';

// Lucide house, target, ticket, chart-line and trophy (spec 1.2), by the kit's names.
const TAB_ICONS = { home: 'house', play: 'target', bets: 'ticket', lines: 'chart', league: 'trophy', fantasy: 'people' };

/** Top bar (spec 1.3): the Field monogram (to Home), the league pill (the switcher) and your avatar (the menu). */
export function TopBar({ leagueName, you, onHome, onLeague, onMenu }) {
  return (
    <header className="gx-topbar">
      <div className="gx-topbar-inner">
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.home} onClick={onHome}>
          <FieldMark size={32}/>
        </button>
        <button type="button" className="gx-league-btn" aria-label={leagueLabel(leagueName)} onClick={onLeague}>
          <span className="gx-league-pill">
            <span className="gx-league-name gx-truncate">{leagueName}</span>
            <Icon icon="chevronDown" size={16}/>
          </span>
        </button>
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.menu} onClick={onMenu}>
          <Avatar id={you.id} name={you.name} size={32}/>
        </button>
      </div>
    </header>
  );
}

/**
 * Tab bar (spec 1.2, plus Fantasy Football): the one showing marked with aria-current and the lime bar; a counter or dot
 * from each tab's slot file, in its name too ("Play, 1 ballot due").
 */
export function TabBar({ current, data, onTab }) {
  return (
    <nav className="gx-tabbar" aria-label={SHELL_COPY.tabs}>
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

/** The card each tab shows until its own stage arrives: its job, and the old app, where everything still works. */
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
        <Button variant="primary" block onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</Button>
      </section>
    </div>
  );
}
