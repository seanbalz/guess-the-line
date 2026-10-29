import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';

const cloud = vi.hoisted(() => ({ calls: [] }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(async (...args) => { cloud.calls.push(args); return { ok: true }; }) }));

const { SportControls } = await import('../web/src/next/shell/Frame.jsx');
const { EplAccessContext } = await import('../web/src/next/epl/route.js');
const { EplView } = await import('../web/src/next/epl/EplApp.jsx');
const { eplApi } = await import('../web/src/next/epl/api.js');
const { ApiError } = await import('../web/src/apiResponse.js');
const { NbaHeader } = await import('../web/src/next/nba/NbaHeader.jsx');

const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const pressed = html => [...html.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
const render = route => renderToStaticMarkup(<EplView route={route} onRoute={() => {}} onSportChange={() => {}}/>);

describe('sport switch', () => {
  it('the new app shows EPL only when the account has EPL access', () => {
    const without = renderToStaticMarkup(<div className="gx"><SportControls/></div>);
    expect(text(without)).not.toContain('EPL');
    expect(text(without)).toContain('NFL'); expect(text(without)).toContain('NBA');
    const hidden = renderToStaticMarkup(<EplAccessContext.Provider value={false}><div className="gx"><SportControls/></div></EplAccessContext.Provider>);
    expect(text(hidden)).not.toContain('EPL');
    const shown = renderToStaticMarkup(<EplAccessContext.Provider value={true}><div className="gx"><SportControls/></div></EplAccessContext.Provider>);
    expect(text(shown)).toContain('EPL');
    expect(pressed(shown)).toEqual(['NFL']);
    expect(markupProblems(shown)).toEqual([]);
  });
  it('the NBA header offers EPL only with access, with NBA selected (pre-T8 fix wave)', () => {
    const shown = renderToStaticMarkup(<div className="gx"><NbaHeader epl onSportChange={() => {}}/></div>);
    expect(text(shown)).toContain('EPL'); expect(text(shown)).toContain('NFL');
    expect(pressed(shown)).toEqual(['NBA']);
    expect(markupProblems(shown)).toEqual([]);
    const hidden = renderToStaticMarkup(<div className="gx"><NbaHeader epl={false} onSportChange={() => {}}/></div>);
    expect(text(hidden)).not.toContain('EPL');
    expect(text(hidden)).toContain('NFL'); expect(text(hidden)).toContain('NBA');
    expect(pressed(hidden)).toEqual(['NBA']);
  });
  it('the EPL app header has EPL selected', () => {
    const html = render({ tab: 'home' });
    expect(html).toContain('aria-label="Sport"');
    expect(pressed(html)).toContain('EPL');
  });
});

describe('EPL four-tab shell', () => {
  it('draws Home, Play, Bets and Research with the one showing marked', () => {
    const html = render({ tab: 'home' });
    for (const label of ['Home', 'Play', 'Bets', 'Research']) expect(html).toContain(`>${label}</span>`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/data-tab="home"[^>]*aria-current="page"/);
    expect(markupProblems(html)).toEqual([]);
  });
  it('Bets has nothing for the Premier League', () => {
    const html = render({ tab: 'bets' });
    expect(text(html)).toContain("Bets aren't available for the Premier League.");
    expect(html).toMatch(/data-tab="bets"[^>]*aria-current="page"/);
    expect(markupProblems(html)).toEqual([]);
  });
  it('Play has Guess the Line, Pick a Team and Leaderboard; only Pick a Team is built', () => {
    const pick = render({ tab: 'play', section: 'pick' });
    expect(text(pick)).toContain('Guess the Line'); expect(text(pick)).toContain('Leaderboard');
    expect(pressed(pick)).toContain('Pick a Team');
    expect(pick).toContain('data-epl-section="pick"');
    expect(text(pick)).not.toContain('Coming next');
    expect(markupProblems(pick)).toEqual([]);
    for (const section of ['guess', 'leaderboard']) {
      const html = render({ tab: 'play', section });
      expect(text(html)).toContain('Coming next');
      expect(html).toContain(`data-epl-section="${section}"`);
      expect(markupProblems(html)).toEqual([]);
    }
  });
  it('Research shows Fantasy, coming next', () => {
    const html = render({ tab: 'research', section: 'fantasy' });
    expect(text(html)).toContain('Fantasy'); expect(text(html)).toContain('Coming next');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('eplApi', () => {
  it('posts to epl/<action>; writes are saves, the read is not', async () => {
    cloud.calls.length = 0;
    await eplApi('draft/read', { season: 2026, week: 9 });
    await eplApi('draft/pick', { club: 'ARS' });
    expect(cloud.calls[0][0]).toBe('epl/draft/read'); expect(cloud.calls[0][1]).toEqual({ season: 2026, week: 9 }); expect(cloud.calls[0][2].save).toBe(false);
    expect(cloud.calls[1][0]).toBe('epl/draft/pick'); expect(cloud.calls[1][2].save).toBe(true);
    expect(() => eplApi('draft/settle')).toThrow(TypeError);
  });
  it('keeps the server’s EPL refusal codes on ApiError', () => {
    expect(new ApiError('x', 409, 'GTL_EPL_CLUB_TAKEN').code).toBe('GTL_EPL_CLUB_TAKEN');
    expect(new ApiError('x', 404, 'GTL_EPL_OFF').code).toBe('GTL_EPL_OFF');
  });
});
