import React,{useId,useState} from 'react';
import {Check,ChartNoAxesCombined,Info,ShieldCheck,TriangleAlert,Users,WifiOff} from 'lucide-react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Skeleton} from '../../web/src/next/ui/Skeleton.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {OfflineBanner,FailCard} from './isolated-continuity-views.jsx';
import {SHELL_COPY as SHELL,APP_SCREENS_COPY as APP,APP_RELOAD_COPY as RELOAD,LEAVE_PROMPT} from './continuity-example-copy.mjs';
export function ContinuityPreview({theme='dark',scenario='offline'}){
 const [notice,setNotice]=useState(''),[guard,setGuard]=useState(scenario==='reload-warning');const guardId=useId(),standalone=['startup','account-failed'].includes(scenario),failed=['tab-failed','page-failed','reload-warning'].includes(scenario);
 function previewRetry(){setNotice('Retry example only. No view, account or data was refreshed.');}
 function previewReload(){if(standalone){setNotice('Reload example only. Nothing was reloaded or cleared.');return;}setGuard(true);setNotice('');}
 const about=<InfoButton title="About these app continuity examples" body={[
  'These are explicit fictional offline, loading and failure layouts, not observations of your connection, account or hosted service. No network status, account, saved data, draft or service-worker state is read.',
  'The native OfflineBanner and FailCard presentation bodies are isolated without their shell or stores. Their words, roles and presentation markup are retained; haptics are disabled and all callbacks are supplied by this memory-only review. Native Skeleton is reused with its static tint, without a spinner, timer or shimmer.',
  'The actual offline banner follows the browser connection flag; Retry rechecks that flag and can say Can’t refresh yet. A browser flag alone does not establish server reachability. Available content stays visible; the banner never guarantees all offline actions work.',
  'Startup and account-load failure precede the actual frame. Tab and page failures keep navigation, so only the failed view is replaced. The example Home card reuses the reviewed fictional 8/12 visual and is not a cached player ballot or actual offline readback.',
  'In the actual shell, Reload the app calls confirmLeave first when there are dirty changes. The exact Leave without saving your changes? text is shown here in an app-owned storyboard card, not a fabricated browser confirmation. Keep editing and Leave preview both avoid real navigation, reload, sign-out, clearing or writes.',
  'The actual reload guard, data preservation, reauthentication, cached reads, browser recovery, persistence and physical-device behavior remain separate acceptance. No migration, data deletion, deployment, app update, new avatar/photo or award behavior is introduced.',
 ]}/>;
 return <section className="real-continuity real-account real-play" data-standalone={standalone} data-preview-tab={scenario==='offline'?'Home':failed?'Research':undefined} aria-label="App continuity visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">APP STATE · FICTIONAL EXAMPLE</p>{about}</div>
  {standalone?<header className="real-continuity-brand"><img src={theme==='light'?'logo-hybrid/light-deep-green.svg':'logo-hybrid/lime.svg'} alt="Guess the Line G"/><strong>{APP.name}</strong></header>:null}
  {scenario==='offline'?<>
   <h1 className="real-continuity-title">Home</h1><div className="real-continuity-offline-note"><WifiOff size={17} aria-hidden="true"/>Example: offline banner over available content</div><OfflineBanner offline onRetry={()=>setNotice(SHELL.stillOffline+' · example only; no connection check occurred.')}/>
   <article className="real-continuity-home"><div><small>ILLUSTRATIVE CONTENT · NOT LIVE</small><h2>Finish your picks</h2><p>8 of 12 · fictional example</p></div><svg viewBox="0 0 64 64" role="img" aria-label="Example picks: 8 of 12"><circle className="real-continuity-ring-track" cx="32" cy="32" r="25"/><circle className="real-continuity-ring-fill" cx="32" cy="32" r="25" pathLength="12" strokeDasharray="8 12"/><text x="32" y="37" textAnchor="middle">8/12</text></svg></article>
   <div className="real-continuity-tiles"><div><ChartNoAxesCombined size={27} aria-hidden="true"/><strong>Research</strong><p>Example content card</p></div><div><Users size={27} aria-hidden="true"/><strong>Your leagues</strong><p>Example content card</p></div></div>
  </>:scenario==='startup'?<article className="real-continuity-start"><h1>{APP.loading}</h1><Skeleton label={APP.loading} shape="lines" count={2}/><p>Example startup · no account request</p></article>:scenario==='account-failed'?<article className="real-continuity-account-fail" role="alert"><TriangleAlert size={31} aria-hidden="true"/><h1>{APP.failedTitle}</h1><p>{APP.failedHelp}</p><Button variant="primary" haptic={false} onClick={previewRetry}>{APP.tryAgain}</Button><Button haptic={false} onClick={previewReload}>{RELOAD.reload}</Button><Button variant="ghost-2" haptic={false} onClick={()=>setNotice('Sign-out example only. Your session is unchanged.')}>{APP.signOut}</Button><small>Example account-load failure</small></article>:failed?<>
   <p className="real-continuity-context">Research · example failed {scenario==='page-failed'?'page':'tab'}</p><FailCard title={scenario==='page-failed'?SHELL.pageFailed:SHELL.tabFailed} onRetry={previewRetry} onReload={previewReload}/>
  </>:null}
  {guard?<section className="real-continuity-guard" role="group" aria-labelledby={guardId}><span><ShieldCheck size={25} aria-hidden="true"/>RELOAD WARNING · STORYBOARD</span><h2 id={guardId}>{LEAVE_PROMPT}</h2><p>Example of the existing dirty-changes guard. No actual browser dialog is open.</p><Button variant="primary" haptic={false} onClick={()=>{setGuard(false);setNotice('Keep-editing example. Nothing was reloaded, cleared or saved.');}}>Keep editing · preview</Button><Button haptic={false} onClick={()=>{setGuard(false);setNotice('Leave example only. Nothing was reloaded, cleared or saved.');}}>Leave · preview</Button></section>:null}
  {notice?<p className="real-continuity-notice" role="status"><Info size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-continuity-footer"><Check size={15} aria-hidden="true"/>Preview only · no connection check, reload or account change</p>
 </section>;
}
