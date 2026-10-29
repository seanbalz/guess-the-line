// Display metadata from Sleeper's once-daily player map. A current directory is never evidence of a historical
// scoring position: only names and club abbreviations may supplement the immutable snapshot's embedded metadata.
import { playersFromSnapshot, rosteredIds } from './epl-sleeper.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = id => /^[1-9][0-9]{0,29}$/.test(id);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const abbr = value => typeof value === 'string' && /^[a-z]{2,6}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
const name = player => text(player.metadata?.full_name) ?? text(player.full_name)
  ?? text([text(player.first_name), text(player.last_name)].filter(Boolean).join(' '));

/** Merge fields per player: a display-only entry must not erase an embedded scoring position. Explicit null wins. */
export function mergePlayerDirectories(...sources) {
  const out = Object.create(null);
  for (const source of sources) if (record(source)) for (const [id, player] of Object.entries(source)) {
    if (['__proto__', 'prototype', 'constructor'].includes(id) || !record(player)) continue;
    out[id] = { ...(out[id] ?? {}), ...player };
  }
  return out;
}

/** A roster-limited, minimal supplement. No current directory position/fantasy_positions enters the snapshot. */
export function enrichPlayerDisplay(snapshot, directory) {
  const rostered = [...rosteredIds(snapshot)].filter(id => id !== '0');
  const players = playersFromSnapshot(snapshot);
  for (const id of rostered) {
    if (!safeId(id) || !record(directory) || !Object.hasOwn(directory, id) || !record(directory[id])) continue;
    const player = directory[id], current = players[id] ?? {}, displayName = name(player), club = abbr(player.team_abbr);
    if (!displayName && !club && !players[id]) continue;
    players[id] = { ...current };
    if (!text(current.name) && displayName) players[id].name = displayName;
    if (!abbr(current.team_abbr) && club) players[id].team_abbr = club;
  }
  const mapped = rostered.filter(id => safeId(id) && Object.hasOwn(players, id) && record(players[id])).length;
  const named = rostered.filter(id => safeId(id) && text(players[id]?.name)).length;
  return { players: { ...players }, coverage: { rostered: rostered.length, mapped, named, missingEntries: rostered.length - mapped, missingNames: rostered.length - named } };
}
