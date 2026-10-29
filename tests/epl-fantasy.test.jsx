// Research › Fantasy (EPL) screens (plan 2026-10-28-epl-fantasy.md, Task 3; spec sections 5 and 8): the four sub-tabs
// drawn from one `epl/fantasy/read` reply (cloud/epl-fantasy-view.mjs). Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { EplFantasyView, FANTASY_COPY, fantasyProblem } = await import('../web/src/next/epl/fantasy/EplFantasy.jsx');
const { MatchupPanel } = await import('../web/src/next/epl/fantasy/Matchup.jsx');
const { StandingsPanel } = await import('../web/src/next/epl/fantasy/Standings.jsx');
const { RostersPanel } = await import('../web/src/next/epl/fantasy/Rosters.jsx');
const { InsightsPanel } = await import('../web/src/next/epl/fantasy/Insights.jsx');
const { WeeklyLine, lineSegments, leagueAverage } = await import('../web/src/next/epl/fantasy/WeeklyLine.jsx');
const { eplApi } = await import('../web/src/next/epl/api.js');
const { cloudApi } = await import('../web/src/api.js');
const { ApiError } = await import('../web/src/apiResponse.js');

const SEAN = '473955676301815808', EVAN = '719658248843632640', NEMO = '865667912365666304';
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const wrap = node => renderToStaticMarkup(<div className="gx">{node}</div>);

function view(patch = {}) {
  return {
    season: 2026, week: 12, viewer: SEAN, capturedAt: '2026-11-25T00:05:00.000Z',
    matchup: {
      week: 12, basisWeek: 5, matched: [2, 5], me: { ownerId: SEAN, name: 'Sean' }, opp: { ownerId: EVAN, name: 'Evan' }, myProj: 104.2, oppProj: 98.6, winChance: 0.587,
      starters: [
        { playerId: '11', name: 'Erling Haaland', pos: 'F', club: 'MNC', clubText: 'MCI', proj: 18.4 },
        { playerId: '12', name: 'Martin Odegaard', pos: 'M', club: 'ARS', clubText: 'ARS', proj: null },
        { playerId: '13', name: 'Somebody', pos: 'D', club: null, clubText: 'WOL', proj: 4 },
      ],
      recent: [{ week: 9, projected: 90, actual: 100 }, { week: 10, projected: null, actual: null }, { week: 11, projected: 95, actual: 80.5 }],
    },
    standings: [
      { ownerId: SEAN, name: 'Sean', wins: 7, losses: 4, sleeperTotal: 1060.5, bonus: 20, total: 1080.5 },
      { ownerId: EVAN, name: 'Evan', wins: 6, losses: 5, sleeperTotal: 955, bonus: 0, total: 955 },
      { ownerId: NEMO, name: 'Nemo', wins: 6, losses: 5, sleeperTotal: 830, bonus: 0, total: 830 },
    ],
    rosters: [
      { ownerId: SEAN, name: 'Sean', starters: [{ playerId: '11', name: 'Erling Haaland', pos: 'F', club: 'MNC', clubText: 'MCI' }], bench: [{ playerId: '13', name: null, pos: null, club: null, clubText: null }] },
      { ownerId: EVAN, name: 'Evan', starters: [{ playerId: '21', name: 'Mo Salah', pos: 'M', club: 'LIV', clubText: 'LIV' }], bench: [] },
    ],
    insights: {
      weekly: [
        { week: 9, ownerId: SEAN, points: 100 }, { week: 9, ownerId: EVAN, points: 90 },
        { week: 10, ownerId: SEAN, points: null }, { week: 10, ownerId: EVAN, points: null },
        { week: 11, ownerId: SEAN, points: 60.5 }, { week: 11, ownerId: EVAN, points: 75 },
        { week: 12, ownerId: SEAN, points: 70 }, { week: 12, ownerId: EVAN, points: 72 },
      ],
      seasonHigh: { week: 9, ownerId: SEAN, name: 'Sean', points: 100 },
      myTopScorer: { ownerId: SEAN, name: 'Sean', playerId: '11', playerName: 'Erling Haaland', points: 45 },
      topScorerPerTeam: [{ ownerId: SEAN, name: 'Sean', playerId: '11', playerName: 'Erling Haaland', points: 45 }, { ownerId: EVAN, name: 'Evan', playerId: '21', playerName: 'Mo Salah', points: 11 }],
      beatProjection: [{ ownerId: SEAN, week: 9, diff: 10 }, { ownerId: SEAN, week: 10, diff: null }, { ownerId: SEAN, week: 11, diff: null }],
      detailWeeks: [9, 11], detailStartsWeek: 9,
    },
    ...patch,
  };
}

