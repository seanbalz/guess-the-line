// What Home reads (redesign build plan stage 12): the shared Community read (`/community/read`, through the data layer;
// the same call the old app's Community home makes) and the signed-in account. Home makes no read of its own, since
// the data layer already holds this one for every screen, and nothing here writes. A unit test stands this hook in
// for fixture replies (tests/next-home-ui.test.jsx), so the screen itself never touches the network.
import { useAppData } from '../data/AppData.jsx';

export function useHomeData() {
  const app = useAppData();
  return { app, community: app.community, viewer: app.accountId || null };
}
