import React from 'react';
import './brand.css';

// Balanced Yardline G, selected October 29, 2026. Equal outer corner cuts and mirrored yard lines.
// Transparent, theme-colored; geometry stays aligned with the new app FieldMark.
export function YardlineMark({ className = '', decorative = true, ...props }) {
  return <svg viewBox="0 8 64 48" className={`gtl-yardline-mark ${className}`.trim()} aria-hidden={decorative ? 'true' : undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'Guess The Line'} {...props}>
    <path d="M16 8H48L56 16V20H22L20 22V42L22 44H42L44 42V40H32V28H56V48L48 56H16L8 48V16Z" fill="currentColor" />
    <path d="M0 24h6M0 40h6M58 24h6M58 40h6" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>;
}

export default function Brand({ compact = false, className = '', ...props }) {
  return <div className={`gtl-brand${compact ? ' gtl-brand-compact' : ''}${className ? ` ${className}` : ''}`} {...props}>
    <span className="gtl-field-icon"><YardlineMark decorative={false}/></span>
  </div>;
}
