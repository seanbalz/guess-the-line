// The features read (POST /league/features, redesign stage 71) for the league showing, shared by every screen that draws
// badges, streaks or awards (one request, the shared-read rules of sharedReads.js), and the celebration watcher.
//
// Celebrations follow the brand's Motion rules: one big moment at a time and never on page load. The first answer this
// session only sets what the member has already seen; a later answer (a refresh, the 5-minute timer, focus) that brings
// a new badge or award of the viewer's own queues one overlay (`ov.flash`), however many arrived. Reduced motion stops
// its animation (base.css), never the words.
import { useEffect, useMemo } from 'react';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { featuresModel, newCelebrations } from './model.js';

const baselines = new Map();
/** For tests and account changes: forget what this session has seen. */
export const forgetFeatureBaselines = () => baselines.clear();

export function useFeatures(app, shell, { celebrate = true } = {}) {
  const leagueId = app?.league && app.league.community !== true && typeof app.league.id === 'string' ? app.league.id : null;
  const key = `${app?.accountId ?? ''}:features:${leagueId ?? 'community'}`;
  const read = useLeagueRead(key, signal => cloudApi('league/features', leagueId ? { leagueId } : {}, { signal }), () => {}, { shared: true });
  const viewer = app?.accountId ?? '';
  const members = app?.community?.data?.members;
  const model = useMemo(() => {
    const names = new Map((Array.isArray(members) ? members : []).map(m => [m.id, m.displayName]));
    return read.data ? featuresModel(read.data, { viewer, nameOf: id => names.get(id) ?? 'Former member' }) : null;
  }, [read.data, viewer, members]);
  useEffect(() => {
    if (!read.data || !viewer) return;
    const before = baselines.get(key);
    baselines.set(key, read.data);
    if (!before || !celebrate || !shell?.showOverlay) return;
    const items = newCelebrations(before, read.data, viewer);
    if (items.length) shell.showOverlay('ov.flash', { items });
  }, [read.data, key, viewer, celebrate, shell]);
  // 404: M-25 is not on the server yet (or this gtl-api has no route): the features are simply not shown.
  const off = read.error?.status === 404;
  return { ...read, model, off, leagueId };
}
