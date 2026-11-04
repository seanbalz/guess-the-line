// Player context on the Points ballot (Board i63): each slot's layer shows the player's last-3 and season Full PPR
// averages with game counts, the opponent and what it allows to the position, the game or practice report with the
// snapshot's time, and "Open profile" into the Fantasy profile. Contracts:
// - every average carries its game count, and a missing value is "—", never 0;
// - GTL's weekly estimate is the House (D-56): it is never on the strip, and the profile keeps it behind a lock line until
//   the read carries the House for this viewer (lock-in or kickoff);
// - no implied team total anywhere (D-57);
// - the ballot is keyed by account, so an account switch starts the slot layer and its context empty.
// Fixture players and numbers only (tests/fixtures/points-context-snapshot.mjs).
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';
import { CONTEXT_HOUSE, CONTEXT_SNAPSHOT_TIMES, pointsContextSnapshot } from './fixtures/points-context-snapshot.mjs';
import { validateFantasySnapshot } from '../shared/fantasy-rankings.mjs';

const fantasy = vi.hoisted(() => ({ state: { status: 'loading' }, keys: [] }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => null, useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/fantasyData.js', () => ({
  fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`,
  useFantasySnapshot: key => { fantasy.keys.push(key); return fantasy.state; },
}));
const { SlotLayer } = await import('../web/src/next/play/points/PointsBallot.jsx');
const { slotContext, estimateOpen, contextSettings, gamesText, CONTEXT_COPY } = await import('../web/src/next/play/points/pointsContext.js');
const { default: PointsProfile } = await import('../web/src/next/play/points/PointsProfile.jsx');

const root = path.resolve(import.meta.dirname, '..');
const SNAPSHOT = pointsContextSnapshot();
const PPR = { scoring: 'ppr', passingTds: 4 };
const ME = '11111111-1111-4111-8111-111111111111';
const slot = (name, playerId, team, gameKey, patch = {}) => ({
  slot: name, playerId, name: `Fixture ${name} Player`, team, position: name === 'FLEX' ? 'WR' : name, gameKey, kickoff: '2026-10-25T17:00:00Z',
  closed: false, state: 'open', actual: null, voidReason: null, revealed: false, own: null, house: null, lockedIn: [], guesses: [], ...patch,
});
const SLOTS = {
  QB: slot('QB', '00-fixture-0', 'PIT', '2026_07_PIT_CLE'),
  RB: slot('RB', '00-fixture-1', 'KC', '2026_07_KC_LV'),
  WR: slot('WR', '00-fixture-2', 'SEA', '2026_07_SEA_DEN'),
  FLEX: slot('FLEX', '00-fixture-4', 'MIA', '2026_07_MIA_NE'),
};
const READ = { season: 2026, week: 7, status: 'open', scoringRules: { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, result: null, slots: Object.values(SLOTS) };
const LOCKED_QB = { ...SLOTS.QB, revealed: true, own: { guess: 21, locked: true, lockedAt: '2026-10-22T18:00:00Z', points: null }, house: { estimate: CONTEXT_HOUSE.QB, points: null } };
const ready = () => ({ status: 'ready', snapshot: SNAPSHOT, retry: vi.fn() });
const sheet = (target, view = 'slot', state = ready()) => {
  fantasy.state = state;
  return renderToStaticMarkup(<div className="gx"><SlotLayer data={READ} slot={target} viewer={ME} setDirty={vi.fn()} onProfile={vi.fn()} profile={view === 'profile'}/></div>);
};
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const strip = html => text(html.match(/<section[^>]*data-points-context[\s\S]*?<\/section>/)[0]);

describe('the fixture', () => {
  it('is a valid schema 2 snapshot, and its QB estimate is the House the specs seed', () => {
    expect(validateFantasySnapshot(SNAPSHOT, { now: Date.parse('2026-11-02T00:00:00Z') })).toEqual({ valid: true, errors: [] });
    expect(contextSettings(READ)).toEqual(PPR);
  });
});

describe('slotContext: averages with game counts, the opponent, the report and its time', () => {
  it('QB: last 3 and season Full PPR per game with game counts, what CLE allowed to QBs, the practice report and the snapshot time', () => {
    const context = slotContext(SNAPSHOT, SLOTS.QB, PPR);
    expect(context.recent).toEqual({ value: 46 / 3, games: 3 });
    expect(context.season).toEqual({ value: 15.6, games: 5 });
    expect(context.opponent).toBe('@ CLE');
    expect(context.allowed).toEqual({ value: 15.2, games: 5, position: 'QB', positions: 'QBs' });
    expect(context.status).toBe('Limited Participation in Practice');
    expect(context.asOf).toBe(CONTEXT_SNAPSHOT_TIMES.asOfText);
    expect(JSON.stringify(context), 'the weekly estimate (the House) is never part of it').not.toContain('19.4');
  });

  it('missing stays missing: no games is null with a count of 0, a defense with no games is null, an absent player is not found', () => {
    expect(slotContext(SNAPSHOT, SLOTS.WR, PPR)).toMatchObject({ found: true, recent: { value: null, games: 0 }, season: { value: null, games: 0 }, status: 'Questionable' });
    expect(slotContext(SNAPSHOT, SLOTS.RB, PPR).allowed).toEqual({ value: null, games: 0, position: 'RB', positions: 'RBs' });
    expect(slotContext(SNAPSHOT, SLOTS.FLEX, PPR)).toMatchObject({ found: false, recent: { value: null }, season: { value: null }, opponent: '@ NE', allowed: null, status: null });
    expect(gamesText(0)).toBe('no games');
    expect(gamesText(1)).toBe('1 game');
  });

  it('the House gate opens only when the read carries the House for this viewer', () => {
    expect(estimateOpen(SLOTS.QB)).toBe(false);
    expect(estimateOpen({ ...SLOTS.QB, revealed: true, house: null })).toBe(false);
    expect(estimateOpen({ ...SLOTS.QB, revealed: false, house: { estimate: 19.4 } })).toBe(false);
    expect(estimateOpen(LOCKED_QB)).toBe(true);
  });
});

describe('the slot layer’s context strip', () => {
  it('reads the slot’s own week and draws three tiles, each value over its game count, and the report with its time', () => {
    fantasy.keys = [];
    const html = sheet(SLOTS.QB);
    expect(fantasy.keys).toEqual(['2026-07']);
    expect(markupProblems(html)).toEqual([]);
    const words = strip(html);
    expect(words).toContain('Player context Full PPR per game, completed games only');
    expect(words).toMatch(/Last 3 15\.3 3 games Season 15\.6 5 games @ CLE allows 15\.2 to QBs · 5 games/);
    expect(words).toContain(`Limited Participation in Practice · as of ${CONTEXT_SNAPSHOT_TIMES.asOfText}`);
    expect(html).toContain('aria-label="Open profile: Fixture QB Player"');
    expect(words).not.toContain('19.4');
    expect(words).not.toMatch(/implied/i);
  });

  it('"—" for every missing value, never 0, read out in words', () => {
    const wr = strip(sheet(SLOTS.WR));
    expect(wr).toMatch(/Last 3 — no recorded games no games Season — no recorded games no games @ DEN allows 15\.0 to WRs · 2 games/);
    expect(wr).toContain('Questionable · as of');
    const rb = strip(sheet(SLOTS.RB));
    expect(rb).toMatch(/@ LV allows — not available to RBs · no games/);
    const flex = sheet(SLOTS.FLEX);
    expect(strip(flex)).toMatch(/Last 3 — no recorded games no games Season — no recorded games no games @ NE allows — not available not in this data/);
    expect(strip(flex)).toContain(`${CONTEXT_COPY.notInSnapshot} · as of ${CONTEXT_SNAPSHOT_TIMES.asOfText}`);
    expect(flex).not.toContain('Open profile');
    for (const html of [sheet(SLOTS.WR), sheet(SLOTS.RB), flex]) expect(strip(html)).not.toMatch(/(^|\s)0(\.0)?(\s|$)/);
  });

  it('loading, a week with no data and a failed read each say so, with no numbers', () => {
    expect(strip(sheet(SLOTS.QB, 'slot', { status: 'loading' }))).toContain(CONTEXT_COPY.loading);
    expect(strip(sheet(SLOTS.QB, 'slot', { status: 'missing' }))).toContain('Player context isn’t available for Week 7 yet.');
    const failed = sheet(SLOTS.QB, 'slot', { status: 'error', retry: vi.fn() });
    expect(strip(failed)).toContain(`${CONTEXT_COPY.failed} ${CONTEXT_COPY.retry}`);
    for (const state of [{ status: 'loading' }, { status: 'missing' }, { status: 'error' }]) {
      const section = sheet(SLOTS.QB, 'slot', state).match(/<section[^>]*data-points-context[\s\S]*?<\/section>/)[0];
      expect(section).not.toContain('gx-pt-context-tile');
      expect(section).not.toContain('Open profile');
    }
  });

  it('the strip never shows the House, before or after lock-in', () => {
    expect(strip(sheet(SLOTS.QB))).not.toContain('19.4');
    expect(strip(sheet(LOCKED_QB))).not.toContain('19.4');
  });
});

describe('Open profile: the Fantasy profile as the slot’s next card', () => {
  const profile = target => renderToStaticMarkup(<div className="gx"><PointsProfile snapshot={SNAPSHOT} slot={target} settings={PPR}/></div>);

  it('replaces the slot’s card, with no Lock in, while its code loads on the tap; the region can take focus through navigation', () => {
    const html = sheet(SLOTS.QB, 'profile');
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain(CONTEXT_COPY.profileLoading);
    expect(html).toMatch(/role="group" aria-label="Player profile" tabindex="-1"[^>]*data-route-focus/);
    expect(html).not.toContain('Lock in');
    expect(html).not.toContain('data-points-context');
  });

  it('opened from an address before the week’s player data is ready, it says so in place of the profile, never an empty one', () => {
    expect(sheet(SLOTS.QB, 'profile', { status: 'loading' })).toContain(CONTEXT_COPY.profileLoading);
    expect(text(sheet(SLOTS.QB, 'profile', { status: 'missing' }))).toBe('Player context isn’t available for Week 7 yet.');
    expect(text(sheet(SLOTS.QB, 'profile', { status: 'error', retry: vi.fn() }))).toBe(`${CONTEXT_COPY.failed} ${CONTEXT_COPY.retry}`);
    for (const state of [{ status: 'loading' }, { status: 'missing' }]) expect(sheet(SLOTS.QB, 'profile', state)).not.toMatch(/Lock in|Observed production/);
  });

  it('before lock-in the GTL estimate (the House) and the rest-of-season estimate stay behind a lock line', () => {
    const html = profile(SLOTS.QB);
    expect(markupProblems(html)).toEqual([]);
    const words = text(html);
    expect(words).toContain('Observed production');
    expect(words).toContain(`GTL estimate ${CONTEXT_COPY.estimateLocked}`);
    expect(words).not.toContain('19.4');
    expect(words).not.toContain('Rest of season');
    expect(words).not.toMatch(/implied/i);
    // Revealed without the House in the read (never sent) stays locked too.
    expect(text(profile({ ...SLOTS.QB, revealed: true }))).toContain(CONTEXT_COPY.estimateLocked);
  });

  it('once the read carries the House (lock-in or kickoff), the estimate shows', () => {
    const words = text(profile(LOCKED_QB));
    expect(words).toContain('19.4');
    expect(words).not.toContain(CONTEXT_COPY.estimateLocked);
  });

  it('a player missing from the snapshot gets one sentence, not an empty profile', () => {
    expect(text(profile(SLOTS.FLEX))).toBe(`${CONTEXT_COPY.notInSnapshot}.`);
  });
});

describe('an account switch clears it', () => {
  it('the ballot is keyed by account, so the slot layer, its view and its context start empty for the next account', () => {
    const source = fs.readFileSync(path.join(root, 'web/src/next/play/points/PointsBallot.jsx'), 'utf8');
    expect(source).toMatch(/<PointsBallotView key=\{app\.accountId\} app=\{app\}/);
    // The context lives only in the slot layer (no module or storage state of its own): the strip reads useFantasySnapshot there.
    expect(source.match(/useFantasySnapshot\(/g)).toHaveLength(1);
    // The profile's code and the Fantasy stylesheets load on the tap, never with the ballot (Fantasy detail code waits for a visit).
    expect(source).not.toMatch(/FantasyTools|fantasy\.css|fantasyTools\.css/);
    expect(fs.readFileSync(path.join(root, 'web/src/next/play/points/SlotContext.jsx'), 'utf8')).toMatch(/retryViewImport\(\(\) => import\('\.\/PointsProfile\.jsx'\)\)/);
    expect(fs.readFileSync(path.join(root, 'web/src/next/play/points/pointsContext.js'), 'utf8')).not.toMatch(/localStorage|sessionStorage|let \w+ = /);
  });
});
