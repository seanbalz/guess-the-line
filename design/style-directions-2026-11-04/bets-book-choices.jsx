// Preview adaptation of existing source choices: 12 upfront, the remaining 21 searchable; manual source labels only.
import React,{useId,useState} from 'react';
import {Check} from 'lucide-react';
const books = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'BetRivers', 'Novig', 'Fanatics', 'Hard Rock Bet', 'bet365', 'Circa Sports', 'Pinnacle', 'BetOnline'];
const moreBooks = ['Sporttrade', 'Bovada', 'Wager5', 'ProphetX', 'Fliff', 'Rebet', 'BetUS', 'MyBookie', 'Heritage Sports', 'Bally Bet', 'SuperBook', 'Betfred', 'William Hill', 'Unibet', 'PointsBet', 'ESPN BET', 'theScore Bet', 'PrizePicks', 'Underdog', 'Sleeper', 'Dabble'];
export function BookChoices({ value, onChange, disabled, required }) {
  const [custom, setCustom] = useState(false), [search, setSearch] = useState(''), id = useId();
  const matches = [...books, ...moreBooks].filter(book => book.toLowerCase().includes(search.trim().toLowerCase()));
  const showCustom = custom || (Boolean(value) && ![...books,...moreBooks].includes(value));
  return <fieldset className="social-entry-field" disabled={disabled}><legend>Sportsbook / quote source</legend>
    <div className="social-entry-options">{books.map(book => <button className="social-entry-option" key={book} type="button" aria-pressed={value === book} disabled={disabled} onClick={() => { onChange(book); setCustom(false); }}>{value === book && <Check size={16} aria-hidden="true"/>}{book}</button>)}
      {!required && <button className="social-entry-option" type="button" aria-pressed={!value} disabled={disabled} onClick={() => { onChange(''); setCustom(false); }}>{!value && <Check size={16} aria-hidden="true"/>}Unknown</button>}
      <button className="social-entry-option" type="button" aria-expanded={showCustom} aria-controls={id} disabled={disabled} onClick={() => setCustom(open => !open)}>Custom</button>
    </div>
    <details className="social-more-books" open={moreBooks.includes(value)||undefined}><summary>More sportsbooks &amp; sources ({moreBooks.length})</summary>
      <label>Find sportsbook<input type="search" value={search} disabled={disabled} placeholder="Book, exchange or pick’em app" onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}/></label>
      <div className="social-entry-options">{(search.trim()?matches:moreBooks).map(book=><button className="social-entry-option" key={book} type="button" aria-pressed={value===book} disabled={disabled} onClick={()=>{onChange(book);setCustom(false);}}>{value===book&&<Check size={16} aria-hidden="true"/>}{book}</button>)}</div>
      {!matches.length&&<p role="status" className="social-help">No match. Use Custom to enter the source on your ticket.</p>}
    </details>
    <div id={id} hidden={!showCustom}>{showCustom && <label className="social-entry-custom">Sportsbook / quote source<input required={required} minLength={required ? 2 : undefined} maxLength={120} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Book shown on your ticket"/></label>}</div>
  </fieldset>;
}
