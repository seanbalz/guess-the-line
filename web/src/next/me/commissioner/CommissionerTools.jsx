// D-65 follow-up: Menu › Commissioner tools, the new-app home of the old app's commissioner screens, which became
// unreachable when the old app was removed. Only the Community commissioner sees the Menu row (`shell.communityAdmin`,
// the same grant as Community members); every route checks again on the server, and nothing here changes a rule:
// - Status: automatic week opening (`/community/week-open`), the odds refresh schedule (`/state`) and Virtual Units
//   settlement (`/virtual-units`, and `/virtual-units/settle` to run it now, D-26);
// - Week opening: review the public schedule and publish a week early (`/community/publish-preview`, `/community/publish`);
// - Game referees: one per game, kept with its history (`/officials/read`, `/officials/set`);
// - Final scores and Odds connection: the old editors through the documented adapter (LegacyTools.jsx), shown only to
//   the original Triple Threat commissioner, as before (`/results/review`, `/odds/preflight`, `/odds/collect`).
// The code loads only when the commissioner opens the tools.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cloudApi, communityApi, officialsApi } from '../../../api.js';
import { rememberOfficial } from '../../../trendsLoaders.js';
import { refereeFor } from '../../../../../shared/trends-view.mjs';
import { useAppData } from '../../data/AppData.jsx';
import { fmtFull } from '../../format.js';
import { useTrendWeek } from '../../lines/trendsHooks.js';
import { useShell } from '../../shell/context.js';
import { Button, Card, LinkRow, List, Pill, Sheet } from '../../ui/index.js';
import { FinalScoresEditor, OddsConnectionEditor, oddsScheduleText } from './LegacyTools.jsx';
import './commissioner.css';

export const TRIPLE_THREAT = 'sean-troy-luke';
export const COMMISSIONER_COPY = Object.freeze({
  title: 'Commissioner tools',
  only: 'Only the Community commissioner can use these tools.',
  tools: Object.freeze([
    { id: 'status', icon: 'clock', label: 'Schedule and settlement status' },
    { id: 'weeks', icon: 'plus', label: 'Week opening' },
    { id: 'referees', icon: 'people', label: 'Game referees' },
    { id: 'results', icon: 'trophy', label: 'Final scores' },
    { id: 'odds', icon: 'chart', label: 'Odds connection' },
  ]),
  originalOnly: 'Only the original Triple Threat commissioner can use this tool.',
});

const plain = error => (error?.status ? error.message : 'No connection. Reconnect and try again.');
const label = id => COMMISSIONER_COPY.tools.find(tool => tool.id === id)?.label ?? COMMISSIONER_COPY.title;

/** The Triple Threat `/state` read the old Settings page used; a reload keeps the last data showing and says whether it worked. */
function useTripleThreat(onSignIn) {
  const [read, setRead] = useState({ loading: true, data: null, error: null });
  const live = useRef(true);
  const load = useCallback(async () => {
    try {
      const data = await cloudApi('state', undefined, { league: TRIPLE_THREAT, mode: 'guess_spread' });
      if (live.current) setRead({ loading: false, data, error: null });
      return true;
    } catch (error) {
      if (error?.status === 401) onSignIn?.();
      if (live.current) setRead(current => ({ loading: false, data: current.data, error }));
      return false;
    }
  }, [onSignIn]);
  useEffect(() => { live.current = true; void load(); return () => { live.current = false; }; }, [load]);
  const data = read.data?.league?.id === TRIPLE_THREAT ? read.data : null;
  const commissioner = !!data?.league.roster?.some(player => player.id === data.playerId && player.role?.toLowerCase() === 'commissioner');
  return { ...read, data, commissioner, reload: load };
}

function Problem({ children }) {
  return <div role="alert">{children && <p className="gx-t-body gx-cm-problem">{children}</p>}</div>;
}

function Hub({ open }) {
  return <>
    <p className="gx-t-body gx-c-2">Commissioner only. Each tool checks your access again when it saves.</p>
    <Card variant="flush"><List>
      {COMMISSIONER_COPY.tools.map(tool => <LinkRow key={tool.id} icon={tool.icon} onClick={() => open(tool.id)}>{tool.label}</LinkRow>)}
    </List></Card>
  </>;
}

