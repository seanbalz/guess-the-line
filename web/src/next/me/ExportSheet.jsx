// Me › Menu › Export my data (redesign build plan stage 75; M-28, D-23, D-52): one button that downloads every record of
// yours as a JSON file, read from POST /me/export (your own rows only; push devices left out). It replaces the old app's
// group-week download. Nothing is written; the file is made in this browser from the reply and never sent anywhere else.
import { useRef, useState } from 'react';
import { meApi } from '../../api.js';
import { Button, InfoButton, Sheet } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
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
  const [state, setState] = useState({ busy: false, message: '' });
  const running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true;
    setState({ busy: true, message: EXPORT_COPY.working });
    try {
      const data = await meApi('export', {});
      if (data?.ownerId !== app.accountId) throw new Error('mismatch');
      const name = exportFileName(data.exportedAt);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = name; link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState({ busy: false, message: EXPORT_COPY.done(name) });
    } catch (error) {
      if (error?.status === 401) app.requestSignIn?.();
      setState({ busy: false, message: error?.status === 503 ? EXPORT_COPY.off : error?.status ? error.message : EXPORT_COPY.failed });
    } finally {
      running.current = false;
    }
  }
  return (
    <Sheet title={EXPORT_COPY.title} back={{ label: 'Menu', onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
      <div className="gx-hstack gx-gap-8 gx-between">
        <p className="gx-t-body">{EXPORT_COPY.lead}</p>
        <InfoButton title={INFO.export.title} body={INFO.export.body}/>
      </div>
      <Button variant="primary" block icon="receipt" onClick={download} aria-disabled={state.busy || undefined} data-export>{EXPORT_COPY.button}</Button>
      <p className="gx-t-meta gx-c-2" role="status">{state.message}</p>
    </Sheet>
  );
}
