// Markup checks for the new app's components (redesign build plan, stage 8; CONTRACT section 3), for any vitest render
// of web/src/next. `markupProblems(html)` reads renderToStaticMarkup output and lists what breaks the kit's rules:
// - classes: every class is gx- (the .gx root itself, and Lucide's own lucide/lucide-* classes on an svg, excepted);
// - every <svg> is hidden (aria-hidden="true") or an image with a name (role="img" plus aria-label);
// - emoji only inside an element marked data-emoji-ok (the feed's reaction glyphs); typographic marks are fine;
// - accessible names: buttons, links, images, named roles (dialog, alertdialog, img, group, radiogroup, timer, meter)
//   and native dialogs; aria-labelledby and aria-describedby point at ids in the same markup;
// - every <img> has an alt (empty for a decorative one).

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Emoji and other pictographs; the allowed typographic marks (✓ ▲ ▼ ● ◆ · › ‹ − –) do not match. */
export const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

export function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** A small reader for well-formed markup: `{ tag, attrs, children, parent }` nodes and `{ text, parent }` leaves. */
export function parseMarkup(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let node = root;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'=<>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (node.tag !== tag) throw new Error(`Unbalanced </${tag}> inside <${node.tag}>`);
      node = node.parent;
    } else if (m[2]) {
      const attrs = {};
      for (const a of m[3].matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const el = { tag: m[2].toLowerCase(), attrs, children: [], parent: node };
      node.children.push(el);
      if (!m[4] && !VOID.has(el.tag)) node = el;
    } else if (m[5]) {
      node.children.push({ text: decode(m[5]), parent: node });
    }
  }
  if (node !== root) throw new Error(`Unclosed <${node.tag}>`);
  return root;
}

export function* walk(node) {
  for (const child of node.children ?? []) {
    yield child;
    if (child.children) yield* walk(child);
  }
}

const ancestors = function* (node) { for (let n = node.parent; n; n = n.parent) yield n; };
const hidden = node => [node, ...ancestors(node)].some(n => n.attrs?.['aria-hidden'] === 'true');

/** The text a screen reader would read inside `node` (aria-hidden subtrees skipped; aria-label wins). */
export function nameFrom(node) {
  if (node.text !== undefined) return node.text;
  if (node.attrs['aria-hidden'] === 'true') return '';
  if (node.attrs['aria-label']) return node.attrs['aria-label'];
  if (node.tag === 'img') return node.attrs.alt ?? '';
  return node.children.map(nameFrom).join('');
}

const short = node => `<${node.tag}${node.attrs.class ? ` class="${node.attrs.class}"` : ''}>`;

export function markupProblems(html) {
  const root = parseMarkup(html);
  const ids = new Set();
  for (const n of walk(root)) if (n.attrs?.id) ids.add(n.attrs.id);
  const problems = [];
  const named = (n, what) => {
    const label = (n.attrs['aria-label'] ?? '').trim();
    const by = (n.attrs['aria-labelledby'] ?? '').trim();
    if (by) for (const id of by.split(/\s+/)) if (!ids.has(id)) problems.push(`${short(n)}: aria-labelledby points at a missing id ${id}`);
    if (!label && !by) problems.push(`${short(n)}: ${what} has no accessible name`);
  };
  for (const n of walk(root)) {
    if (n.text !== undefined) {
      if (EMOJI.test(n.text) && ![n.parent, ...ancestors(n.parent)].some(a => a.attrs && 'data-emoji-ok' in a.attrs)) problems.push(`emoji outside data-emoji-ok: "${n.text.trim()}"`);
      continue;
    }
    const { tag, attrs } = n;
    for (const cls of (attrs.class ?? '').split(/\s+/).filter(Boolean)) {
      const ok = cls === 'gx' || cls.startsWith('gx-') || (tag === 'svg' && /^lucide(-[a-z0-9-]+)?$/.test(cls));
      if (!ok) problems.push(`${short(n)}: class "${cls}" is not gx-`);
    }
    if (attrs['aria-describedby']) for (const id of attrs['aria-describedby'].split(/\s+/)) if (!ids.has(id)) problems.push(`${short(n)}: aria-describedby points at a missing id ${id}`);
    if (tag === 'svg' && attrs['aria-hidden'] !== 'true') {
      if (attrs.role !== 'img') problems.push(`${short(n)}: an svg must be aria-hidden="true" or role="img" with a name`);
      else named(n, 'svg');
    }
    if (tag === 'img' && !('alt' in attrs)) problems.push(`${short(n)}: img without alt`);
    if (hidden(n)) continue;
    if (tag === 'button' || (tag === 'a' && 'href' in attrs)) {
      if (!nameFrom(n).trim() && !(attrs['aria-labelledby'] ?? '').trim()) problems.push(`${short(n)}: ${tag} has no accessible name`);
    }
    if (tag === 'dialog' || ['dialog', 'alertdialog', 'img', 'group', 'radiogroup', 'timer', 'meter'].includes(attrs.role)) named(n, attrs.role ?? tag);
  }
  return problems;
}
