// EPL stage 3: Menu › Commissioner tools › Premier League weekly scores. The review screen drawn from synthetic OCR
// results (tests/helpers/sleeper-ocr-fixture.mjs); no screenshot or real score is used.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
import { extractMatchups } from '../shared/epl-score-import.mjs';
import { FIXTURE_MANAGERS as M, fullCards, sleeperWords } from './helpers/sleeper-ocr-fixture.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { EplScoreImportView } = await import('../web/src/next/me/commissioner/EplScoreImport.jsx');
const { SCORE_COPY, flattenWords, importBody, importDifferences, mergeForWeek, resultText, reviewRows, weekManagers } = await import('../web/src/next/me/commissioner/eplScoreImportModel.js');

const ids = M.map(m => m.ownerId);
const base = { data: { available: true, season: 2026, managers: M, weeks: [{ week: 11, status: 'resolved', order: ids }, { week: 12, status: 'open', order: ids }] } };
const image = (cards = fullCards(), week = 11, sha = 'a'.repeat(64)) => ({ sha256: sha, name: 'matchups.png', result: extractMatchups({ words: sleeperWords({ cards, week }), managers: M }) });
const weekState = { import: null, next: null, snapshotTotals: null };
function screen({ images = [image()], edits = {}, attested = true, state = weekState, ...rest } = {}) {
  const managers = weekManagers(base.data, 11);
  const merged = mergeForWeek(images.filter(i => i.result), M);
  const week = merged.weekIssue === 'mixed' ? null : merged.week;
  const review = week ? reviewRows({ managers, merged, edits, snapshotTotals: state?.snapshotTotals }) : null;
  const props = { base, images, merged, week, weekState: state, review, edits, attested, weekCorrected: false, onFiles() {}, onEdit() {}, onWeek() {}, onCorrectWeek() {}, onAttest() {}, onConfirm() {}, onCorrection() {}, onReset() {}, ...rest };
  return { html: renderToStaticMarkup(<div className="gx"><EplScoreImportView {...props}/></div>), review, merged, props };
}

