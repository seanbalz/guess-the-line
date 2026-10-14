import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// D-44: the logo is the Yardline G alone, in green, on a transparent background. These are the files a browser, a
// home screen and a notification show (web/public), and the old app's mark (web/src/Brand.jsx, brand.css); the new
// app's FieldMark is checked in tests/next-ui.test.jsx.
const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'web/public');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const brand = fs.readFileSync(path.join(root, 'web/src/Brand.jsx'), 'utf8');
const paths = [...brand.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
const viewBox = brand.match(/<svg viewBox="([^"]+)"/)[1];
const lime = tokens.colors.primary;
const deepGreen = tokens.themes.light.primaryForeground;

// WCAG 2.x relative luminance and contrast ratio.
const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const v = hex.replace('#', ''); return 0.2126 * channel(parseInt(v.slice(0, 2), 16)) + 0.7152 * channel(parseInt(v.slice(2, 4), 16)) + 0.0722 * channel(parseInt(v.slice(4, 6), 16)); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Reads an 8-bit, non-interlaced PNG: its header and a pixel reader (RGBA when the color type is 6). */
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
  if (header.colorType !== 6 || header.depth !== 8 || header.interlace !== 0) return { ...header, pixel: null };
  const stride = header.width * 4, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    assert.ok(filter <= 4, `${file}: filter ${filter} on row ${y}`);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
  }
  return { ...header, pixel: (x, y) => [...px.subarray((y * header.width + x) * 4, (y * header.width + x) * 4 + 4)] };
}

test('the PNG icons (home screen 180, manifest and notifications 192, manifest 512) are the lime G on a real alpha channel', () => {
  for (const size of [180, 192, 512]) {
    const png = readPng(path.join(pub, `app-icon-${size}.png`));
    assert.deepEqual([png.width, png.height, png.depth, png.colorType, png.interlace], [size, size, 8, 6, 0], `app-icon-${size}.png is ${size} x ${size} RGBA`);
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) assert.equal(png.pixel(x, y)[3], 0, `app-icon-${size}.png corner ${x},${y} is transparent`);
    const band = Math.floor(size * 0.1);
    let opaque = 0, left = size, right = -1, top = size, bottom = -1;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = png.pixel(x, y);
      if (a === 0) continue;
      assert.ok(x >= band && x < size - band && y >= band && y < size - band, `app-icon-${size}.png: ${x},${y} is inside the margin`);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      if (a < 255) continue;
      opaque += 1;
      assert.ok([r, g, b].every((v, i) => Math.abs(v - rgb(lime)[i]) <= 2), `app-icon-${size}.png: ${x},${y} is rgb(${r}, ${g}, ${b}), not the lime ${lime}`);
    }
    assert.ok([...Array(size).keys()].some(y => png.pixel(size >> 1, y)[3] === 255), `app-icon-${size}.png: the G crosses the middle column`);
    assert.ok(opaque > size * size * 0.1, `app-icon-${size}.png: the G is drawn`);
    assert.ok(Math.abs(left - (size - 1 - right)) <= 1 && Math.abs(top - (size - 1 - bottom)) <= 1, `app-icon-${size}.png: the G is centered`);
  }
  // A transparent icon is not "maskable"; the theme and background colors stay the app's navy.
  const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons, [192, 512].map(size => ({ src: `/app-icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })));
  assert.equal(manifest.background_color, tokens.colors.canvas);
  // iOS shows a transparent home-screen icon on black.
  assert.ok(contrast(lime, '#000000') >= 3);
});

test('favicon.svg and app-icon.svg draw only the two G paths, centered, with no tile; the favicon is deep green in light and lime in dark', () => {
  assert.equal(paths.length, 2);
  for (const name of ['favicon.svg', 'app-icon.svg']) {
    const svg = fs.readFileSync(path.join(pub, name), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"[ >]/, `${name}: 64 x 64`);
    assert.doesNotMatch(svg, /<(rect|circle|ellipse|polygon|image)\b/, `${name}: nothing behind the G`);
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
  for (const theme of ['dark', 'light']) {
    const colors = { ...tokens.colors, ...tokens.themes[theme] };
    for (const surface of ['canvas', 'surface', 'card']) assert.ok(contrast(colors.primaryForeground, colors[surface]) >= 3, `${theme}: the G on ${surface}`);
  }
});
