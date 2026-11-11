// An NBA team badge (milestone N1; D-85): the team's official logo in its own 24, 32 or 48px glass circle, the same
// circle as the NFL TeamMark (".gx-team"). It takes NBA codes only and looks them up with resolveNbaTeamLogo, never
// resolveTeamMark or resolveTeamBadge: thirteen NBA codes are also NFL codes and would otherwise draw an NFL logo.
// Like TeamMark (DP-27), the letters hold the circle until the logo has decoded; if the logo fails to load, the letters
// stay as the fallback. The accessible name is the team's full name.
import { useState } from 'react';
import { resolveNbaTeamLogo } from '../../teamLogoRegistry.js';
import { cx, oneOf } from '../ui/cx.js';

export const NBA_BADGE_SIZES = Object.freeze([24, 32, 48]);

export function NbaTeamBadge({ code, size = 32, decorative = false, className, ...rest }) {
  const logo = resolveNbaTeamLogo(code);
  const label = logo?.code ?? (typeof code === 'string' && /^[a-z]{2,4}$/i.test(code.trim()) ? code.trim().toUpperCase() : '—');
  const px = oneOf(size, NBA_BADGE_SIZES, 32);
  // A new team starts over in the loading state.
  return <Badge key={label} label={label} logo={logo} size={px} decorative={decorative} className={className} rest={rest}/>;
}

function Badge({ label, logo, size, decorative, className, rest }) {
  const [state, setState] = useState(logo ? 'loading' : 'failed');
  const fallbackFont = size === 24 ? 12 : size === 48 ? 16 : 13;
  const fallbackWidth = Math.min(size - 8, fallbackFont * label.length * 0.75);
  const name = logo?.name ?? (label === '—' ? 'Team unavailable' : label);
  const a11y = decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name };
  return (
    <span className={cx('gx-team', `gx-team--${size}`, 'gx-nba-badge', state === 'loaded' && 'gx-team--loaded', className)}
      data-mark={logo && state !== 'failed' ? 'nba-logo' : 'letters'} data-nba-team={label} {...a11y} {...rest}>
      <svg className="gx-team-code" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" textLength={fallbackWidth} lengthAdjust="spacingAndGlyphs">{label}</text>
      </svg>
      {logo && state !== 'failed' ? (
        <img className="gx-team-img" src={logo.src} width={size} height={size} alt="" decoding="async" loading="lazy" draggable="false"
          onLoad={event => {
            const img = event.currentTarget;
            Promise.resolve(typeof img.decode === 'function' ? img.decode() : undefined).then(() => setState('loaded'), () => setState('loaded'));
          }}
          onError={() => setState('failed')}/>
      ) : null}
    </span>
  );
}
