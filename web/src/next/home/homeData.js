// D-53: shared Community context plus an account-scoped preferences read.
// The Play Home tile owns the separate authorized score-history read.
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { useAppData } from '../data/AppData.jsx';

export function useHomeData() {
  const app = useAppData();
  const preferences = useAccountPreferences(app);
  return { app, preferences, community: app.community, viewer: app.accountId || null };
}
