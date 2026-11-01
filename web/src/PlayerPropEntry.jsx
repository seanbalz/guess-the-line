import {ChoiceButtons} from './BetEntryControls.jsx';
import {PROP_STATS,parsePlayerProp,playerPropLeg} from './trackedBetTerms.js';
export function PlayerPropEntry({leg,disabled,onChange}) {
  const parsed=parsePlayerProp(leg);
  const custom=leg.customProp??Boolean(leg.selection&&!parsed);
  const fields=leg.propFields||parsed||{player:'',stat:'rushing yards',direction:'over',line:''};
  function change(patch){const next={...fields,...patch};onChange({...playerPropLeg(leg.gameId,next),propFields:next,customProp:false});}
  return <div className="social-prop-entry social-wide">
    <label>Prop market<select aria-label="Prop market" value={custom?'custom':fields.stat} disabled={disabled} onChange={e=>{const stat=e.target.value;if(stat!=='custom')change({stat});else onChange({...leg,customProp:true});}}>{PROP_STATS.map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="custom">Other / custom selection</option></select></label>
    {custom?<><label>Player name<input required maxLength={120} value={leg.side} disabled={disabled} onChange={e=>onChange({...leg,side:e.target.value})}/></label><label>Player and exact selection<input required maxLength={200} value={leg.selection} disabled={disabled} onChange={e=>onChange({...leg,selection:e.target.value})}/></label></>:<>
      <label>Player name<input required maxLength={120} autoComplete="off" value={fields.player} disabled={disabled} onChange={e=>change({player:e.target.value})}/></label>
      {fields.stat!=='anytime touchdown'&&<><ChoiceButtons label="Prop direction" options={[{value:'over',label:'Over'},{value:'under',label:'Under'},{value:'at least',label:'At least (+)'}]} value={fields.direction} disabled={disabled} onChange={direction=>change({direction})}/><label>Prop line<input type="number" inputMode="decimal" step="0.5" min="0" max="10000" required value={fields.line} disabled={disabled} onChange={e=>change({line:e.target.value})}/></label></>}
      <output className="social-prop-preview" aria-live="polite">{leg.selection||'Complete the selection above'}</output>
    </>}
  </div>;
}
