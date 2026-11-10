// Loaded only from Menu › Commissioner tools › Premier League weekly scores (EPL stage 3). The commissioner chooses
// Sleeper matchup screenshots; they are read on this device (eplOcr.js, loaded on first use) and every one of the eight
// managers' scores is reviewed here before anything is saved. Confirming saves the reviewed scores with the screenshots'
// fingerprints, and gtl-api opens the next Pick a Team draft in ascending weekly-score order (ties: lower season total),
// keeping any draft that already has picks. The server checks commissioner access again and decides every outcome.
import { ClipboardCheck, ListOrdered, ScanText, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { eplApi } from '../../epl/api.js';
import { fmtFull } from '../../format.js';
import { Button, Card, Pill, Skeleton, Switch } from '../../ui/index.js';
import { inlineTool, ToolHeading } from './ToolPresentation.jsx';
import { SCORE_COPY, STATUS_TEXT, fmtScore, importBody, importDifferences, mergeForWeek, resultText, reviewRows, weekManagers } from './eplScoreImportModel.js';

const TONE = Object.freeze({ read: 'win', edited: 'accent', check: 'pending', conflict: 'loss', missing: 'loss' });
const plain = error => (error?.status ? error.message : 'No connection. Reconnect and try again.');

function ScoreRow({ row, week, onEdit, disabled }) {
  const id = useId();
  const handle = row.sleeperName ? `@${row.sleeperName}` : 'No Sleeper username on file';
  const values = [...new Set(row.candidates.filter(c => c.score !== null).map(c => fmtScore(c.score)))];
  const projections = [...new Set(row.candidates.filter(c => c.projection !== null).map(c => fmtScore(c.projection)))];
  return <article className="gx-cm-score-row" data-status={row.status} data-blocking={row.blocking || undefined} aria-labelledby={`${id}-name`}>
    <div className="gx-cm-ref-top">
      <div><h3 className="gx-t-strong" id={`${id}-name`}>{row.name}</h3><p className="gx-t-meta gx-c-2">{handle}</p></div>
      <Pill tone={TONE[row.status] ?? 'neutral'}>{STATUS_TEXT[row.status] ?? row.status}</Pill>
    </div>
    <label className="gx-t-label gx-cm-field" htmlFor={`${id}-score`}>Matchweek {week} score
      <input id={`${id}-score`} className="gx-input gx-n-s" inputMode="decimal" autoComplete="off" value={row.text} disabled={disabled}
        aria-invalid={row.score === null || undefined} aria-describedby={`${id}-read`}
        aria-label={`Matchweek ${week} score for ${row.name} (${handle})`} onChange={event => onEdit(row.ownerId, { score: event.target.value })}/>
    </label>
    <p className="gx-t-meta gx-c-2" id={`${id}-read`}>{values.length > 1 ? `Screenshots read ${values.join(' and ')}. Enter the correct score.`
      : values.length ? `Read ${values[0]}${projections.length ? ` · projection ${projections.join(', ')} not used` : ''}`
      : 'No score was read for this manager. A blank score is never counted as zero.'}{row.invalid ? ' Use a number with at most two decimals.' : ''}</p>
    {row.status === 'check' ? <Switch label="Checked against the screenshot" sub="The username or layout was not read cleanly."
      checked={!row.needsCheck} disabled={disabled} onChange={checked => onEdit(row.ownerId, { checked })}/> : null}
    {row.tied ? <label className="gx-t-label gx-cm-field" htmlFor={`${id}-total`}>Sleeper season total
      <input id={`${id}-total`} className="gx-input gx-n-s" inputMode="decimal" autoComplete="off" value={row.totalText} disabled={disabled}
        aria-invalid={row.seasonTotal === null || undefined} aria-label={`Sleeper season total for ${row.name}`}
        onChange={event => onEdit(row.ownerId, { seasonTotal: event.target.value })}/>
      <span className="gx-t-meta gx-c-2">{row.totalFromSnapshot ? 'From the saved Sleeper totals after this matchweek.' : 'Tied score: the lower season total picks first.'}</span>
    </label> : null}
  </article>;
}

function OrderPreview({ review, week }) {
  const names = new Map(review.rows.map(r => [r.ownerId, r]));
  if (!review.order.order) return <p role="status" className="gx-t-body gx-cm-message">{review.order.needTotals.length ? SCORE_COPY.tieTotals : 'The order appears once every manager has a score.'}</p>;
  return <ol className="gx-cm-order" aria-label={`Matchweek ${week + 1} draft order`}>
    {review.order.order.map((ownerId, index) => <li key={ownerId}><span className="gx-cm-order-n">{index + 1}</span>
      <span className="gx-t-strong">{names.get(ownerId)?.name}</span><span className="gx-t-meta gx-c-2">{fmtScore(names.get(ownerId)?.score)}{names.get(ownerId)?.tied ? ` · season ${fmtScore(names.get(ownerId)?.seasonTotal)}` : ''}</span></li>)}
  </ol>;
}

/** The screen with no effects of its own: every value and handler comes from EplScoreImport (tests render it directly). */
export function EplScoreImportView({ base, reading, images = [], ocrError, merged, week, weekState, review, edits, attested, saving, result, problem,
  conflict, uncertain, onFiles, onEdit, onWeek, weekCorrected, onCorrectWeek, onAttest, onConfirm, onCorrection, onReset, renderTool = inlineTool }) {
  const id = useId();
  if (base?.denied) return renderTool(<p role="alert" className="gx-t-body gx-cm-message">{SCORE_COPY.denied}</p>);
  if (!base?.data) return renderTool(base?.failed ? <p role="alert" className="gx-t-body gx-cm-problem">Weekly scores could not load.</p>
    : <Skeleton label="Loading weekly score import…" shape="panels" count={2}/>);
  if (base.data.available === false) return renderTool(<p role="status" className="gx-t-body gx-cm-message">{SCORE_COPY.unavailable}</p>);
  const season = base.data.season;
  const done = Boolean(result);
  const mixed = merged?.weekIssue === 'mixed';
  const closedWeeks = (base.data.weeks ?? []).filter(w => w.status !== 'open');
  const existing = weekState?.import ?? null, next = weekState?.next ?? null;
  const differences = conflict ? importDifferences(existing, review) : [];
  const ready = Boolean(review && !saving && !done && !mixed && importBody({ season, week, images, review, attested }));
  const footer = done ? <Button variant="secondary" block onClick={onReset}>Import another matchweek</Button>
    : review && !mixed ? <Button variant="primary" block disabled={!ready} onClick={onConfirm}>{saving ? 'Saving…' : next?.picks ? 'Confirm scores' : `Confirm and open Matchweek ${week + 1}`}</Button> : null;
  return renderTool(<div className="gx-cm-stack gx-cm-scores">
    <div className="gx-cm-intro"><ToolHeading icon={ShieldCheck} detail={season ? `${season} season` : undefined}>Sleeper screenshot import</ToolHeading><p className="gx-t-body gx-c-2">{SCORE_COPY.privacy}</p></div>
    {!done ? <Card as="section" className="gx-cm-stack" aria-labelledby={`${id}-files`}>
      <ToolHeading icon={ScanText}><span id={`${id}-files`}>Screenshots</span></ToolHeading>
      <p className="gx-t-body gx-c-2">{SCORE_COPY.chooseHint}</p>
      <label className="gx-btn gx-btn--secondary gx-btn--block gx-cm-file" htmlFor={`${id}-input`}>{images.length ? 'Choose different screenshots' : SCORE_COPY.choose}
        <input id={`${id}-input`} className="gx-sr-only" type="file" accept="image/*" multiple disabled={Boolean(reading) || saving}
          onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) onFiles(files); }}/>
      </label>
      {reading ? <p role="status" className="gx-t-body gx-cm-message">Reading screenshot {reading.file} of {reading.files}… {Math.round(reading.progress * 100)}%</p> : null}
      {ocrError ? <p role="alert" className="gx-t-body gx-cm-problem">{ocrError}</p> : null}
      {images.length ? <ul className="gx-cm-files" aria-label="Chosen screenshots">{images.map((image, index) => <li key={`${image.sha256}-${index}`} className="gx-t-meta">
        {image.name || `Screenshot ${index + 1}`} · {image.error ? 'could not be read' : merged?.duplicates?.includes(image.sha256) && images.findIndex(i => i.sha256 === image.sha256) !== index ? 'same image, read once' : `week ${image.result?.week ?? '—'}`}
      </li>)}</ul> : null}
    </Card> : null}
    {mixed ? <p role="alert" className="gx-t-body gx-cm-problem">{SCORE_COPY.mixed(merged.weeks)}</p> : null}
    {merged && !mixed && !done ? <Card as="section" className="gx-cm-stack" aria-labelledby={`${id}-week`}>
      <ToolHeading icon={ClipboardCheck} detail={merged.week ? `Read from the screenshots · ${season} season (the screenshots show no year)` : undefined}><span id={`${id}-week`}>{week ? `Matchweek ${week}` : 'Choose the matchweek'}</span></ToolHeading>
      {!merged.week ? <p role="status" className="gx-t-body gx-cm-message">{merged.weekIssue === 'ambiguous' ? SCORE_COPY.ambiguousWeek : SCORE_COPY.noWeek}</p> : null}
      {merged.week ? <Switch label={`Matchweek ${merged.week} was misread`} sub="Only if the screenshots show another week. Choose it below; the change is recorded with the import."
        checked={weekCorrected} disabled={saving} onChange={onCorrectWeek}/> : null}
      {!merged.week || weekCorrected ? <label className="gx-t-label gx-cm-field" htmlFor={`${id}-pick-week`}>Matchweek
        <select id={`${id}-pick-week`} className="gx-input" value={week ?? ''} disabled={saving} onChange={event => onWeek(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Choose a matchweek</option>
          {closedWeeks.map(w => <option key={w.week} value={w.week}>Matchweek {w.week}</option>)}
        </select></label> : null}
      {week && weekState === null ? <Skeleton label={`Loading Matchweek ${week}…`} shape="panels" count={1}/> : null}
      {week && weekState && !weekManagers(base.data, week).length ? <p role="alert" className="gx-t-body gx-cm-problem">Matchweek {week} has no Pick a Team draft in the {season} season.</p> : null}
      {existing ? <p className="gx-t-body gx-cm-preserved">Matchweek {week} was confirmed {fmtFull(existing.confirmedAt)}{existing.corrections ? ` (${existing.corrections} correction${existing.corrections === 1 ? '' : 's'})` : ''}. Confirming the same scores again changes nothing; different scores need a correction.</p> : null}
      {next?.picks ? <p className="gx-t-body gx-cm-preserved">Matchweek {next.week} already has {next.picks} {next.picks === 1 ? 'pick' : 'picks'}. Its order and picks are kept whatever is imported.</p> : null}
    </Card> : null}
    {review && !mixed && !done ? <Card as="section" className="gx-cm-stack" aria-labelledby={`${id}-review`}>
      <ToolHeading icon={ClipboardCheck} detail={SCORE_COPY.projection}><span id={`${id}-review`}>Review all {review.rows.length} managers</span></ToolHeading>
      {review.rows.map(row => <ScoreRow key={row.ownerId} row={row} week={week} onEdit={onEdit} disabled={saving}/>)}
      {merged.unmatched?.length ? <p className="gx-t-body gx-cm-message">Also read on a card side with an unrecognized username: {merged.unmatched.map(u => fmtScore(u.score)).join(', ')}. It is not assigned to anyone; enter it for the right manager if it is theirs.</p> : null}
    </Card> : null}
    {review && !mixed && !done ? <Card as="section" className="gx-cm-stack" aria-labelledby={`${id}-order`}>
      <ToolHeading icon={ListOrdered} detail="Lowest weekly score picks first; tied scores by the lower season total"><span id={`${id}-order`}>Matchweek {week + 1} draft order</span></ToolHeading>
      <OrderPreview review={review} week={week}/>
      <Switch label={SCORE_COPY.attest} sub={SCORE_COPY.attestSub} checked={attested} disabled={saving} onChange={onAttest}/>
    </Card> : null}
    {conflict ? <Card as="section" className="gx-cm-stack gx-cm-correction" aria-labelledby={`${id}-conflict`}>
      <ToolHeading icon={ClipboardCheck}><span id={`${id}-conflict`}>Different from the confirmed import</span></ToolHeading>
      <ul className="gx-cm-files">{differences.map(d => <li key={d.ownerId} className="gx-t-body">{d.name}: {fmtScore(d.before)} confirmed → {fmtScore(d.after)} now</li>)}</ul>
      <p className="gx-t-body gx-c-2">{next?.picks ? `Matchweek ${next.week} already has picks, so a correction is recorded without changing its order.` : 'A correction is recorded beside the original, which is kept.'}</p>
      <Button variant="secondary" block disabled={saving} onClick={onCorrection}>Record as a correction</Button>
    </Card> : null}
    <div role="alert">{problem ? <p className="gx-t-body gx-cm-problem">{problem}</p> : null}</div>
    {uncertain ? <p role="status" className="gx-t-body gx-cm-message">The reply was lost. Confirming again is safe: the same scores are recognized and never imported twice.</p> : null}
    <p role="status" className="gx-t-body">{done ? resultText(result) : ''}</p>
  </div>, footer);
}

