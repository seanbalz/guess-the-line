// D-82 Player Props browser fixture: the community world (real gtl-api handler, every migration on local PGlite) with
// Player Props on (GTL_PLAYER_PROPS=on, live_lock_in true) and synthetic fixture data only. Nothing here is a bookmaker
// quote, an account record or live odds: every line, guess and final below is an illustrative test value, chosen so the
// production captures can be compared with the approved boards (design/player-props-review-2026-11-09: receiving misses
// 6/5/2/3/4 average 4.0 yards, reception misses 1/0.5/0.5/0/1 average 0.6, paper 5-2-1 with 2 awaiting finals).
// CeeDee Lamb's stable ID is the one the approved spec and SQL tests use; the other athletes are named fixtures.
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, communityWorld } from './community-world.mjs';

export const LAMB = Object.freeze({ id: '00-0036358', name: 'CeeDee Lamb', team: 'DAL', position: 'WR' });
const OTHER_WR = Object.freeze({ id: '00-0039902', name: 'Fixture Receiver', team: 'CHI', position: 'WR' });
const CURRENT = Object.freeze([
  [LAMB, ['player_reception_yds', 'player_receptions', 'player_reception_tds']],
  [{ id: '00-0039911', name: 'Fixture Quarterback', team: 'TB', position: 'QB' }, ['player_pass_yds', 'player_pass_tds']],
  [{ id: '00-0039912', name: 'Fixture Running Back', team: 'DAL', position: 'RB' }, ['player_rush_yds', 'player_reception_yds']],
  [{ id: '00-0039913', name: 'Fixture Tight End', team: 'TB', position: 'TE' }, ['player_receptions']],
]);
/** Past locked guesses for Luke: [week, event, athlete, stat, guess, saved line, later pre-kickoff line or null, final or null]. */
const PAST = Object.freeze([
  [1, '2026_01_DAL_NYG', LAMB, 'player_reception_yds', 72.5, 66.5, null, 80],
  [1, '2026_01_DAL_NYG', LAMB, 'player_receptions', 6.5, 5.5, null, 7],
  [2, '2026_02_PHI_DAL', LAMB, 'player_reception_yds', 60, 65, null, 50],
  [2, '2026_02_PHI_DAL', LAMB, 'player_receptions', 5, 5.5, null, 4],
  [3, '2026_03_DAL_WAS', LAMB, 'player_reception_yds', 70.5, 68.5, null, 60],
  [3, '2026_03_DAL_WAS', LAMB, 'player_receptions', 6, 5.5, null, 5],
  [4, '2026_04_CHI_DAL', LAMB, 'player_reception_yds', 75.5, 72.5, null, 90],
  [4, '2026_04_CHI_DAL', LAMB, 'player_receptions', 5.5, 5.5, 5, 5],
  [4, '2026_04_CHI_DAL', OTHER_WR, 'player_reception_yds', 64.5, 68.5, null, null],
  [4, '2026_04_CHI_DAL', OTHER_WR, 'player_receptions', 4.5, 5.5, null, null],
]);
const SHA = 'a'.repeat(64);
const books = (line, observedAt) => ['betmgm', 'draftkings', 'fanduel'].map(book => ({ book, line, observedAt }));
const teams = event => event.split('_').slice(2);

async function offer(db, { season, week, eventId, athlete, stat, kickoff }) {
  const [away, home] = teams(eventId);
  await db.query('select public.gtl_props_record_offer($1)', [{ season, week, eventId, playerId: athlete.id, stat, playerName: athlete.name, team: athlete.team,
    position: athlete.position, away, home, kickoff, source: 'Fixture roster and schedule' }]);
}
async function service(db, name, args) {
  return db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; });
}

/**
 * The world for the flag-on captures: this week's offers (kickoff tomorrow), a qualifying retained reference for Lamb's
 * receiving yards only (receptions has none, so its lock-in takes the draft-recovery path), Troy and Sean locked in on
 * Lamb's receiving yards, and Luke's past locked props with finals. `history: false` leaves Luke with no past props.
 */
