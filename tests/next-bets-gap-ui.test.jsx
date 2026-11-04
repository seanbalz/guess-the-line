// D-69 step 4: Bets › Your gap drawn from a fixed state (GapList and GapHero draw what `gap` holds). Contracts: D-77's hero
// is the first card with its approved words, dots and About toggle; the market switch; four tiles; the ranked rows as
// picture rows (marks first, a stable id, the % over its word); Show all names its count; your card's unsaved
// selections; your virtual card with its count and week; an older week is view only; the Refresh lines button says
// Refreshing… and is busy while a read is on its way; the title is focusable for the navigation that opens it.
// One gap's layer (GapLayer, GapReview, GapTrends): its heading names the game and market from the item, under the Your
// gap lip; both sides with their words (D-54's traffic lights, text-labelled), the suggested side's saved quote or why it
// has none, Track this bet and Play with Virtual Units; the review keeps the reviewed quote and shows a newer one apart,
// taken only through Use updated quote; units change only the stake; at kickoff by the server's clock the review is
// closed and keeps its terms; a market locked in a newer read shows its lock sentence and no controls (D-36); the
// trends show the actual record, sample, years and credit, never a forecast.
// Your gap's screen (the default export, the state owner): a missing or unknown market preference is All; a week change
// with unsaved selections asks through the shell's leave guard; a gap address draws its layer, a direct load mounts no
// hidden list under it, any other item draws the list; a row opens its gap and the lip closes it through Bets'
// addresses; every row that opens a gap has its own stable id (Back returns focus to it by that id).
import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn(() => new Promise(() => {})) }));
// The screen's three inputs, set per test: the gap state, the shell and the account (useGap's own rules are its own).
const screen = vi.hoisted(() => ({ gap: null, shell: null, args: null }));
vi.mock('../web/src/next/bets/gap/useGap.js', () => ({ useGap: args => { screen.args = args; return screen.gap; } }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: '00000000-0000-4000-8000-000000000003', requestSignIn: () => {} }) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => screen.shell }));
const { default: YourGap, GapList } = await import('../web/src/next/bets/gap/YourGap.jsx');
const { GapLayer } = await import('../web/src/next/bets/gap/GapLayer.jsx');
const { GapReview } = await import('../web/src/next/bets/gap/GapReview.jsx');
const { GapTrendsView } = await import('../web/src/next/bets/gap/GapTrends.jsx');
const { GapHero } = await import('../web/src/next/bets/gap/GapHero.jsx');

const now = Date.parse('2099-10-08T17:00:00Z');
const game = (id, away, home) => ({ id, awayCode: away, homeCode: home, kickoff: '2099-10-08T20:00:00Z', offers: {}, locked: {} });
const ref = { value: -3.5, books: 3, observedAt: '2099-10-08T15:00:00Z' };
const ranked = id => ({ key: `${id}:spread`, game: game(id, ...id.split('-')), market: 'spread', guess: -10, gap: 6.5, gapPercent: 185.7, side: 'home', reference: ref, offer: { line: -3.5 }, savedPick: null, actionable: true, evaluations: {} });
const rows = ['SEA-DEN', 'HOU-JAX', 'KC-BUF', 'LAR-SF'].map(ranked);
const record = { wins: 5, losses: 2, pushes: 0, netUnits: 2.55, favorable: { wins: 4, losses: 2, pushes: 0 }, notGraded: { noFinal: 0, noLine: 0 },
  graded: [{ gameId: 'SEA-DEN', market: 'spread', outcome: 'win' }, { gameId: 'HOU-JAX', market: 'spread', outcome: 'loss' }] };
const gap = (patch = {}) => ({ data: { season: 2099, week: 5, games: rows.map(r => r.game), picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'pending', selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] },
  info: { publishedWeek: { season: 2099, week: 5 }, slates: [{ season: 2099, week: 5 }, { season: 2099, week: 4 }] }, now, loading: false, busy: false, error: '', notice: '',
  selections: { 'NYJ-BUF:total': { gameId: 'NYJ-BUF', market: 'total', side: 'over', units: 2, offer: { line: 44.5, odds: -110, source: 'BetMGM', observedAt: ref.observedAt }, game: game('NYJ-BUF', 'NYJ', 'BUF') } },
  uncertain: null, expanded: false, historical: false, ranked: { status: 'ready', rows, counts: { locked: 1, missingReference: 0 } },
  shown: { rows, visible: rows.slice(0, 3) }, gaps: record, picks: {}, canTrack: true, setExpanded: vi.fn(), refresh: vi.fn(), changeWeek: vi.fn(), ...patch });
