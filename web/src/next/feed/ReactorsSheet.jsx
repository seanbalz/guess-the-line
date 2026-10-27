// `sh.reactors`: who reacted to a post, and with what (redesign build plan stage 65; prototype sh.reactors). One row per
// person, newest first, faces first; the emoji sits inside data-emoji-ok, and each row's name says the reaction in words.
import { useEffect, useState } from 'react';
import { leagueApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Avatar, Card, List, Sheet } from '../ui/index.js';
import { reactionOf } from './feedModel.js';

export function ReactorsSheet({ args }) {
  const app = useAppData(), shell = useShell();
  const names = new Map((app.community.data?.members ?? []).map(member => [member.id, member.displayName]));
  const [state, setState] = useState({ loading: true, reactors: [], error: null });
  useEffect(() => {
    const controller = new AbortController();
    leagueApi('reactors', { postId: args?.postId }, controller.signal).then(reply => {
      if (!controller.signal.aborted) setState({ loading: false, reactors: reply.reactors, error: null });
    }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setState({ loading: false, reactors: [], error }); });
    return () => controller.abort();
  }, [args?.postId]);
  return <Sheet title={state.loading ? 'Reactions' : `Reactions · ${state.reactors.length}`} onClose={shell.closeSheet}>
    {state.loading ? <p className="gx-t-body gx-c-2" role="status">Loading reactions…</p> : null}
    {state.error ? <p className="gx-t-body gx-c-loss" role="alert">{state.error.status ? state.error.message : 'No connection. Reconnect and try again.'}</p> : null}
    {!state.loading && !state.error && !state.reactors.length ? <p className="gx-t-body gx-c-2">No reactions yet.</p> : null}
    {state.reactors.length ? <Card variant="flush"><List label="Who reacted" data-emoji-ok="true">{state.reactors.map(row => {
      const name = names.get(row.userId) || 'Former member', reaction = reactionOf(row.reaction);
      return <div key={row.userId} className="gx-feed-reactor">
        <Avatar id={row.userId} name={name} size={36} you={row.userId === app.accountId}/>
        <span className="gx-grow gx-t-strong">{name}{row.userId === app.accountId ? ' (you)' : ''}<span className="gx-sr-only">, {reaction?.name}</span></span>
        <span className="gx-feed-emoji gx-feed-emoji--big" aria-hidden="true">{reaction?.emoji}</span>
      </div>;
    })}</List></Card> : null}
  </Sheet>;
}
