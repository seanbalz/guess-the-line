# Trends glass tiles (D-75) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild the Research › Trends tiles and the opened trend's chart as Sean chose on November 3:
- glass tiles, each with one win-rate number;
- the top three first, the rest folded;
- one glass chart card for an opened trend.

**Architecture:** the tile, hero and chart card live in `web/src/next/trends/TrendLayer.jsx`. This Week
(`WeekNest.jsx`) and Teams (`TeamsNest.jsx`) compose them. The win rate comes from `trendShare` in `teamNest.js`, made
exact from each trend's record. A new `weekList=all` address joins the Trends keys in the router and shell state. The
styles go in `web/src/next/ui/nest.css`, using the existing `--gx-glass*`, `--gx-radius-*` and `--gx-data` tokens.

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, Vitest for `tests/*.test.jsx` (static-markup
renders), `node:test` for `tests/*.test.mjs`, Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-03-trends-glass-tiles-design.md` (D-75). Mockups: the private canvas
[GTL Trends Tiles and Chart Options](https://claude.ai/artifact/XKm5YakrtHG5JzBo11fDQf), rows "Chosen: 5 · Top three,
rest folded" and "Option 5 · the Teams landing".

## Global Constraints

- **Sean's choices:** scope "Trends tiles + trend chart (Recommended)"; option "Rec" (5 · Top three, rest folded); "Yes"
  to the drawn screens. The mockups set the layout; tokens and copy rules set the look.
- **Win rate:** W / (W + L), with pushes left out, shown to one decimal as "55.6%", or "—" with no decided game.
- **Meta line:** every trend tile's meta is "N games · since YYYY" from `sinceText(card.years)`.
- **Gates:** a locked trend stays the lock tile with no number (D-31, D-36). The hero of a locked strongest trend is
  that lock.
- **Nesting (D-66):** one picture and one big number per unit; no surface sentence over twelve words; lips are buttons
  named "Back to …"; every layer has an address. The team fold is an in-place button with `aria-expanded`, not an
  address.
- **Tokens only:** no hex colors in CSS. Glass uses `--gx-glass` and `--gx-glass-shadow`; radii use `--gx-radius-md`
  (tiles) and `--gx-radius-lg` (hero, chart card); lines use `--gx-data`.
- **Unchanged:** no server, data, route, migration or rule change, and no motion change (D-69 step 3 adds motion later).
- **Worktree:** `C:/Users/sbals/betting-repo-worktrees/trends-glass-tiles`, branch `claude/trends-glass-tiles`. Link
  `node_modules` and `.local/sql-check` to the main checkout, or the PGlite specs skip. Every browser report must say
  `skipped 0`. Port 5198 may be held by another session's server, so run browser specs with a private-port config copy
  (task 6). Keep every file LF and run `git diff --check`.

---

### Task 1: the exact win rate and its text

**Files:**
- Modify: `web/src/next/trends/teamNest.js` (the `trendShare` function, plus a new `winRateText`)
- Modify: `shared/trends-view.mjs:570` (export `sinceText`)
- Test: `tests/next-trends-nest.test.jsx` (the `teamNest` describe block)

**Interfaces:**
- Produces: `trendShare(week, card) → number | null`, exact W/(W+L) from `card.chart.record` for a card and from the
  row's `split` for a row; `winRateText(share) → string` ("55.6%" or "—"); `sinceText(years) → string`, exported.

- [ ] **Step 1: Write the failing tests.** Add them inside `describe('teamNest: what the layers are built from', …)`:

```jsx
  it('a card’s share is exact from its record, and the win rate reads to one decimal (D-75)', () => {
    const card = { kind: 'card', locked: false, pct: 56, chart: { record: { W: 388, L: 310, P: 14 } } };
    expect(trendShare(weekOf(), card)).toBeCloseTo(388 / 698, 10);
    expect(winRateText(trendShare(weekOf(), card))).toBe('55.6%');
    expect(winRateText(trendShare(weekOf(), { kind: 'card', chart: { record: { W: 0, L: 0, P: 3 } } }))).toBe('—');
    expect(winRateText(null)).toBe('—');
  });
