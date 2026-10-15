import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applySocialMutation, emptySocialState } from '../shared/social-bets.mjs';
import { handleSocial, SocialError } from '../cloud/social.mjs';

// Preview identities are local fixtures, never cloud account mappings.
export const LOCAL_SOCIAL_IDS = {
  sean: '00000000-0000-4000-8000-000000000001',
  troy: '00000000-0000-4000-8000-000000000002',
  luke: '00000000-0000-4000-8000-000000000003',
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const signature = value => JSON.stringify(canonical(value));

/** Independent, loopback-only tracker; never copies old journal or ballot data. */
export function createSocialStore(file, { slates, profiles, clock = Date.now, intake = [] }) {
  let saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, weeks: {}, follows: {}, receipts: [] };
  if (saved.version !== 1) throw new Error('Unsupported local bet tracker. Preserve it before migrating.');
  function persist(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file); saved = next;
  }
  if (!fs.existsSync(file) && intake.length) {
    const next = structuredClone(saved);
    for (const item of intake) {
      const { owner, ...body } = item;
      const actorId = LOCAL_SOCIAL_IDS[owner], key = `${body.season}-${body.week}`;
      const slate = slates.find(s => s.season === body.season && s.week === body.week);
      if (!actorId || !slate) throw new Error('The supplied bet intake needs a matching player and schedule.');
      const current = next.weeks[key] ?? { revision: 0, state: emptySocialState() };
      current.state = applySocialMutation(current.state, { actorId, action: 'create', body, games: slate.games, now: clock() });
      current.revision += 1; next.weeks[key] = { ...current, games: slate.games };
    }
    persist(next);
  }
  const known = id => profiles.some(profile => profile.id === id);
  const service = { async rpc(name, args) {
    if (!known(args.p_user)) throw new SocialError(403, 'Unknown local player.');
    if (name === 'gtl_read_social') {
      const catalog = new Map(slates.map(slate => [`${slate.season}-${slate.week}`, slate]));
      // Retain each saved week's schedule when the local preview advances to a new week.
      // Older files without that metadata must not silently omit their saved bets from an all-history export.
      for (const [key, savedWeek] of Object.entries(saved.weeks)) {
        if (catalog.has(key)) continue;
        const [season, week] = key.split('-').map(Number);
        if (!Array.isArray(savedWeek.games)) {
          if (args.p_all) throw new SocialError(503, 'An older shared bet schedule is unavailable. Restore its schedule before exporting all bets.');
          continue;
        }
        catalog.set(key, { season, week, games: savedWeek.games });
      }
      const available = [...catalog.values()].sort((a, b) => b.season - a.season || b.week - a.week);
      const selected = args.p_all ? available : available.filter(s => s.season === (args.p_season ?? available[0]?.season) && s.week === (args.p_week ?? available[0]?.week));
      if (!selected.length) throw new SocialError(404, 'This week’s schedule is unavailable.');
      return { season: selected[0].season, week: selected[0].week, profiles, following: saved.follows[args.p_user] ?? [],
        availableWeeks: available.map(({ season, week }) => ({ season, week })),
        weeks: selected.map(s => ({ ...(saved.weeks[`${s.season}-${s.week}`] ?? { revision: 0, state: emptySocialState() }), ...s })) };
    }
    if (name === 'gtl_commit_social') {
      const key = `${args.p_season}-${args.p_week}`, existing = saved.receipts.find(r => r.actorId === args.p_user && r.requestId === args.p_request_id);
      const fingerprint = signature([args.p_action, args.p_body]);
      if (existing) {
        if (existing.signature !== fingerprint) throw new SocialError(409, 'This request was already used for different content.');
        return { revision: saved.weeks[key].revision, replayed: true };
      }
      const current = saved.weeks[key] ?? { revision: 0, state: emptySocialState() };
      if (current.revision !== args.p_expected_revision) throw new SocialError(409, 'Shared bets changed on another device. Refresh and review before saving again.');
      const next = structuredClone(saved), revision = current.revision + 1;
      const games = slates.find(slate => slate.season === args.p_season && slate.week === args.p_week)?.games ?? current.games;
      next.weeks[key] = { revision, state: args.p_state, games };
      next.receipts.push({ actorId: args.p_user, requestId: args.p_request_id, signature: fingerprint });
      persist(next); return { revision, replayed: false };
    }
    if (name === 'gtl_follow_social') {
      if (!known(args.p_target) || args.p_target === args.p_user) throw new SocialError(400, 'Choose another player to follow.');
      const existing = saved.receipts.find(r => r.actorId === args.p_user && r.requestId === args.p_request_id);
      const fingerprint = signature({ action: 'follow', target: args.p_target, following: args.p_following });
      if (existing && existing.signature !== fingerprint) throw new SocialError(409, 'This request was already used for different content.');
      if (!existing) {
        const next = structuredClone(saved), following = new Set(next.follows[args.p_user] ?? []);
        args.p_following ? following.add(args.p_target) : following.delete(args.p_target);
        next.follows[args.p_user] = [...following];
        next.receipts.push({ actorId: args.p_user, requestId: args.p_request_id, signature: fingerprint }); persist(next);
      }
      return { following: saved.follows[args.p_user] ?? [], replayed: Boolean(existing) };
    }
    throw new SocialError(400, 'Unknown bet tracker operation.');
  } };
  return { async action(player, action, body) {
    const id = LOCAL_SOCIAL_IDS[player];
    if (!id) throw new SocialError(403, 'Unknown local player.');
    return { ...await handleSocial({ route: `/social/${action}`, body, user: { id, emailConfirmed: true }, service, clock }), localOnly: true };
  } };
}
