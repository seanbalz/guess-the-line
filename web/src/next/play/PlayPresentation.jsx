// Presentation only: WeekPicks still owns drafts, submission, rule checks and every disclosure gate.
import { useId, useLayoutEffect, useRef } from 'react';
import { Icon, TeamMark, teamCode } from '../ui/index.js';
import { team } from '../../communityFormat.js';

function GameCard({ game, title, kickoff, facts, reference, picker, trends, picked, changed, submitted, satOut, notOpen }) {
  const id = useId();
  const status = satOut ? 'Sat out' : submitted ? (changed ? 'Unsaved edit' : 'Submitted') : picked ? 'Picked · draft' : notOpen ? 'Not open' : 'To pick';
  return <article className="panel week-pick gx-play-game" aria-labelledby={id} data-picked={picked || undefined}>
    <header className="gx-play-game-head">
      <div className="gx-play-game-meta"><time dateTime={game.kickoff}>{kickoff}</time><span className="gx-play-pick-state">{picked && <Icon icon="check" size={16}/>}{status}</span></div>
      <h3 id={id} className="gx-play-matchup" aria-label={title}>
        <span><TeamMark code={game.awayCode} size={32} decorative/><span>{team(game.awayCode)}</span></span>
        <span><TeamMark code={game.homeCode} size={32} decorative/><span><small>at </small>{team(game.homeCode)}</span></span>
      </h3>
    </header>
    {picker && <div className="gx-play-entry">{picker}</div>}
    {reference && <section className="gx-play-reference" aria-label="Your saved scoring reference">{reference}</section>}
    <details className="gx-play-details">
      <summary>Game details<Icon icon="chevronDown" size={16}/></summary>
      <div className="gx-play-details-body">{facts}</div>
    </details>
    {trends && <div className="gx-play-trends">{trends}</div>}
  </article>;
}

function SaveDock({ children, className }) {
  const dock = useRef(null);
  useLayoutEffect(() => {
    const node = dock.current, screen = node.closest('.gx-live-play');
    // Error/retry text, font loading and narrow screens can all change the dock's height.
    // Reserve that actual height so the final game and keyboard-focused controls can clear it.
    const measure = () => screen.style.setProperty('--gx-play-dock-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { observer.disconnect(); screen.style.removeProperty('--gx-play-dock-height'); };
  }, []);
  return <div ref={dock} className={`${className} gx-play-save-dock`}>{children}</div>;
}

function HelpCard({ mode, help, onDismiss }) {
  return <details className="gx-play-help">
    <summary><span>How to pick<small>{mode === 'guess_spread' ? 'Choose the favorite, then the spread.' : 'Choose the combined points total.'}</small></span><Icon icon="chevronDown" size={16}/></summary>
    <div className="gx-play-help-body"><p>{help}</p><button type="button" aria-label="Got it, hide this tip" onClick={onDismiss}>Got it</button></div>
  </details>;
}

export const playPresentation = Object.freeze({ GameCard, SaveDock, HelpCard, teamLabels: game => ({ away: teamCode(game.awayCode), home: teamCode(game.homeCode) }) });
