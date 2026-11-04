// D-70: Your guesses is the week's game tiles, then one game's card. These open a game's card from its tile (via the
// lip back to the week when another game is open) and return to the week, the way a player does.
import { expect } from '@playwright/test';

export const gameCard = (page, id) => page.locator(`.gx-per-game [data-game="${id}"]`);

/** Back to the week's tiles when a game's card is open. */
export async function openWeek(page) {
  const lip = page.locator('.gx-per-game .gx-nest-lip', { hasText: 'Week' });
  if (await lip.count()) await lip.first().click();
  await expect(page.locator('.gx-per-game [data-tile]').first()).toBeVisible();
}

/** Opens game `id`'s card (a no-op when it is already open) and returns its locator. */
export async function openGame(page, id) {
  const card = gameCard(page, id);
  if (await card.count()) return card;
  await openWeek(page);
  await page.locator(`.gx-per-game [data-tile="${id}"]`).click();
  await expect(card).toBeVisible();
  return card;
}

/** The week's market control (it sits on the week card). */
export async function chooseMarket(page, name) {
  await openWeek(page);
  await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.gx-per-game [data-tile]').first()).toBeVisible();
}
