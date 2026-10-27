// Play › Points, the commissioner's "Publish now" (web/src/next/play/points/PointsPublish.jsx): only the Community
// commissioner sees a drafted week's preview and the button; it asks once before opening the week; refusals read
// plainly. Fixture players only; gtl-api and the database decide who may publish (tests/points-cloud.test.mjs).
import { describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => null, useSharedRead: () => ({ data: null }) }));
const { PointsBallotView } = await import('../web/src/next/play/points/PointsBallot.jsx');
const { PointsPublishView } = await import('../web/src/next/play/points/PointsPublish.jsx');
const { Button } = await import('../web/src/next/ui/index.js');

const ME = '11111111-1111-4111-8111-111111111111';
const UNOPENED = { season: null, week: null, status: 'unopened', groupId: null, slots: [], result: null, standings: { week: [], season: [] } };
const OPEN = { season: 2026, week: 7, status: 'open', groupId: null, opensAt: '2026-10-20T07:00:00Z', finalizeAt: null, scoringRules: {},
  result: { status: null, maximum: 50, points: null, finalizedAt: null, house: { points: null, complete: false } }, slots: [], standings: { week: [], season: [] } };
const app = week => ({ accountId: ME, league: { name: 'Community', community: true }, community: { status: 'ready', data: week ? { week: { season: 2026, week } } : null }, requestSignIn: vi.fn() });
const shell = admin => ({ state: { views: { play: {}, league: {} } }, go: vi.fn(), setDirty: vi.fn(), toast: vi.fn(), communityAdmin: admin });
const ready = data => ({ loading: false, data, error: null, retry: vi.fn() });
const ballot = ({ admin, data = UNOPENED, week = 8 }) => renderToStaticMarkup(<div className="gx"><PointsBallotView app={app(week)} shell={shell(admin)} read={ready(data)}/></div>);

const DRAFT = { season: 2026, week: 8, status: 'draft', opensAt: '2026-10-27T07:00:00.000Z', house: { QB: 19.4, RB: 14.2 },
  slots: [
    { slot: 'QB', playerId: '00-fixture-qb', name: 'Fixture QB Player', team: 'PIT', position: 'QB', gameKey: '2026_08_PIT_CLE', kickoff: '2026-10-30T00:15:00.000Z' },
    { slot: 'RB', playerId: '00-fixture-rb', name: 'Fixture RB Player', team: 'KC', position: 'RB', gameKey: '2026_08_KC_LV', kickoff: '2026-11-01T17:00:00.000Z' },
    { slot: 'WR', playerId: '00-fixture-wr', name: 'Fixture WR Player', team: 'SEA', position: 'WR', gameKey: '2026_08_SEA_DEN', kickoff: '2026-11-01T20:05:00.000Z' },
    { slot: 'TE', playerId: '00-fixture-te', name: 'Fixture TE Player', team: 'NYJ', position: 'TE', gameKey: '2026_08_NYJ_BUF', kickoff: '2026-11-01T17:00:00.000Z' },
    { slot: 'FLEX', playerId: '00-fixture-fx', name: 'Fixture FLEX Player', team: 'MIA', position: 'WR', gameKey: '2026_08_MIA_NE', kickoff: '2026-11-03T01:15:00.000Z' },
  ] };
const handlers = () => ({ onAsk: vi.fn(), onCancel: vi.fn(), onPublish: vi.fn(), onRetry: vi.fn() });
const props = patch => ({ week: 8, loading: false, slate: null, error: null, quiet: false, confirm: false, busy: false, problem: '', ...handlers(), ...patch });
const view = patch => renderToStaticMarkup(<div className="gx"><PointsPublishView {...props(patch)}/></div>);
const text = html => [...walk(parseMarkup(html))].filter(n => n.text !== undefined).map(n => n.text).join(' ');

// PointsPublishView uses no hooks, so its element tree can be walked to press the kit's Buttons (components are not rendered).
const label = node => Array.isArray(node) ? node.map(label).join('') : isValidElement(node) ? label(node.props.children) : node == null || node === false ? '' : String(node);
function buttons(node, found = []) {
  if (Array.isArray(node)) { node.forEach(child => buttons(child, found)); return found; }
  if (!isValidElement(node)) return found;
  if (node.type === Button) found.push(node);
  buttons(node.props.children, found);
  return found;
}
const tree = patch => { const p = props(patch); return { p, node: PointsPublishView(p) }; };

