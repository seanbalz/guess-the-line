// D-65 follow-up: the documented adapter (docs/ALL_TABS_LIVE_WORKFLOWS.md) that gives two of the old Settings page's
// commissioner editors a home in Menu › Commissioner tools. Final scores is the old ResultReviewControls and Odds connection
// the old ManualOddsControls, unchanged: the same gtl-api routes (results/review, odds/preflight, odds/collect), the same
// validation, review dialog and request ids. The odds schedule line uses the old app's pure formatter (marketStatus.js).
// Both render inside `gx-live-workflow`, which maps their old token names onto the new app's tokens.
import ManualOddsControls from '../../../ManualOddsControls.jsx';
import ResultReviewControls from '../../../ResultReviewControls.jsx';
import { refreshLabel, scheduleDetails } from '../../../marketStatus.js';

/** `data` is the sean-troy-luke `/state` read; `resultReview` is present only for its original commissioner. */
export function FinalScoresEditor({ data, onReviewed }) {
  return <div className="gx-live-workflow gx-cm-legacy"><ResultReviewControls data={data} onReviewed={onReviewed}/></div>;
}

export function OddsConnectionEditor({ data, onCollected }) {
  return <div className="gx-live-workflow gx-cm-legacy"><ManualOddsControls schedule={data?.oddsSchedule} onCollected={onCollected}/></div>;
}

/** The odds refresh schedule's label and details, or the formatter's own "unavailable" words when the read has none. */
export function oddsScheduleText(data) {
  const view = { oddsSchedule: data?.oddsSchedule };
  return { label: refreshLabel(view), details: scheduleDetails(view) };
}
