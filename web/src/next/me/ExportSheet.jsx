import { FileJson, Layers, History } from 'lucide-react';
import { AccountSheet } from './AccountSheet.jsx';
// Me › Menu › Export my data (redesign build plan stage 75; M-28, D-23, D-52): one button that downloads every record of
// yours as a JSON file, read from POST /me/export (your own rows only; push devices left out). It replaces the old app's
// group-week download. Nothing is written; the file is made in this browser from the reply and never sent anywhere else.
import { useRef, useState } from 'react';
import { meApi } from '../../api.js';
import { Button, Icon, InfoButton } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
import './accountPrism.css';
import { INFO } from '../info.js';

export const EXPORT_COPY = Object.freeze({
  title: 'Export my data',
  lead: 'Download every record of yours as one file.',
  button: 'Download my data',
  working: 'Preparing your file…',
  done: name => `Downloaded ${name}.`,
  off: 'Export is not available yet. Every record is kept.',
  failed: 'Your file could not be prepared. Try again.',
});

/** "guess-the-line-export-2026-10-26.json", from the export's own time (UTC date). */
export const exportFileName = exportedAt => `guess-the-line-export-${String(exportedAt ?? new Date().toISOString()).slice(0, 10)}.json`;

export function ExportSheet() {
  const shell = useShell(), app = useAppData();
  const [state, setState] = useState({ busy: false, message: '', phase: 'idle' });
  const running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true;
    setState({ busy: true, message: EXPORT_COPY.working, phase: 'preparing' });
    try {
      const data = await meApi('export', {});
      if (data?.ownerId !== app.accountId) throw new Error('mismatch');
      const name = exportFileName(data.exportedAt);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = name; link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState({ busy: false, message: EXPORT_COPY.done(name), phase: 'done' });
    } catch (error) {
      if (error?.status === 401) app.requestSignIn?.();
      setState({ busy: false, phase: error?.status === 503 ? 'unavailable' : 'failed', message: error?.status === 503 ? EXPORT_COPY.off : error?.status ? error.message : EXPORT_COPY.failed });
    } finally {
      running.current = false;
    }
  }
  return (
    <AccountSheet className="gx-account-prism gx-export-prism" title={EXPORT_COPY.title} back={{ label: 'Menu', onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
      <div className="gx-account-heading gx-between"><p className="gx-account-eyebrow">YOUR RECORDS</p><InfoButton title={INFO.export.title} body={INFO.export.body}/></div>
      <article className="gx-account-hero gx-export-hero"><span className="gx-export-file"><Icon icon={FileJson} size={32}/></span><h3>Your records. One file.</h3><p>{EXPORT_COPY.lead}</p><span className="gx-export-format">JSON</span></article>
      <div className="gx-export-categories" aria-label="Export categories">{[[Layers,'Guesses & revisions'],['receipt','Bets & tickets'],['message','Posts & settings'],[History,'History & memberships']].map(([icon,label]) => <div className="gx-account-panel" key={label}><Icon icon={icon} size={20}/><span>{label}</span></div>)}</div>
      <div className="gx-account-panel gx-account-note"><Icon icon="shieldCheck"/><div><strong>Only your records.</strong><p>Other players’ records and push-device addresses and keys are excluded. Nothing is deleted.</p></div></div>
      <Button variant="primary" block icon="download" onClick={download} aria-disabled={state.busy || undefined} data-export>{state.busy ? EXPORT_COPY.working : state.phase === 'failed' ? 'Try download again' : EXPORT_COPY.button}</Button>
      <p className="gx-account-notice" data-phase={state.phase} role="status">{state.message}</p>
    </AccountSheet>
  );
}
