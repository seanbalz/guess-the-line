// Redesign stage 78: Menu › Commissioner tools › Odds connection, native. It replaces the old ManualOddsControls in the
// adapter and keeps its rules (web/src/oddsConnection.js): a zero-credit connection check must measure enough free credits
// before a fetch is allowed, each action reuses its request id until it completes (a retry checks the saved request, never
// a second fetch), and only counts are shown, never a provider key or a market value. The original Triple Threat
// commissioner only; gtl-api checks again on every request (`/odds/preflight`, `/odds/collect`).
import { useRef, useState } from 'react';
import { cloudApi } from '../../../api.js';
import { ODDS_FAILED, ODDS_FAILURES, ODDS_LOW_QUOTA, ODDS_PENDING, oddsCount, oddsFetchAllowed, oddsSummary } from '../../../oddsConnection.js';
import { Button, Card, Pill } from '../../ui/index.js';
import { oddsScheduleText } from './LegacyTools.jsx';

export function OddsConnection({ data, onCollected }) {
  const [busy, setBusy] = useState(''), [ready, setReady] = useState(false), [result, setResult] = useState(null), [problem, setProblem] = useState('');
  const requests = useRef({});
  async function run(operation) {
    if (busy || (operation === 'collect' && !ready)) return;
    setBusy(operation); setProblem('');
    if (operation === 'preflight') setReady(false);
    requests.current[operation] ||= crypto.randomUUID();
    try {
      const reply = await cloudApi(`odds/${operation}`, { requestId: requests.current[operation] });
      setResult(oddsSummary(operation, reply));
      if (reply.status === 'succeeded') {
        if (operation === 'preflight') {
          const allowed = oddsFetchAllowed(reply);
          setReady(allowed);
          if (!allowed) setProblem(ODDS_LOW_QUOTA);
        }
        delete requests.current[operation];
        if (operation === 'collect') await onCollected?.();
      } else if (reply.status === 'failed') {
        setReady(false); delete requests.current[operation];
        setProblem(ODDS_FAILURES[reply.errorCode] || ODDS_FAILED);
      } else setProblem(ODDS_PENDING);
    } catch (failure) { setProblem(failure?.message || ODDS_FAILED); }
    finally { setBusy(''); }
  }
  const schedule = oddsScheduleText(data);
  const succeeded = result?.status === 'succeeded';
  const heading = !result ? '' : !succeeded ? 'Request not completed' : result.operation === 'preflight' ? 'Connection check completed' : 'Manual fetch completed';
  return <>
    <p className="gx-t-body gx-c-2">Triple Threat. Check the saved server connection before fetching current lines. This screen never asks for the provider key or shows market values.</p>
    <Card className="gx-cm-stack" data-odds="limits">
      <h3 className="gx-t-strong">Free quota only</h3>
      <p className="gx-t-body">Checking uses no credits; each fetch can use up to 2. The server allows 6 fetches per UTC day, at least 5 minutes apart, and keeps a 50-credit reserve. Manual fetches do not change the schedule.</p>
      <p className="gx-t-meta gx-c-2">{schedule.label}</p>
    </Card>
    <Button disabled={!!busy} onClick={() => run('preflight')}>{busy === 'preflight' ? 'Checking…' : 'Check connection (zero-credit)'}</Button>
    <Button variant="primary" disabled={!!busy || !ready} onClick={() => run('collect')}>{busy === 'collect' ? 'Fetching…' : 'Fetch current lines'}</Button>
    {!ready && <p className="gx-t-meta gx-c-2">A successful connection check is required before fetching.</p>}
    <div role="alert">{problem && <p className="gx-t-body gx-cm-problem">{problem}</p>}</div>
    <div role="status">{result && <Card className="gx-cm-stack" data-odds="result">
      <h3 className="gx-t-strong"><Pill tone={succeeded ? 'win' : 'pending'}>{heading}</Pill></h3>
      <dl className="gx-cm-counts">
        <div><dt className="gx-t-meta gx-c-2">Matched events</dt><dd className="gx-t-strong gx-n-s">{oddsCount(result.matchedEvents)}</dd></div>
        {result.operation === 'collect' && <div><dt className="gx-t-meta gx-c-2">Available quotes saved</dt><dd className="gx-t-strong gx-n-s">{oddsCount(result.availableQuotes)}</dd></div>}
        <div><dt className="gx-t-meta gx-c-2">Provider credits remaining</dt><dd className="gx-t-strong gx-n-s">{oddsCount(result.quota?.remaining)}</dd></div>
        <div><dt className="gx-t-meta gx-c-2">Credits used in this request</dt><dd className="gx-t-strong gx-n-s">{oddsCount(result.quota?.last)}</dd></div>
      </dl>
      <p className="gx-t-meta gx-c-2">Provider quotes are not an official verified benchmark. Pick reveal rules still apply.</p>
    </Card>}</div>
  </>;
}
