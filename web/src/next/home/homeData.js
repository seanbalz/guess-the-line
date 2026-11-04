// D-53: shared Community context plus an account-scoped preferences read. D-69 step 2: the viewer's own week
// (`/personal`, the shared read Play's picks and Research already ask for) feeds This week's game tiles.
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { useAppData, useSharedRead } from '../data/AppData.jsx';

export function useHomeData() {
  const app = useAppData();
  const preferences = useAccountPreferences(app);
  const personal = useSharedRead('personal');
  return { app, preferences, community: app.community, personal, viewer: app.accountId || null };
}
