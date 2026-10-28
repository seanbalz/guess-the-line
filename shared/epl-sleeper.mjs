// Sleeper snapshot math for the Premier League fantasy league. Sleeper's public API returns no weekly matchups for
// this soccer league, so a matchweek's score is the difference between two saved season-total snapshots and
// head-to-head pairs are inferred (one manager's points-against change equals exactly one other manager's
// points-for change). Pure: no I/O, no imports.

export const MANAGER_NAMES = Object.freeze({
  nemoheye: 'Nemo',
  steezyc9: 'Cullen',
  aharrison2: 'Adam',
  seanbalz: 'Sean',
  NLGooner: 'Evan',
  LFCRed: 'Mark',
  sthomas111: 'Steven',
  Freudian: 'Darin',
});

const round2 = x => Math.round(x * 100) / 100;

export function seasonPoints(settings = {}) {
  return round2((settings.fpts ?? 0) + (settings.fpts_decimal ?? 0) / 100);
}

export function seasonAgainst(settings = {}) {
  return round2((settings.fpts_against ?? 0) + (settings.fpts_against_decimal ?? 0) / 100);
}

export function managersFromSnapshot(snapshot) {
  const sleeperNames = new Map((snapshot?.users ?? []).map(u => [u.user_id, u.display_name]));
  return (snapshot?.rosters ?? []).map(r => {
    const sleeperName = sleeperNames.get(r.owner_id) ?? null;
    return {
      ownerId: r.owner_id,
      rosterId: r.roster_id,
      sleeperName,
      name: MANAGER_NAMES[sleeperName] ?? sleeperName,
      seasonTotal: seasonPoints(r.settings),
      seasonAgainst: seasonAgainst(r.settings),
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
    };
  });
}

// Only owners present in both snapshots get a weekly score.
export function weeklyScores(prev, next) {
  const before = new Map(managersFromSnapshot(prev).map(m => [m.ownerId, m]));
  const out = {};
  for (const m of managersFromSnapshot(next)) {
    const p = before.get(m.ownerId);
    if (!p) continue;
    out[m.ownerId] = { for: round2(m.seasonTotal - p.seasonTotal), against: round2(m.seasonAgainst - p.seasonAgainst) };
  }
  return out;
}

// A pairs with B when A.against === B.for and B.against === A.for. An owner is paired only when it has exactly one
// candidate and that candidate has exactly it; everything else is unpaired so nothing is guessed.
export function pairMatchups(weekly) {
  const ids = Object.keys(weekly);
  const candidates = id => ids.filter(o => o !== id && weekly[id].against === weekly[o].for && weekly[o].against === weekly[id].for);
  const cand = new Map(ids.map(id => [id, candidates(id)]));
  const pairs = [];
  const paired = new Set();
  for (const id of ids) {
    const [other] = cand.get(id);
    if (cand.get(id).length !== 1 || cand.get(other).length !== 1 || cand.get(other)[0] !== id) continue;
    if (paired.has(id)) continue;
    paired.add(id).add(other);
    pairs.push(id < other ? [id, other] : [other, id]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return { pairs, unpaired: ids.filter(id => !paired.has(id)).sort() };
}
