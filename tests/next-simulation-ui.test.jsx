// Presentation checks only. These test fixtures are invented; no model, NFL source, account or server is used.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { isRenderableReplay, ReplayViewer, replayClock } from '../web/src/next/simulation/ReplayViewer.jsx';
import { shapeReplayFixture as replayFixture, replayFixture as generatedReplay } from './fixtures/next-simulation/replay.mjs';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const render = (replay = replayFixture, props = {}) => renderToStaticMarkup(<div className="gx"><ReplayViewer replay={replay} {...props}/></div>);
const nodes = html => [...walk(parseMarkup(html))].filter(node => node.tag);
const words = html => nameFrom(parseMarkup(html));
const at = (index, changes = {}) => ({ ...replayFixture, ...changes, events: [replayFixture.events[index]] });

describe('read-only simulation viewer', () => {
  it('accepts the real reducer’s immutable snapshots without adapting scores, statistics or captions', () => {
    expect(isRenderableReplay(generatedReplay)).toBe(true);
    expect(Object.isFrozen(generatedReplay.events)).toBe(true);
    for (const event of generatedReplay.events) {
      const html = render({ ...generatedReplay, events: [event] });
      expect(markupProblems(html)).toEqual([]);
      expect(words(html)).toContain(event.caption);
      expect(nodes(html).some(node => node.attrs['aria-label'] === `Buffalo Bills score ${event.score.home}`)).toBe(true);
    }
  });
  it('renders one snapshot consistently with one primary, named field and controls, and research provenance', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(words(html)).toContain('Research only');
    expect(words(html)).toContain('Model validation and publication checks are incomplete.');
    expect(words(html)).toContain('These are not actual game results.');
    expect(words(html)).toContain(replayFixture.events[0].caption);
    expect(words(html)).toContain('test-only-v1');
    expect(words(html)).toContain('2026-10-15 12:00:00 UTC');
    expect(nodes(html).filter(node => node.attrs.class?.split(' ').includes('gx-btn--primary')).map(nameFrom)).toEqual(['Play']);
    expect(nodes(html).filter(node => node.tag === 'button').map(nameFrom)).toEqual(['Previous play', 'Play', 'Next play', 'Restart']);
    expect(nodes(html).find(node => node.tag === 'svg' && node.attrs.role === 'img').attrs['aria-label']).toContain('Own 25');
    expect(html).not.toContain('gx-pill--live');
    expect(html).not.toContain('fixture-pass');
  });

  it('uses cumulative statistics and score only from the selected snapshot; null field state remains unavailable', () => {
    const html = render(at(2));
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).some(node => node.attrs['aria-label'] === 'Test Away score 6')).toBe(true);
    const content = [...walk(parseMarkup(html))].filter(node => node.text !== undefined).map(node => node.text).join(' ');
    expect(content).toContain('Field position unavailable');
    expect(content).toContain('Down unavailable');
    expect(content).toContain('Possession unavailable');
    expect(nodes(html).filter(node => node.attrs.class === 'gx-sim-player').map(nameFrom)).toEqual([
      'Fixture QuarterbackAWYPass yards75Rush yards0Rec yards0Passing TD1Rushing TD0Receiving TD0Receptions0',
      'Fixture Receiver With A Long NameAWYPass yards0Rush yards0Rec yards75Passing TD0Rushing TD0Receiving TD1Receptions2',
    ]);
    expect(nodes(html).some(node => node.attrs.class === 'gx-sim-ball')).toBe(false);
  });

  it.each([
    ['complete', 'Replay complete'],
    ['incomplete', 'End of supplied events — replay incomplete'],
    ['overtime_required', 'End of regulation — overtime not supported'],
  ])('labels %s at the end without claiming an actual-game final or supported overtime', (status, label) => {
    const html = render(at(3, { status }));
    expect(words(html)).toContain(label);
    expect(words(html)).not.toContain('Final score');
    expect(nodes(html).find(node => node.tag === 'button' && nameFrom(node) === 'Play').attrs).toHaveProperty('disabled');
  });

  it('does not turn empty or malformed data into a zero scoreboard', () => {
    for (const value of [null, {}, { ...replayFixture, events: [] }, { ...replayFixture, events: [{ ...replayFixture.events[0], score: { home: NaN, away: 0 } }] }]) {
      const html = render(value);
      expect(words(html)).toContain('A validated simulation is required');
      expect(nodes(html).filter(node => node.tag === 'button')).toHaveLength(0);
      expect(html).not.toContain('Simulation scoreboard');
    }
  });

  it('rejects unknown teams, duplicate events/players, unsupported quarter and missing fields without mutating the ledger', () => {
    const before = JSON.stringify(replayFixture);
    expect(isRenderableReplay(replayFixture)).toBe(true);
    for (const patch of [
      { quarter: 5 }, { clockSeconds: -1 }, { fieldPosition: 101 }, { possessionTeamId: 'unknown' }, { down: 0 }, { distance: undefined },
      { playerStats: [{ ...replayFixture.events[0].playerStats[0], teamId: 'unknown' }] },
      { playerStats: [replayFixture.events[0].playerStats[0], replayFixture.events[0].playerStats[0]] },
      { playerStats: [{ ...replayFixture.events[0].playerStats[0], passingYards: Infinity }] },
    ]) expect(isRenderableReplay({ ...replayFixture, events: [{ ...replayFixture.events[0], ...patch }] })).toBe(false);
    expect(isRenderableReplay({ ...replayFixture, events: [replayFixture.events[0], replayFixture.events[0]] })).toBe(false);
    render();
    expect(JSON.stringify(replayFixture)).toBe(before);
  });

  it('escapes captions and player names, keeps zero values, and formats quarter clocks without a running fake clock', () => {
    const html = render({ ...replayFixture, events: [{ ...replayFixture.events[0], caption: '<img src=x onerror=alert(1)>', playerStats: [{ ...replayFixture.events[0].playerStats[0], name: '<script>accountData()</script>' }] }] });
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(nodes(html).some(node => ['img', 'script'].includes(node.tag))).toBe(false);
    expect([0, 9, 60, 899, 900].map(replayClock)).toEqual(['0:00', '0:09', '1:00', '14:59', '15:00']);
  });

  it('has no service/account/storage imports and no production fixture import', () => {
    const source = fs.readFileSync(new URL('../web/src/next/simulation/ReplayViewer.jsx', import.meta.url), 'utf8');
    expect([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])).toEqual(['react', '../ui/index.js']);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|useAppData)\b/);
    expect(source).not.toContain('tests/fixtures');
  });
});
