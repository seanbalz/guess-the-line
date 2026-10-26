// Friends' ballot posts of one Pacific day, folded into one card (review D4; redesign build plan stage 64). A post with
// reactions or comments is never folded (feedModel.foldPosts), and "Show each post" opens every post the card holds in
// place, so nothing a member posted is out of reach (D-23).
import { useState } from 'react';
import { AvatarStack, Button, Card } from '../ui/index.js';
import { fmtPostTime } from '../format.js';
import { namesLine } from './feedModel.js';
import { PostCard } from './PostCard.jsx';

export function DigestCard({ posts, names, viewer, now, leagueId }) {
  const [open, setOpen] = useState(false);
  const actors = [...new Set(posts.map(post => post.actorId))];
  const people = actors.map(id => ({ id, name: names.get(id)?.displayName || 'Former member' }));
  const text = `${namesLine(people.map(person => person.name))} locked in picks`;
  if (open) {
    return <section className="gx-vstack gx-gap-16" aria-label={text}>
      {posts.map(post => <PostCard key={post.id} post={post} names={names} viewer={viewer} now={now} leagueId={leagueId}/>)}
      <Button variant="ghost-2" className="gx-feed-act" onClick={() => setOpen(false)}>Fold these {posts.length} posts</Button>
    </section>;
  }
  return <Card as="article" className="gx-feed-post gx-feed-digest" data-digest={posts.length} aria-label={`${text}, ${fmtPostTime(posts[0].createdAt, now)}`}>
    <div className="gx-feed-head">
      <AvatarStack people={people} max={4} size={24}/>
      <p className="gx-grow gx-t-body">{text}</p>
      <time className="gx-t-meta gx-c-2 gx-none" dateTime={posts[0].createdAt}>{fmtPostTime(posts[0].createdAt, now)}</time>
    </div>
    <Button variant="ghost" className="gx-feed-act" iconEnd="chevronDown" aria-expanded="false" onClick={() => setOpen(true)}>Show each post ({posts.length})</Button>
  </Card>;
}
