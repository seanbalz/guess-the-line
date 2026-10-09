import React, { useState } from 'react';
import './teamIdentity.css';
import { approvedTeamLogos as approvedLogos } from './teamLogoRegistry.js';

// The registry contains reviewed, local transparent team marks.
// Its file-specific source records live in docs/TEAM_LOGO_SOURCES.md.

const sizes = { small: 24, medium: 32, large: 48 };
const aliases = { JAC: 'JAX', LA: 'LAR', WSH: 'WAS' };

function IdentityMark({ code, name, size, asset, decorative }) {
  const [failed, setFailed] = useState(false);
  const hasLogo = Boolean(asset && !failed);
  return <span
    className={`team-identity ${hasLogo ? 'team-identity--logo' : 'team-identity--fallback'}`}
    style={{ '--team-identity-size': `${size}px` }}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : name}
    aria-hidden={decorative || undefined}
    data-logo-status={hasLogo ? 'approved' : 'fallback'}
  >
    {hasLogo ? <img src={asset.src} width={size} height={size} alt="" decoding="async" draggable="false" onError={() => setFailed(true)}/> : <span aria-hidden="true">{code}</span>}
  </span>;
}

/** Compact team identity, ready for a reviewed set of transparent team logos. */
export function TeamIdentity({ code, name, size = 'medium', decorative = false }) {
  const label = typeof code === 'string' && /^[a-z]{2,4}$/i.test(code.trim()) ? code.trim().toUpperCase() : '—';
  const canonical = aliases[label] || label;
  const dimension = sizes[size] || (typeof size === 'number' && Number.isFinite(size) ? Math.min(64, Math.max(24, size)) : sizes.medium);
  const candidate = approvedLogos[canonical];
  const asset = candidate?.rightsStatus === 'approved' && candidate?.transparent === true && candidate?.rightsReference && /^\/team-logos\/[a-z0-9-]+\.(svg|png|webp)$/.test(candidate.src) ? candidate : null;
  const accessibleName = typeof name === 'string' && name.trim() ? name.trim() : label === '—' ? 'Team unavailable' : label;
  return <IdentityMark key={`${canonical}:${asset?.src || 'fallback'}`} code={label} name={accessibleName} size={dimension} asset={asset} decorative={decorative}/>;
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
