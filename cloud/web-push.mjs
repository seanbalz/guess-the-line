// D-28 Web Push sender with WebCrypto only (Deno Edge and Node 22), no extra
// dependency: VAPID (RFC 8292) and aes128gcm message encryption (RFC 8291/8188).
// Keys are read by the caller from Edge Function secrets at run time and are
// never logged, returned or stored by this module.

const enc = new TextEncoder();
export const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com$/];
const B64U = /^[A-Za-z0-9_-]*$/;

export function b64uEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(text) {
  const clean = String(text).replace(/=+$/, '');
  if (!B64U.test(clean) || clean.length % 4 === 1) throw new Error('Invalid base64url value.');
  const binary = atob(clean.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

/** A browser push endpoint is https on a known push service host, with no credentials, port or fragment. */
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length < 24 || value.length > 1024) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.href === value
    && PUSH_HOSTS.some(pattern => pattern.test(url.hostname));
}
/** p256dh is an uncompressed P-256 point (65 bytes, leading 0x04); auth is 16 bytes. Both unpadded base64url. */
export const validP256dh = value => typeof value === 'string' && /^B[A-Za-z0-9_-]{86}$/.test(value);
export const validAuth = value => typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);

/** Imports the VAPID key pair from the base64url strings `npx web-push generate-vapid-keys` prints. */
export async function importVapid({ publicKey, privateKey, subject }) {
  if (typeof subject !== 'string' || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) throw new Error('VAPID subject must be a mailto: or https: URL.');
  const pub = b64uDecode(publicKey || ''), d = b64uDecode(privateKey || '');
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw new Error('VAPID keys are not P-256 keys.');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33)), d: b64uEncode(d), ext: false };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { key, publicKey: b64uEncode(pub), subject };
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin, valid for 12 hours. */
export async function vapidAuthorization(endpoint, vapid, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64uEncode(signature)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/**
 * RFC 8291 aes128gcm body for one subscription: salt(16) | rs(4) | idlen(1) | sender
 * public key(65) | AES-128-GCM(plaintext | 0x02). `ephemeral` and `salt` are for tests only.
 */
export async function encryptPayload(plaintext, { p256dh, auth }, { ephemeral, salt = crypto.getRandomValues(new Uint8Array(16)) } = {}) {
  const uaPublic = b64uDecode(p256dh), authSecret = b64uDecode(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('Invalid subscription keys.');
  const pair = ephemeral || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  if (data.length > 3000) throw new Error('Push payload is too large.');
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(data, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65;
  return concat(header, asPublic, cipher);
}

/**
 * Sends one push. Returns `ok`, `gone` (404/410: the subscription is dead and must be
 * removed) or `failed` (anything else, including a timeout); never throws for a send.
 */
export async function sendWebPush({ subscription, payload, vapid, ttl, fetchImpl = fetch, now = Date.now() }) {
  try {
    if (!validPushEndpoint(subscription?.endpoint)) return { outcome: 'gone', status: 0 };
    const body = await encryptPayload(JSON.stringify(payload), subscription);
    const response = await fetchImpl(subscription.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), body,
      headers: { Authorization: await vapidAuthorization(subscription.endpoint, vapid, now), 'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream', TTL: String(Math.max(60, Math.min(Math.floor(ttl), 4 * 3600))), Urgency: 'high' } });
    if (response.status === 404 || response.status === 410) return { outcome: 'gone', status: response.status };
    return { outcome: response.ok ? 'ok' : 'failed', status: response.status };
  } catch {
    return { outcome: 'failed', status: 0 };
  }
}
