// The CSS custom properties written to :root for a resolved theme ('dark' or 'light').
// Pure so Node tests can check every token the stylesheets reference is defined;
// Theme.jsx passes the imported design/tokens.json.
export function themeVariables(tokens, resolved) {
  const variables = {};
  for (const [key, value] of Object.entries({ ...tokens.colors, ...tokens.themes[resolved] })) variables[`--${key}`] = value;
  // Fonts: --font-body, --font-display, --font-mono. Several stylesheets use var(--font-mono) without a fallback.
  for (const [key, value] of Object.entries(tokens.fonts)) variables[`--font-${key}`] = value;
  // Type scale: --text-<step> and --leading-<step> (hero, title, section, body, meta, stat, label).
  for (const [key, { size, lineHeight }] of Object.entries(tokens.typeScale || {})) { variables[`--text-${key}`] = size; variables[`--leading-${key}`] = lineHeight; }
  // Radius: --radius-card, --radius-control.
  for (const [key, value] of Object.entries(tokens.radius)) variables[`--radius-${key}`] = value;
  // Spacing: --space-1 … --space-7 for the 4, 8, 12, 16, 24, 32, 48 scale.
  tokens.spacing.forEach((value, index) => { variables[`--space-${index + 1}`] = `${value}px`; });
  // Motion: --motion-quick, --motion-standard (milliseconds).
  for (const [key, value] of Object.entries(tokens.motionMs)) variables[`--motion-${key}`] = `${value}ms`;
  variables['--touch-target'] = tokens.touchTargetMin;
  return variables;
}