const draw = (state = gap()) => renderToStaticMarkup(<div className="gx"><GapList gap={state} market="all" messages onMarket={vi.fn()} onOpen={vi.fn()}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Your gap', () => {
  const html = draw();
  it('keeps the kit markup rules; its title is Your gap, focusable', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Your gap', '-1', true]);
    // The title's ⓘ is named for the screen it explains (the old "About your guess vs. market" named the old row).
    expect(nodes(html).find(n => n.tag === 'button' && n.attrs['aria-haspopup'] === 'dialog').attrs['aria-label']).toBe('About gap ranking');
    // ...and never the near twin of D-77's fixed "About your gaps" toggle a few elements below.
    expect(nodes(html).filter(n => n.tag === 'button' && /^About your gaps?$/.test(nameFrom(n) ?? '')).map(nameFrom)).toEqual(['About your gaps']);
  });
  it('D-77’s hero is the first card: the rate, the record, one dot per gap, the About toggle', () => {
    const list = nodes(html).find(n => n.attrs?.['data-gap'] === 'list');
    const first = list.children.find(n => n.tag);
    expect([first.attrs['aria-label'], first.attrs['data-gap']]).toEqual(['Your gaps vs. closing lines', 'hero']);
    for (const text of ['Your gaps · Week 5', '71.4%', 'beat the close', '5–2 · +2.55U at −110']) expect(textOf(first)).toContain(text);
    expect(nodes(html).filter(n => n.attrs?.['data-outcome']).map(n => [n.attrs['data-outcome'], n.attrs['aria-label']])).toEqual([['win', 'SEA at DEN spread: Win'], ['loss', 'HOU at JAX spread: Loss']]);
    expect(nodes(html).find(n => n.tag === 'button' && nameFrom(n) === 'About your gaps').attrs['aria-expanded']).toBe('false');
    expect(html).not.toContain('a paper record, not bets placed');
  });
  it('the market switch, four tiles, the top three as picture rows, and Show all with its count', () => {
    expect(nodes(html).some(n => n.attrs?.role === 'group' && n.attrs['aria-label'] === 'Recommendation market')).toBe(true);
    expect(nodes(html).filter(n => n.attrs?.['data-gap-tile']).map(n => n.attrs['data-gap-tile'])).toEqual(['act', 'gaps', 'top', 'card']);
    const gapRows = nodes(html).filter(n => n.attrs?.['data-gap-row']);
    expect(gapRows.map(n => [n.attrs['data-gap-row'], n.attrs.id])).toEqual([['SEA-DEN:spread', 'gx-b-gap-SEA-DEN-spread'], ['HOU-JAX:spread', 'gx-b-gap-HOU-JAX-spread'], ['KC-BUF:spread', 'gx-b-gap-KC-BUF-spread']]);
    expect(/\bgx-prow-pic\b/.test(gapRows[0].children[0].attrs?.class ?? '')).toBe(true);
    expect(textOf(gapRows[0])).toContain('6.5 pt gap');
    expect(html).toContain('Top 3 to act on');
    expect(html).toContain('4 gaps · Week 5');
    expect(nodes(html).some(n => n.tag === 'button' && textOf(n) === 'Show all 4 differences')).toBe(true);
  });
  it('one gap says "1 gap", never "1 gaps"; a left-out note names missing lines too', () => {
    const one = draw(gap({ shown: { rows: rows.slice(0, 1), visible: rows.slice(0, 1) }, ranked: { status: 'ready', rows, counts: { locked: 0, missingReference: 2 } } }));
    expect(one).toContain('1 gap · Week 5');
    expect(one).not.toContain('1 gaps');
    expect(one).toContain('Drafts, locked markets, started games and missing lines are left out.');
  });
  it('your card lists an unsaved selection whose row is not shown; your virtual card counts its picks', () => {
    const card = nodes(html).find(n => n.attrs?.['data-gap'] === 'your-card');
    expect(textOf(card)).toContain('Over 44.5 · −110 · 2U · BetMGM');
    const saved = nodes(html).find(n => n.attrs?.['data-gap'] === 'saved-card');
    expect(saved.attrs['aria-label']).toBe('Your virtual card');
    for (const text of ['1 saved · Week 5', 'Over 44.5 · −110 · 1U · BetMGM', 'Pending']) expect(textOf(saved)).toContain(text);
    expect(nodes(html).find(n => n.tag === 'select').attrs['aria-label']).toBe('Recommendation week');
  });
  it('an older week is view only: no rows, no placement', () => {
    const older = draw(gap({ historical: true }));
    expect(older).toContain('View only · older week');
    expect(nodes(older).filter(n => n.attrs?.['data-gap-row'])).toHaveLength(0);
  });
  it('Refresh lines says Refreshing… and is busy while a read is on its way, with the rows’ skeleton', () => {
    const busy = draw(gap({ data: null, loading: true, gaps: null }));
    const button = nodes(busy).find(n => n.tag === 'button' && nameFrom(n) === 'Refreshing…');
    expect(button.attrs['aria-busy']).toBe('true');
    expect(nodes(busy).find(n => n.attrs?.['data-skeleton'] === 'rows').attrs.class).toContain('gx-gap-skel');
  });
  it('the hero with nothing graded says so', () => {
    const empty = renderToStaticMarkup(<div className="gx"><GapHero record={{ ...record, graded: [] }} week={5}/></div>);
    expect(empty).toContain('No finished games with a gap yet.');
  });
});

