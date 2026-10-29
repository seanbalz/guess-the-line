// Play › Pick a Team and EPL Home (plan 2026-10-28-epl-pick-a-team.md, Task 8): the draft board drawn from one
// `epl/draft/read` reply. The server (cloud/epl.mjs, M-30) decides every turn and refusal; these screens only draw what
// the reply says, with the deadline as a client hint. Fixture data only (the MW9 order and picks from the spec).
import { describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { PickATeamView, PrimaryAction, StandingsSource } = await import('../web/src/next/epl/PickATeam.jsx');
const { DraftBoard, CrestGrid } = await import('../web/src/next/epl/DraftBoard.jsx');
const { MarginChart } = await import('../web/src/next/epl/MarginChart.jsx');
const { QueueSheetView } = await import('../web/src/next/epl/QueueSheet.jsx');
const { EplHomeView } = await import('../web/src/next/epl/EplHome.jsx');
const { boardModel, draftReducer, runPick, saveQueue, moveClub, PICK_COPY } = await import('../web/src/next/epl/draftModel.js');
const { Button, InfoButton } = await import('../web/src/next/ui/index.js');
const { ApiError } = await import('../web/src/apiResponse.js');
const { ClaimCardView, CLAIM_COPY, runClaim, claimManagers, justWatching, setJustWatching } = await import('../web/src/next/epl/ClaimCard.jsx');

const TABLE_SOURCE = { kind: 'wikimedia-community', official: false, dataAsOf: '2026-10-25',
  source: { url: 'https://en.wikipedia.org/w/index.php?title=2026%E2%80%9327%20Premier%20League&oldid=1382589055' },
  license: { url: 'https://creativecommons.org/licenses/by-sa/4.0/' } };

const ID = { Nemo: '865667912365666304', Cullen: '1259267898757611520', Adam: '719745569895018496', Sean: '473955676301815808',
  Evan: '719658248843632640', Mark: '1257180071064510465', Steven: '702644837370929152', Darin: '1395236217460633600' };
const NAMES = ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
const DEADLINE = '2026-10-31T12:30:00.000Z'; // Sat 5:30 AM PT
const BEFORE = Date.parse('2026-10-30T22:00:00.000Z');
const AFTER = Date.parse(DEADLINE) + 60_000;
const PICKED = { Nemo: 'MNC', Cullen: 'AVL', Adam: 'LIV', Sean: 'TOT', Evan: 'ARS', Mark: 'BRE', Steven: 'NEW' };
const CLUBS = [
  ['CHE', 'Chelsea', 'MUN', true], ['MUN', 'Manchester United', 'CHE', false], ['TOT', 'Tottenham Hotspur', 'CRY', true], ['CRY', 'Crystal Palace', 'TOT', false],
  ['MNC', 'Manchester City', 'BOU', true], ['BOU', 'Bournemouth', 'MNC', false], ['AVL', 'Aston Villa', 'EVE', true], ['EVE', 'Everton', 'AVL', false],
  ['LIV', 'Liverpool', 'FUL', true], ['FUL', 'Fulham', 'LIV', false], ['ARS', 'Arsenal', 'BHA', true], ['BHA', 'Brighton', 'ARS', false],
  ['BRE', 'Brentford', 'COV', true], ['COV', 'Coventry City', 'BRE', false], ['NEW', 'Newcastle United', 'HUL', true], ['HUL', 'Hull City', 'NEW', false],
].map(([code, name, opponent, home], i) => ({ code, name, opponent, home, kickoff: new Date(Date.parse(DEADLINE) + Math.floor(i / 2) * 9_000_000).toISOString() }));

function read({ me = ID.Darin, picks = Object.keys(PICKED), status = 'open', onTheClock, queue = ['CHE', 'MUN'], bonus, myQueue, claim = null } = {}) {
  const made = picks.map((name, i) => ({ ownerId: ID[name], name, club: PICKED[name] ?? 'CHE', source: 'seeded', pickedAt: `2026-10-29T1${i}:00:00+00:00`, final: i < picks.length - 1 }));
  return {
    season: 2026, week: 9, status, deadline: DEADLINE, me,
    order: NAMES.map(name => ({ ownerId: ID[name], name })),
    picks: made,
    onTheClock: onTheClock === undefined ? (ID[NAMES.find(n => !picks.includes(n))] ?? null) : onTheClock,
    clubs: CLUBS,
    myQueue: myQueue !== undefined ? myQueue : me ? queue : null,
    bonusLastWeek: bonus ?? [{ ownerId: ID.Evan, name: 'Evan', points: 15, margin: 3, club: 'ARS' }],
    claim,
  };
}

const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const handlers = () => ({ onSelect: vi.fn(), onPick: vi.fn(), onQueue: vi.fn(), onDismissNotice: vi.fn(), onRetry: vi.fn() });
const viewProps = patch => ({ model: boardModel(read(), BEFORE), selected: null, busy: false, notice: null, ...handlers(), ...patch });
const html = props => renderToStaticMarkup(<div className="gx"><PickATeamView {...props}/></div>);

// The view and its board parts use no hooks, so their element trees can be expanded and the kit's buttons pressed.
const OWN = new Set([PickATeamView, PrimaryAction, DraftBoard, CrestGrid, MarginChart]);
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  if (OWN.has(node.type)) return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
const label = node => Array.isArray(node) ? node.map(label).join('') : isValidElement(node) || node?.props ? label(node.props.children) : node == null || node === false ? '' : String(node);
function buttons(node, found = []) {
  if (Array.isArray(node)) { node.forEach(child => buttons(child, found)); return found; }
  if (!node?.props) return found;
  if (node.type === Button || node.type === 'button') found.push(node);
  buttons(node.props.children, found);
  return found;
}
const tree = props => expand(<PickATeamView {...props}/>);

describe('saved table provenance', () => {
  it('shows the source date and uses the existing About treatment for attribution, changes and share-alike links', () => {
    const model = boardModel({ ...read({ status: 'resolved' }), standingsSource: TABLE_SOURCE }, BEFORE);
    const page = html({ model, state: { status: 'loaded' } });
    expect(text(page)).toContain('Table used · Oct 25, 2026');
    expect(page).toContain('aria-label="About table fallback"');
    expect(text(page)).not.toContain('Wikipedia contributors');
    const element = StandingsSource({ source: model.standingsSource });
    const info = element.props.children.find(child => isValidElement(child) && child.type === InfoButton);
    expect(info.props.body.join(' ')).toContain('Wikipedia contributors');
    expect(info.props.body.join(' ')).toContain('Not independently verified official');
    expect(info.props.body.join(' ')).toContain('Changes:');
    expect(info.props.links).toEqual([{ text: 'Source and contributors', url: TABLE_SOURCE.source.url },
      { text: 'CC BY-SA 4.0', url: TABLE_SOURCE.license.url }]);
    expect(markupProblems(page)).toEqual([]);
  });

  it('does not invent a source for an old read or accept malformed dates and unrelated links', () => {
    expect(boardModel(read(), BEFORE).standingsSource).toBeNull();
    for (const source of [{ ...TABLE_SOURCE, dataAsOf: '2026-99-99' }, { ...TABLE_SOURCE, dataAsOf: '2026-02-30' },
      { ...TABLE_SOURCE, source: { url: 'javascript:alert(1)' } }, { ...TABLE_SOURCE, official: true }]) {
      expect(boardModel({ ...read(), standingsSource: source }, BEFORE).standingsSource).toBeNull();
    }
    expect(StandingsSource({ source: null })).toBeNull();
  });
});

describe('the draft board', () => {
  it('draws the 8 managers in pick order, each with their number, crest and name', () => {
    const page = html(viewProps());
    const root = parseMarkup(page);
    const nodes = [...walk(root)].filter(n => n.attrs?.['data-epl-node'] !== undefined);
    expect(nodes).toHaveLength(8);
    expect(nodes.map(n => readText(n).replace(/^\d+\.\s*/, '').split(',')[0])).toEqual(NAMES);
    expect(nodes.map(n => n.attrs['data-epl-node'])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    // Picked managers show their club's crest; the crest names the club.
    expect(page).toContain('src="/team-logos/epl/MNC.png"');
    expect(page).toContain('alt="Manchester City crest"');
    expect(markupProblems(page)).toEqual([]);
  });

  it('marks only the manager on the clock with aria-current="step" and a "?"', () => {
    const page = html(viewProps({ model: boardModel(read({ me: ID.Sean }), BEFORE) }));
    expect(page.match(/aria-current="step"/g)).toHaveLength(1);
    expect(page).toMatch(/data-epl-node="8"[^>]*aria-current="step"/);
    expect(text(page)).toContain('Darin is on the clock');
    expect(text(page)).toContain('Locks Sat 5:30 AM PT · widest win = margin × 5');
    // Not your turn: no Pick button and the crests are not buttons.
    expect(buttons(tree(viewProps({ model: boardModel(read({ me: ID.Sean }), BEFORE) }))).map(b => label(b.props.children))).not.toContain('Pick Chelsea');
  });

  it('shows only the clubs still available', () => {
    const page = html(viewProps());
    for (const code of Object.values(PICKED)) expect(page).not.toMatch(new RegExp(`data-epl-club="${code}"`));
    for (const code of ['CHE', 'MUN', 'CRY', 'BOU', 'EVE', 'FUL', 'BHA', 'COV', 'HUL']) expect(page).toMatch(new RegExp(`data-epl-club="${code}"`));
  });

  it('on your turn, tapping a crest then "Pick Chelsea" sends draft/pick { club: "CHE" }', async () => {
    const props = viewProps();
    const crest = buttons(tree(props)).find(b => b.props['data-epl-club'] === 'CHE');
    crest.props.onClick();
    expect(props.onSelect).toHaveBeenCalledWith('CHE');
    const chosen = viewProps({ selected: 'CHE' });
    expect(html(chosen)).toMatch(/data-epl-club="CHE"[^>]*aria-pressed="true"/);
    const pick = buttons(tree(chosen)).find(b => label(b.props.children) === 'Pick Chelsea');
    expect(pick.type).toBe(Button);
    expect(pick.props.variant).toBe('primary');
    pick.props.onClick();
    expect(chosen.onPick).toHaveBeenCalledWith('CHE');
    const api = vi.fn(async () => ({ season: 2026, week: 9, action: 'pick', club: 'CHE', picks: [] }));
    const result = await runPick({ api, club: 'CHE', model: chosen.model });
    expect(api).toHaveBeenCalledWith('draft/pick', { club: 'CHE', season: 2026, week: 9 });
    expect(result.refresh).toBe(true);
    expect(result.notice).toEqual({ text: 'You picked Chelsea.', tone: 'done' });
  });

  it('a 409 GTL_EPL_CLUB_TAKEN shows "Someone just took that club. Pick another." and refreshes the board', async () => {
    const api = vi.fn(async () => { throw new ApiError('Another manager already picked that club.', 409, 'GTL_EPL_CLUB_TAKEN'); });
    const result = await runPick({ api, club: 'CHE', model: boardModel(read(), BEFORE) });
    expect(result).toEqual({ refresh: true, clear: true, notice: { text: 'Someone just took that club. Pick another.', tone: 'warning' } });
    expect(PICK_COPY.taken).toBe('Someone just took that club. Pick another.');
    const page = html(viewProps({ notice: result.notice }));
    expect(text(page)).toContain('Someone just took that club. Pick another.');
    expect(markupProblems(page)).toEqual([]);
  });

  it('after the deadline the buttons are disabled with "Draft locked"', () => {
    const props = viewProps({ model: boardModel(read(), AFTER) });
    const page = html(props);
    expect(text(page)).toContain('Draft locked');
    const all = buttons(tree(props));
    const locked = all.find(b => label(b.props.children) === 'Draft locked');
    expect(locked.props.disabled).toBe(true);
    expect(all.find(b => label(b.props.children).startsWith('Set my backup ranking')).props.disabled).toBe(true);
    // No crest is a button once the draft has locked.
    expect(all.filter(b => b.props['data-epl-club'])).toEqual([]);
    expect(page).not.toMatch(/aria-current="step"/);
    expect(markupProblems(page)).toEqual([]);
  });

  it('the latest picker may change their pick until the next manager picks ("Change to …")', () => {
    const model = boardModel(read({ me: ID.Steven }), BEFORE);
    expect(model.canPick).toBe(true);
    const page = html(viewProps({ model, selected: 'CHE' }));
    expect(text(page)).toContain('Change to Chelsea');
    expect(text(page)).toContain('Darin is on the clock');
  });

  it('last matchweek\'s margin bars show the winner\'s +N pts; a week under review says so instead', () => {
    const page = html(viewProps());
    expect(text(page)).toContain('Evan');
    expect(text(page)).toContain('+15 pts');
    expect(text(page)).toContain('won by 3');
    const review = html(viewProps({ model: boardModel(read({ status: 'needs_review', onTheClock: null }), AFTER) }));
    expect(text(review)).toContain('Results under review');
    expect(text(review)).not.toContain('+15 pts');
    const none = html(viewProps({ model: boardModel(read({ bonus: [] }), BEFORE) }));
    expect(text(none)).toContain('No bonus recorded for last matchweek.');
  });

  it('the unlinked commissioner sees the board with no queue button and no picking', () => {
    const props = viewProps({ model: boardModel(read({ me: null }), BEFORE) });
    const all = buttons(tree(props));
    expect(all.map(b => label(b.props.children)).join('|')).not.toContain('backup ranking');
    expect(all.filter(b => b.props['data-epl-club'])).toEqual([]);
  });
});

describe('loading and refusals', () => {
  it('a non-member\'s 403 never shows draft data, even after a good read', () => {
    const loaded = draftReducer(undefined, { type: 'loaded', data: read() });
    expect(loaded.data.week).toBe(9);
    const refused = draftReducer(loaded, { type: 'failed', error: new ApiError('Pick a Team is for the FEPL managers.', 403, 'GTL_EPL_FORBIDDEN') });
    expect(refused.data).toBeNull();
    expect(refused.status).toBe('error');
    const page = html(viewProps({ model: boardModel(refused.data, BEFORE), state: refused }));
    expect(text(page)).toContain('Pick a Team is for the FEPL managers.');
    expect(page).not.toContain('data-epl-node');
    expect(page).not.toContain('team-logos');
    // A passing outage keeps the board it had, with a line saying it could not refresh.
    const stale = draftReducer(loaded, { type: 'failed', error: new ApiError('Unavailable', 503) });
    expect(stale.data.week).toBe(9);
    expect(stale.stale).toBe(true);
  });

  it('coming soon and no week read plainly; loading is a skeleton', () => {
    const off = draftReducer(undefined, { type: 'failed', error: new ApiError('Pick a Team is coming soon.', 404, 'GTL_EPL_OFF') });
    expect(text(html(viewProps({ model: null, state: off })))).toContain('Pick a Team is coming soon.');
    const none = draftReducer(undefined, { type: 'failed', error: new ApiError('No Pick a Team matchweek is open.', 404, 'GTL_EPL_NO_WEEK') });
    expect(text(html(viewProps({ model: null, state: none })))).toContain('No Pick a Team matchweek is open.');
    const loading = html(viewProps({ model: null, state: draftReducer(undefined, { type: 'start' }) }));
    expect(loading).toContain('data-skeleton');
    expect(loading).not.toContain('data-epl-node');
    expect(markupProblems(loading)).toEqual([]);
  });
});

describe('the backup ranking (queue)', () => {
  it('lists your ranked clubs with move and remove buttons, then the other clubs to add', () => {
    const page = renderToStaticMarkup(<div className="gx"><QueueSheetView clubs={CLUBS} queue={['CHE', 'MUN']} onChange={() => {}} onSave={() => {}} onClose={() => {}} busy={false}/></div>);
    expect(text(page)).toContain('Backup ranking');
    expect(page).toMatch(/aria-label="Move Chelsea down"/);
    expect(page).toMatch(/aria-label="Remove Manchester United"/);
    expect(page).toMatch(/aria-label="Add Crystal Palace"/);
    expect(markupProblems(page)).toEqual([]);
    expect(moveClub(['CHE', 'MUN', 'CRY'], 0, 1)).toEqual(['MUN', 'CHE', 'CRY']);
    expect(moveClub(['CHE', 'MUN'], 0, -1)).toEqual(['CHE', 'MUN']);
  });

  it('saves through queue/save with the clubs in order', async () => {
    const api = vi.fn(async () => ({ season: 2026, week: 9, clubs: ['MUN', 'CHE'] }));
    const result = await saveQueue({ api, clubs: ['MUN', 'CHE'], model: boardModel(read(), BEFORE) });
    expect(api).toHaveBeenCalledWith('queue/save', { clubs: ['MUN', 'CHE'], season: 2026, week: 9 });
    expect(result).toEqual({ ok: true, clubs: ['MUN', 'CHE'], notice: { text: 'Backup ranking saved.', tone: 'done' } });
  });
});

describe('EPL Home', () => {
  const home = (model, patch = {}) => renderToStaticMarkup(<div className="gx"><EplHomeView model={model} now={BEFORE} onOpenPick={() => {}} {...patch}/></div>);
  it('counts down to the first kickoff and says who picks next, with your club and pick order', () => {
    const page = home(boardModel(read({ me: ID.Sean }), BEFORE));
    expect(text(page)).toContain('Matchweek 9');
    expect(text(page)).toContain('Darin picks next · 7 of 8 in');
    expect(page).toContain('role="timer"');
    expect(text(page)).toContain('Sat 5:30 AM PT · MUN @ CHE');
    expect(text(page)).toContain('Tottenham Hotspur');
    expect(text(page)).toContain('vs CRY');
    expect(text(page)).toMatch(/Pick order\s*4\s*\/ 8/);
    expect(markupProblems(page)).toEqual([]);
  });
  it('says "You pick next" on your turn', () => {
    expect(text(home(boardModel(read(), BEFORE)))).toContain('You pick next · 7 of 8 in');
  });
  it('a refusal shows no draft data', () => {
    const refused = draftReducer(undefined, { type: 'failed', error: new ApiError('Pick a Team is for the FEPL managers.', 403, 'GTL_EPL_FORBIDDEN') });
    const page = home(null, { state: refused });
    expect(text(page)).toContain('Pick a Team is for the FEPL managers.');
    expect(page).not.toContain('role="timer"');
  });
});

// EPL open access (plan 2026-10-29-epl-open-access.md, Task 3): every signed-in account reads the board; an unlinked one
// (`me: null`, `myQueue: []`, `claim.managers`) sees it read-only with the claim card.
describe('read-only EPL and the claim card', () => {
  const UNCLAIMED = [{ ownerId: ID.Adam, name: 'Adam' }, { ownerId: ID.Darin, name: 'Darin' }];
  const unlinked = (patch = {}) => read({ me: null, myQueue: [], claim: { managers: UNCLAIMED }, ...patch });
  const claimHtml = props => renderToStaticMarkup(<div className="gx"><ClaimCardView {...props}/></div>);

  it('an unlinked account sees the board read-only: no pick, crest or queue buttons', () => {
    const model = boardModel(unlinked({ onTheClock: ID.Darin }), BEFORE);
    expect(model.canPick).toBe(false);
    expect(model.queue).toBeNull();
    const props = viewProps({ model });
    const page = html(props);
    expect(page.match(/data-epl-node=/g)).toHaveLength(8);
    expect(text(page)).toContain('Darin is on the clock');
    const all = buttons(tree(props));
    expect(all.map(b => label(b.props.children)).join('|')).not.toMatch(/backup ranking|Pick /);
    expect(all.filter(b => b.props['data-epl-club'])).toEqual([]);
    expect(text(page)).not.toContain(PICK_COPY.notYourTurn);
    expect(markupProblems(page)).toEqual([]);
  });

  it('the claim card asks "Which FEPL manager are you?" with one button per unclaimed manager and "Just watching"', () => {
    const managers = claimManagers(boardModel(unlinked(), BEFORE));
    expect(managers).toEqual(UNCLAIMED);
    const onClaim = vi.fn(), onWatch = vi.fn();
    const page = claimHtml({ managers, busy: false, onClaim, onWatch });
    expect(text(page)).toContain('Which FEPL manager are you?');
    expect(CLAIM_COPY.title).toBe('Which FEPL manager are you?');
    expect(markupProblems(page)).toEqual([]);
    const all = buttons(ClaimCardView({ managers, busy: false, onClaim, onWatch }));
    expect(all.map(b => label(b.props.children))).toEqual(['Adam', 'Darin', 'Just watching']);
    all[1].props.onClick();
    expect(onClaim).toHaveBeenCalledWith(ID.Darin);
    all[2].props.onClick();
    expect(onWatch).toHaveBeenCalled();
  });

  it('"Just watching" hides the card for the session', () => {
    setJustWatching(false);
    expect(justWatching()).toBe(false);
    setJustWatching(true);
    expect(justWatching()).toBe(true);
    setJustWatching(false);
  });

  it('a linked account (or no unclaimed manager) never sees the card', () => {
    expect(claimManagers(boardModel(read({ claim: { managers: UNCLAIMED } }), BEFORE))).toEqual([]);
    expect(claimManagers(boardModel(read(), BEFORE))).toEqual([]);
    expect(claimManagers(boardModel(unlinked({ claim: { managers: [] } }), BEFORE))).toEqual([]);
    expect(claimManagers(boardModel(unlinked({ claim: null }), BEFORE))).toEqual([]);
    expect(claimManagers(null)).toEqual([]);
    expect(claimHtml({ managers: [], busy: false, onClaim: () => {}, onWatch: () => {} })).toBe('<div class="gx"></div>');
  });

  it('claiming calls claim { ownerId }, then reloads', async () => {
    const api = vi.fn(async () => ({ ownerId: ID.Adam, name: 'Adam' }));
    const result = await runClaim({ api, ownerId: ID.Adam, name: 'Adam' });
    expect(api).toHaveBeenCalledWith('claim', { ownerId: ID.Adam });
    expect(result).toEqual({ refresh: true, notice: { text: 'You’re linked as Adam.', tone: 'done' } });
  });

  it('GTL_EPL_CLAIMED shows "Someone already claimed that manager." and reloads', async () => {
    const api = vi.fn(async () => { throw new ApiError('Someone already claimed that manager.', 409, 'GTL_EPL_CLAIMED'); });
    const result = await runClaim({ api, ownerId: ID.Adam, name: 'Adam' });
    expect(result).toEqual({ refresh: true, notice: { text: 'Someone already claimed that manager.', tone: 'warning' } });
    const failed = await runClaim({ api: vi.fn(async () => { throw new ApiError('Unavailable', 503); }), ownerId: ID.Adam, name: 'Adam' });
    expect(failed.refresh).toBe(false);
    expect(failed.notice.tone).toBe('error');
  });

  it('EPL Home for an unlinked account has no "your pick" tiles and no pick button', () => {
    const page = renderToStaticMarkup(<div className="gx"><EplHomeView model={boardModel(unlinked(), BEFORE)} now={BEFORE} onOpenPick={() => {}}/></div>);
    expect(text(page)).toContain('Darin picks next');
    expect(text(page)).not.toContain('Your pick');
    expect(text(page)).not.toContain('Make your pick');
    expect(markupProblems(page)).toEqual([]);
  });
});
