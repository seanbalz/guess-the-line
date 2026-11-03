// The M-38 dispatcher queues one run per 15-minute slot, and its claim refuses a run from another slot. A test that dispatches
// and then claims on the real clock must keep the pair inside one slot: near a slot edge, wait for the next slot first.
export const SLOT_MS = 15 * 60_000;
const MARGIN_MS = 3000;

/** Resolves immediately, except in the last 3 seconds of a slot, when it waits just past the edge (at most about 3 s). */
export async function waitOutSlotEdge(now = Date.now) {
  const edge = now() % SLOT_MS;
  if (edge > SLOT_MS - MARGIN_MS) await new Promise(resolve => setTimeout(resolve, SLOT_MS - edge + 50));
}
