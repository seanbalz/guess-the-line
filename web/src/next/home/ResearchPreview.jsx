import { useState } from 'react';
import { Button, Card, Segmented } from '../ui/index.js';
export function ResearchPreview({ shell, preferences }) {
  const [market,setMarket] = useState('all');
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label="Wager research"><h2 className="gx-t-section">What’s interesting this week</h2>
    <Segmented label="Research market" value={market} onChange={setMarket} options={[{ value: 'all',label: 'All' },{ value: 'spread',label: 'Spreads' },{ value: 'total',label: 'Totals' }]}/>
    <p className="gx-t-body">{market === 'all' ? 'Ranked wagers' : market === 'spread' ? 'Ranked spread wagers' : 'Ranked total wagers'} unavailable: a validated independent model and qualifying trend or verified expert support are not connected.</p>
    <p className="gx-t-body gx-c-2">Your guess, the Community benchmark (including you), and a model projection are different signals. A guess-to-line gap alone is research, not a ranked wager.</p>
    {!preferences?.data ? <p className="gx-t-meta">Your sportsbook preferences are unavailable.</p> : !preferences.data.sportsbooks.length ? <p className="gx-t-body">Choose your sportsbooks to see available offers when recommendations are ready.</p> : <p className="gx-t-meta">{preferences.data.sportsbooks.length} sportsbook choices saved. No qualifying ranked offers yet.</p>}
    <Button onClick={() => shell.openSheet('sh.menu',{ sub: 'preferences' })}>Choose sportsbooks</Button>
    <Button variant="ghost" onClick={() => shell.go('lines',{ market: market === 'all' ? 'spread' : market })}>Explore lines and trends</Button>
  </Card>;
}
