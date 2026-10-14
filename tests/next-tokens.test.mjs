// Redesign stage 6 (D-38): the new app's tokens, fonts and styles. This is the gate for every
// stylesheet under web/src/next (scripts/persona-static-checks.mjs reads only the old app's CSS),
// so later stages' screen CSS is checked here too: gx- prefix and .gx scope, every var() defined in
// both themes, no hard-coded colors, no font under 12px, tabular numbers, motion that reduced
// motion can stop. Contrast is checked on the token values: 4.5:1 for text, 3:1 for UI edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tokens = JSON.parse(read('design/tokens-next.json'));
const stylesDir = 'web/src/next/styles';
const tokensFile = `${stylesDir}/tokens.css`;

function cssFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...cssFilesUnder(rel));
    else if (entry.name.endsWith('.css')) out.push(rel);
  }
  return out.sort();
}
const files = cssFilesUnder('web/src/next');

// ---------- a small CSS reader: rules, @media blocks and @keyframes, with their context ----------
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0, quote = null, current = '';
  for (const char of text) {
    if (quote) { if (char === quote) quote = null; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === separator && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}
function parseDeclarations(body) {
  return splitTopLevel(body, ';').map(declaration => {
    const colon = declaration.indexOf(':');
    assert.ok(colon > 0, `not a declaration: ${declaration}`);
    const value = declaration.slice(colon + 1).trim();
    return { prop: declaration.slice(0, colon).trim(), value: value.replace(/\s*!important$/, ''), important: /!important$/.test(value) };
  });
}
function parseCss(text, file) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const rules = [], keyframes = new Map();
  function block(context) {
    while (i < src.length) {
      let prelude = '';
      while (i < src.length && src[i] !== '{' && src[i] !== '}') prelude += src[i++];
      if (i >= src.length) { assert.equal(prelude.trim(), '', `${file}: unclosed block`); return; }
      if (src[i] === '}') { i += 1; assert.equal(prelude.trim(), '', `${file}: stray text before }`); return; }
      i += 1;
      prelude = prelude.trim().replace(/\s+/g, ' ');
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) { block([...context, prelude]); continue; }
      if (prelude.startsWith('@keyframes')) {
        const name = prelude.split(' ')[1];
        const frames = [];
        while (true) {
          let selector = '';
          while (src[i] !== '{' && src[i] !== '}') selector += src[i++];
          if (src[i] === '}') { i += 1; break; }
          i += 1;
          let body = '';
          while (src[i] !== '}') body += src[i++];
          i += 1;
          frames.push({ selector: selector.trim(), decls: parseDeclarations(body) });
        }
        keyframes.set(name, { file, frames });
        continue;
      }
      assert.ok(!prelude.startsWith('@'), `${file}: unexpected at-rule ${prelude}`);
      let body = '';
      while (i < src.length && src[i] !== '}') body += src[i++];
      i += 1;
      rules.push({ file, context, selector: prelude, selectors: splitTopLevel(prelude, ','), decls: parseDeclarations(body) });
    }
  }
  block([]);
  return { rules, keyframes };
}
const parsed = files.map(file => parseCss(read(file), file));
const allRules = parsed.flatMap(sheet => sheet.rules);
const allKeyframes = new Map(parsed.flatMap(sheet => [...sheet.keyframes]));
const styleRules = allRules.filter(rule => rule.file !== tokensFile);
const normalize = value => String(value).replaceAll('\\"', '"').replace(/\s+/g, ' ').trim();

// ---------- the token model ----------
const SHARED_GROUPS = ['font', 'space', 'radius', 'dur', 'ease', 'z', 'size', 'av'];
const shared = Object.fromEntries(SHARED_GROUPS.flatMap(group => Object.entries(tokens[group]).map(([key, value]) => [`--gx-${group}-${key}`, String(value)])));
const themeVars = name => Object.fromEntries(Object.entries({ ...tokens.themes[name].color, ...tokens.themes[name].effect }).map(([key, value]) => [`--gx-${key}`, value]));
const dark = themeVars('dark'), light = themeVars('light');
const LIGHT_SELECTORS = [':root[data-theme="light"] .gx:not([data-theme="dark"])', '.gx[data-theme="light"]'];
const familyName = key => tokens.font[key].split(',')[0].replaceAll('"', '').trim();

