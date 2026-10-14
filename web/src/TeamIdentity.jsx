import React, { useState } from 'react';
import './teamIdentity.css';
import { resolveTeamBadge, resolveTeamMark, teamAliases as aliases } from './teamLogoRegistry.js';

// Official team logos (D-46) for all 32 teams. If a logo fails to load, the team's
// original Guess The Line badge replaces it where one exists, then the abbreviation.
// Records live in docs/TEAM_LOGO_SOURCES.md.

const sizes = { small: 24, medium: 32, large: 48 };

function IdentityMark({ code, name, size, primary, badge, decorative }) {
  const chain = [primary, badge].filter((item, index, list) => item && list.findIndex(other => other?.src === item.src) === index);
  const [step, setStep] = useState(0);
  const asset = chain[step] || null;
  const hasLogo = Boolean(asset);
  return <span
    className={`team-identity ${hasLogo ? 'team-identity--logo' : 'team-identity--fallback'}`}
    style={{ '--team-identity-size': `${size}px` }}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : name}
    aria-hidden={decorative || undefined}
    data-logo-status={hasLogo ? asset.rightsStatus : 'fallback'}
  >
    {hasLogo ? <img key={asset.src} src={asset.src} width={size} height={size} alt="" decoding="async" draggable="false" onError={() => setStep(current => current + 1)}/> : <span aria-hidden="true">{code}</span>}
  </span>;
}

/** Compact team identity: official logo, else (or if it fails to load) original GTL badge, else abbreviation. */
export function TeamIdentity({ code, name, size = 'medium', decorative = false }) {
  const label = typeof code === 'string' && /^[a-z]{2,4}$/i.test(code.trim()) ? code.trim().toUpperCase() : '—';
  const canonical = aliases[label] || label;
  const dimension = sizes[size] || (typeof size === 'number' && Number.isFinite(size) ? Math.min(64, Math.max(24, size)) : sizes.medium);
  const asset = label === '—' ? null : resolveTeamMark(canonical);
  const badge = label === '—' ? null : resolveTeamBadge(canonical);
  const accessibleName = typeof name === 'string' && name.trim() ? name.trim() : label === '—' ? 'Team unavailable' : label;
  return <IdentityMark key={`${canonical}:${asset?.src || 'fallback'}`} code={label} name={accessibleName} size={dimension} primary={asset} badge={badge} decorative={decorative}/>;
}

/** Shared home/away presentation for ballot rows, detail cards and gap bars. */
export function TeamMatchup({ game, compact = false }) {
  return <span className={`team-matchup${compact ? ' team-matchup--compact' : ''}`}>
    <span className="team-matchup__side">
      <TeamIdentity code={game.awayCode} name={game.away} size={compact ? 'small' : 'medium'} decorative/>
      <span className="team-matchup__name"><small>Away</small><strong>{compact ? game.awayCode : game.away}</strong>{compact && <span className="team-matchup__accessible-name">{game.away}</span>}</span>
    </span>
    <span className="team-matchup__at" aria-hidden="true">at</span>
    <span className="team-matchup__side">
      <TeamIdentity code={game.homeCode} name={game.home} size={compact ? 'small' : 'medium'} decorative/>
      <span className="team-matchup__name"><small>Home</small><strong>{compact ? game.homeCode : game.home}</strong>{compact && <span className="team-matchup__accessible-name">{game.home}</span>}</span>
    </span>
  </span>;
}

export default TeamIdentity;
