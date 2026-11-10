// Redesign build plan stage 12: the read-only Home, rendered with vitest + react-dom/server over fixture Community
// replies (no browser; the browser checks are tests/cloud-browser/next-home.spec.js, whose fixture week cannot score
// a ballot, so the ranked and tied tiles are rendered here). The data hook is stood in for, so nothing here reaches
// the network. Fixture people and points only; no player data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { HOME_COPY } from '../shared/home-view.mjs';
import { HERO_COPY } from '../web/src/next/home/homeModel.js';
import { rankKey } from '../web/src/next/league/rankMoment.js';
import { featuresModel } from '../web/src/next/features/model.js';
import { scoreScope } from '../web/src/next/moments/catalog.js';

vi.mock('../web/src/api.js', () => ({ meApi: vi.fn() }));
const state = vi.hoisted(() => ({ home: null, tickets: { loading: true, error: null, active: null }, features: { model: null }, waiting: {}, popped: [], scopes: [] }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));
// The tickets tile's read, held loading (its real first render) unless a test sets a count.
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => state.tickets }));
// The features read (awards, the Pick streak) and the moments engine stand in: each test says what read and what waits.
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => null, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: scope => (state.waiting[scope] ?? []).length, useNewMoments: scope => state.waiting[scope] ?? [], usePopped: id => state.popped.includes(id),
}));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');

const HOUR = 3_600_000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-13T20:03:00Z'); // Tue Oct 13, 1:03 PM PT
const DEADLINE = '2026-10-16T00:15:00Z'; // Thu Oct 15, 5:15 PM PT
const OPENS_AT = '2026-10-12T07:00:00Z'; // Mon Oct 12, 12:00 AM PT
const SPREAD = 'guess_spread', TOTAL = 'guess_total';
const MEMBERS = [
  { id: 'u-avery', displayName: 'Avery Stone', removed: false },
  { id: 'u-blake', displayName: 'Blake Rivers', removed: false },
  { id: 'u-casey', displayName: 'Casey Moore', removed: false },
  { id: 'u-drew', displayName: 'Drew Lane', removed: false },
  { id: 'u-emery', displayName: 'Emery Fox', removed: false },
];
const row = (userId, mode, seasonPoints, seasonScored = 4, extra = {}) => ({ userId, mode, weekPoints: seasonPoints, weekScored: seasonScored, seasonPoints, seasonScored, weeksSubmitted: 1, satOut: false, ...extra });
const sent = (userId, mode) => ({ userId, mode, submittedAt: '2026-10-13T18:00:00Z', satOut: false, late: null });
const satOut = (userId, mode) => ({ userId, mode, submittedAt: null, satOut: true, late: null });

/**
 * The normalized /community/read reply (cloud/community.mjs) as the viewer Casey: picks due, Spread drafted 2 of 4 and
 * Total not started; Avery, Blake and Drew in on Spread, Emery sat out; Blake leads Spread at 12, Casey and Avery tie at
 * 10, Drew 8; Casey has no Total ballot.
 */
function reply(patch = {}) {
  return {
    viewer: 'u-casey',
    admin: false,
    members: MEMBERS,
    week: { season: 2026, week: 6, deadline: DEADLINE, games: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }] },
    optOuts: [],
    due: [{ mode: SPREAD, submitted: false, satOut: false, filled: 2, games: 4 }, { mode: TOTAL, submitted: false, satOut: false, filled: 0, games: 4 }],
    submissions: [sent('u-avery', SPREAD), sent('u-blake', SPREAD), sent('u-drew', SPREAD), satOut('u-emery', SPREAD), sent('u-blake', TOTAL)],
    standings: [row('u-blake', SPREAD, 12), row('u-casey', SPREAD, 10), row('u-avery', SPREAD, 10), row('u-drew', SPREAD, 8), row('u-blake', TOTAL, 7.5)],
    posts: [],
    interests: [],
    interestCounts: {},
    picksDue: { state: 'due', opensAt: OPENS_AT, deadline: DEADLINE, week: 6, modes: [{ mode: SPREAD }, { mode: TOTAL }], now: new Date(NOW).toISOString() },
    pushConfigured: false,
    ...patch,
  };
}

