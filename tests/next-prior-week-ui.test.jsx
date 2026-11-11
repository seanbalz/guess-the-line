import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriorWeekCard, PriorWeekView, guessLine } from '../web/src/next/lines/PriorWeek.jsx';
import { priorWeekStillPlaying } from '../shared/prior-week.mjs';

vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({}), useSharedRead: () => ({}) }));
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
const rig = vi.hoisted(() => ({ asked: [], reply: null }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ go: vi.fn() }) }));
vi.mock('../web/src/next/lines/useGameLines.js', () => ({ useBoardLines: (lines, enabled) => { rig.asked.push({ shown: lines.shown, enabled }); return rig.reply ?? { status: 'loading', data: null, reload: () => {} }; } }));

// Fixture games shaped like `/lines/read`; Week 9's Monday night game while Week 10 is open.
const mine = (spread, total, points = null) => ({ spread: { guess: spread, lockedIn: true, points, lineAtGuess: { value: -4 } }, total: { guess: total, lockedIn: true, points, lineAtGuess: null } });
const MNF = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', kickoff: '2026-11-10T01:15:00.000Z', started: false, final: null, mine: mine(-4.5, 44) };
const view = (games, now) => priorWeekStillPlaying({ current: { season: 2026, week: 10 }, lines: { season: 2026, week: 9, games }, now: Date.parse(now) });

describe('Still playing from last week card', () => {
  it('shows the Monday night game, its kickoff and the locked guesses with the line at guess', () => {
    const html = renderToStaticMarkup(<PriorWeekView view={view([MNF], '2026-11-09T23:00:00.000Z')} onOpen={() => {}}/>);
    for (const text of ['Still playing from Week 9', 'MIA at GB', 'Kicks off Mon 5:15 PM PT', 'Spread GB −4.5 · Locked · Line at guess GB −4', 'Total 44 · Locked', 'data-prior-week="2026-9"', 'Open Week 9 picks']) expect(html).toContain(text);
    expect(html).not.toContain('LIVE');
  });
  it('says live, then final with the score and points', () => {
    expect(renderToStaticMarkup(<PriorWeekView view={view([{ ...MNF, started: true }], '2026-11-10T02:00:00.000Z')} onOpen={() => {}}/>)).toContain('LIVE');
    const final = { ...MNF, started: true, final: { status: 'final', away: 20, home: 23, observedAt: '2026-11-10T04:30:00.000Z' }, mine: mine(-4.5, 44, 8) };
    const html = renderToStaticMarkup(<PriorWeekView view={view([final], '2026-11-10T05:00:00.000Z')} onOpen={() => {}}/>);
    for (const text of ['FINAL', 'Final · MIA 20–GB 23', '8 pts']) expect(html).toContain(text);
  });
  it('draws nothing once the prior week is over', () => {
    expect(renderToStaticMarkup(<PriorWeekView view={null} onOpen={() => {}}/>)).toBe('');
  });
  it('words a missing guess without inventing one', () => {
    expect(guessLine({ away: 'MIA', home: 'GB', spread: { guess: null, lockedIn: false, points: null }, lineAtGuess: { spread: null } }, 'spread')).toBe('Spread · No guess');
  });
  it('reads the week before the viewer’s current week and shows it beside the current week', () => {
    const personal = { data: { season: 2026, week: 10, slates: [{ season: 2026, week: 10 }, { season: 2026, week: 9 }] } };
    rig.asked.length = 0;
    rig.reply = { status: 'ready', data: { season: 2026, week: 9, games: [MNF] }, now: Date.parse('2026-11-09T23:00:00.000Z'), reload: () => {} };
    const html = renderToStaticMarkup(<PriorWeekCard app={{ accountId: 'fixture' }} personal={personal}/>);
    expect(rig.asked.at(-1)).toEqual({ shown: { season: 2026, week: 9 }, enabled: true });
    expect(html).toContain('Still playing from Week 9');
    // With no earlier published week nothing is read and nothing shows.
    rig.reply = null;
    expect(renderToStaticMarkup(<PriorWeekCard app={{ accountId: 'fixture' }} personal={{ data: { season: 2026, week: 10, slates: [{ season: 2026, week: 10 }] } }}/>)).toBe('');
    expect(rig.asked.at(-1)).toEqual({ shown: null, enabled: false });
  });
});
