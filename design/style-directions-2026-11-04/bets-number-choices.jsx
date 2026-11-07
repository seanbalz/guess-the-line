// Preview-only odds/units adaptation: native presets, Unknown and Custom plus explicit +/- adjustment.
import React,{useId,useState} from 'react';
import {Check,Minus,Plus} from 'lucide-react';
import {NumberChoices as NativeNumberChoices} from '../../web/src/BetEntryControls.jsx';
import {adjustOdds,adjustUnits} from './bets-adjustments.mjs';
export const TAP_STEPS={odds:5,units:.1};
export function NumberChoices(props){
 const kind=props.label==='Units risked'?'units':props.label==='American odds'||props.label==='Combined American odds'?'odds':null;
 return kind?<SteppedChoices {...props} min={kind==='units'?0.01:props.min} presets={kind==='units'?[0.01,...props.presets.filter(v=>v!==0.01)]:props.presets} kind={kind}/>:<NativeNumberChoices {...props}/>;
}
function SteppedChoices({label,value,onChange,presets,format=String,disabled=false,allowUnknown=false,required=false,step='0.01',min,max,kind,children}){
 const id=useId(),[custom,setCustom]=useState(false),present=value!==''&&value!=null,numeric=Number(value),adjust=kind==='odds'?adjustOdds:adjustUnits;
 const lower=adjust(value,-1,TAP_STEPS[kind]),higher=adjust(value,1,TAP_STEPS[kind]);
 const choose=next=>{onChange(next);setCustom(false);};
 return <fieldset className="social-entry-field social-entry-numbers real-bets-stepped" disabled={disabled} data-entry-stepper={kind}><legend>{label}</legend>
  {children}
  <div className="real-bets-adjustment" data-unknown={!present} role="group" aria-label={`Adjust ${label}`}>
   <button type="button" className="social-entry-option" aria-label={`Decrease ${label} by ${TAP_STEPS[kind]}`} disabled={disabled||lower===null} onClick={()=>choose(lower)}><Minus size={20} aria-hidden="true"/></button>
   <output aria-live="polite" aria-atomic="true">{present?format(numeric):'Unknown'}</output>
   <button type="button" className="social-entry-option" aria-label={`Increase ${label} by ${TAP_STEPS[kind]}`} disabled={disabled||higher===null} onClick={()=>choose(higher)}><Plus size={20} aria-hidden="true"/></button>
  </div>
  <small className="real-bets-step-note">{present?`Each tap: ${TAP_STEPS[kind]}${kind==='units'?'U':' points'}`:'Choose a preset to enable − / +.'}</small>
  <div className="social-entry-options">{presets.map(option=><button className="social-entry-option" key={option} type="button" aria-pressed={present&&numeric===option} disabled={disabled} onClick={()=>choose(option)}>{present&&numeric===option?<Check size={16} aria-hidden="true"/>:null}{format(option)}</button>)}
   {allowUnknown?<button className="social-entry-option" type="button" aria-pressed={!present} disabled={disabled} onClick={()=>choose('')}>{!present?<Check size={16} aria-hidden="true"/>:null}Unknown</button>:null}
   <button className="social-entry-option" type="button" aria-expanded={custom} aria-controls={id} disabled={disabled} onClick={()=>setCustom(v=>!v)}>Custom</button>
  </div>
  <div id={id} hidden={!custom}>{custom?<label className="social-entry-custom">{label}<input type="number" inputMode="decimal" value={value??''} required={required} step={step} min={min} max={max} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>:null}</div>
 </fieldset>;
}
