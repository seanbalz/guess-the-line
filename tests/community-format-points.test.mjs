import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsPostText } from '../web/src/communityFormat.js';

// P-02 / D-56: one wording for the two Points feed posts, used by the new app (LeagueScreen postText) and the classic
// app (CommunityHome PostText, still the default), so a Points post never renders as an empty card in either.
test('contract: points_played and a single-winner points_final', () => {
  assert.equal(pointsPostText({ kind: 'points_played', week: 8 }), 'is playing Week 8 Points.');
  assert.equal(pointsPostText({ kind: 'points_final', week: 8, payload: { winners: [{ userId: 'a', points: 38.4 }], house: 31.2, max: 50 } }),
    'won Week 8 Points with 38.4 · House 31.2 · FINAL.');
});

test('contract: a tied win is shared and a missing House total reads "—" (brand rule)', () => {
  assert.equal(pointsPostText({ kind: 'points_final', week: 8, payload: { winners: [{ userId: 'a', points: 38 }, { userId: 'b', points: 38 }], house: null, max: 50 } }),
    'tied for the win in Week 8 Points with 38 · House — · FINAL.');
});

test('contract: other kinds are not Points posts', () => {
  for (const kind of ['joined', 'ballot_submitted', 'bet_posted', 'week_published']) assert.equal(pointsPostText({ kind, week: 8 }), null);
  assert.equal(pointsPostText(null), null);
});
