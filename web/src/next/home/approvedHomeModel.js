import { boardFor, rankTile } from '../../../../shared/guess-board.mjs';
import { ballotProgress } from '../play/landing.js';
import { nextGuess } from '../play/nextGuess.js';

export function homeProgress(community) {
  const market = nextGuess(community), row = ballotProgress(community, market);
  const of = Math.max(0, row?.of ?? 0), done = Math.max(0, Math.min(of, row?.done ?? 0));
  const due=community?.due?.find(item=>item.mode===(market==='total'?'guess_total':'guess_spread'));
  const left=community?.rules?.perGameScoring&&Number.isInteger(due?.openGames)?Math.max(0,due.openGames):Math.max(0,of-done);
  return { market, label: market === 'total' ? 'Total' : 'Spread', done, of, left, closed:Math.max(0,of-done-left), state: row?.state ?? null };
}

export function homeSeason(community, viewer, market) {
  const mode = market === 'total' ? 'guess_total' : 'guess_spread';
  const input = { standings: community?.standings ?? [], members: community?.members ?? [], viewer, mode };
  return { ...rankTile(input), leaders: boardFor(input).slice(0, 3), market, mode };
}

// Deliberately select only identity and generic activity words, never payload/body/selection fields.
export function homeActivity(community) {
  const post = community?.posts?.[0];
  if (!post) return null;
  const actor = community?.members?.find(member => member.id === post.actorId);
  const name = actor?.displayName ?? actor?.name ?? 'A community member';
  const market = post.mode === 'guess_total' ? 'Total' : post.mode === 'guess_spread' ? 'Spread' : '';
  const text = ({ joined:'joined Guess The Line', ballot_submitted:`submitted ${market ? `${market} ` : ''}picks`, week_published:'opened a new week', bet_posted:'shared a tracked ticket', bet_settled:'updated a tracked ticket', points_played:'locked in a points prediction', points_final:'received a points result' })[post.kind] ?? 'posted an update';
  return { id:post.id, actorId:post.actorId, name, text };
}
