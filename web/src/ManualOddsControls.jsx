import { refreshLabel } from './marketStatus';
import React, { useRef, useState } from 'react';
import { Download, Radio, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cloudApi } from './api';
import { ODDS_FAILED, ODDS_FAILURES, ODDS_LOW_QUOTA, ODDS_PENDING, oddsCount as count, oddsFetchAllowed, oddsSummary } from './oddsConnection.js';

export default function ManualOddsControls({ onCollected, schedule }) {
  const [busy, setBusy] = useState(''), [ready, setReady] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const requests = useRef({});
  async function run(operation) {
    if (busy || operation === 'collect' && !ready) return;
    setBusy(operation); setError('');
    if (operation === 'preflight') setReady(false);
    requests.current[operation] ||= crypto.randomUUID();
    try {
      const next = await cloudApi(`odds/${operation}`, { requestId: requests.current[operation] });
      // Render only the collection summary. Market values never belong in these controls.
      setResult(oddsSummary(operation, next));
      if (next.status === 'succeeded') {
        if (operation === 'preflight') {
          const measured = oddsFetchAllowed(next);
          setReady(measured);
          if (!measured) setError(ODDS_LOW_QUOTA);
        }
        delete requests.current[operation];
        if (operation === 'collect') await onCollected?.();
      } else if (next.status === 'failed') {
        setReady(false); delete requests.current[operation];
        setError(ODDS_FAILURES[next.errorCode] || ODDS_FAILED);
      } else {
        setError(ODDS_PENDING);
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  const succeeded = result?.status === 'succeeded';
  return <section className="panel manual-odds" aria-labelledby="manual-odds-heading">
    <div className="panel-heading"><div><h2 id="manual-odds-heading">Manual market connection</h2><p>Commissioner controls · Triple Threat</p></div><Radio size={20}/></div>
    <div className="manual-odds-body">
      <p>Check the saved server connection before fetching current lines. This screen never asks for your provider key or displays market values.</p>
      <div className="callout"><ShieldCheck size={18}/><p>Free quota only. Checking uses zero credits; each fetch can use up to 2 credits. The server limits collection to 6 times per UTC day, at least 5 minutes apart, and protects a 50-credit reserve. {refreshLabel({oddsSchedule:schedule})}. Manual fetches do not change the schedule.</p></div>
      <div className="manual-odds-actions"><button className="secondary" disabled={!!busy} onClick={() => run('preflight')}><Radio size={17}/>{busy === 'preflight' ? 'Checking…' : 'Check connection (zero-credit)'}</button><button className="primary" disabled={!!busy || !ready} onClick={() => run('collect')}><Download size={17}/>{busy === 'collect' ? 'Fetching…' : 'Fetch current lines'}</button></div>
      {!ready && <p className="hub-help">A successful connection check is required before fetching.</p>}
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
      {result && <div className="manual-odds-result" role="status"><strong>{succeeded ? result.operation === 'preflight' ? 'Connection check completed' : 'Manual fetch completed' : 'Request not completed'}</strong><dl><div><dt>Matched events</dt><dd>{count(result.matchedEvents)}</dd></div>{result.operation === 'collect' && <div><dt>Available quotes saved</dt><dd>{count(result.availableQuotes)}</dd></div>}<div><dt>Provider credits remaining</dt><dd>{count(result.quota?.remaining)}</dd></div><div><dt>Credits used in this request</dt><dd>{count(result.quota?.last)}</dd></div></dl><p>Provider quotes are not an official verified benchmark. Prediction reveal rules still apply. Outside models and betting suggestions remain unavailable.</p></div>}
    </div>
  </section>;
}
