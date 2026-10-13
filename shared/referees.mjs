// Game referees: one canonical spelling per referee, shared by the gtl-api referee route
// (cloud/officials.mjs), the browser and the tests. The alias table is the same as
// shared/trends-corrections.json `refereeAliases` (a test keeps them equal), so a name typed
// as "Ronald Torbert" is stored, shown and matched to trend records as "Ron Torbert".
// Public game facts only; nothing here reads or writes player data.

export const REFEREE_ALIASES = Object.freeze({
  'Adrian Hall': 'Adrian Hill',
  'Al Riveron': 'Alberto Riveron',
  'Bill Carolo': 'Bill Carollo',
  'Bill Vinocich': 'Bill Vinovich',
  'Billy Leavy': 'Bill Leavy',
  'Bradley Rogers': 'Brad Rogers',
  'Dick Hantag': 'Dick Hantak',
  'Gene Stetatore': 'Gene Steratore',
  'Gerald Austin': 'Gerry Austin',
  'John Perry': 'John Parry',
  'Michael Carey': 'Mike Carey',
  'Ronald Torbert': 'Ron Torbert',
  'Tom Corrente': 'Tony Corrente',
});

/** Letters, spaces, periods, apostrophes and hyphens; 3-60 characters; no double spaces. The SQL check is the same. */
export const REFEREE_NAME = /^[A-Za-z][A-Za-z .'-]*[A-Za-z.]$/;

/**
 * Canonical referee name for an assignment. Returns the canonical string, null for "not assigned"
 * (the caller passed null), or undefined when the value cannot be a referee name.
 */
export function canonicalReferee(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const canonical = REFEREE_ALIASES[name] ?? name;
  if (canonical.length < 3 || canonical.length > 60 || !REFEREE_NAME.test(canonical)) return undefined;
  return canonical;
}

/** App game id, e.g. "SEA-DEN" (away-home, app team codes such as LAR). Same pattern as published slates. */
export const GAME_ID = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
