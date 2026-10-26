// Stage 78: the existing manual D-26 settlement path; M-18/M-19 remain separate backend work.
import { useEffect, useId, useRef, useState } from 'react';
import { cloudApi } from '../../api.js';
import { readNextDraft, removeNextDraft, writeNextDraft } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { fmtFull } from '../format.js';
import { Button, Card, Sheet } from '../ui/index.js';
import './settlement.css';

const KEY = 'settlement-check';
const weekOf = value => Number.isInteger(value?.season) && value.season >= 2000 && value.season <= 2200 && Number.isInteger(value?.week) && value.week >= 1 && value.week <= 25
  ? { season: value.season, week: value.week } : null;
const sameWeek = (a, b) => a?.season === b?.season && a?.week === b?.week;
const versions = data => JSON.stringify(Object.entries(data?.virtual.results ?? {}).map(([id, result]) => [id, result.version, result.status, result.home, result.away]).sort());
function recovery(accountId) {
  try { return weekOf(JSON.parse(readNextDraft(accountId, KEY))); } catch { return null; }
}

export function Settlement() {
  const app = useAppData(), shell = useShell(), selectId = useId();
  const [pending, setPending] = useState(() => recovery(app.accountId));
  const [chosen, setChosen] = useState(pending);
  const [data, setData] = useState(null), [review, setReview] = useState(false), [report, setReport] = useState(null);
  const [busy, setBusy] = useState(true), [problem, setProblem] = useState(''), [notice, setNotice] = useState(''), [kept, setKept] = useState(true);
  const request = useRef(false), lifetime = useRef(null);
  const { setDirty } = shell;
  useEffect(() => { setDirty('settlement', busy || review || !!pending); return () => setDirty('settlement', false); }, [busy, review, pending, setDirty]);
  function remember(value) {
    setPending(value);
    if (value) setKept(writeNextDraft(app.accountId, KEY, JSON.stringify(value)));
    else { removeNextDraft(app.accountId, KEY); setKept(true); }
  }
  async function read(scope, target, checking = false) {
    try {
      const [community] = await app.refresh({ only: ['community'] });
      if (lifetime.current !== scope) return null;
      if (community?.status !== 'ready' || community.error) throw new Error('Your commissioner access could not be checked. Refresh before making a change.');
      if (community.data?.admin !== true) throw new Error('Only the Community commissioner can settle results.');
      const result = await cloudApi('bets/recommendations', target ?? {});
      if (lifetime.current !== scope) return null;
      if (!weekOf(result?.virtual) || !Array.isArray(result.virtual.games) || !Array.isArray(result.slates) || !result.virtual.results
        || (target && !sameWeek(result.virtual, target))) throw new Error('Saved results did not match the selected week. Refresh before making a change.');
      setData(result); setChosen(weekOf(result.virtual)); setProblem('');
      if (checking) {
        remember(null); setReview(false);
        setNotice('Current saved results loaded. Review them before deciding whether to settle again.');
      }
      return result;
    } catch (failure) {
      if (lifetime.current !== scope) return null;
      if (failure.status === 401) app.requestSignIn();
      setData(null); setProblem(failure.message || 'Saved results could not be checked. Try refreshing.');
      return null;
    }
  }
  async function refresh(target = pending ?? chosen, checking = !!pending, scope = lifetime.current) {
    if (!scope || request.current) return;
    request.current = true; setBusy(true); setChosen(target);
    try { await read(scope, target, checking); }
    finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  useEffect(() => {
    const scope = {}; lifetime.current = scope;
    void refresh(pending, !!pending, scope);
    return () => { lifetime.current = null; request.current = false; };
    // This view is keyed by the authenticated account. A recovered intent only reads; it never writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function settle() {
    const scope = lifetime.current, target = weekOf(data?.virtual), before = versions(data);
    if (!scope || request.current || pending || !review || !target) return;
    request.current = true; setBusy(true); setNotice(''); setProblem(''); setReport(null);
    try {
      const latest = await read(scope, target);
      if (lifetime.current !== scope || !latest) return;
      if (versions(latest) !== before) {
        setReview(false); setNotice('Saved results changed since your review. Review the current results before deciding again.'); return;
      }
      remember(target);
      try {
        const result = await cloudApi('virtual-units/settle', target, { save: true });
        if (lifetime.current !== scope) return;
        setReport(result);
        setNotice('Settlement completed. Checking saved results…');
      } catch (failure) {
        if (lifetime.current !== scope) return;
        if (failure.status === 401) app.requestSignIn();
        if (failure.name !== 'SaveUncertainError') {
          remember(null); setReview(false);
          await read(scope, target);
          if (lifetime.current === scope) setProblem(failure.message || 'Settlement could not be completed.');
          return;
        }
        setNotice('The settlement reply was lost. Check saved results before deciding again.');
      }
      await read(scope, target, true);
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  function leave(next) { if (!request.current && shell.confirmLeave()) next(); }
  const view = data?.virtual;
  return <Sheet title={review && !pending ? 'Review settlement' : 'Settlement'} back={{ label: 'Menu', onBack: () => leave(() => shell.setSheetArgs({ sub: null })) }} onClose={() => leave(shell.closeSheet)} tall>
    <p className="gx-t-body">Grade this week’s Virtual Units from published nflverse finals. Applies to every player. Corrections keep saved bet terms and prior results.</p>
    <div role="alert">{problem && <p className="gx-t-body gx-settlement-problem">{problem}</p>}</div>
    <p role="status" className="gx-t-body">{notice}</p>
    {busy && <p className="gx-t-meta">Checking settlement data…</p>}
    {report && <Card className="gx-settlement-stack" aria-label="Settlement report">
      <h3 className="gx-t-strong">{report.season} · Week {report.week} completed</h3>
      <p className="gx-t-body">Published finals: {report.finals} · {report.settled} new · {report.corrected} corrected · {report.unchanged} unchanged · {report.picksSettled} picks graded</p>
      <p className="gx-t-meta">{report.pending?.length ?? 0} source games without a final · {report.skipped?.length ?? 0} source games outside this slate</p>
    </Card>}
    {pending ? <Card className="gx-settlement-stack">
      <h3 className="gx-t-strong">Check {pending.season} Week {pending.week} results</h3>
      <p className="gx-t-body">This reads saved results. It never repeats settlement automatically.</p>
      {!kept && <p className="gx-t-meta">This browser cannot keep the pending check. Keep this screen open until results are checked.</p>}
      <Button variant="primary" disabled={busy} onClick={() => refresh()}>Check saved results</Button>
    </Card> : review ? <Card className="gx-settlement-stack">
      <h3 className="gx-t-strong">{chosen?.season} · Week {chosen?.week}</h3>
      <p className="gx-t-body">Run settlement for every player in this week? Final scores are fetched when you confirm. Games without a published final remain pending.</p>
      <Button disabled={busy} onClick={() => setReview(false)}>Cancel</Button>
      <Button variant="primary" disabled={busy || !view} onClick={settle}>Settle published finals</Button>
    </Card> : view && <>
      <div className="gx-field"><label className="gx-t-strong" htmlFor={selectId}>Published week</label>
        <select className="gx-input" id={selectId} value={`${view.season}:${view.week}`} disabled={busy} onChange={event => {
          const [season, week] = event.target.value.split(':').map(Number);
          setReport(null); setNotice(''); void refresh({ season, week }, false);
        }}>{data.slates.map(item => <option key={`${item.season}:${item.week}`} value={`${item.season}:${item.week}`}>{item.season} · Week {item.week}</option>)}</select>
      </div>
      <p className="gx-t-meta">Last stored settlement: {view.settlement?.lastSettledAt ? fmtFull(view.settlement.lastSettledAt) : 'No stored settlement yet'}</p>
      <Button variant="primary" disabled={busy} onClick={() => { setReview(true); setReport(null); setNotice(''); }}>Review settlement</Button>
      <section aria-label="Saved results" className="gx-settlement-stack">
        {view.games.map(game => {
          const result = view.results[game.id];
          return <Card key={game.id} className="gx-settlement-stack">
            <h3 className="gx-t-strong">{game.awayCode} @ {game.homeCode}</h3>
            <p className="gx-t-body">{!result ? 'No stored result' : result.status === 'final' ? `Final · ${game.awayCode} ${result.away} – ${game.homeCode} ${result.home}` : `Void · ${result.status}`}</p>
            {result && <p className="gx-t-meta">Version {result.version} · {result.source || 'Source not recorded'} · Observed {result.observedAt ? fmtFull(result.observedAt) : 'time not recorded'}</p>}
          </Card>;
        })}
      </section>
    </>}
    {!pending && <Button disabled={busy} onClick={() => refresh()}>Refresh results</Button>}
    <Card className="gx-settlement-stack" aria-label="Schedule status">
      <h3 className="gx-t-strong">Manual settlement</h3>
      <p className="gx-t-meta">Automatic schedule status is not available here. No scheduled run is started by opening this screen.</p>
      <p className="gx-t-meta">Friend-challenge settlement is not connected yet. Actual bet tracking and Guess scores are separate.</p>
    </Card>
  </Sheet>;
}