```

Change the import line at the top of the file to:

```jsx
const { nestTeams, nestTeamTrends, trendShare, winRateText } = await import('../web/src/next/trends/teamNest.js');
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "exact from its record"`
  Expected: FAIL. `winRateText` is not a function, or the share is 0.56.

- [ ] **Step 3: Implement.** In `web/src/next/trends/teamNest.js`, replace `trendShare` and add `winRateText` under it:

```js
/** Side A's share of decided games for an open card or row (pushes left out), or null. Exact from the record (D-75). */
export function trendShare(week, card) {
  if (!card || card.locked) return null;
  if (card.kind === 'card') {
    const r = card.chart?.record;
    if (r && Number.isFinite(r.W) && Number.isFinite(r.L)) return r.W + r.L ? r.W / (r.W + r.L) : null;
    return typeof card.pct === 'number' ? card.pct / 100 : null;
  }
  const [a = 0, b = 0] = Array.isArray(lookup(week, card.id)?.entry?.split) ? lookup(week, card.id).entry.split : [];
  return a + b ? a / (a + b) : null;
}

/** A trend's one big number (D-75): the win rate to one decimal, or a dash with no decided game. */
export const winRateText = share => (typeof share === 'number' && Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : '—');
```

In `shared/trends-view.mjs` line 570, change `const sinceText =` to `export const sinceText =`.

- [ ] **Step 4: Run them and see them pass.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "teamNest"`
  Expected: PASS, including the existing "a missing share is null, never zero".

- [ ] **Step 5: Commit**

```bash
git add web/src/next/trends/teamNest.js shared/trends-view.mjs tests/next-trends-nest.test.jsx
git commit -m "Trends: exact win rate from the record and its one-decimal text (D-75)"
```

### Task 2: the glass tile, the hero and the chart card

**Files:**
- Modify: `web/src/next/trends/TrendLayer.jsx` (`TrendTile`, `trendLayer`, new `TrendHero`, new `TrendChartCard`)
- Modify: `web/src/next/ui/nest.css`
- Test: `tests/next-trends-nest.test.jsx` (TeamsNest "one team" and "one trend" cases)

**Interfaces:**
- Consumes: `winRateText`, `sinceText`; `linePath(values, { width, height, top, bottom }) → { line, area }` and
  `signed(n)` from `web/src/next/charts/geometry.js`.
- Produces: `TrendTile({ card, rules, onOpen })` and `TrendHero({ card, rules, onOpen })`, which render one `<li>`;
  `trendLayer(...)`, unchanged signature, now drawing `<TrendChartCard card/>` with `data-trend-chart` on its root.
  Every caller passes `card.share` (set from `trendShare`).

- [ ] **Step 1: Write the failing tests.** In `tests/next-trends-nest.test.jsx`:
  - Replace the body of `it('one trend: two lips, the big record, the sample and tier as tags, …')` with the test
    below, and rename it `'one trend: two lips, one glass chart card with the win rate and record, the tier behind ⓘ'`.
  - Add a tile test after the `'a trend tile names the years …'` case.

```jsx
    const key = `${GB_ATS}@GB`, slug = trendSlug(key);
    expect(slug).toMatch(/^t[0-9a-z]+$/);
    expect(slug).not.toContain('GB');
    const html = render({ teamsTeam: 'GB', teamsTrend: slug });
    expect(markupProblems(html)).toEqual([]);
    const lips = nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip'));
    expect(lips.map(nameFrom)).toEqual(['Back to Teams', 'Back to Green Bay Packers']);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('GB at home: ATS');
    const chart = nodes(html).find(n => n.attrs?.['data-trend-chart'] !== undefined);
    expect(textOf(chart)).toContain('71.4%');   // 5 of 7 decided
    expect(textOf(chart)).toContain('5–2');
    expect(html).not.toContain('gx-pill');      // tags left the surface
    expect(html).not.toContain('No proven edge'); // the tier is behind ⓘ (rendered only when it opens)
    expect(html).not.toContain(GB_ATS);
```

