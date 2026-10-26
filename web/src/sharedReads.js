// Shared by both apps (React-free; AuthGate forgets it on every account change). Account-scoped reads that several
// screens start at once (the ticket summary on two Home tiles, preferences on Home and Play) share one request, and its
// answer for FRESH_MS after it succeeds. A refresh or retry passes reuse: false and always reads again. Every key starts
// with the account id. A failed read is never kept. The shared request is cancelled only when every caller waiting on
// it has cancelled.
export const FRESH_MS = 15_000;
const entries = new Map();

const aborted = () => Object.assign(new Error('The read was cancelled.'), { name: 'AbortError' });

export function sharedRead(key, read, signal, { reuse = true, now = Date.now } = {}) {
  let entry = entries.get(key);
  if (!(reuse && entry && (entry.inflight || now() - entry.at < FRESH_MS))) {
    const controller = new AbortController();
    const created = { controller, users: 0, inflight: true, at: 0 };
    created.promise = Promise.resolve().then(() => read(controller.signal)).then(
      data => { created.inflight = false; created.at = now(); return data; },
      error => { created.inflight = false; if (entries.get(key) === created) entries.delete(key); throw error; },
    );
    entries.set(key, entry = created);
  }
  if (!entry.inflight) return entry.promise;
  const current = entry;
  current.users += 1;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { done = true; current.users -= 1; signal?.removeEventListener('abort', cancel); };
    function cancel() {
      if (done) return;
      finish();
      if (current.users === 0 && current.inflight) {
        current.controller.abort();
        if (entries.get(key) === current) entries.delete(key);
      }
      reject(aborted());
    }
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    current.promise.then(data => { if (!done) { finish(); resolve(data); } }, error => { if (!done) { finish(); reject(error); } });
  });
}

/** Forgets kept answers whose key starts with `prefix` (all of them by default); reads on their way still finish. */
export function forgetSharedReads(prefix = '') {
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
}
