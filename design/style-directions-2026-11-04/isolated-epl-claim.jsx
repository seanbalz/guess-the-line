// Native copy, claimManagers and ClaimCardView isolated from claim/session-storage controllers.
// Only the two button sites suppress haptics for visual review.
import React from 'react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Card} from '../../web/src/next/ui/Card.jsx';
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

export function ClaimCardView({ managers, busy, onClaim, onWatch, id = 'gx-epl-claim-title' }) {
  if (!managers?.length) return null;
  return <Card as="section" className="gx-epl-claim" aria-labelledby={id}>
    <h2 className="gx-t-section" id={id}>{CLAIM_COPY.title}</h2>
    <p className="gx-t-body gx-c-2">{CLAIM_COPY.body}</p>
    <div className="gx-epl-claim-list">
      {managers.map(m => <Button key={m.ownerId} variant="secondary" haptic={false} disabled={busy} onClick={() => onClaim(m.ownerId)}>{m.name}</Button>)}
    </div>
    <Button variant="ghost-2" haptic={false} block disabled={busy} onClick={onWatch}>{CLAIM_COPY.watch}</Button>
  </Card>;
}
