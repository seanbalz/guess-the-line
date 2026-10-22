// Phone layout checks for the new app, run inside the page with `page.evaluate(layoutProblems)`. It lists what a player
// would see as broken formatting, ignoring what the layout intends:
// - text or an icon that leaves the control holding it, or leaves the screen (Sean's October 21 "Following" bubble);
// - text clipped by an ancestor that hides overflow;
// - a box wider than the screen outside a horizontal scroller (chip rails and wide tables scroll on purpose);
// - two touchable controls that overlap in the top layer (an open sheet or dialog makes the page behind it inert).
// Hidden content (display none, [hidden], a closed <details> body) and screen-reader-only text are skipped.

export function layoutProblems() {
  const out = [], vw = document.documentElement.clientWidth, root = document.querySelector('.gx') || document.body;
  const name = el => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
  const hidden = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return true;
      if (n.parentElement?.tagName === 'DETAILS' && !n.parentElement.open && n.tagName !== 'SUMMARY') return true;
    }
    return false;
  };
  const tiny = el => { const r = el.getBoundingClientRect(); return r.width <= 2 || r.height <= 2; };
  const ancestor = (el, test) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (test(n, getComputedStyle(n))) return n; return null; };
  for (const el of root.querySelectorAll('*')) {
    if ((el.closest('svg') && el.tagName.toLowerCase() !== 'svg') || hidden(el) || tiny(el)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const scroller = ancestor(el, (n, s) => /(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1);
    const clipper = scroller ? null : ancestor(el, (n, s) => /(hidden|clip)/.test(s.overflowX));
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const t of range.getClientRects()) {
        if (!t.width) continue;
        if (t.right > r.right + 1.5 || t.left < r.left - 1.5) out.push(`${name(el)}: text leaves its box`);
        if (!scroller && (t.right > vw + 1 || t.left < -1)) out.push(`${name(el)}: text leaves the screen`);
        if (clipper) { const c = clipper.getBoundingClientRect(); if (t.right > c.right + 1.5 || t.left < c.left - 1.5) out.push(`${name(el)}: text clipped`); }
      }
    }
    if (el.matches('button, a, label, summary, [role=button]')) {
      for (const child of el.querySelectorAll('svg, img')) {
        if (hidden(child) || tiny(child)) continue;
        const c = child.getBoundingClientRect();
        if (c.right > r.right + 1.5 || c.left < r.left - 1.5) { out.push(`${name(el)}: icon leaves its control`); break; }
      }
    }
    if (!scroller && r.right > vw + 1 && !/(auto|scroll)/.test(cs.overflowX)) out.push(`${name(el)}: wider than the screen`);
  }
  const layers = [...document.querySelectorAll('dialog[open], [role=dialog], .gx-sheet')].filter(el => !hidden(el));
  const controls = [...(layers.at(-1) || root).querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, summary')]
    .filter(el => !hidden(el) && !tiny(el) && !el.matches('.gx-scrim'));
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.contains(b) || b.contains(a) || /gx-tab|gx-dock|gx-topbar/.test(`${a.className} ${b.className}`)) continue;
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) out.push(`${name(a)} overlaps ${name(b)}`);
  }
  return [...new Set(out)];
}
