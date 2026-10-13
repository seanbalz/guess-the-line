import React, { Component, Suspense, lazy, useId, useState } from 'react';
import { ChartSpline, ChevronDown, RefreshCw } from 'lucide-react';
import './trends.css';

const loadPanel = () => lazy(() => import('./TrendsPanel.jsx'));

class PanelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="error-banner" role="alert"><span>Trends could not load. Check your connection, then retry; reload the page if it keeps failing. Your picks are not affected.</span>
      <button type="button" className="text-button" onClick={this.props.onRetry}><RefreshCw size={16} aria-hidden="true"/>Retry</button></div>;
    return this.props.children;
  }
}

/** The per-game "Trends" button. Focus stays on it when the panel opens; the panel follows it in the reading order. */
export function TrendsExpander({ open, onToggle, controls, away, home }) {
  return <button type="button" className="secondary trends-expander" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
    <ChartSpline size={16} aria-hidden="true"/>Trends<span className="sr-only"> for {away} at {home}</span><ChevronDown className="trends-chevron" size={16} aria-hidden="true"/>
  </button>;
}

/** The panel container. The panel code and the week file load only the first time it opens. */
export function TrendsBody({ id, open, season, week, gameId, level = 4, ...view }) {
  const [attempt, setAttempt] = useState(0), [Panel, setPanel] = useState(loadPanel);
  const retry = () => { setPanel(loadPanel); setAttempt(n => n + 1); };
  return <div id={id} className="game-trends-body" hidden={!open}>
    {open && <PanelBoundary key={attempt} onRetry={retry}>
      <Suspense fallback={<p className="trends-status" role="status">Loading trends…</p>}>
        <Panel season={season} week={week} gameId={gameId} level={level} {...view}/>
      </Suspense>
    </PanelBoundary>}
  </div>;
}

/** Button and panel together, for a game card (Community Picks) or a dashboard drilldown. */
export default function GameTrends({ away, home, ...props }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div className="game-trends">
    <TrendsExpander open={open} onToggle={() => setOpen(value => !value)} controls={id} away={away} home={home}/>
    <TrendsBody id={id} open={open} {...props}/>
  </div>;
}
