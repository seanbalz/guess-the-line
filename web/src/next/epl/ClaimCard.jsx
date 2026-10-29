// The claim card (EPL open access, plan 2026-10-29-epl-open-access.md, Task 3; D-68 addendum). Every signed-in account
// reads EPL; one not linked to an FEPL manager (and not matched automatically by gtl_epl_auto_link) sees this card on
// Home and Pick a Team: one button per manager no account holds yet, from the `claim.managers` of `epl/draft/read`, and
// "Just watching", which hides the card for this browser session. A claim goes through `epl/claim` (the first claim wins,
// M-31) and the board is read again either way. Until linked the board is read-only: no pick, crest or queue buttons.
import { useId, useState } from 'react';
import { Button, Card, Toast } from '../ui/index.js';

export const CLAIM_COPY = Object.freeze({
  title: 'Which FEPL manager are you?',
  body: 'Claim your manager to pick a club and keep a backup ranking. Until then you can watch the board.',
  watch: 'Just watching',
  claimed: name => `You’re linked as ${name}.`,
  taken: 'Someone already claimed that manager.',
  linked: 'This account is already linked to a manager.',
  failed: 'That claim didn’t save. Try again.',
});

/** The managers this read offers to claim: only for an unlinked account (`me` null), else none. */
export function claimManagers(model) {
  if (!model || model.me !== null || !Array.isArray(model.claim)) return [];
  return model.claim;
}

// "Just watching" lasts for the browser session (sessionStorage), with an in-memory copy where storage is blocked.
const WATCH_KEY = 'gtl-epl-just-watching';
let watchingMemory = false;
export function justWatching() {
  try { return sessionStorage.getItem(WATCH_KEY) === '1' || watchingMemory; } catch { return watchingMemory; }
}
export function setJustWatching(value) {
  watchingMemory = value === true;
  try { if (watchingMemory) sessionStorage.setItem(WATCH_KEY, '1'); else sessionStorage.removeItem(WATCH_KEY); } catch { /* The in-memory copy holds. */ }
}

/** One `epl/claim`: `{ refresh, notice }`. A claim someone else won re-reads the board too. Never throws. */
export async function runClaim({ api, ownerId, name }) {
  try {
    await api('claim', { ownerId });
    return { refresh: true, notice: { text: CLAIM_COPY.claimed(name), tone: 'done' } };
  } catch (error) {
    if (error?.code === 'GTL_EPL_CLAIMED') return { refresh: true, notice: { text: CLAIM_COPY.taken, tone: 'warning' } };
    if (error?.code === 'GTL_EPL_ALREADY_LINKED') return { refresh: true, notice: { text: CLAIM_COPY.linked, tone: 'warning' } };
    if (error?.name === 'SaveUncertainError') return { refresh: true, notice: { text: error.message, tone: 'error' } };
    return { refresh: false, notice: { text: CLAIM_COPY.failed, tone: 'error' } };
  }
}

/** The card with no hooks of its own (nothing when there is no manager to claim); tests press its buttons directly. */
export function ClaimCardView({ managers, busy, onClaim, onWatch, id = 'gx-epl-claim-title' }) {
  if (!managers?.length) return null;
  return <Card as="section" className="gx-epl-claim" aria-labelledby={id}>
    <h2 className="gx-t-section" id={id}>{CLAIM_COPY.title}</h2>
    <p className="gx-t-body gx-c-2">{CLAIM_COPY.body}</p>
    <div className="gx-epl-claim-list">
      {managers.map(m => <Button key={m.ownerId} variant="secondary" disabled={busy} onClick={() => onClaim(m.ownerId)}>{m.name}</Button>)}
    </div>
    <Button variant="ghost-2" block disabled={busy} onClick={onWatch}>{CLAIM_COPY.watch}</Button>
  </Card>;
}

/** The card for one board (`model` from boardModel), with its claim notice; `onClaimed` re-reads the board. */
export function ClaimCard({ model, api, onClaimed }) {
  const [watching, setWatching] = useState(justWatching);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const id = useId();
  const managers = watching ? [] : claimManagers(model);
  async function claim(ownerId) {
    if (busy) return;
    setBusy(true);
    const result = await runClaim({ api, ownerId, name: managers.find(m => m.ownerId === ownerId)?.name ?? '' });
    setBusy(false);
    setNotice(result.notice);
    if (result.refresh) onClaimed?.();
  }
  return <>
    <ClaimCardView managers={managers} busy={busy} onClaim={claim} onWatch={() => { setJustWatching(true); setWatching(true); }} id={`${id}-claim`}/>
    {notice ? <Toast text={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} className="gx-epl-toast"/> : null}
  </>;
}
