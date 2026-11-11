// A team mark (D-46; design system 7.5): the team's official logo from the team-mark registry, in a 24, 32 or 48px
// circular glass background. If the logo fails to load, the team's original Guess The Line badge (D-22) replaces it
// where one exists; otherwise, or if that fails too, the letters stay inside the same individual glass circle.
//
// DP-27: the tile is sized before anything loads (its CSS box plus width and height on the image, so nothing moves)
// and shows the team's abbreviation until the image has loaded and decoded off the main thread (decoding="async",
// then decode()). Only then does the mark replace the letters, so a row is never blank and never jumps. A bounded
// SVG text run fits fallback letters horizontally inside every circle, independent of the installed font's width.
// Since D-46 the files are 128px downscaled copies recorded in docs/TEAM_LOGO_SOURCES.md.
import { useState } from 'react';
import { resolveTeamBadge, resolveTeamMark, teamAliases } from '../../teamLogoRegistry.js';
import { cx, oneOf } from './cx.js';

export const TEAM_MARK_SIZES = Object.freeze([24, 32, 48]);

/** The code a mark shows ("JAX" for "jac"), or "—" for anything that is not a team code. */
export function teamCode(code) {
  const label = typeof code === 'string' && /^[a-z]{2,4}$/i.test(code.trim()) ? code.trim().toUpperCase() : '—';
  return label === '—' ? label : teamAliases[label] || label;
}

function MarkImage({ src, size, onReady, onFail }) {
  return (
    <img
      className="gx-team-img"
      src={src}
      width={size}
      height={size}
      alt=""
      decoding="async"
      loading="lazy"
      draggable="false"
      onLoad={event => {
        const img = event.currentTarget;
        // Show the mark only once it can paint: decode() resolves after the bitmap is ready (or at once where unsupported).
        Promise.resolve(typeof img.decode === 'function' ? img.decode() : undefined).then(onReady, onReady);
      }}
      onError={onFail}
    />
  );
}

function Mark({ code, name, size, primary, badge, decorative, className, rest }) {
  // The official logo, then (if it fails to load) the team's original badge where one exists, then the letters.
  const chain = [primary, badge].filter((item, index, list) => item && list.findIndex(other => other?.src === item.src) === index);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const asset = chain[step] || null;
  const fallbackFont = size === 24 ? 12 : size === 48 ? 16 : 13;
  const fallbackWidth = Math.min(size - 8, fallbackFont * code.length * 0.75);
  const a11y = decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name };
  return (
    <span
      className={cx('gx-team', `gx-team--${size}`, asset && loaded && 'gx-team--loaded', className)}
      data-mark={asset ? asset.rightsStatus : 'letters'}
      {...a11y}
      {...rest}
    >
      <svg className="gx-team-code" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" textLength={fallbackWidth} lengthAdjust="spacingAndGlyphs">{code}</text>
      </svg>
      {asset ? <MarkImage key={asset.src} src={asset.src} size={size} onReady={() => setLoaded(true)} onFail={() => { setLoaded(false); setStep(current => current + 1); }}/> : null}
    </span>
  );
}

/**
 * `<TeamMark code="SEA" name="Seattle Seahawks" size={32}/>`. Beside a visible team name, pass `decorative` so the
 * name is not read twice; otherwise the mark is an image named `name` (or the code).
 */
export function TeamMark({ code, name, size = 32, decorative = false, className, ...rest }) {
  const label = teamCode(code);
  const asset = label === '—' ? null : resolveTeamMark(label);
  const badge = label === '—' ? null : resolveTeamBadge(label);
  const px = oneOf(size, TEAM_MARK_SIZES, 32);
  const accessibleName = typeof name === 'string' && name.trim() ? name.trim() : label === '—' ? 'Team unavailable' : label;
  // A new team (or a new file) starts over in the loading state.
  return <Mark key={`${label}:${asset?.src ?? 'letters'}`} code={label} name={accessibleName} size={px} primary={asset} badge={badge} decorative={decorative} className={className} rest={rest}/>;
}
