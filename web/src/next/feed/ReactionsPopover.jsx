// `pop.reactions`: the six reactions (redesign build plan stage 65; prototype pop.reactions; D-35). One per person:
// choosing one replaces yours, choosing yours again takes it back. The glyphs sit inside data-emoji-ok and every button
// says its reaction in words. "See who reacted" opens sh.reactors. The popover host closes it on Escape or a tap outside.
import { useEffect, useRef } from 'react';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/index.js';
import { REACTION_SET } from './feedModel.js';
import { react } from './feedActions.js';

export function ReactionsPopover({ args }) {
  const shell = useShell();
  const first = useRef(null);
  const reactions = args?.reactions ?? { counts: {}, total: 0, mine: null };
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  const choose = key => {
    shell.closePopover();
    react({ postId: args.postId, current: reactions, next: reactions.mine === key ? null : key, toast: shell.toast });
  };
  return <div className="gx-popover gx-feed-pop" role="dialog" aria-label="Choose a reaction">
    <div className="gx-feed-pop-row" data-emoji-ok="true">
      {REACTION_SET.map((reaction, i) => {
        const on = reactions.mine === reaction.key;
        return <button key={reaction.key} ref={i === 0 ? first : undefined} type="button" className={on ? 'gx-feed-emo gx-feed-emo--on' : 'gx-feed-emo'}
          aria-pressed={on ? 'true' : 'false'} aria-label={`${reaction.name}${on ? ', your reaction' : ''}`} onClick={() => choose(reaction.key)}>
          <span aria-hidden="true">{reaction.emoji}</span>
        </button>;
      })}
    </div>
    {reactions.total > 0 ? <Button variant="ghost" className="gx-feed-pop-who" onClick={() => { shell.closePopover(); shell.openSheet('sh.reactors', { postId: args.postId }); }}>See who reacted</Button> : null}
  </div>;
}
