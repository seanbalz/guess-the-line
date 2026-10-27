// Me › History (redesign build plan stages 73 and 74; D-23: nothing a player entered is deleted, moved or hidden).
// One page, one title, with a view switch: Guess weeks (any member, with the week detail and, for you, your changes in
// plain words), Bets weeks (everyone's Virtual Units picks by week) and Older records (stage 74). The server decides what each viewer may see;
// this page only draws it. Navigation inside the page is the page's own args, so Back and Escape close it.
import { Icon, InfoButton, Segmented } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
import { INFO } from '../info.js';
import { HistoryGuess } from './HistoryGuess.jsx';
import { HistoryBets } from './HistoryBets.jsx';
import { HistoryOlder } from './HistoryOlder.jsx';
import './history.css';

export const HISTORY_VIEWS = Object.freeze([{ value: 'guess', label: 'Guess' }, { value: 'bets', label: 'Bets' }, { value: 'older', label: 'Older' }]);

export function History({ args = {} }) {
  const shell = useShell(), app = useAppData();
  const view = HISTORY_VIEWS.some(option => option.value === args.view) ? args.view : 'guess';
  return (
    <div className="gx-screen gx-history" data-page="history">
      <button type="button" className="gx-back-btn" onClick={shell.closePage}><Icon icon="chevronLeft" size={20}/>Back</button>
      <div className="gx-screen-head">
        <h1 className="gx-t-title">History</h1>
        <InfoButton title={INFO.history.title} body={INFO.history.body}/>
      </div>
      <Segmented label="History view" options={HISTORY_VIEWS} value={view} onChange={value => shell.setPageArgs({ view: value, week: null, older: null })}/>
      {view === 'bets' ? <HistoryBets key={app.accountId} args={args}/> : view === 'older' ? <HistoryOlder key={app.accountId} args={args}/> : <HistoryGuess key={app.accountId} args={args}/>}
    </div>
  );
}