export async function propsWorld(page, baseURL, { history = true, ...options } = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, games: 4, props: true, ...options });
  const { db, state } = world, { season, week } = state.league;
  await db.exec('update public.gtl_prop_capability set live_lock_in=true');
  const kickoff = new Date(Date.parse(state.league.deadline) + 86_400_000).toISOString();
  const eventId = `${season}_${String(week).padStart(2, '0')}_TB_DAL`;
  for (const [athlete, stats] of CURRENT) for (const stat of stats) await offer(db, { season, week, eventId, athlete, stat, kickoff });
  const observedAt = new Date(Date.now() - 10 * 60_000).toISOString();
  await service(db, 'gtl_props_record_reference', { p_event_id: eventId, p_player_id: LAMB.id, p_stat: 'player_reception_yds', p_line: 68.5, p_books: [
    { book: 'draftkings', line: 67.5, observedAt }, { book: 'fanduel', line: 68.5, observedAt }, { book: 'betmgm', line: 69.5, observedAt }] });
  for (const [who, guess] of [['troy', 70.5], ['sean', 64]]) {
    await service(db, 'gtl_props_lock_in', { p_user: ACCOUNTS[who].id, p_request: crypto.randomUUID(), p_event_id: eventId, p_player_id: LAMB.id, p_stat: 'player_reception_yds', p_guess: guess });
  }
  if (history) {
    // Past weeks are stored directly (the writers refuse anything at or after kickoff, as they must): triggers off for the
    // fixture rows only, then on again before any request.
    await db.exec("set session_replication_role = replica");
    for (const [i, [w, event, athlete, stat, guess, line, later, final]] of PAST.entries()) {
      const kick = new Date(Date.UTC(2026, 8, 13 + (w - 1) * 7, 20, 25)).toISOString();
      const [away, home] = teams(event);
      await db.query(`insert into public.gtl_prop_offers(season,week,event_id,player_id,stat,player_name,team,position,away,home,kickoff,source)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Fixture roster and schedule') on conflict do nothing`, [season, w, event, athlete.id, stat, athlete.name, athlete.team, athlete.position, away, home, kick]);
      const saved = new Date(Date.parse(kick) - 2 * 3_600_000).toISOString();
      const ref = (await db.query(`insert into public.gtl_prop_references(event_id,player_id,stat,line,books,observed_from,observed_to,provider,recorded_at)
        values($1,$2,$3,$4,$5,$6,$6,'the-odds-api',$6) returning id`, [event, athlete.id, stat, line, JSON.stringify(books(line, saved)), saved])).rows[0].id;
      if (later !== null) {
        const at = new Date(Date.parse(kick) - 3_600_000).toISOString();
        await db.query(`insert into public.gtl_prop_references(event_id,player_id,stat,line,books,observed_from,observed_to,provider,recorded_at)
          values($1,$2,$3,$4,$5,$6,$6,'the-odds-api',$6)`, [event, athlete.id, stat, later, JSON.stringify(books(later, at)), at]);
      }
      const lockedAt = new Date(Date.parse(saved) + (i + 1) * 60_000).toISOString();
      await db.query(`insert into public.gtl_prop_guesses(user_id,season,week,event_id,player_id,stat,guess,status,reference_id,reference_line,reference_observed_at,saved_at,locked_at)
        values($1,$2,$3,$4,$5,$6,$7,'locked',$8,$9,$10,$11,$11)`, [ACCOUNTS.luke.id, season, w, event, athlete.id, stat, guess, ref, line, saved, lockedAt]);
      if (final !== null) await db.query(`insert into public.gtl_prop_results(event_id,player_id,stat,version,status,actual,participated,source,source_sha256,observed_at)
        values($1,$2,$3,1,'final',$4,true,'Fixture weekly player stats',$5,$6)`, [event, athlete.id, stat, final, SHA, new Date(Date.parse(kick) + 5 * 3_600_000).toISOString()]);
    }
    await db.exec("set session_replication_role = origin");
  }
  return { ...world, eventId, kickoff };
}
