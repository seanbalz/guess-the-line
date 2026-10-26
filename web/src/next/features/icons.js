// Original line icons for badges and awards (the approved prototype's `badgeIcon`, D-38; game-features rule: no team
// logos, sportsbook marks or emoji). One 24-unit path each, for the kit's Badge (`iconPath`), so a badge looks the
// same on the shelf, in its detail and in a celebration.
const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const BADGE_ICONS = Object.freeze({
  bullseye: dot(12, 12, 9) + dot(12, 12, 4.5) + dot(12, 12, 1) + 'M1.5 12h2M20.5 12h2',
  double_bullseye: dot(7.5, 12, 5) + dot(16.5, 12, 5) + 'M2 12h20',
  called_the_move: 'M3 19h4v-4h4v-4h3.5' + dot(18, 10, 2.5),
  dialed_in: 'M3 17a9 9 0 0 1 18 0zM12 17l4.5-6.5',
  closer: 'M12 4v16M2 12h7M6 9l3 3-3 3M22 12h-7M18 9l-3 3 3 3',
  never_missed: 'M4 6h16v12H4zM7.2 6v12M10.4 6v12M13.6 6v12M16.8 6v12',
  sharp: 'M4 13l8-7 8 7M4 18h16',
  dog_day: 'M12 2v10M8.5 5.5 12 2l3.5 3.5M8 6H5v5c0 4.5 3 7.5 7 9.5 4-2 7-5 7-9.5V6h-3',
  perfect_week: 'M2 11.5l1.5 1.5L6 10M7.5 11.5 9 13l2.5-3M13 11.5l1.5 1.5 2.5-3M18.5 11.5 20 13l2.5-3M2 17h20',
  hot_hand: dot(4, 18, 1.5) + dot(8, 15, 1.5) + dot(12, 12, 1.5) + dot(16, 9, 1.5) + dot(20, 6, 1.5),
  lone_wolf: dot(5, 8, 2) + dot(10, 8, 2) + dot(7.5, 12.5, 2) + dot(18, 16, 2),
  showdown: 'M3 6l6 6-6 6M21 6l-6 6 6 6',
  giant_slayer: 'M15 3h4v18h-4zM3 21l4.5-8L12 21z',
  taker: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM8.5 12l2.5 2.5 4.5-4.5',
});
const TROPHY = 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z';
const WORST_BEAT = 'M3 6l6 6 4-4 8 8M21 11v5h-5';

/** The award's icon: its badge's where one matches, the trophy for winners. */
export const AWARD_ICONS = Object.freeze({
  spread_winner: TROPHY, total_winner: TROPHY, bets_winner: TROPHY,
  spread_champion: TROPHY, total_champion: TROPHY, bets_champion: TROPHY,
  best_guess: BADGE_ICONS.bullseye, sharpest_bet: BADGE_ICONS.sharp, saw_it_coming: BADGE_ICONS.called_the_move, worst_beat: WORST_BEAT,
});
