import { expect } from '@playwright/test';
import { handleSocial } from '../../cloud/social.mjs';
import { emptySocialState } from '../../shared/social-bets.mjs';

// Existing group fixtures have no shared bets. Exercise the real read projection
// with an empty, explicitly scoped feed; never catch unrelated social requests.
export async function emptySocialRead(request, actorId, slates) {
  const url = new URL(request.url());
  expect(url.pathname).toBe('/functions/v1/gtl-api/social/read');
  expect(request.method()).toBe('POST');
  expect(url.search).toBe('');
  const body = request.postDataJSON();
  expect(Object.keys(body).sort()).toEqual(['season', 'week']);
  const slate = slates.find(item => item.season === body.season && item.week === body.week);
  expect(slate, 'Social dashboard must request a known fixture season and week').toBeTruthy();
  return handleSocial({
    route: '/social/read', body, user: { id: actorId },
    service: { rpc: async (name, args) => {
      expect(name).toBe('gtl_read_social');
      expect(args).toEqual({ p_user: actorId, p_season: slate.season, p_week: slate.week, p_all: false });
      return {
        season: slate.season, week: slate.week,
        profiles: [{ id: actorId, displayName: 'Fixture player' }],
        availableWeeks: [{ season: slate.season, week: slate.week }], following: [],
        weeks: [{ season: slate.season, week: slate.week, revision: 0, state: emptySocialState(), games: slate.games }],
      };
    } },
  });
}
