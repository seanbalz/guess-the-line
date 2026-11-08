import { ArrowUpRight, ArrowRight, Ticket } from 'lucide-react';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useAssessments } from '../research/useAssessments.js';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Pill } from '../ui/Pill.jsx';
import { TeamMark } from '../ui/TeamMark.jsx';
import { teamName } from '../ui/Matchup.jsx';
import { trackedLeg } from '../../trackedBetTerms.js';

const status = { pending: 'Pending', win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' };
export function TicketPreviews({ read, onOpen }) {
  if (read.loading) return <p role="status" className="gx-t-body gx-c-2">Loading your tickets…</p>;
  if (read.error) return <div><p role="status" className="gx-t-body">Tickets unavailable.</p><Button variant="secondary" onClick={read.retry}>Retry tickets</Button></div>;
  const entries = read.model?.entries ?? [];
  // Keep the first open and settled ticket available, in the server's retained order.
  const open = entries.find(e => e.outcome === 'pending'), settled = entries.find(e => e.outcome !== 'pending');
  const previews = [open, settled].filter(Boolean);
  if (previews.length < 2) previews.push(...entries.filter(e => !previews.includes(e)).slice(0, 2 - previews.length));
  return previews.length ? <ul className="gx-ticket-previews" aria-label="Your tickets">{previews.map(entry => {
    const pending = entry.outcome === 'pending', first = entry.legs[0];
    const title = entry.kind === 'parlay' ? `${entry.legs.length}-selection ticket` : first?.locked ? 'Selection locked' : first?.selection || trackedLeg(first ?? {}).name || 'Tracked ticket';
    const source = typeof entry.source === 'string' ? entry.source : entry.source?.name;
    return <li key={entry.id}><span className="gx-ticket-preview-icon" aria-hidden="true"><Ticket size={23}/></span><div><strong>{title}</strong><Pill tone={pending ? 'pending' : entry.outcome === 'win' || entry.outcome === 'loss' ? entry.outcome : 'neutral'}>{status[entry.outcome] || 'Pending'}</Pill><span className="gx-t-meta gx-c-2">{entry.countsForRecord === false ? 'Excluded · ' : ''}{source || 'Book unknown'}{!Number.isFinite(entry.odds) ? ' · Odds unknown' : ''}</span></div><Button variant="ghost" aria-label={`${pending ? 'Open' : 'View'} ${title}`} onClick={() => onOpen(entry)}>{pending ? 'Open' : 'View'} <ArrowRight size={16} aria-hidden="true"/></Button></li>;
  })}</ul> : <p className="gx-t-body gx-c-2" role="status">Your tracked tickets will appear here.</p>;
}

/** Only an accessible, open game from the existing account-scoped research reply. */
export function teaserAssessment(data) {
  return data?.assessments?.find(a => {
    const g = data.coverage?.games?.find(g => g.id === a.gameId);
    return g && !g.closed && (a.selection?.market === 'spread' ? g.spreadAccessible : a.selection?.market === 'total' ? g.totalAccessible : g.spreadAccessible && g.totalAccessible) && /^[A-Z]{2,4}-[A-Z]{2,4}$/.test(a.gameId);
  }) ?? null;
}
export function RecommendationTeaser({ onOpen }) {
  const app = useAppData(), personal = useSharedRead('personal');
  // Published account week and server reveal gates match ResearchAssessments.
  // This endpoint reads retained research; it never collects sportsbook quotes.
  const read = useAssessments({ app, personal }), assessment = teaserAssessment(read.data);
  const codes = assessment?.gameId.split('-');
  const games = read.data?.coverage?.games ?? [];
  const locked = games.length > 0 && games.every(g => !g.spreadAccessible && !g.totalAccessible);
  return <Card as="section" className="gx-bets-landing-recommended" aria-labelledby="gx-recommended-heading">
    <h2 id="gx-recommended-heading">Recommended</h2>
    {read.status === 'loading' ? <p className="gx-t-body gx-c-2" role="status">Loading matchup research…</p> : read.status === 'error' ? <div><p className="gx-t-body" role="status">Matchup research is unavailable.</p><Button variant="secondary" onClick={read.reload}>Retry research</Button></div> : assessment ? <>
      <p className="gx-t-body gx-c-2">Matchup research · {assessment.label}</p>
      <div className="gx-bets-research-matchup" aria-label={`${teamName(codes[0])} at ${teamName(codes[1])}`}><span className="gx-bets-research-team"><TeamMark code={codes[0]} size={48} decorative/><strong>{teamName(codes[0])}</strong></span><span className="gx-t-meta gx-c-2">at</span><span className="gx-bets-research-team"><TeamMark code={codes[1]} size={48} decorative/><strong>{teamName(codes[1])}</strong></span></div>
    </> : <p className="gx-t-body gx-c-2" role="status">{locked ? 'Lock in a game’s guess to open its market research.' : games.length && games.every(g => g.closed) ? 'Pregame assessments are closed. Explore recorded game research.' : 'No assessed matchup is available yet.'}</p>}
    <Button variant="primary" block aria-label="Explore recommendations ↗" onClick={() => onOpen(assessment?.gameId, assessment?.routeId)}>Explore recommendations <ArrowUpRight size={18} aria-hidden="true"/></Button>
  </Card>;
}
