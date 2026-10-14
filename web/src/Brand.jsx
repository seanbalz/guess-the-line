import React from 'react';
import './brand.css';

// Yardline G, primary logo option 01 selected in the identity review.
// Keep these paths identical to the original BrandLab concept. The viewBox is the G's own bounds, so the G fills its
// box; D-44 draws it alone in the theme green on a transparent background (brand.css), with no tile.
export function YardlineMark({ className = '', decorative = true, ...props }) {
  return <svg viewBox="22 20 81 53" className={`gtl-yardline-mark ${className}`.trim()} aria-hidden={decorative ? 'true' : undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'Guess The Line'} {...props}>
    <path d="M86 20H54L32 40v33h54V46H60v12h13v3H46V46l16-14h24z" fill="currentColor" />
    <path d="M22 35h13M22 55h13M90 35h13M90 55h13" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>;
}

export default function Brand({ compact = false, className = '', ...props }) {
  return <div className={`gtl-brand${compact ? ' gtl-brand-compact' : ''}${className ? ` ${className}` : ''}`} {...props}>
    <span className="gtl-field-icon"><YardlineMark decorative={false}/></span>
  </div>;
}