describe('Play › Points, Publish now visibility', () => {
  it('a player sees nothing new on an unopened week or an open one', () => {
    for (const data of [UNOPENED, OPEN]) {
      const html = ballot({ admin: false, data });
      expect(html).not.toContain('data-points-publish');
      expect(html).not.toContain('Publish now');
      expect(html).not.toContain('Checking Week');
    }
    expect(ballot({ admin: false })).toContain('No Points week is open. A new week opens Tuesdays at 12:00 AM PT.');
  });

  it('the commissioner checks the current week’s slate under the unopened message', () => {
    const html = ballot({ admin: true });
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('No Points week is open.');
    expect(html).toContain('Checking Week 8’s slate…');
    // An unopened read that names its week checks that week.
    expect(ballot({ admin: true, data: { ...UNOPENED, season: 2026, week: 9 } })).toContain('Checking Week 9’s slate…');
  });

  it('on an open week the commissioner’s check is quiet until a draft is found, and adds no lime button', () => {
    for (const week of [7, 8]) {
      const html = ballot({ admin: true, data: OPEN, week });
      expect(html).toContain('WEEK 7 POINTS');
      expect(html).not.toContain('Checking Week');
      expect(html).not.toContain('gx-btn--primary');
    }
  });
});

describe('Play › Points, the commissioner’s preview and confirm', () => {
  it('previews the five drafted players with matchups and kickoffs, never the House', () => {
    const html = view({ slate: DRAFT });
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Week 8 preview');
    expect(html).toContain('Commissioner only. Players can’t see this slate yet; it opens on its own Tue 12:00 AM PT.');
    const rows = [...walk(parseMarkup(html))].filter(n => n.attrs?.class === 'gx-pt-preview-row');
    expect(rows).toHaveLength(5);
    for (const words of ['QB · Fixture QB Player', 'PIT @ CLE · Thu 5:15 PM PT', 'FLEX · Fixture FLEX Player', 'MIA @ NE · Mon 5:15 PM PT']) expect(text(html)).toContain(words);
    expect(html).not.toMatch(/19\.4|14\.2|House/);
    expect(html).toContain('Opens Week 8 for everyone now. This can’t be undone.');
    expect(html.match(/gx-btn--primary/g)).toHaveLength(2); // Publish now, and the dialog's confirm.
  });

  it('Publish now asks first; only the dialog’s Publish now publishes, and Cancel backs out', () => {
    let { p, node } = tree({ slate: DRAFT });
    const [ask] = buttons(node).filter(b => label(b.props.children) === 'Publish now');
    ask.props.onClick();
    expect(p.onAsk).toHaveBeenCalledOnce();
    expect(p.onPublish).not.toHaveBeenCalled();
    ({ p, node } = tree({ slate: DRAFT, confirm: true }));
    const all = buttons(node);
    expect(all.map(b => label(b.props.children))).toEqual(['Publish now', 'Cancel', 'Publish now']);
    all[1].props.onClick();
    expect(p.onCancel).toHaveBeenCalledOnce();
    all[2].props.onClick();
    expect(p.onPublish).toHaveBeenCalledOnce();
  });

  it('while publishing the button says so and cannot be pressed again', () => {
    const { node } = tree({ slate: DRAFT, busy: true });
    expect(buttons(node).map(b => [label(b.props.children), b.props.disabled])).toEqual([['Publishing…', true], ['Cancel', undefined], ['Publish now', true]]);
  });

  it('after publishing it says the week is open (the read then reloads to the ballot)', () => {
    expect(view({ slate: { ...DRAFT, status: 'published' } })).toContain('Week 8 is open for everyone.');
    expect(view({ slate: { ...DRAFT, status: 'published' }, quiet: true })).toBe('<div class="gx"></div>');
  });
});

describe('Play › Points, Publish now refusals', () => {
  it('no stored draft: projections are still loading, with a way to check again', () => {
    const html = view({ error: { status: 404, message: 'No Points slate is stored for that week.' } });
    expect(html).toContain('This week’s slate hasn’t been drafted yet — projections are still loading.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Check again');
  });

  it('not the commissioner: says so, with nothing to retry', () => {
    const html = view({ error: { status: 403, message: 'Only the commissioner can manage the Points slate.' } });
    expect(html).toContain('Only the commissioner can publish the Points slate.');
    expect(html).not.toContain('Check again');
  });

  it('too late: a refused publish keeps the preview and reads plainly', () => {
    const html = view({ slate: DRAFT, problem: 'Week 8’s first game has kicked off, so this slate can no longer be published.' });
    expect(html).toContain('Week 8 preview');
    expect(html).toMatch(/role="alert">Week 8’s first game has kicked off, so this slate can no longer be published\./);
  });

  it('a quiet check (a week is already open) shows no loading line and no refusal', () => {
    expect(view({ loading: true, quiet: true })).toBe('<div class="gx"></div>');
    expect(view({ error: { status: 404 }, quiet: true })).toBe('<div class="gx"></div>');
  });
});
