// Official team logos for all 32 teams (D-46, October 14, 2026). Self-hosted 128px downscaled copies of the ESPN CDN
// images listed in the nflverse teams file, each verified transparent (alpha channel, transparent corners). Used only
// to identify a team next to its name, under the trademark notice below; not licensed, no endorsement. Records:
// docs/TEAM_LOGO_SOURCES.md#official-logos-d-46 and public/team-logos/sources.json.
import { EPL_CLUBS } from '../../shared/epl-clubs.mjs';

export const TEAM_TRADEMARK_NOTICE = 'NFL and team names, logos and marks are trademarks of the NFL and its teams; used here only to identify the teams. No endorsement.';


const official = code => Object.freeze({
  src: `/team-logos/${code.toLowerCase()}.png`,
  rightsStatus: 'trademark-identification',
  transparent: true,
  rightsReference: 'docs/TEAM_LOGO_SOURCES.md#official-logos-d-46',
});

export const approvedTeamLogos = Object.freeze(Object.fromEntries(
  'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'
    .split(' ').map(code => [code, official(code)]),
));

// Original Guess The Line badges (D-22). Since D-46 every team has an official logo; a team's badge, where one was
// drawn, is the fallback shown when that logo fails to load. GTL artwork using factual team colors and abbreviations;
// not official marks. See docs/TEAM_LOGO_SOURCES.md#original-badges.
export const originalTeamBadges = Object.freeze({
  ARI: Object.freeze({ src: '/team-logos/badges/ari.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  ATL: Object.freeze({ src: '/team-logos/badges/atl.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  BAL: Object.freeze({ src: '/team-logos/badges/bal.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  BUF: Object.freeze({ src: '/team-logos/badges/buf.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  CAR: Object.freeze({ src: '/team-logos/badges/car.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  CLE: Object.freeze({ src: '/team-logos/badges/cle.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  DEN: Object.freeze({ src: '/team-logos/badges/den.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  DET: Object.freeze({ src: '/team-logos/badges/det.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  HOU: Object.freeze({ src: '/team-logos/badges/hou.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  JAX: Object.freeze({ src: '/team-logos/badges/jax.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  LV: Object.freeze({ src: '/team-logos/badges/lv.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  MIA: Object.freeze({ src: '/team-logos/badges/mia.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  MIN: Object.freeze({ src: '/team-logos/badges/min.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  NE: Object.freeze({ src: '/team-logos/badges/ne.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  NYJ: Object.freeze({ src: '/team-logos/badges/nyj.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  PHI: Object.freeze({ src: '/team-logos/badges/phi.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  SEA: Object.freeze({ src: '/team-logos/badges/sea.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  TB: Object.freeze({ src: '/team-logos/badges/tb.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
  TEN: Object.freeze({ src: '/team-logos/badges/ten.svg', rightsStatus: 'original', transparent: true, rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges' }),
});

/** Official logo when one exists, otherwise the original GTL badge. */
export const teamMarks = Object.freeze({ ...originalTeamBadges, ...approvedTeamLogos });

export const teamAliases = Object.freeze({ JAC: 'JAX', LA: 'LAR', WSH: 'WAS' });
const markSource = /^\/team-logos\/(?:badges\/)?[a-z0-9-]+\.(svg|png|webp)$/;

function canonicalCode(code) {
  const label = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return teamAliases[label] || label;
}

function usable(candidate) {
  const badge = typeof candidate?.src === 'string' && candidate.src.startsWith('/team-logos/badges/');
  const reviewed = (candidate?.rightsStatus === 'trademark-identification' && !badge) || (candidate?.rightsStatus === 'original' && badge);
  return Boolean(reviewed && candidate.transparent === true && candidate.rightsReference && markSource.test(candidate.src));
}

/** Returns the local mark for a team code (aliases accepted), or null. */
export function resolveTeamMark(code) {
  const key = canonicalCode(code);
  const candidate = Object.hasOwn(teamMarks, key) ? teamMarks[key] : null;
  return usable(candidate) ? candidate : null;
}

/** The original GTL badge for a team code (aliases accepted), shown when its official logo fails to load, or null. */
export function resolveTeamBadge(code) {
  const key = canonicalCode(code);
  const candidate = Object.hasOwn(originalTeamBadges, key) ? originalTeamBadges[key] : null;
  return candidate?.rightsStatus === 'original' && usable(candidate) ? candidate : null;
}

// Premier League crests (plan 2026-10-28-epl-pick-a-team.md, Task 6): the D-46 rule extended to the 20 EPL clubs.
// Self-hosted 128px downscaled copies of ESPN CDN crests, used only to identify a club next to its name, under the notice
// below; not licensed, no endorsement. Records: docs/TEAM_LOGO_SOURCES.md#premier-league-crests and
// public/team-logos/epl/sources.json. Kept apart from teamMarks so an EPL code never resolves as an NFL team.
export const EPL_TRADEMARK_NOTICE = 'Premier League and club names, crests and marks are trademarks of their owners; used here only to identify the clubs. No endorsement.';

const clubCrests = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(
  EPL_CLUBS.map(({ code, name }) => [code, Object.freeze({ src: `/team-logos/epl/${code}.png`, alt: `${name} crest` })]),
)));

/** The self-hosted crest `{src, alt}` for an EPL club code (case and surrounding space ignored), or null. */
export function resolveClubCrest(code) {
  const key = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return clubCrests[key] ?? null;
}

export default approvedTeamLogos;