```jsx
  it('a trend tile is glass with one win rate and no meter (D-75)', () => {
    const html = render({ teamsTeam: 'GB' });
    const tiles = nodes(html).filter(n => n.tag === 'button' && n.attrs?.['data-trend'] && n.attrs['data-trend'] !== 'locked');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.attrs.class).toContain('gx-nest-tile--glass');
      expect(textOf(tile)).toMatch(/\d+\.\d%|—/);
    }
    expect(html).not.toContain('gx-nest-meter');
  });
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "one trend|glass with one win rate"`
  Expected: FAIL. There is no `data-trend-chart`, and the tiles still have meters.

- [ ] **Step 3: Implement `TrendLayer.jsx`.** Change the imports at the top to:

```jsx
import { useId } from 'react';
import { lockedRecordsText, lockedTrendText } from '../../../../shared/lines-view.mjs';
import { sinceText } from '../../../../shared/trends-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, Icon, InfoButton, Nest } from '../ui/index.js';
import { linePath, signed } from '../charts/geometry.js';
import { trendInfoBody } from '../lines/parts.jsx';
import { INFO } from '../info.js';
import { winRateText } from './teamNest.js';
import { WindowRecords } from './WindowRecords.jsx';
```

Replace `shareWords` and `TrendTile` with:

