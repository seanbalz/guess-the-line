// Vite remembers failed stylesheet preloads. Repair the styles added by our literal view import before retrying it.
const styles = () => typeof document === 'undefined' ? [] : [...document.querySelectorAll('link[rel="stylesheet"]')];

function reloadStyle(href) {
  const old = styles().find(link => link.href === href);
  return new Promise((resolve, reject) => {
    const link = old?.cloneNode(false) ?? document.createElement('link');
    link.rel = 'stylesheet'; link.href = href; link.crossOrigin = old?.crossOrigin ?? '';
    const meta = document.querySelector('meta[property="csp-nonce"]');
    const nonce = old?.nonce || meta?.nonce || meta?.getAttribute('nonce');
    if (nonce) link.nonce = nonce;
    link.onload = () => { link.onload = link.onerror = null; resolve(); };
    link.onerror = () => { link.onload = link.onerror = null; link.remove(); reject(new Error('View stylesheet could not be loaded.')); };
    if (old) old.replaceWith(link); else document.head.append(link);
  });
}

/** Share code-only loads across openings; a rejected load is retried only by the next explicit opening/retry. */
export function retryViewImport(importer) {
  const failedStyles = new Set();
  let pending = null;
  return () => {
    if (pending) return pending;
    pending = (async () => {
      if (failedStyles.size) {
        const hrefs = [...failedStyles];
        const repairs = await Promise.allSettled(hrefs.map(reloadStyle));
        repairs.forEach((result, i) => { if (result.status === 'fulfilled') failedStyles.delete(hrefs[i]); });
        const failure = repairs.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
      }
      const before = new Set(styles());
      const loaded = importer();
      // Vite appends its own preload links synchronously, before returning the module promise.
      const added = styles().filter(link => !before.has(link));
      // Capture before Vite rejects and its promise cleanup runs between event listeners.
      // A failed stylesheet can still have a CSSStyleSheet object in Chrome.
      const failed = event => failedStyles.add(event.currentTarget.href);
      for (const link of added) link.addEventListener('error', failed, true);
      try { return await loaded; }
      finally { for (const link of added) link.removeEventListener('error', failed, true); }
    })().catch(error => { pending = null; throw error; });
    return pending;
  };
}
