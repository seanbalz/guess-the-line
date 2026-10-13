// Render test for the situational trends panel (vitest + react-dom/server, no browser). It renders the
// committed 2026 Week 6 trends file through the same components the Community Picks tab, the group
// ballot and the dashboard mount, and checks the card layout, reveal gating, referee precedence,
// the empty state and the copy guard.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import week from '../shared/trends/2026-week-06.json';
import { bannedCopy } from '../shared/trends.mjs';
import TrendsView from '../web/src/TrendsView.jsx';
import { RowCard, Sparkline, TrendCard, TrendTable } from '../web/src/TrendCard.jsx';
import { parseItem } from '../shared/trends-view.mjs';
import GameTrends, { TrendsExpander } from '../web/src/GameTrends.jsx';

const render = props => renderToStaticMarkup(<TrendsView week={week} level={4} {...props}/>);
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const count = (html, needle) => html.split(needle).length - 1;

describe('trend card (Sean’s TrendsCenter layout)', () => {
  const card = week.cards['team_ats|t:t_ats_season_cold'];
  const item = week.games.find(g => g.id === 'HOU-JAX').tier2[0];
  const html = renderToStaticMarkup(<TrendCard week={week} card={card} item={item} level={5}/>);
  it('shows title, market, record, win rate, ROI, units, streak, last 10, games, years, units line and filters', () => {
    expect(html).toContain('<h5');
    expect(text(html)).toContain(`${card.title} · HOU`);
    expect(text(html)).toContain('NFL · ATS · Back HOU ATS');
    for (const term of ['Record', 'Win rate', 'ROI (−110)', 'Units', 'Streak', 'Last 10', 'Games', 'Years']) expect(html).toContain(`<dt>${term}</dt>`);
    const r = card.record;
    expect(text(html)).toContain(`${r.W}-${r.L}-${r.P}`);
    expect(html).toMatch(/<svg class="trend-spark"[^>]*role="img"[^>]*aria-label="Cumulative units at −110: [+−]\d+\.\d{2} after [\d,]+ bets; lowest [−+]?\d+\.\d{2}( in \d{4})?"/);
    expect(html).toContain('<title>Cumulative units at −110:');
    for (const filter of card.filters) expect(text(html)).toContain(filter);
  });
  it('keeps the selection period and the prospective record apart from the in-sample record', () => {
    expect(text(html)).toContain('Registered side, every game since 2002 (in-sample)');
    expect(text(html)).toContain(`${week.copy.selection}: ${card.selection.rec.join('-')}`);
    expect(text(html)).toContain(`${week.copy.prospective}: 0-0-0`);
    expect(text(html)).toContain(`q ${card.q.toFixed(3)}`);
    expect(text(html)).toContain(card.label);
    expect(text(html)).toContain(`Score ${card.score.score}/100`);
    expect(text(html)).toContain('How this score is built');
  });
  it('labels the Tier 1 wind card with its stored permutation statistic and a 3-digit q', () => {
    const wind = renderToStaticMarkup(<TrendCard week={week} card={week.cards['total|g:g_wind10']}/>);
    expect(text(wind)).toContain('Strongest historical evidence (played games only)');
    expect(text(wind)).toContain('q 0.103');
    expect(text(wind)).toContain('permutation p 0.0099');
  });
  it('draws a zero baseline and gives the final value in text, never by color alone', () => {
    const line = renderToStaticMarkup(<Sparkline series={[0, -2, 1.5]} label="Cumulative units at −110: +1.50"/>);
    expect(line).toContain('class="trend-spark-zero"');
    expect(line).toContain('class="trend-spark-end up"');
    expect(renderToStaticMarkup(<Sparkline series={[0]} label="x"/>)).toBe('');
  });
});

