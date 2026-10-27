// The 2026 Week 5 replay for Me › History (redesign build plan stages 73 to 75), on the real handler, every migration (ALL)
// and local PGlite: the committed Week 5 slate at its real kickoffs, Sean's committed seed Spread (original submission time
// not recorded), the two committed eDraft reference pages imported under a fixture decision (D-33's path), Ben's committed
// D-25 ballot imported through the commissioner-ruled RPC, and a fictional Steven Spread (practice origin, ruled eligible,
// D-08) whose fixture picks reproduce the hosted 91.4 against the 10:03 ET page. Luke (the fixture viewer) has stored Week 5
// rows of every History shape: a Total with a lock-in, an edit and a draft closed at kickoff, a "See picks now" forfeit,
// Betting Challenge selections and Virtual Units bets. Fixture accounts only; never hosted data.
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { seed } from '../../server/store.mjs';
import { ACCOUNTS, communityWorld, createCommunityWorld } from './community-world.mjs';
import { buildReferenceLineImport, RPC as REFERENCE_RPC } from '../../scripts/import-reference-lines.mjs';
import { buildRuledImport, RPC as RULED_RPC } from '../../scripts/import-ruled-ballot.mjs';

export const STEVEN = { id: '00000000-0000-4000-8000-000000000031', name: 'Steven Fixture' };
export const BEN = { id: '00000000-0000-4000-8000-000000000032', name: 'Ben Fixture' };
// Fictional picks against the 10:03 ET page (TB-DAL −8.5 … BUF-LAR −3.3): one exact game, nine off by a point, four off by
// five or more and BUF-LAR off by 0.3, so 10 + 9 × 8 + 9.4 = 91.4, the hosted Steven total.
export const STEVEN_PICKS = { 'TB-DAL': -8.5, 'PHI-JAX': -6.5, 'CIN-MIA': 7.5, 'LV-NE': -2.5, 'MIN-NO': 2.5, 'CLE-NYJ': -0.5, 'IND-PIT': -1.5, 'HOU-TEN': 8.5,
  'NYG-WAS': -2.5, 'CHI-GB': 2.5, 'DEN-LAC': 8.5, 'SF-SEA': 2, 'BAL-ATL': 2.5, 'DET-ARI': -0.5, 'BUF-LAR': -3 };
export const ANCHORS = { sean: 95.8, steven: 91.4, ben: 37.6 };

/** Restores the committed Week 5 slate (real kickoffs and deadline) and Sean's seed Spread after the world's own edits. */
function week5(state) {
  const real = seed();
  state.games = real.games; state.league.deadline = real.league.deadline; state.ballots = { sean: real.ballots.sean };
}

/** A stored row written as the hosted rows were migrated: the triggers that guard live writers are not in its way. */
async function stored(db, sql, args) {
  await db.transaction(async tx => { await tx.exec('set local session_replication_role = replica'); await tx.query(sql, args); });
}

