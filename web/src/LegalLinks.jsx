import React from 'react';

// Static pages in web/public (privacy.html, terms.html); Cloudflare Pages serves them at /privacy and /terms.
// Plain links so they open the standalone pages, not an in-app screen.
export default function LegalLinks({ className = '' }) {
  return <nav className={`legal-links ${className}`.trim()} aria-label="Legal">
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </nav>;
}
