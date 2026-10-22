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
  // The brand guide's reason for the light lime edge quotes lime's range on the light surfaces (stage 6 review: it
  // left out surface-3); keep it equal to the tokens.
  const light = tokens.themes.light.color;
  const lime = ['canvas', 'surface-1', 'surface-2', 'surface-3'].map(surface => contrast(light.accent, light[surface]));
  const range = `${Math.min(...lime).toFixed(2)} to ${Math.max(...lime).toFixed(2)}:1`;
  assert.equal(range, '1.07 to 1.32:1');
  assert.ok(read('docs/BRAND_GUIDE.md').includes(`lime on the light surfaces is only ${range}`), `docs/BRAND_GUIDE.md says lime on the light surfaces is ${range}`);
});

// D-55: the glow card (hero and opened trend), its glass pills and the chart marks. Glass and track are translucent
// in dark, so each is composited over the card's base color before measuring. Contract: words on the card and on a
// glass pill stay at least 4.5:1, and the chart line, the hit-rate bars and the break-even tick stay at least 3:1.
test('D-55 glow card: text, glass, chart line, bars and the break-even tick keep contrast in both themes', () => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const over = (top, base) => {
    const alpha = top.length === 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1;
    const [a, b] = [rgb(top), rgb(base)];
    return `#${a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  };
  for (const name of ['dark', 'light']) {
    const c = tokens.themes[name].color, base = c['hero-base'], glass = over(c.glass, base), track = over(c.track, base);
    const failures = [];
    for (const [fg, bg, min, label] of [
      [c['text-1'], base, 4.5, 'text-1 on the card'], [c['hero-text-2'], base, 4.5, 'hero-text-2 on the card'],
      [c['text-1'], glass, 4.5, 'text-1 on glass'], [c['hero-text-2'], glass, 4.5, 'hero-text-2 on glass'],
      [c['chart-line'], base, 3, 'chart line on the card'], [c['bar-1'], track, 3, 'bar start on its track'],
      [c['text-1'], track, 3, 'break-even tick on the track'],
    ]) { const ratio = contrast(fg, bg); if (ratio < min) failures.push(`${name} ${label}: ${ratio.toFixed(2)}`); }
    assert.deepEqual(failures, []);
    // Lime stays the primary action: as a chart color it is only the last, decorative stop of the glow.
    assert.ok(!Object.entries(c).some(([key, value]) => value === c.accent && !['accent', 'accent-ink', 'glow-3'].includes(key)), `${name}: lime only as accent, accent-ink or glow-3`);
  }
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
  // A rule that sets only a weight takes its family from the class it styles: `.gx-btn--ghost` from `.gx-btn`,
  // `.gx-tab--on .gx-tab-label` from `.gx-tab-label`. So a weight-only modifier on a Barlow class needs a Barlow weight.
  const familyOf = className => styleRules.filter(rule => rule.selectors.includes(className))
    .map(rule => [...rule.decls].reverse().find(d => (d.prop === 'font' || d.prop === 'font-family') && d.value !== 'inherit')?.value.match(/var\(--gx-font-(\w+)\)/)?.[1]).filter(Boolean);
  let weightOnly = 0;
  for (const rule of styleRules) {
    if (rule.decls.some(d => d.prop === 'font' || d.prop === 'font-family')) continue;
    for (const { value } of rule.decls.filter(d => d.prop === 'font-weight')) for (const selector of rule.selectors) {
      const last = selector.trim().split(/[\s>+~]+/).at(-1);
      const families = (last.match(/\.gx-[\w-]+/g) || []).flatMap(cls => [...new Set([cls, cls.replace(/--[\w-]+$/, '')])].flatMap(familyOf));
      weightOnly += 1;
      for (const key of families.length ? families : ['body']) assert.ok(tokens.webfonts.weights[familyName(key)].includes(Number(value)), `${rule.file}: ${selector} sets ${familyName(key)} to ${value}, which is not loaded`);
    }
  }
  assert.ok(weightOnly >= 5, 'the weight-only rules were found');
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

// Every CSS named color (CSS Color 4), so a literal like `teal` fails as surely as `white`.
const NAMED_COLORS = Object.freeze('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' '));

test('colors come from tokens: no hex, rgb or named colors outside tokens.css', () => {
  assert.equal(NAMED_COLORS.length, 148);
  const colorProps = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule|filter)$/;
  const literal = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![\\w-])(${NAMED_COLORS.join('|')})(?![\\w-])`, 'i');
  for (const rule of styleRules) for (const decl of rule.decls) if (colorProps.test(decl.prop)) assert.doesNotMatch(decl.value.replace(/var\(--[\w-]+\)/g, 'var()'), literal, `${rule.file}: ${rule.selector} ${decl.prop}: ${decl.value}`);
  // The pattern itself catches what the old short list missed.
  for (const value of ['teal', '1px solid tan', 'inset 0 0 0 1px rebeccapurple']) assert.match(value, literal, value);
  for (const value of ['var()', 'none', 'transparent', 'currentColor', 'inset 0 0 0 1px var()']) assert.doesNotMatch(value, literal, value);
});

