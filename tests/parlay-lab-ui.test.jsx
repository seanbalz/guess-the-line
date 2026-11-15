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
    for (const text of ['Parlay Lab', 'The case', 'The caution', 'Evidence detail', 'Not enough current']) expect(html).toContain(text);
    expect(html).not.toContain('guaranteed');
  });
  it('does not expose hidden props from an empty server view', () => {
    const html = renderToStaticMarkup(<ParlayLab data={{now: new Date(NOW).toISOString(), assessments: []}} renderDetail={() => null} onOpen={() => {}}/>);
    expect(html).toContain('No checked props'); expect(html).not.toContain('Synthetic Receiver');
  });
});
