// D-65 follow-up: the documented adapter (docs/ALL_TABS_LIVE_WORKFLOWS.md) that gives the old Settings page's Final scores
// editor a home in Menu › Commissioner tools: the old ResultReviewControls, unchanged, with the same gtl-api route
// (results/review), validation, review dialog and request ids, inside `gx-live-workflow`, which maps its old token names
// onto the new app's tokens. Odds connection is native since stage 78 (OddsConnection.jsx); its schedule line still uses
// the old app's pure formatter (marketStatus.js) from here.
import { TeamMark } from '../../ui/index.js';
import ResultReviewControls from '../../../ResultReviewControls.jsx';
import { refreshLabel, scheduleDetails } from '../../../marketStatus.js';

/** `data` is the sean-troy-luke `/state` read; `resultReview` is present only for its original commissioner. */
export function FinalScoresEditor({ data, onReviewed, renderTool }) {
  const wrap = content => <div className="gx-live-workflow gx-cm-legacy">{content}</div>;
  return <ResultReviewControls renderLayout={(body, footer) => renderTool ? renderTool(wrap(body), wrap(footer)) : wrap(<>{body}{footer}</>)} data={data} onReviewed={onReviewed} renderTeamMark={(game, side) => game ? <TeamMark code={game[`${side}Code`]} name={game[side]} size={48} decorative/> : null}/>;
}

/** The odds refresh schedule's label and details, or the formatter's own "unavailable" words when the read has none. */
export function oddsScheduleText(data) {
  const view = { oddsSchedule: data?.oddsSchedule };
  return { label: refreshLabel(view), details: scheduleDetails(view) };
}
