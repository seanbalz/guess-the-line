// The OFL webfonts (Inter, Barlow Condensed, IBM Plex Mono) load from Google Fonts with
// font-display: swap (design handoff Stage 1, Sean's decision of October 12, 2026).
// Cloud-browser fixtures fail every non-Supabase request as unexpected; they abort these two
// origins quietly instead, so the suites stay offline and render with the system fallbacks.
export const WEBFONT_ORIGINS = Object.freeze(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
export const isWebfont = url => WEBFONT_ORIGINS.includes(new URL(url).origin);
