// One feed post (redesign build plan stage 64; prototype league feed): faces first (rule of restraint 9), the actor's
// name and what happened, the post's details as the server gated them for this viewer, the reactions row and the newest
// two comments. A hidden market is a lock row with a sentence, never "—" (rule 8); the picks themselves open in sh.picks.
// The server and cloud/feed.mjs decide every number shown here; this component only draws it.
import { useShell } from '../shell/context.js';
import { Avatar, AvatarStack, Button, Card, FieldMark, Icon, IconButton, LockLine, Pill } from '../ui/index.js';
import { fmtNum, fmtPostTime, plural } from '../format.js';
import { MARKET, commentButton, gameName, guessText, lateWords, postLine, postLink, postMeta, reactionChips, realSlipPost, systemPost } from './feedModel.js';
import { react } from './feedActions.js';

function BallotRows({ post, names, viewer, shell }) {
  const own = post.actorId === viewer, name = own ? 'your' : `${names.get(post.actorId)?.displayName || 'Former member'}’s`;
  const market = MARKET[post.mode] ?? '';
  const shown = Object.keys(post.embed?.picks ?? {}).length, hidden = post.embed?.hiddenGames?.length ?? 0;
  const locked = !own && shown === 0 && hidden > 0;
  const open = () => shell.openSheet('sh.picks', { userId: post.actorId, mode: post.mode, season: post.season, week: post.week });
  const label = locked ? `${name[0].toUpperCase()}${name.slice(1)} ${market} picks` : `See ${name} ${market} picks`;
  return <div className="gx-feed-embed gx-feed-embed--list">
    <button type="button" className="gx-feed-row" data-locked={locked ? 'true' : undefined} onClick={open}
      aria-label={locked ? `${label}, hidden. Lock in your ${market} picks, or wait for each game's kickoff.` : label}>
      {locked ? <Icon icon="lock" size={16} className="gx-c-3"/> : null}
      <span className={locked ? 'gx-grow gx-t-body gx-c-2' : 'gx-grow gx-t-strong'}>{label}</span>
      <Icon icon="chevronRight" size={16} className="gx-c-3"/>
    </button>
    {!own && hidden > 0 && shown > 0 ? <p className="gx-t-meta gx-c-2">{plural(hidden, 'game')} hidden until you lock in or each game kicks off.</p> : null}
  </div>;
}

function ResultEmbed({ post }) {
  const e = post.embed ?? {}, market = MARKET[post.mode] ?? '';
  if (!e.visible) return <div className="gx-feed-embed"><LockLine>Lock in your {market} pick for {gameName(e.gameId)} to see this result.</LockLine></div>;
  return <div className="gx-feed-embed gx-vstack gx-gap-4">
    <p className="gx-n-m">{guessText(post.mode, e.gameId, e.pick)} · {fmtNum(e.points)} PTS</p>
    <p className="gx-t-meta gx-c-2">{market} · {gameName(e.gameId)}{e.points === 10 ? ' · Exact' : ''}</p>
  </div>;
}

function KickoffRows({ post, names, shell }) {
  const games = post.embed?.games ?? [];
  if (!games.length) return null;
  return <div className="gx-feed-embed gx-feed-embed--list">{games.map(game => {
    const people = game.in.map(id => ({ id, name: names.get(id)?.displayName || 'Former member' }));
    const line = `${plural(game.in.length, 'player')} in · ${plural(game.bets, 'bet')}`;
    return <button key={game.gameId} type="button" className="gx-feed-row" aria-label={`${gameName(game.gameId)}, ${line}. Open the game`}
      onClick={() => shell.openSheet('sh.game', { game: game.gameId })}>
      <span className="gx-grow gx-vstack gx-gap-4" aria-hidden="true">
        <span className="gx-hstack gx-gap-12 gx-wrap"><span className="gx-t-team">{gameName(game.gameId)}</span>{people.length ? <AvatarStack people={people} max={3} size={24}/> : null}</span>
        <span className="gx-t-meta gx-c-2">{line}</span>
      </span>
      <Icon icon="chevronRight" size={16} className="gx-c-3"/>
    </button>;
  })}</div>;
}

