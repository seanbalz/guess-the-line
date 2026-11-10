// Menu › Commissioner tools › Premier League weekly scores: the review model (EPL stage 3). Pure apart from nothing:
// the screen (EplScoreImport.jsx) keeps the state, eplOcr.js reads the screenshots on this device, and gtl-api decides.
// Every value starts as an OCR candidate; the commissioner reviews all eight before anything is saved. A blank score is
// missing, never zero.
import { mergeExtractions, parseScoreInput, reviewOrder } from '../../../../../shared/epl-score-import.mjs';

export const SCORE_COPY = Object.freeze({
  title: 'Premier League weekly scores',
  privacy: 'Screenshots are read on this device and never uploaded. Only a fingerprint of each image and the reviewed scores are saved.',
  choose: 'Choose Sleeper screenshots',
  chooseHint: 'The Matchups screen after Sleeper shows the final weekly totals. Add more screenshots if one does not show all eight managers.',
  attest: 'These are Sleeper’s final weekly totals and already include the Pick a Team bonuses.',
  attestSub: 'Bonuses are not added again. A trophy or 100% label alone does not prove a total is final.',
  mixed: weeks => `These screenshots show different matchweeks (${weeks.join(', ')}). Choose screenshots of one matchweek.`,
  noWeek: 'No matchweek was read from the screenshots. Choose the matchweek they show.',
  ambiguousWeek: 'The screenshots show more than one week number. Choose the matchweek they show.',
  projection: 'The smaller number under each score is Sleeper’s projection and is never imported.',
  tieTotals: 'Tied scores are ordered by the lower Sleeper season total. Enter the tied managers’ season totals from Sleeper; a rank, record or projection is not a season total.',
  unavailable: 'Weekly score import is not available yet.',
  denied: 'Only the Community commissioner can import weekly scores.',
});

export const STATUS_TEXT = Object.freeze({
  read: 'Read from screenshot', check: 'Check against screenshot', conflict: 'Screenshots disagree', missing: 'Not read: enter score', edited: 'Edited',
});

export const fmtScore = value => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—');

/** Tesseract's block tree flattened to words with pixel boxes (eplOcr.js passes `data.blocks`). */
export function flattenWords(blocks) {
  const words = [];
  for (const block of Array.isArray(blocks) ? blocks : []) for (const paragraph of block?.paragraphs ?? []) for (const line of paragraph?.lines ?? [])
    for (const word of line?.words ?? []) if (typeof word?.text === 'string' && word.bbox) words.push({ text: word.text, ...word.bbox, confidence: word.confidence });
  return words;
}

/** The managers of a matchweek, in its stored order, with the known mapping's names and Sleeper usernames. */
export function weekManagers(state, week) {
  const row = state?.weeks?.find(w => w.week === week);
  const byId = new Map((state?.managers ?? []).map(m => [m.ownerId, m]));
  return (row?.order ?? []).map(ownerId => byId.get(ownerId) ?? { ownerId, name: ownerId, sleeperName: null });
}

/**
 * The review rows: one per manager of the week, from the merged OCR candidates and the commissioner's edits
 * (`edits[ownerId] = { score: text, seasonTotal: text, checked: bool }`). Each row has the typed score (number or null), its
 * status, and whether it still blocks confirmation.
 */
