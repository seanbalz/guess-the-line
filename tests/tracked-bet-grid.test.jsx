import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TrackedBetRow} from '../web/src/next/bets/TrackedBetRow.jsx';
import {PlayerPropEntry} from '../web/src/PlayerPropEntry.jsx';
import {nameFrom,parseMarkup,walk} from './helpers/ui-markup.mjs';
describe('selected roomy ticket preview and full grid',()=>{
 const legs=Array.from({length:6},(_,i)=>({gameId:'SEA-DEN',market:'prop',side:'yes',line:null,selection:`Sample Player ${i+1} anytime touchdown (1+)`}));
 const entry={kind:'parlay',legs,outcome:'pending',stakeUnits:.1,odds:1500,potentialReturnUnits:1.6,week:8,source:'Manual book'};
 it('starts with a closed preview and retains all full selections, preserving unknown cash when the unit is unknown',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={entry} games={[]}><p>Audit data</p></TrackedBetRow>);
  for(let i=1;i<=6;i++)expect(html).toContain(`Sample Player ${i}`);
  expect(html.match(/<li>/g)).toHaveLength(6);expect(html).toContain('aria-expanded="false"');expect(html).not.toContain('$');expect(html).toContain('0.1U');
  expect(html).toContain('aria-label="Expand 6-leg parlay"');expect(html).toContain('class="gx-tracked-expanded" hidden=""');
 });
 it('converts only display amounts using the explicit unit value and labels total return',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={entry} games={[]} unitCash={100}/>);
  expect(html).toContain('$10.00');expect(html).toContain('$160.00');expect(html).toContain('Includes stake');
 });
 it('shows exact milestone semantics and keeps unparsed custom text',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={{...entry,kind:'single',legs:[{...legs[0],selection:'Sample Runner 70+ rushing yards'}]}} games={[]}/>);
  expect(html).toContain('70+');expect(html).not.toContain('Over 70');
 });
 it('asks for the player once in guided entry while leaving older custom selections intact',()=>{
  const common={disabled:false,onChange:()=>{}};
  const fresh=renderToStaticMarkup(<PlayerPropEntry {...common} leg={{gameId:'SEA-DEN',market:'prop',side:'',selection:''}}/>);
  expect(fresh.match(/Player name/g)).toHaveLength(1);expect(fresh).not.toContain('Player and exact selection');
  const custom=renderToStaticMarkup(<PlayerPropEntry {...common} leg={{...legs[0],selection:'Original custom ticket'}}/>);
  expect(custom).toContain('Original custom ticket');
 });
 it('filters player suggestions to the matchup while retaining manual names without roster coverage',()=>{
  const props={game:{id:'CHI-SEA'},disabled:false,onChange:()=>{},leg:{gameId:'CHI-SEA',market:'prop',side:'',selection:'',propFields:{player:'Sample',stat:'receiving yards',direction:'at least',line:40}}};
  const html=renderToStaticMarkup(<PlayerPropEntry {...props} players={[{id:'1',name:'Sample Receiver',team:'SEA',position:'WR'},{id:'2',name:'Sample Elsewhere',team:'DAL',position:'WR'}]}/>);
  expect(html).toContain('Sample Receiver');expect(html).not.toContain('Sample Elsewhere');
  const manual=renderToStaticMarkup(<PlayerPropEntry {...props}/>);expect(manual).toContain('value="Sample"');expect(manual).not.toContain('Matching players');
 });
});
// Design audit A13: a ticket preview's amounts use the app's styles in the n-m number type ("0.5U", "+1U", "−0.25U"); the
// full ticket keeps the exact saved units (four decimals) with a real minus; a missing amount reads "—" and its label says
// unknown (D-72), instead of the word "Unknown" set as a number.
describe('tracked ticket amounts',()=>{
 const leg={gameId:'SEA-DEN',market:'prop',side:'Fixture Runner',line:30,selection:'Fixture Runner 30+ receiving yards'};
 const row=entry=>parseMarkup(renderToStaticMarkup(<TrackedBetRow entry={{kind:'single',legs:[leg],week:6,source:'Book B',odds:100,...entry}} games={[]}/>));
 // [label, value class, value] per amount: the preview's <small> over <strong>, the full ticket's <dt> over <dd>.
 const amounts=(tree,box)=>{
  const ticket=box==='gx-tracked-money',labels=[...walk([...walk(tree)].find(n=>n.attrs?.class===box))].filter(n=>n.tag===(ticket?'dt':'small'));
  return labels.map(label=>{const value=label.parent.children.find(n=>n.tag===(ticket?'dd':'strong'));return [nameFrom(label),value.attrs.class,nameFrom(value.children[0])];});
 };
 it('previews a loss and a win with their signs in the n-m style, and keeps the exact units in the full ticket',()=>{
  const lost=row({outcome:'loss',stakeUnits:.0747,netUnits:-.0747});
  expect(amounts(lost,'gx-tracked-preview-money')).toEqual([['Risk','gx-n-m','0.07U'],['Net units','gx-n-m gx-c-loss','−0.07U']]);
  expect(amounts(lost,'gx-tracked-money')).toEqual([['Risk','gx-n-m','0.0747U'],['Net units','gx-n-m gx-c-loss','−0.0747U']]);
  expect(amounts(row({outcome:'win',stakeUnits:1,netUnits:1}),'gx-tracked-preview-money')).toEqual([['Risk','gx-n-m','1U'],['Net units','gx-n-m gx-c-win','+1U']]);
 });
 it('shows a missing return as a dash with its label saying unknown, in the preview and the full ticket',()=>{
  const open=row({outcome:'pending',stakeUnits:.5,odds:null,potentialReturnUnits:null});
  expect(amounts(open,'gx-tracked-preview-money')).toEqual([['Risk','gx-n-m','0.5U'],['Total return · unknown','gx-n-m','—']]);
  expect(amounts(open,'gx-tracked-money')).toEqual([['Risk','gx-n-m','0.5U'],['To return · unknown','gx-n-m','—']]);
  expect(renderToStaticMarkup(<TrackedBetRow entry={{kind:'single',legs:[leg],week:6,outcome:'pending',stakeUnits:.5,odds:null,potentialReturnUnits:null}} games={[]}/>)).not.toContain('Unknown<');
 });
});