function WeekOpeningStatus() {
  const [status, setStatus] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    communityApi('week-open').then(value => { if (live) setStatus(value); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const state = failed ? 'Unavailable' : !status ? 'Loading…' : status.enabled ? 'Enabled' : status.configured ? 'Disabled' : 'Not configured';
  const last = status?.lastRunAt ? `Last run ${fmtFull(status.lastRunAt)} · ${status.lastStatus}${status.lastReason ? ` (${status.lastReason.replaceAll('_', ' ')})` : ''}` : status ? 'No runs yet' : '';
  return <Card className="gx-cm-stack" data-status="week-open">
    <h3 className="gx-t-strong">Automatic week opening</h3>
    <p className="gx-t-body"><Pill tone={status?.enabled ? 'win' : 'pending'}>{state}</Pill></p>
    <p className="gx-t-meta gx-c-2">Mondays 12:00 AM PT{last ? ` · ${last}` : ''}</p>
  </Card>;
}

function Status({ app, week }) {
  const triple = useTripleThreat(app.requestSignIn);
  const [virtual, setVirtual] = useState({ loading: true, data: null, error: null });
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [problem, setProblem] = useState(''), [uncertain, setUncertain] = useState(false);
  const live = useRef(true);
  const readVirtual = useCallback(async () => {
    try { const data = await cloudApi('virtual-units', undefined, { league: TRIPLE_THREAT }); if (live.current) setVirtual({ loading: false, data, error: null }); return data; }
    catch (error) { if (live.current) setVirtual({ loading: false, data: null, error }); return null; }
  }, []);
  useEffect(() => { live.current = true; void readVirtual(); return () => { live.current = false; }; }, [readVirtual]);
  const target = virtual.data ? { season: virtual.data.season, week: virtual.data.week } : week ? { season: week.season, week: week.week } : null;
  async function settle() {
    if (busy || uncertain || !target) return;
    setBusy(true); setNotice(''); setProblem('');
    try {
      const result = await cloudApi('virtual-units/settle', target, { save: true });
      const games = count => `${count} game${count === 1 ? '' : 's'}`;
      const notes = [result.pending?.length ? `${games(result.pending.length)} still without a final` : '', result.skipped?.length ? `${games(result.skipped.length)} not on this week’s slate` : ''].filter(Boolean);
      if (live.current) setNotice(`Settled Week ${result.week} from ${result.finals} published final${result.finals === 1 ? '' : 's'}: ${result.settled} new, ${result.corrected} corrected, ${result.unchanged} unchanged, ${result.picksSettled} pick${result.picksSettled === 1 ? '' : 's'} graded${notes.map(note => ` · ${note}`).join('')}.`);
      await readVirtual();
    } catch (failure) {
      if (!live.current) return;
      if (failure.status === 401 && !failure.uncertain) app.requestSignIn?.();
      if (failure.name === 'SaveUncertainError' || failure.uncertain) { setUncertain(true); setProblem('The reply was lost. Check the saved results before settling again; this never repeats the settlement.'); }
      else setProblem(failure.message || 'Nothing was settled.');
    } finally { if (live.current) setBusy(false); }
  }
  async function check() {
    if (busy) return;
    setBusy(true);
    const data = await readVirtual();
    if (live.current) { setBusy(false); if (data) { setUncertain(false); setProblem(''); setNotice('Saved results refreshed. Review them before settling again.'); } }
  }
  const odds = oddsScheduleText(triple.data);
  const settlement = virtual.data?.settlement;
  return <>
    <WeekOpeningStatus/>
    <Card className="gx-cm-stack" data-status="odds">
      <h3 className="gx-t-strong">Odds refresh</h3>
      <p className="gx-t-body">{triple.loading ? 'Loading…' : odds.label}</p>
      <p className="gx-t-meta gx-c-2">{triple.loading ? '' : odds.details}</p>
    </Card>
    <Card className="gx-cm-stack" data-status="settlement">
      <h3 className="gx-t-strong">Virtual Units settlement{target ? ` · Week ${target.week}` : ''}</h3>
      {virtual.loading ? <p className="gx-t-body">Loading…</p> : virtual.data ? <>
        <p className="gx-t-body">{settlement?.settledGames ? `${settlement.settledGames} of ${virtual.data.games?.length ?? '—'} games settled` : 'No games settled yet'}</p>
        <p className="gx-t-meta gx-c-2">{settlement?.lastSettledAt ? `Finals as of ${fmtFull(settlement.lastSettledAt)}` : 'Finals settle after each results refresh.'}</p>
      </> : <p className="gx-t-body">Settlement status unavailable.</p>}
      <Problem>{problem}</Problem>
      <p className="gx-t-body" role="status">{notice}</p>
      {uncertain ? <Button disabled={busy} onClick={check}>Check saved results</Button>
        : <Button disabled={busy || !target} onClick={settle}>{busy ? 'Settling…' : 'Settle finals now'}</Button>}
    </Card>
  </>;
}

function WeekOpening({ app, week }) {
  const id = useId();
  const [season, setSeason] = useState(String(week?.season || new Date().getFullYear())), [number, setNumber] = useState(String((week?.week || 0) + 1));
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  async function run(action) {
    if (busy) return;
    setBusy(true); setProblem(''); setNotice('');
    try {
      const result = await communityApi(action, { season: Number(season), week: Number(number) });
      if (!live.current) return;
      if (action === 'publish-preview') setPreview(result);
      else {
        setPreview(null);
        setNotice(result.published ? `Week ${result.week} is open.` : `Week ${result.week} was already open.`);
        await app.refresh({ only: ['community'] });
      }
    } catch (failure) { if (live.current) setProblem(plain(failure)); }
    finally { if (live.current) setBusy(false); }
  }
  const edit = setter => event => { setter(event.target.value); setPreview(null); };
  return <>
    <p className="gx-t-body gx-c-2">Weeks open automatically Mondays at 12:00 AM PT. Review the public NFL schedule here, or publish early if the automatic opening fails. Nothing changes until you publish.</p>
    <div className="gx-cm-fields">
      <label className="gx-t-label" htmlFor={`${id}-season`}>Season<input id={`${id}-season`} className="gx-input gx-n-s" type="number" inputMode="numeric" min={2000} max={2200} value={season} disabled={busy} onChange={edit(setSeason)}/></label>
      <label className="gx-t-label" htmlFor={`${id}-week`}>Week<input id={`${id}-week`} className="gx-input gx-n-s" type="number" inputMode="numeric" min={1} max={25} value={number} disabled={busy} onChange={edit(setNumber)}/></label>
    </div>
    <Button disabled={busy} onClick={() => run('publish-preview')}>{busy && !preview ? 'Loading schedule…' : 'Review schedule'}</Button>
    <Problem>{problem}</Problem>
    <p className="gx-t-body" role="status">{notice}</p>
    {preview && <Card className="gx-cm-stack" data-preview>
      <h3 className="gx-t-strong">Week {preview.week} · {preview.games.length} games</h3>
      <ul className="gx-cm-games" aria-label={`Week ${preview.week} schedule`}>
        {preview.games.map(game => <li key={game.id}><span className="gx-t-strong">{game.matchup}{game.neutral ? ' (neutral)' : ''}</span><span className="gx-t-meta gx-c-2">{fmtFull(game.kickoff)}</span></li>)}
      </ul>
      <p className="gx-t-meta gx-c-2">Picks lock {fmtFull(preview.deadline)}</p>
      <Button variant="primary" block disabled={busy} onClick={() => run('publish')}>{busy ? 'Publishing…' : `Publish Week ${preview.week}`}</Button>
    </Card>}
  </>;
}

function Referees({ app, week }) {
  const id = useId();
  const season = week?.season, number = week?.week;
  const trends = useTrendWeek(season, number, Boolean(week), app.accountId);
  const [hosted, setHosted] = useState(null), [state, setState] = useState('loading'), [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [problem, setProblem] = useState('');
  useEffect(() => {
    if (!week) return undefined;
    let live = true;
    officialsApi('read', { season, week: number })
      .then(result => { if (live) { setHosted(result); setState('ready'); } })
      .catch(error => { if (live) { setState(error?.status === 404 ? 'not_deployed' : 'error'); setProblem(error?.status === 404 ? '' : plain(error)); } });
    return () => { live = false; };
  }, [week, season, number]);
  if (!week) return <p className="gx-t-body">No week is published yet, so there are no games to assign.</p>;
  const games = trends.week?.games || [], options = trends.week?.refereeOptions || [];
  const current = gameId => refereeFor(trends.week, gameId, hosted).name || '';
  const changed = games.filter(game => Object.hasOwn(drafts, game.id) && drafts[game.id] !== current(game.id));
  async function save() {
    if (busy || !changed.length || state !== 'ready') return;
    setBusy(true); setProblem(''); setNotice('');
    const saved = [];
    try {
      for (const game of changed) {
        const result = await officialsApi('set', { season, week: number, gameId: game.id, referee: drafts[game.id] || null });
        const row = { referee: result.referee, setAt: result.setAt, revision: result.revision };
        setHosted(value => ({ season, week: number, assignments: { ...(value?.assignments || {}), [game.id]: row } }));
        rememberOfficial(season, number, game.id, row);
        saved.push(`${game.away} at ${game.home}: ${result.referee || 'not assigned'}`);
      }
      setDrafts({});
      setNotice(`Referees saved for everyone. ${saved.join('; ')}.`);
    } catch (failure) {
      setProblem(`${plain(failure)}${saved.length ? ` Saved before the error: ${saved.join('; ')}.` : ''} Unsaved choices stay selected.`);
    } finally { setBusy(false); }
  }
  return <>
    <p className="gx-t-body gx-c-2">Week {number}. Pick each game’s referee once the NFL announces crews. Every member’s trends then show that referee’s records. Changes are kept with their history, never deleted.</p>
    {trends.status === 'loading' && <p className="gx-t-body" role="status">Loading Week {number} games…</p>}
    {trends.status === 'missing' && <p className="gx-t-body" role="status">The Week {number} trends file is not published yet, so there is no game or referee list to choose from.</p>}
    {trends.status === 'error' && <div role="alert" className="gx-cm-stack"><p className="gx-t-body gx-cm-problem">The Week {number} games could not load.</p><Button onClick={trends.retry}>Retry</Button></div>}
    {state === 'not_deployed' && <p className="gx-t-body" role="status">Saving referees needs the next gtl-api deploy and the game officials migration.</p>}
    <Problem>{problem}</Problem>
    {trends.status === 'ready' && <form className="gx-cm-stack" aria-label="Game referees" onSubmit={event => { event.preventDefault(); void save(); }}>
      {games.map(game => {
        const value = Object.hasOwn(drafts, game.id) ? drafts[game.id] : current(game.id), selectId = `${id}-${game.id}`;
        const extra = value && !options.includes(value) ? [value] : [];
        return <label key={game.id} className="gx-t-label gx-cm-field" htmlFor={selectId}>Referee for {game.away} at {game.home}
          <select id={selectId} className="gx-input" value={value} disabled={state !== 'ready'} aria-disabled={busy || undefined} onChange={event => { if (!busy) setDrafts(d => ({ ...d, [game.id]: event.target.value })); }}>
            <option value="">Not assigned yet</option>
            {[...extra, ...options].map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>;
      })}
      <p className="gx-t-body" role="status">{notice}</p>
      <Button type="submit" variant="primary" block aria-disabled={busy || !changed.length || state !== 'ready' || undefined}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length} ${changed.length === 1 ? 'referee' : 'referees'}` : 'Save referees'}</Button>
    </form>}
  </>;
}

/** Final scores and Odds connection: the original Triple Threat commissioner only, as in the old Settings page. */
function TripleThreatTool({ app, tool }) {
  const triple = useTripleThreat(app.requestSignIn);
  if (triple.loading) return <p className="gx-t-body" role="status">Loading the Triple Threat week…</p>;
  if (!triple.data) return <div className="gx-cm-stack"><Problem>{plain(triple.error)}</Problem><Button onClick={triple.reload}>Try again</Button></div>;
  if (tool === 'results') return triple.data.resultReview ? <FinalScoresEditor data={triple.data} onReviewed={triple.reload}/> : <p className="gx-t-body">{COMMISSIONER_COPY.originalOnly}</p>;
  return triple.commissioner ? <OddsConnectionEditor data={triple.data} onCollected={triple.reload}/> : <p className="gx-t-body">{COMMISSIONER_COPY.originalOnly}</p>;
}

export function CommissionerTools({ tool = null }) {
  const app = useAppData(), shell = useShell();
  const week = app.community?.data?.week ?? null;
  const open = next => shell.setSheetArgs({ sub: 'commissioner', tool: next });
  const shown = shell.communityAdmin && COMMISSIONER_COPY.tools.some(item => item.id === tool) ? tool : null;
  const back = shown ? { label: COMMISSIONER_COPY.title, onBack: () => open(null) } : { label: 'Menu', onBack: () => shell.setSheetArgs({ sub: null, tool: null }) };
  let body;
  if (!shell.communityAdmin) body = <p className="gx-t-body">{COMMISSIONER_COPY.only}</p>;
  else if (!shown) body = <Hub open={open}/>;
  else if (shown === 'status') body = <Status app={app} week={week}/>;
  else if (shown === 'weeks') body = <WeekOpening key={week ? `${week.season}:${week.week}` : 'none'} app={app} week={week}/>;
  else if (shown === 'referees') body = <Referees key={week ? `${week.season}:${week.week}` : 'none'} app={app} week={week}/>;
  else body = <TripleThreatTool key={shown} app={app} tool={shown}/>;
  return <Sheet title={shown ? label(shown) : COMMISSIONER_COPY.title} back={back} onClose={shell.closeSheet} tall className="gx-cm">
    <div className="gx-cm-stack" data-commissioner-tool={shown ?? 'hub'}>{body}</div>
  </Sheet>;
}