test('motion: keyframes animate only transform and opacity, and reduced motion stops everything', () => {
  for (const [name, { frames }] of allKeyframes) for (const frame of frames) for (const { prop } of frame.decls) assert.ok(['transform', 'opacity'].includes(prop), `@keyframes ${name} animates ${prop}`);
  for (const rule of allRules) for (const decl of rule.decls) {
    if (decl.prop === 'transition' && decl.value !== 'none') for (const part of splitTopLevel(decl.value, ',')) assert.match(part, /^(transform|opacity)\s/, `${rule.file}: ${rule.selector} transitions ${part}`);
    // The longhands too: only transform and opacity move, and an animation name is a defined @keyframes.
    if (decl.prop === 'transition-property' && decl.value !== 'none') for (const part of splitTopLevel(decl.value, ',')) assert.ok(['transform', 'opacity'].includes(part), `${rule.file}: ${rule.selector} transitions ${part}`);
    if (decl.prop === 'animation-name' && decl.value !== 'none') for (const part of splitTopLevel(decl.value, ',')) assert.ok(allKeyframes.has(part), `${rule.file}: ${rule.selector} runs @keyframes ${part}, which is not defined`);
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

test('press, dialog and transforms: the claims the browser would otherwise have to check', () => {
  const components = allRules.filter(rule => rule.file === `${stylesDir}/components.css`);
  // The press scale (0.97) has the old-app reset's specificity only with :not(:disabled); without it the reset wins.
  const press = components.filter(rule => rule.decls.some(d => d.prop === 'transform' && d.value === 'scale(0.97)'));
  assert.equal(press.length, 1);
  assert.ok(press[0].selectors.length >= 6);
  for (const selector of press[0].selectors) assert.match(selector, /^\.gx-[\w-]+:active:not\(:disabled\)$/, selector);
  // A closed <dialog> stays hidden: only [open] gets a display.
  const dialog = components.filter(rule => rule.selectors.includes('.gx-dialog'));
  assert.ok(dialog.length > 0 && dialog.every(rule => rule.context.length > 0 || !rule.decls.some(d => d.prop === 'display')), '.gx-dialog sets no display of its own');
  assert.ok(components.some(rule => rule.selectors.includes('.gx-dialog[open]') && rule.decls.some(d => d.prop === 'display' && d.value === 'flex')));
  // A pressed button loses every `transform` (base.css), so nothing centers itself with one: use `translate`. A
  // pseudo-element (the switch knob) is never the pressed button, so its transform stays.
  for (const rule of styleRules) for (const selector of rule.selectors) for (const decl of rule.decls) {
    if (decl.prop === 'transform' && /translate/.test(decl.value) && !/::[\w-]+$/.test(selector)) assert.fail(`${rule.file}: ${selector} moves with transform: ${decl.value}; use the translate property, which the press reset leaves alone`);
  }
  assert.ok(styleRules.some(rule => rule.selectors.includes('.gx-strip-dot') && rule.decls.some(d => d.prop === 'translate' && d.value === '-50% 0')), 'a strip dot centers with translate');
  // A scrolling rail clips, so it pads at least the ring (2px wide + 2px gap) around a focused chip.
  const rail = components.find(rule => rule.selector === '.gx-chip-rail');
  assert.equal(rail.decls.find(d => d.prop === 'padding')?.value, '4px');
  // The layout utilities match the prototype contract (section 11).
  const gaps = components.map(rule => rule.selector.match(/^\.gx-gap-(\d+)$/)?.[1]).filter(Boolean).map(Number);
  assert.deepEqual(gaps, [2, 4, 6, 8, 12, 16, 24, 32]);
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
  assert.ok(has('.gx :focus-visible', 'outline-offset', '2px'), 'the ring keeps its 2px gap');
  // styles.css: small{font-size:12px}, strong{font-weight:600}, input,select{background,border}, table and footer layout.
  assert.ok(has('.gx :where(small)', 'font-size', 'inherit'));
  assert.ok(has('.gx :where(strong, b)', 'font-weight', '700'));
  assert.ok(has('.gx :where(input, select, textarea)', 'font', 'inherit'));
  for (const [prop, value] of [['background', 'none'], ['border', '0']]) assert.ok(has('.gx :where(input, select, textarea)', prop, value), `checkboxes, radios and ranges drop the old input ${prop}`);
  assert.ok(has('.gx :where(table)', 'border-collapse', 'collapse'));
  assert.ok(has('.gx :where(footer)', 'display', 'block'));
  assert.ok(has('.gx :where(footer) > :where(span)', 'display', 'revert'), 'footer > span is not the old flex row');
  assert.ok(has('.gx :where(footer) > :where(span):nth-child(2)', 'display', 'revert'), 'the second footer span is not hidden');
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
