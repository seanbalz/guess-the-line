import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NbaTeamBadge } from '../web/src/next/nba/NbaTeamBadge.jsx';
import { NbaMatchup } from '../web/src/next/nba/NbaMatchup.jsx';
import { NBA_TEAMS } from '../shared/nba-teams.mjs';
import { approvedTeamLogos, resolveNbaTeamLogo, resolveTeamBadge, resolveTeamMark } from '../web/src/teamLogoRegistry.js';
import { markupProblems } from './helpers/ui-markup.mjs';

// Sean, November 11, 2026 (D-85): "we need nba logo and team logos not letters". NBA badges are official logos,
// looked up by NBA code only; thirteen NBA codes are also NFL codes and must never draw an NFL logo.
const COLLIDING = ['ATL', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'HOU', 'IND', 'LAC', 'MIA', 'MIN', 'PHI', 'WAS'];
const render = element => renderToStaticMarkup(<div className="gx">{element}</div>);
const imgSrc = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);

describe('NbaTeamBadge', () => {
  it('contract: all 30 NBA codes draw their own NBA logo in a glass circle, named by the full team name', () => {
    expect(NBA_TEAMS).toHaveLength(30);
    for (const { code, name } of NBA_TEAMS) for (const size of [24, 32, 48]) {
      const html = render(<NbaTeamBadge code={code} size={size}/>);
      expect(imgSrc(html), code).toEqual([`/team-logos/nba/${code}.png`]);
      expect(html).toContain('data-mark="nba-logo"');
      expect(html).toContain(`class="gx-team gx-team--${size} gx-nba-badge"`);
      expect(html).toContain(`aria-label="${name}"`);
      expect(markupProblems(html)).toEqual([]);
    }
  });

  it('contract: every NBA code that is also an NFL code resolves to the NBA asset, never /team-logos/<nfl>.png', () => {
    const nfl = new Set(Object.keys(approvedTeamLogos));
    expect(NBA_TEAMS.map(team => team.code).filter(code => nfl.has(code)).sort()).toEqual(COLLIDING);
    for (const code of COLLIDING) {
      const nbaLogo = resolveNbaTeamLogo(code);
      expect(nbaLogo.src).toBe(`/team-logos/nba/${code}.png`);
      expect(nbaLogo.src).not.toBe(resolveTeamMark(code).src);
      expect(nbaLogo.src).not.toBe(resolveTeamBadge(code)?.src);
      const html = render(<NbaTeamBadge code={code}/>);
      expect(imgSrc(html)).toEqual([`/team-logos/nba/${code}.png`]);
      expect(html).not.toMatch(/\/team-logos\/[a-z]+\.png|\/team-logos\/badges\//);
    }
  });

  it('contract: a code with no NBA logo keeps letters in the same glass circle, with no image and no NFL fallback', () => {
    for (const code of ['SEA', 'KC', 'XYZ']) {
      const html = render(<NbaTeamBadge code={code}/>);
      expect(imgSrc(html)).toEqual([]);
      expect(html).toContain('data-mark="letters"');
      expect(html).toContain(`>${code}</text>`);
    }
    expect(render(<NbaTeamBadge code={null}/>)).toContain('aria-label="Team unavailable"');
  });

  it('contract: a matchup reads as full team names and shows codes beside each logo', () => {
    const html = render(<NbaMatchup away="PHI" home="MIA"/>);
    expect(html).toContain('aria-label="Philadelphia 76ers"');
    expect(html).toContain('aria-label="Miami Heat"');
    expect(html).toContain('<span class="gx-sr-only">at</span>');
    expect(imgSrc(html)).toEqual(['/team-logos/nba/PHI.png', '/team-logos/nba/MIA.png']);
    expect(markupProblems(html)).toEqual([]);
  });
});