async function fill(world) {
  const { db } = world, sean = ACCOUNTS.sean.id, luke = ACCOUNTS.luke.id, troy = ACCOUNTS.troy.id;
  const rpc = (name, args) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  });
  for (const person of [STEVEN, BEN]) {
    await db.query('insert into auth.users values($1)', [person.id]);
    await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [person.id, person.name]);
  }
  // Steven's migrated Spread: picks and submittedAt, no saved line, one legacy event; practice origin.
  await stored(db, 'insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [STEVEN.id]);
  await stored(db, "insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance) values($1,2026,5,'guess_spread',$2,$3,true,$4)", [STEVEN.id,
    { picks: STEVEN_PICKS, submittedAt: '2026-10-08T18:43:07.147792Z' },
    JSON.stringify([{ id: 'legacy-steven', player: 'steven', mode: 'guess_spread', type: 'ballot_submitted', timestamp: '2026-10-08T18:43:07.147792Z', before: {}, after: STEVEN_PICKS }]),
    JSON.stringify([{ leagueId: 'group-fixture', playerId: 'steven', migration: true }])]);
  // D-08: Sean's and Steven's Week 5 spreads count (the recorded eligibility rulings).
  const rule = "insert into public.gtl_weekly_eligibility_rulings(user_id,season,week,mode,eligible,reason,approved_by,context_league_id,recorded_at,evidence) values($1,2026,5,'guess_spread',true,'D-08: the Week 5 spread ballot counts',$2,'sean-troy-luke',$3,'{\"decision\":\"D-08\"}')";
  await db.query(rule, [sean, sean, '2026-10-08T19:00:00Z']);
  await db.query(rule, [STEVEN.id, sean, '2026-10-08T19:01:00Z']);
  // The two committed eDraft pages, imported by the commissioner (D-33's path under a fixture decision number).
  for (const payload of buildReferenceLineImport({ actor: sean, decision: 'D-99' }).payloads) await rpc(REFERENCE_RPC, payload);
  // Ben's committed D-25 ballot, imported once through the commissioner-ruled RPC.
  await rpc(RULED_RPC, buildRuledImport({ user: BEN.id, actor: sean }).payload);
  // Luke's Total: a TB-DAL draft, then TB-DAL locked in on time (its line still pending), PHI-JAX locked in 12 minutes after
  // the deadline (Late, D-30) and a CHI-GB draft never locked in, so it closed at kickoff. A "See picks now" forfeit sat his
  // Spread out (D-36).
  const at = value => new Date(value).toISOString(), deadline = Date.parse(world.state.league.deadline), late = deadline + 12 * 60_000;
  const lateMark = { deadline: at(deadline), minutes: 12 };
  const total = { picks: { 'TB-DAL': 44.5, 'PHI-JAX': 41.5, 'CHI-GB': 47.5 }, submittedAt: null, updatedAt: at(late),
    lockedAt: { 'TB-DAL': at(deadline - 7_200_000), 'PHI-JAX': at(late) }, lockedLate: { 'PHI-JAX': lateMark }, late: lateMark,
    scoringReferences: { 'TB-DAL': { status: 'pending', basis: 'first_line_after_submission' }, 'PHI-JAX': { status: 'available', value: 46.5, basis: 'line_at_guess', source: 'The Odds API', observedAt: at(late - 60_000) } },
    scoringPolicy: 'submission-time', closedAtKickoff: [], guessRule: 'per-game-v1' };
  await stored(db, 'insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [luke]);
  await stored(db, "insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance) values($1,2026,5,'guess_total',$2,$3,false,$4)", [luke, total,
    JSON.stringify([
      { id: randomUUID(), player: 'luke', mode: 'guess_total', type: 'ballot_saved', timestamp: at(deadline - 10_800_000), before: {}, after: { 'TB-DAL': 43.5 }, changedGameIds: ['TB-DAL'], lockedGameIds: [] },
      { id: randomUUID(), player: 'luke', mode: 'guess_total', type: 'guess_locked_in', timestamp: at(deadline - 7_200_000), before: { 'TB-DAL': 43.5 }, after: { 'TB-DAL': 44.5, 'PHI-JAX': 41.5, 'CHI-GB': 47.5 },
        changedGameIds: ['TB-DAL', 'PHI-JAX', 'CHI-GB'], lockedGameIds: ['TB-DAL'], afterScoringReferences: { 'TB-DAL': total.scoringReferences['TB-DAL'] } },
      { id: randomUUID(), player: 'luke', mode: 'guess_total', type: 'guess_locked_in', timestamp: at(late), before: { 'TB-DAL': 44.5, 'PHI-JAX': 41.5, 'CHI-GB': 47.5 }, after: { 'TB-DAL': 44.5, 'PHI-JAX': 41.5, 'CHI-GB': 47.5 },
        changedGameIds: [], lockedGameIds: ['PHI-JAX'], afterScoringReferences: total.scoringReferences, late: lateMark },
    ]), JSON.stringify([{ scope: 'solo' }])]);
  await stored(db, "insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at) values($1,2026,5,'guess_spread',$2)", [luke, at(deadline - 3_600_000)]);
  await stored(db, "insert into public.gtl_week_forfeits(user_id,season,week,reason,modes,created_at) values($1,2026,5,'reveal',array['guess_spread'],$2)", [luke, at(deadline - 3_600_000)]);
  // Virtual Units bets for Bets weeks: Troy won 1U on DAL −8.5; Luke lost 2U on Over 45.5.
  await stored(db, 'insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [troy]);
  const bet = (user, game, market, selection, status, net) => stored(db, 'insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,status,result) values($1,2026,5,$2,$3,$4,$5,$6)',
    [user, game, market, { gameId: game, market, odds: -110, source: 'DraftKings', quotedAt: at(deadline - 86_400_000), selectedAt: at(deadline - 86_400_000), ...selection }, status,
      { outcome: status, status, netUnits: net, settledAt: at(deadline + 86_400_000) }]);
  await bet(troy, 'TB-DAL', 'spread', { side: 'home', line: -8.5, units: 1 }, 'win', 0.9091);
  await bet(luke, 'SF-SEA', 'total', { side: 'over', line: 45.5, units: 2 }, 'loss', -2);
}

const OPTIONS = { migrations: ALL, optionalRpc: true, troyBallots: false, games: 15, prepare: week5 };

/** The browser world (communityWorld) with the Week 5 replay stored. */
export async function historyWorld(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { ...OPTIONS, ...options });
  await fill(world);
  return world;
}

/** The same world without a browser, for node suites. */
export async function createHistoryWorld(options = {}) {
  const world = await createCommunityWorld({ ...OPTIONS, ...options });
  await fill(world);
  return world;
}

// Stage 74's older records, added on demand (addOlderRecords): Week 5 Betting Challenge selections with the reviewed finals
// they are graded from, Sean's saved game, note, forecast and journal records, a tracked real slip of Troy's, and the D-09
// Week 5 benchmark freeze record of Sean's group. Fixture values; the finals are not the real Week 5 scores.
export const FINALS = { 'TB-DAL': { home: 31, away: 17 }, 'SF-SEA': { home: 20, away: 23 } };
export const SELECTIONS = [
  ['troy', 'TB-DAL', 'spread', 'home', -8.5],
  ['troy', 'SF-SEA', 'total', 'under', 46.5],
  ['luke', 'TB-DAL', 'total', 'over', 48.5],
];
const BENCHMARK_LEAGUE = 'g_a697831088e94d5eba8ca0fd51054076';

export async function addOlderRecords(world) {
  const { db, state } = world, sean = ACCOUNTS.sean.id;
  const at = value => new Date(value).toISOString(), deadline = Date.parse(state.league.deadline);
  for (const [who, gameId, market, side, line] of SELECTIONS) {
    const user = ACCOUNTS[who].id;
    await stored(db, 'insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [user]);
    const selection = { gameId, market, side, line, odds: -110, source: 'DraftKings', quotedAt: at(deadline - 7_200_000), id: randomUUID(), selectedAt: at(deadline - 3_600_000),
      enteredAt: at(deadline - 3_600_000), verification: 'Manually entered; not independently verified' };
    await stored(db, "insert into public.gtl_weekly_selections(user_id,season,week,game_id,selection,audit,provenance) values($1,2026,5,$2,$3,jsonb_build_array(jsonb_build_object('type','selection_recorded','after',$3::jsonb)),$4)",
      [user, gameId, selection, JSON.stringify([{ leagueId: 'sean-troy-luke', playerId: who }])]);
  }
  for (const [gameId, score] of Object.entries(FINALS)) {
    await stored(db, "insert into public.gtl_reviewed_result_events(season,week,game_id,version,actor_id,request_id,payload,result,reviewed_at) values(2026,5,$1,1,$2,$3,'{}'::jsonb,$4,$5)",
      [gameId, sean, randomUUID(), { status: 'final', ...score }, at(deadline + 4 * 86_400_000)]);
  }
  // Sean's own records through the real routes: a saved game with a note, a note on an unsaved game, a forecast changed once,
  // and a journal record (his Spread was sent) that he later archived.
  const personal = async (route, body) => {
    const workspace = await world.api('sean', 'personal');
    const reply = await world.api('sean', route, { ...body, requestId: randomUUID(), revision: workspace.body.revision });
    if (reply.status !== 200) throw new Error(`${route}: ${JSON.stringify(reply.body)}`);
    return reply.body;
  };
  await personal('favorite/set', { season: 2026, week: 5, gameId: 'TB-DAL', saved: true, notes: 'Dallas at home after the bye.' });
  const notes = await world.api('sean', 'personal/notes', { season: 2026, week: 5 });
  const revision = notes.body.notes.find(n => n.gameId === 'SF-SEA')?.revision ?? 0;
  const note = await world.api('sean', 'personal/note', { requestId: randomUUID(), season: 2026, week: 5, gameId: 'SF-SEA', note: 'Wind check before kickoff.', revision });
  if (note.status !== 200) throw new Error(`personal/note: ${JSON.stringify(note.body)}`);
  await personal('personal/forecast', { season: 2026, week: 5, gameId: 'BUF-LAR', market: 'total', value: 47 });
  await personal('personal/forecast', { season: 2026, week: 5, gameId: 'BUF-LAR', market: 'total', value: 49.5 });
  const journal = await personal('journal/create', { season: 2026, week: 5, gameId: 'TB-DAL', kind: 'user_reported_placed_bet', market: 'spread', side: 'home', line: -8.5, odds: -110,
    source: 'FanDuel', quotedAt: at(Date.now() - 3_600_000), placedAt: at(Date.now() - 3_000_000), notes: 'Small play.', outcome: 'win', currency: 'USD', stakeMinor: 1100, returnedMinor: 2100 });
  await personal('journal/archive', { entryId: journal.entryId, reason: 'Recorded twice by mistake', archived: true });
  await personal('journal/create', { season: 2026, week: 5, gameId: 'SF-SEA', kind: 'research_note', market: 'spread', side: 'away', line: 3, odds: -105,
    source: 'Fixture Book', quotedAt: at(Date.now() - 3_600_000), placedAt: null, notes: 'Lean the road side.', outcome: 'pending', currency: null, stakeMinor: null, returnedMinor: null });
  // Troy's tracked real slip, reported after the game and settled (D-19: user-reported, never on a board).
  const read = await world.api('troy', 'social/read', { season: 2026, week: 5 });
  const created = await world.api('troy', 'social/create', { season: 2026, week: 5, weekRevision: read.body.weekRevision, requestId: randomUUID(), kind: 'single', origin: 'tracked',
    legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -8.5 }], odds: -110, stakeUnits: 1, source: 'FanDuel', quotedAt: at(deadline - 7_200_000), placedAt: at(deadline - 7_000_000), notes: 'Took it early.' });
  if (created.status !== 200) throw new Error(`social/create: ${JSON.stringify(created.body)}`);
  const slip = created.body.entries.find(entry => entry.ownerId === ACCOUNTS.troy.id);
  const settled = await world.api('troy', 'social/settle', { season: 2026, week: 5, weekRevision: created.body.weekRevision, requestId: randomUUID(), entryId: slip.id, revision: slip.revision,
    outcome: 'win', actualReturnUnits: 1.91, reason: 'Final score' });
  if (settled.status !== 200) throw new Error(`social/settle: ${JSON.stringify(settled.body)}`);
  // The D-09 Week 5 benchmark freeze record of Sean's group, as stored (DP-4): the policy, one 3-book collection and the freeze.
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
  const league = { ...seed(), league: { ...seed().league, id: BENCHMARK_LEAGUE, name: 'Fixture group' }, ballots: {} };
  await stored(db, 'insert into public.gtl_leagues(id,state) values($1,$2)', [BENCHMARK_LEAGUE, league]);
  await stored(db, "insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,'sean','commissioner')", [sean, BENCHMARK_LEAGUE]);
  await stored(db, "insert into public.gtl_benchmark_policies(id,league_id,season,week,mode,slate_signature,created_by,decision_text) values('d09-2026-w05-sean-steven-spread',$1,2026,5,'guess_spread',$2,$3,'D-09: freeze the Week 5 spread benchmark at kickoff (fixture text).')",
    [BENCHMARK_LEAGUE, signature, sean]);
  const snapshot = randomUUID(), captured = at(deadline - 120_000);
  await stored(db, "insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$1,$3,$3::timestamptz+interval '90 seconds',2,2026,5,$4)",
    [snapshot, sean, captured, signature]);
  await stored(db, "insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,'{}'::jsonb,$3)", [snapshot, signature, captured]);
  await stored(db, 'insert into public.gtl_frozen_benchmarks(policy_id,request_id,snapshot_id,actor_id,actual_kickoff,source_url,benchmark,frozen_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
    ['d09-2026-w05-sean-steven-spread', randomUUID(), snapshot, sean, at(deadline), 'https://the-odds-api.com/',
      { games: { 'TB-DAL': { value: -8.5, oldestObservedAt: captured, newestObservedAt: captured }, 'SF-SEA': { value: -3, oldestObservedAt: captured, newestObservedAt: captured } }, capturedAt: captured, quotedAt: captured, actualKickoff: at(deadline), stale: false },
      at(deadline + 60_000)]);
}
