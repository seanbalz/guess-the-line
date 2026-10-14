import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// D-44: the logo is the Yardline G alone, in green, on a transparent background. These are the files a browser, a
// home screen and a notification show (web/public), and the old app's mark (web/src/Brand.jsx, brand.css); the new
// app's FieldMark is checked in tests/next-ui.test.jsx. The one exception is where the system draws the icon on a card
// of its own: Android's maskable icon and the notification icon are the G on a navy square.
const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'web/public');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const brand = fs.readFileSync(path.join(root, 'web/src/Brand.jsx'), 'utf8');
const paths = [...brand.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
const viewBox = brand.match(/<svg viewBox="([^"]+)"/)[1];
const lime = tokens.colors.primary;
const deepGreen = tokens.themes.light.primaryForeground;
const navy = tokens.colors.canvas;

// WCAG 2.x relative luminance and contrast ratio.
const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const v = hex.replace('#', ''); return 0.2126 * channel(parseInt(v.slice(0, 2), 16)) + 0.7152 * channel(parseInt(v.slice(2, 4), 16)) + 0.0722 * channel(parseInt(v.slice(4, 6), 16)); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Reads an 8-bit, non-interlaced PNG: its header and an RGBA pixel reader (color type 6, or 2 with alpha 255). */
function readPng(file) {
  const buf = fs.readFileSync(file);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is a PNG`);
  let header = null, offset = 8;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset), type = buf.toString('latin1', offset + 4, offset + 8), data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const bpp = { 2: 3, 6: 4 }[header.colorType];
  if (!bpp || header.depth !== 8 || header.interlace !== 0) return { ...header, pixel: null };
  const stride = header.width * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    assert.ok(filter <= 4, `${file}: filter ${filter} on row ${y}`);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
  }
  return { ...header, pixel: (x, y) => { const at = (y * header.width + x) * bpp, v = [...px.subarray(at, at + bpp)]; return bpp === 4 ? v : [...v, 255]; } };
}

/**
 * Where a point of the G (in the paths' own coordinates) lands in a PNG of `size` drawn from `name`: the svg's nested
 * <svg x y width height viewBox="22 20 81 53"> on its 64 x 64 board, scaled to fit and centered (preserveAspectRatio).
 */
function placer(name) {
  const svg = fs.readFileSync(path.join(pub, name), 'utf8');
  const [x, y, width, height] = svg.match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number), scale = Math.min(width / vw, height / vh);
  const left = x + (width - vw * scale) / 2, top = y + (height - vh * scale) / 2;
  return (size, [px, py]) => [Math.floor((left + (px - vx) * scale) * size / 64), Math.floor((top + (py - vy) * scale) * size / 64)];
}
// Three points of the paths' box that the G does not cover: its open mouth, the space left of it between the yard
// lines, and its counter. Anything drawn behind the G (a tile, faint or not) covers them.
const holes = [[74, 39], [26, 45], [53, 52]];

test('the PNG icons (home screen 180, manifest 192 and 512, notification badge 192) are the lime G on a real alpha channel', () => {
  const at = placer('app-icon.svg');
  for (const size of [180, 192, 512]) {
    const png = readPng(path.join(pub, `app-icon-${size}.png`));
    assert.deepEqual([png.width, png.height, png.depth, png.colorType, png.interlace], [size, size, 8, 6, 0], `app-icon-${size}.png is ${size} x ${size} RGBA`);
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) assert.equal(png.pixel(x, y)[3], 0, `app-icon-${size}.png corner ${x},${y} is transparent`);
    const band = Math.floor(size * 0.1);
    let opaque = 0, partial = 0, left = size, right = -1, top = size, bottom = -1;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = png.pixel(x, y);
      if (a === 0) continue;
      assert.ok(x >= band && x < size - band && y >= band && y < size - band, `app-icon-${size}.png: ${x},${y} is inside the margin`);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      // Every visible pixel is lime, faint or not (straight alpha; at a low alpha the stored color is rounded).
      assert.ok([r, g, b].every((v, i) => Math.abs(v - rgb(lime)[i]) * a / 255 <= 2), `app-icon-${size}.png: ${x},${y} is rgb(${r}, ${g}, ${b}) at alpha ${a}, not the lime ${lime}`);
      if (a === 255) opaque += 1; else partial += 1;
    }
    assert.ok([...Array(size).keys()].some(y => png.pixel(size >> 1, y)[3] === 255), `app-icon-${size}.png: the G crosses the middle column`);
    assert.ok(opaque > size * size * 0.1, `app-icon-${size}.png: the G is drawn`);
    // Only the G's anti-aliased edge is partly transparent: a few pixels per row, not a faint area.
    assert.ok(partial < size * 5, `app-icon-${size}.png: ${partial} partly transparent pixels`);
    for (const hole of holes) assert.equal(png.pixel(...at(size, hole))[3], 0, `app-icon-${size}.png: nothing behind the G at ${hole}`);
    assert.ok(Math.abs(left - (size - 1 - right)) <= 1 && Math.abs(top - (size - 1 - bottom)) <= 1, `app-icon-${size}.png: the G is centered`);
  }
  // The transparent icons are the "any" icons; the maskable ones are checked below. The theme and background colors
  // stay the app's navy.
  const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons.filter(icon => icon.purpose === 'any'), [192, 512].map(size => ({ src: `/app-icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })));
  assert.equal(manifest.background_color, navy);
  // iOS shows a transparent home-screen icon on black.
  assert.ok(contrast(lime, '#000000') >= 3);
});