/** The reactions row: at most three chips (tap yours to take it back), the add button and the comments button. */
export function ReactionRow({ post, leagueId }) {
  const shell = useShell();
  const chips = reactionChips(post.reactions);
  const comments = commentButton(post);
  return <div className="gx-feed-rx" data-emoji-ok="true">
    {chips.map(chip => <button key={chip.key} type="button" className={chip.mine ? 'gx-feed-chip gx-feed-chip--mine' : 'gx-feed-chip'} aria-pressed={chip.mine ? 'true' : 'false'} aria-label={chip.label}
      onClick={() => react({ postId: post.id, current: post.reactions, next: chip.mine ? null : chip.key, toast: shell.toast })}>
      <span className="gx-feed-emoji" aria-hidden="true">{chip.emoji}</span><span className="gx-n-xs" aria-hidden="true">{chip.count}</span>
    </button>)}
    <IconButton icon="plus" size={16} label="Add a reaction" className="gx-feed-chip gx-feed-chip--add" onClick={() => shell.openPopover('pop.reactions', { postId: post.id, reactions: post.reactions, leagueId })}/>
    <span className="gx-grow"></span>
    <Button variant="ghost-2" icon="message" className="gx-feed-cbtn" aria-label={comments.label} onClick={() => shell.openSheet('sh.comments', { postId: post.id, kind: post.kind, gameId: post.embed?.games?.[0]?.gameId ?? null })}>
      <span aria-hidden="true">{comments.text}</span>
    </Button>
  </div>;
}

export function PostCard({ post, names, viewer, now, leagueId }) {
  const shell = useShell();
  const system = systemPost(post), actor = names.get(post.actorId)?.displayName || 'Former member';
  const line = postLine(post), meta = postMeta(post), late = lateWords(post), link = postLink(post);
  const preview = post.comments ?? [];
  return <Card as="article" className="gx-feed-post" data-post={post.id} data-kind={post.kind} aria-label={`${system ? line : `${actor} ${line}`}, ${fmtPostTime(post.createdAt, now)}`}>
    <div className="gx-feed-head">
      {system ? <FieldMark size={40} className="gx-feed-sys"/> : <Avatar id={post.actorId} name={actor} size={40}/>}
      <div className="gx-grow gx-vstack gx-gap-2">
        <p className="gx-t-body">{system ? <span className="gx-t-strong">{line}</span> : <><span className="gx-t-strong">{actor}{post.actorId === viewer ? ' (you)' : ''}</span> <span className="gx-c-2">{line}</span></>}</p>
        {(realSlipPost(post) || late) ? <span className="gx-hstack gx-gap-8 gx-wrap">{realSlipPost(post) ? <Pill tone="real">Real slip</Pill> : null}{late ? <Pill tone="pending">{late}</Pill> : null}</span> : null}
      </div>
      <time className="gx-t-meta gx-c-2 gx-none" dateTime={post.createdAt}>{fmtPostTime(post.createdAt, now)}</time>
    </div>
    {meta ? <p className="gx-t-meta gx-c-2">{meta}</p> : null}
    {post.kind === 'ballot_submitted' ? <BallotRows post={post} names={names} viewer={viewer} shell={shell}/> : null}
    {post.kind === 'result_shared' ? <ResultEmbed post={post}/> : null}
    {post.kind === 'kickoff' ? <KickoffRows post={post} names={names} shell={shell}/> : null}
    {link ? <Button variant="ghost" className="gx-feed-act" iconEnd="chevronRight" onClick={() => shell.go(link.tab, link.view)}>{link.text}</Button> : null}
    <ReactionRow post={post} leagueId={leagueId}/>
    {preview.length ? <div className="gx-vstack gx-gap-4 gx-feed-preview">
      {preview.map(comment => <p key={comment.id} className="gx-feed-cm"><span className="gx-t-meta gx-c-2 gx-none">{names.get(comment.userId)?.displayName || 'Former member'}</span> <span className="gx-feed-cm-text">{comment.body}</span></p>)}
      {post.commentCount > preview.length ? <Button variant="ghost-2" className="gx-feed-act" onClick={() => shell.openSheet('sh.comments', { postId: post.id, kind: post.kind })}>View all {post.commentCount}</Button> : null}
    </div> : null}
  </Card>;
}
