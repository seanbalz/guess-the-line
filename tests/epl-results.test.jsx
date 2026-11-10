// Pick a Team results on EPL Home and Play › Pick a Team (EPL delivery stage 4, docs/EPL_FEATURES_2026_11_09.md item 6):
// the ResultsCard drawn from `results` on one epl/draft/read reply. FINAL names the winner(s), club, score, margin and bonus,
// or no winner; PENDING says what still waits. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { ResultsCard, RESULTS_COPY, resultsModel } = await import('../web/src/next/epl/ResultsCard.jsx');
const { PickATeamView } = await import('../web/src/next/epl/PickATeam.jsx');
const { EplHomeView } = await import('../web/src/next/epl/EplHome.jsx');
const { boardModel } = await import('../web/src/next/epl/draftModel.js');

const NEMO = '865667912365666304', MARK = '1257180071064510465';
const DEADLINE = '2026-11-21T12:30:00.000Z';
const NOW = Date.parse('2026-11-10T00:00:00.000Z');
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const winner = (ownerId, name, club, clubName, goalsFor, goalsAgainst, opponentName, home = true) => ({ ownerId, name, club, clubName, opponent: 'BOU', opponentName,
  home, goalsFor, goalsAgainst, margin: goalsFor - goalsAgainst, bonus: (goalsFor - goalsAgainst) * 5 });
const FINAL = { season: 2026, week: 11, status: 'final', review: false, matches: { total: 10, final: 9, postponed: 1, pending: 0 },
  winners: [winner(NEMO, 'Nemo', 'MNC', 'Manchester City', 3, 0, 'Bournemouth')] };
function read(results) {
  return { season: 2026, week: 12, status: 'open', deadline: DEADLINE, me: NEMO,
    order: [{ ownerId: NEMO, name: 'Nemo' }, { ownerId: MARK, name: 'Mark' }], picks: [], onTheClock: NEMO,
    clubs: [{ code: 'ARS', name: 'Arsenal', opponent: 'CHE', home: true, kickoff: DEADLINE }, { code: 'CHE', name: 'Chelsea', opponent: 'ARS', home: false, kickoff: DEADLINE }],
    myQueue: [], bonusLastWeek: [], claim: null, results };
}
const card = results => renderToStaticMarkup(<div className="gx"><ResultsCard results={resultsModel(results)}/></div>);

describe('ResultsCard', () => {
  it('a final week names the winner, club, result, margin and earned bonus', () => {
    const page = card(FINAL);
    expect(text(page)).toContain('MW11 Pick a Team results Final Winner Nemo · Manchester City +15 bonus 3-0 vs Bournemouth · won by 3');
    expect(text(page)).toContain('1 match postponed');
    expect(text(page)).toContain(RESULTS_COPY.sleeper);
    expect(page).toContain('data-epl-results="final"');
    expect(page).toContain('gx-pill--win');
    expect(markupProblems(page)).toEqual([]);
  });

  it('a full shared tie lists every winner with the full bonus and says why', () => {
    const tie = { ...FINAL, winners: [winner(NEMO, 'Nemo', 'MNC', 'Manchester City', 3, 0, 'Bournemouth'), winner(MARK, 'Mark', 'BRE', 'Brentford', 3, 0, 'Fulham', false)] };
    const page = card(tie);
    expect(text(page)).toContain('2 winners · shared tie');
    expect(text(page)).toContain('Nemo · Manchester City +15 bonus');
    expect(text(page)).toContain('Mark · Brentford +15 bonus 3-0 at Fulham · won by 3');
    expect(text(page)).toContain(RESULTS_COPY.shared);
    expect(markupProblems(page)).toEqual([]);
  });

  it('no winner is announced as final with no bonus', () => {
    const page = card({ ...FINAL, winners: [] });
    expect(text(page)).toContain('Final');
    expect(text(page)).toContain(RESULTS_COPY.noWinner);
    expect(text(page)).not.toContain('bonus ·');
  });

  it('a pending week says how many matches are verified and never shows a winner', () => {
    const pending = { ...FINAL, status: 'pending', matches: { total: 10, final: 8, postponed: 1, pending: 1 }, winners: FINAL.winners };
    const page = card(pending);
    expect(text(page)).toContain('Pending');
    expect(text(page)).toContain('Waiting for verified final scores · 8 of 9 matches final');
    expect(text(page)).toContain(RESULTS_COPY.waitingBody);
    expect(text(page)).not.toContain('Nemo');
    expect(page).toContain('role="status"');
    expect(page).toContain('gx-pill--pending');
    expect(text(card({ ...pending, review: true }))).toContain(RESULTS_COPY.review);
    expect(markupProblems(page)).toEqual([]);
  });

  it('malformed results draw nothing', () => {
    for (const bad of [null, {}, { ...FINAL, status: 'guessed' }, { ...FINAL, matches: { total: 0, final: 0, postponed: 0, pending: 0 } }, { ...FINAL, week: '11' }])
      expect(resultsModel(bad)).toBe(null);
    expect(resultsModel({ ...FINAL, winners: [{ ...FINAL.winners[0], margin: 0 }] }).winners).toEqual([]);
  });
});

describe('the screens', () => {
  it('Pick a Team shows last matchweek\'s results in place of the bonus card; without results the bonus card stays', () => {
    const model = boardModel(read(FINAL), NOW);
    const page = renderToStaticMarkup(<div className="gx"><PickATeamView model={model} state={{ status: 'ready' }} selected={null} busy={false} notice={null}
      onSelect={() => {}} onPick={() => {}} onQueue={() => {}} onDismissNotice={() => {}} onRetry={() => {}}/></div>);
    expect(text(page)).toContain('MW11 Pick a Team results Final');
    expect(text(page)).not.toContain('Last matchweek’s bonus');
    expect(markupProblems(page)).toEqual([]);
    const without = renderToStaticMarkup(<div className="gx"><PickATeamView model={boardModel(read(null), NOW)} state={{ status: 'ready' }} selected={null} busy={false} notice={null}
      onSelect={() => {}} onPick={() => {}} onQueue={() => {}} onDismissNotice={() => {}} onRetry={() => {}}/></div>);
    expect(text(without)).toContain('Last matchweek’s bonus');
  });

  it('EPL Home announces the results under the draft hero, independent of the open draft', () => {
    const model = boardModel(read(FINAL), NOW);
    const page = renderToStaticMarkup(<div className="gx"><EplHomeView model={model} state={{ status: 'ready' }} now={NOW} moneyline={null} onOpenPick={() => {}} onOpenGuess={() => {}} onRetry={() => {}}/></div>);
    expect(text(page)).toContain('Matchweek 12');
    expect(text(page)).toContain('MW11 Pick a Team results Final Winner Nemo · Manchester City +15 bonus');
    expect(page.indexOf('gx-epl-hero')).toBeLessThan(page.indexOf('data-epl-results'));
    expect(markupProblems(page)).toEqual([]);
    const pending = renderToStaticMarkup(<div className="gx"><EplHomeView model={boardModel(read({ ...FINAL, status: 'pending', matches: { total: 10, final: 9, postponed: 0, pending: 1 } }), NOW)}
      state={{ status: 'ready' }} now={NOW} moneyline={null} onOpenPick={() => {}} onOpenGuess={() => {}} onRetry={() => {}}/></div>);
    expect(text(pending)).toContain('Waiting for verified final scores · 9 of 10 matches final');
  });
});
