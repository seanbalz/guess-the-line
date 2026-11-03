// D-69 Your score motion (web/src/next/play/yourScore.css): the number line, the total's meter and the row bars reveal
// by a transform only, on a layer opened after the launch, and never under reduced motion. Source-level check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('motion: the number line, meters and bars grow by transform only, on a layer opened after the launch, and never under reduced motion', () => {
  const css = fs.readFileSync(new URL('../web/src/next/play/yourScore.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'the growth sits in one no-preference block');
  assert.ok(!css.replace(block[0], '').includes('animation'), 'nothing animates outside it');
  const rules = block[1].split('}').filter(rule => rule.includes('animation'));
  assert.ok(rules.length >= 1);
  for (const rule of rules) assert.match(rule, /\.gx-nest-card\[data-enter="in"\]/, 'only a layer that entered (never a page load: Nest sets data-enter after the first navigation)');
  assert.match(css, /@keyframes gx-ys-grow \{ from \{ transform: scaleX\(0\); \} to \{ transform: none; \} \}/);
});
