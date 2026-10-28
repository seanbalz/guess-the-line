// Play's game feel (design upgrade), rendered statically: the native guess control against the classic ChipPicker it
// replaces (same values, states and names), the week progress card, the reveal list and Play's quiet states. Fixture
// games and players only; the server decides every state (tests/next-play-moments.test.mjs covers the rules).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
const { default: ChipPicker } = await import('../web/src/ChipPicker.jsx');
const { GuessPicker, GUESS_HELP } = await import('../web/src/next/play/GuessPicker.jsx');
const { CHIP_HELP } = await import('../web/src/ChipPicker.jsx');
const { WeekProgress } = await import('../web/src/next/play/WeekProgress.jsx');
const { RevealPicks } = await import('../web/src/next/play/RevealPicks.jsx');
const { PlayEmpty, PlayFailure, PlayLoading, failureLine } = await import('../web/src/next/play/PlayStates.jsx');
const { PerGameEditor } = await import('../web/src/next/play/PerGamePlay.jsx');
const { revealRows, weekProgress } = await import('../web/src/next/play/moments.js');

const nodes = html => [...walk(parseMarkup(html))];
const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
const CLASSIC = new Set(['chip', 'chip-picker', 'number-chip', 'team-chip', 'chip-summary', 'chip-row']);
const classicClasses = html => nodes(html).flatMap(n => (n.attrs?.class ?? '').split(/\s+/)).filter(name => CLASSIC.has(name));
const gx = element => renderToStaticMarkup(<div className="gx">{element}</div>);

/** What a player and a screen reader get from one picker: chips, checked values, pressed teams, names and words. */
function picture(html, classic) {
  const all = nodes(html);
  const radios = all.filter(n => n.attrs?.role === 'radio');
  const teams = all.filter(n => n.attrs?.['data-side'] !== undefined);
  const summary = all.filter(n => (n.attrs?.class ?? '').split(' ').includes(classic ? 'chip-summary' : 'gx-guess-summary'));
  return {
    values: radios.map(n => n.attrs['data-value']), checked: radios.filter(n => n.attrs['aria-checked'] === 'true').map(n => n.attrs['data-value']),
    radioNames: radios.map(textOf), teams: teams.map(n => [n.attrs['data-side'], n.attrs['aria-pressed'], n.attrs['aria-label'] ?? textOf(n)]),
    summary: summary.map(textOf), groups: all.filter(n => ['group', 'radiogroup'].includes(n.attrs?.role)).map(n => n.attrs['aria-label']),
    buttons: all.filter(n => n.tag === 'button' && !n.attrs.role && n.attrs['data-side'] === undefined).map(n => n.attrs['aria-label'] ?? textOf(n)),
  };
}

