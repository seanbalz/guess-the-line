// Research › Fantasy (EPL): copy and number formatting shared by the four sub-tabs (plan 2026-10-28-epl-fantasy.md,
// Task 3). Missing data is an em dash, never 0 (brand guide). Pure.
export const DASH = '—';

export const FANTASY_COPY = Object.freeze({
  title: 'Fantasy',
  sections: Object.freeze({ matchup: 'Matchup', standings: 'Standings', rosters: 'Rosters', insights: 'Insights' }),
  loading: 'Loading your FEPL league',
  retry: 'Try again',
  forbidden: 'Fantasy is for the FEPL managers.',
  soon: 'Fantasy is coming soon.',
  noData: 'No Sleeper data is saved yet.',
  failed: "Fantasy didn't load. Check your connection and try again.",
  kicker: week => `MW${week} · projections from Sleeper`,
  unavailable: 'Matchup unavailable this week',
  unavailableBody: "Sleeper doesn't list this league's matchups, and last round's pairing can't be read from the scores.",
  yourProjection: 'Your projection',
  vs: 'vs',
  winChance: pct => `Win chance ${pct}%`,
  basis: (week, cycle) => `Opponent from the MW${week} round; the schedule repeats every ${cycle} matchweeks.`,
  winInfoTitle: 'About win chance',
  winInfo: [
    'Each projected total is the sum of your starters\' Sleeper projections, scored with FEPL\'s own scoring settings.',
    'Win chance treats each final score as the projection plus or minus a typical 18-point swing. The 18 points is an estimate, not a fitted number.',
  ],
  starters: 'Your starters · projected',
  noProjection: 'No projection',
  recent: 'Projected vs actual · last 4 MW',
  projected: 'Projected',
  actual: 'Actual',
  gapNote: '— means no saved Sleeper snapshot for that matchweek.',
  standings: 'Standings',
  standingsNote: 'Season points plus the Pick a Team bonus. Tap a manager for the Sleeper total.',
  split: (sleeper, bonus) => `Sleeper ${sleeper} + Pick a Team bonus ${bonus}`,
  starter: 'Starters',
  bench: 'Bench',
  unknownPlayer: 'Unknown player',
  seasonHigh: 'Season high',
  topScorer: 'Your top scorer',
  vsProjection: 'Vs projection',
  topPerTeam: 'Top scorer per team · from saved lineups',
  weekly: 'Weekly points',
  you: 'You',
  average: 'League average',
  detailStarts: week => `Weekly detail starts MW${week}.`,
  footer: when => `From Sleeper · saved ${when}`,
});

const finite = x => typeof x === 'number' && Number.isFinite(x);
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/** Points as text ("1,080.5"), or an em dash for a missing number. */
export const fmtPts = x => (finite(x) ? NUM.format(x) : DASH);
/** A signed difference ("+5.7", "−8.61"), or an em dash. */
export const fmtSigned = x => (!finite(x) ? DASH : x > 0 ? `+${NUM.format(x)}` : x < 0 ? `−${NUM.format(-x)}` : '0');
/** A 0–1 chance as a whole percent, or null. */
export const pct = x => (finite(x) ? Math.round(x * 100) : null);
/** The round-robin length for a league of `n` managers. */
export const cycleOf = n => (n % 2 ? n : n - 1);

/** The sentence for a refused or failed read. */
export function fantasyProblem(error) {
  if (error?.code === 'GTL_EPL_OFF') return FANTASY_COPY.soon;
  if (error?.code === 'GTL_EPL_NO_FANTASY') return FANTASY_COPY.noData;
  if (error?.status === 401 || error?.status === 403) return FANTASY_COPY.forbidden;
  return FANTASY_COPY.failed;
}