export function reviewRows({ managers, merged, edits = {}, snapshotTotals = null }) {
  const byOwner = new Map((merged?.rows ?? []).map(r => [r.ownerId, r]));
  const rows = managers.map(m => {
    const read = byOwner.get(m.ownerId) ?? { candidates: [], score: null, status: 'missing' };
    const edit = edits[m.ownerId] ?? {};
    const typed = Object.hasOwn(edit, 'score');
    const text = typed ? edit.score : read.score === null ? '' : fmtScore(read.score);
    const score = parseScoreInput(text);
    const edited = typed && score !== read.score;
    const status = edited ? 'edited' : read.status;
    const snapshot = snapshotTotals && typeof snapshotTotals[m.ownerId] === 'number' ? snapshotTotals[m.ownerId] : null;
    const totalText = Object.hasOwn(edit, 'seasonTotal') ? edit.seasonTotal : snapshot === null ? '' : fmtScore(snapshot);
    const seasonTotal = parseScoreInput(totalText);
    const needsCheck = status === 'check' && !edit.checked;
    const invalid = text.trim() !== '' && score === null;
    return { ...m, candidates: read.candidates, extracted: read.score, text, score, status, invalid, needsCheck, totalText, seasonTotal,
      totalFromSnapshot: snapshot !== null && !Object.hasOwn(edit, 'seasonTotal') };
  });
  const order = reviewOrder(rows.map(r => ({ ownerId: r.ownerId, score: r.score, seasonTotal: r.seasonTotal })));
  const tied = new Set(order.ties.flat());
  return {
    rows: rows.map(r => ({ ...r, tied: tied.has(r.ownerId), blocking: r.score === null || r.needsCheck || (tied.has(r.ownerId) && r.seasonTotal === null) })),
    order,
  };
}

/** The merged extraction for the chosen screenshots (`images` from eplOcr.js readScreenshots, each with its OCR result). */
export function mergeForWeek(images, managers) {
  return mergeExtractions(images, managers.map(m => m.ownerId));
}

/** The /epl/admin/scores/import body, or null while anything still blocks. */
export function importBody({ season, week, extractedWeek, weekCorrected, images, review, attested, correction = false }) {
  if (!attested || !review?.order?.order || review.rows.some(r => r.blocking) || !images?.length) return null;
  const sources = [...new Set(images.map(i => i.sha256))];
  return {
    season, week, extractedWeek: extractedWeek ?? null, weekCorrected: weekCorrected === true, sources, bonusIncluded: true, correction,
    expectedOrder: review.order.order,
    scores: review.rows.map(r => ({ ownerId: r.ownerId, score: r.score, ...(r.tied ? { seasonTotal: r.seasonTotal } : {}),
      ...(typeof r.extracted === 'number' ? { extractedScore: r.extracted } : {}) })),
  };
}

/** What the confirmed import did, in one or two sentences. */
export function resultText(result) {
  if (!result?.opening) return '';
  const { opening, week } = result, next = opening.week;
  const first = opening.firstPicker?.name;
  const before = result.reconciliation === 'duplicate' ? 'These scores were already confirmed. '
    : result.reconciliation === 'reconciled' ? 'The new screenshots were added to the confirmed import. '
    : result.reconciliation === 'correction' ? `The correction to Matchweek ${week} is saved. ` : `Matchweek ${week} scores are saved. `;
  const push = opening.fixtures > 0 ? `${first} gets the turn notification if they have notifications on.`
    : `${first} gets the turn notification, if they have notifications on, once Matchweek ${next}’s fixtures are read. No kickoff time is shown until then.`;
  switch (opening.outcome) {
    case 'opened': return `${before}Matchweek ${next} is open and ${first} picks first. ${push}`;
    case 'order_applied': return `${before}Matchweek ${next}’s order is updated and ${first} picks first. ${push}`;
    case 'same_order': return `${before}Matchweek ${next} already has this order.`;
    case 'preserved_picks': return `${before}Matchweek ${next} already has picks, so its order and picks are kept.`;
    case 'preserved_closed': return `${before}Matchweek ${next}’s draft has closed, so its order is kept.`;
    case 'pending_results': return `${before}Matchweek ${next} opens once every drafted Matchweek ${week} result is verified final. Confirm again then; the same scores are recognized.`;
    case 'season_end': return `${before}That was the last matchweek, so no draft opens.`;
    default: return before.trim();
  }
}

/** The confirmed import's rows against the reviewed ones: only the managers whose score or season total differs. */
export function importDifferences(existing, review) {
  const prior = new Map((existing?.rows ?? []).map(r => [r.ownerId, r]));
  return (review?.rows ?? []).map(r => ({ ownerId: r.ownerId, name: r.name, before: prior.get(r.ownerId)?.score ?? null, after: r.score }))
    .filter(d => d.before !== d.after);
}
