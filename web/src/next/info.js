// D-55 rule 10: the fine print every ⓘ opens, in one place. Each topic is `{ title, body, links }` for InfoButton;
// Menu › Guidance and sources lists every topic, so nothing that left a screen is lost. Wording is carried over from
// the screens it came from; the data credits are the same text and links the footers showed.
import { TRENDS_FOOTNOTE } from '../../../shared/trends-view.mjs';
import { LINES_COPY, footer } from '../../../shared/lines-view.mjs';

const credits = footer({ forecastShown: true });
export const TRENDS_LINKS = Object.freeze([
  { text: credits.trends.text, url: credits.trends.url },
  { text: `License: ${credits.trends.license}`, url: credits.trends.licenseUrl },
]);
export const WEATHER_LINKS = Object.freeze([
  { text: credits.wind.text, url: credits.wind.url },
  { text: `License: ${credits.wind.license}`, url: credits.wind.licenseUrl },
]);

export const INFO = Object.freeze({
  trends: {
    title: 'About trends',
    body: [
      TRENDS_FOOTNOTE,
      'U means units at −110: a win adds 0.91 and a loss takes 1. Break-even is 52.4%, the tick on each bar.',
      'Not proven: a pattern that held in 2002–2017 and in 2018–2025. Searching many situations finds some patterns by chance.',
      'Line-based trends unlock when that market is open to you.',
      LINES_COPY.lineLater,
    ],
    links: TRENDS_LINKS,
  },
  research: {
    title: 'About research',
    body: [
      'Historical consistency does not establish a betting advantage.',
      'The frozen Tier 2 study qualified roughly as many patterns on shuffled outcomes as on actual outcomes. The recent consistency rule also produces chance qualifiers. Searching many situations can produce apparently strong records by chance; these are descriptive selections, not proven predictions.',
      'Support describes a relationship to a lean. Consistency describes the historical pattern. Overlapping patterns share a group; groups are not independent probabilities.',
      'Chart and table use chronological bins of the same selected games; each point is a bin endpoint, not an individual result. Pushes return zero units.',
    ],
    links: TRENDS_LINKS,
  },
  researchData: {
    title: 'About research data',
    body: [
      'Consistent, not proven. Display periods do not change qualification or lean evidence.',
      'Emerging research does not vote on a lean. Filters change this list and selected records, not the full evidence used for leans.',
      'The research screen’s data information shows its snapshot time, period anchor and source. Missing dates stay Unknown.',
    ],
    links: TRENDS_LINKS,
  },
  trackedBets: {
    title: 'About tracked bets',
    body: [
      'Tracked bets are shared with all signed-in players, including when you select a private league. Results are player reported.',
      'This records a bet you placed elsewhere. It never places a wager or moves money.',
      'ROI is net units divided by units risked on settled bets with complete returns.',
    ],
  },
  recommended: {
    title: 'About Recommended',
    body: [
      'Compare your locked guesses with current lines. Track a ticket placed elsewhere, or play with Virtual Units.',
      'Differences are compared as a percentage of the line; they are not win probabilities.',
    ],
  },
  virtual: {
    title: 'About Virtual Units',
    body: [
      'Your account’s Virtual Units picks are reused across your leagues.',
      'Virtual Units are play money: one unit is $100 of virtual money, and nothing is wagered.',
    ],
  },
  everyone: {
    title: 'About everyone’s picks',
    body: [
      'Everyone’s Virtual Units picks for this week, for the league showing. A pick’s side and units show as soon as it is placed (D-36).',
      'A friend’s line, price, book and result show once you lock in that game’s guess for that market, sit it out, or the game kicks off. Your own picks always show in full.',
      'A player qualifies for the weekly board at three picks or 3U. Virtual Units are play money; nothing is wagered.',
    ],
  },
  scores: {
    title: 'About your scores',
    body: ['Points measure how close your guess was to its saved scoring line. NFL results do not change those points.'],
  },
  weather: {
    title: 'About weather',
    body: ['Forecasts come from Open-Meteo and are reference only. The credit also sits beside every forecast value.'],
    links: WEATHER_LINKS,
  },
  // Guess the Points (D-56 spec section 5, "ⓘ About Guess the Points"): rules, weights, void, timing, the House note and the credit.
  points: {
    title: 'About Guess the Points',
    body: [
      'Each week opens Tuesday at 12:00 PM PT with five players: QB, RB, WR, TE and FLEX. Guess each one’s fantasy points, a whole number from 0 to 60, and lock it in before his game kicks off. A locked guess is final; a slot never locked in scores nothing and shows —.',
      'Scoring is Full PPR: 1 point per reception and 4 per passing touchdown, with the rest of GTL’s disclosed offensive weights. Each slot earns 10 minus the fantasy points you were off, never below 0. The week’s maximum is 50.',
      'A player with no snap, a team change or a game moved out of the week is Void · inactive for everyone, and the maximum drops by 10.',
      'Points are PROVISIONAL as stats load and re-grade on corrections until the following Thursday at 12:00 PM PT, then FINAL.',
      'Other members’ guesses and the House open once you lock in that player, or at his kickoff. The House is GTL’s own weekly estimate, shown as an unranked row. It is public in Research › Fantasy; the ballot holds it back only so it does not anchor your guess.',
      'Points has its own board and never adds to Spread or Total.',
    ],
    links: [
      { text: 'Player stats: nflverse', url: 'https://github.com/nflverse/nflverse-data' },
      { text: 'License: CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    ],
  },
  history: {
    title: 'About History',
    body: [
      'History keeps every Guess the Line ballot: each guess, the line saved with it, its points and the final score. Nothing a player entered is deleted, moved or hidden.',
      'Another member’s guesses show game by game once you lock in that game, or at its kickoff. A sat-out week is recorded as sat out, never as zero.',
      'Your drafts and your changes are yours alone. A change to a draft shows here once that game is locked in or kicks off.',
      'A ballot whose original submission time was not recorded is compared at the time it stores, and says so.',
      'Bets weeks list everyone’s Virtual Units picks. A friend’s line and price show once that game’s market is open to you.',
    ],
  },
});

/** The order Menu › Guidance and sources lists the topics in. */
export const GUIDANCE_ORDER = Object.freeze(['scores', 'points', 'trends', 'research', 'researchData', 'trackedBets', 'recommended', 'virtual', 'everyone', 'weather', 'history']);