const shell = { tab: vi.fn(), reload: vi.fn(), state: { tab: 'home', sheets: [] } };
const app = { refresh: vi.fn(), accountId: 'u-casey' };
const home = (community, patch = {}) => { state.home = { app, viewer: 'u-casey', community: { status: 'ready', data: community, error: null, loading: false }, ...patch }; };
const render = () => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Home/></div></ShellContext.Provider>);
/** The elements under `root` (markup, or a node from an earlier read) that pass `test`. */
const nodes = (root, test) => [...walk(typeof root === 'string' ? parseMarkup(root) : root)].filter(n => n.tag && test(n));
const attr = (name, value) => n => n.attrs[name] === value;
const hasClass = cls => n => (n.attrs.class ?? '').split(/\s+/).includes(cls);
const textOf = n => [...walk(n)].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
/** The words a sighted reader sees under `n`: no sr-only text. */
const hidden = n => { for (let a = n.parent; a; a = a.parent) if (a.attrs && hasClass('gx-sr-only')(a)) return true; return false; };
const seen = n => [...walk(n)].filter(x => x.text !== undefined && !hidden(x)).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const primaries = html => nodes(html, hasClass('gx-btn--primary'));
const buttons = html => nodes(html, n => n.tag === 'button').map(textOf);
const tile = (html, market) => nodes(html, attr('data-tile', market))[0];
const button = n => nodes(n, x => x.tag === 'button')[0];
/** D-66 (design audit B0-4): each element's own visible text runs no longer than twelve words. */
const longLines = html => nodes(html, n => !hidden(n) && n.attrs['aria-hidden'] !== 'true')
  .map(n => n.children.filter(c => c.text !== undefined).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim())
  .filter(text => text.split(' ').filter(w => w && w !== '·').length > 12);
const FEATURES = { leagueId: null, season: 2026, ran: true, badges: [], seasonWinners: null,
  awards: [{ week: 5, version: 1, createdAt: '2026-10-13T16:00:00Z', awards: [{ id: 'spread_winner', winners: ['u-blake'], entries: [], value: { points: 12 } }, { id: 'total_winner', winners: ['u-casey'], entries: [], value: { points: 7 } }] }],
  streaks: [{ userId: 'u-casey', pick: { current: 3, best: 3 }, bets: { current: 0, best: 0 } }] };
const features = () => ({ model: featuresModel(FEATURES, { viewer: 'u-casey', nameOf: id => id }), data: FEATURES });

afterEach(() => { state.home = null; state.features = { model: null }; state.waiting = {}; state.popped = []; state.scopes = []; vi.clearAllMocks(); });