export default function EplScoreImport({ api = eplApi, renderTool, ocr }) {
  const [base, setBase] = useState({ data: null, failed: false, denied: false });
  const [images, setImages] = useState([]), [reading, setReading] = useState(null), [ocrError, setOcrError] = useState('');
  const [weekChoice, setWeekChoice] = useState(null), [weekCorrected, setWeekCorrected] = useState(false), [weekState, setWeekState] = useState(null);
  const [edits, setEdits] = useState({}), [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false), [result, setResult] = useState(null), [problem, setProblem] = useState(''), [conflict, setConflict] = useState(false), [uncertain, setUncertain] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    api('admin/scores/read', {}).then(data => { if (live.current) setBase({ data, failed: false, denied: false }); },
      error => { if (live.current) setBase({ data: null, failed: !(error?.status === 401 || error?.status === 403), denied: error?.status === 401 || error?.status === 403 }); });
  }, [api]);
  const managers = base.data?.managers ?? [];
  const merged = useMemo(() => (images.length ? mergeForWeek(images.filter(i => i.result), managers) : null), [images, managers]);
  const week = merged && merged.weekIssue !== 'mixed' ? (merged.week && !weekCorrected ? merged.week : weekChoice) : null;
  const season = base.data?.season ?? null;
  useEffect(() => {
    if (!week || !season) { setWeekState(null); return undefined; }
    let current = true; setWeekState(null);
    api('admin/scores/read', { season, week }).then(data => { if (current) setWeekState(data); }, error => { if (current) { setWeekState({ import: null, next: null }); setProblem(plain(error)); } });
    return () => { current = false; };
  }, [api, week, season]);
  const weekRows = week ? weekManagers(base.data, week) : [];
  const review = merged && week && weekState && weekRows.length ? reviewRows({ managers: weekRows, merged, edits, snapshotTotals: weekState.snapshotTotals }) : null;
  const clearOutcome = () => { setProblem(''); setConflict(false); setUncertain(false); };
  const onFiles = useCallback(async files => {
    setReading({ file: 1, files: files.length, progress: 0 }); setOcrError(''); setImages([]); setEdits({}); setAttested(false); setWeekChoice(null); setWeekCorrected(false); clearOutcome();
    try {
      const read = ocr ?? (await import('./eplOcr.js')).readScreenshots;
      const out = await read(files, managers, { onProgress: p => { if (live.current) setReading(p); } });
      if (!live.current) return;
      setImages(out);
      if (!out.some(i => i.result)) setOcrError('None of the screenshots could be read. Choose clear Sleeper Matchups screenshots.');
    } catch { if (live.current) setOcrError('The screenshot reader could not start on this device. Reload and try again.'); }
    finally { if (live.current) setReading(null); }
  }, [managers, ocr]);
  const onEdit = (ownerId, change) => { clearOutcome(); setEdits(value => ({ ...value, [ownerId]: { ...value[ownerId], ...change } })); };
  async function submit(correction) {
    const body = importBody({ season, week, extractedWeek: merged?.week ?? null, weekCorrected: weekCorrected && merged?.week !== week, images, review, attested, correction });
    if (!body || saving) return;
    setSaving(true); clearOutcome();
    try {
      const saved = await api('admin/scores/import', body);
      if (!live.current) return;
      setResult(saved);
    } catch (error) {
      if (!live.current) return;
      if (error?.code === 'GTL_EPL_IMPORT_CONFLICT') setConflict(true);
      if (error?.name === 'SaveUncertainError' || error?.uncertain) setUncertain(true);
      else setProblem(plain(error));
    } finally { if (live.current) setSaving(false); }
  }
  const reset = () => { setImages([]); setEdits({}); setAttested(false); setWeekChoice(null); setWeekCorrected(false); setResult(null); setWeekState(null); clearOutcome(); };
  return <EplScoreImportView base={base} reading={reading} images={images} ocrError={ocrError} merged={merged} week={week} weekState={weekState}
    review={review} edits={edits} attested={attested} saving={saving} result={result} problem={problem} conflict={conflict} uncertain={uncertain}
    weekCorrected={weekCorrected} onCorrectWeek={value => { clearOutcome(); setWeekCorrected(value); setWeekChoice(null); }} onWeek={value => { clearOutcome(); setWeekChoice(value); setEdits({}); }}
    onFiles={onFiles} onEdit={onEdit} onAttest={value => { clearOutcome(); setAttested(value); }}
    onConfirm={() => submit(false)} onCorrection={() => submit(true)} onReset={reset} renderTool={renderTool}/>;
}