describe('Premier League weekly score review', () => {
  it('shows all eight identities and scores, the extracted week and season, the order and the bonus attestation', () => {
    const { html, review } = screen();
    expect(markupProblems(html)).toEqual([]);
    for (const m of M) { expect(html).toContain(m.name); expect(html).toContain(`@${m.sleeperName}`); }
    for (const score of ['61.20', '48.75', '90.10', '55.05', '72.40', '33.30', '80.00', '66.65']) expect(html).toContain(`value="${score}"`);
    expect(html).toContain('Matchweek 11');
    expect(html).toContain('2026 season');
    expect(html).toContain('Matchweek 12 draft order');
    expect(html).toContain(SCORE_COPY.attest);
    expect(html).toContain('projection');
    expect(html).toContain('never uploaded');
    expect(review.order.order[0]).toBe('1257180071064510465'); // 33.30 lowest
    expect(html).toMatch(/<button[^>]*>Confirm and open Matchweek 12<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
  });

  it('keeps confirmation disabled until the bonus attestation, every score and every flagged row are settled', () => {
    expect(screen({ attested: false }).html).toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
    const cards = fullCards(); cards[3][1] = { ...cards[3][1], score: null };
    const missing = screen({ images: [image(cards)] });
    expect(missing.html).toContain('Not read: enter score');
    expect(missing.html).toContain('never counted as zero');
    expect(missing.html).toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
    expect(importBody({ season: 2026, week: 11, images: [image(cards)], review: missing.review, attested: true })).toBeNull();
    const typed = screen({ images: [image(cards)], edits: { [M[7].ownerId]: { score: '0' } } });
    expect(typed.html).toContain('Edited');
    const body = importBody({ season: 2026, week: 11, extractedWeek: 11, images: [image(cards)], review: typed.review, attested: true });
    expect(body.scores.find(s => s.ownerId === M[7].ownerId)).toEqual({ ownerId: M[7].ownerId, score: 0 });
    expect(body.expectedOrder[0]).toBe(M[7].ownerId);
    const fuzzy = fullCards(); fuzzy[0][1] = { ...fuzzy[0][1], user: 'seanbaltz' };
    const check = screen({ images: [image(fuzzy)] });
    expect(check.html).toContain('Checked against the screenshot');
    expect(check.html).toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
    expect(screen({ images: [image(fuzzy)], edits: { [M[1].ownerId]: { checked: true } } }).html).not.toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
  });

  it('asks for season totals only for tied managers, prefilled from saved Sleeper totals when present', () => {
    const scores = ['61.20', '61.20', '90.10', '55.05', '72.40', '33.30', '80.00', '66.65'];
    const tied = screen({ images: [image(fullCards(scores))] });
    expect(tied.html.match(/Sleeper season total for/g)).toHaveLength(2);
    expect(tied.html).toContain(SCORE_COPY.tieTotals);
    expect(tied.review.order.order).toBeNull();
    const prefilled = screen({ images: [image(fullCards(scores))], state: { ...weekState, snapshotTotals: { [M[0].ownerId]: 700.5, [M[1].ownerId]: 650.25 } } });
    expect(prefilled.html).toContain('From the saved Sleeper totals');
    expect(prefilled.review.order.order.indexOf(M[1].ownerId)).toBeLessThan(prefilled.review.order.order.indexOf(M[0].ownerId));
  });

  it('refuses a mixed-week batch and shows conflicting crops for review', () => {
    const mixed = screen({ images: [image(fullCards(), 11, 'a'.repeat(64)), image(fullCards(), 12, 'b'.repeat(64))] });
    expect(mixed.html).toContain('different matchweeks (11, 12)');
    expect(mixed.html).not.toContain('Confirm and open');
    const other = fullCards(); other[0][0] = { ...other[0][0], score: '16.20' };
    const conflict = screen({ images: [image(), image(other, 11, 'c'.repeat(64))] });
    expect(conflict.html).toContain('Screenshots disagree');
    expect(conflict.html).toContain('Screenshots read');
    expect(conflict.html).toMatch(/<button[^>]*disabled[^>]*>Confirm and open/);
  });

  it('a conflicting confirmed import is shown as differences with an explicit correction; existing picks are kept', () => {
    const { review } = screen();
    const existing = { confirmedAt: '2026-11-09T20:00:00Z', corrections: 0, rows: review.rows.map(r => ({ ownerId: r.ownerId, score: r.ownerId === M[0].ownerId ? 60.2 : r.score })) };
    const { html } = screen({ state: { ...weekState, import: existing, next: { week: 12, picks: 2 } }, conflict: true });
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Evan: 60.20 confirmed → 61.20 now');
    expect(html).toContain('Record as a correction');
    expect(html).toContain('Matchweek 12 already has 2 picks');
    expect(html).toMatch(/<button[^>]*>Confirm scores<\/button>/);
    expect(importDifferences(existing, review)).toEqual([{ ownerId: M[0].ownerId, name: 'Evan', before: 60.2, after: 61.2 }]);
  });

  it('result sentences name the outcome and never claim a kickoff before fixtures exist', () => {
    const opened = resultText({ week: 11, reconciliation: 'new', opening: { outcome: 'opened', week: 12, firstPicker: { name: 'Mark' }, fixtures: 0 } });
    expect(opened).toContain('Matchweek 12 is open and Mark picks first');
    expect(opened).toContain('No kickoff time is shown until then');
    expect(resultText({ week: 11, reconciliation: 'duplicate', opening: { outcome: 'preserved_picks', week: 12, firstPicker: null, fixtures: 3 } })).toContain('already has picks');
    expect(resultText({ week: 11, reconciliation: 'new', opening: { outcome: 'pending_results', week: 12 } })).toContain('verified final');
    const { html } = screen({ result: { week: 11, reconciliation: 'new', opening: { outcome: 'opened', week: 12, firstPicker: { name: 'Mark' }, fixtures: 0 } } });
    expect(html).toContain('Import another matchweek');
    expect(html).not.toContain('Review all');
  });

  it('denied, unavailable and loading states; Tesseract blocks flatten to boxed words', () => {
    expect(renderToStaticMarkup(<EplScoreImportView base={{ denied: true }}/>)).toContain(SCORE_COPY.denied);
    expect(renderToStaticMarkup(<EplScoreImportView base={{ data: { available: false } }}/>)).toContain(SCORE_COPY.unavailable);
    expect(renderToStaticMarkup(<EplScoreImportView base={{ data: null }}/>)).toContain('Loading weekly score import');
    expect(flattenWords([{ paragraphs: [{ lines: [{ words: [{ text: '61.20', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, confidence: 90 }, { text: 'x' }] }] }] }]))
      .toEqual([{ text: '61.20', x0: 1, y0: 2, x1: 3, y1: 4, confidence: 90 }]);
  });
});