// A component tree walked for its controls (kit components included), so a press calls the handler it was given.
function controls(node, found = []) {
  if (Array.isArray(node)) { node.forEach(child => controls(child, found)); return found; }
  if (!isValidElement(node)) return found;
  if (typeof node.props?.onClick === 'function') found.push(node);
  controls(node.props?.children, found);
  return found;
}
const said = node => Array.isArray(node) ? node.map(said).join('') : isValidElement(node) ? said(node.props.children) : node == null || node === false ? '' : String(node);
const press = (tree, name) => { const hit = controls(tree).find(c => c.props.label === name || c.props['aria-label'] === name || said(c.props.children) === name); if (!hit) throw new Error(`No ${name}`); hit.props.onClick(); };

describe('one gap’s layer', () => {
  const reviewed = { book: 'draftkings', source: 'DraftKings', line: -11.5, odds: -110, observedAt: '2099-10-08T15:00:00.000Z' };
  const newer = { book: 'fanduel', source: 'FanDuel', line: -10.5, odds: -105, observedAt: '2099-10-08T16:00:00.000Z' };
  const tbDal = { id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: '2099-10-08T20:00:00.000Z', locked: { spread: false }, offers: { spread: { home: newer, away: { ...newer, line: 10.5 } } } };
  const selection = { gameId: 'TB-DAL', market: 'spread', side: 'home', units: 1.5, offer: reviewed, game: tbDal };
  const review = (patch = {}) => { const state = { ...gap(), choose: vi.fn(), changeUnits: vi.fn(), save: vi.fn(), remove: vi.fn(), ...patch }; return { state, tree: GapReview({ gap: state, game: tbDal, market: 'spread', selection, pick: null }) }; };
  it('keeps the reviewed quote and shows a newer one apart, taken only through Use updated quote', () => {
    const html = renderToStaticMarkup(<div className="gx">{review().tree}</div>);
    expect(html).toContain('Your selected quote: DAL −11.5 · −110 · 1.5U · DraftKings');
    expect(html).toContain('Updated quote: DAL −10.5 · −105 · FanDuel');
    const { state, tree } = review();
    press(tree, 'Use updated quote');
    expect(state.choose).toHaveBeenCalledWith(tbDal, 'spread', 'home', 1.5);
    expect(state.changeUnits).not.toHaveBeenCalled();
  });
  it('changes only the units from every unit control', () => {
    const { state, tree } = review();
    press(tree, '2 units'); press(tree, 'Increase units'); press(tree, 'Decrease units');
    expect(state.changeUnits.mock.calls).toEqual([['TB-DAL:spread', 2], ['TB-DAL:spread', 2], ['TB-DAL:spread', 1]]);
    expect(state.choose).not.toHaveBeenCalled();
  });
  it('at kickoff by the server’s clock it is closed: the terms stay, Remove from card, no placement', () => {
    const html = renderToStaticMarkup(<div className="gx">{review({ now: Date.parse('2099-10-08T20:00:01Z') }).tree}</div>);
    expect(html).toContain('Closed · Kickoff reached');
    expect(html).toContain('DAL −11.5 · −110 · 1.5U · DraftKings');
    expect(html).toContain('Remove from card');
    expect(html).not.toContain('Place virtual pick');
  });
  it('a market locked in a newer read shows its lock sentence and no controls (D-36)', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapReview gap={gap()} game={{ ...tbDal, locked: { spread: true } }} market="spread" selection={selection} pick={null}/></div>);
    expect(html).toContain('to see this line.');
    expect(html).not.toContain('Place virtual pick');
  });
  it('the layer: its title from the item, the Your gap lip, both sides with their words, the actions, and the old card’s words', () => {
    const evaluations = { away: { side: 'away', advantage: 1, color: 'green', label: 'Favorable', offer: null }, home: { side: 'home', advantage: -1, color: 'red', label: 'Against your guess', offer: null } };
    const row = { ...rows[0], key: 'SEA-DEN:spread', reference: { ...ref, value: -2 }, denominator: 3, evaluations, offer: null, actionable: false };
    const html = renderToStaticMarkup(<div className="gx"><GapLayer gap={gap({ ranked: { status: 'ready', rows: [row], counts: {} } })} item="SEA-DEN:spread" onClose={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('Seahawks @ Broncos · Spread');
    expect(html).toContain('Back to </span>');
    for (const text of ['Latest consensus', '3-point minimum spread', 'No usable named-book quote', 'Track this bet', 'Play with Virtual Units']) expect(html).toContain(text);
    expect(nodes(html).filter(n => n.attrs?.['data-side']).map(n => [n.attrs['data-side'], n.attrs['data-value-color'], textOf(n).includes(n.attrs['data-value-color'] === 'green' ? 'Favorable' : 'Against your guess')]))
      .toEqual([['away', 'green', true], ['home', 'red', true]]);
  });
  it('the trends: the actual record, sample, years and credit, never a forecast', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapTrendsView trend={{ status: 'ready', reference: 'Historical schedule through 2026', cards: [{ key: 'past', title: 'Past home games', record: '8–4–0', sample: '12 games', years: [2018, 2026] }] }}/></div>);
    for (const text of ['8–4–0', '12 games', '2018–2026', 'not forecasts', 'CC BY 4.0']) expect(html).toContain(text);
  });
  it('the trends while they load: rows in their final shape, the words kept for screen readers (D-69 4.5)', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapTrendsView trend={{ status: 'loading', cards: [] }}/></div>);
    expect(nodes(html).find(n => n.attrs?.['data-skeleton'] === 'rows')).toBeTruthy();
    expect(html).toContain('Loading historical trends…');
  });
});

