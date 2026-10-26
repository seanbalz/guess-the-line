// `sh.comments`: one post's comments, or a kickoff post's game thread (redesign build plan stage 64; prototype
// sh.comments). Comments read oldest first, a page at a time from /league/comments; a comment is 1 to 500 characters
// and can't be edited or deleted. What the member types is kept for this account in this tab (web/src/nextDrafts.js
// keys, cleared when the account changes) with its request id, so a lost answer keeps the text and a retry records the
// comment once.
import { useEffect, useRef, useState } from 'react';
import { leagueApi } from '../../api.js';
import { nextDraftKey } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Avatar, Button, List, Sheet } from '../ui/index.js';
import { fmtPostTime } from '../format.js';
import { COMMENT_MAX, commentDraft, gameName } from './feedModel.js';
import { feedChanged } from './feedActions.js';

const draftKey = (account, post) => nextDraftKey(account, `c-${post}`);
function readDraft(key) {
  try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); return value && typeof value.body === 'string' ? { body: value.body, requestId: value.requestId || null } : { body: '', requestId: null }; }
  catch { return { body: '', requestId: null }; }
}
function saveDraft(key, value) { try { value.body ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch { /* The typed copy stays in memory. */ } }

export function CommentsSheet({ args }) {
  const app = useAppData(), shell = useShell();
  const postId = args?.postId, kickoff = args?.kind === 'kickoff';
  const names = new Map((app.community.data?.members ?? []).map(member => [member.id, member.displayName]));
  const [list, setList] = useState({ loading: true, comments: [], total: 0, next: null, error: null });
  const [olderBusy, setOlderBusy] = useState(false);
  const key = draftKey(app.accountId, postId);
  const [draft, setDraft] = useState(() => readDraft(key));
  const current = useRef(draft), pending = useRef(false);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    leagueApi('comments', { postId }, controller.signal).then(reply => {
      if (!controller.signal.aborted) setList({ loading: false, comments: reply.comments, total: reply.total, next: reply.next, error: null });
    }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setList(previous => ({ ...previous, loading: false, error })); });
    return () => controller.abort();
  }, [postId]);

  async function older() {
    if (olderBusy || !list.next) return;
    setOlderBusy(true);
    try {
      const reply = await leagueApi('comments', { postId, before: list.next });
      setList(previous => ({ ...previous, comments: [...reply.comments, ...previous.comments], next: reply.next }));
    } catch (error) { setList(previous => ({ ...previous, error })); }
    finally { setOlderBusy(false); }
  }

  function change(value) {
    const next = { body: value.slice(0, COMMENT_MAX), requestId: null };
    current.current = next; setDraft(next); saveDraft(key, next); setProblem('');
  }
  async function post(event) {
    event.preventDefault();
    const typed = current.current;
    if (pending.current || !commentDraft(typed.body).ok) return;
    const sent = { ...typed, requestId: typed.requestId || crypto.randomUUID() };
    current.current = sent; setDraft(sent); saveDraft(key, sent);
    pending.current = true; setBusy(true); setProblem('');
    try {
      const result = await app.mutateCommunity('comment', { postId, body: sent.body.trim(), requestId: sent.requestId });
      if (!result.ok) {
        setProblem(result.kind === 'uncertain' ? 'We could not confirm your comment. It is kept here; check the comments before posting again.'
          : result.kind === 'offline' ? 'No connection. Your comment is kept here.' : result.message || 'Your comment was not posted. Try again.');
        return;
      }
      const comment = { id: result.data.id, userId: app.accountId, body: sent.body.trim(), createdAt: new Date().toISOString() };
      setList(previous => (previous.comments.some(c => c.id === comment.id) ? previous : { ...previous, comments: [...previous.comments, comment], total: previous.total + 1 }));
      feedChanged({ type: 'comment', postId, comment });
      change('');
      shell.toast('Comment posted');
    } finally { pending.current = false; setBusy(false); }
  }

  const state = commentDraft(draft.body);
  const title = kickoff ? `Game thread${args?.gameId ? ` · ${gameName(args.gameId)}` : ''}` : `Comments · ${list.total}`;
  const inputLabel = kickoff ? 'Talk about the game' : 'Add a comment';
  const footer = <form className="gx-vstack gx-gap-8" onSubmit={post}>
    <label className="gx-sr-only" htmlFor={`gx-feed-cin-${postId}`}>{inputLabel}</label>
    <div className="gx-hstack gx-gap-8 gx-top">
      <textarea id={`gx-feed-cin-${postId}`} className="gx-input gx-grow gx-feed-cin" rows={2} maxLength={COMMENT_MAX} placeholder={inputLabel} value={draft.body} readOnly={busy}
        onChange={event => change(event.target.value)}/>
      <Button type="submit" variant="primary" aria-disabled={busy || !state.ok || undefined}>{busy ? 'Posting…' : 'Post'}</Button>
    </div>
    <p className="gx-t-meta gx-c-2">Comments can&rsquo;t be edited or deleted.{state.counter ? <span className="gx-c-pending"> {state.counter}</span> : null}</p>
    {problem ? <p className="gx-t-body gx-c-loss" role="alert">{problem}</p> : null}
  </form>;
  return <Sheet title={title} onClose={shell.closeSheet} footer={footer} tall>
    {list.loading ? <p className="gx-t-body gx-c-2" role="status">Loading comments…</p> : null}
    {list.error ? <p className="gx-t-body gx-c-loss" role="alert">{list.error.status ? list.error.message : 'No connection. Reconnect and try again.'}</p> : null}
    {list.next ? <Button variant="ghost" onClick={older} aria-disabled={olderBusy || undefined}>{olderBusy ? 'Loading…' : 'Show earlier comments'}</Button> : null}
    {!list.loading && !list.comments.length && !list.error ? <p className="gx-t-body gx-c-2">No comments yet. Say something.</p> : null}
    {list.comments.length ? <List label="Comments" className="gx-feed-comments">{list.comments.map(comment => {
      const name = names.get(comment.userId) || 'Former member';
      return <div key={comment.id} className="gx-feed-crow">
        <Avatar id={comment.userId} name={name} size={32} you={comment.userId === app.accountId}/>
        <div className="gx-grow gx-vstack gx-gap-2"><p className="gx-hstack gx-gap-8 gx-wrap"><span className="gx-t-strong">{name}</span><span className="gx-t-meta gx-c-2">{fmtPostTime(comment.createdAt, Date.now())}</span></p><p className="gx-t-body gx-feed-cm-text">{comment.body}</p></div>
      </div>;
    })}</List> : null}
  </Sheet>;
}
