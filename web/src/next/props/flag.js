// D-82 Player Props app flag. The mode ships dark: unless the build sets VITE_GTL_PLAYER_PROPS=on, no Player Props
// control renders anywhere, no prop code chunk loads and no /props request is made. Turning it on is one of three
// switches that must all be on together (cloud/player-props.mjs lists the gtl-api secret and the database capability);
// it needs the readiness audit, Sean's named migration apply and a normal protected release first.
export const PLAYER_PROPS_FLAG = 'VITE_GTL_PLAYER_PROPS';
/** Play's market value for Player Props beside guess_spread and guess_total. */
export const PROPS_MARKET = 'player_props';
export const PROPS_PLAY_SECTION = 'props';
/** Your guess vs. market's filter value for Player Props beside all, spread and total. */
export const PROPS_GAP_MARKET = 'props';

// "Choose an available prop" on the record (sheet 06) opens Play › Your guesses on Player Props. The request is held here,
// in memory only, and taken once by the next Your guesses screen; nothing is stored or added to the address.
let entryRequested = false;
export function requestPropsEntry() { entryRequested = true; }
export function takePropsEntryRequest() { const requested = entryRequested; entryRequested = false; return requested; }

export function playerPropsEnabled(env = import.meta.env) {
  const value = env?.[PLAYER_PROPS_FLAG];
  return typeof value === 'string' && value.trim().toLowerCase() === 'on';
}
/** The market options with Player Props appended when the flag is on; the same array, unchanged, when it is off. */
export function withPlayerProps(options, value, enabled = playerPropsEnabled()) {
  return enabled ? [...options, { value, label: 'Player Props' }] : options;
}
