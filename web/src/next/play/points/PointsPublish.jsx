// Play › Points, the commissioner's "Publish now" (D-56): opens a drafted week early, so the commissioner
// never needs the SQL editor. Shown only when the Community read says this account is the commissioner
// (shell.communityAdmin); gtl-api checks again (gtl_community_admin) and the database refuses a slate whose first game
// has kicked off. Preview reads the stored draft (POST /points/slate action preview); Publish now asks once, then sends
// action publish, which replays harmlessly when the week is already open. The preview never shows the House estimate.
import { useEffect, useRef, useState } from 'react';
import { pointsApi } from '../../../api.js';
import { Button, Card, Dialog, Matchup } from '../../ui/index.js';
import { PlayLoading } from '../PlayStates.jsx';
import { previewRows, publishProblem, kickoffText } from './pointsModel.js';

/**
 * Checks `target`'s slate and offers Publish now while it is a draft. `quiet` (a week is already open on this screen) shows
 * nothing until a draft is found: no loading line and no refusal. `onPublished(week)` reloads the week.
 */
export function PointsPublish({ target, quiet = false, onPublished }) {
  const key = `${target.season}:${target.week}`;
  const [state, setState] = useState({ key, loading: true, slate: null, error: null });
  const [revision, setRevision] = useState(0), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const alive = useRef(true), running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, loading: true, slate: null, error: null }); setProblem('');
    pointsApi('slate', { action: 'preview', season: target.season, week: target.week }, controller.signal)
      .then(slate => { if (!controller.signal.aborted) setState({ key, loading: false, slate, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, loading: false, slate: null, error }); });
    return () => controller.abort();
    // The key names the target week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);
  async function publish() {
    if (running.current) return;
    running.current = true; setBusy(true); setConfirm(false); setProblem('');
    try {
      const slate = await pointsApi('slate', { action: 'publish', season: target.season, week: target.week });
      if (!alive.current) return;
      setState({ key, loading: false, slate, error: null });
      onPublished?.(target.week);
    } catch (error) {
      if (alive.current) setProblem(publishProblem(error, { week: target.week }));
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const { loading, slate, error } = state.key === key ? state : { loading: true, slate: null, error: null };
  return <PointsPublishView week={target.week} loading={loading} slate={slate} error={error} quiet={quiet} confirm={confirm} busy={busy} problem={problem}
    onAsk={() => { setProblem(''); setConfirm(true); }} onCancel={() => { if (!busy) setConfirm(false); }} onPublish={publish} onRetry={() => setRevision(n => n + 1)}/>;
}

/** One state of the panel, drawn from props alone (tests render each one). */
export function PointsPublishView({ week, loading, slate, error, quiet, confirm, busy, problem, onAsk, onCancel, onPublish, onRetry }) {
  if (loading) return quiet ? null : <PlayLoading>Checking Week {week}’s slate…</PlayLoading>;
  if (error) {
    if (quiet) return null;
    return <Card variant="s2" className="gx-vstack gx-gap-12" role="alert" data-points-publish="problem">
      <p className="gx-t-body">{publishProblem(error, { week, action: 'preview' })}</p>
      {error.status !== 403 && <Button onClick={onRetry}>Check again</Button>}
    </Card>;
  }
  if (slate?.status === 'published') return quiet ? null : <p className="gx-t-body" role="status" data-points-publish="done">Week {week} is open for everyone.</p>;
  if (slate?.status !== 'draft') return null;
  const opens = slate.opensAt ? kickoffText(slate.opensAt) : null;
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label={`Week ${week} preview, commissioner only`} data-points-publish="draft">
    <h2 className="gx-t-section">Week {week} preview</h2>
    <p className="gx-t-meta gx-c-2">Commissioner only. Players can’t see this slate yet{opens && opens !== '—' ? `; it opens on its own ${opens}` : ''}.</p>
    <ol className="gx-pt-preview" aria-label={`Week ${week} drafted players`}>
      {previewRows(slate).map(row => <li key={row.slot} className="gx-pt-preview-row">
        <span className="gx-pt-pill gx-t-strong">{row.slot} · {row.name}</span>
        <span className="gx-t-meta gx-c-2">{row.codes ? <Matchup away={row.codes.away} home={row.codes.home}/> : row.matchup} · {row.kickoff}</span>
      </li>)}
    </ol>
    <Button variant="primary" block disabled={busy} onClick={onAsk}>{busy ? 'Publishing…' : 'Publish now'}</Button>
    {problem && <p className="gx-t-body gx-c-loss" role="alert">{problem}</p>}
    <Dialog open={confirm} title={`Publish Week ${week} now?`} text={`Opens Week ${week} for everyone now. This can’t be undone.`} onClose={onCancel}>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" disabled={busy} onClick={onPublish}>Publish now</Button>
    </Dialog>
  </Card>;
}
