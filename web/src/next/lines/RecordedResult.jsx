// An explicit check uses the existing stored weekly reader. No mount/focus polling or additional provider collection.
import { useEffect, useRef, useState } from 'react';
import { linesApi } from '../../api.js';
import { Button, Card } from '../ui/index.js';
import { marketTime } from './marketDetails.js';
import { checkedGameResult } from './resultCheck.js';

export function RecordedResult({ lines, game, snapshot }) {
  const { app, shown } = lines;
  const scope = JSON.stringify([app.accountId, shown?.season, shown?.week, game.id]);
  const current = useRef(scope); current.current = scope;
  const pending = useRef(null);
  const [observations, setObservations] = useState({});
  const saved = observations[game.id];
  const active = saved?.scope === scope ? saved : null;
  const loading = active?.status === 'loading' && pending.current?.scope === scope && !pending.current.controller.signal.aborted;
  const observation = active?.observation ?? (snapshot ? { result: snapshot } : null);
  useEffect(() => () => { if (pending.current?.scope === scope) pending.current.controller.abort(); }, [scope]);
  const check = async () => {
    if (!app.accountId || !shown || (pending.current?.scope === scope && !pending.current.controller.signal.aborted)) return;
    pending.current?.controller.abort();
    const controller = new AbortController();
    pending.current = { scope, controller };
    const previous = active?.observation;
    const update = value => setObservations(rows => ({ ...rows, [game.id]: { scope, ...value } }));
    update({ status: 'loading', observation: previous });
    try {
      const reply = await linesApi('read', { season: shown.season, week: shown.week }, controller.signal);
      if (controller.signal.aborted || current.current !== scope) return;
      update({ status: 'ready', observation: checkedGameResult(reply, { ...shown, game }) });
    } catch (error) {
      if (controller.signal.aborted || current.current !== scope) return;
      if (error?.status === 401) app.requestSignIn?.();
      update({ status: 'error', observation: previous });
    } finally {
      if (pending.current?.controller === controller) pending.current = null;
    }
  };
  if (!app.accountId || !shown || (!snapshot && !game.started)) return null;
  const result = observation?.result;
  return <Card as="section" aria-label="Recorded result" className="gx-vstack gx-gap-8">
    <h3 className="gx-t-section">Recorded result</h3>
    {result ? <>
      <p className="gx-t-strong">{result.score}</p>
      <p className="gx-l-observation gx-t-meta gx-c-2">{result.provenance}</p>
    </> : <p className="gx-t-body">{observation?.checkedAt ? 'No complete recorded final returned for this game.' : 'No recorded result checked yet.'}</p>}
    {observation?.checkedAt ? <p className="gx-t-meta gx-c-2">{active?.status === 'ready' ? 'Checked' : 'Last successful check'} {marketTime(observation.checkedAt)}</p>
      : snapshot ? <p className="gx-t-meta gx-c-2">Recorded when opened.</p> : null}
    {loading && <p className="gx-t-meta" role="status">Checking recorded result…</p>}
    {active?.status === 'error' && <p className="gx-t-body" role="alert">Couldn’t check the result. {observation ? 'Your previous observation is kept.' : 'Try again.'}</p>}
    <Button variant="secondary" aria-disabled={loading || undefined} aria-busy={loading || undefined} onClick={check}>
      {active?.status === 'error' ? 'Try result again' : 'Check recorded result'}
    </Button>
  </Card>;
}
