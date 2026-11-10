// The Fantasy profile opened from a Points slot (Board i63), loaded on the "Open profile" tap so the Fantasy tools'
// code and stylesheet stay out of the app's first load. It reuses the existing profile body (FantasyTools.jsx) with the
// slot's own scoring. GTL's weekly estimate is that slot's House (D-56): until the read carries the House for this viewer
// (he locked in the slot, or it kicked off), the estimate card is a lock line.
import { playerProfile } from '../../../../../shared/fantasy-tools.mjs';
import { PlayerProfileBody } from '../../fantasy/FantasyTools.jsx';
import { TeamMark } from '../../ui/index.js';
import { SLOT_NAMES } from './pointsModel.js';
import { CONTEXT_COPY, estimateOpen } from './pointsContext.js';
import { useFramePresentation } from '../../shell/useFramePresentation.js';

export default function PointsProfile({ snapshot, slot, settings }) {
  const profile = playerProfile(snapshot, slot.playerId, settings);
  useFramePresentation('play-points', Boolean(profile));
  if (!profile) return <p className="gx-t-body">{CONTEXT_COPY.notInSnapshot}.</p>;
  return <div className="gx-pt-profile gx-vstack gx-gap-16">
    <div className="gx-pt-profile-identity"><TeamMark code={profile.player.team} size={48} decorative/><span className="gx-t-meta gx-c-2">{SLOT_NAMES[slot.slot] ?? profile.player.position}</span></div>
    <PlayerProfileBody pointsPresentation profile={profile} snapshot={snapshot} settings={settings} estimateLocked={estimateOpen(slot) ? null : CONTEXT_COPY.estimateLocked}/>
  </div>;
}