test('Android and notifications get the G on a navy square: maskable icons inside the safe zone, and the notification icon', () => {
  // Android draws a non-maskable icon inside a white circle, where the lime G is 1.32:1; a maskable icon fills the
  // launcher's shape instead. The G stays inside the 80% safe zone, the circle every launcher shape keeps.
  const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons.filter(icon => icon.purpose !== 'any'), [192, 512].map(size => ({ src: `/app-icon-maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' })));
  const svg = fs.readFileSync(path.join(pub, 'app-icon-maskable.svg'), 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"><title>Guess The Line<\/title><rect width="64" height="64" fill="([^"]+)"\/><svg /, 'a full-bleed square behind the G');
  assert.equal(svg.match(/<rect [^>]*fill="([^"]+)"/)[1], navy, 'in the manifest\'s navy');
  assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]), paths, 'the G\'s two paths, unchanged');
  assert.match(svg, new RegExp(`<svg [^>]*viewBox="${viewBox}" color="${lime}"`), 'the lime G, framed as in Brand.jsx');
  const at = placer('app-icon-maskable.svg'), [nr, ng, nb] = rgb(navy), [lr, lg, lb] = rgb(lime);
  for (const size of [192, 512]) {
    const png = readPng(path.join(pub, `app-icon-maskable-${size}.png`));
    assert.deepEqual([png.width, png.height, png.depth, png.interlace], [size, size, 8, 0], `app-icon-maskable-${size}.png is ${size} x ${size}`);
    assert.ok(png.pixel, `app-icon-maskable-${size}.png is RGB or RGBA`);
    let lit = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = png.pixel(x, y);
      assert.equal(a, 255, `app-icon-maskable-${size}.png: ${x},${y} is opaque`);
      // Navy, lime, or the anti-aliased blend of the two at the G's edge.
      const t = (g - ng) / (lg - ng);
      assert.ok(t >= -0.01 && t <= 1.01 && Math.abs(r - (nr + t * (lr - nr))) <= 3 && Math.abs(b - (nb + t * (lb - nb))) <= 3, `app-icon-maskable-${size}.png: ${x},${y} is rgb(${r}, ${g}, ${b})`);
      if (g === ng) continue;
      assert.ok(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size * 0.4, `app-icon-maskable-${size}.png: ${x},${y} is inside the safe zone`);
      if (t > 0.99) lit += 1;
    }
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) assert.deepEqual(png.pixel(x, y), [nr, ng, nb, 255], `app-icon-maskable-${size}.png corner ${x},${y} is navy`);
    assert.ok(lit > size * size * 0.1, `app-icon-maskable-${size}.png: the G is drawn`);
    for (const hole of holes) assert.deepEqual(png.pixel(...at(size, hole)), [nr, ng, nb, 255], `app-icon-maskable-${size}.png: only navy behind the G at ${hole}`);
  }
  // The notification icon is that square, so the G sits on navy on a light or a dark card; the badge stays the
  // transparent G, which Android uses as a mask.
  const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
  assert.match(sw, /\n {4}icon: '\/app-icon-maskable-192\.png',\n {4}badge: '\/app-icon-192\.png',\n/);
  assert.ok(contrast(lime, navy) >= 3 && contrast(navy, '#FFFFFF') >= 3, 'the G on its square, and the square on a white card');
});

test('favicon.svg and app-icon.svg draw only the two G paths, centered, with no tile; the favicon is deep green in light and lime in dark', () => {
  assert.equal(paths.length, 2);
  for (const name of ['favicon.svg', 'app-icon.svg']) {
    const svg = fs.readFileSync(path.join(pub, name), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"[ >]/, `${name}: 64 x 64`);
    assert.doesNotMatch(svg, /<(rect|circle|ellipse|polygon|image)\b/, `${name}: nothing behind the G`);
    // Nothing else can draw a background either: no CSS background, style attribute or foreignObject. The favicon's one
    // <style> (checked below) only sets the dark-tab color.
    const style = name === 'favicon.svg' ? `<style>@media (prefers-color-scheme:dark){:root{color:${tokens.themes.dark.primaryForeground}}}</style>` : '';
    const bare = svg.replace(style, '');
    assert.deepEqual([...bare.matchAll(/<([A-Za-z][\w:-]*)/g)].map(m => m[1]), ['svg', 'title', 'svg', 'path', 'path'], `${name}: elements`);
    assert.deepEqual([...new Set([...bare.matchAll(/\s([\w:-]+)=/g)].map(m => m[1]))].sort(), ['color', 'd', 'fill', 'height', 'stroke', 'stroke-width', 'viewBox', 'width', 'x', 'xmlns', 'y'], `${name}: attributes`);
    assert.doesNotMatch(bare, /background|foreignObject|style/i, `${name}: no background`);
    assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]), paths, `${name}: the G's two paths, unchanged`);
    assert.deepEqual([...svg.matchAll(/(fill|stroke)="([^"]+)"/g)].map(m => m[2]), ['currentColor', 'none', 'currentColor'], `${name}: the G is drawn in currentColor`);
    const inner = svg.match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" viewBox="([^"]+)"/);
    assert.ok(inner, `${name}: the G sits in a nested svg`);
    const [x, y, width, height] = inner.slice(1, 5).map(Number);
    assert.equal(inner[5], viewBox, `${name}: framed by the G's own bounds, as in Brand.jsx`);
    assert.ok(x > 0 && Math.abs(2 * x + width - 64) < 1e-9 && Math.abs(2 * y + height - 64) < 1e-9, `${name}: centered with a margin`);
  }
  const favicon = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
  assert.match(favicon, new RegExp(`^<svg [^>]*color="${deepGreen}"`), 'the favicon is deep green by default (a light tab)');
  assert.ok(favicon.includes(`<style>@media (prefers-color-scheme:dark){:root{color:${tokens.themes.dark.primaryForeground}}}</style>`), 'and lime in a dark tab');
  assert.ok(contrast(deepGreen, '#FFFFFF') >= 3 && contrast(tokens.themes.dark.primaryForeground, tokens.colors.canvas) >= 3, 'each favicon green reaches 3:1 on its tab');
  assert.match(fs.readFileSync(path.join(pub, 'app-icon.svg'), 'utf8'), new RegExp(`<svg [^>]*color="${lime}"`), 'app-icon.svg is the lime source of the PNGs');
});

test('the old app\'s mark (Brand.jsx) is the G alone in --primaryForeground, framed by its own bounds, with no tile', () => {
  // The bounds of the two paths: the yard lines run from x 22 to 103, the G from y 20 to 73.
  assert.equal(viewBox, '22 20 81 53');
  const css = fs.readFileSync(path.join(root, 'web/src/brand.css'), 'utf8');
  const icon = css.match(/\.gtl-field-icon\{([^}]*)\}/)[1].split(';');
  assert.deepEqual(icon.filter(decl => /^(background|box-shadow|border|outline)/.test(decl)), [], '.gtl-field-icon draws no tile, edge or shadow');
  assert.ok(icon.includes('color:var(--primaryForeground,var(--primary))'), 'the G takes the theme green');
  assert.ok(icon.includes('width:64px') && icon.includes('height:64px'), 'the box keeps its size');
  assert.deepEqual([tokens.identity.productDisplay.background, tokens.identity.productDisplay.markColor], ['transparent', 'primaryForeground']);
  // The Brand Lab's applied app-icon study (option 01) frames the G the same way, so it shows the shipped scale.
  const lab = fs.readFileSync(path.join(root, 'web/src/BrandLab.jsx'), 'utf8');
  assert.equal(lab.match(/<div className=\{`app-icon-study icon-study-\$\{index\}`\}><Mark index=\{index\} viewBox=\{index===0\?'([^']+)'/)?.[1], viewBox);
  assert.match(fs.readFileSync(path.join(root, 'web/src/styles.css'), 'utf8'), /\.icon-study-0\{background:none;box-shadow:none;color:var\(--primaryForeground,var\(--primary\)\)\}/);
  for (const theme of ['dark', 'light']) {
    const colors = { ...tokens.colors, ...tokens.themes[theme] };
    for (const surface of ['canvas', 'surface', 'card']) assert.ok(contrast(colors.primaryForeground, colors[surface]) >= 3, `${theme}: the G on ${surface}`);
  }
});

test('no stylesheet draws a tile, edge or shadow on the mark, through any selector or on its svg', () => {
  // The old app's .gtl-brand / .gtl-field-icon / .gtl-yardline-mark and the new app's .gx-mono (with its sizes and
  // svg) and .gx-av-sys, in every rule that names them: descendant rules, the svg and media blocks included.
  const mark = /\.(gtl-brand|gtl-field-icon|gtl-yardline-mark|gx-mono|gx-av-sys)/;
  const files = fs.readdirSync(path.join(root, 'web/src'), { recursive: true }).filter(file => file.endsWith('.css'));
  assert.ok(files.length > 10);
  let rules = 0;
  for (const file of files) {
    const css = fs.readFileSync(path.join(root, 'web/src', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!mark.test(selector)) continue;
      rules += 1;
      for (const decl of body.split(';').map(d => d.trim()).filter(Boolean)) {
        const [property, ...rest] = decl.split(':'), value = rest.join(':').trim();
        const tile = /^(background|box-shadow|border|outline)/.test(property.trim()) ? !/^(none|transparent|0)$/.test(value) : /^filter$/.test(property.trim()) && /drop-shadow/.test(value);
        assert.ok(!tile, `${file}: ${selector.trim()} { ${decl} }`);
      }
    }
  }
  assert.ok(rules >= 10, `${rules} rules name the mark`);
});
