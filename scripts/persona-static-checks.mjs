#!/usr/bin/env node
// Static accessibility checks that need no browser: WCAG contrast of every token pair the
// stylesheets actually combine, interactive selectors whose declared size is under 44px,
// and which stylesheets carry a prefers-reduced-motion fallback.
// Writes .local/personas/static.json and prints a summary. Exit code 0 always: the persona
// report is the consumer, not CI.
import fs from 'node:fs';
import path from 'node:path';

const tokens = JSON.parse(fs.readFileSync('design/tokens.json', 'utf8'));
const cssDir = 'web/src';
const files = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).map(file => path.join(cssDir, file));
const css = Object.fromEntries(files.map(file => [file, fs.readFileSync(file, 'utf8')]));

// --- Contrast -------------------------------------------------------------------------
const hex = value => { const v = value.replace('#', ''); const n = parseInt(v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themes = {
  dark: { ...tokens.colors, primaryForeground: tokens.themes.dark.primaryForeground },
  light: { ...tokens.colors, ...tokens.themes.light },
};
// Pairs the stylesheets combine: foreground token on background token, with the rule that uses them.
const used = new Map();
const backgrounds = ['canvas', 'surface', 'card', 'primary'];
for (const [file, text] of Object.entries(css)) {
  for (const rule of text.split('}')) {
    const [selector, body = ''] = rule.split('{');
    const fg = [...body.matchAll(/(?:^|;)\s*color:\s*var\(--([a-zA-Z]+)/g)].map(m => m[1]);
    const bg = [...body.matchAll(/background(?:-color)?:\s*var\(--([a-zA-Z]+)\)/g)].map(m => m[1]);
    for (const f of fg) for (const b of bg.length ? bg : ['surface', 'canvas']) {
      if (!backgrounds.includes(b) && !themes.dark[b]) continue;
      const key = `${f} on ${b}`;
      if (!used.has(key)) used.set(key, { fg: f, bg: b, where: [] });
      if (used.get(key).where.length < 3) used.get(key).where.push(`${path.basename(file)} ${selector.trim().slice(0, 60)}`);
    }
  }
}
// Brand pairs that always apply, even when a rule inherits the color.
for (const f of ['text', 'muted', 'cyan', 'win', 'loss', 'pending', 'tie', 'primaryForeground']) for (const b of ['canvas', 'surface', 'card']) { const key = `${f} on ${b}`; if (!used.has(key)) used.set(key, { fg: f, bg: b, where: ['inherited body/panel color'] }); }
used.set('primaryText on primary', { fg: 'primaryText', bg: 'primary', where: ['.primary buttons, chips.selected, skip link'] });
const contrast = [];
for (const { fg, bg, where } of used.values()) for (const [theme, palette] of Object.entries(themes)) {
  const f = palette[fg], b = palette[bg];
  if (!f || !b) continue;
  const r = ratio(f, b);
  contrast.push({ theme, pair: `${fg} on ${bg}`, fg: f, bg: b, ratio: Math.round(r * 100) / 100, aaNormal: r >= 4.5, aaLarge: r >= 3, where });
}
contrast.sort((a, b) => a.ratio - b.ratio);

// --- Tap targets (declared sizes) ----------------------------------------------------------
const small = [];
for (const [file, text] of Object.entries(css)) {
  if (!['chipPicker.css', 'community.css', 'styles.css'].includes(path.basename(file))) continue;
  for (const rule of text.split('}')) {
    const [selector, body = ''] = rule.split('{');
    if (!/button|\.chip|input|select|a\b|\.text-button|\.icon-button|summary/.test(selector)) continue;
    for (const m of body.matchAll(/(?:^|;)\s*(min-height|height|min-width|width):\s*(\d+)px/g)) {
      if (Number(m[2]) < 44) small.push({ file: path.basename(file), selector: selector.trim().slice(0, 80), property: m[1], value: Number(m[2]) });
    }
  }
}
// Font sizes declared on interactive selectors below the brand's 16px mobile minimum.
const smallType = [];
for (const [file, text] of Object.entries(css)) for (const rule of text.split('}')) {
  const [selector, body = ''] = rule.split('{');
  if (!/button|\.chip|\.text-button|\.secondary|\.primary|\.badge|\.eyebrow|th\b/.test(selector)) continue;
  for (const m of body.matchAll(/font-size:\s*(\d+)px/g)) if (Number(m[1]) < 12) smallType.push({ file: path.basename(file), selector: selector.trim().slice(0, 80), fontSize: Number(m[1]) });
}

// --- Reduced motion coverage --------------------------------------------------------------
const motion = Object.entries(css).map(([file, text]) => ({
  file: path.basename(file),
  animatedRules: (text.match(/(?:transition|animation)\s*:/g) || []).length,
  reducedMotionBlock: /prefers-reduced-motion/.test(text),
}));
const globalFallback = /prefers-reduced-motion:\s*reduce\)\{\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(css['web/src/styles.css']);
const forcedColors = Object.entries(css).filter(([, text]) => /forced-colors/.test(text)).map(([file]) => path.basename(file));

const report = { generatedAt: new Date().toISOString(), contrast, smallTargets: small, smallType, motion, globalReducedMotionFallback: globalFallback, forcedColorsRules: forcedColors };
fs.mkdirSync('.local/personas', { recursive: true });
fs.writeFileSync('.local/personas/static.json', JSON.stringify(report, null, 2));

const failing = contrast.filter(c => !c.aaNormal);
console.log(`Contrast: ${contrast.length} theme/pair checks, ${failing.length} below 4.5:1 (AA normal text)`);
for (const c of failing) console.log(`  ${c.theme.padEnd(5)} ${c.pair.padEnd(32)} ${String(c.ratio).padEnd(5)} ${c.aaLarge ? 'AA large only' : 'FAILS AA'}  ${c.where[0]}`);
console.log(`Declared sizes under 44px on interactive selectors (chipPicker, community, styles): ${small.length}`);
for (const s of small.slice(0, 12)) console.log(`  ${s.file} ${s.selector} ${s.property}:${s.value}px`);
console.log(`Interactive/label text declared under 12px: ${smallType.length}`);
console.log(`Reduced motion: global fallback in styles.css = ${globalFallback}; files with transitions/animations: ${motion.filter(m => m.animatedRules).map(m => `${m.file}(${m.animatedRules}${m.reducedMotionBlock ? ', own fallback' : ''})`).join(', ')}`);
const noForced = ['chipPicker.css', 'community.css', 'styles.css'].filter(file => !forcedColors.includes(file));
console.log(`Files with forced-colors rules: ${forcedColors.join(', ') || 'none'}${noForced.length ? ` (${noForced.join(', ')} ${noForced.length === 1 ? 'has' : 'have'} none)` : ''}`);
console.log('Written .local/personas/static.json');
