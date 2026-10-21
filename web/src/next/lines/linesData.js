// What the Lines tab, the game sheet and the All trends sheet read (redesign build plan stage 13): the shared reads
// (`/personal`, the viewer's own week, and `/community/read`, through the data layer), the public trends week file
// (a lazy same-origin chunk, through trendsHooks.js) and the public team records. Nothing here writes. The kickoff wind
// forecast (`/wind/read`) and the referee assignments (`/officials/read`) are read by the game sheet itself, only once it
// opens.
import teamRecords from '../../../../shared/team-records-2026.json';
import { weekOf } from '../../../../shared/lines-view.mjs';
import { useTrendWeek } from './trendsHooks.js';
import { useAppData, useSharedRead } from '../data/AppData.jsx';

export function useLinesData() {
  const app = useAppData();
  const personal = useSharedRead('personal');
  const shown = weekOf(personal.data);
  const trends = useTrendWeek(shown?.season, shown?.week, Boolean(shown), app.accountId);
  return {
    app,
    personal,
    community: app.community.data ?? null,
    shown,
    trends,
    trendsWeek: trends.status === 'ready' ? trends.week : null,
    records: teamRecords,
  };
}
