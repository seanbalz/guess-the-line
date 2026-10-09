// The CSS custom properties written to :root for a resolved theme ('dark' or 'light').
// Pure so Node tests can check every token the stylesheets reference is defined;
// Theme.jsx passes the imported design/tokens.json.
export function themeVariables(tokens, resolved) {
  const variables = {};
  for (const [key, value] of Object.entries({ ...tokens.colors, ...tokens.themes[resolved] })) variables[`--${key}`] = value;
  // Fonts: --font-body, --font-display, --font-mono. Several stylesheets use var(--font-mono) without a fallback.
  for (const [key, value] of Object.entries(tokens.fonts)) variables[`--font-${key}`] = value;
  variables['--touch-target'] = tokens.touchTargetMin;
  return variables;
}