describe('GuessPicker replaces ChipPicker without changing what a guess is', () => {
  const cases = [
    ['guess_spread', ''], ['guess_spread', -3], ['guess_spread', 3.5], ['guess_spread', 0], ['guess_spread', -12.5], ['guess_spread', 0.5],
    ['guess_total', ''], ['guess_total', 44], ['guess_total', 47.5], ['guess_total', 3], ['guess_total', 199],
  ];
  it.each(cases)('%s %s: the same chips, checked value, pressed team, names and summary', (mode, value) => {
    const props = { mode, value, away: 'Buccaneers', home: 'Cowboys', teamLabels: { away: 'TB', home: 'DAL' }, label: 'TB at DAL guess', onChange: () => {} };
    const classic = renderToStaticMarkup(<ChipPicker {...props}/>), native = gx(<GuessPicker {...props}/>);
    expect(picture(native, false)).toEqual(picture(classic, true));
  });
  it('is drawn only with gx- classes and named controls; radios carry aria-checked and never aria-pressed', () => {
    const html = gx(<GuessPicker mode="guess_spread" value={-3} away="Buccaneers" home="Cowboys" teamLabels={{ away: 'TB', home: 'DAL' }} label="TB at DAL guess" onChange={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(classicClasses(html)).toEqual([]);
    const radios = nodes(html).filter(n => n.attrs?.role === 'radio');
    expect(radios.length).toBe(19); // 1 to 10 by half points; More holds 10.5 to 20.
    expect(radios.every(n => n.attrs['aria-pressed'] === undefined && ['true', 'false'].includes(n.attrs['aria-checked']))).toBe(true);
    // One Tab stop per row: the checked chip.
    expect(radios.filter(n => n.attrs.tabindex === '0').map(n => n.attrs['data-value'])).toEqual(['3']);
    expect(html).toContain('gx-chip--on');
  });
  it('a disabled picker disables every chip and stepper, as the classic one did', () => {
    const html = gx(<GuessPicker mode="guess_total" value={44} disabled away="Buccaneers" home="Cowboys" label="TB at DAL guess" onChange={() => {}}/>);
    expect(nodes(html).filter(n => n.tag === 'button').every(n => n.attrs.disabled !== undefined)).toBe(true);
  });
  it('keeps the classic help sentences word for word', () => {
    expect(GUESS_HELP).toEqual(CHIP_HELP);
  });
});

const NOW = Date.parse('2026-10-25T18:00:00Z');
const at = minutes => new Date(NOW + minutes * 60_000).toISOString();
const games = [
  { id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: at(-90) },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: at(-30) },
  { id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX', kickoff: at(60) },
  { id: 'KC-LV', awayCode: 'KC', homeCode: 'LV', kickoff: at(120) },
];
const ballot = { picks: { 'TB-DAL': -3 }, lockedAt: { 'TB-DAL': at(-200) } };

describe('week progress', () => {
  const progress = weekProgress({ games, ballot, picks: { 'TB-DAL': -3, 'SEA-DEN': -4, 'HOU-JAX': 2.5, 'KC-LV': '' }, now: NOW });
  const html = gx(<WeekProgress progress={progress} market="Spread" week={8} onNext={() => {}}/>);
  it('says "N of M locked", fills the kit Meter that far and draws one tile per game in kickoff order', () => {
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(parseMarkup(html))).toContain('1 of 4 locked');
    const segments = nodes(html).filter(n => /\bgx-meter3-seg\b/.test(n.attrs?.class ?? ''));
    expect(segments).toHaveLength(4);
    expect(segments.filter(n => /gx-meter3-seg--on/.test(n.attrs.class))).toHaveLength(1);
    expect(nodes(html).filter(n => n.attrs?.['data-state']).map(n => n.attrs['data-state'])).toEqual(['locked', 'kicked', 'draft', 'open']);
  });
  it('never relies on color alone: every tile has an icon and the legend says each state in words', () => {
    const tiles = nodes(html).filter(n => n.attrs?.['data-state']);
    expect(tiles.every(n => n.children.some(child => child.tag === 'svg'))).toBe(true);
    const legend = nodes(html).find(n => n.attrs?.['aria-label'] === 'Games by state');
    expect(legend.children.map(textOf)).toEqual(['1Locked', '1Draft', '1Open', '1Kicked off']);
    // D-62: the next game as marks inside the button, away first; the button's name still names the matchup.
    const next = nodes(html).find(n => n.tag === 'button' && /gx-play-next/.test(n.attrs.class));
    expect(nameFrom(next).trim()).toBe('Next to lock · Houston Texans at Jacksonville Jaguars');
    expect(matchups(html)).toEqual([{ srcs: [teamMarks.HOU.src, teamMarks.JAX.src], name: 'Houston Texans at Jacksonville Jaguars' }]);
  });
  it('a finished week has no next button, and an empty week draws nothing', () => {
    const done = weekProgress({ games: games.slice(0, 1), ballot, picks: {}, now: NOW });
    const finished = gx(<WeekProgress progress={done} market="Total" week={8}/>);
    expect(finished).toContain('Every game is locked in.');
    expect(finished).not.toContain('Next to lock');
    expect(gx(<WeekProgress progress={weekProgress({ games: [] })} market="Total" week={8}/>)).toBe('<div class="gx"></div>');
  });
});

describe('reveal', () => {
  const VIEWER = '00000000-0000-4000-8000-000000000001', TROY = '00000000-0000-4000-8000-000000000002', SEAN = '00000000-0000-4000-8000-000000000003';
  const reply = { viewer: VIEWER, season: 2026, week: 8, mode: 'guess_spread', games: [{ gameId: 'TB-DAL', open: true, started: true, rows: [
    { userId: VIEWER, status: 'in', lockedIn: true, pick: -3 }, { userId: TROY, status: 'in', lockedIn: true, pick: -2.5 },
    { userId: SEAN, status: 'late', lockedIn: true, pick: 1, late: { minutes: 12 } }, { userId: '00000000-0000-4000-8000-000000000004', status: 'in', lockedIn: true, pick: null, hidden: true },
  ] }] };
  const members = [{ id: TROY, displayName: 'Troy Fixture' }, { id: SEAN, displayName: 'Sean Fixture' }, { id: '00000000-0000-4000-8000-000000000004', displayName: 'Hidden Fixture' }];
  const reveal = revealRows(reply, VIEWER, members, 'TB-DAL');
  const html = gx(<RevealPicks accountId={VIEWER} season={2026} week={8} mode="guess_spread" game={games[0]} reveal={reveal} own={{ id: VIEWER, name: 'You', pick: -3 }} line={-2}/>);
  it('lists only the opened guesses, faces first, with the landing strip and the Late marker', () => {
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Troy Fixture'); expect(html).toContain('Sean Fixture');
    expect(html).not.toContain('Hidden Fixture');
    expect(html).toContain('Cowboys −2.5'); expect(html).toContain('Late · 12 min');
    expect(nodes(html).some(n => n.attrs?.role === 'img' && /3 guesses from Cowboys −3 to Buccaneers −1; your saved line is Cowboys −2/.test(n.attrs['aria-label']))).toBe(true);
  });
  it('rows the device has not drawn rise in one stagger step apart, after the strip', () => {
    const moving = nodes(html).filter(n => /\bgx-play-reveal-in\b/.test(n.attrs?.class ?? ''));
    expect(moving.map(n => n.attrs.style)).toEqual(['--gx-play-i:0', '--gx-play-i:1', '--gx-play-i:2']);
  });
  it('a game nobody else locked says so in one line', () => {
    const lonely = gx(<RevealPicks accountId={VIEWER} season={2026} week={8} mode="guess_spread" game={games[0]} reveal={{ open: true, rows: [], waiting: 2, satOut: 0 }} own={null} line={null}/>);
    expect(lonely).toContain('No one else has locked in this game · 2 not locked in.');
  });
});

describe('quiet states', () => {
  it('loading is a status, a failure an alert with Try again, empty one line', () => {
    const loading = gx(<PlayLoading>Loading your picks…</PlayLoading>);
    const failed = gx(<PlayFailure what="Your picks" error={{ status: 503, message: 'Picks are temporarily unavailable.' }} onRetry={() => {}}/>);
    const empty = gx(<PlayEmpty>No week is open yet.</PlayEmpty>);
    for (const html of [loading, failed, empty]) expect(markupProblems(html)).toEqual([]);
    expect(loading).toContain('role="status"');
    expect(failed).toContain('role="alert"'); expect(failed).toContain('Your picks could not be loaded. Picks are temporarily unavailable.'); expect(failed).toContain('Try again');
    expect(nodes(empty).filter(n => n.tag === 'p')).toHaveLength(1);
    expect(failureLine('Comparisons', { status: 0 })).toBe('Comparisons could not be loaded. No connection. Reconnect and try again.');
    expect(failureLine('Comparisons', null)).toBe('Comparisons could not be loaded.');
  });
});

describe('the per-game editor draws the native pieces', () => {
  const data = { season: 2026, week: 8, now: new Date(NOW).toISOString(), deadline: at(-120), revision: 1, weeklyRevision: 1,
    rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true }, games, ballots: { guess_spread: ballot },
    scoring: { guess_spread: { games: [{ gameId: 'TB-DAL', guess: -3, lockedIn: true, eligible: true, points: 8, reference: { value: -2, source: 'Synthetic median' } }] } } };
  const html = gx(<PerGameEditor accountId="00000000-0000-4000-8000-000000000001" initialData={data} mode="guess_spread"/>);
  it('progress at the top, a state pill on every card, and no classic chip markup', () => {
    expect(markupProblems(html)).toEqual([]);
    expect(html.indexOf('data-play="progress"')).toBeLessThan(html.indexOf('data-game='));
    expect(textOf(parseMarkup(html))).toContain('1 of 4 locked');
    const cards = nodes(html).filter(n => n.attrs?.['data-game']);
    expect(cards.map(n => n.attrs['data-state'])).toEqual(['locked', 'kicked', 'open', 'open']);
    expect(cards.map(card => [...walk(card)].filter(n => /\bgx-play-card-pill\b/.test(n.attrs?.class ?? '')).map(textOf)[0])).toEqual(['Locked in', 'Closed at kickoff', 'To pick', 'To pick']);
    expect(html).toContain('gx-guess');
    expect(classicClasses(html)).toEqual([]);
    // Nothing stamps or reveals on a first render: those wait for the server.
    expect(html).not.toContain('gx-play-stamp');
    expect(html).not.toContain('data-play="reveal"');
  });
});
