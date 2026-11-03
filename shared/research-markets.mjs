// Documented NFL prop keys; unknown markets stay unavailable.
export const RESEARCH_PROP_UNITS = Object.freeze({
  player_assists: 'assists', player_defensive_interceptions: 'interceptions', player_field_goals: 'field goals', player_kicking_points: 'points',
  player_pass_attempts: 'attempts', player_pass_completions: 'completions', player_pass_interceptions: 'interceptions', player_pass_longest_completion: 'yards',
  player_pass_rush_yds: 'yards', player_pass_rush_reception_tds: 'touchdowns', player_pass_rush_reception_yds: 'yards', player_pass_tds: 'touchdowns', player_pass_yds: 'yards', player_pass_yds_q1: 'yards',
  player_pats: 'extra points', player_receptions: 'receptions', player_reception_longest: 'yards', player_reception_tds: 'touchdowns', player_reception_yds: 'yards',
  player_rush_attempts: 'attempts', player_rush_longest: 'yards', player_rush_reception_tds: 'touchdowns', player_rush_reception_yds: 'yards', player_rush_tds: 'touchdowns', player_rush_yds: 'yards',
  player_sacks: 'sacks', player_solo_tackles: 'tackles', player_tackles_assists: 'tackles and assists', player_tds_over: 'touchdowns', player_tds: 'touchdowns', player_1st_td: 'touchdowns', player_anytime_td: 'touchdowns', player_last_td: 'touchdowns',
});
export const researchMarketUnit = key => {
  const base = typeof key === 'string' ? key.replace(/_alternate$/, '') : '';
  return Object.hasOwn(RESEARCH_PROP_UNITS, base) ? RESEARCH_PROP_UNITS[base] : null;
};
const GAME_UNITS = Object.freeze({ h2h: 'win', spreads: 'points', totals: 'points', alternate_spreads: 'points', alternate_totals: 'points' });
export const researchQuoteMarketUnit = key => Object.hasOwn(GAME_UNITS, key) ? GAME_UNITS[key] : researchMarketUnit(key);
