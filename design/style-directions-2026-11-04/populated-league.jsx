// League visual adapter: fictional identities/activity; no authenticated readers, feed actions or writes.
import React,{useEffect,useRef,useState} from 'react';
import {boardFor,chaseLine} from '../../shared/guess-board.mjs';
import {boardSlice,PREVIEW_POSTS} from '../../web/src/next/league/leagueModel.js';
import {boardRows as pointsRows} from '../../web/src/next/play/points/pointsModel.js';
import {foldPosts,namesLine,postLine,postMeta,reactionChips,withReaction,REACTION_SET,commentButton,commentDraft} from '../../web/src/next/feed/feedModel.js';
import {fmtPostTime} from '../../web/src/next/format.js';
import {shortName} from '../../web/src/communityFormat.js';
import {Avatar,AvatarStack} from '../../web/src/next/ui/Avatar.jsx';
import {Rank} from '../../web/src/next/ui/Rank.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {ArrowLeft,ArrowRight,ChevronDown,LockKeyhole,MessageCircle,Plus,Users} from 'lucide-react';
const n=value=>value===null||value===undefined?'—':Number.isInteger(value)?String(value):value.toFixed(1);
const MARKETS=[{value:'guess_spread',label:'Spread'},{value:'guess_total',label:'Total'},{value:'guess_points',label:'Points'}];
export function leagueRows(model,mode){
 if(mode==='guess_points'){const data=pointsRows(model.points,model.viewer);return data.members.map(r=>({id:r.userId,name:r.name,you:r.you,points:r.season,week:r.week,rank:r.rank,tied:r.tied}));}
 const ranked=boardFor({...model,mode}),seen=new Set(ranked.map(r=>r.id));
 return [...ranked,...model.members.filter(m=>!seen.has(m.id)).map(m=>({id:m.id,name:m.displayName,you:m.id===model.viewer,points:null,rank:null,tied:false}))].map(r=>({...r,week:model.standings.find(s=>s.userId===r.id&&s.mode===mode)?.weekPoints??null}));
}
export function LeaguePreview({model,theme,onSelection}){
 const [mode,setMode]=useState('guess_spread'),[view,setView]=useState('board'),[all,setAll]=useState(false),[posts,setPosts]=useState(model.posts),[expanded,setExpanded]=useState(false),[choosing,setChoosing]=useState(null),[thread,setThread]=useState(null),[drafts,setDrafts]=useState({}),[notice,setNotice]=useState('');
 const root=useRef(null),feedOpener=useRef(null),savedFeedScroll=useRef(0);
 const names=new Map(model.members.map(m=>[m.id,m])),rows=leagueRows(model,mode),mine=rows.find(r=>r.you),slice=boardSlice(rows,all),market=MARKETS.find(m=>m.value===mode).label;
 const items=foldPosts(posts,model.viewer),shown=view==='board'?items.slice(0,PREVIEW_POSTS):expanded?items:items.slice(0,4),selected=posts.find(p=>p.id===thread);
 const changeView=next=>{setView(next);setChoosing(null);root.current.closest('.screen').scrollTop=0;requestAnimationFrame(()=>root.current.querySelector(next==='feed'?'.real-league-back':'.real-league-open-feed')?.focus({preventScroll:true}));};
 useEffect(()=>{onSelection?.({name:view==='feed'?'League feed':'Your league',open:view==='feed'});},[view,onSelection]);
 // Match the native layer host: keep background controls inert while the comments Sheet is open.
 useEffect(()=>{
  if(!thread)return;
  const panel=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];
  for(let branch=panel;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}
  const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';
  return()=>{changed.forEach(el=>el.inert=false);screen.style.overflow=overflow;};
 },[thread]);
 function reaction(postId,key){setPosts(current=>current.map(p=>p.id===postId?{...p,reactions:withReaction(p.reactions,p.reactions.mine===key?null:key)}:p));setChoosing(null);requestAnimationFrame(()=>{const post=root.current.querySelector(`[data-demo-post="${postId}"]`);(post?.querySelector(`[data-reaction-key="${key}"]`)??post?.querySelector('[data-add-reaction]'))?.focus({preventScroll:true});});}
 function openThread(id){feedOpener.current=root.current.ownerDocument.activeElement;savedFeedScroll.current=root.current.closest('.screen').scrollTop;setThread(id);setNotice('');}
 function closeThread(){const id=thread;setThread(null);requestAnimationFrame(()=>{const opener=root.current.querySelector(`[data-comments-for="${id}"]`)??feedOpener.current;opener?.focus({preventScroll:true});root.current.closest('.screen').scrollTop=savedFeedScroll.current;});}
 function previewComment(event){event.preventDefault();const draft=drafts[thread]??'';if(!commentDraft(draft).ok)return;setPosts(current=>current.map(p=>p.id===thread?{...p,commentCount:p.commentCount+1,comments:[...p.comments,{id:`demo-comment-${p.comments.length}`,userId:model.viewer,body:draft.trim()}]}:p));setDrafts(current=>({...current,[thread]:''}));setNotice('Added to this preview only. Nothing was posted.');}
 const explanation=<InfoButton title="About this League preview" body={[model.notice,'The Spread and Total boards reuse GTL’s ranking helpers and the reviewed public historical score examples. The Points board and its unranked House value are fictional demonstration totals. Markets are never added together.','Tied scores share a rank. A scored zero is ranked; a member with no scored result remains unranked. The first six rows and your row stay visible before Show more.','The live app reads the Community or a private group through authenticated readers and applies its reveal gates. This preview contains no real member history or hidden pick numbers. Reactions and comments change memory only.','Existing initials avatars are retained. New profile-picture options, awards and celebration work remain deferred.']} links={[{text:'Historical example source · nflverse · CC BY 4.0',url:model.source.release}]}/>;
 const postProps={model,theme,names,choosing,setChoosing,reaction,openThread};
 return <section className="real-league real-play" ref={root} aria-label="Fictional League visual review">
  {view==='feed'?<button type="button" className="real-league-back" onClick={()=>changeView('board')}><ArrowLeft size={16} aria-hidden="true"/>Back to standings</button>:null}
  <div className="real-league-head"><div><p className="real-play-eyebrow">{view==='feed'?'DEMO TIMELINE · NOV 3 · PT':'FICTIONAL LEAGUE'}</p><h3>{model.name}</h3><p className="real-league-meta">{view==='feed'?'Sample posts · no live activity':`${model.members.length} sample members · Weeks 6–8`}</p></div>{explanation}</div>
  {view==='board'?<><Segmented label="League market" options={MARKETS} value={mode} onChange={value=>{setMode(value);setAll(false);}}/>
   <section className="real-league-hero" aria-label="Your sample standing"><div><small>Your rank</small><b>{mine.tied?'T-':''}{mine.rank??'—'}</b></div><div><small>{mode==='guess_points'?'Season points':market+' points'}</small><b>{n(mine.points)}</b></div><p>{mode==='guess_points'?`Week 8 · ${n(mine.week)} sample points`:chaseLine({...model,mode,names:Object.fromEntries(model.members.map(m=>[m.id,m.displayName]))})}</p></section>
   <div className="real-league-section-title"><h3>Season example</h3><span>Week 8 beneath each name</span></div>
   <div className="real-league-board" role="list" aria-label={`${market} sample season standings`}>{slice.shown.map(row=><div className={'real-league-row'+(row.you?' is-you':'')+(row.rank===1?' is-leader':'')} role="listitem" key={row.id} data-league-member={row.id} data-rank={row.rank??''} data-points={row.points??''}>
    <Rank rank={row.rank} tied={row.tied}/><Avatar id={row.id} name={row.name} size={40} you={row.you}/><div className="real-league-person"><strong>{row.name}{row.you?<em>You</em>:null}</strong><span>{row.rank===1?'Leader · ':''}{row.week===null?'New · no scored result':`Week 8: ${n(row.week)} pts`}</span></div><b className="real-league-points">{n(row.points)}</b>
   </div>)}</div>
   {slice.more>0||all?<Button haptic={false} aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show fewer':`${slice.more} more on the board`}</Button>:null}
   {mode==='guess_points'?<div className="real-league-house"><span>House · unranked<small>Week 8 · fictional example</small></span><b>{n(pointsRows(model.points,model.viewer).house.week)}</b></div>:null}
   <div className="real-league-section-title"><h3>Newest posts</h3><span>Samples</span></div>
  </>:null}
  <div className="real-league-feed">{shown.map(item=>item.type==='digest'?<Digest key={item.key} item={item} {...postProps}/>:<Post key={item.post.id} post={item.post} {...postProps}/>)}</div>
  {view==='board'?<Button className="real-league-open-feed" variant="primary" haptic={false} onClick={()=>changeView('feed')}>Open the feed<ArrowRight size={17} aria-hidden="true"/></Button>:!expanded&&items.length>shown.length?<Button haptic={false} onClick={()=>setExpanded(true)}>Show older sample posts</Button>:null}
  <p className="real-league-source">Fictional league · sample standings and activity<br/>No account data · no posts sent</p>
  {selected?<Sheet title="Sample comments" closeLabel="Close sample comments" onClose={closeThread} tall className="real-league-comments" footer={<form onSubmit={previewComment}><label htmlFor="demo-league-comment">Sample comment</label><textarea id="demo-league-comment" rows={2} maxLength={500} placeholder="Try a comment in this preview" value={drafts[thread]??''} onChange={e=>setDrafts(d=>({...d,[thread]:e.target.value.slice(0,500)}))}/>{commentDraft(drafts[thread]??'').counter?<small>{commentDraft(drafts[thread]).counter}</small>:null}<Button type="submit" variant="primary" haptic={false} disabled={!commentDraft(drafts[thread]??'').ok}>Add to preview</Button><p role="status">{notice||'Memory only · this does not post to GTL'}</p></form>}>
   <div className="real-league-thread-summary"><strong>{names.get(selected.actorId)?.displayName??'GTL'}</strong><p>{postLine(selected)}</p></div><div className="real-league-thread" aria-label="Sample comments">{selected.comments.map(c=><article key={c.id}><Avatar id={c.userId} name={names.get(c.userId).displayName} size={32}/><div><strong>{names.get(c.userId).displayName}</strong><p>{c.body}</p></div></article>)}</div>
  </Sheet>:null}
 </section>;
}
function Digest({item,...props}){
 const [open,setOpen]=useState(false),people=item.posts.map(p=>props.names.get(p.actorId));
 return <section className="real-league-digest" data-demo-digest={item.posts.length}>{open?<>{item.posts.map(post=><Post key={post.id} post={post} {...props}/>)}<Button haptic={false} onClick={()=>setOpen(false)}>Fold these {item.posts.length} posts</Button></>:<article className="real-league-post"><AvatarStack people={people.map(p=>({id:p.id,name:p.displayName}))} size={32}/><h4>{namesLine(people.map(p=>p.displayName))}</h4><p className="real-league-meta">{item.posts.length} players locked in picks · sample activity</p><Button haptic={false} onClick={()=>setOpen(true)} aria-expanded={false}>Show each post ({item.posts.length})<ChevronDown size={15} aria-hidden="true"/></Button></article>}</section>;
}
function GameMarks({game}){return <div className="real-league-matchup"><span><TeamMark code={game.awayCode} size={32} decorative/><strong>{shortName(game.awayCode)}</strong></span><small>at</small><span><TeamMark code={game.homeCode} size={32} decorative/><strong>{shortName(game.homeCode)}</strong></span></div>;}
function Post({post,model,theme,names,choosing,setChoosing,reaction,openThread}){
 const actor=names.get(post.actorId),system=['week_published','kickoff'].includes(post.kind),chips=reactionChips(post.reactions),comments=commentButton(post),result=post.kind==='result_shared'?post.embed:null;
 return <article className="real-league-post" data-demo-post={post.id}>
  <header><span>{system?<img className="real-league-system-mark" src={theme==='light'?'logo-hybrid/light-deep-green.svg':'logo-hybrid/lime.svg'} alt="Guess the Line"/>:<Avatar id={post.actorId} name={actor.displayName} size={40}/>}</span><div><strong>{system?'Guess the Line':actor.displayName}{post.actorId===model.viewer?' · You':''}</strong><p>{postLine(post)}</p></div><time dateTime={post.createdAt}>{fmtPostTime(post.createdAt,model.now)}</time></header>
  {postMeta(post)?<p className="real-league-meta">{postMeta(post)}</p>:null}
  {result?<div className="real-league-result"><GameMarks game={result.game}/><div className="real-league-result-value"><b>{n(result.points)}<small> / 10</small></b><span>sample accuracy points</span></div><p>Sample guess: {post.mode==='guess_total'?`${n(result.pick)} combined points`:result.pick===0?"Pick’em":`${shortName(result.pick<0?result.game.homeCode:result.game.awayCode)} −${n(Math.abs(result.pick))}`}</p><span className="real-league-result-bar" aria-hidden="true"><span style={{width:`${result.points*10}%`}}/></span><small>Historical reference · fictional player result</small></div>:null}
  {post.kind==='ballot_submitted'?<div className="real-league-hidden"><LockKeyhole size={18} aria-hidden="true"/><span>{post.embed.hiddenGames.length} {post.embed.hiddenGames.length===1?'game':'games'} hidden<small>Own lock-in or each game’s kickoff opens permitted picks.</small></span><InfoButton title={`About ${actor.displayName}’s hidden sample picks`} body={['These sample posts contain only game identifiers and hidden counts. No guess, scoring line or hidden points are bundled.','In GTL, a viewer’s own lock-in for that game and market, or that game’s kickoff, opens the permitted picks. Other games and markets stay separate.']}/></div>:null}
  {post.kind==='kickoff'?<div className="real-league-kickoff"><GameMarks game={post.embed.games[0].game}/><p><Users size={15} aria-hidden="true"/>{post.embed.games[0].in.length} sample players in</p></div>:null}
  <div className="real-league-reactions" data-emoji-ok="true">{chips.map(c=><button type="button" key={c.key} data-reaction-key={c.key} aria-label={c.label} aria-pressed={c.mine} onClick={()=>reaction(post.id,c.key)}><span aria-hidden="true">{c.emoji}</span><b aria-hidden="true">{c.count}</b></button>)}<button type="button" data-add-reaction aria-label="Choose a sample reaction" aria-expanded={choosing===post.id} onClick={()=>setChoosing(choosing===post.id?null:post.id)}><Plus size={16} aria-hidden="true"/></button><button type="button" className="real-league-comment-open" data-comments-for={post.id} data-focus-return={`league-comments-${post.id}`} aria-label={comments.label} onClick={()=>openThread(post.id)}><MessageCircle size={16} aria-hidden="true"/><span>{comments.text}</span></button></div>
  {choosing===post.id?<div className="real-league-reaction-options" role="group" aria-label="Sample reaction choices" data-emoji-ok="true">{REACTION_SET.map(r=><button type="button" key={r.key} aria-label={r.name} aria-pressed={post.reactions.mine===r.key} onClick={()=>reaction(post.id,r.key)}>{r.emoji}</button>)}</div>:null}
  {post.comments.length>0?<p className="real-league-comment-preview"><strong>{names.get(post.comments[0].userId).displayName}</strong> {post.comments[0].body}</p>:null}
 </article>;
}
