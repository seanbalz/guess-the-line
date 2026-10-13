import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { themeVariables } from '../web/src/themeTokens.js';

const root = path.resolve(import.meta.dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const cssDir = path.join(root, 'web/src');
const stylesheets = fs.readdirSync(cssDir).filter(file => file.endsWith('.css'));

test('every font, color, radius, spacing, motion and type token the stylesheets reference is written to :root in both themes', () => {
  const referenced = new Set();
  for (const file of stylesheets) for (const match of fs.readFileSync(path.join(cssDir, file), 'utf8').matchAll(/var\(--([a-zA-Z][\w-]*)/g)) referenced.add(match[1]);
  // Variables the stylesheets own themselves (defined in CSS or scoped to a component) are not theme tokens.
  const cssOwned = new Set(['line', 'subtle', 'insights-color', 'team-identity-size']);
  for (const resolved of ['dark', 'light']) {
    const variables = themeVariables(tokens, resolved);
    for (const name of referenced) {
      if (cssOwned.has(name)) continue;
      if (/^(font|radius|space|motion|text|leading)-/.test(name) || name in tokens.colors || name in tokens.themes.light || name === 'touch-target') {
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

test('radius, spacing, motion and type-scale tokens are exported as CSS variables (Stage 1)', () => {
  for (const resolved of ['dark', 'light']) {
    const variables = themeVariables(tokens, resolved);
    assert.equal(variables['--radius-card'], tokens.radius.card);
    assert.equal(variables['--radius-control'], tokens.radius.control);
    tokens.spacing.forEach((value, index) => assert.equal(variables[`--space-${index + 1}`], `${value}px`));
    assert.equal(variables['--space-7'], '48px');
    assert.equal(variables['--motion-quick'], `${tokens.motionMs.quick}ms`);
    assert.equal(variables['--motion-standard'], `${tokens.motionMs.standard}ms`);
    // Brand guide scale: hero 40/44, title 28/34, section 20/28, body 16/24, metadata 13/18, stat numeral 36/40.
    // Sean, October 12: tracked uppercase labels use the 13px metadata size too; no step sits below it.
    assert.deepEqual(Object.keys(tokens.typeScale).sort(), ['body', 'hero', 'meta', 'section', 'stat', 'title']);
    assert.equal(variables['--text-label'], undefined);
    for (const [step, size, leading] of [['hero', 40, 44], ['title', 28, 34], ['section', 20, 28], ['body', 16, 24], ['meta', 13, 18], ['stat', 36, 40]]) {
      assert.equal(variables[`--text-${step}`], `${size}px`, step);
      assert.equal(variables[`--leading-${step}`], `${leading}px`, step);
    }
  }
});

test('root type is 16px and no non-decorative rule declares text under 12px', () => {
  const styles = fs.readFileSync(path.join(cssDir, 'styles.css'), 'utf8');
  assert.match(styles, /:root\{[^}]*font-size:16px;line-height:1\.5\}/);
  // Brand Lab study renders and the layout mini-previews are pictures of type, not text a player reads.
  const decorative = /logo-study|type-study|palette-study|palette-score|layout-study|\.mini-|motion-study/;
  const small = [];
  for (const file of stylesheets) {
    const text = fs.readFileSync(path.join(cssDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, size] of body.matchAll(/font-size:\s*(\d+)px/g)) if (Number(size) < 12 && !decorative.test(selector)) small.push(`${file} ${selector.trim()} ${size}px`);
    }
  }
  assert.deepEqual(small, []);
});