```jsx
/** "712 games · since 2002": a trend's sample and the years it covers (D-75). */
export const gamesText = card => `${(card.games ?? 0).toLocaleString('en-US')} games · ${sinceText(card.years)}`;

/** One trend in a list (D-75): a lock with its condition when the gate holds it, else a glass tile with one win rate. */
export function TrendTile({ card, rules, onOpen }) {
  if (card.locked) {
    return <li><div className="gx-nest-tile" data-trend="locked">
      <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">{card.title}</span><Icon icon="lock" size={16}/></span>
      <span className="gx-t-meta">{lockedTrendText(card.gate, rules)}</span>
    </div></li>;
  }
  return <li><button type="button" className="gx-nest-tile gx-nest-tile--glass" data-trend={card.kind} onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-n-m gx-nest-num">{winRateText(card.share)}</span>
    <span className="gx-t-meta">{gamesText(card)}</span>
  </button></li>;
}

/** This Week's strongest trend (D-75): one larger glass card with its own line where the week file has one. */
export function TrendHero({ card, rules, onOpen }) {
  if (card.locked) return <TrendTile card={card} rules={rules} onOpen={onOpen}/>;
  const spark = card.chart?.spark?.length > 1 ? linePath(card.chart.spark, { width: 120, height: 48, top: 4, bottom: 4 }) : null;
  return <li><button type="button" className="gx-nest-hero" data-trend={card.kind} data-hero="" onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-nest-hero-row">
      <span className="gx-vstack"><span className="gx-n-l gx-nest-num">{winRateText(card.share)}</span>
        <span className="gx-t-meta">win rate · {gamesText(card)}</span></span>
      {spark ? <svg className="gx-nest-hero-spark" viewBox="0 0 120 48" width="120" height="48" aria-hidden="true"><path d={spark.line}/></svg> : null}
    </span>
  </button></li>;
}

/** The opened trend's one glass card (D-75): the win rate, one line with a soft fill, then the record and units. */
function TrendChartCard({ card }) {
  const id = useId().replace(/:/g, '');
  const c = card.chart, spark = c?.spark?.length > 1 ? linePath(c.spark, { width: 320, height: 120, top: 8, bottom: 8 }) : null;
  return <div className="gx-nest-chart" data-trend-chart="">
    <p className="gx-nest-big"><span className="gx-n-xl">{winRateText(card.share)}</span><span className="gx-t-meta">win rate {sinceText(card.years)}</span></p>
    {spark ? <svg className="gx-nest-chart-line" viewBox="0 0 320 120" preserveAspectRatio="none" role="img"
      aria-label={`Cumulative units at −110: ${signed(c.units)} after ${(card.games ?? 0).toLocaleString('en-US')} games ${sinceText(card.years)}`}>
      <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gx-nest-chart-stop-top"/><stop offset="1" className="gx-nest-chart-stop-end"/></linearGradient></defs>
      <path d={spark.area} fill={`url(#fill-${id})`}/><path className="gx-nest-chart-stroke" d={spark.line}/>
    </svg> : null}
    <p className="gx-nest-chart-foot"><span className="gx-t-meta">{card.record}</span>{c ? <span className="gx-t-meta">{signed(c.units)} U at −110</span> : null}</p>
  </div>;
}
```

Replace the body of `trendLayer` with:

```jsx
export function trendLayer({ label, layer, card, week, view, lips }) {
  const info = <InfoButton title="About this trend" body={trendInfoBody(card)} links={INFO.trends.links}/>;
  return <Nest label={label} layer={layer} title={card.title} info={info} lips={lips}>
    <TrendChartCard card={card}/>
    <WindowRecords card={card} week={week} summary="Windows and dates"/>
    <GameDetailsButton view={view}/>
  </Nest>;
}
```

Update the header comment to say that the tiles and the opened trend follow D-75: one win rate, glass. Remove
`shareWords` from `TeamsNest.jsx`'s import; task 5 replaces the meter there.

- [ ] **Step 4: Add the CSS.** Append to `web/src/next/ui/nest.css` (tokens only):

```css
/* D-75 glass trend tiles, hero and chart card: one number each; the glass and data tokens carry both themes. */
.gx .gx-nest .gx-nest-tile.gx-nest-tile--glass { border-color: transparent; background: var(--gx-glass); box-shadow: var(--gx-glass-shadow); }
.gx .gx-nest-hero {
  display: flex; flex-direction: column; gap: var(--gx-space-3); width: 100%; min-height: var(--gx-size-touch);
  padding: var(--gx-space-4); border: 0; border-radius: var(--gx-radius-lg); cursor: pointer;
  background: var(--gx-glass); box-shadow: var(--gx-glass-shadow); color: var(--gx-text-1); font: inherit; text-align: left;
}
.gx .gx-nest-hero-row { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--gx-space-3); min-width: 0; }
.gx .gx-nest-hero-spark { flex: none; }
.gx .gx-nest-hero-spark path, .gx .gx-nest-chart-stroke { fill: none; stroke: var(--gx-data); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.gx .gx-nest-chart { display: flex; flex-direction: column; gap: var(--gx-space-2); padding: var(--gx-space-4); border-radius: var(--gx-radius-lg); background: var(--gx-glass); box-shadow: var(--gx-glass-shadow); }
.gx .gx-nest-chart-line { display: block; width: 100%; height: 120px; }
.gx .gx-nest-chart-stop-top { stop-color: var(--gx-data); stop-opacity: 0.32; }
.gx .gx-nest-chart-stop-end { stop-color: var(--gx-data); stop-opacity: 0; }
.gx .gx-nest-chart-foot { display: flex; justify-content: space-between; gap: var(--gx-space-2); margin: 0; }
.gx .gx-nest-more {
  display: flex; align-items: center; justify-content: space-between; gap: var(--gx-space-2); width: 100%;
  min-height: 48px; padding: 0 var(--gx-space-4); border: 0; border-radius: var(--gx-radius-md); cursor: pointer;
  background: var(--gx-surface-2); color: var(--gx-text-1); font: 700 15px/20px var(--gx-font-body); text-align: left;
}
```

Check that `--gx-space-3` and `--gx-space-4` exist in `web/src/next/styles/tokens.css`. If they don't, use the nearest
defined `--gx-space-*`.

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx tests/next-trends-ui.test.jsx`
  Expected: the new cases pass. Fix any existing case that still asserts a record or a meter on a tile; the old
  record-on-tile is replaced by the win rate, and the record moves to the chart card.

- [ ] **Step 6: Commit**

```bash
git add web/src/next/trends/TrendLayer.jsx web/src/next/ui/nest.css web/src/next/trends/TeamsNest.jsx tests/next-trends-nest.test.jsx
git commit -m "Trends: glass tile with one win rate, the hero, and one glass chart card for an opened trend (D-75)"
```

### Task 3: the weekList address

**Files:**
- Modify: `web/src/next/shell/router.js:10` (the Trends keys)
- Modify: `web/src/next/shell/state.js:39` and `:92` (the trends step list and `ROUTE_KEYS`)
- Test: `tests/next-trends-nest.test.jsx` (the "addresses" describe)

**Interfaces:**
- Produces: the `weekList` view key ('all' or null), kept by the router and counted as a navigation step.

- [ ] **Step 1: Write the failing test.** Add to `describe('addresses: …')`:

```jsx
  it('the router keeps weekList and opening All trends is a step back closes (D-75)', () => {
    const fragment = fragmentFor('research', { section: 'trends' }, { trends: { trendSection: 'week', weekList: 'all' } });
    expect(fragment).toContain('weekList=all');
    expect(placeFromFragment(fragment).adapters.trends).toMatchObject({ weekList: 'all' });
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'trends' } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'trends', patch: { weekList: 'all' } });
    expect(state.trail.length).toBe(trail + 1);
    state = reduce(state, { type: 'back' });
    expect(state.views.trends.weekList ?? null).toBeNull();
  });
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "weekList"`
  Expected: FAIL. The fragment drops `weekList`.

- [ ] **Step 3: Implement.**
  - In `router.js` line 10, append `'weekList'` after `'weekTrend'` in the Trends key list.
  - In `state.js` line 39, append `'weekList'` to the list `['teamsTeam', …, 'weekTrend']`.
  - In `state.js` line 92 `ROUTE_KEYS`, append `'weekList'` after `'weekTrend'`.

- [ ] **Step 4: Run it and see it pass, along with the router tests.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "addresses"` and
  `node --test --test-reporter=tap tests/next-router.test.mjs`
  Expected: PASS, with `# skipped 0` for the node run.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/shell/router.js web/src/next/shell/state.js tests/next-trends-nest.test.jsx
git commit -m "Trends: weekList=all is a Trends address and a navigation step (D-75)"
```

### Task 4: This Week — the hero, two tiles, All trends

**Files:**
- Modify: `web/src/next/trends/WeekNest.jsx`
- Test: `tests/next-trends-nest.test.jsx` (the "This Week layers" describe)

**Interfaces:**
- Consumes: `TrendHero`, `TrendTile` (task 2) and `weekList` (task 3).
- Produces: the first card's `[data-hero]` hero, a `.gx-nest-grid` of the next two tiles, and a `.gx-nest-more`
  button named "All N trends this week" when there are more than three. The All trends layer has the title
  "All trends" and the lip "Back to This week".

- [ ] **Step 1: Write the failing tests.** In the "This Week layers" describe, add a week builder with four cards
  and two tests:

```jsx
  const many = () => {
    const week = weekOf();
    week.cards = Object.fromEntries(['c1', 'c2', 'c3', 'c4'].map((id, i) => [id, { ...card, title: `Trend ${i + 1}: ATS`, score: { score: 90 - i }, record: { W: 30 - i, L: 20, P: 0 } }]));
    week.games[0].tier2 = ['c1', 'c2', 'c3', 'c4'].map(id => ({ card: id }));
    return week;
  };
  it('This week leads with one hero, then two tiles, then All N trends this week (D-75)', () => {
    const html = show({}, { week: many() });
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).filter(n => n.attrs?.['data-hero'] !== undefined)).toHaveLength(1);
    const more = nodes(html).find(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-more'));
    expect(nameFrom(more)).toContain('All 4 trends this week');
    for (const sentence of surfaceSentences(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('All trends: a lip back to This week and every trend as a glass tile (D-75)', () => {
    const html = show({ weekList: 'all' }, { week: many() });
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual(['Back to This week']);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('All trends');
    expect(nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-tile--glass') && n.attrs?.['data-trend'])).toHaveLength(4);
  });
```

Change the existing case `'This week: the top trend, …'` to expect the hero: `expect(nodes(html).some(n =>
n.attrs?.['data-hero'] !== undefined)).toBe(true)`. With one card there is no `gx-nest-more` button.

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "This Week"`
  Expected: FAIL. There is no `data-hero` and no All trends layer.

- [ ] **Step 3: Implement `WeekNest.jsx`.** Import `TrendHero` beside `TrendTile`. After the `card` constant, compute
  the ranked list once, and use it for both the first card and the All trends layer:

```jsx
  const ranked = games.flatMap(({ v, cards }) => cards.map(card => ({ card, v }))).sort(strongest);
  const toWeek = { key: 'week', label: 'This week', onOpen: () => onChange({ weekGame: null, weekTrend: null, weekList: null }) };
  const openTrend = (v, c) => onChange({ weekList: null, weekGame: v.id, weekTrend: trendSlug(c.key) });
  const titled = (c, v) => ({ ...c, title: short(v) + ' · ' + c.title });
```

Replace the old `toWeek` with this one. Before the `if (game)` branch, add the All trends layer:

```jsx
  if (!game && view.weekList === 'all') {
    return <Nest label="Week trends" layer="all" title="All trends" lips={[toWeek]}>
      <p className="gx-t-meta">{ranked.length} {ranked.length === 1 ? 'trend' : 'trends'} · strongest first</p>
      {ranked.length ? <ul className="gx-nest-grid" aria-label="All trends this week">
        {ranked.map(({ card: c, v }) => <TrendTile key={v.id + c.key} card={titled(c, v)} rules={v.rules} onOpen={() => openTrend(v, c)}/>)}
      </ul> : <p className="gx-t-body">No qualifying trend this week.</p>}
    </Nest>;
  }
```

Replace the old `top` constant and the "Weekly highlights" section with:

```jsx
  const [hero, ...pair] = ranked.slice(0, 3);
```

```jsx
    {hero && <section className="gx-vstack gx-gap-8" aria-label="Weekly highlights">
      <h3 className="gx-t-label gx-c-2">Top trends</h3>
      <ul className="gx-nest-list"><TrendHero card={titled(hero.card, hero.v)} rules={hero.v.rules} onOpen={() => openTrend(hero.v, hero.card)}/></ul>
      {pair.length ? <ul className="gx-nest-grid">{pair.map(({ card: c, v }) => <TrendTile key={v.id + c.key} card={titled(c, v)} rules={v.rules} onOpen={() => openTrend(v, c)}/>)}</ul> : null}
      {ranked.length > 3 && <button type="button" className="gx-nest-more" onClick={() => onChange({ weekList: 'all' })}>
        <span>All {ranked.length} trends this week</span><Icon icon="chevronRight" size={20}/></button>}
    </section>}
```

Add `gx-nest-tile--glass` to the game tile button's `className`. Keep the info text's "at most three" line; it is
still true for the first card.

- [ ] **Step 4: Run them and see them pass.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx tests/next-trends-ui.test.jsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/trends/WeekNest.jsx tests/next-trends-nest.test.jsx
git commit -m "Trends › This Week: one hero, two tiles and an All trends layer (D-75)"
```

### Task 5: Teams — two and a fold, and glass landing tiles

**Files:**
- Modify: `web/src/next/trends/TeamsNest.jsx`
- Test: `tests/next-trends-nest.test.jsx` (the TeamsNest describe)

**Interfaces:**
- Consumes: `TrendTile` (task 2), `winRateText` (task 1), `sinceText`.
- Produces: the team layer's first two trend tiles, then a `.gx-nest-more` button `N more <CODE> trends` with
  `aria-expanded` and `aria-controls`, followed by a list holding the rest only while expanded. The landing tiles are
  glass, with the mark, the role, the venue win rate and "N games".

- [ ] **Step 1: Write the failing tests.** In the TeamsNest describe:
  - Change the landing case `'Teams: one tile per team with its mark, one number and a meter; …'`: its tiles are glass,
    tile GB's name contains `71.4%` and `7 games`, and the html has no `gx-nest-meter`.
  - Add this case:

```jsx
  it('one team: two trends, then N more in place behind aria-expanded (D-75)', () => {
    const html = render({ teamsTeam: 'GB' });
    expect(markupProblems(html)).toEqual([]);
    const shown = nodes(html).filter(n => n.tag === 'button' && n.attrs?.['data-trend'] && n.attrs['data-trend'] !== 'locked');
    expect(shown).toHaveLength(2);
    const more = nodes(html).find(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-more'));
    expect(more.attrs['aria-expanded']).toBe('false');
    expect(nameFrom(more)).toBe('1 more GB trend');
  });
```

The fixture's GB has three spread trends: GB_ATS, GB_SU and COACH.

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx -t "TeamsNest"`
  Expected: FAIL.

- [ ] **Step 3: Implement `TeamsNest.jsx`.**
  - Imports:

```jsx
import { useId, useState } from 'react';
import { sinceText } from '../../../../shared/trends-view.mjs';
import { trendAvailabilityText } from '../../trendsAvailability.js';
import { Icon, InfoButton, Nest, TeamMark } from '../ui/index.js';
import { INFO } from '../info.js';
import { nestTeams, nestTeamTrends, trendShare, winRateText } from './teamNest.js';
import { GameDetailsButton, LineLockTile, trendSlug, trendLayer, TrendTile } from './TrendLayer.jsx';
```

  - At the top of `TeamsNest`, before any `return`:

```jsx
  const [openFor, setOpenFor] = useState(null), restId = useId();
```

  - Replace the team layer's list:

```jsx
    const more = shown.length - 2, open = openFor === team.code;
    const tile = c => <TrendTile key={c.key} card={c} rules={v.rules} onOpen={() => onChange({ teamsTrend: trendSlug(c.key) })}/>;
    return <Nest label="Team trends" layer={'team:' + team.code} title={team.name} lips={[toTeams]}>
      <p className="gx-t-meta">{v.title} · {v.when}</p>
      {shown.length || locks.length ? <ul className="gx-nest-grid" aria-label={team.name + ' trends'}>
        {locks.map(gate => <LineLockTile key={'lock:' + gate} market={gate} rules={v.rules}/>)}
        {shown.slice(0, 2).map(tile)}
      </ul> : <p className="gx-t-body">No team trend in this market.</p>}
      {more > 0 && <button type="button" className="gx-nest-more" aria-expanded={open} aria-controls={restId} onClick={() => setOpenFor(open ? null : team.code)}>
        <span>{more} more {team.code} {more === 1 ? 'trend' : 'trends'}</span><Icon icon={open ? 'chevronUp' : 'chevronDown'} size={20}/></button>}
      {more > 0 && open ? <ul id={restId} className="gx-nest-grid" aria-label={`More ${team.name} trends`}>{shown.slice(2).map(tile)}</ul> : null}
      <GameDetailsButton view={v}/>
    </Nest>;
```

  If `Icon` has no `chevronUp`, use `chevronDown` with `aria-hidden` and rely on `aria-expanded`.

  - Replace the landing tile button's children:

```jsx
      {teams.map(t => <li key={t.code}><button type="button" className="gx-nest-tile gx-nest-tile--glass" data-team={t.code} onClick={() => onChange({ teamsTeam: t.code, teamsTrend: null })}>
        <span className="gx-nest-tile-top"><TeamMark code={t.code} name={t.name} size={32}/><span className="gx-t-meta">{t.role === 'home' ? 'Home' : 'Road'}</span></span>
        <span className="gx-n-m gx-nest-num">{t.headline && !t.headline.locked ? winRateText(t.share) : '—'}</span>
        <span className="gx-t-meta">{t.headline && !t.headline.locked ? `${(t.headline.games ?? 0).toLocaleString('en-US')} games` : 'No record'}</span>
      </button></li>)}
```

  - Replace the landing meta line:

```jsx
    <p className="gx-t-meta">{market === 'total' ? 'Overs' : 'Covers'} at this week’s venue · {sinceText(teams.find(t => t.headline && !t.headline.locked)?.headline.years)}</p>
```

  - Remove the `NestMeter` and `shareWords` imports.

- [ ] **Step 4: Run them and see them pass.**
  Run: `npx vitest run tests/next-trends-nest.test.jsx tests/next-trends-ui.test.jsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/trends/TeamsNest.jsx tests/next-trends-nest.test.jsx
git commit -m "Trends › Teams: two trends and a fold, and glass win-rate landing tiles (D-75)"
```

### Task 6: browser specs, captures, record

**Files:**
- Modify: `tests/cloud-browser/next-trends.spec.js` (the D-66 Teams and This Week block, about lines 236–300)
- Modify: `docs/COMPLETION_REGISTER.md` (a new D-75 entry at the top)
- Capture (not committed): `.local/` captures for Sean

- [ ] **Step 1: Update the spec.**
  - In the opened team trend, replace `await expect(nest.locator('.gx-pill').first()).toBeVisible();` with
    `await expect(nest.locator('[data-trend-chart]')).toBeVisible();`.
  - After `await nest.locator('[data-team=CAR]').click();` and the heading check, add the fold check:

```js
  const moreTrends = nest.locator('button.gx-nest-more');
  if (await moreTrends.count()) {
    await expect(moreTrends).toHaveAttribute('aria-expanded','false');
    await moreTrends.click();
    await expect(moreTrends).toHaveAttribute('aria-expanded','true');
  }
```

  - After `await week.getByRole('button',{name:'Back to This week',exact:true}).click();` (the last one before the
    Teams section), add the All trends check:

```js
  const allTrends = week.locator('button.gx-nest-more');
  if (await allTrends.count()) {
    await allTrends.click();
    await expect(week.getByRole('heading',{level:2,name:'All trends',exact:true})).toBeFocused();
    await expect(page).toHaveURL(/weekList=all/);
    for (const width of [390,320]) { await page.setViewportSize({width,height:844}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); expect((await new AxeBuilder({page}).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]); }
    await page.setViewportSize({width:390,height:844});
    await week.getByRole('button',{name:'Back to This week',exact:true}).click();
  }
```

- [ ] **Step 2: Run the browser specs on a private port.**
  - Create the throwaway config (do not commit it):
    `sed -e 's/5198/5299/g' -e "s#cloud-browser-results'#cloud-browser-results-5299'#" -e 's#cloud-test-dist#cloud-test-dist-5299#g' playwright.cloud.config.js > playwright.capture.config.js`
  - Run: `npx playwright test --config playwright.capture.config.js tests/cloud-browser/next-trends.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-phone-layout.spec.js`
  - Expected: every test passes and none is skipped.

- [ ] **Step 3: Run the wider checks.**
  Run: `npx vitest run`, then `node --test --test-reporter=tap tests/next-router.test.mjs tests/next-tokens.test.mjs tests/trends-view.test.mjs`,
  then `npm run typecheck` and `PYTHONUTF8=1 python scripts/check-brand-docs.py`.
  Expected: everything passes, with `# skipped 0` on the node runs.

- [ ] **Step 4: Capture for Sean.**
  - Write a throwaway spec, `tests/cloud-browser/zz-capture-d75.spec.js` (not committed), from the first 62 lines of
    `next-trends.spec.js`.
  - It saves 390px Light and Dark captures of This Week, All trends, Teams › CAR (folded and open) and one opened
    trend to the scratchpad.
  - Send them to Sean with SendUserFile, then delete the throwaway files.

- [ ] **Step 5: Record the work and commit.** Add a register entry at the top of `docs/COMPLETION_REGISTER.md`:

```markdown
## Trends glass tiles (D-75) — November 3, 2026

Sean chose "5 · Top three, rest folded" for the Trends tiles and chart ([D-75](DECISIONS.md),
[spec](superpowers/specs/2026-11-03-trends-glass-tiles-design.md)). Built on `claude/trends-glass-tiles`:
- glass tiles with one win rate (W/(W+L), one decimal) and "N games · since YYYY";
- This Week's hero, two tiles and the All trends layer (`weekList=all`);
- a team's two trends and a fold, and glass Teams landing tiles;
- one glass chart card for an opened trend.

Local checks pass. Not released: Sean's OK on the 390px captures comes first.
```

Then commit:

```bash
git add tests/cloud-browser/next-trends.spec.js docs/COMPLETION_REGISTER.md
git commit -m "Trends D-75: browser checks for All trends and the team fold; register entry"
```

- [ ] **Step 6: Push, update PR #463's description to cover the build, and run `npm run sync:check`.**
