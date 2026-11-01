import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: vi.fn() }));
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { fixture, NOW } from './fixtures/research-assessments.mjs';
import { expireAssessments } from '../web/src/next/research/useAssessments.js';
import { AssessmentDetail, ObservedGameStatistics, ResearchCoverage, assessmentEmptyMessage } from '../web/src/next/research/Assessments.jsx';
import { fragmentFor, placeFromFragment } from '../web/src/next/shell/router.js';

describe('research assessments remain distinct from guess gaps', () => {
  it('explains missing data and closed gates separately from a filter without claiming coverage', () => {
    const data = { coverage: { history: { status: 'stale' }, externalEvidence: 'empty', playStatistics: 'unavailable', currentQuotes: false, games: [{ closed: false, spreadAccessible: false, totalAccessible: false }] } };
    expect(assessmentEmptyMessage(data)).toContain('Lock in');
    data.coverage.games[0].closed = true;
    expect(assessmentEmptyMessage(data)).toContain('closed');
    const html = renderToStaticMarkup(<ResearchCoverage data={data}/>);
    for (const text of ['history needs updating', 'trend recommendations are paused', 'No reviewed snapshot', 'No current retained quotes']) expect(html).toContain(text);
  });
  it('shows actual zero scoring observations and exposes their samples, recent form and source', () => {
    const scoring = { gameId: 'SEA-DEN', teams: [{ team: 'SEA', pointsPerGame: 0, pointsAllowedPerGame: 7, sample: 1, from: '2026-10-20', to: '2026-10-20', recent: { sample: 1, pointsPerGame: 0, pointsAllowedPerGame: 7 }, games: [{ gameId: 'completed', date: '2026-10-20', scored: 0, allowed: 7 }], definition: 'Completed games only.' }] };
    const html = renderToStaticMarkup(<ObservedGameStatistics scoring={scoring}/>);
    for (const text of ['0.0', '1 games', '2026-10-20', 'CC BY 4.0', 'Recent games', 'Both game markets must be open']) expect(html).toContain(text);
  });
  it('shows source provenance, exact odds, assumptions and sample with no invented edge percentage', () => {
    const f = fixture(), assessment = buildResearchAssessments({ ...f, now: NOW }).assessments[0];
    const html = renderToStaticMarkup(<AssessmentDetail assessment={assessment} onTrack={vi.fn()}/>);
    for (const text of ['Research lean', 'Source-reported', 'routes run against zone', 'Synthetic starter plays.', '40', 'DraftKings', 'Track this bet']) expect(html).toContain(text);
    expect(html).not.toContain('Estimated value'); expect(html).not.toContain('confidence');
  });
  it('expires quotes against elapsed server time, never the device clock', () => {
    const data = buildResearchAssessments({ ...fixture(), now: NOW });
    expect(expireAssessments(data, 0).assessments[0].color).toBe('yellow');
    const expired = expireAssessments(data, 3600000); expect(expired.assessments[0].color).toBe('gray'); expect(expired.assessments[0].quote).toBeNull();
    expect(data.assessments[0].color).toBe('yellow');
  });
  it('retains opaque nested addresses while rejecting an unknown or overlong assessment key', () => {
    const view = { view: 'research', matchup: 'SEA-DEN', assessment: 'fixture-over' };
    expect(placeFromFragment(fragmentFor('bets', view)).view).toEqual(view);
    expect(placeFromFragment('#bets/research?assessment=%3Cscript%3E').view).not.toHaveProperty('assessment');
    expect(placeFromFragment('#bets/research?assessment=' + 'a'.repeat(101)).view).not.toHaveProperty('assessment');
    expect(placeFromFragment('#bets/recommended').view.view).toBe('recommended');
  });
});
