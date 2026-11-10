import { TEAM_NAMES } from '../../shared/nfl-schedule.mjs';
import { teamAliases } from './teamLogoRegistry.js';

/** Expand only canonical schedule identity; arbitrary labels remain literal. */
export function scheduleTeam(game, side) {
  const label = game?.[side], explicit = game?.[`${side}Code`];
  const raw = typeof explicit === 'string' ? explicit : typeof label === 'string' ? label : '';
  const code = teamAliases[raw.toUpperCase()] || raw.toUpperCase();
  if (TEAM_NAMES[code]) return { code, name: TEAM_NAMES[code] };
  const named = Object.entries(TEAM_NAMES).find(([, name]) => name === label);
  return named ? { code: named[0], name: label } : { code: '', name: label || 'Team unavailable' };
}
