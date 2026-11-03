// The features read (POST /league/features, redesign stage 71) for the league showing, shared by every screen that draws
// badges, streaks or awards (one request, the shared-read rules of sharedReads.js), and the celebration watcher.
//
// Celebrations come from the D-69 moments engine (moments/): every fresh features read reports the viewer's badges and
// awards, and the engine plays the new ones only where their card opens after the launch (never on page load), keeping
// the rest as NEW. Reduced motion stops the animation (base.css), never the words.
import { useEffect, useMemo } from 'react';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { featuresModel, featureMoments } from './model.js';
import { streakMoments } from './streakMoment.js';

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
  const moments = useMoments();
  // D-69: every fresh features read reports the viewer's badges and awards; the engine plays the new ones only where
  // their card opens after the launch, and keeps the rest as NEW. The Pick streak's small moment rides in the same report
  // (one report per source). `celebrate: false` reports nothing.
  // Each league's read is its own source: the first read of a league on this device seeds it silently.
  useEffect(() => {
    if (!read.data || !viewer || !celebrate || !moments) return;
    moments.report([...featureMoments(read.data, viewer), ...streakMoments(read.data, viewer)], { source: `features:${leagueId ?? 'community'}` });
  }, [read.data, viewer, celebrate, moments?.report, leagueId]);
  // 404: M-25 is not on the server yet (or this gtl-api has no route): the features are simply not shown.
  const off = read.error?.status === 404;
  return { ...read, model, off, leagueId };
}
