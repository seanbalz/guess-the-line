// Refreshable data release, separate from app deployments. Never evaluate remote code.
import { createAssetReader } from './fantasy.mjs';
import { researchDataBase, validateResearchIndex, validatePublicResearchSnapshot, MAX_RESEARCH_FILE_BYTES, MAX_RESEARCH_DECODED_BYTES } from '../shared/research-data.mjs';
import { RESEARCH_PERIODS } from '../shared/trends-research-candidates.mjs';

const TTL = 300_000, BACKOFF = 60_000;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
async function decode(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_RESEARCH_DECODED_BYTES) { await reader.cancel(); throw new Error('Research data too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(out));
}

export function createResearchDataLoader({ fetchImpl = fetch, clock = Date.now, fallback = async () => null } = {}) {
  const read = createAssetReader({ fetchImpl }), indexes = new Map(), files = new Map(), pending = new Map();
  const once = (key, task) => {
    if (!pending.has(key)) pending.set(key, Promise.resolve().then(task).finally(() => pending.delete(key)));
    return pending.get(key);
  };
  return async (period = 'recent30', season = new Date(clock()).getUTCFullYear()) => {
    if (!RESEARCH_PERIODS.includes(period) || !Number.isSafeInteger(season) || season < 2002 || season > 2100) throw new Error('Invalid research request.');
    let hit = indexes.get(season);
    if (!hit || clock() >= hit.retryAt) {
      hit = await once(`index:${season}`, async () => {
        try {
          const bytes = await read(`${researchDataBase(season)}/index.json`, 20_000, 10_000);
          if (!bytes) throw new Error('Unpublished research.');
          const value = validateResearchIndex(JSON.parse(new TextDecoder().decode(bytes)), season, clock());
          // Never accept a regressed pointer after a successful newer read.
          if (hit?.value && Date.parse(value.generatedAt) < Date.parse(hit.value.generatedAt)) throw new Error('Regressed research.');
          return { value, retryAt: clock() + TTL };
        } catch { return { value: hit?.value ?? null, retryAt: clock() + BACKOFF }; }
      });
      indexes.set(season, hit);
      while (indexes.size > 2) indexes.delete(indexes.keys().next().value);
    }
    const entry = hit.value?.files.find(f => f.period === period);
    if (entry) {
      try {
        if (files.has(entry.sha256)) {
          const value = files.get(entry.sha256); files.delete(entry.sha256); files.set(entry.sha256, value); return value;
        }
        return await once(entry.sha256, async () => {
          const bytes = await read(`${researchDataBase(season)}/${entry.file}`, MAX_RESEARCH_FILE_BYTES, 15_000);
          if (!bytes || bytes.byteLength !== entry.bytes || await digest(bytes) !== entry.sha256) throw new Error('Research checksum mismatch.');
          const value = validatePublicResearchSnapshot(await decode(bytes), { season, period, now: clock() });
          if (value.generatedAt !== hit.value.generatedAt) throw new Error('Research timestamp mismatch.');
          files.set(entry.sha256, value);
          while (files.size > 2) files.delete(files.keys().next().value);
          return value;
        });
      } catch { /* Fall back to bundled public history; freshness still decides eligibility. */ }
    }
    return fallback(period, season);
  };
}
