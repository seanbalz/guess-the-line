// D-77 (Sean, November 3, 2026: "Your gaps' paper record", then option 1, "Hit rate hero"): one hero card with the share of
// your decided gaps that beat the closing line (W / (W + L), as D-75's win rate), the record and units at −110, and one dot
// per graded gap in kickoff order; its fine print opens from its info button. Moved from VirtualUnits.jsx unchanged
// (D-69 step 4): the same words, names, dots and toggle; only its classes are the new app's (gap.css, the same tokens).
import { useState } from 'react';
import { Icon } from '../../ui/index.js';
import { gapUnits } from './gapModel.js';

const GAP_WORDS = Object.freeze({ win: ['W', 'Win'], loss: ['L', 'Loss'], push: ['P', 'Push'] });

export function GapHero({ record, week }) {
  const [about, setAbout] = useState(false);
  const decided = record.wins + record.losses, waiting = record.notGraded.noFinal + record.notGraded.noLine, favorable = record.favorable;
  const rate = decided ? `${(record.wins / decided * 100).toFixed(1)}%` : '—';
  const tally = value => `${value.wins}–${value.losses}${value.pushes ? `–${value.pushes}` : ''}`;
  return <section className="gx-card gx-card--hero gx-gap-hero" aria-label="Your gaps vs. closing lines" data-gap="hero">
    <div className="gx-gap-hero-top"><span className="gx-t-micro">Your gaps · Week {week}</span>
      <button type="button" className="gx-gap-about" aria-label="About your gaps" aria-expanded={about} onClick={() => setAbout(open => !open)}><Icon icon="info" size={20}/></button></div>
    {record.graded.length ? <>
      <div className="gx-gap-rate"><span className="gx-n-xl">{rate}</span><span className="gx-t-body">beat the close</span></div>
      <p className="gx-t-meta">{tally(record)} · {gapUnits(record.netUnits)} at −110</p>
      <ol className="gx-gap-dots" aria-label="Each gap, in kickoff order">{record.graded.map(g => <li key={`${g.gameId}:${g.market}`} data-outcome={g.outcome}
        aria-label={`${g.gameId.replace('-', ' at ')} ${g.market === 'spread' ? 'spread' : 'total'}: ${GAP_WORDS[g.outcome][1]}`}><span aria-hidden="true">{GAP_WORDS[g.outcome][0]}</span></li>)}</ol>
    </> : <p className="gx-t-body">No finished games with a gap yet.</p>}
    {about ? <p className="gx-t-meta">Each locked guess that differed from the last three-book line before kickoff, graded on the side your guess favored: a paper record, not bets placed. 1 U a gap at −110. Gaps of 10% or more: {tally(favorable)}.{waiting ? ` ${waiting} not graded yet.` : ''}</p> : null}
  </section>;
}
