// Recommended › review a bet without leaving Recommended (player feedback, October 28, 2026). Contracts: the review
// draws only the tracker's editor dialog (never the My bets list) over Recommended; a saved ticket's toast offers My
// bets for that ticket's week through `shell.go` (which asks before leaving a draft); and the review's draft guard and
// the open view's draft guard are kept apart, so closing one never clears the other.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(() => new Promise(() => {})), date: value => value, signed: value => String(value) }));

const { default: SocialBetTracker } = await import('../web/src/SocialBetTracker.jsx');
const { REVIEW_COPY, draftParts, savedTicketToast } = await import('../web/src/next/bets/recommendationReview.js');

const LUKE = '00000000-0000-4000-8000-000000000003';
const ticket = { season: 2026, week: 8, kind: 'single', legs: [{ gameId: 'SEA-DEN', market: 'total', side: 'over', line: 44.5 }], odds: -110, stakeUnits: null, source: 'BetMGM', quotedAt: '2026-10-28T15:00:00.000Z' };

describe('the recommended-bet review over Recommended', () => {
  const html = renderToStaticMarkup(<SocialBetTracker player={LUKE} reviewOnly initialView="mybets" ticketRequest={{ id: 'r1', accountId: LUKE, ticket }}/>);
  it('opens as the review dialog while the ticket week loads', () => {
    expect(html).toContain('<dialog');
    expect(html).toContain('Review recommended bet');
    expect(html).toContain('Loading the matchup and your saved bets');
  });
  it('draws none of the My bets list, its views or its Add bet button', () => {
    for (const text of ['social-tracker', 'Your bets', 'Add bet', 'Bet tracker view', 'Competition week']) expect(html).not.toContain(text);
  });
});

describe('the saved-ticket toast', () => {
  it('says the bet is saved and offers that ticket’s week in My bets', () => {
    const go = vi.fn();
    const [text, options] = savedTicketToast(ticket, go);
    expect(text).toBe(REVIEW_COPY.saved);
    expect(options).toMatchObject({ tone: 'done', actionLabel: REVIEW_COPY.view });
    expect(go).not.toHaveBeenCalled();
    options.action();
    expect(go).toHaveBeenCalledWith('bets', { view: 'tracked', season: 2026, week: 8, period: null });
  });
});

describe('the Bets draft guard', () => {
  it('stays on while either the open view or the review holds a draft', () => {
    const setDirty = vi.fn();
    const drafts = draftParts(setDirty);
    drafts.mark('view', true);
    drafts.mark('review', true);
    drafts.mark('review', false);
    expect(setDirty).toHaveBeenLastCalledWith('bets', true);
    drafts.mark('view', false);
    expect(setDirty).toHaveBeenLastCalledWith('bets', false);
    drafts.mark('review', true);
    drafts.clear();
    expect(setDirty).toHaveBeenLastCalledWith('bets', false);
    drafts.mark('view', false);
    expect(setDirty).toHaveBeenLastCalledWith('bets', false);
  });
});