describe('Your gap’s screen: the state owner for the list and one gap’s layer', () => {
  const at = bets => { screen.shell = { state: { views: { bets } }, setView: vi.fn(), confirmLeave: vi.fn(() => false) }; screen.gap = gap({ shown: { rows: [], visible: [] }, ranked: { status: 'ready', rows: [], counts: {} } }); };
  const draw = bets => { at(bets); return renderToStaticMarkup(<div className="gx"><YourGap onDirty={() => {}} onSaved={() => {}} onTrackTicket={() => {}}/></div>); };
  it('a missing or unknown market preference is All: the empty list never says "No undefined differences"', () => {
    for (const recommendedMarket of [undefined, 'moneyline']) {
      const html = draw({ view: 'recommended', recommendedMarket });
      expect(screen.args.market).toBe('all');
      expect(html).toContain('No differences to show yet.');
      expect(html).not.toContain('undefined');
    }
    draw({ view: 'recommended', recommendedMarket: 'total' });
    expect(screen.args.market).toBe('total');
  });
  it('a week change with unsaved selections asks through the shell’s leave guard, never a silent yes', () => {
    draw({ view: 'recommended' });
    expect(screen.args.confirm()).toBe(false);
    expect(screen.shell.confirmLeave).toHaveBeenCalledTimes(1);
  });
  it('a gap address draws its layer; a direct load mounts no hidden list under it; any other item draws the list', () => {
    const layer = draw({ view: 'recommended', layer: 'gap', item: 'SEA-DEN:spread' });
    expect(layer).toContain('data-bets-layer="gap"');
    expect(layer).toContain('data-gap-item="SEA-DEN:spread"');
    expect(layer).not.toContain('data-bets-section="gap"');
    expect(layer).toContain('This gap is not on your list now.');
    const list = draw({ view: 'recommended', layer: 'gap', item: 'SEA-DEN:moneyline' });
    expect(list).not.toContain('data-bets-layer');
    expect(list).toContain('data-bets-section="gap"');
  });
  it('a row opens its gap, the lip closes it, and the market is a Bets view preference', () => {
    at({ view: 'recommended', layer: 'gap', item: 'SEA-DEN:spread' });
    const tree = YourGap({ onDirty: () => {}, onSaved: () => {}, onTrackTicket: () => {} });
    tree.props.children.props.onOpen('KC-BUF:total');
    tree.props.layer.props.onClose();
    tree.props.children.props.onMarket('spread');
    expect(screen.shell.setView.mock.calls).toEqual([['bets', { layer: 'gap', item: 'KC-BUF:total' }], ['bets', { layer: undefined, item: undefined }], ['bets', { recommendedMarket: 'spread' }]]);
  });
  it('every row that opens a gap has its own stable id, so Back returns focus to the row that opened it', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapList gap={gap()} market="all" onMarket={vi.fn()} onOpen={vi.fn()}/></div>);
    const openers = nodes(html).filter(n => n.attrs?.['data-gap-row'] || n.attrs?.['data-gap-card']);
    expect(openers.map(n => n.attrs.id)).toEqual(['gx-b-gap-SEA-DEN-spread', 'gx-b-gap-HOU-JAX-spread', 'gx-b-gap-KC-BUF-spread', 'gx-b-gap-NYJ-BUF-total-card']);
    expect(openers.every(n => n.tag === 'button')).toBe(true);
  });
});
