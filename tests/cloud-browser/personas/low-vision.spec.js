// Persona (d): low-vision user. 200% zoom (640 CSS px viewport at deviceScaleFactor 2, the
// browser-zoom equivalent of a 1280px laptop), CSS zoom, forced-colors emulation, an axe scan on
// every screen, and the screen-reader names from the accessibility tree.
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });

test('low vision: 200% zoom, forced colors, axe on every screen and accessible names', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 4 });
  await page.goto('/');
  await persona.axe('sign-in');
  await persona.shot('sign-in-200');
  await persona.smallText('sign-in-200', { min: 13 });
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await persona.axe('feed');
  await persona.smallText('feed', { min: 13 });
  await persona.shot('feed-200');
  // The leaderboard table at 200%: column headers are 8px and the table scrolls sideways.
  const tableScroll = await page.locator('.community-leaderboard .table-scroll').evaluate(el => el.scrollWidth > el.clientWidth);
  const thSize = await page.locator('.community-leaderboard th').first().evaluate(el => getComputedStyle(el).fontSize);
  persona.finding({ screen: 'feed-200', severity: 2, wcag: '1.4.4 (resize text), 1.4.10 (reflow)', experience: `At 200% zoom the leaderboard column headers are ${thSize} (so 16px on screen), five columns ${tableScroll ? 'need horizontal scrolling inside the card' : 'squeeze into the card'}, and "—" placeholders carry no label. A player with low vision cannot read "Spread wk / Spread season" without zooming further.`, fix: 'Set table headers to 13px minimum, abbreviate columns with visible full names on hover/focus, and stack the leaderboard as cards below 720px.' });

  // Picks at 200%.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  await persona.axe('picks');
  await persona.smallText('picks', { min: 13 });
  await persona.shot('picks-200');
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('button', { name: '−3', exact: true }).click();
  // Selected-chip state is carried by color alone (lime fill); the text is the same.
  const selectedStyle = await first.getByRole('button', { name: '−3', exact: true }).evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight, border: s.borderColor }; });
  persona.finding({ screen: 'picks-200', severity: 2, wcag: '1.4.1 (use of color)', experience: `A chosen chip changes only its fill (${selectedStyle.bg}) and text color; the glyph, weight (${selectedStyle.weight}) and border shape are identical to unselected chips. aria-pressed carries the state for screen readers, but a sighted low-vision or color-blind player must distinguish lime from navy. The output line "Cowboys −3" helps only on that card.`, fix: 'Add a check icon or a 2px inset ring to the selected chip and bold the summary line.', evidence: selectedStyle });
  await persona.shot('picks-200-selected');
  // Accessible names from the accessibility tree.
  const tree = await first.ariaSnapshot();
  persona.finding({ screen: 'picks-200', severity: 2, wcag: '2.4.6, 4.1.2', experience: `Screen-reader view of one game: group "Tampa Bay Buccaneers at Dallas Cowboys Spread", toggle buttons "Buccaneers", "Pick'em", "Cowboys", then toggle buttons "−1" … "−10" and "More", buttons "Lower by half a point" / "Raise by half a point", and the live (aria-live) summary "Cowboys −3". Every number chip is announced as "minus three, toggle button" with no team or meaning; in the Total ballot "44, toggle button" carries no unit. The team facts line is read as "TB 1-4 Road 1-1".`, fix: 'Give each number row an aria-label ("Cowboys win by" / "Combined points"), set aria-describedby on chips to that label, and spell out records ("Tampa Bay 1 and 4, road 1 and 1").', evidence: { tree: tree.split('\n').slice(0, 30).join('\n') } });
  expect(tree).toContain('Buccaneers at Dallas Cowboys Spread');

  // CSS zoom 200% on a 1280 CSS viewport: does anything overflow horizontally?
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const overflow = !(await persona.noOverflow());
  await persona.shot('picks-css-zoom');
  if (overflow) persona.finding({ screen: 'picks-css-zoom', severity: 3, wcag: '1.4.10', experience: 'With CSS zoom 200% at 1280px the document is wider than the viewport.', fix: 'Check fixed widths (publish-fields input 110px, league chips) under zoom.' });
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 640, height: 450 });

  // Forced colors (Windows High Contrast): the lime fill disappears, so selection must survive.
  await page.emulateMedia({ forcedColors: 'active' });
  await persona.shot('picks-forced-colors');
  const forced = await first.getByRole('button', { name: '−3', exact: true }).evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, outline: s.outlineStyle }; });
  const unselected = await first.getByRole('button', { name: '−4', exact: true }).evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, outline: s.outlineStyle }; });
  const hasForcedCss = await page.evaluate(() => [...document.styleSheets].some(sheet => { try { return [...sheet.cssRules].some(rule => rule.media && /forced-colors/.test(rule.media.mediaText)); } catch { return false; } }));
  persona.finding({ screen: 'picks-forced-colors', severity: 2, wcag: '1.4.1, 1.4.11', experience: `Under forced colors the selected chip is ${JSON.stringify(forced)} and an unselected one ${JSON.stringify(unselected)}: ${forced.bg === unselected.bg && forced.color === unselected.color ? 'identical' : 'different only by system colors'}. ${hasForcedCss ? 'There is a forced-colors rule' : 'No stylesheet has a @media (forced-colors) rule'}, so selected chips, the "me" row in the leaderboard, the urgent border on the picks-due card and the liked heart all lose their meaning.`, fix: 'Add @media (forced-colors: active) rules: selected chips get a 3px solid border and a check icon, liked/urgent states get an icon change, and use forced-color-adjust: none only for brand marks.', evidence: { forced, unselected, hasForcedCss } });
  await page.emulateMedia({ forcedColors: 'none' });

  // Groups screen and the game dashboard are also part of the journey.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await persona.axe('groups');
  await persona.smallText('groups', { min: 13 });
  await persona.shot('groups-200');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Start a new game' })).toBeVisible();
  await persona.axe('new-game-dialog');
  await persona.shot('new-game-200');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Light theme at 200%: contrast of muted text and lime foreground.
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await persona.axe('groups-light');
  await persona.shot('groups-light-200');
  await page.getByRole('button', { name: '← Community' }).click();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await persona.axe('feed-light');
  await persona.shot('feed-light-200');
  expect(await persona.noOverflow()).toBe(true);
});

