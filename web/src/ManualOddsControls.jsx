import { refreshLabel } from './marketStatus';
import React, { useRef, useState } from 'react';
import { Download, Radio, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cloudApi } from './api';

const count = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unavailable';
const failures = {
  ODDS_AUTH: 'The provider did not accept the server connection. Review the saved server key, then check again.',
  ODDS_RATE_LIMIT: 'The provider has temporarily limited requests. Wait before checking again.',
  ODDS_BUDGET: 'The protected free quota does not allow this fetch.',
  ODDS_QUOTA_COST: 'The provider reported an unexpected credit cost. Review the quota before collecting again.',
  ODDS_LEASE_EXPIRED: 'The saved request expired. Check the collection status before starting another fetch.',
};

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
      setResult({ operation, status: next.status, matchedEvents: next.matchedEvents, availableQuotes: next.availableQuotes, quota: next.quota });
      if (next.status === 'succeeded') {
        if (operation === 'preflight') {
          const measured = Number.isSafeInteger(next.quota?.remaining) && next.quota.remaining >= 52;
          setReady(measured);
          if (!measured) setError('The connection responded, but a measured quota of at least 52 free credits is required to protect the reserve. Fetching stays disabled.');
        }
        delete requests.current[operation];
        if (operation === 'collect') await onCollected?.();
      } else if (next.status === 'failed') {
        setReady(false); delete requests.current[operation];
        setError(failures[next.errorCode] || 'The provider request did not complete. Check the connection before trying again.');
      } else {
        setError('This request has not completed. Retry the same action to check its saved status.');
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  const succeeded = result?.status === 'succeeded';
  return <section className="panel manual-odds" aria-labelledby="manual-odds-heading">
    <div className="panel-heading"><div><h2 id="manual-odds-heading">Manual market connection</h2><p>Commissioner controls · Triple Threat</p></div><Radio size={20}/></div>
    <div className="manual-odds-body">
      <p>Check the saved server connection before fetching current lines. This screen never asks for your provider key or displays market values.</p>
      <div className="callout"><ShieldCheck size={18}/><p>Free quota only. Checking uses zero credits; each fetch can use up to 2 credits. The server limits collection to 4 times per UTC day, at least 15 minutes apart, and protects a 50-credit reserve. {refreshLabel({oddsSchedule:schedule})}. Manual fetches do not change the schedule.</p></div>
      <div className="manual-odds-actions"><button className="secondary" disabled={!!busy} onClick={() => run('preflight')}><Radio size={17}/>{busy === 'preflight' ? 'Checking…' : 'Check connection (zero-credit)'}</button><button className="primary" disabled={!!busy || !ready} onClick={() => run('collect')}><Download size={17}/>{busy === 'collect' ? 'Fetching…' : 'Fetch current lines'}</button></div>
      {!ready && <p className="hub-help">A successful connection check is required before fetching.</p>}
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
      {result && <div className="manual-odds-result" role="status"><strong>{succeeded ? result.operation === 'preflight' ? 'Connection check completed' : 'Manual fetch completed' : 'Request not completed'}</strong><dl><div><dt>Matched events</dt><dd>{count(result.matchedEvents)}</dd></div>{result.operation === 'collect' && <div><dt>Available quotes saved</dt><dd>{count(result.availableQuotes)}</dd></div>}<div><dt>Provider credits remaining</dt><dd>{count(result.quota?.remaining)}</dd></div><div><dt>Credits used in this request</dt><dd>{count(result.quota?.last)}</dd></div></dl><p>Provider quotes are not an official verified benchmark. Prediction reveal rules still apply. Outside models and betting suggestions remain unavailable.</p></div>}
    </div>
  </section>;
}
