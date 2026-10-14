// Shared inert probe fixtures for the boundary area files (scripts/boundary/*.mjs).
// Reserved fixtures cannot identify a real account, recipient, game or invite.
export const missingId = '00000000-0000-0000-0000-000000000000';
export const missingLeague = `g_${'0'.repeat(32)}`;
export const actor = Object.freeze({ p_user_id: missingId });
export const fixtureEmail = 'boundary-check@example.invalid';
