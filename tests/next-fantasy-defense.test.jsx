// Fantasy defensive matchups in the new app: the player's matchup section (on the ranked-player layer, the usage layer
// and the profile sheet), the Defense matchups layer and its tile, labelled values, and the Not available states.
// Rendered from the deterministic four-team fixture; nothing reaches the network.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { defenseSnapshot } from './helpers/fantasy-defense-fixture.mjs';

const stats = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 5, receivingYards: 70, receivingTds: 0.5, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 8, carries: 0, passingAttempts: 0 };
const ranked = snapshot => ({ ...snapshot, players: snapshot.players.map(p => (p.id === 'P-WR' ? { ...p, weekly: { ...p.weekly, stats } } : p)) });
const read = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/fantasyData.js', () => ({
  FANTASY_AVAILABLE: [{ key: '2026-04', season: 2026, week: 4 }], FANTASY_INITIAL: '2026-04',
  fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => read.value,
}));
vi.mock('../web/src/fantasyContext.js', () => ({ useFantasyGameContext: () => ({ lines: null, wind: null }) }));
const { FantasyNest } = await import('../web/src/next/fantasy/FantasyNest.jsx');
const { DefenseMatchupSection, DefenseRankings } = await import('../web/src/next/fantasy/DefenseMatchup.jsx');
const { PlayerProfileBody } = await import('../web/src/next/fantasy/FantasyTools.jsx');
const { playerProfile } = await import('../shared/fantasy-tools.mjs');

const withDefense = ranked(defenseSnapshot()), without = ranked(defenseSnapshot({ defense: false }));
const settings = { scoring: 'ppr', passingTds: 4 };
const ready = snapshot => ({ status: 'ready', snapshot, origin: 'hosted', weeks: [{ key: '2026-04', season: 2026, week: 4 }] });
const render = (view = {}, snapshot = withDefense) => {
  read.value = ready(snapshot);
  return renderToStaticMarkup(<div className="gx"><FantasyNest navigationState={{ selection: '2026-04' }} onNavigationState={() => {}} view={view} onLayer={() => {}}
    profileId={null} onProfile={() => {}} compareIds={[]} onCompareChange={() => {}} onCompare={() => {}}/></div>);
};
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const lips = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
const section = html => nodes(html).find(n => n.attrs?.['data-fantasy'] === 'defense-matchup');

describe('Fantasy defensive matchups', () => {
  it('the ranked player layer carries the matchup section: notes, the seven views, and source credits', () => {
    const html = render({ fantasyLayer: 'player', fantasyPlayer: 'P-WR' });
    expect(markupProblems(html)).toEqual([]);
    const s = section(html);
    expect(s).toBeTruthy();
    expect(textOf(s)).toContain('vs BBB');
    expect(nodes(html).filter(n => n.tag === 'details' && n.attrs?.['data-fdm']).map(n => n.attrs['data-fdm']))
      .toEqual(['coverage', 'front', 'environment', 'script', 'injuries', 'usage', 'alignment', 'sources']);
    const notes = nodes(html).filter(n => n.tag === 'li' && n.attrs?.['data-tone']);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.map(n => n.attrs['data-tone'])).toContain('favorable');
    expect(textOf(s)).toContain('FTN Data via nflverse (CC BY-SA 4.0)');
  });
  it('every value is labelled Observed, Estimate or Not available, and small samples say so', () => {
    const html = render({ fantasyLayer: 'player', fantasyPlayer: 'P-WR' });
    const items = nodes(html).filter(n => n.attrs?.class === 'gx-fdm-item');
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      const pill = [...walk(item)].find(n => n.attrs?.['data-kind'] && n.tag === 'span');
      expect(pill, textOf(item)).toBeTruthy();
      expect({ observed: 'Observed', estimate: 'Estimate', unavailable: 'Not available' }[item.attrs['data-kind']]).toBe(textOf(pill));
    }
    const snap = items.find(n => n.attrs['data-metric'] === 'use-snapShare');
    expect(snap.attrs['data-kind']).toBe('unavailable');
    expect(textOf(snap)).toContain('no reuse license');
    expect(items.find(n => n.attrs['data-metric'] === 'opp-man').attrs['data-kind']).toBe('estimate');
    expect(items.find(n => n.attrs['data-metric'] === 'opp-blitz').attrs['data-kind']).toBe('observed');
    expect(html).toContain('Small sample');
  });
  it('the game script stays behind the viewer\'s own lines: without them it says so and shows no total', () => {
    const html = render({ fantasyLayer: 'player', fantasyPlayer: 'P-WR' });
    const script = nodes(html).find(n => n.attrs?.['data-fdm'] === 'script');
    expect(textOf(script)).toContain('Lines are not available right now.');
    expect(textOf(script)).not.toContain('Implied team total');
  });
  it('the usage layer shows the section too, and the Points presentation does not', () => {
    const html = render({ fantasyLayer: 'usage', fantasyPlayer: 'P-RB' });
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(section(html))).toContain('Defensive matchup');
    const profile = playerProfile(withDefense, 'P-RB', settings);
    const points = renderToStaticMarkup(<div className="gx"><PlayerProfileBody profile={profile} snapshot={withDefense} settings={settings} pointsPresentation/></div>);
    expect(points).not.toContain('data-fantasy="defense-matchup"');
  });
  it('a snapshot without insights says Not available; a kicker is told which positions are covered', () => {
    const html = render({ fantasyLayer: 'player', fantasyPlayer: 'P-WR' }, without);
    expect(nodes(html).find(n => n.attrs?.['data-fdm-status'])?.attrs['data-fdm-status']).toBe('unavailable');
    expect(textOf(section(html))).toContain('Not available');
    const kicker = renderToStaticMarkup(<div className="gx"><DefenseMatchupSection snapshot={withDefense} playerId="P-K" settings={settings}/></div>);
    expect(kicker).toContain('Defensive matchups cover quarterbacks');
  });
  it('the rankings card offers a Defense matchups tile when the snapshot has matchups', () => {
    const html = render();
    const tile = nodes(html).find(n => n.tag === 'button' && n.attrs?.['data-fantasy'] === 'defense');
    expect(tile).toBeTruthy();
    expect(textOf(tile)).toContain('Defense matchups');
    expect(markupProblems(html)).toEqual([]);
  });
  it('the Defense matchups layer: a lip back, the points-allowed table in adjusted order, and the reading notes', () => {
    const html = render({ fantasyLayer: 'defense' });
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual(['Back to Fantasy']);
    const rows = nodes(html).filter(n => n.tag === 'tr' && n.attrs?.['data-team']).map(n => n.attrs['data-team']);
    expect(rows[0]).toBe('BBB');
    expect(rows).toHaveLength(4);
    expect(html).toContain('vs offense avg');
    expect(html).toContain('How to read this table');
  });
  it('the styles table labels estimates and keeps missing values distinct', () => {
    const html = renderToStaticMarkup(<div className="gx"><DefenseRankings snapshot={withDefense} settings={settings} scoringLabel="PPR" initialMode="styles"/></div>);
    expect(markupProblems(html)).toEqual([]);
    const bbb = nodes(html).find(n => n.tag === 'tr' && n.attrs?.['data-team'] === 'BBB');
    expect(textOf(bbb)).toContain('100.0%');
    expect(textOf(bbb)).toContain('est.');
    expect(textOf(bbb)).toContain('3-4');
    const plain = renderToStaticMarkup(<div className="gx"><DefenseRankings snapshot={without} settings={settings} scoringLabel="PPR" initialMode="styles"/></div>);
    expect(plain).toContain('Defense styles are not available for this snapshot.');
  });
});
