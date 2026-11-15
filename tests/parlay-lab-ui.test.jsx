import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ParlayLab from '../web/src/next/research/ParlayLab.jsx';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { fixture, NOW } from './fixtures/research-assessments.mjs';

describe('Parlay Lab', () => {
  it('renders checked prop evidence and cautions, with empty combinations instead of forced picks', () => {
    const data = buildResearchAssessments({...fixture(), now: NOW});
    const html = renderToStaticMarkup(<ParlayLab data={data} renderDetail={() => <p>Evidence detail</p>} onOpen={() => {}}/>);
    for (const text of ['Parlay Lab', 'Projection center', 'Matchup spotlight', 'Range unavailable', 'No qualified projection model', 'Open matchup source', 'The case', 'The caution', 'Evidence detail', 'Not enough current']) expect(html).toContain(text);
    expect(html).not.toContain('guaranteed');
    expect(html).toContain('Yards per route');
    expect(html).not.toContain('78.4');
  });
  it('does not expose hidden props from an empty server view', () => {
    const html = renderToStaticMarkup(<ParlayLab data={{now: new Date(NOW).toISOString(), assessments: []}} renderDetail={() => null} onOpen={() => {}}/>);
    expect(html).toContain('No checked props'); expect(html).not.toContain('Synthetic Receiver');
  });
  it('never highlights ineligible matchup metrics or fabricates a model', () => {
    const data = buildResearchAssessments({...fixture(), now: NOW});
    const prop = data.assessments.find(a => a.selection.market === 'prop');
    prop.evidence.forEach(e => { e.eligible = false; e.metric.value = 9876.5; });
    const html = renderToStaticMarkup(<ParlayLab data={data} renderDetail={() => null} onOpen={() => {}}/>);
    expect(html).toContain('No qualifying matchup evidence');
    expect(html).not.toContain('9876.5');
    expect(html).toContain('Projection</dt><dd>Unavailable');
  });
  it('bounds each card section while preserving the full assessed list elsewhere', () => {
    const data = buildResearchAssessments({...fixture(), now: NOW});
    const prop = data.assessments.find(a => a.selection.market === 'prop');
    data.assessments = Array.from({length: 15}, (_, i) => ({...prop, id: `fixture-${i}`}));
    const html = renderToStaticMarkup(<ParlayLab data={data} renderDetail={() => null} onOpen={() => {}}/>);
    expect((html.match(/View research/g) ?? []).length).toBe(6);
    expect((html.match(/Open matchup source/g) ?? []).length).toBe(6);
    expect((html.match(/Open full research/g) ?? []).length).toBe(6);
  });
  it('renders binary touchdown markets without inventing a numeric threshold', () => {
    const data = buildResearchAssessments({...fixture(), now: NOW});
    const prop = data.assessments.find(a => a.selection.market === 'prop');
    prop.selection = {...prop.selection, key: 'player_anytime_td', side: 'yes', line: null, unit: 'touchdown'};
    const html = renderToStaticMarkup(<ParlayLab data={data} renderDetail={() => null} onOpen={() => {}}/>);
    expect(html).toContain('yes · touchdown');
    expect(html).not.toContain('yes null');
  });
});
