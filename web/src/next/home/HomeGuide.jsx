import { useEffect, useRef, useState } from 'react';
import { meApi } from '../../api.js';
import { preferenceValue } from '../../../../shared/account-preferences.mjs';
import { Card, Button } from '../ui/index.js';
export function HomeGuide({ preferences, perGame }) {
  const saved = preferences?.data, [busy,setBusy] = useState(false), [error,setError] = useState('');
  const mounted = useRef(true), pending = useRef(false);
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; }; }, []);
  const collapsed = saved?.guidanceCollapsed === true;
  async function toggle() {
    if (!saved || pending.current) return;
    pending.current=true; setBusy(true); setError('');
    try {
      await meApi('preferences/save', { revision: saved.revision,...preferenceValue(saved),guidanceCollapsed: !collapsed });
      if (mounted.current) preferences.retry();
    } catch (error) { if (mounted.current) { setError('Your guide preference was not confirmed. Refresh settings and try again.'); preferences.retry(); } }
    finally { if (mounted.current) { pending.current=false; setBusy(false); } }
  }
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label="Getting started"><h2 className="gx-t-section">{collapsed ? 'Need a refresher?' : 'New here? Start here'}</h2>
    {!collapsed && <><p className="gx-t-body">Spread: guess the sportsbook’s handicap. Total: guess the combined points line. You are predicting the market line, not the final score.</p>
      <ol className="gx-home-guide gx-t-body"><li>Open Play and choose Spread or Total. Enter your guesses while the market is hidden.</li><li>{perGame ? 'Lock in one game when ready. That game’s guess is final; other games stay drafts.' : 'Follow the submission controls in Play. Per-game lock-in will appear when the scoring update is activated.'}</li><li>Your saved scoring line sets your points. A closer guess earns more points; a pending line stays unscored.</li><li>Use Your week to review each guess. Compare players on common scored games; official standings use games that have started.</li></ol>
      <p className="gx-t-meta gx-c-2">Other players’ picks and market details open only when the existing reveal rules allow it. Fantasy and Bets are separate from Guess points.</p></>}
    <Button disabled={!saved || busy} onClick={toggle} aria-expanded={!collapsed}>{busy ? 'Saving…' : collapsed ? 'Show getting started guide' : 'Collapse guide'}</Button>
    {preferences?.error && <p className="gx-t-meta">The guide is open because your saved preference is unavailable.</p>}{error && <p className="gx-t-body" role="alert">{error}</p>}
  </Card>;
}
