// Research's names, addresses and focus handles in one place (D-69 step 3): the sections, one game
// (`#research/games?layer=game&item=SEA-DEN`), one team (`#research/teams?layer=team&item=SEA`), and the stable ids the
// shell returns focus to on Back (a spoken name can change; an id does not).
import { RESEARCH_LAYERS } from '../shell/state.js';

export const RESEARCH_NAMES = Object.freeze({ title: 'Research', games: 'Games', trends: 'Trends', fantasy: 'Fantasy', teams: 'Teams' });
export const gameRowId = id => `gx-l-row-${id}`;
export const teamRowId = code => `gx-r-team-${code}`;
export const tileId = key => `gx-r-tile-${key}`;
/** "SEA @ DEN" from a game id, the layer's heading while its week loads (so the heading never changes under the reader). */
export const layerTitle = id => (typeof id === 'string' && /^[A-Za-z]{2,4}-[A-Za-z]{2,4}$/.test(id) ? id.replace('-', ' @ ') : id);
/** A Research section on its first layer, as the landing's card and tiles open it. */
export function openSection(shell, section, view = {}) { shell.go('research', { section, season: null, week: null, ...view }); }
export const gameView = id => ({ section: 'games', layer: RESEARCH_LAYERS.games.layer, item: id });
export const teamView = code => ({ section: 'teams', layer: RESEARCH_LAYERS.teams.layer, item: code });
export function openGame(shell, id) { shell.setView('lines', { layer: RESEARCH_LAYERS.games.layer, item: id }); }
/** The pager: another game in place (not a step). The caller asks shell.confirmLeave() first. */
export function pageGame(shell, id) { shell.setView('lines', { item: id }); }
export function closeGame(shell) { shell.setView('lines', { layer: undefined, item: undefined }); }
/** From the Teams list or from a game: a step to Research › Teams › that team. */
export function openTeam(shell, code) { shell.go('research', teamView(code)); }
export function closeTeam(shell) { shell.setView('research', { layer: undefined, item: undefined }); }
