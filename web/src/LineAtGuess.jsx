import React from 'react';
import { date, fmt, signed } from './api';
import { availableScoringReference, lineLabel, pendingScoringReference, referenceAgeText } from './scoringReferences';

// October 12, 2026: "Line at your guess: −3.5 at 2:11 PM · observed 14 min before your guess · 9/10".
// Shown only for the viewer's own submitted guesses (the same gate as the existing saved-reference line).
export default function LineAtGuess({ reference, pick, spread }) {
  const value = n => spread ? signed(n) : fmt(n);
  if (availableScoringReference(reference)) {
    const age = referenceAgeText(reference);
    const points = Number.isFinite(pick) ? Math.max(0, 10 - 2 * Math.abs(pick - reference.value)) : null;
    return <small className="line-at-guess">{lineLabel(reference)}: <strong>{value(reference.value)}</strong>
      {reference.observedAt && <> at {date(reference.observedAt, { month: undefined, day: undefined })} PT</>}
      {age && <> · {age}</>}{points !== null && <> · {fmt(points)}/10</>}
      <br/>{reference.source} · Saved {date(reference.savedAt)} PT</small>;
  }
  if (pendingScoringReference(reference)) return <small className="line-at-guess">Saved {date(reference.savedAt)} PT · pending · the first line after submission becomes this guess’s reference.</small>;
  return <small className="line-at-guess">Unscored · {reference?.reason || 'No saved line for this guess.'}</small>;
}
