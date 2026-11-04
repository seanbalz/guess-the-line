// Quick win A9: one icon per destination. A row that leads somewhere takes its glyph from here, so a destination looks
// the same from every screen that links to it (Research recommendations from Research and from Bets), and no two rows
// on one screen share a glyph: the landing rows of Home, Research and Bets, the Menu and the Commissioner tools. Every
// value is a key of `icons` (Icon.jsx), from the Lucide outline set that D-58 selected; a new glyph is added there first.
// Play's tiles (D-69 step 1) are the step 1 branch's to move onto this map.
export const DESTINATION_ICONS = Object.freeze({
  // Research (and Home's row to this week's trends)
  trends: 'trendingUp',
  fantasy: 'people',
  weeklyResearch: 'chart',
  games: 'chart', // Research › Games: the board and one game's lines (D-69 step 3)
  teams: 'shieldCheck', // Research › Teams: a team's mark, record and margins (D-69 step 3)
  researchPicks: 'clipboardCheck', // Research recommendations, a Bets view that Research links to as well
  // Bets
  overview: 'chartPie',
  activeTickets: 'ticket',
  settledTickets: 'check',
  guessGap: 'scale', // Your guess vs. market
  virtualUnits: 'coins',
  everyone: 'people',
  // Menu
  members: 'people',
  commissioner: 'shieldCheck',
  profile: 'circleUser',
  history: 'clock',
  export: 'download',
  settings: 'settings',
  reminders: 'bell',
  guidance: 'info',
  appearance: 'palette',
  // Menu › Commissioner tools
  status: 'clock',
  weekOpening: 'plus',
  referees: 'people',
  finalScores: 'trophy',
  odds: 'plug',
  eplCorrections: 'chart',
});