describe('Matchup', () => {
  it('shows both projected totals and the win chance as a whole percent', () => {
    const html = wrap(<MatchupPanel view={view()}/>);
    const t = text(html);
    expect(t).toContain('Win chance 59%');
    expect(t).toContain('104.2'); expect(t).toContain('98.6');
    expect(t).toContain('Sean'); expect(t).toContain('Evan');
    expect(html).toMatch(/gx-epl-fx-chance-fill[^>]*style="width:59%"/);
    expect(markupProblems(html)).toEqual([]);
  });
  it('a starter with no projection says No projection, never 0', () => {
    const html = wrap(<MatchupPanel view={view()}/>);
    expect(text(html)).toContain('Martin Odegaard No projection');
    expect(html).toContain('alt="Manchester City crest"');
    expect(text(html)).toContain('WOL');
  });
  it('an unavailable matchup says so exactly, and still shows your projection', () => {
    const v = view({ matchup: { unavailable: true, reason: 'no-repeat', week: 12, me: { ownerId: SEAN, name: 'Sean' }, myProj: 78.5, starters: [], recent: [] } });
    const t = text(wrap(<MatchupPanel view={v}/>));
    expect(t).toContain('Matchup unavailable this week');
    expect(t).toContain('78.5');
    expect(t).not.toContain('Win chance');
  });
  it('the opponent line says it is inferred, naming the two matchweeks that matched', () => {
    expect(text(wrap(<MatchupPanel view={view()}/>))).toContain('Opponent inferred from the repeating schedule (MW2 and MW5 matched)');
  });
  it('each reason for an unavailable matchup has its own sentence', () => {
    const body = reason => text(wrap(<MatchupPanel view={view({ matchup: { unavailable: true, reason, week: 12, me: reason === 'no-team' ? null : { ownerId: SEAN, name: 'Sean' }, myProj: null, starters: [], recent: [] } })}/>));
    const sentences = ['no-repeat', 'no-team', 'ambiguous'].map(reason => FANTASY_COPY.unavailableBody(reason));
    expect(new Set(sentences).size).toBe(3);
    for (const [i, reason] of ['no-repeat', 'no-team', 'ambiguous'].entries()) expect(body(reason)).toContain(sentences[i]);
    expect(sentences[0]).toMatch(/repeat/i);
    expect(sentences[1]).toMatch(/team/i);
    expect(sentences[2]).toMatch(/ambiguous|clear/i);
    expect(FANTASY_COPY.unavailableBody(undefined)).toBe(sentences[2]);
  });
  it('projected vs actual draws a missing week as an em dash, not a 0 bar', () => {
    const html = wrap(<MatchupPanel view={view()}/>);
    const t = text(html);
    expect(t).toMatch(/MW10 — —/);
    expect(t).not.toMatch(/MW10 0/);
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('Standings', () => {
  it('bars ranked by total with the viewer marked, W–L, and the raw Sleeper total on tap', () => {
    const html = wrap(<StandingsPanel view={view()}/>);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*data-owner="473955676301815808"|data-owner="473955676301815808"[^>]*aria-current="true"/);
    const t = text(html);
    expect(t).toContain('1,080.5'); expect(t).toContain('7–4');
    expect(t).toContain('Sleeper 1,060.5 + Pick a Team bonus 20');
    expect(html).toContain('<details');
    expect(markupProblems(html)).toEqual([]);
  });
  it('a missing name or missing Sleeper settings shows an em dash, never empty or 0', () => {
    const v = view({ standings: [...view().standings, { ownerId: '999', name: null, wins: null, losses: null, sleeperTotal: null, bonus: 5, total: null }] });
    const html = wrap(<StandingsPanel view={v}/>);
    const row = html.slice(html.indexOf('>', html.indexOf('data-owner="999"')) + 1);
    const head = text(row.slice(0, row.indexOf('</summary>')));
    expect(head).toBe('4 — — —');
    expect(text(row.slice(0, row.indexOf('</li>')))).toContain('Sleeper — + Pick a Team bonus 5');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('Rosters', () => {
  it('lists every manager\'s starters then bench, with crests and an unknown player as an em dash', () => {
    const html = wrap(<RostersPanel view={view()}/>);
    const t = text(html);
    expect(t.indexOf('Erling Haaland')).toBeLessThan(t.indexOf('Bench'));
    expect(t).toContain('Mo Salah');
    expect(t).toContain('Unknown player');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('Insights and the weekly line', () => {
  it('lineSegments breaks the line at a missing week', () => {
    expect(lineSegments([{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }, { x: 3, y: 4 }]).map(s => s.length)).toEqual([1, 2]);
    expect(leagueAverage(view().insights.weekly, 10)).toBe(null);
    expect(leagueAverage(view().insights.weekly, 9)).toBe(95);
  });
  it('a missing week renders a gap: two polyline segments, never a 0 point', () => {
    const v = view();
    const html = wrap(<WeeklyLine weekly={v.insights.weekly} viewer={SEAN}/>);
    const mine = html.match(/<polyline[^>]*gx-epl-fx-line--me[^>]*>/g) ?? [];
    expect(mine).toHaveLength(1); // MW9 alone is a dot; MW11–MW12 is one segment
    expect((html.match(/<polyline/g) ?? []).length).toBe(2);
    expect(html).toContain('gx-epl-fx-high');
    expect(markupProblems(html)).toEqual([]);
  });
  it('the tiles show the season high, your top scorer and the latest vs-projection as an em dash when missing', () => {
    const html = wrap(<InsightsPanel view={view()}/>);
    const t = text(html);
    expect(t).toContain('Season high'); expect(t).toContain('100'); expect(t).toContain('Erling Haaland');
    expect(t).toMatch(/vs projection \+10 MW9/i);
    expect(t).toContain('Mo Salah');
    expect(markupProblems(html)).toEqual([]);
  });
  it('the vs-projection tile uses the latest week with a diff, and an em dash when no week has one', () => {
    const at = beat => text(wrap(<InsightsPanel view={view({ insights: { ...view().insights, beatProjection: beat } })}/>));
    expect(at([{ ownerId: SEAN, week: 9, diff: 10 }, { ownerId: SEAN, week: 10, diff: -8.61 }, { ownerId: SEAN, week: 11, diff: null }, { ownerId: EVAN, week: 11, diff: 3 }])).toMatch(/vs projection −8\.61 MW10/i);
    expect(at([{ ownerId: SEAN, week: 10, diff: null }, { ownerId: SEAN, week: 11, diff: null }])).toMatch(/vs projection — (Weekly|Top)/i);
  });
  it('before weekly detail exists, the note names the first matchweek', () => {
    const v = view({ insights: { ...view().insights, weekly: [], seasonHigh: null, myTopScorer: null, topScorerPerTeam: [], beatProjection: [], detailWeeks: [], detailStartsWeek: 9 } });
    const t = text(wrap(<InsightsPanel view={v}/>));
    expect(t).toContain('Weekly detail starts MW9');
  });
});

describe('the Fantasy screen', () => {
  it('has the four sub-tabs and the Sleeper footer', () => {
    const html = wrap(<EplFantasyView state={{ status: 'loaded', data: view() }} section="matchup" onSection={() => {}}/>);
    const t = text(html);
    for (const label of ['Matchup', 'Standings', 'Rosters', 'Insights']) expect(t).toContain(label);
    expect(t).toMatch(/From Sleeper · saved .*\d/);
    expect(markupProblems(html)).toEqual([]);
  });
  it('a refused read shows its sentence and no league data', () => {
    expect(fantasyProblem(new ApiError('x', 403))).toBe(FANTASY_COPY.forbidden);
    expect(fantasyProblem({ code: 'GTL_EPL_OFF' })).toBe(FANTASY_COPY.soon);
    expect(fantasyProblem({ code: 'GTL_EPL_NO_FANTASY' })).toBe(FANTASY_COPY.noData);
    const html = wrap(<EplFantasyView state={{ status: 'failed', error: { status: 403 } }} section="matchup" onSection={() => {}}/>);
    expect(text(html)).toContain(FANTASY_COPY.forbidden);
    expect(text(html)).not.toContain('Win chance');
  });
  it('eplApi reads epl/fantasy/read without counting it as a save', async () => {
    cloudApi.mockClear();
    await eplApi('fantasy/read');
    expect(cloudApi).toHaveBeenCalledWith('epl/fantasy/read', {}, expect.objectContaining({ save: false }));
  });
});