describe('compact rows are two-sided and walk-forward, never a winner by construction', () => {
  it('shows Tier 3 history both ways and card fields from the walk-forward record', () => {
    const html = renderToStaticMarkup(<RowCard week={week} id="total|g:g_all" level={5}/>);
    expect(text(html)).toContain('Since 2002, both ways (in-sample): Over 3212 · Under 3270 · Pushes 95');
    expect(text(html)).toContain('Walk-forward from 2003: each season’s side chosen from earlier seasons only');
    expect(text(html)).toContain('3095-3123-92');
    expect(text(html)).toContain('No proven edge');
    expect(text(html)).toContain('Walk-forward 2018–2025: 1131-1074-22');
  });
  it('treats straight-up records as descriptive, without units or ROI', () => {
    const html = renderToStaticMarkup(<RowCard week={week} id="su|team:SEA+venue:road" team="SEA" level={5}/>);
    expect(text(html)).toContain('Descriptive');
    expect(html).not.toContain('<dt>ROI (−110)</dt>');
    expect(html).not.toContain('<dt>Units</dt>');
    expect(text(html)).toContain('SEA won 101 · SEA lost 104 · Ties 1');
  });
  it('never labels a league-wide trait, coach career or QB career split as the bound team’s own record', () => {
    // SEA at DEN: "Team won its last game" is every team since 2002, Sean Payton's career includes New Orleans,
    // and a QB's career counts every team he started for.
    const game = week.games.find(g => g.id === 'SEA-DEN');
    const trait = text(renderToStaticMarkup(<RowCard week={week} id="team_ats|t:t_off_win" team="DEN" level={5}/>));
    expect(trait).toContain('Team won its last game: ATS · DEN');
    expect(trait).toMatch(/Team with the trait covered \d+ · Opponent covered \d+ · Pushes \d+/);
    expect(trait).not.toContain('DEN covered');
    const coachId = game.entities.coaches.DEN.ats, qbId = game.entities.qbs.SEA.ats;
    const table = text(renderToStaticMarkup(<TrendTable week={week} caption="x" items={[{ id: coachId, team: 'DEN' }, { id: qbId, team: 'SEA' }, { id: game.entities.teams.DEN.ats, team: 'DEN' }]}/>));
    expect(table).toContain('Coach’s team covered');
    expect(table).toContain('QB’s team covered');
    expect(table).not.toContain('SEA covered');
    expect(count(table, 'DEN covered')).toBe(1);
    // Across every game file item bound to a team, "<TEAM> covered" or "<TEAM> won" appears only for that team's own team:X rows.
    let checked = 0;
    for (const g of week.games) {
      const ctx = (g.context || []).flatMap(e => [e.lead?.ats, e.lead?.ou, ...(e.more || [])]).filter(Boolean).map(parseItem);
      const ent = Object.entries(g.entities || {}).flatMap(([kind, v]) => (kind === 'h2h' ? [] : Object.entries(v).flatMap(([team, e]) => [e.ats, e.su].filter(Boolean).map(id => ({ id, team })))));
      const gated = Object.values(g.gated || {}).flat().map(parseItem);
      for (const { id, team } of [...ctx, ...ent, ...gated]) {
        if (!team || !week.rows[id]) continue;
        const own = id.split('|')[1].split('+').includes(`team:${team}`);
        const out = text(renderToStaticMarkup(<RowCard week={week} id={id} team={team} level={5}/>));
        expect(out.includes(`${team} covered`) || out.includes(`${team} won`), id).toBe(own);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('trends panel', () => {
  it('orders evidence, consistent-not-proven, watch list, referee, context and teams; gated records stay locked before a ballot', () => {
    const html = render({ gameId: 'HOU-JAX' }), t = text(html);
    const order = ['Strongest historical evidence', 'Consistent, not proven', 'Referee', 'Context (no proven edge)', 'Teams, coaches, quarterbacks and head to head', 'Unlocks after your Spread ballot'];
    const at = order.map(label => t.indexOf(label));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(t).toContain(week.copy.windConditional);
    expect(t).toContain(week.copy.calibration);
    expect(t).toContain('Back HOU ATS');
    expect(t).toContain('International: London (LON00), 09:30 ET');
    expect(html).not.toContain('This game');
    expect(html).not.toContain('Spread-dependent records');
    expect(t).toContain('No line is shown before then.');
  });
  it('credits nflverse with the license link and names the line source', () => {
    const html = render({ gameId: 'SEA-DEN' });
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('href="https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"');
    expect(text(html)).toContain(week.copy.credit);
    expect(text(html)).toContain(week.copy.lineSource);
    expect(text(html)).toContain('Trends never change GTL scoring.');
    expect(text(html)).toContain(week.copy.reference);
  });
  it('a Spread ballot unlocks spread bands only, marked with the player’s own saved line', () => {
    // App home spread −3 is DEN favored by 3: nflverse +3, the "exactly 3" and "home favored by 1 to 3" bands.
    const html = render({ gameId: 'SEA-DEN', access: { spread: true }, saved: { spread: -3, total: 47.5 } }), t = text(html);
    expect(t).toContain('Spread-dependent records');
    expect(t).toContain('Rows marked “This game” fit DEN −3 (your saved line).');
    expect(html).toMatch(/<tr aria-current="true" class="trend-current"><th scope="row">Spread exactly 3: home vs road ATS<strong class="trend-this">This game<\/strong>/);
    expect(html).toMatch(/<tr aria-current="true" class="trend-current"><th scope="row">DEN as the favorite: ATS<strong class="trend-this">This game<\/strong>/);
    expect(html).toMatch(/<tr><th scope="row">SEA as the favorite: ATS<\/th>/);
    // The Total market stays locked: no total band, no saved total in the text.
    expect(t).toContain('Unlocks after your Total ballot');
    expect(t).not.toContain('total 47.5 (your saved line)');
    expect(t).not.toContain('Total-dependent records');
    expect(t).toContain('Unlocks after both ballots');
  });
  it('a Total submission never unlocks spread-gated records', () => {
    const html = render({ gameId: 'SEA-DEN', access: { total: true }, saved: { spread: -3, total: 47.5 } }), t = text(html);
    expect(t).toContain('Unlocks after your Spread ballot');
    expect(t).not.toContain('Spread-dependent records');
    expect(t).not.toContain('DEN −3');
    expect(t).toContain('Total-dependent records');
    expect(html).toMatch(/<tr aria-current="true" class="trend-current"><th scope="row">Total 47 to 50.5: over\/under<strong class="trend-this">This game<\/strong>/);
  });
  it('without a held line the unlocked tables stay unmarked and say how to find the band', () => {
    const html = render({ gameId: 'SEA-DEN', access: { spread: true, total: true } });
    expect(html).not.toContain('This game</strong>');
    expect(text(html)).toContain('Find this game’s band with your saved line');
    expect(text(html)).toContain('Records that need both lines');
  });
  it('a line held for a locked market is ignored', () => {
    const html = render({ gameId: 'SEA-DEN', access: {}, saved: { spread: -3, total: 47.5 } });
    expect(html).not.toContain('This game</strong>');
    expect(text(html)).not.toContain('DEN −3');
  });
  it('dome games carry no wind note, and pending teams wait for the final', () => {
    const t = text(render({ gameId: 'BUF-LV' }));
    expect(t).toContain('Strong wind trends do not apply indoors (dome or closed roof).');
    expect(t).not.toContain(week.copy.windConditional);
    expect(t).toContain('Updates after the final');
    expect(t).toContain('BUF has an earlier game without a final score');
  });
  it('shows an empty state for a game the file does not cover', () => {
    expect(text(render({ gameId: 'TB-DAL' }))).toContain('No trends for this game in the Week 6 trends file.');
  });
});

describe('referee', () => {
  it('reads "Referee not assigned yet" until a referee is assigned, and offers every referee in the file', () => {
    const html = render({ gameId: 'SEA-DEN' });
    expect(text(html)).toContain('Referee not assigned yet.');
    expect(count(html, '<option value="')).toBe(week.refereeOptions.length + 1);
    expect(html).toContain('<label for=');
    expect(text(html)).toContain('Look up a referee for SEA at DEN');
  });
  it('shows the commissioner’s assignment with its career and primetime records', () => {
    const t = text(render({ gameId: 'SEA-DEN', officials: { assignments: { 'SEA-DEN': { referee: 'Scott Novak', setAt: '2026-10-14T18:00:00Z' } } } }));
    expect(t).toContain('Assigned referee: Scott Novak (set by the commissioner)');
    expect(t).toContain('Referee Scott Novak: career over/under');
    expect(t).toContain('Referee Scott Novak, primetime: over/under');
    expect(t).not.toContain('Referee Scott Novak, divisional games');
    expect(t).toContain('Over 56 · Under 60 · Pushes 0');
  });
  it('the commissioner’s assignment (even a cleared one) wins over the static file; the file wins over nothing', () => {
    const file = { ...week, assignedReferees: { ...week.assignedReferees, 'SEA-DEN': 'Shawn Hochuli' } };
    expect(text(renderToStaticMarkup(<TrendsView week={file} gameId="SEA-DEN"/>))).toContain('Assigned referee: Shawn Hochuli (from this week’s trends file)');
    expect(text(renderToStaticMarkup(<TrendsView week={file} gameId="SEA-DEN" officials={{ assignments: { 'SEA-DEN': { referee: null } } }}/>))).toContain('Referee not assigned yet.');
    expect(text(renderToStaticMarkup(<TrendsView week={file} gameId="SEA-DEN" officials={{ assignments: { 'SEA-DEN': { referee: 'Scott Novak' } } }}/>))).toContain('Assigned referee: Scott Novak');
  });
  it('a referee with no games in the file says so instead of showing empty records', () => {
    const t = text(render({ gameId: 'SEA-DEN', officials: { assignments: { 'SEA-DEN': { referee: 'Jerome Boger' } } } }));
    expect(t).toContain('No referee records for Jerome Boger in this file');
  });
});

describe('expander and copy guard', () => {
  it('the Trends button is a disclosure that names its game and controls its panel', () => {
    const html = renderToStaticMarkup(<GameTrends season={2026} week={6} gameId="SEA-DEN" away="SEA" home="DEN"/>);
    const [, controls] = /aria-controls="([^"]+)"/.exec(html);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`<div id="${controls}" class="game-trends-body" hidden="">`);
    expect(text(html)).toContain('Trends for SEA at DEN');
    expect(renderToStaticMarkup(<TrendsExpander open controls="x" away="A" home="B"/>)).toContain('aria-expanded="true"');
  });
  it('no rendered panel uses betting-tip language, in any reveal state', () => {
    // Proper names are data, not copy: QB Drew Lock would otherwise trip the "lock" rule.
    const names = new Set([...week.refereeOptions, ...week.games.flatMap(g => [...Object.values(g.entities.qbs), ...Object.values(g.entities.coaches)].map(e => e.name))]);
    const strip = value => [...names].reduce((out, name) => out.split(name).join(' '), value);
    expect(bannedCopy('QB Drew Lock starts')).toEqual(['lock']);
    for (const game of week.games) for (const access of [{}, { spread: true, total: true }]) {
      const html = render({ gameId: game.id, access, saved: { spread: -3.5, total: 44.5 } });
      expect(bannedCopy(strip(text(html))), `${game.id} ${JSON.stringify(access)}`).toEqual([]);
    }
  });
});
