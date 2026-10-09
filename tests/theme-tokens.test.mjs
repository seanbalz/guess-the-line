import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { themeVariables } from '../web/src/themeTokens.js';

const root = path.resolve(import.meta.dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const cssDir = path.join(root, 'web/src');
const stylesheets = fs.readdirSync(cssDir).filter(file => file.endsWith('.css'));

test('every font and color token the stylesheets reference is written to :root in both themes', () => {
  const referenced = new Set();
  for (const file of stylesheets) for (const match of fs.readFileSync(path.join(cssDir, file), 'utf8').matchAll(/var\(--([a-zA-Z][\w-]*)/g)) referenced.add(match[1]);
  // Variables the stylesheets own themselves (defined in CSS or scoped to a component) are not theme tokens.
  const cssOwned = new Set(['line', 'subtle', 'insights-color', 'team-identity-size', 'radius-card', 'control-radius', 'touch-target-min']);
  for (const resolved of ['dark', 'light']) {
    const variables = themeVariables(tokens, resolved);
    for (const name of referenced) {
      if (cssOwned.has(name)) continue;
      if (name.startsWith('font-') || name in tokens.colors || name in tokens.themes.light || name === 'touch-target') {
        assert.ok(`--${name}` in variables, `--${name} is used by a stylesheet but not written for the ${resolved} theme`);
      }
    }
    assert.equal(variables['--font-mono'], tokens.fonts.mono);
    assert.equal(variables['--font-body'], tokens.fonts.body);
    assert.equal(variables['--font-display'], tokens.fonts.display);
    assert.equal(variables['--touch-target'], tokens.touchTargetMin);
  }
  assert.equal(themeVariables(tokens, 'dark')['--canvas'], tokens.colors.canvas);
  assert.equal(themeVariables(tokens, 'light')['--canvas'], tokens.themes.light.canvas);
  assert.equal(themeVariables(tokens, 'dark')['--primaryForeground'], tokens.themes.dark.primaryForeground);
});

test('the score numerals that use var(--font-mono) without a fallback now resolve to the mono token', () => {
  const styles = fs.readFileSync(path.join(cssDir, 'styles.css'), 'utf8') + fs.readFileSync(path.join(cssDir, 'visualLayouts.css'), 'utf8');
  const bare = styles.match(/var\(--font-mono\)/g) || [];
  assert.ok(bare.length >= 1, 'the bare references this test guards still exist; delete this test if they are all given fallbacks');
  assert.match(themeVariables(tokens, 'dark')['--font-mono'], /Plex Mono|monospace/);
});
