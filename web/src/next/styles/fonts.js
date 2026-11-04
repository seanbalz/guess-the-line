// D-38 webfonts for the new app: Figtree, Big Shoulders Display and Barlow Condensed from Google
// Fonts (SIL Open Font License), display=swap. No font file is distributed. web/index.html links
// this same stylesheet (as print, applied at start by main.jsx) and nothing else (Board item 73), so
// addNextFontLinks() finds it and adds no second link (it still adds both to a page without
// them). Both content security policies already allow fonts.googleapis.com
// (style-src) and fonts.gstatic.com (font-src).
// The URL equals design/tokens-next.json webfonts.stylesheet (tests/webfonts.test.mjs).
export const NEXT_FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Big+Shoulders+Display:wght@700;800&family=Figtree:wght@400;500;600;700;800&display=swap';
export const NEXT_FONT_ORIGIN = 'https://fonts.gstatic.com';

function hasLink(head, rel, href) {
  return Array.from(head.querySelectorAll('link')).some(link => link.getAttribute('rel') === rel && link.getAttribute('href') === href);
}

// Adds the preconnect and stylesheet links to <head> once; a second call (or the old app's own
// preconnect to the same origin) adds nothing. Returns how many links were added.
export function addNextFontLinks(doc = globalThis.document) {
  const head = doc?.head;
  if (!head) return 0;
  let added = 0;
  if (!hasLink(head, 'preconnect', NEXT_FONT_ORIGIN)) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'preconnect');
    link.setAttribute('href', NEXT_FONT_ORIGIN);
    link.setAttribute('crossorigin', '');
    head.appendChild(link);
    added += 1;
  }
  if (!hasLink(head, 'stylesheet', NEXT_FONT_STYLESHEET)) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', NEXT_FONT_STYLESHEET);
    head.appendChild(link);
    added += 1;
  }
  return added;
}
