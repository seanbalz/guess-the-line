// A team mark (D-22; design system 7.5): the reviewed official mark or the original Guess The Line badge from the
// team-mark registry, in a 24, 32 or 48px square tile with a 1px ring (so full-color marks and flat badges sit at the
// same weight).
//
// DP-27 (the 3840 x 2564 Bills and 1920 x 1379 Rams PNGs decode late, so rows showed no mark for up to 2.5 s): the tile
// is sized before anything loads (its CSS box plus width and height on the image, so nothing moves) and shows the
// team's abbreviation until the image has loaded and decoded off the main thread (decoding="async", then decode()).
// Only then does the mark replace the letters, so a row is never blank and never jumps. An image that fails keeps the
// letters. With a wider fallback font the tile widens around the letters rather than clipping them, the same before
// and after the mark loads. The files themselves stay byte-identical to their recorded sources
// (docs/TEAM_LOGO_SOURCES.md); a downscaled copy of the two PNGs would be an altered file and needs its own rights
// record first.
import { useState } from 'react';
import { resolveTeamMark, teamAliases } from '../../teamLogoRegistry.js';
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

function Mark({ code, name, size, asset, decorative, className, rest }) {
  const [state, setState] = useState('loading');
  const showImage = asset && state !== 'failed';
  const a11y = decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name };
  return (
    <span
      className={cx('gx-team', `gx-team--${size}`, state === 'loaded' && 'gx-team--loaded', className)}
      data-mark={asset ? (state === 'failed' ? 'letters' : asset.rightsStatus) : 'letters'}
      {...a11y}
      {...rest}
    >
      <span className="gx-team-code" aria-hidden="true">{code}</span>
      {showImage ? <MarkImage src={asset.src} size={size} onReady={() => setState('loaded')} onFail={() => setState('failed')}/> : null}
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
  const px = oneOf(size, TEAM_MARK_SIZES, 32);
  const accessibleName = typeof name === 'string' && name.trim() ? name.trim() : label === '—' ? 'Team unavailable' : label;
  // A new team (or a new file) starts over in the loading state.
  return <Mark key={`${label}:${asset?.src ?? 'letters'}`} code={label} name={accessibleName} size={px} asset={asset} decorative={decorative} className={className} rest={rest}/>;
}