describe('Approved Home', () => {

  it('matches the approved hierarchy with a single outlined action and an accessible progress ring', () => {

    home(reply());

    const html = render(), hero = nodes(html, attr('data-home','hero'))[0];

    expect(markupProblems(html)).toEqual([]);

    expect(nodes(html,n=>n.tag==='h1').map(nameFrom)).toEqual(['Home']);

    expect(nodes(html,n=>n.tag==='h1').map(textOf)).toEqual(['Your week.']);

    expect(nodes(hero,n=>n.tag==='h2').map(textOf)).toEqual(['Finish your picks']);

    expect(nodes(html,hasClass('gx-home-primary')).map(nameFrom)).toEqual(['Continue picks']);

    expect(nodes(hero,attr('role','img')).map(nameFrom)).toEqual(['2 of 4 picks drafted']);

    expect(textOf(hero)).toContain('2 Spread picks left');

    expect(nodes(html,attr('role','timer'))).toHaveLength(0);

    expect(nodes(html,n=>n.tag==='h2').map(textOf)).toEqual(['Finish your picks','Your season','Around the league']);

  });

  it('keeps Spread and Total explicitly selectable and never sums their points', () => {

    home(reply());const html=render();

    const selector=nodes(html,attr('aria-label','Season market'))[0];

    expect(nodes(selector,n=>n.tag==='button').map(n=>[textOf(n),n.attrs['aria-pressed']])).toEqual([['Spread','true'],['Total','false']]);

    expect(nodes(html,hasClass('gx-home-stat')).map(nameFrom)).toEqual(['Spread Community rank, T-02 of 4. Open your score','Spread accuracy points, 10. Open your score']);

    expect(nodes(html,attr('data-home','points')).map(textOf)).toEqual(['10']);

    expect(html).not.toContain('17.5');

  });

  it('uses a dash for an unscored market, keeping a real zero distinct', () => {

    home(reply({standings:[]}));let html=render();

    expect(nodes(html,hasClass('gx-home-stat')).map(nameFrom)).toContain('Spread accuracy points, not scored yet. Open your score');

    expect(nodes(html,attr('data-home','points')).map(textOf)).toEqual(['—']);

    home(reply({standings:[row('u-casey',SPREAD,0)]}));html=render();

    expect(nodes(html,attr('data-home','points')).map(textOf)).toEqual(['0']);

  });

  it('counts only eligible unclosed games under per-game rules', () => {

    home(reply({rules:{perGameScoring:true},due:[{mode:SPREAD,locked:1,games:4,openGames:2},{mode:TOTAL,locked:0,games:4,openGames:3}]}));

    const hero=nodes(render(),attr('data-home','hero'))[0];

    expect(textOf(hero)).toContain('2 Spread picks left');expect(textOf(hero)).toContain('1 game closed');

    expect(nodes(hero,attr('role','img')).map(nameFrom)).toEqual(['1 of 4 picks locked in']);

  });

  it('shows the server-driven done, closed, not-open and no-week states without presenting a save action', () => {

    for(const picksDue of [{state:'done',modes:[]},{state:'closed',modes:[]},{state:'not_open',opensAt:OPENS_AT,modes:[]}]){

      home(reply({picksDue}));const html=render();expect(markupProblems(html)).toEqual([]);

      expect(nodes(html,hasClass('gx-home-primary')).map(nameFrom)).toEqual(['Explore games']);

    }

    home(reply({week:null,due:[],standings:[],picksDue:{state:'none',modes:[]}}));

    expect(nodes(render(),attr('role','img')).some(n=>nameFrom(n)==='No open slate')).toBe(true);

  });

  it('describes submitted and sat-out ballots accurately', () => {

    for(const [due,state] of [[{submitted:true},'submitted'],[{satOut:true},'sat out']]){

      home(reply({due:[{mode:SPREAD,games:4,filled:4,...due},{mode:TOTAL,games:4,filled:4,...due}],picksDue:{state:'done',modes:[]}}));

      expect(nodes(render(),attr('role','img')).map(nameFrom)).toContain(`${state==='sat out'?0:4} of 4 picks ${state}`);

    }

  });

  it('uses graphic League/Research shortcuts with a labelled historical scoring chart',()=>{

    home(reply());const html=render();

    expect(nodes(html,hasClass('gx-home-nav-card')).map(nameFrom)).toEqual(['League. Spread Community standings','Research. Explore games and trends']);

    const chart=nodes(html,n=>n.tag==='svg'&&n.attrs.role==='img')[0];

    expect(nameFrom(chart)).toContain('Historical league scoring: 2026');expect(nameFrom(chart)).toContain('Data: nflverse.');

  });

  it('renders only generic community activity, with no copied payload or hidden guesses',()=>{

    home(reply({posts:[{id:'p',actorId:'u-blake',kind:'ballot_submitted',mode:SPREAD,body:'SECRET 71.75',payload:{pick:71.75}}]}));

    const html=render();expect(html).toContain('Blake Rivers');expect(html).toContain('submitted Spread picks');expect(html).not.toContain('71.75');expect(html).not.toContain('SECRET');

  });

  it('retains an accessible Who’s in entry and a useful empty-feed destination',()=>{

    home(reply());const html=render();expect(nodes(html,attr('id','gx-h-tile-who')).map(nameFrom)).toEqual(['Community, Who’s in, 5 members']);

    expect(buttons(html)).toContain('Visit your community Standings, picks and league updates');

  });

  it('shows NEW on the selected market rank without spending score or awards moments',()=>{

    home(reply());state.waiting={[scoreScope(SPREAD)]:[{id:'r',kind:'rankUp'}],features:[{id:'a',kind:'award'}]};

    const html=render();expect(nameFrom(button(tile(html,'spread')))).toContain('Open your score, new');expect(nodes(tile(html,'spread'),hasClass('gx-new'))).toHaveLength(1);

    expect(state.scopes).toEqual(['home']);

  });

  it('pops only the visible compact progress when a whole-market lock moment plays',()=>{

    home(reply());state.popped=['weekLocked:2026:6:guess_spread'];const html=render();

    expect(nodes(html,hasClass('gx-home-progress'))[0].attrs['data-moment']).toBe('pop');expect(nodes(html,attr('data-home','streak'))).toHaveLength(0);

  });

  it('holds no moment scope while a week is loading, failed or replaced by Who’s in',()=>{

    for(const status of ['loading','error']){

      state.scopes=[];home(null,{community:{status,data:null,error:status==='error'?{status:503}:null}});render();expect(state.scopes).toEqual([]);

    }

    state.scopes=[];home(reply());shell.state.views={home:{layer:'who'}};try{render();expect(state.scopes).toEqual([]);}finally{delete shell.state.views;}

  });

  it('announces loading without an action or fake score',()=>{

    home(null,{community:{status:'loading',data:null,error:null,loading:true}});const html=render();

    expect(markupProblems(html)).toEqual([]);expect(nodes(html,attr('role','status')).map(textOf)).toEqual(['Loading this week…']);expect(buttons(html)).toEqual([]);expect(nodes(html,attr('data-skeleton','landing'))).toHaveLength(1);

  });

  it('offers retry and reload after a failed read without exposing a raw error',()=>{

    home(null,{community:{status:'error',data:null,error:{status:503,message:'SECRET'},loading:false}});const html=render();

    expect(markupProblems(html)).toEqual([]);expect(buttons(html)).toEqual(['Try again','Reload the app']);expect(html).not.toContain('SECRET');expect(nodes(html,attr('role','alert'))).toHaveLength(1);

  });

  it('keeps the last good copy and identifies a failed refresh',()=>{

    const data=reply();home(data,{app:{...app,community:{status:'ready',data,error:{status:503}}}});const html=render();

    expect(nodes(html,attr('data-home','hero'))).toHaveLength(1);expect(nodes(html,attr('role','status')).map(textOf)).toContain('This week could not refresh. Showing the last loaded update.');

  });

  it('keeps surface sentences compact in each server state',()=>{

    for(const picksDue of [reply().picksDue,{state:'urgent',modes:[]},{state:'done',modes:[]},{state:'none',modes:[]}]){home(reply({picksDue}));expect(longLines(render())).toEqual([]);}

  });

});