test('tokens-next.json is complete: both themes define the same tokens, colors are hex and fonts are loaded', () => {
  assert.equal(tokens.name, 'Guess The Line');
  assert.deepEqual(Object.keys(tokens.themes).sort(), ['dark', 'light']);
  for (const group of ['color', 'effect']) assert.deepEqual(Object.keys(tokens.themes.light[group]), Object.keys(tokens.themes.dark[group]), `${group} keys match`);
  assert.equal(tokens.themes.dark.colorScheme, 'dark');
  assert.equal(tokens.themes.light.colorScheme, 'light');
  for (const name of ['dark', 'light']) for (const [key, value] of Object.entries(tokens.themes[name].color)) assert.match(value, /^#[0-9A-F]{6}([0-9A-F]{2})?$/, `${name} ${key}`);
  for (const [key, value] of Object.entries(tokens.av)) assert.match(value, /^#[0-9A-F]{6}$/, `avatar ${key}`);
  assert.equal(tokens.themeColor.dark, tokens.themes.dark.color.canvas);
  assert.equal(tokens.themeColor.light, tokens.themes.light.color.canvas);
  assert.equal(tokens.css.propertyPrefix, '--gx-');
  assert.equal(tokens.css.classPrefix, 'gx-');
  assert.deepEqual(tokens.css.files, [tokensFile, `${stylesDir}/base.css`, `${stylesDir}/components.css`]);
  for (const file of tokens.css.files) assert.ok(files.includes(file), `${file} exists`);
  // Each stack leads with a family the Google Fonts link loads, then system fallbacks.
  for (const key of Object.keys(tokens.font)) {
    assert.ok(familyName(key) in tokens.webfonts.weights, `${key} leads with a loaded family`);
    assert.match(tokens.font[key], /sans-serif$/, `${key} ends in a generic family`);
  }
  // Big Shoulders Display has no tabular figures: never for numbers.
  for (const [key, style] of Object.entries(tokens.type)) {
    assert.ok(tokens.webfonts.weights[familyName(style.family)].includes(style.weight), `type ${key}: weight ${style.weight} is loaded`);
    assert.ok(Number.parseFloat(style.size) >= 12, `type ${key} is at least 12px`);
    if (style.family === 'num') assert.equal(style.tabular, true, `type ${key} uses tabular figures`);
    if (key.startsWith('n-')) assert.equal(style.family, 'num', `numeral ${key} uses Barlow Condensed`);
  }
});

test('tokens.css equals tokens-next.json: shared and dark on .gx, light through data-theme', () => {
  const sheet = parsed[files.indexOf(tokensFile)];
  assert.equal(sheet.keyframes.size, 0);
  const declared = rules => {
    const out = {};
    for (const rule of rules) for (const { prop, value } of rule.decls) { assert.ok(!(prop in out), `${prop} declared twice`); out[prop] = normalize(value); }
    return out;
  };
  for (const rule of sheet.rules) assert.deepEqual(rule.context, [], 'no theme tokens inside @media (System is resolved to data-theme by Theme.jsx)');
  const rootRules = sheet.rules.filter(rule => rule.selector === '.gx');
  const lightRules = sheet.rules.filter(rule => rule.selectors.join('|') === LIGHT_SELECTORS.join('|'));
  assert.equal(rootRules.length + lightRules.length, sheet.rules.length, 'tokens.css holds only the .gx and light blocks');
  assert.equal(lightRules.length, 1);
  const expectedRoot = { ...Object.fromEntries(Object.entries({ ...shared, ...dark }).map(([key, value]) => [key, normalize(value)])), 'color-scheme': 'dark' };
  const expectedLight = { ...Object.fromEntries(Object.entries(light).map(([key, value]) => [key, normalize(value)])), 'color-scheme': 'light' };
  assert.deepEqual(declared(rootRules), expectedRoot);
  assert.deepEqual(declared(lightRules), expectedLight);
  for (const file of files) assert.doesNotMatch(read(file), /prefers-color-scheme/, `${file}: dark is the default; light comes only from data-theme`);
});

test('every var() in the new app\'s CSS is a --gx- token defined in both themes (or set locally by a component)', () => {
  const themed = new Set(Object.keys(dark));
  const tokenNames = new Set([...Object.keys(shared), ...themed]);
  const local = new Set();
  for (const rule of styleRules) for (const { prop } of rule.decls) if (prop.startsWith('--')) {
    assert.match(prop, /^--gx-/, `${rule.file}: ${rule.selector} defines ${prop}`);
    assert.ok(!tokenNames.has(prop), `${rule.file}: ${rule.selector} must not redefine the token ${prop}`);
    local.add(prop);
  }
  const used = new Set();
  for (const rule of allRules) for (const { value } of rule.decls) for (const [, name] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    assert.match(name, /^--gx-/, `${rule.file}: ${rule.selector} uses ${name}, an old-app token`);
    used.add(name);
    if (local.has(name) || name in shared) continue;
    assert.ok(name in dark, `${name} is not defined in the dark theme`);
    assert.ok(name in light, `${name} is not defined in the light theme`);
  }
  for (const name of ['--gx-canvas', '--gx-text-1', '--gx-accent', '--gx-focus', '--gx-font-body', '--gx-font-num']) assert.ok(used.has(name), `${name} is used`);
});

// WCAG 2.x relative luminance and contrast ratio.
const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const v = hex.replace('#', ''); return 0.2126 * channel(parseInt(v.slice(0, 2), 16)) + 0.7152 * channel(parseInt(v.slice(2, 4), 16)) + 0.0722 * channel(parseInt(v.slice(4, 6), 16)); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('contrast: text and icons at least 4.5:1, control edges and focus at least 3:1, in both themes', () => {
  const surfaces = ['canvas', 'surface-1', 'surface-2', 'surface-3', 'accent-tint', 'toast-bg', 'seg-on'];
  const inks = ['text-1', 'text-2', 'text-3', 'accent-ink', 'data', 'win', 'loss', 'pending', 'live'];
  const states = ['data', 'win', 'loss', 'pending', 'live'];
  for (const name of ['dark', 'light']) {
    const c = tokens.themes[name].color;
    const text = [], ui = [];
    for (const ink of inks) for (const surface of surfaces) text.push([ink, surface]);
    for (const state of states) text.push([state, `${state}-tint`], ['text-1', `${state}-tint`], ['text-2', `${state}-tint`], ['on-state', state]);
    text.push(['accent-ink', 'accent-tint'], ['accent-text', 'accent'], ['text-3', 'surface-2']);
    for (const surface of ['canvas', 'surface-1', 'surface-2', 'surface-3']) ui.push(['border-strong', surface], ['focus', surface]);
    const failures = [];
    for (const [fg, bg] of text) { const ratio = contrast(c[fg], c[bg]); if (ratio < 4.5) failures.push(`${name} text ${fg} on ${bg}: ${ratio.toFixed(2)}`); }
    for (const [fg, bg] of ui) { const ratio = contrast(c[fg], c[bg]); if (ratio < 3) failures.push(`${name} UI ${fg} on ${bg}: ${ratio.toFixed(2)}`); }
    // A lime fill must stand out from the surfaces: by itself in dark, by its accent-ink edge in light.
    const edge = tokens.themes[name].effect['lime-edge'].match(/#[0-9A-F]{6}/)?.[0];
    for (const surface of ['canvas', 'surface-1', 'surface-2']) {
      const ratio = contrast(edge || c.accent, c[surface]);
      if (ratio < 3) failures.push(`${name} lime ${edge ? 'edge' : 'fill'} on ${surface}: ${ratio.toFixed(2)}`);
    }
    if (edge && contrast(edge, c.accent) < 3) failures.push(`${name} lime edge on lime: ${contrast(edge, c.accent).toFixed(2)}`);
    if (!edge) assert.match(tokens.themes[name].effect['lime-edge'], /transparent/);
    for (const [fill, hex] of Object.entries(tokens.av)) if (fill !== 'ink' && contrast(tokens.av.ink, hex) < 4.5) failures.push(`avatar initials on ${fill}`);
    assert.deepEqual(failures, []);
  }
  // The tightest pairs the design system recorded (design-final section 4) still hold.
  assert.equal(contrast(tokens.themes.dark.color['text-3'], tokens.themes.dark.color['accent-tint']).toFixed(2), '4.80');
  assert.equal(contrast(tokens.themes.light.color.win, tokens.themes.light.color['surface-3']).toFixed(2), '4.87');
});

test('gx- prefix: every class, custom property and keyframe is gx-, and every selector stays inside .gx', () => {
  for (const rule of allRules) for (const selector of rule.selectors) {
    for (const [, name] of selector.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) assert.match(name, /^gx(-|$)/, `${rule.file}: class .${name} in "${selector}"`);
    assert.match(selector, /\.gx\b/, `${rule.file}: "${selector}" is not scoped to the .gx root or a gx- class`);
  }
  for (const [name, { file }] of allKeyframes) assert.match(name, /^gx-/, `${file}: @keyframes ${name}`);
  for (const rule of allRules) for (const { prop } of rule.decls) if (prop.startsWith('--')) assert.match(prop, /^--gx-/, `${rule.file}: ${prop}`);
  assert.ok(allRules.length > 150, 'the shared component classes are present');
});

const fontSizes = decl => {
  if (decl.prop === 'font-size') return [decl.value];
  if (decl.prop !== 'font') return [];
  if (decl.value === 'inherit') return [];
  const size = decl.value.match(/(?:^|\s)([\d.]+[a-z%]*)\//)?.[1] || decl.value.match(/(?:^|\s)([\d.]+(?:px|rem|em|%))(?:\s|$)/)?.[1];
  assert.ok(size, `font shorthand without a size: ${decl.value}`);
  return [size];
};

test('no font under 12px, and 12px only for uppercase pills, labels and counters', () => {
  // 12px text that is not uppercase: tab counters (digits) and 24px avatar initials.
  const twelveOk = new Set(['.gx-counter', '.gx-av--24']);
  let checked = 0;
  for (const rule of styleRules) for (const decl of rule.decls) for (const size of fontSizes(decl)) {
    checked += 1;
    if (size === 'inherit') continue;
    assert.match(size, /^\d+(\.\d+)?px$/, `${rule.file}: ${rule.selector} sets font size ${size}; use px`);
    const px = Number.parseFloat(size);
    assert.ok(px >= 12, `${rule.file}: ${rule.selector} sets ${size}`);
    if (px < 13) assert.ok(rule.decls.some(d => d.prop === 'text-transform' && d.value === 'uppercase') || twelveOk.has(rule.selector), `${rule.file}: ${rule.selector} uses ${size} for text that is not uppercase`);
  }
  assert.ok(checked > 40);
});

test('fonts: every weight used is one the Google Fonts link loads, and Big Shoulders never sets numbers', () => {
  for (const rule of styleRules) {
    const fontDecl = rule.decls.find(d => d.prop === 'font' && d.value !== 'inherit');
    const familyDecl = [...rule.decls].reverse().find(d => d.prop === 'font' || d.prop === 'font-family');
    const familyKey = familyDecl?.value.match(/var\(--gx-font-(\w+)\)/)?.[1] || 'body';
    if (familyDecl && familyDecl.value !== 'inherit') assert.match(familyDecl.value, /var\(--gx-font-(display|num|body)\)/, `${rule.file}: ${rule.selector} names a font outside the tokens`);
    const weights = rule.decls.filter(d => d.prop === 'font-weight').map(d => Number(d.value));
    if (fontDecl) weights.push(Number(fontDecl.value.split(/\s+/)[0]));
    for (const weight of weights) assert.ok(tokens.webfonts.weights[familyName(familyKey)].includes(weight), `${rule.file}: ${rule.selector} uses ${familyName(familyKey)} ${weight}, which is not loaded`);
    if (/\.gx-n-|\.gx-rank|\.gx-mkt-(line|price)|\.gx-chip\b|\.gx-counter/.test(rule.selector)) assert.notEqual(familyKey, 'display', `${rule.selector} sets numbers in Big Shoulders`);
  }
});

test('tabular numbers: every Barlow Condensed rule sets tabular-nums after its font shorthand', () => {
  let numRules = 0;
  for (const rule of styleRules) {
    const usesNum = rule.decls.some(d => (d.prop === 'font' || d.prop === 'font-family') && d.value.includes('var(--gx-font-num)'));
    if (!usesNum) continue;
    numRules += 1;
    const lastFont = rule.decls.map(d => d.prop).lastIndexOf('font');
    const tabular = rule.decls.findLastIndex(d => d.prop === 'font-variant-numeric' && d.value === 'tabular-nums');
    assert.ok(tabular >= 0, `${rule.file}: ${rule.selector} uses Barlow Condensed without tabular-nums`);
    assert.ok(tabular > lastFont, `${rule.file}: ${rule.selector} sets tabular-nums before a font shorthand, which resets it`);
  }
  assert.ok(numRules >= 10);
  // The utility class comes after every type class, so it wins over their font shorthands.
  const components = allRules.filter(rule => rule.file === `${stylesDir}/components.css`);
  const tnum = components.findIndex(rule => rule.selector === '.gx-tnum');
  assert.ok(tnum > 0 && components.slice(tnum + 1).every(rule => !/^\.gx-(t|n)-/.test(rule.selector)));
});

test('type classes equal the JSON type scale', () => {
  for (const [key, style] of Object.entries(tokens.type)) {
    const selector = key.startsWith('n-') ? `.gx-${key}` : `.gx-t-${key}`;
    const rule = allRules.find(r => r.file === `${stylesDir}/components.css` && r.selector === selector);
    assert.ok(rule, `${selector} exists`);
    const get = prop => rule.decls.find(d => d.prop === prop)?.value;
    assert.equal(get('font'), `${style.weight} ${style.size}/${style.lineHeight} var(--gx-font-${style.family})`, selector);
    assert.equal(get('text-transform'), style.transform, `${selector} case`);
    assert.equal(get('letter-spacing'), style.tracking, `${selector} tracking`);
    if (style.tabular) assert.equal(get('font-variant-numeric'), 'tabular-nums', `${selector} tabular`);
  }
});

test('colors come from tokens: no hex, rgb or named colors outside tokens.css', () => {
  const colorProps = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule|filter)$/;
  const literal = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|lime|navy|cyan|aqua|silver)\b/i;
  for (const rule of styleRules) for (const decl of rule.decls) if (colorProps.test(decl.prop)) assert.doesNotMatch(decl.value.replace(/var\(--[\w-]+\)/g, 'var()'), literal, `${rule.file}: ${rule.selector} ${decl.prop}: ${decl.value}`);
});

test('motion: keyframes animate only transform and opacity, and reduced motion stops everything', () => {
  for (const [name, { frames }] of allKeyframes) for (const frame of frames) for (const { prop } of frame.decls) assert.ok(['transform', 'opacity'].includes(prop), `@keyframes ${name} animates ${prop}`);
  for (const rule of allRules) for (const decl of rule.decls) {
    if (decl.prop === 'transition' && decl.value !== 'none') for (const part of splitTopLevel(decl.value, ',')) assert.match(part, /^(transform|opacity)\s/, `${rule.file}: ${rule.selector} transitions ${part}`);
    if (decl.prop === 'animation' && decl.value !== 'none') {
      const name = decl.value.split(/\s+/).find(token => /^[a-z]/i.test(token) && !/^(ease|linear|infinite|alternate|forwards|backwards|both|step|var)/.test(token));
      assert.ok(allKeyframes.has(name), `${rule.file}: ${rule.selector} runs @keyframes ${name}, which is not defined`);
    }
    // !important belongs only to the reduced-motion blocks.
    if (decl.important) assert.ok(rule.context.some(c => c.includes('prefers-reduced-motion: reduce')) || rule.selector.includes('[data-motion="reduce"]'), `${rule.file}: ${rule.selector} uses !important`);
  }
  const stops = rule => ['animation', 'transition'].every(prop => rule.decls.some(d => d.prop === prop && d.value === 'none' && d.important));
  const media = allRules.filter(rule => rule.file === `${stylesDir}/base.css` && rule.context.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(media.some(rule => rule.selectors.includes('.gx *') && rule.selectors.includes('.gx *::before') && rule.selectors.includes('.gx *::after') && stops(rule)), 'the device setting stops all motion inside .gx');
  const setting = allRules.filter(rule => rule.file === `${stylesDir}/base.css` && rule.context.length === 0 && rule.selector.includes('[data-motion="reduce"]'));
  assert.ok(setting.some(rule => rule.selectors.includes('.gx[data-motion="reduce"] *') && stops(rule)), 'the app setting stops all motion inside .gx');
  assert.ok(allRules.some(rule => rule.decls.some(d => d.prop === 'animation' && d.value.startsWith('gx-live-pulse'))), 'the LIVE dot is the one loop');
});

test('the old app\'s element rules are cancelled inside .gx without beating the gx- classes', () => {
  const base = allRules.filter(rule => rule.file === `${stylesDir}/base.css`);
  const has = (selector, prop, value) => base.some(rule => rule.selectors.includes(selector) && rule.decls.some(d => d.prop === prop && (value === undefined || d.value === value)));
  // styles.css: button:disabled{opacity:.4}, button:hover:not(:disabled){filter}, button:active:not(:disabled){transform}, a{color}, h2{font-size}, td{font-size:12px}, main{padding}.
  assert.ok(has('.gx :where(button):disabled', 'opacity', '1'));
  assert.ok(has('.gx :where(button):hover:not(:disabled)', 'filter', 'none'));
  assert.ok(has('.gx :where(button):active:not(:disabled)', 'transform', 'none'));
  assert.ok(has('.gx :where(a)', 'color', 'var(--gx-data)'));
  assert.ok(has('.gx :where(h1, h2, h3, h4, h5, h6)', 'font', 'inherit'));
  assert.ok(has('.gx :where(th, td)', 'font', 'inherit'));
  assert.ok(has('.gx :where(main)', 'padding', '0'));
  assert.ok(has('.gx :focus-visible', 'outline', '2px solid var(--gx-focus)'));
  // Element selectors in base.css sit inside :where(), so a base rule is never more specific than
  // .gx plus pseudo-classes and a gx- class loaded later still wins.
  const withoutWhere = selector => {
    let out = '';
    for (let i = 0; i < selector.length; i += 1) {
      if (!selector.startsWith(':where(', i)) { out += selector[i]; continue; }
      let depth = 0;
      for (i += ':where'.length; i < selector.length; i += 1) {
        if (selector[i] === '(') depth += 1;
        if (selector[i] === ')' && --depth === 0) break;
      }
    }
    return out;
  };
  for (const rule of base) for (const selector of rule.selectors) {
    const bare = withoutWhere(selector).replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '').replace(/\.[\w-]+/g, '');
    assert.deepEqual(bare.match(/(^|[\s>+~])[a-z][\w-]*/gi) || [], [], `${selector} adds a type selector outside :where()`);
  }
});
