import { expect } from '@playwright/test';

// D-21 button entry helpers shared by the local and cloud browser suites.
// A pick is a ChipPicker group named "<AWAY> at <HOME> home spread" or "<AWAY> at <HOME> combined points".
const show = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const picker = (page, label) => page.getByRole('group', { name: label, exact: true });
export const MINUS = '−';

/** Home-referenced signed spread: tap the favorite (or Pick'em), then the half-point chip; More for 10.5–20. */
export async function pickSpread(page, label, value) {
  const group = picker(page, label), n = Number(value), size = Math.abs(n);
  await group.locator('.team-chip').nth(n === 0 ? 1 : n < 0 ? 2 : 0).click();
  if (n === 0) return;
  const more = group.getByRole('button', { name: 'More', exact: true });
  if (size > 10 && await more.count()) await more.click();
  await group.getByRole('radio', { name: `${MINUS}${show(size)}`, exact: true }).click();
}

/** Whole-number total chips re-center on the chosen value; walk the edge chip until the target is in range, then fine-tune. */
export async function pickTotal(page, label, value) {
  const group = picker(page, label), n = Number(value), whole = Math.floor(n), chips = group.locator('.number-chip');
  for (let step = 0; step < 60 && !(await group.getByRole('radio', { name: String(whole), exact: true }).count()); step++) {
    const texts = await chips.allTextContents();
    await (whole < Number(texts[0]) ? chips.first() : chips.last()).click();
  }
  await group.getByRole('radio', { name: String(whole), exact: true }).click();
  if (n !== whole) await group.getByRole('button', { name: 'Raise by half a point' }).click();
}

export const spreadText = (away, home, value) => { const n = Number(value); return n === 0 ? "Pick'em" : `${n < 0 ? home : away} ${MINUS}${show(Math.abs(n))}`; };
export const totalText = value => `${show(Number(value))} total points`;

/** The visible pick: the picker's live summary (team and size, or total points). */
export const expectPick = (page, label, text) => expect(picker(page, label).locator('.chip-summary')).toHaveText(text);
/** No team chip is pressed and no number chip is checked, so nothing has been entered for the game. */
export const expectNoPick = async (page, label) => { await expect(picker(page, label).getByRole('button', { pressed: true })).toHaveCount(0); await expect(picker(page, label).getByRole('radio', { checked: true })).toHaveCount(0); };
export const expectPickEnabled = async (page, label, enabled = true) => {
  const chips = picker(page, label).locator('.team-chip, .number-chip');
  await expect(chips.first()).toBeVisible();
  for (const chip of await chips.all()) await (enabled ? expect(chip).toBeEnabled() : expect(chip).toBeDisabled());
};
